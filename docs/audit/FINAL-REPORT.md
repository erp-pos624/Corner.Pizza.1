# Corner Pizza ERP — Quality Assurance, Load & Five-Year Stability Audit

**Report date:** 2026-11-18
**System:** Corner Pizza POS / ERP monorepo (`apps/server`, `apps/web`, `apps/desktop`, `packages/shared`, `packages/ui`)
**Scope:** functional correctness, business-flow simulation, five-year capacity, load/stress, security, failure recovery, database integrity
**Verdict:** **NOT PRODUCTION READY** at the five-year target volume — see §H

---

## Environment and isolation

| Item | Value |
|---|---|
| Host | Windows 10.0.26300, i7-11800H, 16 logical CPUs, 15.7 GB RAM (5.2 GB free at test start) |
| API runtime | Node 22.18.0, Express 4, Prisma 6.19.3, single process on `127.0.0.1:4110` |
| Database | PostgreSQL 17.6, local cluster `127.0.0.1:55432`, `max_connections=100` |
| Audit database | `corner_pizza_audit` — dedicated copy; dev and test databases untouched |
| Prisma pooling | Default `num_cpus*2+1` = 33; interactive transaction `maxWait` 10 s / `timeout` 20 s |
| Isolation | All writes confined to the audit database and audit-created users/branches. No production system, no Supabase project, no payment provider, and no third-party host was contacted or attacked. |
| Load generator | `apps/server/scripts/audit/*` (Node `fetch`, keep-alive); read stages measured 30 s after warm-up |

Every result below was executed. Anything that could not be executed is listed as **NOT TESTED** in §H with the reason.

**Artifacts**

- `docs/audit/TEST-PLAN.md` — discovery and phase plan
- `docs/audit/results/api-functional.json` — 49 executed API probes
- `docs/audit/results/simulation.json` — 30,000-order recent simulation + reconciliation
- `docs/audit/results/load-read.json`, `load-read-p{1..4}.json`, `load-reports.json`, `load-write.json`, `load-mixed.json`
- `docs/audit/results/security-failure.json` — 14 security and resilience probes
- Harnesses: `scripts/audit/simulate.ts`, `load.mjs`, `security-failure.mjs`, `probe-reports.ts`

---

## A. Executive Summary

| Area | Result |
|---|---|
| Functional API probes | **49 / 49 passed**, 3 informational findings |
| Automated unit/integration suites | **106 / 106 passed** (Vitest, real test DB) |
| Simulated orders (5-year horizon) | 20,000 historical + 30,000 recent = **50,000 orders** in audit DB, 506 MiB |
| Financial / inventory reconciliation | **0 violations** of 11 invariant classes across 50,000 orders |
| Security probes | **14 / 14 passed** (RBAC, lockout, SQLi, XSS reflection, CSRF guard, rate limit, branch isolation) |
| Failure recovery | DB backend kill → 500/503 for ~16 s → automatic recovery, **0 rows lost**; rejected orders leave **0 partial rows** |
| Read throughput ceiling (single instance) | ~130–153 RPS; p50 760 ms @100 users → 3.77 s @500 users |
| Report endpoints | **P1 defect**: 30-day dashboard/sales 5.9–6.3 s single-user; 2 concurrent users → 9.3 s and 4.6 GB RSS; 4 users → 12.8 s + timeout and 7.25 GB RSS; 8+ users → 100 % timeouts |
| Bugs fixed during audit | Kitchen board unbounded/cross-branch (18.1 MB, 4.16 s → 175 KB, 0.10 s); stock-restore deadlock (deterministic lock order) |
| Five-year capacity | Full 1,825,000-order target **NOT TESTED** — projected 15.0–17.9 GiB against 10.8 GiB free and ≈9 h runtime |

**Bottom line.** At its current data volume the system is functionally correct and security-hardened: payments, refunds, inventory restoration, invoicing, idempotency and branch isolation held under concurrency with zero reconciliation violations. It is **not** ready for a business running 1,000 orders/day for five years, because the reporting layer does not scale to a month of orders and the single API process saturates around 130–150 RPS. Both are remediable without redesigning the domain model.

---

## B. Functional Testing

### B.1 Executed API probes (`api-functional.json`)

49 probes across every module, against the audit API with real database. All passed.

| Module | Coverage (representative checks) |
|---|---|
| Platform | `/healthz`, `/readyz` (DB 1 ms); public catalog (6 branches, 55 items, 18 toppings) |
| Auth | wrong password, unknown user, tampered token, unauthenticated access; all four roles sign in; `/auth/me`; refresh rotation and old-token reuse rejection; web-client header requirement; per-account lockout after 5 failures; temporary-password restriction to `change-password`/`logout` |
| RBAC | role matrix denials (6 documented denials); cashier blocked from kitchen, reports, user admin; cross-branch order read denied; audit trail role-guarded |
| Catalog | create ingredient / category / topping / menu item / size / recipe; invalid payload rejection; duplicate SKU uniquification; inactive item rejected at checkout |
| Pricing | quote subtotal + 14 % tax + size/topping surcharges (takeaway 285.00, delivery 156.80); cashier 20 % discount cap (403 above), admin allowed (95.76 total); settings change applied to pricing and restored |
| Orders | atomic create with payment + invoice + stock (999.9 → 999.8); idempotency replay returns same order and blocks a different user; open tab add-items and split-payment settle (273.60); documented status graph (invalid skip rejected); completed order cannot be cancelled; open tab cancel refunds |
| Concurrency | 5 parallel identical creates → 1 order; 5 parallel settles → 1 winner, 4 conflicts; 3 parallel add-items → no lost update (subtotal 480.00); parallel full refunds → 1 accepted, stock restored once; 5 parallel checkouts for last stock unit → 1 success, 4 conflicts |
| Refunds | partial + full, over-refund rejected, double refund rejected (36.80 + 100.00) |
| Inventory | stock adjustment, waste, movement ledger (4 types); stocktake lock; purchase order receive updates stock and average cost; cross-branch transfer both directions; insufficient stock blocks checkout with shortage detail |
| Cash / shifts | shift open, cash movements, close with Z-report (expected 286.80, variance 0.00) |
| Delivery | zone fee resolution (20.00), outside-zone rejection, driver assignment and delivery; driver COD settlement (6 orders, 784.00, variance 0) |
| Payments | simulated card checkout captured exactly once; duplicate webhook ignored; webhook without secret → 503 |
| HR / finance | employee, attendance, adjustment, payroll run (existing 2026-11 run reused); expense creation reflected in summary |
| Reports | dashboard and sales report consistent (179 orders, revenue 90,714.36) |
| Uploads | non-image rejected; image upload returns 503 when storage is unconfigured (expected in audit env) |
| Injection | SQLi strings in login, filters and public menu treated as literals |

**Informational (not defects):**

- Foreign `Origin` returns 200 outside production — intentional (CORS hardening applies in production config).
- Catalogue sample: 55 items / 18 toppings.
- Payroll: November run pre-existed; the probe validated the existing run rather than creating a duplicate.

### B.2 Automated suites

- `pnpm test` in `apps/server`: **106/106 passed**, including new regression suites:
  - `tests/kitchen.queue.test.ts` — branch scoping + today-bounding (3 tests)
  - `tests/orders.concurrency.test.ts` — parallel refunds, deadlock-free multi-ingredient cancels, parallel tab adds (3 tests)
- Suites run against `corner_pizza_test`; no suite was skipped, deleted or weakened.

### B.3 Not covered here

Browser E2E (no Playwright/Cypress harness exists in the monorepo), real payment gateway, real object storage, and multi-instance behavior are **NOT TESTED** (§H).

---

## C. Five-Year Business Simulation

The simulator drives the **real service layer** (quote → create → pay/settle → kitchen status → delivery → cancel/refund) with backdated timestamps, so it exercises pricing, invoicing, stock movements, refunds and reporting exactly as production does. It does not bulk-insert rows.

### C.1 Configuration

| Run | Orders | Sampling | Horizon | Concurrency |
|---|---|---|---|---|
| Historical | 20,000 | 20 business days × 1,000, evenly spread | 1,825 days (2021-11-19 → late 2026) | 12 |
| Recent | 30,000 | 30 consecutive business days × 1,000 | 2026-10-19 → 2026-11-17 (last 30 days) | 12 |

Business mix: 45 % takeaway, 40 % delivery, 15 % dine-in; intra-day timestamps drawn from lunch/dinner-weighted windows; cash, card and wallet payments; random discounts; cancels and refunds.

### C.2 Results — recent run (`simulation.json`)

| Counter | Value |
|---|---|
| Created / failed | 30,000 / **0** |
| Settled | 4,526 |
| Completed | 6,839 |
| Delivered | 4,763 |
| Cancelled | 338 |
| Refunded | 800 |
| Step errors | 19 (6 cancel, 13 refund) — 0.063 %, all Prisma 20 s transaction timeouts, cleanly rolled back |
| Throughput | **57.6 orders/s** (521 s for 30,000 at concurrency 12) |
| Create latency | p50 52 ms / p95 165 ms / p99 280 ms |
| Settle latency | p50 65 ms / p95 189 ms |
| Event latency (cancel/refund/status) | p50 77 ms / p95 234 ms / p99 4,295 ms |
| Revenue recorded | 13,647,784.53 (incl. tax 1,635,629.08; discounts 149,578.55; delivery 329,100.00) |
| Payment split | CASH 14,990 · CARD 12,694 · WALLET 2,316 |
| Order states | 18,297 pending/open, 11,365 completed, 338 cancelled |

The historical 20,000-order run completed with **zero step errors** at **58.3 orders/s** and the same zero-violation reconciliation.

### C.3 Reconciliation (both runs)

| Invariant | Violations |
|---|---|
| Order total = subtotal − discount + tax + delivery | 0 |
| Payments vs order total (captured / refunded) | 0 |
| Refund sum vs refund records | 0 |
| Over-refund above captured amount | 0 |
| Ingredient stock on hand vs ledger | 0 |
| Stock restored more than once | 0 |
| Orphan payments / items / invoices | 0 |
| Duplicate order numbers / invoice numbers | 0 |

Final audit DB state: **50,000 orders**, 99,990 order items, 46,116 invoices, 1,916 refunds, 1,916 credit notes, 387,033 stock movements, **506 MiB**.

### C.4 Storage projection and the 1,825,000-order target

| Run | Bytes / order | Projected 1,825,000 orders | Free disk at test |
|---|---|---|---|
| Historical | 10,547 | 19.25 GB (17.9 GiB) | ≈11.0 GiB |
| Recent | 8,853 | 16.16 GB (15.0 GiB) | 10.8 GiB |

At ~58 orders/s the full target would take **≈9 hours** of continuous writes and **exceed the free space of the audit volume by 40–65 %**. Running it would have filled the disk and endangered the host, so the full five-year load is **NOT TESTED**; the measured per-order footprint and the two scaled runs are the evidence base instead. Capacity planning: provision ≥40 GB for the database plus indexes/WAL at this order mix, or add archival.

### C.5 Defect surfaced by the simulation

19 of 30,000 mutations failed with `Transaction already closed … 20000 ms` (refunds/cancels under concurrency 12). Every failure rolled back completely — no partial refund, no double restore, reconciliation still zero. Root cause and remediation in §G/P2.

---

## D. Performance, Load and Stress

### D.1 Single-request latency (30,000 orders in the reporting range)

| Endpoint | Payload | Time |
|---|---|---|
| `GET /orders` (page) | 51 KB | 66 ms |
| `GET /public/menu` | — | 64 ms |
| `GET /reports/dashboard` (7 days) | — | 1.33 s |
| `GET /reports/dashboard` (30 days) | — | 5.85–6.27 s |
| `GET /reports/sales` (30 days) | — | 6.27 s |
| `GET /kitchen/orders` **before fix** | 18,108,129 B | 4.16 s |
| `GET /kitchen/orders` **after fix** | 175,632 B | 0.10 s |

Instrumentation of the report path: SQL `count` 63 ms, minimal ID fetch 312 ms, full Prisma graph fetch **3.23 s**, in-process scan 40 ms. The database is not the bottleneck; Prisma materialisation of the full order graph is (§G/P1).

### D.2 Read load (orders list + public menu, 30 s stages)

| Users | Requests | RPS | p50 | p95 | p99 | Throttled | Server 5xx | DB active peak | RSS peak | CPU |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 3,973 | 129.8 | 760 ms | 890 ms | 944 ms | 0 | 0 | 17 | 302 MB | 277 % |
| 250 | 4,158 | 132.3 | 1,881 ms | 2,062 ms | 2,211 ms | 0 | 0 | 16 | 325 MB | 280 % |
| 500 | 5,025 | 152.9 | 3,770 ms | 4,665 ms | 6,408 ms | 0 | 0 | 18 | 388 MB | 281 % |

- Throughput plateaus at ~130 RPS between 100 and 250 users while latency doubles: the **single Node process is the ceiling**, not PostgreSQL (18 of 100 connections used, 0 lock waits, 0 deadlocks).
- At 500 users the generator recorded 846 failed sockets (HTTP status 0). Statuses show only 0 and 200 — **no server error was returned**. These are client-harness/Windows socket-exhaustion failures, not API failures, and they cap the validity of the 500-user number. The server-side capacity point to quote is **≈130–150 RPS**.
- Four independent 100-user clients in parallel summed to ≈216 RPS, 1,877 client-side `fetch failed`, zero server 5xx, RSS ≤ 397 MB, CPU ≈ 270 %. Same harness limit, same conclusion: scale out, don't tune the client.

### D.3 Report load (dashboard 60 % + sales 40 %)

| Report users | Completed | p50 | Timeouts | Server RSS |
|---|---|---|---|---|
| 2 | 6 | 9.27 s | 0 | 4.62 GB |
| 4 | 7 | 12.77 s | 1 | **7.25 GB** |
| 8 | 8 | 20.01 s | 8 | ~6.3 GB |
| 16 | 16 | 20.01 s | 16 | ~4.0 GB |

At 4 concurrent report users the process holds 7.25 GB of the host's 15.7 GB — on a 1 GB cloud function this would OOM after the first month of data. This is the audit's most serious scalability finding (§G/P1).

### D.4 Write and mixed load

- **Write profile** (25 users): 90 orders created (201), then order-creation throttle closed; 107,650 `429`s; 23 quotes accepted, 26,764 throttled; **0 errors, 0 timeouts**, DB active ≤ 1. Rate limiting works as designed; 90 orders/min is the configured cap.
- **Mixed profile** (100 users, 15 s): 156.2 RPS, p50 631 ms, p95 834 ms, p99 2,209 ms; 40 creates (87 throttled), 259 total 429s; **0 errors**; lock wait peak 11, deadlocks 0.
- Mixed profile at 250/500 users: **NOT TESTED** — the first attempt exceeded the 4-minute harness timeout under write-throttle churn; read findings already cover those user counts.

---

## E. Security Review (non-destructive, isolated)

All 14 probes passed. No exploitation tooling was run against any external system.

| Check | Result |
|---|---|
| Kitchen board branch isolation | Branch-B staff saw 0 tickets; admin saw 288 |
| RBAC: kitchen / reports / users | 403 for cashier in all three |
| Account lockout (5 schema-valid failures) | 401 + `lockedUntil` set |
| SQL injection: login | 401 (literal credentials) |
| SQL injection: order filters | 200, parameters bound |
| SQL injection: public menu branch | 404, 0 items |
| Reflected markup | `application/json` only; no HTML reflection |
| CSRF: refresh cookie | 403 without `x-forno-client: web`; 401 with it |
| Login rate limit (per IP) | 10 × 401 then 14 × 429 |
| Data exposure | Kitchen DTO omits prices/payment/customer phone (verified in functional probe) |
| Session design | Argon2id (19 MiB, t=2, p=1, 32-byte), rotating hashed refresh tokens, per-session revocation, bearer-only mutations |
| Temporary password | Restricted to `change-password` / `logout` |
| Uploads | Non-image rejected; storage-absent path returns 503 |
| Secrets | Never printed or transmitted during this audit |

**Observations (not failures):**

- Rate limiting is **in-process and per-IP**. With multiple API instances the limits multiply, and behind a proxy every client shares one IP unless `trust proxy` is configured. Recommendation: shared limiter (Redis) at scale, and an explicit trusted-proxy setting.
- Foreign-origin requests are allowed outside production by design; confirm the production allow-list covers the storefront and desktop origins, including `file://`/custom-scheme handling for Electron.
- Session fixation/rotation on privilege change is covered (password changes revoke all sessions); OAuth/SSO and MFA do not exist, so they were not tested.

---

## F. Database Integrity

| Property | Evidence |
|---|---|
| Atomic order creation | Payment, invoice, stock plan and audit written in one transaction; rejected quote/create left 50,000 → 50,000 rows |
| Idempotency | 5 parallel creates → 1 order; replay returns 201 with the same ID |
| Conditional state claims | 5 parallel settles → 1 winner; parallel refunds → 1 effective, stock restored once |
| Lock ordering | Stock consumption and restoration now sort ingredient IDs; 8 concurrent multi-ingredient cancels → 0 deadlocks |
| Referential integrity | 0 orphan payments/items/invoices; FK constraints active |
| Uniqueness | 0 duplicate order or invoice numbers across 50,000 orders |
| Money precision | NUMERIC(14,2) throughout; reconciliation exact to the cent |
| Concurrency pressure | 0 deadlocks in all load runs; lock-wait peak 11 (mixed), 0 (read/report) |
| Outage behavior | Backend terminated mid-run: 500/503 contained, `/readyz` recovered in **16.1 s**, row counts unchanged (50,000 → 50,000) |
| Storage | 8.9–10.5 KB/order; 506 MiB for 50,000 orders |

**Retention.** There is no archival or partitioning strategy for `orders`, `stock_movements` or sessions. At 1,825,000 orders the projected 15–18 GB is manageable on a properly sized managed instance, but reporting queries and backups will degrade. Recommend monthly partitioning of orders/movements plus a cold-archive policy; **backup/restore was NOT TESTED** (no backup tooling exists in this environment).

---

## G. Bugs and Fixes

### Fixed during the audit

**G1 — Kitchen board loaded the entire order history across all branches (high).**
`listKitchenOrders` had no date bound and ignored the actor's branch, returning 18.1 MB / 4.16 s for 21k historical orders and leaking other branches' tickets. Fixed by scoping to the actor's branch and to tickets created today plus completed today (`kitchen.service.ts:31`), reducing the response to 175 KB / 0.10 s. Regression: `tests/kitchen.queue.test.ts` (branch scoping, today bounding, admin unscoped but still bounded).

**G2 — Concurrent cancellations/refunds could deadlock on ingredient stock (critical).**
Restoration locked ingredient rows in cart order while consumption sorted them, so two orders touching the same ingredients in different orders could deadlock. Fixed by sorting ingredient IDs before locking in `restoreOrderStock`, matching `consumeStock`. Regression: `tests/orders.concurrency.test.ts` — 8 parallel multi-ingredient cancels, parallel refunds restore exactly once.

**G3 — Audit harness backdating (test-tooling only).**
The simulator backdated only the first sampled days and spread orders ~11/day across 1,825 days. Fixed to group by day index and sample distinct business days (20 × 1,000 historical, 30 × 1,000 recent). This affected only the audit harness, not product code.

### Open defects

**G4 / P1 — Reporting endpoints do not scale beyond ~2 concurrent users (high).**
*Root cause:* `reports.service.ts` loads the full order graph (items, payments, refunds, cashier) through Prisma and aggregates in JavaScript. At 30,000 orders in range: 12 ms of SQL, 3.23 s of Prisma materialisation, 40 ms of scanning. Each concurrent report holds its own multi-GB object graph (RSS 4.6 GB at 2 users, 7.25 GB at 4).
*Impact:* month-end dashboard/sales take 6 s single-user, time out at 8+ users, and risk OOM in a memory-limited deployment; at 1,000 orders/day the 30-day range is the normal view.
*Recommended fix (not applied in this audit):* move aggregation to SQL (`GROUP BY` daily buckets, sums/refunds by join, indexed `(branch_id, created_at)` and `(payment_status, created_at)`), return only aggregates, cap ranges, and add characterization tests pinning current figures before the rewrite. Do not "optimize" this without those tests — the current totals are correct.

**G5 / P2 — 20 s interactive transaction ceiling under concurrent order mutation (medium).**
13 refunds and 6 cancels of 30,000 failed at concurrency 12 with `Transaction already closed … 20000 ms`; every failure rolled back cleanly, reconciliation stayed zero. Cause: long interactive transactions (stock upserts per ingredient, alert sync, invoice/credit-note writes, audit) at high contention.
*Recommended fix:* batch stock updates into one `UPDATE … FROM (VALUES …)`, move alert synchronisation after commit, and shorten the transaction to the minimum write set; re-run `orders.concurrency.test.ts` plus the simulator to confirm the error count drops to zero.

**G6 / P3 — Read path saturates at ~130–150 RPS on one process (medium).**
CPU ~280 % and flat throughput from 100→250 users with p50 doubling. Node single-process serialization of 50 KB orders pages is the limit; PostgreSQL is idle (≤18 connections, 0 lock waits). *Recommendation:* run the API as multiple instances/workers behind a load balancer, move rate-limit state to a shared store, and re-measure at 500+ users. Multi-instance behavior is **NOT TESTED**.

**G7 / P3 — Host validation limit, not a product defect.** 500-user and parallel-client runs produced client-side `fetch failed` (status 0) with no server 5xx. Do not read those failures as API errors; re-run from a dedicated load generator for authoritative >250-user figures.

---

## H. Final Verdict and Not-Tested Register

### Verdict: **NOT PRODUCTION READY** (for the stated five-year, 1,000 orders/day target)

Reasoning against the requested criteria:

1. **Capacity:** the report layer collapses at the data volume a five-year business produces (30 days = 30,000 orders): 6 s single-user, multi-GB memory per concurrent user, timeouts at 8 users. On a 1 GB-class deployment this is an OOM, not a slowdown.
2. **Throughput headroom:** one process caps at ~130–150 RPS; 500-user behavior and horizontal scaling are unverified.
3. **Transaction resilience:** 0.06 % of order mutations still exceed the 20 s transaction ceiling under concurrency 12 (clean rollback, but customer-visible failures).
4. **Validation gaps:** no browser E2E suite, no backup/restore drill, no real payment-gateway or object-storage integration test.

What *is* production-grade: domain correctness, financial and inventory integrity (zero violations across 50,000 orders and all concurrency probes), RBAC/branch isolation, authentication hardening, idempotency, and failure containment. At today's volume (≤50k orders, single instance, light reporting) it would rate **PRODUCTION READY WITH MINOR ISSUES**. The blocking gap is scale, not correctness.

### Required before a production sign-off

1. Rewrite report aggregation in SQL with characterization tests (G4).
2. Shorten order-mutation transactions and eliminate the 20 s timeouts (G5).
3. Load-test a multi-instance deployment with a shared rate limiter (G6).
4. Size storage for ≥40 GB (or archive) and run a restore drill.
5. Re-run this audit's functional and concurrency suites at 1.825 M orders, or at minimum at 100k+ with reports enabled.

### NOT TESTED (with reasons)

| Item | Reason |
|---|---|
| Full 1,825,000-order workload | Projected 15–18 GiB > 10.8 GiB free; ≈9 h runtime; would fill the disk |
| Mixed write/read profile at 250 and 500 users | Harness exceeded 4-minute limit under throttle churn |
| Horizontal / multi-instance scaling | Single-process audit environment |
| Real cloud network, Supabase, serverless memory limits | Local-only audit; production was not touched |
| Payment gateway / webhook signing end-to-end | Only the in-repo simulated gateway exists; no live credentials used |
| Browser E2E and visual regression | No Playwright/Cypress harness in the monorepo; UI not exercised |
| Object storage under load | Storage unconfigured in audit environment (upload validation only) |
| Backup and restore | No backup tooling available in this environment |
| Restart with in-flight requests / failed background jobs | No job queue in the system; restart tested only for limiter reset |
| Multi-tenant/franchise isolation beyond branch scoping | Not part of the implemented model |
| DDoS, real penetration testing, social engineering | Out of scope; non-destructive probes only, no third parties |

### Reproduce

Start the audit API against the isolated database (values from `apps/server/.env`, DB name swapped; nothing is printed):

```bash
cd apps/server
set -a && . .env && set +a
export DATABASE_URL="${DATABASE_URL%/*}/corner_pizza_audit" PORT=4110 NODE_ENV=test HOST=127.0.0.1
node --import tsx src/index.ts
```

Then run the harnesses in `apps/server/scripts/audit/` (`simulate.ts`, `load.mjs`, `security-failure.mjs`); each documents its arguments at the top of the file, and each writes JSON into `docs/audit/results/`.
