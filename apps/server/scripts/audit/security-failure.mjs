#!/usr/bin/env node
/**
 * Phase 7/8 probes against the isolated audit API:
 * RBAC and branch isolation, lockout, injection attempts, CSRF guard,
 * per-IP login throttling, database-outage recovery, rollback on a rejected
 * order, and idempotent creation. Writes docs/audit/results/security-failure.json
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const run = promisify(execFile);
const BASE = process.env.AUDIT_API ?? 'http://127.0.0.1:4110';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PSQL = resolve(ROOT, '.dev/pgsql/bin/psql.exe');
const DB = process.env.DATABASE_URL.split('?')[0];
const OUT = resolve(ROOT, 'docs/audit/results');
const prisma = new PrismaClient();
const tag = randomUUID().slice(0, 8);
const results = [];
const PASSWORD = process.env.AUDIT_PASSWORD;
if (!PASSWORD) {
  console.error('AUDIT_PASSWORD is required for the isolated audit environment.');
  process.exit(1);
}

async function hashPassword(plain) {
  return hash(plain, {
    algorithm: 2, // Argon2id
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
}

function record(phase, name, status, detail) {
  results.push({ phase, name, status, detail });
  console.log(`${phase} ${name}: ${status}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, { token, body, headers, cookie } = {}) {
  const started = performance.now();
  let response;
  let text = '';
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    text = await response.text();
  } catch (error) {
    return { status: 0, text: String(error), ms: performance.now() - started };
  }
  return {
    status: response.status,
    text,
    contentType: response.headers.get('content-type'),
    ms: Number((performance.now() - started).toFixed(1)),
  };
}

async function login(username, password = PASSWORD) {
  return call('POST', '/api/v1/auth/login', { body: { username, password } });
}

async function readCounts() {
  return {
    orders: await prisma.order.count(),
    items: await prisma.orderItem.count(),
    movements: await prisma.inventoryMovement.count(),
    stocks: await prisma.ingredientStock.aggregate({ _sum: { currentStock: true } }),
  };
}

async function main() {
  const branchB = await prisma.branch.upsert({
    where: { code: 'audit-b' },
    update: {},
    create: { code: 'audit-b', name: 'Audit Branch B' },
  });
  const hash = await hashPassword(PASSWORD);
  const kitchen = await prisma.user.create({
    data: {
      username: `sec_kitchen_${tag}`,
      fullName: 'Audit Kitchen B',
      passwordHash: hash,
      role: 'KITCHEN_STAFF',
      branchId: branchB.id,
    },
  });
  const locked = await prisma.user.create({
    data: {
      username: `sec_lock_${tag}`,
      fullName: 'Audit Lockout',
      passwordHash: hash,
      role: 'CASHIER',
      branchId: branchB.id,
    },
  });
  await prisma.user.create({
    data: {
      username: `sec_cashier_${tag}`,
      fullName: 'Audit Cashier B',
      passwordHash: hash,
      role: 'CASHIER',
      branchId: branchB.id,
    },
  });

  const adminLogin = await login('admin', PASSWORD);
  if (adminLogin.status !== 200) throw new Error(`admin login failed: ${adminLogin.status}`);
  const adminToken = JSON.parse(adminLogin.text).accessToken;

  // --- RBAC ---------------------------------------------------------------
  const kitchenLogin = await login(kitchen.username);
  const kitchenToken = JSON.parse(kitchenLogin.text).accessToken;
  const kitchenBoard = await call('GET', '/api/v1/kitchen/orders', { token: kitchenToken });
  const adminBoard = await call('GET', '/api/v1/kitchen/orders', { token: adminToken });
  const adminCount = (JSON.parse(adminBoard.text).orders ?? []).length;
  const kitchenCount = (JSON.parse(kitchenBoard.text).orders ?? []).length;
  record(
    'security',
    'kitchen board is branch-scoped',
    kitchenBoard.status === 200 && kitchenCount === 0 && adminCount > 0 ? 'PASS' : 'FAIL',
    `branch-B staff saw ${kitchenCount}, admin saw ${adminCount}`,
  );

  const cashierLogin = await login(`sec_cashier_${tag}`);
  const cashierToken = JSON.parse(cashierLogin.text).accessToken;
  for (const [name, path] of [
    ['cashier blocked from kitchen board', '/api/v1/kitchen/orders'],
    ['cashier blocked from reports', '/api/v1/reports/dashboard?days=7'],
    ['cashier blocked from user admin', '/api/v1/users'],
  ]) {
    const probe = await call('GET', path, { token: cashierToken });
    record('security', name, probe.status === 403 ? 'PASS' : 'FAIL', `status ${probe.status}`);
  }

  // --- Auth hardening -----------------------------------------------------
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await login(locked.username, `WrongPass@${attempt}`);
  }
  const lockedLogin = await login(locked.username);
  const lockedRow = await prisma.user.findUnique({ where: { id: locked.id } });
  record(
    'security',
    'account lockout after repeated failures',
    lockedLogin.status === 401 && Boolean(lockedRow.lockedUntil) && lockedRow.lockedUntil > new Date()
      ? 'PASS'
      : 'FAIL',
    `status ${lockedLogin.status}, lockedUntil ${lockedRow.lockedUntil?.toISOString() ?? 'null'}`,
  );

  const sqliLogin = await login("' OR 1=1 --", 'anything');
  record(
    'security',
    'SQL injection in login is rejected',
    sqliLogin.status === 401 && !sqliLogin.text.includes('accessToken') ? 'PASS' : 'FAIL',
    `status ${sqliLogin.status}`,
  );
  const sqliSearch = await call(
    'GET',
    `/api/v1/orders?page=1&pageSize=5&search=${encodeURIComponent("' OR 1=1 --")}`,
    { token: adminToken },
  );
  record(
    'security',
    'injection in order filters stays a parameter',
    sqliSearch.status === 200 && sqliSearch.contentType?.includes('application/json') ? 'PASS' : 'FAIL',
    `status ${sqliSearch.status}`,
  );
  const sqliMenu = await call(
    'GET',
    `/api/public/menu?branchId=${encodeURIComponent("' OR 1=1 --")}`,
  );
  const injectedMenu = sqliMenu.status === 200 ? JSON.parse(sqliMenu.text) : null;
  const injectedItems = (injectedMenu?.categories ?? injectedMenu?.items ?? []).length;
  record(
    'security',
    'injection in public menu branch is rejected',
    sqliMenu.status >= 400 || injectedItems === 0 ? 'PASS' : 'FAIL',
    `status ${sqliMenu.status}, items ${injectedItems}`,
  );

  const xss = await call(
    'GET',
    `/api/public/menu?branchId=${encodeURIComponent('<script>alert(1)</script>')}`,
  );
  record(
    'security',
    'reflected markup is returned as JSON only',
    xss.contentType?.includes('application/json') ? 'PASS' : 'FAIL',
    `content-type ${xss.contentType}, status ${xss.status}`,
  );

  const csrfBlocked = await call('POST', '/api/v1/auth/web/refresh', {
    cookie: 'forno_rt=forged-token',
  });
  const csrfAllowed = await call('POST', '/api/v1/auth/web/refresh', {
    cookie: 'forno_rt=forged-token',
    headers: { 'x-forno-client': 'web' },
  });
  record(
    'security',
    'cookie refresh requires the web-client header',
    csrfBlocked.status === 403 && csrfAllowed.status === 401 ? 'PASS' : 'FAIL',
    `without header ${csrfBlocked.status}, with header ${csrfAllowed.status}`,
  );

  // Consumes the per-IP login budget, so it runs after all login checks.
  const throttleStatuses = {};
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const probe = await login(`no_such_user_${tag}_${attempt}`);
    throttleStatuses[probe.status] = (throttleStatuses[probe.status] ?? 0) + 1;
  }
  record(
    'security',
    'login attempts are rate limited per IP',
    Object.keys(throttleStatuses).includes('429') ? 'PASS' : 'FAIL',
    JSON.stringify(throttleStatuses),
  );

  // --- Failure / recovery -------------------------------------------------
  const before = await readCounts();

  await run(PSQL, [
    DB,
    '-c',
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
  ]);
  const duringOrders = await call('GET', '/api/v1/orders?page=1&pageSize=5', { token: adminToken });
  const duringReady = await call('GET', '/readyz');
  let afterReady = duringReady;
  let recoveredAfterMs = 0;
  const recoveryStarted = Date.now();
  while (afterReady.status !== 200 && Date.now() - recoveryStarted < 45_000) {
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 2000));
    afterReady = await call('GET', '/readyz');
    recoveredAfterMs = Date.now() - recoveryStarted;
  }
  const afterOrders = await call('GET', '/api/v1/orders?page=1&pageSize=5', { token: adminToken });
  const afterCounts = await readCounts();
  record(
    'failure',
    'database outage is contained and recovers',
    duringOrders.status >= 500 &&
      duringReady.status >= 500 &&
      afterReady.status === 200 &&
      afterOrders.status === 200 &&
      afterCounts.orders === before.orders
      ? 'PASS'
      : 'FAIL',
    `during ${duringOrders.status}/${duringReady.status}, recovery ${recoveredAfterMs}ms, after ${afterReady.status}/${afterOrders.status}, rows ${before.orders}->${afterCounts.orders}`,
  );

  const quote = await call('POST', '/api/public/orders/quote', {
    body: {
      branchId: 'branch-main',
      fulfillment: 'TAKEAWAY',
      items: [{ menuItemId: 'missing-item', quantity: 1, toppingIds: [] }],
    },
  });
  const rejected = await call('POST', '/api/v1/orders', {
    token: adminToken,
    headers: { 'x-terminal-id': 'AUDIT-T1', 'x-branch-id': 'branch-main' },
    body: {
      type: 'TAKEAWAY',
      items: [{ menuItemId: 'missing-item', quantity: 1, toppingIds: [] }],
      payments: [{ method: 'CASH', amount: '1.00' }],
    },
  });
  const afterReject = await readCounts();
  record(
    'failure',
    'rejected order leaves no partial rows',
    rejected.status >= 400 &&
      afterReject.orders === before.orders &&
      afterReject.items === before.items &&
      afterReject.movements === before.movements &&
      String(afterReject.stocks._sum.currentStock) === String(before.stocks._sum.currentStock)
      ? 'PASS'
      : 'FAIL',
    `quote ${quote.status}, create ${rejected.status}, orders ${before.orders}->${afterReject.orders}`,
  );

  const catalog = await call('GET', '/api/v1/menu/catalog', { token: adminToken });
  const item = JSON.parse(catalog.text).items.find(
    (row) => row.isAvailable && Number(row.basePrice) > 0 && row.sizes?.length > 0,
  );
  const quoteBody = {
    branchId: 'branch-main',
    fulfillment: 'TAKEAWAY',
    items: [{ menuItemId: item.id, sizeId: item.sizes[0].id, quantity: 1, toppingIds: [] }],
  };
  const freshQuote = await call('POST', '/api/public/orders/quote', { body: quoteBody });
  const total = JSON.parse(freshQuote.text).total;
  const idempotencyKey = `audit-idem-${tag}`;
  const createBody = {
    type: 'TAKEAWAY',
    idempotencyKey,
    items: quoteBody.items,
    payments: [{ method: 'CASH', amount: total }],
  };
  const first = await call('POST', '/api/v1/orders', {
    token: adminToken,
    headers: { 'x-terminal-id': 'AUDIT-T1', 'x-branch-id': 'branch-main' },
    body: createBody,
  });
  const second = await call('POST', '/api/v1/orders', {
    token: adminToken,
    headers: { 'x-terminal-id': 'AUDIT-T1', 'x-branch-id': 'branch-main' },
    body: createBody,
  });
  const firstId = first.status < 300 ? JSON.parse(first.text).id : null;
  const secondId = second.status < 300 ? JSON.parse(second.text).id : null;
  const replayCount = firstId
    ? await prisma.order.count({ where: { idempotencyKey } })
    : -1;
  record(
    'failure',
    'idempotent create returns one order',
    Boolean(firstId) &&
      firstId === secondId &&
      replayCount === 1 &&
      (await prisma.order.count()) === afterReject.orders + 1
      ? 'PASS'
      : 'FAIL',
    `first ${first.status}, replay ${second.status}, rows ${replayCount}`,
  );

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    resolve(OUT, 'security-failure.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log('Report written to docs/audit/results/security-failure.json');
}

main()
  .catch((error) => {
    console.error('PROBES FAILED', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
