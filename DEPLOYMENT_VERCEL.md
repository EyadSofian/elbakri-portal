# Deploying to Vercel

The portal is an Express + Prisma server, not a static site. Vercel runs it as a
single serverless function (`api/index.ts` re-exports the Express app). This
works, but two things behave differently from the cPanel/VPS deployment and you
need to know about both before pointing a domain at it.

---

## Why the first deploy returned `FUNCTION_INVOCATION_FAILED`

Three things in the boot path assumed a normal server process:

| Cause | Effect on Vercel | Fixed by |
|---|---|---|
| `ensureStorageDirs()` ran `mkdirSync` at module load | Vercel's filesystem is read-only → `EROFS` thrown before any route registered → the invocation dies with an opaque 500 | Storage defaults to `/tmp` when `VERCEL` is set, and directory creation never throws |
| `app.listen()` at module load | Wastes an instance and can race the invocation | Skipped when `VERCEL` is set |
| `validateEnvOrExit()` called `process.exit(1)` | Killed the invocation with no diagnosable cause | On serverless it logs loudly instead, so the real error reaches the logs |

---

## Just want to look at it? Use preview mode

If you only want to see the interface and do not want to set up a database
yet, set **one** environment variable in Vercel and redeploy:

```
DEMO_MODE=1
```

Nothing else is required — no `DATABASE_URL`, no secrets. The API then answers
from built-in fixtures, so login works, every page renders with realistic
data, and Prisma is never called. The login screen lists the preview accounts
and fills the form when you pick one, so there is nothing to look up.

What preview mode does **not** do: save anything. Any create/edit/delete
returns "Preview mode — this action was not saved" and changes nothing. The
data is invented; there is no real agency, client or balance in it.

**Remove `DEMO_MODE` before the portal is used for real work** — with it on,
the app will never read or write your database.

---

## "I typed my password and nothing happened"

Open `/api/health` on the deployment. It answers regardless of how the project
is configured and tells you which of three states you are in:

```json
{ "success": true, "data": { "mode": "preview", "ready": true, "missing": [] } }
```

| `mode` / `ready` | Meaning | What to do |
|---|---|---|
| `preview` | Running on fixtures | Sign in with an account shown on the login screen |
| `live`, `ready: true` | Configured, talking to the real database | Credentials come from your database (`npm run db:seed`) |
| `live`, `ready: false` | **Not configured** — `missing` names the unset variables | Set them (or `DEMO_MODE=1`) and redeploy |

The login screen reads the same endpoint and says which case applies, so an
unconfigured deployment now shows "Server not configured" instead of blaming
the password. Only variable *names* are ever returned — never their values.

---

## Two limits you must accept (or design around)

**1. Uploads and generated PDFs do not persist.**
Only `/tmp` is writable, it is per-instance, and it is wiped between
invocations. Hotel images, passport scans, invoices and vouchers written on one
request will not exist on the next. For a temporary preview this is fine — for
production you need object storage (Vercel Blob, S3, or Cloudflare R2) behind
`src/config/paths.ts`.

**2. The database must be reachable from the internet.**
`DATABASE_URL` currently points at `mysql://…@localhost:3306/elbakri`, which a
Vercel function cannot reach. You need a hosted MySQL — PlanetScale, Railway,
Aiven, or your GoDaddy MySQL **if** you enable remote access and allow Vercel's
IPs. Serverless also opens a connection per instance, so append a small pool
limit: `?connection_limit=3&pool_timeout=10`.

---

## Environment variables to set in Vercel

Project → Settings → Environment Variables. Add for **Production** (and Preview
if you want previews to work).

**Required — the app refuses to serve without these:**

| Variable | Value |
|---|---|
| `DATABASE_URL` | your hosted MySQL URL, e.g. `mysql://user:pass@host:3306/elbakri?connection_limit=3` |
| `JWT_SECRET` | a long random string (32+ chars) |
| `REFRESH_TOKEN_SECRET` | a **different** long random string |
| `BASE_URL` | `https://elbakri-portal.vercel.app` — or your domain once connected |
| `NODE_ENV` | `production` |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Optional — features degrade quietly without them:**
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`,
`INTERNAL_TEAM_EMAIL` (notification email), `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_ID` (Sheets sync), `APIFY_TOKEN` (hotel
image enrichment).

> `BASE_URL` is also the CORS origin. If it does not match the address you are
> actually browsing, every API call fails with a CORS error and the portal will
> look like it is loading forever.

---

## Create the schema and the seed accounts

Run once, from your machine, against the hosted database:

```bash
DATABASE_URL="<your hosted mysql url>" npx prisma migrate deploy
```

```bash
DATABASE_URL="<your hosted mysql url>" npm run db:seed
```

### Login accounts created by the seed

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@elbakri.com` | `Admin@1982` |
| Company admin | `admin@niletravel.com` | `NileAdmin@2024` |
| Company admin | `admin@pyramidstours.com` | `PyramidsAdmin@2024` |
| Agent | `agent1@niletravel.com` | `Agent@12345` |

The super admin lands on `/admin.html`; company accounts land on
`/dashboard.html`.

**Change these passwords before the site is reachable by anyone else** — they
are published in this repo.

---

## Connecting your domain

1. Vercel → Project → **Domains** → add your domain.
2. At your registrar, add the records Vercel shows — usually `A → 76.76.21.21`
   for the apex, and `CNAME → cname.vercel-dns.com` for `www`.
3. Wait for DNS to propagate; Vercel issues the TLS certificate automatically.
4. **Then update `BASE_URL`** to the new domain and redeploy — otherwise CORS
   still expects the `.vercel.app` address and every API call fails.

---

## Files that make this work

- `api/index.ts` — the entry point; re-exports the Express app unchanged
- `vercel.json` — routes everything not on disk to the function, includes
  `public/**` in the bundle, 30s timeout
- `.vercelignore` — keeps tests, scripts and build output out of the bundle
- `postinstall: prisma generate` in `package.json` — guarantees the Prisma
  client exists whatever build command Vercel uses

`prisma/schema.prisma` already lists `rhel-openssl-3.0.x` in `binaryTargets`,
which is the runtime Vercel uses, so no change was needed there.
