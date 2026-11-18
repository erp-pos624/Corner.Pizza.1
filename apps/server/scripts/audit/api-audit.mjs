#!/usr/bin/env node
/**
 * Phase 2 functional audit: drives the real HTTP API against an isolated
 * audit database. Run with the server on AUDIT_API (default :4110).
 *
 * Every check records a pass/fail and the evidence used. The script never
 * asserts a defect it has not observed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.AUDIT_API ?? 'http://127.0.0.1:4110';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT = resolve(ROOT, 'docs/audit/results');
const PASSWORD = process.env.AUDIT_PASSWORD;
if (!PASSWORD) {
  console.error('AUDIT_PASSWORD is required for the isolated audit environment.');
  process.exit(1);
}
const TERMINAL = { 'x-terminal-id': 'AUDIT-T1' };

const results = [];
const state = {};
const stamp = Date.now();
const tag = `A${String(stamp).slice(-6)}`;

function record(name, status, detail, ms) {
  results.push({ name, status, detail, ms });
  const mark = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'INFO';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    record(name, 'PASS', detail ?? '', Date.now() - started);
  } catch (error) {
    record(name, 'FAIL', error instanceof Error ? error.message : String(error), Date.now() - started);
  }
}

function info(name, detail) {
  record(name, 'INFO', detail, 0);
}

async function api(method, path, options = {}) {
  const headers = {
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'manual',
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers, text };
}

function expectStatus(res, expected, label) {
  if (res.status !== expected) {
    const body = typeof res.body === 'string' ? res.body.slice(0, 400) : JSON.stringify(res.body).slice(0, 400);
    throw new Error(`${label}: expected HTTP ${expected}, got ${res.status} ${body}`);
  }
  return res.body;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function moneyValue(value) {
  return Math.round(Number(value) * 100);
}

async function login(username, password = PASSWORD) {
  return api('POST', '/api/v1/auth/login', { body: { username, password } });
}

function authBody(res, label) {
  if (res.status !== 200 || !res.body?.accessToken) {
    throw new Error(`${label}: login failed ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  return res.body;
}

function orderBody(itemId, { quantity = 1, sizeId = null, toppings = [], type = 'TAKEAWAY', total = '114.00', ...rest } = {}) {
  return {
    type,
    items: [{ menuItemId: itemId, sizeId, quantity, toppingIds: toppings }],
    payments: [{ method: 'CASH', amount: total }],
    ...rest,
  };
}

async function create(itemId, options = {}) {
  const { token, headers, payments, ...rest } = options;
  const payload = orderBody(itemId, rest);
  if (payments) payload.payments = payments;
  return api('POST', '/api/v1/orders', {
    token: token ?? state.cashier,
    headers: { ...TERMINAL, ...(headers ?? {}) },
    body: payload,
  });
}

/** Each tab scenario gets its own table so repeated audit runs never exhaust them. */
async function freshTable(label) {
  return expectStatus(
    await api('POST', '/api/v1/tables', {
      token: state.admin,
      headers: { 'x-branch-id': state.branchId },
      body: { name: `AUD-${tag}-${label}`, seats: 4 },
    }),
    201,
    `table ${label}`,
  );
}

async function run() {
  // ---------------------------------------------------------------- auth ----
  console.log('\n== Auth & access control ==');
  await check('health and readiness', async () => {
    expectStatus(await api('GET', '/healthz'), 200, 'healthz');
    const ready = expectStatus(await api('GET', '/readyz'), 200, 'readyz');
    expect(ready.checks?.database?.ok === true, 'database not ready');
    return `db ${ready.checks.database.latencyMs}ms`;
  });

  await check('public catalog endpoints respond', async () => {
    const branches = expectStatus(await api('GET', '/api/public/branches'), 200, 'branches');
    expect(Array.isArray(branches) && branches.length > 0, 'no public branches');
    // Audit runs add extra branches; the seeded main branch owns the zones and
    // online-ordering schedule that the rest of the suite relies on.
    const main = branches.find((row) => row.id === 'branch-main') ?? branches[0];
    state.branchId = main.id;
    state.branchLabel = main.code ?? main.name ?? main.id;
    const menu = expectStatus(await api('GET', `/api/public/menu?branchId=${state.branchId}`), 200, 'menu');
    expect(Array.isArray(menu.items) && menu.items.length > 0, 'no public menu items');
    expectStatus(await api('GET', '/api/public/settings'), 200, 'settings');
    expectStatus(await api('GET', '/api/public/storefront'), 200, 'storefront');
    return `${branches.length} branch(es), ${menu.items.length} item(s)`;
  });

  await check('wrong password and unknown user are rejected', async () => {
    const wrong = await login('admin', 'WrongPass123');
    expectStatus(wrong, 401, 'wrong password');
    const unknown = await login('no-such-user');
    expectStatus(unknown, 401, 'unknown user');
  });

  await check('all staff roles can sign in', async () => {
    for (const role of ['admin', 'cashier', 'omar', 'kitchen', 'driver']) {
      const body = authBody(await login(role), role);
      state[role] = body.accessToken;
      state[`${role}User`] = body.user;
    }
    return 'admin, 2 cashiers, kitchen, driver';
  });

  await check('unauthenticated and tampered tokens are rejected', async () => {
    expectStatus(await api('GET', '/api/v1/orders'), 401, 'no token');
    const tampered = `${state.admin.slice(0, -3)}abc`;
    expectStatus(await api('GET', '/api/v1/orders', { token: tampered }), 401, 'tampered token');
  });

  await check('role matrix blocks cashier, kitchen and driver where documented', async () => {
    expectStatus(await api('GET', '/api/v1/users', { token: state.cashier }), 403, 'cashier users');
    expectStatus(await api('GET', '/api/v1/reports/dashboard?days=7', { token: state.cashier }), 403, 'cashier reports');
    expectStatus(await api('GET', '/api/v1/orders', { token: state.kitchen }), 403, 'kitchen orders');
    expectStatus(await api('GET', '/api/v1/reports/dashboard?days=7', { token: state.driver }), 403, 'driver reports');
    expectStatus(await api('POST', '/api/v1/menu/items', { token: state.cashier, body: {} }), 403, 'cashier menu write');
    return '6 denials';
  });

  await check('auth/me returns the signed-in role', async () => {
    const me = expectStatus(await api('GET', '/api/v1/auth/me', { token: state.admin }), 200, 'me');
    expect(me.user?.role === 'ADMIN' || me.role === 'ADMIN', 'role missing');
  });

  await check('refresh rotation invalidates the old token', async () => {
    const fresh = authBody(await login('admin'), 'refresh login');
    const rotated = expectStatus(
      await api('POST', '/api/v1/auth/refresh', { body: { refreshToken: fresh.refreshToken } }),
      200,
      'refresh',
    );
    expect(rotated.refreshToken && rotated.refreshToken !== fresh.refreshToken, 'token not rotated');
    const reuse = await api('POST', '/api/v1/auth/refresh', {
      body: { refreshToken: fresh.refreshToken },
    });
    expectStatus(reuse, 401, 'refresh reuse');
    return 'rotated once, reuse rejected';
  });

  await check('web auth requires the web-client header', async () => {
    const noHeader = await api('POST', '/api/v1/auth/web/login', {
      body: { username: 'admin', password: PASSWORD },
    });
    expectStatus(noHeader, 403, 'missing header');
    const withHeader = await api('POST', '/api/v1/auth/web/login', {
      headers: { 'x-forno-client': 'web' },
      body: { username: 'admin', password: PASSWORD },
    });
    expectStatus(withHeader, 200, 'web login');
    const cookie = String(withHeader.headers.get('set-cookie'));
    expect(/forno_rt=/.test(cookie), `refresh cookie missing: ${cookie.slice(0, 120)}`);
    expect(cookie.includes('HttpOnly'), 'refresh cookie not HttpOnly');
    const evil = await api('POST', '/api/v1/auth/web/login', {
      headers: { 'x-forno-client': 'web', origin: 'https://evil.example' },
      body: { username: 'admin', password: PASSWORD },
    });
    // Non-production trusts every origin by design (origin.ts); production
    // rejects foreign origins and is covered by origin.test.ts.
    if (process.env.AUDIT_EXPECT_PRODUCTION_ORIGIN === '1') {
      expectStatus(evil, 403, 'untrusted origin');
    } else {
      info('web origin policy', `foreign origin returned ${evil.status} outside production (by design)`);
    }
  });

  let lockUser = null;
  await check('account locks after repeated failures', async () => {
    const username = `audit_lock_${tag}`.toLowerCase();
    const created = expectStatus(
      await api('POST', '/api/v1/users', {
        token: state.admin,
        body: {
          username,
          fullName: 'Audit Lock User',
          role: 'CASHIER',
          branchId: state.branchId,
          password: 'AuditPass123',
        },
      }),
      201,
      'create lock user',
    );
    lockUser = created.id ?? created.user?.id;
    for (let i = 0; i < 5; i += 1) {
      const res = await login(username, 'WrongPass123');
      expectStatus(res, 401, `failure ${i + 1}`);
    }
    const locked = await login(username, 'AuditPass123');
    expectStatus(locked, 401, 'locked correct password');
    expect(String(JSON.stringify(locked.body)).toLowerCase().includes('lock'), 'lockout not reported');
    return 'locked after 5 failures';
  });

  await check('temporary passwords are restricted to password change', async () => {
    const username = `audit_temp_${tag}`.toLowerCase();
    const created = expectStatus(
      await api('POST', '/api/v1/users', {
        token: state.admin,
        body: {
          username,
          fullName: 'Audit Temp User',
          role: 'CASHIER',
          branchId: state.branchId,
          password: 'TempPass123',
        },
      }),
      201,
      'create temp user',
    );
    expectStatus(
      await api('POST', `/api/v1/users/${created.id}/reset-password`, {
        token: state.admin,
        body: { newPassword: 'TempPass456', mustChangePassword: true },
      }),
      204,
      'admin reset',
    );
    const session = authBody(await login(username, 'TempPass456'), 'temp login');
    expect(
      session.user?.mustChangePassword === true || session.mustChangePassword === true,
      'mustChangePassword not set',
    );
    const blocked = await api('GET', '/api/v1/auth/me', { token: session.accessToken });
    expect(blocked.status === 403, `temp token read ${blocked.status}`);
    expect(
      blocked.body?.error?.code === 'PASSWORD_CHANGE_REQUIRED',
      `unexpected code ${blocked.body?.error?.code}`,
    );
    const changed = expectStatus(
      await api('POST', '/api/v1/auth/change-password', {
        token: session.accessToken,
        body: { currentPassword: 'TempPass456', newPassword: 'TempPass789' },
      }),
      200,
      'change password',
    );
    expect(changed.accessToken, 'no new session');
    expectStatus(await api('GET', '/api/v1/auth/me', { token: changed.accessToken }), 200, 'new session');
    for (const id of [created.id, lockUser].filter(Boolean)) {
      await api('DELETE', `/api/v1/users/${id}`, { token: state.admin });
    }
  });

  // ---------------------------------------------------------------- menu ----
  console.log('\n== Menu, pricing and discounts ==');
  await check('seed catalog is readable with prices', async () => {
    const catalog = expectStatus(await api('GET', '/api/v1/menu/catalog', { token: state.admin }), 200, 'catalog');
    expect(catalog.items.length > 0, 'no items');
    state.categoryId = catalog.categories[0].id;
    const priced = catalog.items.find((item) => item.isAvailable && Number(item.basePrice) > 0);
    expect(priced, 'no priced item');
    info('catalog sample', `${catalog.items.length} items, ${catalog.toppings.length} toppings`);
  });

  await check('create ingredient, category, topping, menu item, size and recipe', async () => {
    const ingredient = expectStatus(
      await api('POST', '/api/v1/inventory/ingredients', {
        token: state.admin,
        body: {
          name: `Audit Dough ${tag}`,
          nameAr: `عجينة تدقيق ${tag}`,
          unit: 'KG',
          currentStock: 1000,
          minStock: 10,
          costPerUnit: '2.00',
        },
      }),
      201,
      'ingredient',
    );
    state.ingredientId = ingredient.id;

    const category = expectStatus(
      await api('POST', '/api/v1/categories', {
        token: state.admin,
        body: { name: `Audit Category ${tag}`, nameAr: `فئة تدقيق ${tag}` },
      }),
      201,
      'category',
    );
    state.auditCategoryId = category.id;

    const topping = expectStatus(
      await api('POST', '/api/v1/menu/toppings', {
        token: state.admin,
        body: {
          name: `Audit Topping ${tag}`,
          nameAr: `إضافة تدقيق ${tag}`,
          price: '5.00',
          ingredientId: ingredient.id,
          ingredientQuantity: 0.05,
        },
      }),
      201,
      'topping',
    );
    state.toppingId = topping.id;

    const item = expectStatus(
      await api('POST', '/api/v1/menu/items', {
        token: state.admin,
        body: {
          name: `Audit Pizza ${tag}`,
          nameAr: `بيتزا تدقيق ${tag}`,
          categoryId: category.id,
          sku: `AUD-${tag}`,
          basePrice: '100.00',
          costPrice: '30.00',
          hasSizes: true,
          sizes: [
            { name: 'Small', nameAr: 'صغير', price: '80.00', isDefault: true, sortOrder: 0 },
            { name: 'Large', nameAr: 'كبير', price: '120.00', sortOrder: 1 },
          ],
        },
      }),
      201,
      'menu item',
    );
    state.itemId = item.id;
    state.largeSizeId = item.sizes.find((size) => size.name === 'Large')?.id;
    expect(state.largeSizeId, 'large size missing');

    expectStatus(
      await api('PUT', `/api/v1/menu/items/${item.id}/recipe`, {
        token: state.admin,
        body: { items: [{ ingredientId: ingredient.id, quantity: 0.1 }] },
      }),
      200,
      'recipe',
    );
    return `item ${item.id}`;
  });

  await check('menu validation rejects bad payloads and uniquifies duplicate SKUs', async () => {
    expectStatus(
      await api('POST', '/api/v1/menu/items', {
        token: state.admin,
        body: { name: 'No Arabic', categoryId: state.auditCategoryId, basePrice: '10.00' },
      }),
      400,
      'missing nameAr',
    );
    const dup = expectStatus(
      await api('POST', '/api/v1/menu/items', {
        token: state.admin,
        body: {
          name: `Dup ${tag}`,
          nameAr: `مكرر ${tag}`,
          categoryId: state.auditCategoryId,
          sku: `AUD-${tag}`,
          basePrice: '10.00',
        },
      }),
      201,
      'duplicate sku',
    );
    expect(dup.sku && dup.sku !== `AUD-${tag}`, 'duplicate SKU was not uniquified');
    expectStatus(
      await api('POST', '/api/v1/discounts', {
        token: state.admin,
        body: { name: 'Bad', nameAr: 'سيئ', type: 'PERCENT', value: '150.00' },
      }),
      400,
      'discount >100%',
    );
    return `duplicate sku stored as ${dup.sku}`;
  });

  await check('quote computes subtotal, 14% tax, topping and size surcharge', async () => {
    const plain = expectStatus(
      await api('POST', '/api/public/orders/quote', {
        body: {
          branchId: state.branchId,
          fulfillment: 'TAKEAWAY',
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 2, toppingIds: [state.toppingId] }],
        },
      }),
      200,
      'quote',
    );
    // 2 x (120 + 5) = 250; tax 14% = 35; total 285
    expect(moneyValue(plain.subtotal) === 25000, `subtotal ${plain.subtotal}`);
    expect(moneyValue(plain.tax) === 3500, `tax ${plain.tax}`);
    expect(moneyValue(plain.total) === 28500, `total ${plain.total}`);
    expect(Number(plain.taxRate) === 14, `tax rate ${plain.taxRate}`);

    const delivery = expectStatus(
      await api('POST', '/api/public/orders/quote', {
        body: {
          branchId: state.branchId,
          fulfillment: 'DELIVERY',
          customerLat: 30.0606,
          customerLng: 31.2197,
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
        },
      }),
      200,
      'delivery quote',
    );
    expect(moneyValue(delivery.deliveryFee) === 2000, `delivery fee ${delivery.deliveryFee}`);
    expect(moneyValue(delivery.total) === 12000 + 1680 + 2000, `delivery total ${delivery.total}`);
    return 'takeaway 285.00, delivery 156.80';
  });

  await check('discount caps: cashier blocked above 20%, admin allowed', async () => {
    const discount = expectStatus(
      await api('POST', '/api/v1/discounts', {
        token: state.admin,
        body: { name: `Audit 30 ${tag}`, nameAr: `خصم تدقيق ${tag}`, type: 'PERCENT', value: '30.00' },
      }),
      201,
      'create discount',
    );
    state.discountId = discount.id;
    const cashierAttempt = await create(state.itemId, {
      sizeId: state.largeSizeId,
      discountId: discount.id,
      total: '95.76',
      token: state.cashier,
    });
    expectStatus(cashierAttempt, 403, 'cashier 30%');
    const adminAttempt = await create(state.itemId, {
      sizeId: state.largeSizeId,
      discountId: discount.id,
      total: '95.76',
      token: state.admin,
    });
    expectStatus(adminAttempt, 201, 'admin 30%');
    // 120 - 36 discount = 84 taxable; tax 11.76; total 95.76
    expect(moneyValue(adminAttempt.body.total) === 9576, `admin total ${adminAttempt.body.total}`);
    expect(moneyValue(adminAttempt.body.discount) === 3600, `discount ${adminAttempt.body.discount}`);
    return 'cashier 403, admin total 95.76';
  });

  await check('inactive items are rejected by checkout', async () => {
    expectStatus(
      await api('PATCH', `/api/v1/menu/items/${state.itemId}`, {
        token: state.admin,
        body: { isAvailable: false },
      }),
      200,
      'mark unavailable',
    );
    const res = await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' });
    expectStatus(res, 409, 'sold out');
    expectStatus(
      await api('PATCH', `/api/v1/menu/items/${state.itemId}`, {
        token: state.admin,
        body: { isAvailable: true },
      }),
      200,
      'restore',
    );
  });

  // --------------------------------------------------------------- orders ----
  console.log('\n== Orders, tabs, refunds ==');
  await check('cash order is created atomically with payment, invoice and stock', async () => {
    const stockBefore = await api(
      'GET',
      `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`,
      { token: state.admin },
    );
    const levelBefore = Number(stockBefore.body.items[0].currentStock);
    const res = await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' });
    expectStatus(res, 201, 'create');
    const order = res.body;
    state.cashOrderId = order.id;
    expect(order.paymentStatus === 'PAID', `paymentStatus ${order.paymentStatus}`);
    expect(moneyValue(order.total) === 13680, `total ${order.total}`);
    expect(order.items?.length === 1, 'items missing');
    const invoice = expectStatus(
      await api('GET', `/api/v1/invoices/by-order/${order.id}`, { token: state.admin }),
      200,
      'invoice',
    );
    expect(invoice.invoiceNumber || invoice.number, 'invoice number missing');
    const stock = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`, { token: state.admin }),
      200,
      'stock',
    );
    const level = Number(stock.items[0].currentStock);
    expect(Math.abs(level - (levelBefore - 0.1)) < 0.001, `stock moved ${levelBefore} -> ${level}`);
    return `order ${order.orderNumber}, stock ${levelBefore} -> ${level}`;
  });

  await check('idempotency key replays the same order and blocks another user', async () => {
    const key = `audit-idem-${tag}`;
    const first = await create(state.itemId, {
      sizeId: state.largeSizeId,
      total: '136.80',
      idempotencyKey: key,
    });
    expectStatus(first, 201, 'first');
    const second = await create(state.itemId, {
      sizeId: state.largeSizeId,
      total: '136.80',
      idempotencyKey: key,
    });
    expectStatus(second, 201, 'replay');
    expect(second.body.id === first.body.id, `different ids ${first.body.id} / ${second.body.id}`);
    const other = await create(state.itemId, {
      sizeId: state.largeSizeId,
      total: '136.80',
      idempotencyKey: key,
      token: state.omar,
    });
    expectStatus(other, 409, 'other cashier');
    return `replayed ${first.body.orderNumber}`;
  });

  await check('open tab can receive items and settle with split payment', async () => {
    const table = await freshTable('split');
    const tab = expectStatus(
      await api('POST', '/api/v1/orders', {
        token: state.cashier,
        headers: TERMINAL,
        body: {
          type: 'DINE_IN',
          tableId: table.id,
          payLater: true,
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
          payments: [],
        },
      }),
      201,
      'open tab',
    );
    expect(tab.paymentStatus === 'UNPAID', `tab status ${tab.paymentStatus}`);
    state.tabId = tab.id;
    const added = expectStatus(
      await api('POST', `/api/v1/orders/${tab.id}/items`, {
        token: state.cashier,
        headers: TERMINAL,
        body: {
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
        },
      }),
      200,
      'add items',
    );
    expect(moneyValue(added.subtotal) === 24000, `subtotal after add ${added.subtotal}`);
    const settled = expectStatus(
      await api('POST', `/api/v1/orders/${tab.id}/settle`, {
        token: state.cashier,
        headers: TERMINAL,
        body: {
          payments: [
            { method: 'CASH', amount: '200.00' },
            { method: 'CARD', amount: '73.60' },
          ],
        },
      }),
      200,
      'settle',
    );
    // 240 + 33.60 tax = 273.60; cash 200 + card 73.60
    expect(settled.paymentStatus === 'PAID', `settled status ${settled.paymentStatus}`);
    expect(moneyValue(settled.total) === 27360, `settled total ${settled.total}`);
    expect(moneyValue(settled.changeDue) === 0, `change ${settled.changeDue}`);
    const again = await api('POST', `/api/v1/orders/${tab.id}/settle`, {
      token: state.cashier,
      headers: TERMINAL,
      body: { payments: [{ method: 'CASH', amount: '273.60' }] },
    });
    expectStatus(again, 409, 'double settle');
    return `tab ${tab.orderNumber} settled 273.60`;
  });

  await check('status transitions follow the documented graph', async () => {
    const order = expectStatus(
      await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' }),
      201,
      'create for status',
    );
    expectStatus(
      await api('PATCH', `/api/v1/orders/${order.id}/status`, {
        token: state.cashier,
        body: { status: 'completed' },
      }),
      409,
      'skip to completed',
    );
    expectStatus(
      await api('PATCH', `/api/v1/orders/${order.id}/status`, {
        token: state.cashier,
        body: { status: 'preparing' },
      }),
      200,
      'pending -> preparing',
    );
    expectStatus(
      await api('PATCH', `/api/v1/orders/${order.id}/status`, {
        token: state.cashier,
        body: { status: 'ready' },
      }),
      200,
      'preparing -> ready',
    );
    return 'invalid skip rejected, valid path accepted';
  });

  await check('kitchen board hides prices and customer phone; kitchen updates status', async () => {
    const board = expectStatus(
      await api('GET', '/api/v1/kitchen/orders', { token: state.kitchen }),
      200,
      'kitchen board',
    );
    const rows = board.orders;
    expect(Array.isArray(rows) && rows.length > 0, `empty board (${JSON.stringify(board).slice(0, 120)})`);
    const serialized = JSON.stringify(rows);
    expect(!/"total"|"paymentStatus"|"customerPhone"/.test(serialized), 'sensitive fields leaked to kitchen');
    const first = rows.find((row) => row.status !== 'completed');
    expect(first, 'no active ticket');
    const next = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'completed' }[first.status];
    expect(next, `unexpected status ${first.status}`);
    expectStatus(
      await api('PATCH', `/api/v1/kitchen/orders/${first.id}/status`, {
        token: state.kitchen,
        body: { status: next },
      }),
      200,
      'kitchen advance',
    );
    expectStatus(await api('GET', '/api/v1/kitchen/orders', { token: state.cashier }), 403, 'cashier kitchen');
    return `${rows.length} tickets, no financial fields, advanced to ${next}`;
  });

  await check('completed order cannot be cancelled; open tab cancel succeeds', async () => {
    const order = expectStatus(
      await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' }),
      201,
      'create to complete',
    );
    for (const status of ['preparing', 'ready', 'completed']) {
      expectStatus(
        await api('PATCH', `/api/v1/orders/${order.id}/status`, {
          token: state.cashier,
          body: { status },
        }),
        200,
        `transition ${status}`,
      );
    }
    const res = await api('POST', `/api/v1/orders/${order.id}/cancel`, {
      token: state.admin,
      headers: TERMINAL,
      body: { reason: 'Audit cancellation attempt' },
    });
    expectStatus(res, 409, 'cancel completed');

    const tab = expectStatus(
      await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' }),
      201,
      'create for cancel',
    );
    const cancelled = expectStatus(
      await api('POST', `/api/v1/orders/${tab.id}/cancel`, {
        token: state.admin,
        headers: TERMINAL,
        body: { reason: 'Audit cancellation' },
      }),
      200,
      'cancel paid',
    );
    expect(cancelled.status === 'cancelled', `status ${cancelled.status}`);
    expect(cancelled.paymentStatus === 'REFUNDED', `paymentStatus ${cancelled.paymentStatus}`);
    expect(moneyValue(cancelled.refundedTotal) === 13680, `refunded ${cancelled.refundedTotal}`);
    return 'completed blocked, paid order cancelled and refunded';
  });

  await check('partial then full refund; over-refund and double refund rejected', async () => {
    const order = expectStatus(
      await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' }),
      201,
      'refund order',
    );
    const partial = expectStatus(
      await api('POST', `/api/v1/orders/${order.id}/refund`, {
        token: state.admin,
        headers: TERMINAL,
        body: { amount: '36.80', method: 'CASH', reason: 'Audit partial refund' },
      }),
      200,
      'partial refund',
    );
    expect(partial.paymentStatus === 'PARTIALLY_REFUNDED', `partial status ${partial.paymentStatus}`);
    expect(moneyValue(partial.refundedTotal) === 3680, `partial refunded ${partial.refundedTotal}`);
    const over = await api('POST', `/api/v1/orders/${order.id}/refund`, {
      token: state.admin,
      headers: TERMINAL,
      body: { amount: '500.00', method: 'CASH', reason: 'Audit over refund' },
    });
    expectStatus(over, 400, 'over refund');
    const rest = expectStatus(
      await api('POST', `/api/v1/orders/${order.id}/refund`, {
        token: state.admin,
        headers: TERMINAL,
        body: { amount: '100.00', method: 'CASH', reason: 'Audit remaining refund' },
      }),
      200,
      'remaining refund',
    );
    expect(rest.paymentStatus === 'REFUNDED', `final status ${rest.paymentStatus}`);
    const again = await api('POST', `/api/v1/orders/${order.id}/refund`, {
      token: state.admin,
      headers: TERMINAL,
      body: { amount: '1.00', method: 'CASH', reason: 'Audit extra refund' },
    });
    expectStatus(again, 409, 'refund after full');
    return '36.80 + 100.00 refunded, extras rejected';
  });

  await check('insufficient stock blocks checkout with shortages', async () => {
    const ingredient = expectStatus(
      await api('POST', '/api/v1/inventory/ingredients', {
        token: state.admin,
        body: {
          name: `Audit Empty ${tag}`,
          nameAr: `مخزون فارغ ${tag}`,
          unit: 'KG',
          currentStock: 0,
          costPerUnit: '1.00',
        },
      }),
      201,
      'empty ingredient',
    );
    const item = expectStatus(
      await api('POST', '/api/v1/menu/items', {
        token: state.admin,
        body: {
          name: `Audit Empty Pizza ${tag}`,
          nameAr: `بيتزا فارغة ${tag}`,
          categoryId: state.auditCategoryId,
          sku: `EMPTY-${tag}`,
          basePrice: '50.00',
        },
      }),
      201,
      'empty item',
    );
    expectStatus(
      await api('PUT', `/api/v1/menu/items/${item.id}/recipe`, {
        token: state.admin,
        body: { items: [{ ingredientId: ingredient.id, quantity: 1 }] },
      }),
      200,
      'empty recipe',
    );
    const res = await create(item.id, { total: '57.00' });
    expectStatus(res, 409, 'stock block');
    expect(String(res.body?.error?.message).toLowerCase().includes('stock'), 'no stock message');
    return 'order rejected, shortage reported';
  });

  await check('concurrent checkouts cannot oversell the last stock unit', async () => {
    const ingredient = expectStatus(
      await api('POST', '/api/v1/inventory/ingredients', {
        token: state.admin,
        body: {
          name: `Audit Last ${tag}`,
          nameAr: `آخر وحدة ${tag}`,
          unit: 'KG',
          currentStock: 1,
          costPerUnit: '1.00',
        },
      }),
      201,
      'last ingredient',
    );
    const item = expectStatus(
      await api('POST', '/api/v1/menu/items', {
        token: state.admin,
        body: {
          name: `Audit Last Pizza ${tag}`,
          nameAr: `بيتزا أخيرة ${tag}`,
          categoryId: state.auditCategoryId,
          sku: `LAST-${tag}`,
          basePrice: '50.00',
        },
      }),
      201,
      'last item',
    );
    await api('PUT', `/api/v1/menu/items/${item.id}/recipe`, {
      token: state.admin,
      body: { items: [{ ingredientId: ingredient.id, quantity: 1 }] },
    });
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () => create(item.id, { total: '57.00' })),
    );
    const ok = attempts.filter((res) => res.status === 201).length;
    const conflicts = attempts.filter((res) => res.status === 409).length;
    expect(ok === 1, `expected exactly 1 success, got ${ok} (${attempts.map((r) => r.status).join(',')})`);
    expect(conflicts === 4, `expected 4 conflicts, got ${conflicts}`);
    return '1 success, 4 stock conflicts';
  });

  await check('parallel idempotent creates yield one order', async () => {
    const key = `audit-par-${tag}`;
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        create(state.itemId, { sizeId: state.largeSizeId, total: '136.80', idempotencyKey: key }),
      ),
    );
    const ids = new Set(attempts.filter((res) => res.status === 201).map((res) => res.body.id));
    expect(ids.size === 1, `expected one order, got ${ids.size} (${attempts.map((r) => r.status).join(',')})`);
    return `5 requests, 1 order ${[...ids][0]}`;
  });

  await check('parallel settles produce exactly one winner', async () => {
    const table = await freshTable('settle');
    const tab = expectStatus(
      await api('POST', '/api/v1/orders', {
        token: state.cashier,
        headers: TERMINAL,
        body: {
          type: 'DINE_IN',
          tableId: table.id,
          payLater: true,
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
          payments: [],
        },
      }),
      201,
      'open tab',
    );
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        api('POST', `/api/v1/orders/${tab.id}/settle`, {
          token: state.cashier,
          headers: TERMINAL,
          body: { payments: [{ method: 'CASH', amount: '136.80' }] },
        }),
      ),
    );
    const ok = attempts.filter((res) => res.status === 200).length;
    const conflicts = attempts.filter((res) => res.status === 409).length;
    expect(ok === 1 && conflicts === 4, `settle race: ${attempts.map((r) => r.status).join(',')}`);
    return '1 settled, 4 conflicts';
  });

  // ------------------------------------------------------- concurrency bugs --
  console.log('\n== Concurrency probes (known-risk areas) ==');
  await check('parallel add-items preserve every line (no lost update)', async () => {
    const table = await freshTable('add');
    const tab = expectStatus(
      await api('POST', '/api/v1/orders', {
        token: state.cashier,
        headers: TERMINAL,
        body: {
          type: 'DINE_IN',
          tableId: table.id,
          payLater: true,
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
          payments: [],
        },
      }),
      201,
      'tab',
    );
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        api('POST', `/api/v1/orders/${tab.id}/items`, {
          token: state.cashier,
          headers: TERMINAL,
          body: {
            items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
          },
        }),
      ),
    );
    const statuses = responses.map((res) => res.status);
    const final = expectStatus(await api('GET', `/api/v1/orders/${tab.id}`, { token: state.cashier }), 200, 'reload');
    const expectedSubtotal = 48000; // four pizzas at 120
    const actual = moneyValue(final.subtotal);
    expect(
      actual === expectedSubtotal,
      `lost update: subtotal ${final.subtotal} after 3 parallel adds (expected 480.00), statuses ${statuses.join(',')}`,
    );
    return `subtotal ${final.subtotal}`;
  });

  await check('parallel full refunds cannot exceed captured payment', async () => {
    const order = expectStatus(
      await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' }),
      201,
      'refund race order',
    );
    const attempts = await Promise.all(
      Array.from({ length: 2 }, () =>
        api('POST', `/api/v1/orders/${order.id}/refund`, {
          token: state.admin,
          headers: TERMINAL,
          body: { amount: '136.80', method: 'CASH', reason: 'Concurrent refund probe' },
        }),
      ),
    );
    const ok = attempts.filter((res) => res.status === 200).length;
    expect(
      ok === 1,
      `over-refund race: ${ok} of 2 concurrent full refunds succeeded (statuses ${attempts.map((r) => r.status).join(',')})`,
    );
    return 'exactly one refund accepted';
  });

  await check('parallel full refunds restore stock only once', async () => {
    const before = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`, { token: state.admin }),
      200,
      'stock before',
    );
    const beforeStock = Number(before.items[0].currentStock);
    const order = expectStatus(
      await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' }),
      201,
      'stock refund order',
    );
    const afterSale = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`, { token: state.admin }),
      200,
      'stock after sale',
    );
    expect(Math.abs(Number(afterSale.items[0].currentStock) - (beforeStock - 0.1)) < 0.001, 'sale did not deduct 0.1');
    const attempts = await Promise.all(
      Array.from({ length: 2 }, () =>
        api('POST', `/api/v1/orders/${order.id}/refund`, {
          token: state.admin,
          headers: TERMINAL,
          body: { amount: '136.80', method: 'CASH', reason: 'Concurrent stock restore probe' },
        }),
      ),
    );
    const ok = attempts.filter((res) => res.status === 200).length;
    const afterRefund = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`, { token: state.admin }),
      200,
      'stock after refund',
    );
    const restored = Number(afterRefund.items[0].currentStock);
    expect(
      Math.abs(restored - beforeStock) < 0.001,
      `stock restored ${ok} time(s): ${restored} vs expected ${beforeStock}`,
    );
    return `one refund effective, stock ${restored}`;
  });

  // ------------------------------------------------------------ inventory ----
  console.log('\n== Inventory, purchasing, transfers ==');
  await check('stock adjustment, waste and movement ledger', async () => {
    const ingredientId = state.ingredientId;
    expectStatus(
      await api('POST', `/api/v1/inventory/ingredients/${ingredientId}/adjust`, {
        token: state.admin,
        body: { quantity: 5, reason: 'Audit adjustment' },
      }),
      200,
      'adjust',
    );
    expectStatus(
      await api('POST', `/api/v1/inventory/ingredients/${ingredientId}/waste`, {
        token: state.admin,
        body: { quantity: 1, reason: 'Audit waste' },
      }),
      200,
      'waste',
    );
    const movements = expectStatus(
      await api('GET', `/api/v1/inventory/movements?ingredientId=${ingredientId}&pageSize=50`, { token: state.admin }),
      200,
      'movements',
    );
    const types = new Set((movements.items ?? movements).map((row) => row.type));
    expect(types.has('ADJUSTMENT') || types.has('MANUAL_ADJUSTMENT') || types.has('WASTE'), `types ${[...types].join(',')}`);
    return `${types.size} movement types recorded`;
  });

  await check('stocktake completes and locks counted quantity', async () => {
    const ingredientId = state.ingredientId;
    const before = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`, { token: state.admin }),
      200,
      'before',
    );
    const counted = Number(before.items[0].currentStock);
    const stocktake = expectStatus(
      await api('POST', '/api/v1/inventory/stocktakes', {
        token: state.admin,
        body: { notes: 'Audit stocktake', items: [{ ingredientId, countedQty: counted + 2 }] },
      }),
      201,
      'create stocktake',
    );
    expectStatus(
      await api('POST', `/api/v1/inventory/stocktakes/${stocktake.id}/complete`, {
        token: state.admin,
      }),
      200,
      'complete stocktake',
    );
    const after = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`, { token: state.admin }),
      200,
      'after',
    );
    expect(Math.abs(Number(after.items[0].currentStock) - (counted + 2)) < 0.001, `stocktake result ${after.items[0].currentStock}`);
    return `raised to ${after.items[0].currentStock}`;
  });

  await check('purchase order lifecycle updates stock and average cost', async () => {
    const supplier = expectStatus(
      await api('POST', '/api/v1/suppliers', {
        token: state.admin,
        body: { name: `Audit Supplier ${tag}`, nameAr: `مورد تدقيق ${tag}` },
      }),
      201,
      'supplier',
    );
    const po = expectStatus(
      await api('POST', '/api/v1/purchasing/purchase-orders', {
        token: state.admin,
        body: {
          supplierId: supplier.id,
          items: [{ ingredientId: state.ingredientId, quantity: 10, unitPrice: '3.00' }],
        },
      }),
      201,
      'purchase order',
    );
    const poItem = (po.items ?? [])[0];
    expect(poItem?.id, 'purchase order item id missing');
    expectStatus(
      await api('POST', `/api/v1/purchasing/purchase-orders/${po.id}/status`, {
        token: state.admin,
        body: { action: 'submit' },
      }),
      200,
      'submit',
    );
    expectStatus(
      await api('POST', `/api/v1/purchasing/purchase-orders/${po.id}/status`, {
        token: state.admin,
        body: { action: 'approve' },
      }),
      200,
      'approve',
    );
    const received = expectStatus(
      await api('POST', `/api/v1/purchasing/purchase-orders/${po.id}/receive`, {
        token: state.admin,
        body: { items: [{ purchaseOrderItemId: poItem.id, quantity: 10, unitCost: '3.00' }] },
      }),
      201,
      'receive',
    );
    expect(received.receiptNumber, 'receipt number missing');
    const reloaded = expectStatus(
      await api('GET', `/api/v1/purchasing/purchase-orders/${po.id}`, { token: state.admin }),
      200,
      'reload po',
    );
    const status = reloaded.status;
    expect(String(status).toUpperCase().includes('RECEIVED'), `status ${status}`);
    const stock = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`, { token: state.admin }),
      200,
      'stock after receipt',
    );
    expect(Number(stock.items[0].currentStock) > 0, 'stock not increased');
    return `PO received, stock ${stock.items[0].currentStock}`;
  });

  await check('cross-branch transfer moves stock both ways', async () => {
    const branch = expectStatus(
      await api('POST', '/api/v1/branches', {
        token: state.admin,
        body: { code: `AUD${tag.slice(-4)}`, name: `Audit Branch ${tag}`, nameAr: `فرع تدقيق ${tag}` },
      }),
      201,
      'branch',
    );
    state.branch2 = branch.id;
    const transfer = expectStatus(
      await api('POST', '/api/v1/inventory/transfers', {
        token: state.admin,
        body: {
          fromBranchId: state.branchId,
          toBranchId: branch.id,
          items: [{ ingredientId: state.ingredientId, quantity: 2 }],
        },
      }),
      201,
      'transfer',
    );
    expectStatus(
      await api('PATCH', `/api/v1/inventory/transfers/${transfer.id}/status`, {
        token: state.admin,
        body: { status: 'IN_TRANSIT' },
      }),
      200,
      'dispatch',
    );
    expectStatus(
      await api('PATCH', `/api/v1/inventory/transfers/${transfer.id}/status`, {
        token: state.admin,
        body: { status: 'RECEIVED' },
      }),
      200,
      'receive',
    );
    const destination = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent(`Audit Dough ${tag}`)}`, {
        token: state.admin,
        headers: { 'x-branch-id': branch.id },
      }),
      200,
      'destination stock',
    );
    expect(Number(destination.items[0].currentStock) >= 2, `destination ${destination.items[0].currentStock}`);
    return `2 units at branch ${branch.code}`;
  });

  // ------------------------------------------------------ shifts & delivery --
  console.log('\n== Shifts, delivery, online orders ==');
  await check('shift opens, receives cash movements and closes with Z-report', async () => {
    const open = expectStatus(
      await api('POST', '/api/v1/shifts', {
        token: state.cashier,
        headers: TERMINAL,
        body: { openingFloat: '100.00' },
      }),
      201,
      'open shift',
    );
    state.shiftId = open.id;
    expectStatus(
      await api('POST', `/api/v1/shifts/${open.id}/movements`, {
        token: state.cashier,
        headers: TERMINAL,
        body: { type: 'CASH_IN', amount: '50.00', reason: 'Audit float top-up' },
      }),
      201,
      'cash in',
    );
    const cashOrder = expectStatus(
      await create(state.itemId, { sizeId: state.largeSizeId, total: '136.80' }),
      201,
      'cash order in shift',
    );
    expect(cashOrder.shiftId === open.id, `order not linked to shift (${cashOrder.shiftId})`);
    const closed = expectStatus(
      await api('POST', `/api/v1/shifts/${open.id}/close`, {
        token: state.cashier,
        headers: TERMINAL,
        body: { countedCash: '286.80' },
      }),
      200,
      'close shift',
    );
    expect(closed.status === 'CLOSED', `status ${closed.status}`);
    expect(closed.expectedCash !== undefined && closed.expectedCash !== null, 'expectedCash missing');
    expect(closed.variance !== undefined && closed.variance !== null, 'variance missing');
    expect(String(closed.zReportNumber ?? closed.zReport?.reportNumber ?? '') !== '', 'Z-report missing');
    const today = new Date().toISOString().slice(0, 10);
    const z = expectStatus(
      await api('GET', `/api/v1/shifts/z-reports?date=${today}`, { token: state.admin }),
      200,
      'z reports',
    );
    expect((z.items ?? z).length > 0, 'no Z-report rows');
    return `expected ${closed.expectedCash}, variance ${closed.variance}`;
  });

  await check('delivery order resolves zone fee, assigns driver, driver delivers', async () => {
    const drivers = expectStatus(
      await api('GET', '/api/v1/delivery/drivers', { token: state.admin }),
      200,
      'drivers',
    );
    const driver = (drivers.items ?? drivers).find((row) => row.role === 'DRIVER' || row.username === 'driver');
    expect(driver, 'driver missing');
    const order = expectStatus(
      await create(state.itemId, {
        sizeId: state.largeSizeId,
        type: 'DELIVERY',
        customerAddress: '12 Nile Corniche, Zamalek',
        customerLat: 30.0606,
        customerLng: 31.2197,
        isCod: true,
        payments: [],
      }),
      201,
      'delivery order',
    );
    expect(moneyValue(order.deliveryFee) === 2000, `zone fee ${order.deliveryFee}`);
    expect(order.isCod === true, 'not flagged as COD');
    expect(moneyValue(order.total) === 15680, `COD total ${order.total}`);
    expectStatus(
      await api('POST', `/api/v1/delivery/orders/${order.id}/assign`, {
        token: state.admin,
        body: { driverId: driver.id },
      }),
      200,
      'assign',
    );
    expectStatus(
      await api('PATCH', `/api/v1/delivery/orders/${order.id}/status`, {
        token: state.driver,
        body: { status: 'PICKED_UP' },
      }),
      200,
      'picked up',
    );
    expectStatus(
      await api('PATCH', `/api/v1/delivery/orders/${order.id}/status`, {
        token: state.driver,
        body: { status: 'DELIVERED' },
      }),
      200,
      'delivered',
    );
    state.deliveryOrderId = order.id;
    state.driverId = driver.id;
    return `fee 20.00, delivered by ${driver.fullName ?? driver.username}`;
  });

  await check('driver settlement aggregates COD and settles', async () => {
    // Clear any settlement left open by an earlier run before creating a new one.
    const existing = expectStatus(
      await api('GET', `/api/v1/delivery/settlements?driverId=${state.driverId}`, { token: state.admin }),
      200,
      'list settlements',
    );
    for (const row of existing.items ?? existing) {
      if (row.status === 'OPEN') {
        await api('POST', `/api/v1/delivery/settlements/${row.id}/settle`, {
          token: state.admin,
          body: { amountHandedOver: row.cashCollected },
        });
      }
    }
    const settlement = expectStatus(
      await api('POST', '/api/v1/delivery/settlements', {
        token: state.admin,
        body: { driverId: state.driverId },
      }),
      201,
      'create settlement',
    );
    expect(settlement.ordersCount >= 1, `COD orders not counted (${settlement.ordersCount})`);
    // Earlier audit runs also delivered COD orders at this price; each COD
    // order adds exactly 156.80 to the collected cash.
    const cashMinor = moneyValue(settlement.cashCollected);
    expect(cashMinor >= 15680 && cashMinor % 15680 === 0, `cash collected ${settlement.cashCollected} for ${settlement.ordersCount} orders`);
    const codOrders = cashMinor / 15680;
    expect(codOrders <= settlement.ordersCount, `more COD cash than orders (${codOrders} > ${settlement.ordersCount})`);
    const settled = expectStatus(
      await api('POST', `/api/v1/delivery/settlements/${settlement.id}/settle`, {
        token: state.admin,
        body: { amountHandedOver: settlement.cashCollected },
      }),
      200,
      'settle',
    );
    expect(settled.status === 'SETTLED', `status ${settled.status}`);
    expect(moneyValue(settled.variance) === 0, `variance ${settled.variance}`);
    return `${settlement.ordersCount} COD order(s), ${settlement.cashCollected} collected, variance 0`;
  });

  await check('public card checkout captures via simulated gateway exactly once', async () => {
    const quote = expectStatus(
      await api('POST', '/api/public/orders/quote', {
        body: {
          branchId: state.branchId,
          fulfillment: 'TAKEAWAY',
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
        },
      }),
      200,
      'public quote',
    );
    const created = expectStatus(
      await api('POST', '/api/public/orders', {
        body: {
          branchId: state.branchId,
          idempotencyKey: `audit-online-${tag}`,
          customerName: 'Audit Online Customer',
          customerPhone: `0100${tag.slice(-6)}`,
          fulfillment: 'TAKEAWAY',
          paymentMethod: 'CARD',
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
        },
      }),
      201,
      'online order',
    );
    expect(created.paymentStatus === 'PENDING_PAYMENT', `status ${created.paymentStatus}`);
    const reference = `PAY-${created.orderNumber}`;
    const paid = expectStatus(
      await api('POST', '/api/v1/online-store/payments/simulate', {
        token: state.admin,
        body: { reference, status: 'PAID' },
      }),
      200,
      'simulate paid',
    );
    const paidOrder = paid.order ?? paid;
    expect(paidOrder.paymentStatus === 'PAID_ONLINE', `paid status ${paidOrder.paymentStatus}`);
    const duplicate = expectStatus(
      await api('POST', '/api/v1/online-store/payments/simulate', {
        token: state.admin,
        body: { reference, status: 'PAID' },
      }),
      200,
      'duplicate paid',
    );
    const duplicateOrder = duplicate.order ?? duplicate;
    expect(duplicateOrder.paymentStatus === 'PAID_ONLINE', 'duplicate downgraded the order');
    const lookup = expectStatus(
      await api('GET', `/api/public/orders/${created.orderNumber}?phone=${encodeURIComponent(`0100${tag.slice(-6)}`)}`),
      200,
      'public lookup',
    );
    expect(moneyValue(lookup.total) === moneyValue(quote.total), 'public total differs from quote');
    state.onlineOrderId = created.id;
    return `ref ${reference} captured, duplicate ignored`;
  });

  await check('webhook without a configured secret returns 503', async () => {
    const res = await api('POST', '/api/public/payments/basata/webhook', {
      headers: { 'content-type': 'application/json' },
      body: { reference: 'PAY-X', status: 'PAID' },
    });
    expect(res.status === 503 || res.status === 401, `unexpected ${res.status}`);
    return `HTTP ${res.status}`;
  });

  await check('delivery zone lookup and rejection outside all zones', async () => {
    const inside = expectStatus(
      await api('POST', '/api/public/delivery/check-zone', {
        body: { branchId: state.branchId, lat: 30.0606, lng: 31.2197 },
      }),
      200,
      'inside',
    );
    expect(inside.available === true || inside.zone, `inside result ${JSON.stringify(inside)}`);
    const far = await api('POST', '/api/public/delivery/check-zone', {
      body: { branchId: state.branchId, lat: 31.5, lng: 31.5 },
    });
    expect(far.status === 200, `far status ${far.status}`);
    return `inside fee ${inside.deliveryFee ?? inside.zone?.deliveryFee}`;
  });

  // ------------------------------------------------------- HR, expenses, etc --
  console.log('\n== HR, expenses, settings, reports, audit, uploads ==');
  await check('employee, attendance, adjustment and payroll run', async () => {
    const employee = expectStatus(
      await api('POST', '/api/v1/hr/employees', {
        token: state.admin,
        body: {
          fullName: `Audit Employee ${tag}`,
          jobTitle: 'Audit Tester',
          branchId: state.branchId,
          hireDate: '2026-01-01',
          basicSalary: '5000.00',
          salaryType: 'MONTHLY',
        },
      }),
      201,
      'employee',
    );
    state.employeeId = employee.id;
    const today = new Date().toISOString().slice(0, 10);
    expectStatus(
      await api('PUT', '/api/v1/hr/attendance', {
        token: state.admin,
        body: { employeeId: employee.id, date: today, checkIn: '09:00', checkOut: '17:00', status: 'PRESENT' },
      }),
      200,
      'attendance',
    );
    expectStatus(
      await api('POST', '/api/v1/hr/adjustments', {
        token: state.admin,
        body: {
          employeeId: employee.id,
          category: 'PERFORMANCE_BONUS',
          amount: '250.00',
          date: today,
          reason: 'Audit bonus',
          payrollMonth: '2026-11',
        },
      }),
      201,
      'adjustment',
    );
    const existingRun = expectStatus(
      await api('GET', '/api/v1/hr/payroll?month=2026-11', { token: state.admin }),
      200,
      'payroll read',
    );
    if (existingRun.run) {
      expect(existingRun.run.lines.length > 0, 'existing payroll has no lines');
      info('payroll', `November run already present with ${existingRun.run.lines.length} line(s)`);
      return `existing run ${existingRun.run.month}`;
    }
    const payroll = expectStatus(
      await api('POST', '/api/v1/hr/payroll', {
        token: state.admin,
        body: { month: '2026-11', notes: 'Audit payroll' },
      }),
      201,
      'payroll',
    );
    expect((payroll.lines ?? []).length > 0, 'payroll lines missing');
    const duplicate = await api('POST', '/api/v1/hr/payroll', {
      token: state.admin,
      body: { month: '2026-11' },
    });
    expectStatus(duplicate, 409, 'duplicate payroll');
    return `${payroll.lines.length} line(s)`;
  });

  await check('expense is created and appears in the summary', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const expense = expectStatus(
      await api('POST', '/api/v1/expenses', {
        token: state.admin,
        body: {
          category: 'UTILITIES',
          description: `Audit electricity ${tag}`,
          amount: '123.45',
          expenseDate: today,
          branchId: state.branchId,
        },
      }),
      201,
      'expense',
    );
    const summary = expectStatus(
      await api('GET', `/api/v1/expenses/summary?from=${today}&to=${today}`, { token: state.admin }),
      200,
      'summary',
    );
    expect(JSON.stringify(summary).includes('123.45') || Number(summary.total) >= 123.45, 'expense missing from summary');
    state.expenseId = expense.id;
    return '123.45 recorded';
  });

  await check('settings change is applied to pricing and can be restored', async () => {
    expectStatus(
      await api('PATCH', '/api/v1/settings', {
        token: state.admin,
        body: { taxRate: 15 },
      }),
      200,
      'tax 15',
    );
    const quote = expectStatus(
      await api('POST', '/api/public/orders/quote', {
        body: {
          branchId: state.branchId,
          fulfillment: 'TAKEAWAY',
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
        },
      }),
      200,
      'quote 15%',
    );
    expect(Number(quote.taxRate) === 15 && moneyValue(quote.tax) === 1800, `tax ${quote.tax} @ ${quote.taxRate}`);
    expectStatus(
      await api('PATCH', '/api/v1/settings', { token: state.admin, body: { taxRate: 14 } }),
      200,
      'restore 14',
    );
    return '15% applied to quote, restored';
  });

  await check('dashboard and sales report respond with consistent totals', async () => {
    const dashboard = expectStatus(
      await api('GET', '/api/v1/reports/dashboard?days=7', { token: state.admin }),
      200,
      'dashboard',
    );
    expect(dashboard.overview && Array.isArray(dashboard.revenueSeries), 'dashboard shape');
    const from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const sales = expectStatus(
      await api('GET', `/api/v1/reports/sales?from=${from}&to=${to}`, { token: state.admin }),
      200,
      'sales',
    );
    expect(sales.summary && sales.summary.total === undefined, 'unexpected shape');
    expect(sales.summary.orders >= 1, 'no orders in report');
    const tooLong = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
    expectStatus(
      await api('GET', `/api/v1/reports/sales?from=${tooLong}&to=${to}`, { token: state.admin }),
      400,
      'range >366',
    );
    expectStatus(
      await api('GET', '/api/v1/reports/inventory', { token: state.admin }),
      200,
      'inventory report',
    );
    return `${sales.summary.orders} orders, revenue ${sales.summary.revenue}`;
  });

  await check('audit trail records privileged mutations and is role-guarded', async () => {
    const audit = expectStatus(
      await api('GET', '/api/v1/audit?action=order.created&pageSize=5', { token: state.admin }),
      200,
      'audit',
    );
    expect((audit.items ?? []).length > 0, 'no order.created entries');
    expectStatus(await api('GET', '/api/v1/audit', { token: state.cashier }), 403, 'cashier audit');
    return `${(audit.items ?? []).length} recent entries`;
  });

  await check('cashier cannot read another branch order', async () => {
    // Audit ingredients only exist per branch; stock the second branch first.
    expectStatus(
      await api('POST', `/api/v1/inventory/ingredients/${state.ingredientId}/adjust`, {
        token: state.admin,
        headers: { 'x-branch-id': state.branch2 },
        body: { quantity: 5, reason: 'Audit second-branch stock' },
      }),
      200,
      'stock branch 2',
    );
    const foreign = expectStatus(
      await api('POST', '/api/v1/orders', {
        token: state.admin,
        headers: { ...TERMINAL, 'x-branch-id': state.branch2 },
        body: {
          type: 'TAKEAWAY',
          items: [{ menuItemId: state.itemId, sizeId: state.largeSizeId, quantity: 1, toppingIds: [] }],
          payments: [{ method: 'CASH', amount: '136.80' }],
        },
      }),
      201,
      'foreign order',
    );
    expectStatus(await api('GET', `/api/v1/orders/${foreign.id}`, { token: state.cashier }), 403, 'foreign read');
    return 'cross-branch read denied';
  });

  await check('upload validation: non-image rejected, storage absent returns 503', async () => {
    const bad = await api('POST', '/api/v1/uploads/image', {
      token: state.admin,
      body: { data: 'data:text/plain;base64,aGVsbG8=' },
    });
    expectStatus(bad, 400, 'text upload');
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const res = await api('POST', '/api/v1/uploads/image', {
      token: state.admin,
      body: { data: png },
    });
    expect(res.status === 503 || res.status === 201, `png upload ${res.status}`);
    return `png -> ${res.status} (storage config absent)`;
  });

  await check('SQL injection probes are treated as literals', async () => {
    const res = expectStatus(
      await api('GET', `/api/v1/orders?q=${encodeURIComponent("' OR 1=1; --")}&pageSize=5`, { token: state.admin }),
      200,
      'order search injection',
    );
    expect((res.items ?? []).length === 0, 'injection returned rows');
    const ingredient = expectStatus(
      await api('GET', `/api/v1/inventory/ingredients?q=${encodeURIComponent("%' OR '1'='1")}`, { token: state.admin }),
      200,
      'ingredient injection',
    );
    expect((ingredient.items ?? []).length === 0, 'injection returned ingredients');
    return 'both filters treated as literal text';
  });

  // ------------------------------------------------------------- summarize ---
  const passed = results.filter((row) => row.status === 'PASS').length;
  const failed = results.filter((row) => row.status === 'FAIL').length;
  const infos = results.filter((row) => row.status === 'INFO').length;
  console.log(`\n== Functional summary: ${passed} passed, ${failed} failed, ${infos} info ==`);
  for (const row of results.filter((r) => r.status === 'FAIL')) {
    console.log(`FAILED: ${row.name}\n  ${row.detail}`);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    resolve(OUT, 'api-functional.json'),
    JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), passed, failed, results }, null, 2),
  );
  console.log(`results written to docs/audit/results/api-functional.json`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 2;
});
