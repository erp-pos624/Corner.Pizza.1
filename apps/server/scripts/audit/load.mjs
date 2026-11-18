#!/usr/bin/env node
/**
 * Phase 5: closed-loop HTTP load against the isolated audit API.
 *
 *   node scripts/audit/load.mjs --profile=read --users=100,250,500 --seconds=30
 *   node scripts/audit/load.mjs --profile=write --users=25 --seconds=30
 *
 * The server must already be running on AUDIT_API (default :4110) against the
 * audit database. Writes are subject to the product's own per-IP limits
 * (orders 90/min, quote 120/min); 429s are reported as throttled, not errors.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const BASE = process.env.AUDIT_API ?? 'http://127.0.0.1:4110';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT = resolve(ROOT, 'docs/audit/results');
const PSQL = resolve(ROOT, '.dev/pgsql/bin/psql.exe');
const PASSWORD = process.env.AUDIT_PASSWORD;
if (!PASSWORD) {
  console.error('AUDIT_PASSWORD is required for the isolated audit environment.');
  process.exit(1);
}
const REQUEST_TIMEOUT_MS = 20_000;
const run = promisify(execFile);

function arg(name, fallback) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const PROFILE = arg('profile', 'read');
const USERS = arg('users', '100,250,500')
  .split(',')
  .map((value) => Number(value))
  .filter((value) => Number.isFinite(value) && value > 0);
const SECONDS = Number(arg('seconds', 30));
const INCLUDE_KITCHEN = arg('kitchen', '0') === '1';
const INCLUDE_REPORTS = arg('reports', '1') === '1';
const OUT_SUFFIX = arg('out', '');

async function api(method, path, { token, body, headers } = {}) {
  const started = process.hrtime.bigint();
  let status = 0;
  let error = null;
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = response.status;
    await response.arrayBuffer();
  } catch (caught) {
    error = caught?.name === 'TimeoutError' ? 'timeout' : String(caught?.message ?? caught);
  }
  return { status, error, ms: Number(process.hrtime.bigint() - started) / 1e6 };
}

function summarize(list) {
  if (list.length === 0) return { count: 0 };
  const sorted = [...list].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return {
    count: sorted.length,
    avgMs: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(1)),
    p50Ms: Number(at(50).toFixed(1)),
    p95Ms: Number(at(95).toFixed(1)),
    p99Ms: Number(at(99).toFixed(1)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(1)),
  };
}

async function login(username) {
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (response.status !== 200) throw new Error(`login ${username} failed with ${response.status}`);
  return response.json();
}

async function fixtures() {
  const auth = await login('admin');
  const token = auth.accessToken;
  const branches = await (
    await fetch(`${BASE}/api/public/branches`)
  ).json();
  const branchId = branches.find((row) => row.id === 'branch-main')?.id ?? branches[0]?.id;
  if (!branchId) throw new Error('no public branch');
  const catalog = await (
    await fetch(`${BASE}/api/v1/menu/catalog`, { headers: { authorization: `Bearer ${token}` } })
  ).json();
  const item = catalog.items.find((row) => row.isAvailable && Number(row.basePrice) > 0 && row.sizes?.length > 0);
  if (!item) throw new Error('no priced catalog item with sizes');
  return { token, branchId, itemId: item.id, sizeId: item.sizes[0].id };
}

const DB_SQL = `SELECT
  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS conns,
  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active') AS active,
  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock') AS lock_wait,
  (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()) AS deadlocks,
  (SELECT xact_rollback FROM pg_stat_database WHERE datname = current_database()) AS rollbacks,
  (SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()) AS commits`;

async function dbSample() {
  if (!existsSync(PSQL) || !process.env.DATABASE_URL) return null;
  const connection = process.env.DATABASE_URL.split('?')[0];
  try {
    const { stdout } = await run(PSQL, [connection, '-At', '-F', '|', '-c', DB_SQL]);
    const [conns, active, lockWait, deadlocks, rollbacks, commits] = stdout.trim().split('|').map(Number);
    return { conns, active, lockWait, deadlocks, rollbacks, commits };
  } catch {
    return null;
  }
}

async function serverPid() {
  try {
    const { stdout } = await run('netstat', ['-ano']);
    const line = stdout
      .split(/\r?\n/u)
      .find((row) => row.includes(':4110') && row.toUpperCase().includes('LISTENING'));
    return line ? Number(line.trim().split(/\s+/u).at(-1)) : null;
  } catch {
    return null;
  }
}

async function procSample(pid) {
  if (!pid) return null;
  try {
    const { stdout } = await run('powershell', [
      '-NoProfile',
      '-Command',
      `$p = Get-Process -Id ${pid}; "$($p.WorkingSet64) $($p.TotalProcessorTime.TotalSeconds)"`,
    ]);
    const [rss, cpu] = stdout.trim().split(/\s+/u).map(Number);
    return { rssBytes: rss, cpuSeconds: cpu };
  } catch {
    return null;
  }
}

function endpointPlan(ctx, profile) {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const ordersList = {
    name: 'orders:list',
    weight: 0.45,
    call: () =>
      api('GET', '/api/v1/orders?page=1&pageSize=20', {
        token: ctx.token,
        headers: { 'x-branch-id': ctx.branchId },
      }),
  };
  const kitchen = {
    name: 'kitchen:board',
    weight: 0.2,
    call: () => api('GET', '/api/v1/kitchen/orders', { token: ctx.token }),
  };
  const dashboard = {
    name: 'reports:dashboard',
    weight: 0.05,
    call: () =>
      api('GET', '/api/v1/reports/dashboard?days=30', {
        token: ctx.token,
        headers: { 'x-branch-id': ctx.branchId },
      }),
  };
  const sales = {
    name: 'reports:sales',
    weight: 0.05,
    call: () =>
      api('GET', `/api/v1/reports/sales?from=${from}&to=${today}`, {
        token: ctx.token,
        headers: { 'x-branch-id': ctx.branchId },
      }),
  };
  const menu = {
    name: 'public:menu',
    weight: 0.45,
    call: () => api('GET', `/api/public/menu?branchId=${ctx.branchId}`),
  };
  const reads = [
    ordersList,
    ...(INCLUDE_KITCHEN ? [kitchen] : []),
    ...(INCLUDE_REPORTS ? [dashboard, sales] : []),
    menu,
  ];
  const quote = {
    name: 'public:quote',
    weight: 1,
    call: async () => {
      const result = await api('POST', '/api/public/orders/quote', {
        body: {
          branchId: ctx.branchId,
          fulfillment: 'TAKEAWAY',
          items: [{ menuItemId: ctx.itemId, sizeId: ctx.sizeId, quantity: 1, toppingIds: [] }],
        },
      });
      return result;
    },
  };
  const create = {
    name: 'orders:create',
    weight: 1,
    call: async () => {
      const quoted = await fetch(`${BASE}/api/public/orders/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId: ctx.branchId,
          fulfillment: 'TAKEAWAY',
          items: [{ menuItemId: ctx.itemId, sizeId: ctx.sizeId, quantity: 1, toppingIds: [] }],
        }),
      });
      if (!quoted.ok) return { status: quoted.status, error: null, ms: 0 };
      const total = (await quoted.json()).total;
      return api('POST', '/api/v1/orders', {
        token: ctx.token,
        headers: { 'x-terminal-id': 'LOAD-T1', 'x-branch-id': ctx.branchId },
        body: {
          type: 'TAKEAWAY',
          items: [{ menuItemId: ctx.itemId, sizeId: ctx.sizeId, quantity: 1, toppingIds: [] }],
          payments: [{ method: 'CASH', amount: total }],
        },
      });
    },
  };
  if (profile === 'read') return reads;
  if (profile === 'reports') return [{ ...dashboard, weight: 0.6 }, { ...sales, weight: 0.4 }];
  if (profile === 'write') return [{ ...quote, weight: 0.2 }, { ...create, weight: 0.8 }];
  return [
    ...reads.map((entry) => ({ ...entry, weight: entry.weight * 0.85 })),
    { ...quote, weight: 0.1 },
    { ...create, weight: 0.05 },
  ];
}

function pick(plan) {
  const total = plan.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = Math.random() * total;
  let cumulative = 0;
  for (const entry of plan) {
    cumulative += entry.weight;
    if (roll <= cumulative) return entry;
  }
  return plan[plan.length - 1];
}

async function stage(ctx, users, seconds, pid) {
  const plan = endpointPlan(ctx, PROFILE);
  const samples = {
    db: [],
    rss: [],
    cpu: [],
  };
  let dbBase = null;
  let procBase = null;
  const timer = setInterval(async () => {
    const db = await dbSample();
    if (db) samples.db.push(db);
    const proc = await procSample(pid);
    if (proc) {
      samples.rss.push(proc.rssBytes);
      samples.cpu.push(proc.cpuSeconds);
    }
  }, 3000);

  dbBase = await dbSample();
  procBase = await procSample(pid);
  const deadline = Date.now() + seconds * 1000;
  const latencies = new Map();
  const statuses = new Map();
  const errors = new Map();
  let requests = 0;
  let timeouts = 0;
  const wallStart = Date.now();

  await Promise.all(
    Array.from({ length: users }, async () => {
      while (Date.now() < deadline) {
        const target = pick(plan);
        const result = await target.call();
        requests += 1;
        const bucket = latencies.get(target.name) ?? [];
        bucket.push(result.ms);
        latencies.set(target.name, bucket);
        const key = `${target.name}:${result.status}`;
        statuses.set(key, (statuses.get(key) ?? 0) + 1);
        if (result.error) {
          const errorKey = `${target.name}:${result.error}`;
          errors.set(errorKey, (errors.get(errorKey) ?? 0) + 1);
          if (result.error === 'timeout') timeouts += 1;
        }
      }
    }),
  );
  clearInterval(timer);

  const wall = (Date.now() - wallStart) / 1000;
  const dbEnd = await dbSample();
  const procEnd = await procSample(pid);
  const all = [...latencies.values()].flat();
  const db = dbBase && dbEnd ? {
    connectionsStart: dbBase.conns,
    connectionsEnd: dbEnd.conns,
    activePeak: Math.max(dbBase.active, ...samples.db.map((row) => row.active)),
    lockWaitPeak: Math.max(dbBase.lockWait, ...samples.db.map((row) => row.lockWait)),
    deadlocks: dbEnd.deadlocks - dbBase.deadlocks,
    rollbacks: dbEnd.rollbacks - dbBase.rollbacks,
    commits: dbEnd.commits - dbBase.commits,
  } : null;
  const cpuSeconds = procBase && procEnd ? procEnd.cpuSeconds - procBase.cpuSeconds : null;
  const process = procBase && procEnd ? {
    rssStartMb: Math.round(procBase.rssBytes / 1024 / 1024),
    rssEndMb: Math.round(procEnd.rssBytes / 1024 / 1024),
    rssPeakMb: Math.round(Math.max(procBase.rssBytes, ...samples.rss) / 1024 / 1024),
    cpuPct: cpuSeconds === null ? null : Number(((cpuSeconds / wall) * 100).toFixed(1)),
  } : null;

  const throttled = [...statuses.entries()]
    .filter(([key]) => key.endsWith(':429'))
    .reduce((sum, [, count]) => sum + count, 0);
  const serverErrors = [...statuses.entries()]
    .filter(([key]) => {
      const code = Number(key.split(':').at(-1));
      return code === 0 || code >= 500;
    })
    .reduce((sum, [, count]) => sum + count, 0);

  return {
    users,
    seconds: Number(wall.toFixed(1)),
    requests,
    rps: Number((requests / wall).toFixed(1)),
    latency: summarize(all),
    byEndpoint: Object.fromEntries(
      [...latencies.entries()].map(([name, values]) => [name, summarize(values)]),
    ),
    statuses: Object.fromEntries([...statuses.entries()].sort()),
    errors: Object.fromEntries([...errors.entries()]),
    throttled,
    serverErrors,
    timeouts,
    db,
    process,
  };
}

async function main() {
  const health = await api('GET', '/healthz');
  if (health.status !== 200) throw new Error(`audit API not healthy (${health.status})`);
  const ctx = await fixtures();
  const pid = await serverPid();
  console.log(`Load profile=${PROFILE} users=${USERS.join(',')} seconds=${SECONDS} api=${BASE} pid=${pid ?? 'unknown'}`);

  const stages = [];
  for (const users of USERS) {
    const result = await stage(ctx, users, SECONDS, pid);
    stages.push(result);
    console.log(
      `${String(users).padStart(3)} users | ${result.rps} rps | p50 ${result.latency.p50Ms}ms p95 ${result.latency.p95Ms}ms p99 ${result.latency.p99Ms}ms | 429 ${result.throttled} | 5xx/timeout ${result.serverErrors}/${result.timeouts} | db ${result.db?.activePeak ?? '-'} active, ${result.db?.deadlocks ?? '-'} deadlocks | rss ${result.process?.rssPeakMb ?? '-'}MB cpu ${result.process?.cpuPct ?? '-'}%`,
    );
  }

  mkdirSync(OUT, { recursive: true });
  const fileName = `load-${PROFILE}${OUT_SUFFIX ? `-${OUT_SUFFIX}` : ''}.json`;
  writeFileSync(
    resolve(OUT, fileName),
    JSON.stringify({ profile: PROFILE, api: BASE, seconds: SECONDS, stages }, null, 2),
  );
  console.log(`Report written to docs/audit/results/${fileName}`);
}

main().catch((error) => {
  console.error('LOAD RUN FAILED', error);
  process.exitCode = 1;
});
