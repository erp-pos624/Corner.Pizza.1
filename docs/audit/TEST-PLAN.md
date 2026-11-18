# Corner Pizza ERP — Audit Plan

Date: 2026-11-18
Scope: full technical and functional audit of the Pizza ERP (monorepo at `apps/server`, `apps/web`, `apps/desktop`, `packages/ui`, `packages/shared`).
Evidence policy: every result in the final report must come from an executed command or a cited source line. Anything that cannot be executed is reported as **NOT TESTED** with the reason.

## 1. System map

### 1.1 Runtime topology

| Layer | Technology | Entry point |
| --- | --- | --- |
| API | Express 4, Prisma 6, PostgreSQL 18 | `apps/server/src/index.ts` |
| Staff UI | React + Vite, shared package | `packages/ui/src` (dashboard at 5174) |
| Desktop shell | Electron 33 + Forge | `apps/desktop` (5173) |
| Customer storefront | React + Vite | `apps/web/src/storefront` |
| Shared contracts | Zod schemas, permissions, money helpers | `packages/shared/src` |
| Local database | project-local Postgres on 127.0.0.1:55432 | `scripts/pg-dev.mjs`, data in `.dev/pgdata` |

Middleware order (`apps/server/src/app.ts:73-146`): Helmet (CSP disabled), CORS delegate, raw body for the Basata webhook, JSON (2 MB), request context, access log, language, health, OpenAPI, 25 authenticated `/api/v1` routers, `/api/public`, 404, error handler.

### 1.2 Modules (25 routers, ~217 handlers)

| Router | Mount | Main capabilities |
| --- | --- | --- |
| auth | `/api/v1/auth` | native + web login, refresh rotation, logout, me, change password |
| users | `/api/v1/users` | staff CRUD, reset password, deactivate |
| branches | `/api/v1/branches` | branch list/create/update, online-ordering flags |
| categories | `/api/v1/categories` | menu categories |
| menu | `/api/v1/menu` | menu items, sizes, recipes, toppings |
| discounts | `/api/v1/discounts` | percent/fixed discounts |
| orders | `/api/v1/orders` | quote, create, add items, settle tabs, refund, status, cancel, list/get |
| tables | `/api/v1/tables` | dining tables and status |
| delivery | `/api/v1/delivery` | dispatch list, assign, driver status, settlements |
| delivery-zones | `/api/v1/delivery-zones` | polygon/radius zones and fees |
| kitchen | `/api/v1/kitchen` | kitchen board and status updates (prices hidden) |
| invoices | `/api/v1/invoices` | invoice listing and document data |
| customers | `/api/v1/customers` | POS customer profiles, history, spend |
| inventory | `/api/v1/inventory` | ingredients, levels, adjustments, stocktakes, transfers, alerts, movements |
| hr | `/api/v1/hr` | employees, attendance, adjustments, payroll runs/lines, HR settings |
| purchasing | `/api/v1/purchasing` | purchase orders, approval, goods receipt |
| suppliers | `/api/v1/suppliers` | supplier CRUD |
| storefront | `/api/v1/storefront` | public site content editor |
| expenses | `/api/v1/expenses` | operating expenses |
| reports | `/api/v1/reports` | dashboard, sales, inventory reports, export data |
| shifts | `/api/v1/shifts` | open/close, cash movements, Z-reports |
| settings | `/api/v1/settings` | restaurant settings (tax, fees, stock policy, discount cap) |
| audit | `/api/v1/audit` | read-only audit trail |
| online-store | `/api/v1/online-store` | online status/settings, payment queries |
| uploads | `/api/v1/uploads` | 200 KB base64 image upload to Supabase Storage |
| public | `/api/public` | storefront menu/branches/quote/orders, customer accounts, payment callbacks, Basata webhook |

### 1.3 Roles

Defined in `packages/shared/src/permissions.ts:9-132` and enforced server-side only.

| Role | Selling | Kitchen | Inventory/purchasing | HR/payroll | Finance reports | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| ADMIN | all | all | all | all | all | all |
| CASHIER | create/update own orders, apply discounts (capped), open/close shift, delivery + settlements | no | no | no | no | no |
| KITCHEN_STAFF | no | view/update | no | no | no | no |
| DRIVER | no | no | no | no | no | delivery view/update + own settlements |

### 1.4 Order lifecycle

1. `POST /orders/quote` or public quote prices the cart from the database (server-owned prices).
2. `createOrder` (`apps/server/src/modules/orders/orders.service.ts:794`):
   validates branch, table, customer, discount, sizes/toppings, stock requisitions, delivery zone and fee;
   computes subtotal, discount (cashier cap), tax, delivery, total in integer minor units;
   writes order + items + toppings + payment rows + invoice + stock movements + audit in one transaction (`:973-1026`).
   Immediate payment deducts stock now; tabs (`payLater`) and online-card orders store a `stockPlan` snapshot instead.
3. `settleOrder` (`:1137`) conditionally claims `paymentStatus=UNPAID`, records payments, upserts the invoice, commits the stock plan once.
4. `updateOrderStatus` (`:1341`) enforces the allowed transition graph and optimistic status guard.
5. `cancelOrder` (`:1409`) conditionally claims status, restores stock once, refunds every remaining payment method, writes credit notes.
6. `refundOrder` (`:1221`) validates against captured payments and prior refunds, records a refund + credit note, restores stock on a full refund.
7. Online card orders run the same creation path with `channel=ONLINE`, `PENDING_PAYMENT`, reserved stock; the Basata webhook (`online-payments.service.ts:173`) is the only place that captures money, deducts stock, writes the payment + invoice, and is idempotent through a conditional `updateMany`.

### 1.5 Data model (50 models, 27 enums)

Key tables and indexes are in `apps/server/prisma/schema.prisma`:
`orders` (`:689-772`), `order_items` (`:774-799`), `order_item_toppings` (`:801-815`), `payments` (`:817-834`), `invoices` (`:836-847`), `online_payments` (`:853-874`), `inventory_movements` (`:570-600`), `refunds`/`credit_notes` (`:949-990`), `shifts`/`z_reports` (`:880-943`), `sessions` (`:293-309`), `audit_logs` (`:311-331`).

Money is `NUMERIC(14,2)` (stock `NUMERIC(12,3)`); business-day boundaries use `Africa/Cairo`.

### 1.6 Domain invariants to verify

- All prices, discounts, tax, delivery fees are recomputed server-side; client values are never trusted.
- One checkout = order + items + toppings + payments + invoice + cost snapshots + stock movements + audit, atomically.
- `inventoryDeducted` / `inventoryRestored` gate stock effects exactly once.
- Stock is claimed with conditional `updateMany`/`decrement`, preventing overselling under WAL concurrency.
- `orders.idempotencyKey` is unique; replays return the original order; a concurrent unique race returns the winner.
- A captured online payment is never downgraded; duplicate webhooks are no-ops.
- Reports include paid, non-cancelled orders only, net of refunds, with cancellation returns netted against deductions.

## 2. Environment and isolation

| Item | Value |
| --- | --- |
| Local Postgres | 127.0.0.1:55432, data `.dev/pgdata` (project-local) |
| Dev database | `corner_pizza` (do not modify during the audit beyond reading) |
| Test database | `corner_pizza_test` (Vitest) |
| Audit database | `corner_pizza_audit` — created from migrations and seeded; all write tests run here |
| Free disk before audit | 14 GB of 261 GB (95% used) |
| Node | v22.18.0 |

Rules:
- No test writes to `corner_pizza` or to any hosted (Supabase/Vercel) database.
- No destructive tests against anything but `corner_pizza_audit`; dropping that database is allowed only after the report artifacts are produced.
- Before large runs: record disk, then estimate storage from the measured bytes/order of a real-order run.

## 3. Phases

### Phase 0 — Discovery (done)

Architecture map, module/permission inventory, order lifecycle, schema/index inventory, report query review, risk register (below).

### Phase 1 — Baseline quality gates

Commands: `pnpm test:server`, `pnpm test:ui`, `pnpm --filter @posshope/web test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
Record: pass/fail counts, duration, warnings.

### Phase 2 — Functional API testing on `corner_pizza_audit`

Harness: Node script driving the real HTTP API against a server started with `DATABASE_URL=<audit>` on an unused port.
Coverage per module: happy path, invalid input, missing required fields, boundary values, duplicates, unauthorized role, unauthenticated access, concurrency where state is shared.

Priority flows:
1. Auth: login success/failure, lockout after 5 failures, refresh rotation, revoked refresh, web transport header/origin, temp-password restriction, logout.
2. RBAC: cashier blocked from reports/users/inventory/menu writes; kitchen blocked from orders; driver limited to delivery/settlements; cross-branch access denied.
3. Menu/pricing: create category/item/size/topping/recipe; quote arithmetic (tax, delivery, discount cap); disabled/inactive item rejection.
4. Orders: create (cash/card/split, dine-in/takeaway/delivery), tab + settle, add items, status transitions (valid/invalid), cancel, refund (partial, full, over-refund, wrong method), idempotent replay, duplicate table claim.
5. Online orders: public quote, COD order, card order with simulated Basata, webhook signature rejection, duplicate/paid-after-cancel webhook, payment failure releases stock.
6. Kitchen: board contents, price/customer PII absent, status update allowed for kitchen, denied for cashier.
7. Inventory: adjustment, movement ledger, stocktake completion, transfer between two branches, low-stock alerts.
8. Purchasing: create/approve PO, partial receipt, weighted average cost update, stock increment.
9. Shifts: open, cash in/out, close with expected vs counted variance, Z-report totals vs payments.
10. Delivery: zone fee resolution, dispatch, driver update, COD settlement.
11. HR/payroll: employee, attendance, adjustments, payroll run totals, branch scoping.
12. Expenses and reports: create expense, dashboard/report totals against SQL ground truth, date-range validation (max 366 days).
13. Settings/audit/uploads: settings update effect on pricing, audit trail entries, upload type/size validation.

Concurrency cases: same idempotency key in parallel, parallel checkout against the last stock unit, parallel settle of one tab, parallel refunds of one order, parallel add-items on one tab, duplicate online webhook.

### Phase 3 — Business simulation (real workflows)

Drive real `createOrder`/settle/refund/cancel paths over multiple business days with a realistic mix: dine-in/takeaway/delivery, cash/card/wallet, discounts, busy/lunch/dinner/late-night arrival times, cancellations and refunds, online COD and paid online orders.
Then reconcile:
- `sum(orders.total)` vs `sum(payments.amount)` vs invoices for paid orders;
- refunds ≤ captured payments per order; credit notes = refunds;
- item totals = subtotal; tax = round(subtotal − discount) × rate; total = subtotal − discount + tax + delivery;
- inventory ledger net per ingredient vs stock level delta from a snapshot;
- dashboard/sales report totals vs independent SQL;
- no duplicate order numbers, invoices, refunds, credit notes, payment captures.

### Phase 4 — Five-year volume and performance at scale

Reported separately as three different tests:
- **A. Historical workload simulation** — accelerated creation of business days. Target is 1,000 orders/day × 1,825 days = 1,825,000 orders with full children rows.
- **B. Concurrent load** — HTTP ramps at 10/50/100/250 (500/1,000 only if the host survives), read-heavy and write-heavy.
- **C. Stability** — sustained mixed load with memory/connection sampling.

Capacity gate: measure bytes/order from Phase 3, project the 1.825 M footprint, and compare with free disk. If the full run does not fit, execute the largest representative scale that does, report the projection and the full run as NOT TESTED (disk capacity), and never claim the 5-year target passed.

Scaled checks: report execution time at 1 day, 30 days, 366 days; `EXPLAIN (ANALYZE, BUFFERS)` on order list, dashboard and report queries; index effectiveness; autovacuum/bloat; connection pool behavior.

### Phase 5 — Security (non-destructive)

Code review plus safe runtime probes on the audit server: SQLi payloads in filters, auth bypass attempts, role escalation, IDOR across branches, upload payload/mime, rate-limit enforcement, error leakage, CORS/CSRF guards, JWT tampering/expiry, refresh reuse, webhook signature, sensitive fields in kitchen/public DTOs, secrets in repository.

### Phase 6 — Failure and recovery

Controlled on the audit DB only: DB stop/start while the API is serving, duplicate payment request, duplicate/crossed webhook, restart during a load run, concurrent tab edits, failed provider intent, interrupted process during simulation (then integrity scan).
Verify: no partial orders, no duplicate payments/refunds, stock consistent, idempotent retries, clean reconnect.

### Phase 7 — Fixes, regression and report

For each verified defect: reproduce, root-cause, minimal safe fix, regression test, rerun affected + full suite. Final report sections A–H with a verdict and NOT TESTED list.

## 4. Metrics to capture

- Functional: features discovered/tested, assertions, failures by severity.
- Throughput/latency: avg, p50, p95, p99, RPS, orders/min, error rate, timeouts.
- Database: query time, rows examined, buffer hits, connections, lock waits/deadlocks, growth bytes/order.
- Process: RSS, heap, CPU sampling, event-loop lag where observable.
- Integrity: duplicate counts, reconciliation differences (money to 0.01, stock to 0.001), ledger/level deltas.

## 5. Initial risk register (from discovery)

| ID | Risk | Evidence | Phase |
| --- | --- | --- | --- |
| R1 | 5-year volume likely exceeds local disk | 14 GB free; 1.825 M orders plus children/indexes | 4 |
| R2 | Reports load whole ranges into memory | `reports.service.ts:136-147`, max 366 days; 366k orders at target volume | 4 |
| R3 | Concurrent refunds are not serialized | `orders.service.ts:1239-1291` reads refunds without row lock; no conditional claim | 2 |
| R4 | Concurrent add-items can lose a subtotal/stock-plan update | `orders.service.ts:1067-1086` computes from a stale read, guard only checks payment status | 2 |
| R5 | Refund stock restore can run twice | stale `inventoryRestored` read at `orders.service.ts:1294-1315` | 2 |
| R6 | In-process rate limiting and login lockout per account | `rateLimit.ts`, single-instance assumption | 5 |
| R7 | CSP disabled globally on the API | `app.ts:80-86` | 5 |
| R8 | Dashboard repeats large loads (today twice + range) | `reports.service.ts:328-341` | 4 |
| R9 | 6-char random order suffix, no retry on P2002 | `orders.service.ts:95-111` | 2/4 |
| R10 | No database backup/retention automation in repo | deployment docs/scripts | 6 |

Risk levels and fixes are confirmed only after execution.
