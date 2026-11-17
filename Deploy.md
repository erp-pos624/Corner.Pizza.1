# Deploy map — Corner Pizza POS

How to get from this repository to a running restaurant setup, and how to export
the Windows `.exe` for the desktop app.

For reverse-proxy details (Caddy, separate API origin, customer-site isolation)
see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). For the hardening checklist see
[docs/SECURITY.md](docs/SECURITY.md).

## The map

```
                        ┌──────────────────────────────┐
                        │  BUILD MACHINE (Windows)     │
                        │  pnpm install                │
                        │  pnpm build:shared           │
                        └──────┬───────────────┬───────┘
                               │               │
              server + web build               desktop make
                               │               │
                               ▼               ▼
┌───────────────────────────────────┐   ┌──────────────────────────────┐
│  SERVER PC (one per restaurant)   │   │  CornerPOS-Setup.exe         │
│                                   │   │  (copy to each terminal)     │
│  PostgreSQL  ◄── prisma migrate   │   └──────────────┬───────────────┘
│      ▲                            │                  │ install
│      │ DATABASE_URL               │                  ▼
│  API server  :4000                │   ┌──────────────────────────────┐
│  (apps/server/dist/index.js)      │◄──┤  TERMINALS (cashier/kitchen) │
│      ▲                            │   │  Corner Pizza desktop app    │
│      │ /api proxy                 │   │  FORNO_API_URL=http://       │
│  Web site (apps/web/dist)         │   │     <server-ip>:4000         │
│  customers + /dashboard           │   └──────────────────────────────┘
└───────────────────────────────────┘
```

The important fact: **the desktop `.exe` is only a client.** It does not contain
the database or the API. An installed terminal shows "server unreachable" until
it can reach an API server, so deploy in this order:

1. Database
2. API server
3. Desktop `.exe` on each terminal
4. Web site (only if you want online ordering / the browser dashboard)

## 0. Prerequisites (build machine)

| Tool       | Version                | Check            |
| ---------- | ---------------------- | ---------------- |
| Node.js    | 20.11 or newer         | `node --version` |
| pnpm       | 9.7.0                  | `pnpm --version` |
| PostgreSQL | 16 or newer            | on the server PC |
| Windows    | needed for the `.exe`  | —                |

```powershell
corepack enable
corepack prepare pnpm@9.7.0 --activate
pnpm install --frozen-lockfile
```

All commands below run from the repository root (`Pizza-Shope/`).

## 1. Database (server PC)

Install PostgreSQL, then create a database and a dedicated role:

```sql
CREATE ROLE corner_pos LOGIN PASSWORD 'a-strong-password';
CREATE DATABASE corner_pos OWNER corner_pos;
```

Create `apps/server/.env` (copy `apps/server/.env.example`) and set at least:

```ini
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
DATABASE_URL="postgresql://corner_pos:a-strong-password@127.0.0.1:5432/corner_pos?schema=public"
JWT_SECRET="<random string, 32+ characters>"
CORS_ORIGINS=https://your-web-origin.example
```

- `HOST=0.0.0.0` lets LAN terminals reach the API directly. Use `127.0.0.1`
  if everything sits behind a reverse proxy on the same machine.
- The server refuses to start in production with the default `JWT_SECRET`.
- Serving the web app over plain HTTP on the LAN? Add `WEB_COOKIE_SECURE=false`.

Apply the schema:

```powershell
pnpm --filter @posshope/server db:deploy
```

`db:deploy` only applies pending migrations. On a brand-new, empty database you
can load the demo menu and accounts once with `pnpm db:seed`, then change every
password (all seeded accounts use `Pizza@2024`).

> **Never run on a database with real data:** `pnpm db:seed`, `pnpm db:reset`
> or `pnpm db:migrate`. The seed deletes all orders, stock and menu data first.

## 2. API server (server PC)

```powershell
pnpm build:shared
pnpm --filter @posshope/server build
cd apps/server
node dist/index.js
```

The server reads `apps/server/.env` on its own. Keep the whole repository
checkout (with `node_modules`) on the server PC — `dist/index.js` still loads
Prisma and argon2 from `node_modules`.

Check it:

- `http://<server-ip>:4000/readyz` → should report ready (includes the database)
- `http://<server-ip>:4000/api/docs` → API documentation

To make it permanent:

- Run it under a process manager so it restarts on failure and on boot
  (NSSM or PM2 on Windows, systemd on Linux).
- Open the port for the LAN (PowerShell as Administrator):

  ```powershell
  New-NetFirewallRule -DisplayName "Corner POS API" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
  ```

- Give the server PC a fixed IP address (e.g. `192.168.1.10`).

## 3. Desktop app — installers

Packaged builds talk to the deployed API at
`https://corner-pizza.vercel.app`. `pnpm dev` still uses
`http://127.0.0.1:4000`, and `FORNO_API_URL` overrides both — it is read when
the app starts, so set it on the terminal (not the build machine) only for a
LAN or self-hosted server.

### Windows

On a **Windows** build machine:

```powershell
pnpm build:shared
pnpm --filter @posshope/desktop make
```

Output:

| File                                                                  | What it is                                        |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| `apps/desktop/out/make/squirrel.windows/x64/CornerPOS-Setup.exe`      | **Installer** — give this to each terminal        |
| `apps/desktop/out/make/zip/win32/x64/CornerPOS-win32-x64-0.1.0.zip`   | Portable ZIP — unzip and run, no install          |
| `apps/desktop/out/CornerPOS-win32-x64/corner-pos.exe`                 | Unpacked app — runs in place, needs its whole folder |

Only need the unpacked app, no installer? This is faster:

```powershell
pnpm --filter @posshope/desktop package
```

A portable Linux ZIP can also be produced from Windows:

```powershell
pnpm --filter @posshope/desktop exec electron-forge make --platform=linux --arch=x64 --targets @electron-forge/maker-zip
```

→ `apps/desktop/out/make/zip/linux/x64/CornerPOS-linux-x64-0.1.0.zip`

### Linux and macOS

`.deb`/`.rpm` need Linux packaging tools and the `.dmg` needs macOS, so those
build on their own OS. The **Desktop release** workflow does all three in one
run: on GitHub open **Actions → Desktop release → Run workflow** (or push a tag
such as `desktop-v0.1.0`), then download the artifacts:

| Artifact            | Contains                                    |
| ------------------- | ------------------------------------------- |
| `corner-pos-windows` | `CornerPOS-Setup.exe`, portable ZIP        |
| `corner-pos-linux`   | `.deb`, `.rpm`, portable ZIP               |
| `corner-pos-macos`   | `.dmg`, portable ZIP                       |

Notes:

- `corner-pos.exe` cannot be copied on its own; it needs the DLLs and the
  `resources/` folder next to it. Ship the installer or the ZIP.
- To change the version, edit `version` in `apps/desktop/package.json` before
  running `make`.
- To change the icon, replace `apps/desktop/build/icon.png` and `icon.ico`
  (`pnpm --filter @posshope/desktop icons` regenerates them); the macOS
  workflow step derives `icon.icns` from `icon.png`.
- The builds are not code-signed, so Windows SmartScreen shows "Windows
  protected your PC" on first run (**More info → Run anyway**) and macOS
  Gatekeeper blocks the first open (**right-click the app → Open**). Remove
  that with a Windows/Apple code-signing certificate.

### Install on each terminal

1. Copy `CornerPOS-Setup.exe` to the terminal and run it. It installs per-user
   into `%LocalAppData%\corner_pos\` and adds a Start-menu shortcut.
2. The app already points at the production API, so nothing else to set up.
   Only for a LAN server, set the address in a terminal run as Administrator:

   ```powershell
   setx FORNO_API_URL "http://192.168.1.10:4000" /M
   ```

   Close and reopen the app (sign out of Windows and back in if it still uses
   the old value).

Per-terminal data (login session, terminal ID) lives in
`%AppData%\Corner Pizza\`. Uninstall from **Settings → Apps → corner_pos**.

## 4. Web site (optional)

```powershell
pnpm --filter @posshope/web build
```

Output is static files in `apps/web/dist`. Serve them from any web server and
forward `/api`, `/readyz` and `/healthz` to the API **on the same origin**;
unknown paths must fall back to `index.html`. `/` is the customer ordering
site, `/dashboard` is the staff dashboard. A ready-made Caddy config is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#3-web).

Before taking real online orders, set the `BASATA_*` payment keys in
`apps/server/.env`; without them card payments are simulated, and production
refuses the simulation.

## 5. Updating later

1. Back up the database: `pg_dump -U corner_pos corner_pos > backup.sql`
2. Pull the new code, then `pnpm install --frozen-lockfile`
3. `pnpm --filter @posshope/server db:deploy`
4. Rebuild and restart the API (step 2)
5. Bump the desktop version, run `make`, reinstall `CornerPOS-Setup.exe` on the
   terminals (there is no auto-update)
6. Rebuild and re-upload the web site if it is deployed

## 6. Cloud deployment — Vercel + Supabase

The repository ships a [vercel.json](vercel.json) that deploys the web site
and the API together as two Vercel Services under one domain. Same origin is
required: the browser refresh cookie is `SameSite=Strict` and scoped to
`/api/v1/auth/web`.

```
https://<project>.vercel.app/            → web service (apps/web)
https://<project>.vercel.app/api/v1/...  → api service (apps/server)
https://<project>.vercel.app/readyz      → api service
```

### 6.1 Supabase database

1. Create a Supabase project (region closest to the restaurant).
2. Copy both connection strings from **Project Settings → Database →
   Connection string**:
   - **Transaction pooler** (port `6543`, add `?pgbouncer=true&connection_limit=1`):
     use it as `DATABASE_URL`.
   - **Session/direct connection** (port `5432`): use it as `DIRECT_URL`.
3. Apply the schema from the repo root:

   ```powershell
   $env:DATABASE_URL = "<session connection string>"
   pnpm --filter @posshope/server db:deploy
   ```

   Or put `DIRECT_URL` in `apps/server/.env` and run
   `pnpm --filter @posshope/server db:deploy:direct`.

4. Seed once on an empty database if you want the demo menu and accounts:
   `pnpm --filter @posshope/server db:seed` (destroys existing data — never on
   a live database).

### 6.2 Supabase Storage images

1. Use the same Supabase project that hosts the database.
2. Create the public bucket once (reads `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` from the environment or the repo-root
   `.env.local` pulled by Vercel):
   `pnpm --filter @posshope/server storage:setup`
   This creates `menu-images` (public, 200 KB limit, JPEG/PNG/WebP only).
3. In the menu item editor, use **Upload image** next to the URL field. The
   browser downscales and re-encodes to WebP until the file fits 200 KB; the
   API stores it in Supabase Storage and saves the public URL on the menu item.
   Pasting an external URL still works.

### 6.3 Vercel environment variables

Set these for Production (and Preview if you want preview deployments to
work). `JWT_SECRET` must be a unique random string of 32+ characters.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler URL (`:6543`) |
| `JWT_SECRET` | random 32+ character secret |
| `SUPABASE_URL` | injects automatically with the Vercel Supabase integration |
| `SUPABASE_SERVICE_ROLE_KEY` | injects automatically with the Vercel Supabase integration |
| `SUPABASE_MENU_BUCKET` | optional, defaults to `menu-images` |
| `CORS_ORIGINS` | `https://<project>.vercel.app` (same origin is always trusted) |
| `BUSINESS_TIMEZONE` | `Africa/Cairo` (or the restaurant's timezone) |

`DIRECT_URL` is only needed for migrations, not by the deployed function.
`NODE_ENV=production` and the `Secure` cookie flag are automatic on Vercel.

Deploy from the repository root:

```powershell
npx vercel link
npx vercel env add DATABASE_URL production
npx vercel env add JWT_SECRET production
npx vercel --prod
```

Then check `https://<project>.vercel.app/readyz` reports
`"database": { "ok": true }`, and sign in at `/dashboard`.

### 6.4 Serverless notes

- Function request bodies are capped at 4.5 MB by Vercel; the upload UI
  compresses images to fit 200 KB, and the API rejects anything larger after
  decoding.
- The local filesystem is read-only, so nothing is written to disk — all
  images go to Supabase Storage and all data to Supabase Postgres.
- The API runs on Prisma's RHEL engine (`binaryTargets` in
  `apps/server/prisma/schema.prisma`) because Vercel's Node runtime is Amazon
  Linux 2023.
- File uploads and screenshots are stored in Supabase Storage, not on Vercel.


## Checklist

- [ ] Database backup taken
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] `db:deploy` applied; `GET /readyz` reports ready
- [ ] `JWT_SECRET` is unique; demo passwords changed
- [ ] `CornerPOS-Setup.exe` installed and `FORNO_API_URL` set on every terminal
- [ ] Sign in on a terminal, place and cancel a test order, confirm stock returned

## Troubleshooting

| Symptom                                         | Fix                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Desktop app says the server is unreachable      | Check `FORNO_API_URL`, open `http://<server-ip>:4000/readyz` in a browser on that terminal, check the firewall rule |
| Server exits with `JWT_SECRET must be set`      | Set a real `JWT_SECRET` in `apps/server/.env`                                               |
| Server exits with `DATABASE_URL is required`    | `apps/server/.env` is missing or not next to `dist/`                                        |
| `make` fails resolving Electron or dependencies | Keep `node-linker=hoisted` in `.npmrc`, delete `node_modules`, run `pnpm install` again     |
| `make` fails on `@posshope/shared`              | Run `pnpm build:shared` first                                                               |
| SmartScreen blocks the installer                | **More info → Run anyway** (build is unsigned)                                              |
