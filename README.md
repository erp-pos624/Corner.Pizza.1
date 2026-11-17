# Corner Pizza — Restaurant POS & Management

A production-oriented, desktop-first **restaurant point-of-sale and management
system** for a wood-fired pizza restaurant. Built as an Electron + React client
over a PostgreSQL API, with authoritative server-side pricing, role-based access
control and transactional inventory deduction.

**Brand:** Corner Pizza · **Tagline:** Fresh from the oven, made to be shared.  
**Currency:** EGP · **Timezone:** Africa/Cairo · **Locale:** English (LTR)

## Three applications, one backend

| App        | Folder         | Start              | Address                 |
| ---------- | -------------- | ------------------ | ----------------------- |
| Backend    | `apps/server`  | `pnpm dev:server`  | http://127.0.0.1:4000   |
| Desktop    | `apps/desktop` | `pnpm dev:desktop` | Electron window         |
| Web        | `apps/web`     | `pnpm dev:web`     | http://localhost:5174   |

The web app serves both audiences from one build: `/` is the customer ordering
site and `/dashboard` is the staff dashboard. The staff screens are a lazy
chunk, so customer visitors never download them.

`pnpm dev:all` starts the API, desktop and web. Desktop and web render the same
staff UI (`packages/ui`) and call the same API; see
[docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md),
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/SECURITY.md](docs/SECURITY.md).

## What is implemented

### Point of sale (cashier)

- Three-pane register: category rail, searchable menu grid (name, SKU,
  description, `F2` focus), and the current ticket.
- Pizza sizes with per-size prices, multi-select toppings, special instructions,
  quantities, and live price build-up.
- Dine-in, takeaway and delivery service types, table numbers, guest profiles.
- Map-based delivery zones: pin the customer location, see the matched circular
  zone and fee, and block checkout outside the service radius or below its
  minimum order.
- Authorised discounts from the active discount list, with the cashier cap shown
  in the register.
- Cash, card and mobile-wallet payments; quick-cash denominations, exact amount
  and change calculation.
- Checkout creates the order, payment, invoice and inventory movements in one
  database transaction, then opens the invoice viewer.
- Cashiers can only read their own orders and invoices.

### Kitchen board (kitchen staff)

- Live ticket board polled every five seconds, with automatic arrival alerts and
  overdue highlighting.
- Tabs for new, preparing, ready and completed tickets, with order number,
  products, quantities, sizes, toppings, item notes and the order note.
- Strict workflow: New → Accepted → Preparing → Ready → Completed, enforced on
  the server with concurrency-safe status updates.
- Ticket data is intentionally limited to kitchen-relevant fields; prices,
  payments and customer contact details are never sent to kitchen staff.
- Administrators see the same progress tracker in the staff order detail dialog.

### Menu and catalogue (administrator)

- Categories, menu items, sizes, toppings and discounts.
- Per-item availability, featured flag, kind, SKU, prep time, image URL, food
  cost and recipe multiplier per size.
- Recipe editor linking ingredients to menu items.
- Deleting an item or category used by past orders is blocked (409); mark it
  sold out instead.

### Inventory and suppliers (administrator)

- Ingredient stock, minimum levels, units, supplier and cost per unit.
- Stock value, low-stock indicators, movement ledger, manual adjustments and
  restocking.
- Suppliers CRUD.
- Order checkout deducts recipe quantities × size multiplier × line quantity,
  plus topping ingredient quantities.
- Cancelling an order restores stock exactly once via a cancellation movement.

### Orders, invoices and customers

- Order board with search, status/type/date filters and pagination.
- Legal status transitions only; admins can cancel with a required reason.
- A4 invoice and 80 mm receipt renderings, print through Electron, and PDF
  export for either layout.
- Customer profiles with order history, totals and last-order dates; the server
  blocks deleting customers that have orders.

### Dashboard, reports and administration (administrator)

- Dashboard KPIs, revenue/orders/profit trend, payment mix, category sales, best
  sellers, recent orders, low-stock alerts and audit activity — all aggregated
  from live data.
- Sales report presets (today, 7 days, month, previous month, year) and custom
  ranges, with daily/monthly trends, financial breakdown, category and payment
  splits, best sellers, cashier performance, discounts and ingredient usage.
- Staff accounts: create, edit role/status, reset passwords; administrators
  cannot demote, reset or deactivate their own account in the UI.
- Delivery zones per branch drawn on an interactive Leaflet/OpenStreetMap map:
  radius, delivery fee, minimum order, active toggle and floating fee badges.
- Restaurant settings: identity, tax rate, flat delivery fee (used when a branch
  has no zones), cashier discount cap and receipt footer.

### Online storefront and payments (administrator)

- Public, unauthenticated storefront API under `/api/public`: branch list, live
  menu with stock-derived availability, delivery-zone check, idempotent order
  creation and phone-guarded order lookup.
- Admin → **Online Store** switches ordering on/off per branch, sets optional
  opening hours (cross-midnight supported) and shows today's online orders,
  online revenue and orders awaiting payment.
- Online checkout reuses the POS checkout pipeline — server-side pricing, stock
  checks and invoice numbering — so online orders appear in the POS order list
  and kitchen board with an `ONLINE` badge; the order list has an
  all/in-store/online channel filter.
- Card payments run through the Basata adapter with `PENDING_PAYMENT` →
  `PAID_ONLINE` / `PAYMENT_FAILED` states, signed webhooks (HMAC-SHA256 over the
  raw bytes), idempotent status application and automatic stock restoration on
  failure. Until merchant keys are configured the adapter issues simulated
  intents outside production so the whole lifecycle can be exercised.
- Reports and the dashboard include the POS-vs-online channel split, and the
  report channel filter scopes every metric and export.

## Roles

| Role              | Access                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Administrator** | Everything: dashboard, menu, inventory, suppliers, customers, orders, invoices, reports, staff and settings.          |
| **Cashier**       | Point of sale, own orders, own invoices, customer lookup/create/edit. No menu, inventory, reports, users or settings. |
| **Kitchen staff** | Kitchen board only: view incoming tickets and advance their status. No admin, POS, customer, payment or price access. |

The permission matrix lives in `packages/shared/src/permissions.ts`. It is
enforced **server-side on every protected route** — hiding navigation is only a
convenience. Cashiers additionally cannot cancel orders, exceed the configured
discount cap, or change menu/inventory data.

### Demo accounts

Password for all seeded accounts: **`Pizza@2024`**

| Username  | Name         | Role          |
| --------- | ------------ | ------------- |
| `admin`   | Marco Rossi  | Administrator |
| `cashier` | Layla Hassan | Cashier       |
| `omar`    | Omar Khaled  | Cashier       |
| `kitchen` | Nadia Farouk | Kitchen staff |

## Stack

| Layer     | Technology                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------- |
| Desktop   | Electron 33, React 18, TypeScript (strict), Vite, Electron Forge                               |
| UI        | Tailwind CSS 3, Radix Dialog/Label/Select, TanStack Query 5, Zustand, RHF + Zod, lucide-react  |
| API       | Node.js, Express 4, TypeScript ESM, Pino, Zod, OpenAPI at `/api/docs`                          |
| Data      | PostgreSQL 18 (repo-local cluster, port 55432), Prisma 6, versioned migrations                 |
| Security  | Argon2id, JWT access tokens, rotating hashed refresh tokens, per-IP and per-account throttling |
| Documents | Electron print pipeline, `html2pdf.js` for A4 and 80 mm PDF                                    |
| Testing   | Vitest, React Testing Library, live API and real-renderer verification scripts                 |

Internal package names (`@posshope/*`), the `window.posshope` preload bridge and
the development database name were intentionally retained to avoid breaking
existing tooling or destroying the local database. All user-facing branding and
domain behaviour is Forno/restaurant-specific.

## How to run

### 1. Install the prerequisites

- **Node.js 20.11+** — check with `node --version`.
- **pnpm 9**:
  ```bash
  corepack enable
  corepack prepare pnpm@9.7.0 --activate
  ```
- **PostgreSQL 17+ installed locally**. No running Windows service is needed:
  the repo creates and controls its own isolated cluster in `.dev/pgdata` on
  port **55432**.
  - On Windows the binaries are auto-detected under
    `C:\Program Files\PostgreSQL\<version>\bin`.
  - On macOS/Linux, or a custom install location, point
    `PG_DEV_BIN_DIR` at the PostgreSQL `bin` directory:
    ```bash
    export PG_DEV_BIN_DIR=/usr/local/opt/postgresql@18/bin   # example
    ```
- Free ports: **4000** (API), **5173** (Vite dev server, desktop only) and
  **55432** (repo-local PostgreSQL).

### 2. First-time setup

From the repository root:

```bash
pnpm install
pnpm bootstrap
```

`pnpm bootstrap` is idempotent and does the following:

1. verifies Node and installed dependencies,
2. creates and starts the project-local PostgreSQL cluster on port 55432,
3. creates the `corner_pizza` and `corner_pizza_test` databases,
4. writes `apps/server/.env` with the generated database password and a fresh
   JWT secret (an existing `.env` is never overwritten),
5. applies Prisma migrations to both databases and loads the demo seed.

Use **`pnpm bootstrap`**, not `pnpm setup` (`setup` is a built-in pnpm command
that reconfigures pnpm itself).

### 3. Start the app

```bash
pnpm dev
```

This starts the API and the Electron desktop client together. The Electron
window opens the login screen once the API is ready.

Alternatively, run the pieces in separate terminals:

```bash
pnpm db:start      # start the local PostgreSQL cluster
pnpm dev:server    # API only, http://127.0.0.1:4000
pnpm dev:desktop   # Electron only (expects the API to be running)
```

The API docs are available at `http://127.0.0.1:4000/api/docs`.

### 4. Sign in

Use one of the seeded demo accounts with the shared password **`Pizza@2024`**:

| Username  | Role          |
| --------- | ------------- |
| `admin`   | Administrator |
| `cashier` | Cashier       |
| `omar`    | Cashier       |
| `kitchen` | Kitchen staff |

### 5. Stop everything

Press `Ctrl+C` in the `pnpm dev` terminal, then stop the database:

```bash
pnpm db:stop
```

### Troubleshooting

- **`PostgreSQL binaries were not found`** — install PostgreSQL or set
  `PG_DEV_BIN_DIR` to its `bin` directory before running `pnpm bootstrap`.
- **`Dependencies are not installed`** — run `pnpm install` first.
- **Port 55432 already in use** — stop the other instance with
  `pnpm db:stop`, or start the cluster on another port:
  `PG_DEV_PORT=55433 pnpm bootstrap` (then update `DATABASE_URL` in
  `apps/server/.env` accordingly).
- **Port 4000 already in use** — stop the process using it, or point the
  desktop client elsewhere with `FORNO_API_URL`.
- **Reset the database** — `pnpm db:reset` wipes the local databases,
  re-applies migrations and re-seeds the demo data. This is destructive to
  local data.
- **Desktop cannot reach the API** — set `FORNO_API_URL` (default
  `http://127.0.0.1:4000`) in the environment that starts the desktop app.

## Common commands

```bash
pnpm dev                 # API + desktop
pnpm dev:server          # API only
pnpm dev:desktop         # Electron only

pnpm test                # shared + server + desktop test suites
pnpm typecheck           # all packages
pnpm lint                # ESLint flat config
pnpm build               # shared → server → desktop renderer

pnpm db:start / db:stop / db:status
pnpm db:migrate / db:seed / db:reset
```

The desktop client reads `FORNO_API_URL` (default `http://127.0.0.1:4000`).

## Domain rules that protect money and stock

- **The server owns every price.** The client sends menu item IDs, size IDs,
  topping IDs and quantities only. Unit prices, topping prices, subtotal,
  discount, tax, delivery fee, change and total are computed from the database.
- **Money is decimal.** `NUMERIC(14,2)` in PostgreSQL and fixed two-decimal
  strings on the wire; rounding happens in integer minor units server-side.
- **Checkout is one transaction.** Order, payment, invoice, line-cost snapshots
  and inventory movements commit together or not at all.
- **Stock is deducted once.** `inventoryDeducted` gates deduction; legal
  transitions never deduct again, and cancellation restores the recorded
  movements once.
- **Stock is checked before the sale.** Checkout aggregates recipe and topping
  requirements per ingredient and rejects shortages with `409 INSUFFICIENT_STOCK`
  plus structured `shortages` details. Deductions are conditional atomic updates,
  so two terminals cannot oversell the same ingredient concurrently.
- **Checkout retries are idempotent.** The POS sends a client-generated
  `idempotencyKey` on every attempt; `orders.idempotencyKey` is unique, and a
  replay (including one that loses the insert race) returns the original order
  instead of charging or deducting twice.
- **Temporary passwords are restricted.** A reset/temporary password still signs
  in, but the session may only call `auth/change-password` or `auth/logout`;
  everything else returns `403 PASSWORD_CHANGE_REQUIRED`. The renderer shows a
  blocking change-password screen, and a successful change clears the flag and
  rotates every session token.
- **Discount limits are enforced server-side.** Percentage discounts above
  `maxCashierDiscountPct` are rejected with 403; fixed discounts are capped at
  the subtotal.
- **Reports are real.** Dashboard and report figures aggregate paid,
  non-cancelled orders from PostgreSQL. Profit subtracts ingredient cost plus
  discounts and includes delivery fees; it is never estimated or hardcoded.
- **Every mutation is audited** in `audit_logs` within the same transaction.

## Verification snapshot

Executed against this checkout:

| Check                                                                                                           | Result                       |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `pnpm typecheck`                                                                                                | pass                         |
| `pnpm lint`                                                                                                     | pass (0 problems)            |
| `pnpm test`                                                                                                     | 149 tests passed / 17 files  |
| `pnpm build`                                                                                                    | pass                         |
| Prisma migration status                                                                                         | up to date                   |
| Live API verification, kitchen workflow and RBAC                                                                | 37/37 passed                 |
| Kitchen UI: login, polling alert, tabs, strict status chain, responsive, dark mode                              | 36/36 passed (real renderer) |
| Cashier UI: login, POS, sizes/toppings, cart, tax, checkout, invoice viewer                                     | pass (DOM-verified)          |
| Admin UI: dashboard, reports, menu create/delete, inventory, customers, staff, settings, order progress tracker | pass (DOM-verified)          |
| Online storefront E2E: menu, zone check, order create/replay, lookup, signed webhook, failure path              | pass (live API)              |
| Electron admin UI: online store controls, orders channel filter, kitchen ONLINE tags, reports channel split     | pass (live app)              |

The cashier UI was exercised in a browser harness against the real API:
Margherita Medium (EGP 135.00) with tax produced a total of EGP 153.90; a cash
payment of EGP 200 opened an invoice with EGP 46.10 change, and inventory and
order history reflected it. The admin dashboard and reports rendered live
database aggregates. Visual screenshots were unavailable because the in-app
browser reported a 0×0 hidden viewport; structural and DOM assertions were used
instead of claiming visual verification.

## Known limitations

- The desktop app expects the API at `FORNO_API_URL`; it does not bundle or spawn
  its own PostgreSQL/server.
- `electron-forge make` (Squirrel installer) has not been run and builds are not
  code-signed.
- PDF export supports the A4 invoice and the 80 mm receipt, but the export path
  was not exercised in the browser harness (printing cannot be automated there).
- Automated coverage currently focuses on shared contracts/helpers plus the
  51-check live API script; there is no full browser-E2E test runner in CI.
- Basata runs against the built-in simulated adapter until merchant credentials
  (`BASATA_BASE_URL`, `BASATA_API_KEY`, `BASATA_WEBHOOK_SECRET`) are issued;
  production refuses the simulation unless explicitly overridden.
- Internal package names still use the `@posshope/*` scope (non-user-facing).

## License

UNLICENSED — private project.
