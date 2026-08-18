# Deployment on Railway (PostgreSQL)

This is the **current** deployment path for the portal. The app is a plain
Node/Express server (`node dist/app.js`) talking to PostgreSQL through Prisma —
Railway runs it as a normal long-lived container, so uploads, generated PDFs and
background work all behave the way they do locally.

> Migrating from the old MySQL/cPanel setup? See
> [What changed vs. MySQL](#what-changed-vs-mysql) at the bottom.

---

## 1. Services to create

Inside one Railway **project**, create three things:

| # | What | Why |
|---|---|---|
| 1 | **PostgreSQL** database (`+ New` → `Database` → `Add PostgreSQL`) | The portal's data. Railway names the service `Postgres` by default. |
| 2 | **App service** from this GitHub repo | Builds and runs the portal. |
| 3 | **Volume** attached to the app service, mounted at `/data` | Persistent disk for uploads/PDFs. Without it every upload is deleted on the next deploy. |

Create the Postgres service **first** — the app's `DATABASE_URL` references it.

---

## 2. Build & deploy settings

[`railway.json`](railway.json) is committed at the repo root, so Railway picks
all of this up automatically. Nothing needs to be typed into the dashboard:

| Setting | Value | Source |
|---|---|---|
| Build command | `npm run build` (= `prisma generate && tsc`) | `railway.json` |
| Pre-deploy command | `npx prisma migrate deploy` | `railway.json` |
| Start command | `node dist/app.js` | `railway.json` |
| Health check | `GET /api/health` | `railway.json` |
| Node version | 20 | `.nvmrc` + `engines` in `package.json` |

The pre-deploy step applies any pending migrations **once per deploy**, before
the new container starts taking traffic. If it fails, Railway keeps the previous
version running instead of promoting a build against an un-migrated database.

`/api/health` is a liveness probe and deliberately does not query the database,
so a Postgres restart cannot roll back a healthy app deploy. For an explicit
connectivity check, call `/api/health?db=1` — it returns `503` when the database
is unreachable.

---

## 3. Environment variables

Set these on the **app service** → `Variables`. Values written as `${{ … }}` are
Railway *reference variables*: type them literally, Railway substitutes them at
deploy time and keeps them correct if the database credentials or domain change.

### Required — the app refuses to start in production without these

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |
| `JWT_SECRET` | A long random string — `openssl rand -base64 48` |
| `REFRESH_TOKEN_SECRET` | A **different** long random string — `openssl rand -base64 48` |
| `BASE_URL` | `https://${{ RAILWAY_PUBLIC_DOMAIN }}` |
| `NODE_ENV` | `production` |

> `JWT_SECRET` and `REFRESH_TOKEN_SECRET` must not be equal, and must not be the
> placeholder values from `.env.example` — [`src/config/env.ts`](src/config/env.ts)
> validates this at boot and exits rather than starting an insecure deploy.
>
> `BASE_URL` is also the allowed **CORS origin**, so it must match the URL in the
> browser's address bar exactly (scheme included). After attaching a custom
> domain, change it to `https://portal.yourdomain.com`.

Reference `${{ Postgres.DATABASE_URL }}` rather than pasting the connection
string: it resolves to the **private-network** URL, which does not leave
Railway's network, costs no egress, and survives a credential rotation. The
`Postgres` prefix is the database service's name — if you renamed it, use the
new name.

### Storage — required if a Volume is attached (strongly recommended)

| Variable | Value |
|---|---|
| `UPLOAD_DIR` | `/data/uploads` |
| `PRIVATE_UPLOAD_DIR` | `/data/uploads-private` |
| `PDF_DIR` | `/data/generated` |

These are hotel/destination images, passport and ticket scans, and generated
invoice/voucher PDFs. The container filesystem is **ephemeral** — recreated on
every deploy and restart — so without a Volume plus these three variables, all
of it disappears the next time you push a commit.

`PRIVATE_UPLOAD_DIR` is a *sibling* of `UPLOAD_DIR`, never a child: only
`UPLOAD_DIR` is served statically at `/uploads`, while private documents are
reachable only through the authenticated, ownership-checked route
`GET /api/files/private/:filename`. Keep them as separate directories.

### Email — optional, but notifications silently degrade without it

| Variable | Example |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `bookings@elbakri.com` |
| `SMTP_PASS` | App password (not the account password) |
| `FROM_EMAIL` | `Elbakri Overseas <bookings@elbakri.com>` |
| `INTERNAL_TEAM_EMAIL` | `team@elbakri.com` |

### Google Sheets sync — optional

| Variable | Notes |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account address |
| `GOOGLE_PRIVATE_KEY` | Paste the full PEM. Railway preserves real newlines in multi-line values — paste it as-is, no `\n` escaping needed. |
| `GOOGLE_SHEETS_ID` | Spreadsheet ID from its URL |

### Do **not** set

| Variable | Why |
|---|---|
| `PORT` | Railway injects it; the app reads `process.env.PORT`. Overriding it breaks routing. |
| `DEMO_MODE` | Serves the entire API from fixtures and never touches the database. Preview only. |

---

## 4. First deploy

1. Add the Postgres service.
2. Add the app service from the repo, set the variables above, attach the Volume at `/data`.
3. Deploy. The pre-deploy step runs `prisma migrate deploy`, which creates all
   48 tables and 32 enum types from
   `prisma/migrations/20260817000000_postgres_init/`.
4. Under `Settings → Networking`, click **Generate Domain** to get a public URL.
5. Confirm `BASE_URL` matches that domain, then redeploy so CORS picks it up.
6. Open `https://<your-domain>/api/health` — expect `{"success":true,"status":"ok",…}`.
   Then `https://<your-domain>/api/health?db=1` — expect `"database":"up"`.

---

## 5. Seeding data

Seeding is a **one-time** setup step, not part of a deploy. Run it from your own
machine against the Railway database using the Railway CLI, which injects the
service's variables into the local process:

```bash
npm i -g @railway/cli
railway login
railway link                 # pick the project, then the app service

railway run npm run db:seed          # SuperAdmin + 2 demo companies + demo bookings
railway run npm run db:seed:mea      # MEA 2026 rate sheet (10 destinations, 10 hotels,
                                     # seasonal pricing, 45 activities, 102 transport rates)
railway run npm run db:seed:hotels   # 199-hotel catalogue (no prices, quote-request only)
```

The MEA seed is **idempotent** — re-running it refreshes hotel pricing periods,
activities and transport rates to match the latest sheet, so it is safe to run
again after a rate update. Source data lives in [prisma/seed-mea.ts](prisma/seed-mea.ts).

> Change the seeded SuperAdmin password (`admin@elbakri.com`) immediately after
> the first login — it is a known value committed in [prisma/seed.ts](prisma/seed.ts).

To connect a GUI or psql instead, use the Postgres service's **public** URL
(`Postgres → Variables → DATABASE_PUBLIC_URL`). The private URL only resolves
from inside Railway's network.

---

## 6. Schema changes after the first deploy

Develop migrations locally against a local Postgres, commit them, and let the
deploy apply them:

```bash
npm run db:migrate            # prisma migrate dev — creates prisma/migrations/<new>/
git add prisma/migrations && git commit && git push
```

The next Railway deploy runs `prisma migrate deploy` in pre-deploy and applies
them. Never run `prisma migrate dev` or `db:reset` against production —
`migrate dev` can drop and recreate the database.

---

## 7. Verification checklist

- [ ] `/api/health` returns `200`
- [ ] `/api/health?db=1` reports `"database":"up"`
- [ ] Login page loads at the root URL and a seeded user can log in
- [ ] Hotel search returns results, including for lowercase queries (`cairo` finds `Cairo`)
- [ ] Uploading a hotel image succeeds and the image still loads **after a redeploy** (proves the Volume works)
- [ ] Generating an invoice PDF succeeds and the file survives a redeploy
- [ ] Deploy logs contain no `⚠️  [env]` warnings

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Deploy fails on `prisma migrate deploy` | `DATABASE_URL` unset or pointing at a database the service cannot reach. Confirm it is `${{ Postgres.DATABASE_URL }}` and that both services are in the same project. |
| `❌ [env] Refusing to start with an invalid production configuration.` | A required variable is missing, or a secret is still a placeholder, or the two secrets are identical. The log lines above it name the variable — values are never printed. |
| Browser console shows CORS errors | `BASE_URL` does not exactly match the domain in use. Update it and redeploy. |
| Uploaded images 404 after a deploy | No Volume, or `UPLOAD_DIR`/`PRIVATE_UPLOAD_DIR`/`PDF_DIR` are not pointing inside the mount. Files written before the Volume existed are already gone. |
| Build fails fetching `xlsx` | `xlsx` is installed from `https://cdn.sheetjs.com/…`, not the npm registry. It needs outbound access to that host at build time. |
| Health check times out on first deploy | Increase `healthcheckTimeout` in `railway.json`, or check the deploy logs — a crash at boot shows up there. |

---

## What changed vs. MySQL

The portal previously targeted MySQL/MariaDB on GoDaddy cPanel. Moving to
Railway's PostgreSQL changed three things in the repo:

1. **`prisma/schema.prisma`** — `provider` is now `postgresql`. No model or
   field type needed changing; `@db.Text`, `@db.Decimal(…)`, `Json` and enums
   are all valid in both engines.
2. **Migrations** — a fresh PostgreSQL baseline lives in
   `prisma/migrations/20260817000000_postgres_init/`. The old MySQL migration is
   kept for reference under `prisma/migrations_mysql_backup/` (alongside the
   even older `prisma/migrations_postgres_backup/`), and
   `database/mysql/init.sql` is now a historical snapshot that must not be
   imported.
3. **Case-insensitive search** — MySQL's default collation made `contains`
   filters case-insensitive; PostgreSQL's `LIKE` is case-sensitive. Every
   user-facing search filter now passes `mode: 'insensitive'` explicitly, so
   searching `cairo` still matches `Cairo`. The one deliberate exception is
   [src/modules/files/files.routes.ts](src/modules/files/files.routes.ts), where
   `contains` matches a stored filename for an authorization check and exact
   matching is the stricter behaviour.

The GoDaddy FTP workflow and the Vercel configuration (`vercel.json`,
`.vercelignore`, `api/index.ts`) have been removed — Railway is the only
deployment target. [DEPLOYMENT_GODADDY_CPANEL.md](DEPLOYMENT_GODADDY_CPANEL.md)
is kept as a historical record only and no longer matches this schema.

---

## Local development

```bash
cp .env.example .env          # set DATABASE_URL to a local postgres:// URL
npm install
npm run db:migrate            # create/apply dev migrations
npm run db:seed               # seed SuperAdmin + demo companies (once)
npm run db:seed:mea           # seed MEA 2026 rate sheet
npm run dev                   # ts-node + nodemon with hot reload
```
