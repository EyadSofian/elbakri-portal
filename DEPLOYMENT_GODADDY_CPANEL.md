> ⚠️ **HISTORICAL — no longer the active deployment path.** The portal now runs
> on **Railway + PostgreSQL**; `prisma/schema.prisma` targets `postgresql`, so the
> MySQL steps below (and `database/mysql/init.sql`) no longer match the schema.
> Use **[DEPLOYMENT_RAILWAY.md](DEPLOYMENT_RAILWAY.md)** instead. Restoring this
> path would mean reverting the Prisma provider back to `mysql`.

---

# Deploying Elbakri Portal on GoDaddy (cPanel Node.js App + MySQL/MariaDB)

This guide deploys the Node/Express/Prisma backend + static portal to GoDaddy
shared/business hosting using **Setup Node.js App** (Phusion Passenger) with a
**cPanel MySQL/MariaDB** database. The schema is imported once through
**phpMyAdmin** (GoDaddy shared hosting has no reliable SSH/terminal), and code is
shipped by **GitHub Actions over FTP**. VPS notes are at the end.

> The database is now **MySQL/MariaDB** (previously PostgreSQL). There is no data
> to migrate — the old DB is retired and master data is re-imported from Excel/Sheets.

---

## 0. Can this plan run Node?

GoDaddy can run this app **only** if cPanel shows **"Setup Node.js App"** (a.k.a.
*Application Manager*) under **Software**. This is on most **Business / Deluxe /
Ultimate Linux cPanel** plans — **not** the cheapest "Web Hosting Starter" or
Managed WordPress.

- ✅ See **Setup Node.js App** → follow this guide.
- ❌ Not there → the Express backend can't run on that plan. Use a **GoDaddy VPS**
  (see the end) or host the backend elsewhere and point DNS at it.

The host also needs local access to **MySQL/MariaDB** (port **3306**, usually
`localhost`) and outbound **SMTP** (port 587) for email.

---

## 1. Prerequisites

| Item | Value |
|---|---|
| Node.js version | **20** (select in the Node app dropdown; the app requires `>=18 <=20`) |
| Startup file | `dist/app.js` |
| Application root | the folder you upload the project into, e.g. `elbakri-portal` |
| Application URL | your domain or subdomain, e.g. `portal.yourdomain.com` |
| Database | **MySQL 5.7+ / MariaDB 10.2+** created in cPanel (utf8mb4, JSON support) |

---

## 2. Create the MySQL database (cPanel → MySQL® Databases)

1. cPanel → **MySQL® Databases**.
2. **Create New Database** — e.g. `elbakri_b2b`. cPanel prefixes it with your
   account id, so the real name becomes e.g. `iqdo9r8tk5qu_elbakri_b2b`.
3. **Add New User** — e.g. `elbakri_user` → real name `iqdo9r8tk5qu_elbakri_user`.
   Use a strong password.
4. **Add User To Database** → grant **ALL PRIVILEGES**.
5. Note the final `DB_NAME`, `DB_USER`, `DB_PASSWORD`, host (usually `localhost`).

---

## 3. Import the schema via phpMyAdmin (once)

The full schema ships as [`database/mysql/init.sql`](database/mysql/init.sql)
(generated from `prisma/schema.prisma`).

1. cPanel → **phpMyAdmin**.
2. Select your new database in the left sidebar (must be **empty**).
3. Open the **Import** tab → **Choose File** → `database/mysql/init.sql` → **Go**.
4. You should see ~48 tables created with no errors.

> Requires MySQL **5.7+** or MariaDB **10.2+** (utf8mb4, `JSON` columns, large
> index prefix). Every modern GoDaddy cPanel plan meets this. Do **not** import
> into a database that already has data.

**Later schema changes** (no terminal on cPanel): update `prisma/schema.prisma`
locally, regenerate the SQL, and import the change through phpMyAdmin:

```bash
# locally — generate SQL for the delta between the live DB and the new schema
npx prisma migrate diff \
  --from-url "mysql://USER:PASS@HOST:3306/DBNAME" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > database/mysql/change.sql
# review change.sql, then import it via phpMyAdmin → Import
```

Never run `prisma migrate reset`/`deploy` against the production DB from CI unless
**Remote MySQL** is deliberately configured — prefer reviewed SQL through phpMyAdmin.

---

## 4. Environment variables (Node.js App screen → Environment variables)

**Never commit real values.**

**Required (the app refuses to boot in production without them):**

| Variable | Example / Notes |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `mysql://iqdo9r8tk5qu_elbakri_user:PASSWORD@localhost:3306/iqdo9r8tk5qu_elbakri_b2b` |
| `JWT_SECRET` | long random string (≥32 chars) — **not** the `.env.example` placeholder |
| `REFRESH_TOKEN_SECRET` | a *different* long random string |
| `BASE_URL` | `https://portal.yourdomain.com` (final domain, https, **not** localhost) |

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

> If the DB password contains URL-special characters (`@ : / ? # %`), URL-encode
> them in `DATABASE_URL` (e.g. `@` → `%40`).

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

## 5. Ship the code

The build (`npm run build`) runs `prisma generate` **then** `tsc`, so a clean
`npm ci && npm run build` produces `dist/` with a MySQL Prisma client.

### Option A — GitHub Actions over FTP (recommended, no terminal needed)

The repo ships [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It
builds on Node 20, prunes dev dependencies, and FTP-uploads `dist/`, `public/`,
`prisma/`, `package.json`, `package-lock.json`, and `node_modules/` to the app
root, then touches `tmp/restart.txt` to restart Passenger.

Add these **GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `FTP_SERVER` | your FTP host, e.g. `ftp.yourdomain.com` |
| `FTP_USERNAME` | cPanel/FTP user |
| `FTP_PASSWORD` | FTP password |
| `FTP_REMOTE_DIR` | app root path, e.g. `/home/USER/elbakri-portal/` |

Push to `main` (or run the workflow manually) → it deploys. The database is
managed separately via phpMyAdmin (section 3) — CI never touches it.

### Option B — Manual ZIP upload

1. Locally: `npm ci && npm run build && npm prune --omit=dev`.
2. Zip `dist/`, `public/`, `prisma/`, `package.json`, `package-lock.json`,
   `node_modules/`. Exclude `.env`, `uploads/`, `uploads-private/`, `generated/`.
3. cPanel File Manager → upload into the app root → extract.
4. Node.js App screen → **Restart**.

---

## 6. Bring it up

1. Node.js App: Node 20, mode **Production**, app root set, startup `dist/app.js`,
   env vars from section 4 → **Create / Restart**.
2. Visit `https://portal.yourdomain.com` — the login page should load.
3. Seed the first super admin + master data (one of):
   - Locally point `DATABASE_URL` at the cPanel DB (if **Remote MySQL** whitelists
     your IP) and run `npm run db:seed` then the Excel/Sheets import; **or**
   - Export a seeded DB locally with `mysqldump` and import the data via phpMyAdmin.
4. Smoke-test: super-admin login, company login, create hotel/transport/activity,
   confirm the company user sees them, download an invoice PDF + voucher, upload a
   hotel image (displays) and a passport (admin opens it via the Passport button).

---

## 7. Backups & persistence

- **Database:** cPanel → phpMyAdmin → **Export** (or `mysqldump`) on a schedule.
  Take an export **before** importing any schema change.
- **Files:** `uploads/` (public images), `uploads-private/` (passports/tickets),
  `generated/` (PDFs) are written at runtime and are **not** in Git. The cPanel
  home disk is persistent, but include these in periodic backups
  (`tar czf files-backup.tgz uploads uploads-private generated`).

---

## 8. Rollback

- Keep the **previous working build** (GitHub Actions keeps history; or a ZIP).
- **Before** importing a schema change, export the DB (phpMyAdmin/`mysqldump`).
- Roll back code: re-run the previous successful Actions run (or re-upload the old
  ZIP) and **Restart** the app.
- Roll back schema only if required: import the pre-change SQL export.

---

## 9. GoDaddy VPS (alternative, if "Setup Node.js App" is unavailable)

1. Install Node 20 (`nvm install 20`) and **MariaDB** (`apt install mariadb-server`).
2. `mysql -u root -p` → `CREATE DATABASE elbakri_b2b; CREATE USER ...; GRANT ALL ...;`
   then import: `mysql elbakri_b2b < database/mysql/init.sql`.
3. Clone the repo; create `.env` (section 4, `NODE_ENV=production`, `mysql://` URL).
4. `npm ci && npm run build`
5. Run under **PM2**: `pm2 start dist/app.js --name elbakri-portal && pm2 save && pm2 startup`
6. **Nginx** reverse proxy → `http://127.0.0.1:$PORT`, **Let's Encrypt** SSL,
   firewall 80/443 only. Persist `uploads/`, `uploads-private/`, `generated/`;
   schedule nightly `mysqldump`.

---

## 10. Post-deploy checklist

- [ ] `init.sql` imported in phpMyAdmin with no errors (~48 tables).
- [ ] `NODE_ENV=production` and the app booted (env validation passed).
- [ ] `DATABASE_URL` uses the cPanel-prefixed DB/user; `JWT_SECRET` ≠ `REFRESH_TOKEN_SECRET`, neither a placeholder; `BASE_URL` is the real `https://` domain.
- [ ] Login works; wrong-password 10× returns HTTP 429 (rate limit).
- [ ] Response headers include `X-Content-Type-Options`, `X-Frame-Options`; **no** `X-Powered-By`.
- [ ] Admin creates hotel/transport/activity; company user sees them (amenities & galleries render).
- [ ] A passport uploaded on a Security Approval is **not** at a public `/uploads/...` URL, but the admin opens it via the Passport button.
- [ ] Invoice + voucher PDFs download.
- [ ] Excel/Sheets master-data import populates hotels/activities/transport.
- [ ] Mobile + Arabic/RTL render correctly.
- [ ] Set the invoice bank/contact env vars so PDFs show real details.
