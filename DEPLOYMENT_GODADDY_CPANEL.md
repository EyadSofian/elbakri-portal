# Deploying Elbakri Portal on GoDaddy (cPanel Node.js App)

This guide covers deploying the Node/Express/Prisma backend + static portal to
GoDaddy shared/business hosting using the **Setup Node.js App** tool in cPanel
(Phusion Passenger). VPS notes are at the end.

> The app also still runs on Railway unchanged — nothing here breaks that.

---

## 0. Can this plan run Node?

GoDaddy can run this app **only** if cPanel shows **"Setup Node.js App"** (a.k.a.
*Application Manager*) under the **Software** section. This is available on most
**Business / Deluxe / Ultimate Linux cPanel** plans, **not** on the cheapest
"Web Hosting Starter" or on Managed WordPress.

- ✅ If you see **Setup Node.js App** → follow this guide.
- ❌ If you do **not** see it → this Express backend cannot run on that plan.
  Use a **GoDaddy VPS** (see the end) or keep the backend on Railway/a VPS and
  point your GoDaddy domain's DNS at it.

You also need outbound access from the host to:
- your **PostgreSQL** database (port 5432), and
- your **SMTP** server (port 587) for emails.

---

## 1. Prerequisites

| Item | Value |
|---|---|
| Node.js version | **20** (select in the Node app dropdown; the app requires `>=18 <=20`) |
| Startup file | `dist/app.js` |
| Application root | the folder you upload the project into, e.g. `elbakri-portal` |
| Application URL | your domain or subdomain, e.g. `portal.yourdomain.com` |
| Database | PostgreSQL reachable from GoDaddy (Neon/Railway public URL, or a DB you host) |

---

## 2. Required environment variables

Set these in the Node.js App screen ("Environment variables"). **Never commit real values.**

**Required (the app refuses to boot in production without them):**

| Variable | Example / Notes |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` (must be reachable from GoDaddy) |
| `JWT_SECRET` | long random string (≥32 chars) — **not** the `.env.example` placeholder |
| `REFRESH_TOKEN_SECRET` | a *different* long random string |
| `BASE_URL` | `https://portal.yourdomain.com` (final domain, https, **not** localhost) |

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**Email (recommended — notifications are skipped/fail without them):**

| Variable | Example |
|---|---|
| `SMTP_HOST` | `smtp.yourprovider.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `bookings@yourdomain.com` |
| `SMTP_PASS` | app password |
| `FROM_EMAIL` | `"Elbakri Overseas <bookings@yourdomain.com>"` |
| `INTERNAL_TEAM_EMAIL` | ops inbox for booking notifications |

**Storage (recommended to set explicitly):**

| Variable | Value |
|---|---|
| `UPLOAD_DIR` | `./uploads` (public images, served at `/uploads`) |
| `PRIVATE_UPLOAD_DIR` | `./uploads-private` (passports/tickets — never served publicly) |
| `PDF_DIR` | `./generated` (invoice/voucher PDFs) |

**Optional:** `JWT_EXPIRES_IN` (default `1h`), `RECEPTION_NOTIFY_EMAIL`,
`TRANSPORT_NOTIFY_EMAIL`, `INVOICE_BANK_NAME` / `INVOICE_BANK_ACCOUNT` /
`INVOICE_BANK_IBAN` / `INVOICE_BANK_SWIFT`, `COMPANY_CONTACT_LINE` /
`COMPANY_PHONE` / `COMPANY_EMAIL`, `ELBAKRI_VOUCHER_CONTACT`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_SHEETS_ID`,
`APIFY_TOKEN`, `FX_API_URL`.

> Do **not** set `PORT` — cPanel/Passenger assigns it and the app reads `process.env.PORT`.

---

## 3. Build & migrate commands

Run these from the app's **Terminal** (cPanel → Terminal, or the "Run NPM install" /
"Run JS script" buttons in the Node app screen), from the application root:

```bash
npm ci
npm run build            # runs `prisma generate` THEN `tsc` — one step is enough
npx prisma migrate deploy   # applies pending migrations ONCE (safe, additive)
```

- `npm run build` already generates the Prisma client before compiling — you do
  **not** need to run `prisma generate` separately.
- `prisma migrate deploy` only applies committed migrations. **Never** run
  `prisma migrate reset` or a seed script against production data.

---

## 4. Step-by-step in cPanel

1. Log in to **GoDaddy** → your hosting → **cPanel Admin**.
2. Under **Software**, open **Setup Node.js App** (Application Manager).
3. Click **Create Application**.
4. **Node.js version:** `20`.
5. **Application mode:** `Production`.
6. **Application root:** e.g. `elbakri-portal` (a folder under your home dir).
7. **Application URL:** your domain/subdomain.
8. **Application startup file:** `dist/app.js`.
9. Add all **Environment variables** from section 2.
10. Upload the project into the application root — either:
    - **Git:** if the plan has Git Version Control, clone the repo; or
    - **ZIP:** zip the project **without** `node_modules/`, `dist/`, `.env`,
      `uploads/`, `uploads-private/`, `generated/`; upload via File Manager and extract.
11. Open **Terminal** (or the app's NPM button) and run the commands in section 3
    (`npm ci` → `npm run build` → `npx prisma migrate deploy`).
12. Back in the Node app screen, click **Restart**.
13. Visit `https://portal.yourdomain.com` — the login page should load.
14. Log in as super admin, then as a company user.
15. Smoke-test: create a booking, download an invoice PDF and a voucher, upload a
    hotel image (should display), upload a passport on a Security Approval and
    confirm the admin can open it via the **Passport** button (private download).

---

## 5. Database

- **Keep Neon/Railway Postgres:** use the **public/pooled** connection string with
  `?sslmode=require`, and confirm the host allows connections from GoDaddy's IPs.
- **Move the DB (e.g. to a GoDaddy VPS Postgres):**
  1. Back up: `pg_dump "<OLD_DATABASE_URL>" -Fc -f elbakri.dump`
  2. Restore: `pg_restore --clean --if-exists -d "<NEW_DATABASE_URL>" elbakri.dump`
  3. Point `DATABASE_URL` at the new DB and run `npx prisma migrate deploy`.
- Run migrations **once** per release, before/at first start. Migrations here are
  **additive**. **Never** `prisma migrate reset` in production.

---

## 6. File persistence

- `uploads/` (public images), `uploads-private/` (passports/tickets) and
  `generated/` (PDFs) are written at runtime and are **not** in Git.
- On cPanel the home directory disk **is persistent** across restarts, so these
  survive — but they are **not** in your DB backup. Include them in periodic
  backups (cPanel Backup, or `tar czf uploads-backup.tgz uploads uploads-private generated`).
- Do not rely on ephemeral/tmp storage for these folders.

---

## 7. Rollback

- Keep the **previous working ZIP/build** (or the last-good Git commit SHA).
- **Before** running `prisma migrate deploy`, take a `pg_dump` backup.
- To roll back code: redeploy the previous ZIP/commit and **Restart** the app.
- Only if a migration must be undone: restore the pre-deploy `pg_dump`.

---

## 8. GoDaddy VPS (alternative, if "Setup Node.js App" is unavailable)

1. Install Node 20 (`nvm install 20`) and PostgreSQL (or use an external DB).
2. Clone the repo; create `.env` with the section-2 variables (`NODE_ENV=production`).
3. `npm ci && npm run build && npx prisma migrate deploy`
4. Run under **PM2**: `pm2 start dist/app.js --name elbakri-portal && pm2 save && pm2 startup`
5. Put **Nginx** in front as a reverse proxy to `http://127.0.0.1:$PORT`, add
   **Let's Encrypt** SSL, and open only 80/443 in the firewall.
6. Persist `uploads/`, `uploads-private/`, `generated/`; schedule nightly `pg_dump`.

---

## 9. Post-deploy security checklist

- [ ] `NODE_ENV=production` and the app booted (env validation passed).
- [ ] `BASE_URL` is the real `https://` domain; `JWT_SECRET` ≠ `REFRESH_TOKEN_SECRET`, neither is a placeholder.
- [ ] Login works; wrong-password 10× returns HTTP 429 (rate limit).
- [ ] Response headers include `X-Content-Type-Options`, `X-Frame-Options`; **no** `X-Powered-By`.
- [ ] A hotel image uploads and displays (public).
- [ ] A passport uploaded on a Security Approval is **not** reachable at a public
      `/uploads/...` URL, but the admin can open it via the Passport button.
- [ ] Invoice + voucher PDFs download.
- [ ] Set the invoice bank/contact env vars so PDFs show real details.
