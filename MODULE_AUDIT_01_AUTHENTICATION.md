# MODULE AUDIT — M01 Authentication & Session

**Phase:** 2 (module-by-module audit) · **Module:** M01 — Authentication & Session
**Repository:** `eyadsofian/elbakri-portal` · branch `claude/cruise-program-options-oovbji`
**Date:** 2026-08-30
**Workflow position:** Feature → Use Case → Business Rule → Technical Implementation → Test Cases → Issues → Improvements → Score
**Predecessor:** `APPLICATION_AUDIT_REPORT.md` §5 (M01), §12 (BR-001…BR-004), §13.1, §15

This phase **scores** the module (Phase 1 deliberately did not). It remains an audit: no application code was modified. Every finding cites the file and line it was read from.

---

## 1. Scope & Method

**In scope** — everything that establishes or carries identity:

| Layer | Files read |
|---|---|
| Backend | `src/modules/auth/auth.controller.ts` (135), `auth.routes.ts` (28), `auth.schema.ts` (11) |
| Middleware | `src/middleware/auth.ts` (34), `src/middleware/role.ts` (17), `src/middleware/validate.ts` |
| Config | `src/config/env.ts`, `src/config/db.ts`, `src/app.ts` (CORS, helmet, trust proxy, mount order) |
| Data | `prisma/schema.prisma` → `User`, `RefreshToken`, `Company.isActive` |
| Lifecycle owners | `src/modules/users/users.controller.ts` (create/update/reset/delete), `src/modules/companies/companies.controller.ts` (create/update/delete) |
| Frontend | `public/login.html` (221), token handling in `public/dashboard.html:264-300, 557-561, 6571-6600`, `public/admin.html:380-400, 741-747, 8701-8715` |
| Preview | `src/demo/demo.router.ts:46-112`, `src/demo/demo.fixtures.ts:47-60` |
| Seed | `prisma/seed.ts:25-60` |

**Out of scope** — per-module authorization rules of other modules (they consume `req.user`; the matrix lives in `APPLICATION_AUDIT_REPORT.md` §6). Only the *production* of `req.user` and its trust window are audited here.

**Dependency versions verified from `package-lock.json`:** `jsonwebtoken@9.0.3`, `bcryptjs@2.4.3`, `express@4.22.2`, `express-rate-limit@8.5.2`, `cookie-parser@1.4.7`.

---

## 2. Module Surface

**Endpoints (4)** — mounted at `/api/auth`, the only router in the application not behind `authenticate` (`src/app.ts:183`).

| Method | Path | Auth | Guards |
|---|---|---|---|
| POST | `/api/auth/login` | public | `loginLimiter` → `validate(loginSchema)` |
| POST | `/api/auth/refresh` | refresh cookie | none |
| POST | `/api/auth/logout` | none | none |
| GET | `/api/auth/me` | access token | `authenticate` |

**Consumed by every other module** — `authenticate` populates `req.user = { id, email, role, companyId }`; 113 `requireRole(...)` guard usages and 15 in-controller `companyId` ownership comparisons read it. **The JWT payload is the sole source of authorization state for the life of the token** — no handler re-reads `User.isActive`, `User.role` or `User.companyId` from the database on a normal request.

**Data model**

```prisma
User          { email @unique, password, role, companyId?, isActive, lastLoginAt }
RefreshToken  { token @unique @db.VarChar(500), userId → User (Cascade), expiresAt, createdAt }
```

---

## 3. Features

| ID | Feature | Entry point | Actors |
|---|---|---|---|
| F-01 | Sign in with email + password | `POST /api/auth/login` | all roles, anonymous |
| F-02 | Brute-force throttling | `loginLimiter` (`auth.routes.ts:14-21`) | anonymous |
| F-03 | Silent session renewal | `POST /api/auth/refresh` | all roles |
| F-04 | Sign out | `POST /api/auth/logout` | all roles |
| F-05 | Identity + company context | `GET /api/auth/me` | all roles |
| F-06 | Bearer-token gate | `authenticate` middleware | system |
| F-07 | Role gate | `requireRole` middleware | system |
| F-08 | Company-deactivation lockout | login + refresh checks | system |
| F-09 | Portal session bootstrap & role routing | `login.html`, `bootstrapUser()`, `admin.html init()` | all roles |
| F-10 | Session revocation on password reset / user removal | `users.controller.ts:185, 239, 247` | SUPERADMIN, COMPANY_ADMIN |
| F-11 | Startup secret validation | `checkEnv()` / `validateEnvOrExit()` | operator |
| F-12 | Preview-mode authentication | `demo.router.ts:74-110` | reviewer |

---

## 4. Use Cases

### F-01 Sign in

| ID | Use case | Expected behaviour | Verified in code |
|---|---|---|---|
| UC-01.1 | Valid credentials, active user, active company | 200 + `accessToken` + `refreshToken` cookie + `lastLoginAt` stamped | `auth.controller.ts:51-73` |
| UC-01.2 | SUPERADMIN (no company) signs in | 200; company check skipped because `user.companyId` is null | `:46` |
| UC-01.3 | Unknown email | 401 `UNAUTHORIZED` / "Invalid credentials" | `:33-36` |
| UC-01.4 | Correct email, wrong password | 401, identical body to UC-01.3 | `:38-42` |
| UC-01.5 | Deactivated user | 401, identical body (deliberately indistinguishable) | `:33` |
| UC-01.6 | Active user, deactivated company | 403 `COMPANY_INACTIVE` + explanatory message | `:46-49` |
| UC-01.7 | Email typed with different casing/whitespace | Normalised then matched | `auth.schema.ts:7` |
| UC-01.8 | Malformed email | 400 `VALIDATION_ERROR` before any DB call | `validate.ts` |
| UC-01.9 | Empty password | 400 `VALIDATION_ERROR` | `auth.schema.ts:8` |
| UC-01.10 | Extra fields in the body (`role`, `isActive`, …) | Stripped by `z.object` before the handler sees them | `validate.ts:8` |

### F-02 Throttling

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-02.1 | 10 failed attempts from one IP inside 15 min | 11th → 429 `TOO_MANY_ATTEMPTS` | `auth.routes.ts:14-21` |
| UC-02.2 | Successful sign-ins interleaved with failures | Successes do not consume the budget | `skipSuccessfulRequests: true` |
| UC-02.3 | Same account attacked from many IPs | **Not throttled** — the limiter is keyed on IP only | see AUTH-08 |
| UC-02.4 | Behind the reverse proxy | Real client IP is used (`trust proxy: 1`) | `app.ts:78` |

### F-03 Refresh

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-03.1 | Valid cookie, active user & company | 200 + a fresh access token | `auth.controller.ts:105-107` |
| UC-03.2 | No cookie | 401 | `:78-81` |
| UC-03.3 | Cookie with a broken signature | 401 (verify throws) | `:83-90` |
| UC-03.4 | Signature valid, row deleted (already logged out) | 401 | `:96` |
| UC-03.5 | Row present but `expiresAt` in the past | 401 | `:96` |
| UC-03.6 | User deactivated since sign-in | 401 | `:96` |
| UC-03.7 | Company deactivated since sign-in | 403 `COMPANY_INACTIVE` | `:100-103` |
| UC-03.8 | Role or company changed since sign-in | New access token carries the **new** values (read from the DB row) | `:105-106` |
| UC-03.9 | Same refresh token used repeatedly | Accepted every time — no rotation, no reuse detection | see AUTH-06 |

### F-04 / F-05 / F-06 / F-07

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-04.1 | Logout with a cookie | Row deleted, cookie cleared, 200 | `:110-117` |
| UC-04.2 | Logout without a cookie | 200, cookie cleared anyway | `:112` |
| UC-04.3 | Logout does not invalidate the access token | Token keeps working until it expires | see AUTH-02 |
| UC-05.1 | `/me` for a live user | Identity + company (tier, currency, market, balance, creditLimit) | `:119-135` |
| UC-05.2 | `/me` for a user deleted after the token was issued | 404 `NOT_FOUND` | `:129-132` |
| UC-06.1 | No `Authorization` header | 401 | `middleware/auth.ts:21-24` |
| UC-06.2 | Header not starting with `Bearer ` | 401 | `:21` |
| UC-06.3 | Expired / tampered / foreign-secret token | 401 | `:31-33` |
| UC-06.4 | Valid token for a user deactivated one minute ago | **Accepted** until expiry | see AUTH-02 |
| UC-07.1 | Role in the allow-list | passes | `role.ts:11-15` |
| UC-07.2 | Role not in the allow-list | 403 `FORBIDDEN` | `:11-13` |
| UC-07.3 | `requireRole` reached with no `req.user` | 401 (defensive) | `:7-10` |

### F-08 / F-09 / F-10

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-08.1 | Company deactivated via `DELETE /api/admin/companies/:id` | Company **and every user** set inactive | `companies.controller.ts:451-461` |
| UC-08.2 | Company reactivated via `PATCH … {isActive:true}` | Company active again — **users stay inactive** | `companies.controller.ts:340`; see AUTH-01 |
| UC-09.1 | Sign-in as SUPERADMIN | Browser sent to `/admin.html` | `login.html:204` |
| UC-09.2 | Sign-in as COMPANY_ADMIN / AGENT | Browser sent to `/dashboard.html` | `login.html:204` |
| UC-09.3 | Agency portal opened with a token | `/auth/me` verifies; a SUPERADMIN is bounced to `/admin.html` | `dashboard.html:6571-6582` |
| UC-09.4 | Admin portal opened | Gate reads **only** `localStorage.userRole` | `admin.html:8701-8706`; see AUTH-05 |
| UC-09.5 | API returns 401 mid-session | Silent refresh, then the request is retried once | `dashboard.html:272-282` |
| UC-09.6 | Refresh also fails | `localStorage.clear()` + redirect to login | `dashboard.html:274-278` |
| UC-10.1 | Admin resets a password | Password rehashed **and all refresh tokens for that user deleted** | `users.controller.ts:181-187` |
| UC-10.2 | User deactivated (has history) or deleted | Refresh tokens deleted in the same transaction | `users.controller.ts:236-249` |
| UC-10.3 | User deactivated via `PATCH /:id {isActive:false}` | **No** token deletion; refresh fails on the next attempt | `users.controller.ts:141-152` |

---

## 5. Business Rules

Carried forward from `APPLICATION_AUDIT_REPORT.md` §12 and extended with rules discovered in this pass.

| ID | Rule | Source | Confidence |
|---|---|---|---|
| BR-001 | Email is trimmed and lower-cased before every lookup and every write | `auth.schema.ts:7`, `users.schema.ts:6,17` | Confirmed |
| BR-002 | Inactive **user** → 401 identical to bad credentials; inactive **company** → 403 with an explanation | `auth.controller.ts:33,46` | Confirmed |
| BR-003 | Only failed sign-ins consume the rate-limit budget (10 / 15 min / IP) | `auth.routes.ts:19` | Confirmed |
| BR-004 | The stored `RefreshToken` row is the identity source; the JWT signature is only an entry gate | `auth.controller.ts:84-95` | Confirmed |
| BR-101 | Access token lifetime is `JWT_EXPIRES_IN` or 1 h; refresh lifetime is a hard-coded 30 days in both the JWT and the row | `auth.controller.ts:6-7,14,60` | Confirmed |
| BR-102 | The access-token payload is exactly `{ id, email, role, companyId }` — authorization state is frozen at issue time | `auth.controller.ts:51`, `middleware/auth.ts:4-9` | Confirmed |
| BR-103 | Passwords are hashed with bcrypt cost 12 everywhere they are written | `auth`, `users:72,181`, `companies:112`, `seed.ts:49` | Confirmed |
| BR-104 | Generated passwords use `crypto.randomInt` over a look-alike-free alphabet (12 chars for users, 20 for the seeded admin) | `shared/helpers.ts:34-49`, `seed.ts:42` | Confirmed |
| BR-105 | A password reset revokes every refresh token of that user | `users.controller.ts:184-187` | Confirmed |
| BR-106 | Removing a user revokes their refresh tokens whether the outcome is deactivation or deletion | `users.controller.ts:236-249` | Confirmed |
| BR-107 | Deactivating a company also deactivates every user belonging to it | `companies.controller.ts:457-460` | Confirmed |
| BR-108 | The refresh cookie is `httpOnly`, `SameSite=strict`, 30-day, and `Secure` **only when `NODE_ENV=production`** | `auth.controller.ts:17-24` | Confirmed |
| BR-109 | Production refuses to boot without `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `DATABASE_URL`, `BASE_URL`; placeholder secrets and identical secrets are hard errors | `config/env.ts:43-56` | Confirmed |
| BR-110 | `DEMO_MODE` short-circuits all of BR-109 and answers every `/api` route from fixtures | `config/env.ts:34-41`, `app.ts:177-181` | Confirmed |
| BR-111 | Refresh re-reads role and company from the database, so a refreshed token carries updated authorization | `auth.controller.ts:105-106` | Confirmed |
| BR-112 | Seeding never overwrites an existing SuperAdmin, and rejects a supplied password under 12 characters | `seed.ts:31-45` | Confirmed |
| BR-113 | There is no self-service password change and no forgot-password flow anywhere in the product | whole-repo grep | Confirmed |
| BR-114 | Reactivating a company does **not** reactivate its users | `companies.controller.ts:322-343` (no user write) | Confirmed |

---

## 6. Technical Implementation

### 6.1 Sign-in path

```
POST /api/auth/login
  → loginLimiter          IP bucket, 10 failures / 15 min, standard headers
  → validate(loginSchema) trim + lowercase + email shape; unknown keys dropped
  → login()
      prisma.user.findUnique({ email }) + include company.isActive     [1 indexed query]
      guard: !user || !user.isActive              → 401
      bcrypt.compare(password, user.password)                          [~250 ms, cost 12]
      guard: !valid                               → 401
      guard: companyId && company && !isActive    → 403 COMPANY_INACTIVE
      signAccess({id,email,role,companyId})  JWT_SECRET,        1h
      signRefresh({id})                      REFRESH_TOKEN_SECRET, 30d
      $transaction([ refreshToken.create, user.update lastLoginAt ])   [2 writes, atomic]
      res.cookie('refreshToken', …, httpOnly/strict/30d)
      200 { accessToken, user }
```

Order is correct and deliberate: the cheap existence check precedes the expensive hash comparison, and the company check follows password verification so it cannot be used to probe company state without valid credentials.

### 6.2 Renewal path

```
POST /api/auth/refresh
  cookie missing                → 401
  jwt.verify(REFRESH_TOKEN_SECRET) throws → 401
  refreshToken.findUnique({ token }) + user + company                 [1 unique-index query]
  !row || expired || !user.isActive        → 401
  company inactive                          → 403
  signAccess(fresh role/companyId from DB)  → 200 { accessToken }
```

The row is not deleted or replaced — the same cookie is reusable for its full 30 days.

### 6.3 Request path

```
authenticate:  header must start with "Bearer " → jwt.verify(JWT_SECRET) → req.user = payload
requireRole:   !req.user → 401 ; role ∉ allowed → 403 ; else next()
```

No database access, so the cost is one signature verification. The consequence is that **`req.user` is a snapshot of the database at token-issue time**, which is the root of AUTH-02.

### 6.4 Browser session

```
login.html      fetch /api/auth/login (credentials:include)
                localStorage: accessToken, userRole, userName, companyId
                redirect by role
dashboard.html  bootstrapUser(): token present? → GET /auth/me → verified identity
admin.html      init(): localStorage.userRole === "SUPERADMIN"?  (no server call)
apiFetch(both)  Authorization: Bearer <localStorage>
                401 → POST /auth/refresh → store new token → retry apiFetch (uncapped)
                refresh fails → localStorage.clear() + /login.html
logout(both)    POST /auth/logout → localStorage.clear() → /login.html
```

### 6.5 Platform posture

| Control | State | Location |
|---|---|---|
| `helmet` | on, **CSP disabled**, COEP disabled | `app.ts:84-88` |
| CORS | `origin: BASE_URL`, `credentials: true` | `app.ts:90` |
| `trust proxy` | `1` | `app.ts:78` |
| `x-powered-by` | disabled | `app.ts:80` |
| Global error handler | logs server-side, returns a generic body | `app.ts:226-230` |
| Secrets in logs | never printed — only variable names | `config/env.ts` |

---

## 7. Test Cases

None of the following exist today. `tests/accounts.test.ts` covers email normalisation and duplicate-email classification only; no test calls `login`, `refresh`, `logout`, `authenticate` or `requireRole`. The catalogue is written so each row can be implemented directly.

### 7.1 Unit — pure, no database (`node:test`, mockable)

| ID | Target | Case | Expected |
|---|---|---|---|
| TC-U-01 | `loginSchema` | `"  AGENT@Corp.COM "` | parses to `agent@corp.com` |
| TC-U-02 | `loginSchema` | `"not-an-email"` | throws `ZodError` |
| TC-U-03 | `loginSchema` | empty password | throws `ZodError` |
| TC-U-04 | `loginSchema` | body with `role: "SUPERADMIN"` | key dropped from the parsed output |
| TC-U-05 | `authenticate` | no header | 401, `next` not called |
| TC-U-06 | `authenticate` | `"Basic abc"` | 401 |
| TC-U-07 | `authenticate` | `"Bearer "` + expired token | 401 |
| TC-U-08 | `authenticate` | token signed with `REFRESH_TOKEN_SECRET` | 401 (secrets are not interchangeable) |
| TC-U-09 | `authenticate` | token with alg `none` | 401 |
| TC-U-10 | `authenticate` | valid token | `req.user` deep-equals the payload; `next()` called once |
| TC-U-11 | `requireRole` | `req.user` absent | 401 |
| TC-U-12 | `requireRole('SUPERADMIN')` | caller is AGENT | 403 |
| TC-U-13 | `requireRole('AGENT','COMPANY_ADMIN')` | caller is COMPANY_ADMIN | `next()` |
| TC-U-14 | `cookieOptions()` | `NODE_ENV=production` | `secure: true` |
| TC-U-15 | `cookieOptions()` | `NODE_ENV=development` | `secure: false`, still `httpOnly` + `strict` |
| TC-U-16 | `checkEnv()` | placeholder `JWT_SECRET` | error listed |
| TC-U-17 | `checkEnv()` | `JWT_SECRET === REFRESH_TOKEN_SECRET` | error listed |
| TC-U-18 | `checkEnv()` | `BASE_URL=http://localhost` with `NODE_ENV=production` | error listed |
| TC-U-19 | `checkEnv()` | `DEMO_MODE=1` | zero errors, one warning |
| TC-U-20 | `generatePassword` | 1000 samples | all length 12, alphabet excludes `I l 1 O 0`, no duplicates |

### 7.2 Integration — against a disposable Postgres (extends `tests/integration.test.ts`)

| ID | Case | Expected |
|---|---|---|
| TC-I-01 | Login, active user + active company | 200, `accessToken` decodes to `{id,email,role,companyId}`, cookie `HttpOnly; SameSite=Strict` |
| TC-I-02 | Login stamps `lastLoginAt` and inserts exactly one `RefreshToken` row | both assertions hold in one transaction |
| TC-I-03 | Login with unknown email | 401, body byte-identical to TC-I-04 |
| TC-I-04 | Login with wrong password | 401, body byte-identical to TC-I-03 |
| TC-I-05 | Login as a deactivated user | 401, no `RefreshToken` row created |
| TC-I-06 | Login into a deactivated company | 403 `COMPANY_INACTIVE` |
| TC-I-07 | Login as SUPERADMIN (`companyId = null`) | 200 |
| TC-I-08 | Login with mixed-case email | 200 |
| TC-I-09 | Refresh with the cookie from TC-I-01 | 200, new token, **row still present** (documents the no-rotation rule) |
| TC-I-10 | Refresh after logout | 401 |
| TC-I-11 | Refresh with `expiresAt` forced into the past | 401 |
| TC-I-12 | Refresh after the user is deactivated | 401 |
| TC-I-13 | Refresh after the company is deactivated | 403 |
| TC-I-14 | Change the user's role, then refresh | new token carries the **new** role |
| TC-I-15 | Move the user to another company, then refresh | new token carries the **new** `companyId` |
| TC-I-16 | Logout twice | both 200, row count 0 |
| TC-I-17 | `/me` with a valid token | company block includes `balance`, `creditLimit`, `market` |
| TC-I-18 | `/me` after the user row is deleted | 404 |
| TC-I-19 | Password reset by an admin | all `RefreshToken` rows for that user deleted; the old cookie now 401s |
| TC-I-20 | `DELETE /api/users/:id` for a user with history | `isActive=false`, tokens deleted, mode `DEACTIVATED` |
| TC-I-21 | **Deactivate a company, then reactivate it, then log in as one of its users** | **Currently 401 — documents AUTH-01** |
| TC-I-22 | `PATCH /api/users/:id {isActive:false}` then reuse the access token | still accepted until expiry — documents AUTH-02 |
| TC-I-23 | Move a user from company A to B, then call a scoped list endpoint with the **old** access token | returns company A data — documents AUTH-02 |

### 7.3 Security

| ID | Case | Expected |
|---|---|---|
| TC-S-01 | 11 failed logins from one IP | 11th → 429 with `RateLimit-*` headers |
| TC-S-02 | 10 failures, 1 success, 5 more failures | success does not consume budget |
| TC-S-03 | Same account, 50 attempts across 50 IPs | **currently all processed** — documents AUTH-08 |
| TC-S-04 | Access token replayed after logout | still accepted — documents AUTH-02 |
| TC-S-05 | Refresh token replayed from a second client | accepted; no reuse signal — documents AUTH-06 |
| TC-S-06 | Refresh JWT re-signed with a guessed secret | 401 |
| TC-S-07 | `alg: none` token to any protected route | 401 |
| TC-S-08 | Access token used as a refresh cookie (and vice-versa) | 401 both ways |
| TC-S-09 | SQL/NoSQL metacharacters in the email field | 400 or 401, never a 500 |
| TC-S-10 | Response timing: unknown email vs wrong password, 200 samples | currently separable — documents AUTH-13 |
| TC-S-11 | `GET /admin.html` with no session | HTML is served (static) — confirm no data is embedded in it |
| TC-S-12 | Every `/api/*` route with no `Authorization` header | 401, except `/api/auth/*` and `/api/health` |

### 7.4 End-to-end (browser)

| ID | Case | Expected |
|---|---|---|
| TC-E-01 | Sign in as an agent | lands on `/dashboard.html`, name and wallet render |
| TC-E-02 | Sign in as SUPERADMIN | lands on `/admin.html` |
| TC-E-03 | Agent token, open `/admin.html` directly | server 403s every call; page must not present usable admin controls |
| TC-E-04 | Set `localStorage.userRole="SUPERADMIN"` as an agent, open `/admin.html` | admin shell renders — documents AUTH-05 |
| TC-E-05 | Let the access token expire, then click any page | silent refresh, no visible interruption |
| TC-E-06 | Delete the refresh cookie, then act | redirected to login, `localStorage` cleared |
| TC-E-07 | Logout, then press Back | not returned to an authenticated view |
| TC-E-08 | Click "Forgot password?" | **nothing happens** — documents AUTH-04 |
| TC-E-09 | Tick "Remember this device", sign in, inspect the cookie | identical 30-day cookie — documents AUTH-14 |
| TC-E-10 | Sign in in Arabic | RTL layout, translated errors |
| TC-E-11 | Wrong password | inline error, form still usable, password field retained |
| TC-E-12 | Backend unreachable | network-error message, no infinite spinner |

**Suggested target for the first implementation pass:** TC-U-01…TC-U-20 (pure, run in the existing `npm test` harness with no database) and TC-I-01…TC-I-23 (added to the currently-placeholder `tests/integration.test.ts`).

---

## 8. Issues

Severity reflects **risk to this business**: a B2B portal where a session carries the authority to spend an agency's prepaid wallet.

### AUTH-01 — Reactivating a company leaves all of its users locked out · **High**

`deleteCompany` deactivates the company **and every user in it** (`companies.controller.ts:451-461`). `updateCompany` writes only the company row (`:322-343`) — no user is ever re-enabled. After a deactivate/reactivate cycle every agent hits `!user.isActive` at `auth.controller.ts:33` and receives **"Invalid credentials"**, the same message as a wrong password.

*Impact:* an agency suspended for non-payment and then reinstated cannot sign in, and the error tells them their password is wrong. Support will chase a password problem that does not exist. The comment at `auth.controller.ts:44-45` ("access is restored automatically on reactivation") is accurate for the company check but false for this path.

*Recommendation:* reactivating a company should re-enable the users it deactivated (or the deactivation should be recorded so it can be reversed precisely). At minimum, distinguish "account disabled" from "wrong password" for an existing user.

### AUTH-02 — An access token cannot be revoked · **High**

`authenticate` verifies a signature and trusts the payload (`middleware/auth.ts:28-29`). Nothing re-reads `isActive`, `role` or `companyId`. For up to `JWT_EXPIRES_IN` (default 1 h) after any of these events, the old authority stands:

| Event | Window |
|---|---|
| User deactivated (`PATCH /users/:id`) | ≤ 1 h |
| Company deactivated | ≤ 1 h |
| Logout | ≤ 1 h |
| Password reset (tokens revoked, access token not) | ≤ 1 h |
| **Role changed** (AGENT → SUPERADMIN is not the risk; SUPERADMIN → AGENT is) | ≤ 1 h |
| **Company changed** | ≤ 1 h |

The company case is the sharpest: every list and read endpoint scopes on `req.user.companyId`, so a user moved from agency A to agency B keeps reading agency A's bookings, invoices and wallet for the remainder of the token's life.

*Recommendation:* either shorten the access token materially (5–15 min) so the window is small, or add a cheap revocation check — a `tokenVersion` integer on `User` embedded in the payload and compared on each request, or a short-TTL cache of "sessions invalidated after" timestamps.

### AUTH-03 — Access token in `localStorage` with CSP disabled · **High**

The token is written to `localStorage` (`login.html:199-202`) and read on every call (`dashboard.html:265`, `admin.html:381`). `helmet` runs with `contentSecurityPolicy: false` (`app.ts:84-88`) because the portals are ~15,000 lines of inline script. Any injection in that surface yields a bearer token valid for up to an hour, plus the role and company id beside it.

Already recorded as C-5 in `SECURITY_AND_REVIEW_AR.md`; restated here because it is this module's asset that is exposed. Note the mitigating fact that the *refresh* token is correctly `httpOnly` and therefore not reachable from script.

*Recommendation:* treat as a paired change with AUTH-02 — a short access token limits the value of what an XSS can steal. Moving the access token to memory-only (re-obtained via refresh on load) removes the persistent copy without a CSP rollout.

### AUTH-04 — No password self-service, and the login page advertises one that does not exist · **High**

* `login.html:99` renders **"Forgot password?"** as a `<button type="button">` with **no `onclick` and no handler** — clicking does nothing.
* No forgot-password, reset-request or password-change endpoint exists anywhere (`grep` over `src/`).
* `POST /api/users/:id/reset-password` is gated at the router by `requireRole('SUPERADMIN','COMPANY_ADMIN')`, so an **AGENT cannot change their own password at all**. A `COMPANY_ADMIN` cannot either: `canManageTarget` (`users.controller.ts:16-18`) only allows targets whose role is `AGENT`, which excludes themselves.
* Every password change therefore requires an administrator, and the endpoint returns the new plaintext password in the JSON response (`users.controller.ts:189`).

*Impact:* a user who suspects their password is compromised has no way to change it. The dead button converts that gap into a visible broken promise on the first screen of the product.

*Recommendation:* add `POST /api/auth/change-password` (current password + new password, revoking that user's refresh tokens on success) and either implement forgot-password over email or remove the button.

### AUTH-05 — The admin portal gate trusts `localStorage` alone · **Medium**

`admin.html:8701-8706` admits the user when `localStorage.userRole === "SUPERADMIN"` and never calls `/auth/me`. `dashboard.html:6571-6582` does verify with the server and bounces a SUPERADMIN to the admin portal. The two portals disagree.

*Impact:* not privilege escalation — every admin route carries `requireRole('SUPERADMIN')`, so the API refuses. But the admin shell renders for anyone who edits one `localStorage` key, and a stale value produces a confusing half-broken screen full of 403 toasts.

*Recommendation:* mirror `bootstrapUser()` — call `/auth/me` and gate on the server's answer.

### AUTH-06 — No refresh-token rotation, reuse detection, or hashing at rest · **Medium**

The row is created at login and never replaced (`auth.controller.ts:56-62`, `:105-107`). The same 30-day cookie is accepted indefinitely, and the raw JWT is stored in the `token` column in plaintext.

*Impact:* a stolen refresh token is a 30-day session that is indistinguishable from the legitimate user's, with no signal available to detect the theft. Anyone with read access to the database — a backup, a support query, a logged Prisma statement — holds live sessions.

*Recommendation:* rotate on every refresh (issue a new token, delete the old row) and treat presentation of an already-rotated token as a compromise signal that revokes the whole family. Store a SHA-256 of the token rather than the token itself.

### AUTH-07 — `RefreshToken` rows are never pruned · **Medium**

Rows are removed only by logout, password reset, or user removal. A user who signs in daily on two devices and never clicks logout accumulates rows indefinitely; expired rows are never swept.

*Impact:* unbounded growth on a table with two indexes, and an ever-larger population of long-lived credentials whose only expiry is a field nobody reaps.

*Recommendation:* a scheduled `deleteMany({ expiresAt: { lt: now } })`, plus a cap or replacement policy per user.

### AUTH-08 — Throttling is per-IP only, and only on `/login` · **Medium**

`loginLimiter` keys on IP (`auth.routes.ts:14-21`). There is no per-account counter, no lockout, no CAPTCHA, and no delay that grows with failures. Credential stuffing distributed over many source addresses is unthrottled against any single account. `/api/auth/refresh` carries no limiter at all.

*Recommendation:* add a per-email counter alongside the IP bucket (for example 5 failures / 15 min / account, with an exponential delay), and a modest limiter on `/refresh`.

### AUTH-09 — No authentication audit trail · **Medium**

The only artefact of a sign-in is `User.lastLoginAt` (`auth.controller.ts:63`). Nothing records failed attempts, source IP, user agent, refreshes, logouts, or who reset whose password. `login.html:108` tells the user *"Activity is logged for account security."*

*Impact:* after a suspected compromise on an account that can spend a wallet, there is nothing to investigate with. The statement on the login screen is not currently true.

*Recommendation:* an append-only `AuthEvent` table (`userId?`, `email`, `event`, `ip`, `userAgent`, `success`, `createdAt`) written on login success/failure, refresh, logout and admin password reset.

### AUTH-10 — `jwt.verify` does not pin the algorithm · **Low**

`middleware/auth.ts:28` and `auth.controller.ts:86` call `jwt.verify(token, secret)` with no `algorithms` option. On `jsonwebtoken@9.0.3` a string secret restricts verification to HMAC and rejects `none`, so **this is not exploitable today**. It is one dependency upgrade or key-type change away from mattering.

*Recommendation:* pass `{ algorithms: ['HS256'] }` at both call sites.

### AUTH-11 — The browser's 401 handler can loop without bound · **Low**

`apiFetch` (`dashboard.html:272-282`, `admin.html:388-396`) responds to a 401 by refreshing and calling itself again, with no attempt counter. If refresh keeps returning 200 while the API keeps returning 401 — a rotated `JWT_SECRET`, a malformed payload, a token the server will not accept — the browser issues refresh/request pairs indefinitely.

*Recommendation:* allow one retry, then clear and redirect.

### AUTH-12 — Password policy is a length floor · **Low**

`z.string().min(8)` on create and reset (`users.schema.ts:9,24`) — no complexity, no breach-list check, no reuse or expiry rules. Generated passwords are strong (`BR-104`); user-chosen ones need only eight characters. (Login correctly accepts `min(1)`: a length rule there would leak policy.)

### AUTH-13 — User enumeration by response timing · **Low**

`bcrypt.compare` at cost 12 (~250 ms) runs only when the email matched a row (`auth.controller.ts:33-38`). A non-existent email returns after a single indexed query. Bodies and status codes are identical, so the leak is timing only.

*Recommendation:* compare against a fixed dummy hash when no user is found, so both paths cost the same.

### AUTH-14 — "Remember this device" does nothing · **Low**

`login.html:96` renders the checkbox; `handleLogin` never reads it (`:174-209`). The refresh cookie is always 30 days regardless of the choice.

*Recommendation:* honour it (short cookie when unticked) or remove the control.

### AUTH-15 — Preview mode authenticates nobody · **Low / Informational**

In `DEMO_MODE`, `currentUser()` falls back to `DEMO_USERS[0]` for any request with a missing or invalid token (`demo.router.ts:50-61`), and `DEMO_USERS[0]` is the **SUPERADMIN** (`demo.fixtures.ts:48`). The signing secret falls back to a hard-coded string when `JWT_SECRET` is unset (`demo.router.ts:48`), and `checkEnv()` returns zero errors in this mode (`config/env.ts:34-41`).

This is contained — the router only ever answers from fixtures and writes nothing — but it means a `DEMO_MODE=1` deployment exposes the whole fixture API to anonymous callers as an administrator, and the usual production guardrails are switched off. Fixture logins are also real-looking credentials committed to the repository (`demo.fixtures.ts:55-60`).

*Recommendation:* keep the mode, but make it impossible to combine with `NODE_ENV=production`, and require the token rather than defaulting to the admin fixture.

### AUTH-16 — CORS origin depends on an unvalidated variable outside production · **Low**

`app.ts:90` passes `origin: process.env.BASE_URL` with `credentials: true`. Production is protected by `checkEnv()`, which makes `BASE_URL` mandatory. Outside production an unset value falls through to the `cors` default (`*`), which combined with `credentials: true` is rejected by browsers — a confusing failure mode rather than a hole.

### AUTH-17 — Duplication · **Informational**

* The access-token payload is built twice, by hand, in two places (`auth.controller.ts:51` and `:106`); they must not drift.
* The entire `apiFetch` + 401-refresh + `logout` block is duplicated verbatim between `dashboard.html` and `admin.html` — the two copies have already diverged in their boot gate (AUTH-05).
* The company-inactive rule is expressed twice, against two different shapes (`:46`, `:100`).

---

## 9. Improvements

Ordered by value against effort. None of these were applied.

### Immediate (small, contained, high value)

| # | Change | Addresses | Effort |
|---|---|---|---|
| 1 | Reactivate a company's users when the company is reactivated | AUTH-01 | XS |
| 2 | Pin `{ algorithms: ['HS256'] }` on both `jwt.verify` calls | AUTH-10 | XS |
| 3 | Cap the browser's 401 retry at one attempt | AUTH-11 | XS |
| 4 | Gate `admin.html` on `/auth/me` like `dashboard.html` | AUTH-05 | S |
| 5 | Remove or wire the "Forgot password?" and "Remember this device" controls | AUTH-04, AUTH-14 | S |
| 6 | Compare against a dummy hash when the user is not found | AUTH-13 | XS |
| 7 | Implement TC-U-01…TC-U-20 in the existing harness | test coverage | S |

### Short term (the module's real gaps)

| # | Change | Addresses | Effort |
|---|---|---|---|
| 8 | `POST /api/auth/change-password` — current + new password, revokes that user's refresh tokens | AUTH-04 | M |
| 9 | Shorten the access token to 15 minutes and add `tokenVersion` to `User`, compared in `authenticate` | AUTH-02, AUTH-03 | M |
| 10 | Rotate refresh tokens on every use; store a SHA-256 instead of the raw token; treat reuse as compromise | AUTH-06 | M |
| 11 | Per-account failure counter beside the IP bucket; small limiter on `/refresh` | AUTH-08 | S |
| 12 | `AuthEvent` audit table + writes on login/refresh/logout/reset | AUTH-09 | M |
| 13 | Scheduled sweep of expired `RefreshToken` rows | AUTH-07 | S |
| 14 | Implement TC-I-01…TC-I-23 against a disposable Postgres, replacing the placeholders in `tests/integration.test.ts` | test coverage | M |

### Longer term (product decisions, not defects)

| # | Change | Addresses |
|---|---|---|
| 15 | Password policy: complexity or a breach-list check on create/reset | AUTH-12 |
| 16 | Forgot-password over email with a single-use, short-lived token | AUTH-04 |
| 17 | Optional MFA for SUPERADMIN and COMPANY_ADMIN — the roles that can move money | enterprise readiness |
| 18 | "Active sessions" view with per-device revocation | AUTH-06, AUTH-09 |
| 19 | Refuse to start when `DEMO_MODE=1` and `NODE_ENV=production` coincide | AUTH-15 |
| 20 | Extract one shared portal client (`apiFetch`, refresh, logout, boot gate) used by both HTML files | AUTH-17 |

---

## 10. Score — M01 Authentication

Scored 0–10 against the six dimensions defined in `APPLICATION_AUDIT_REPORT.md`. These are **module scores for this phase**, not application scores.

| # | Dimension | Score | Justification |
|---|---|---|---|
| 1 | **Best Practices** | **6 / 10** | Strong fundamentals: bcrypt cost 12 everywhere, refresh tokens as database rows rather than bare JWTs, `httpOnly`+`SameSite=strict` cookie, login throttling, Zod validation before any query, uniform error bodies that do not leak which factor failed, secrets validated at boot and never logged, sessions revoked on password reset and user removal. Held back by the access token living in `localStorage` under a disabled CSP, no algorithm pinning, no refresh rotation, no self-service password change, and a password floor of eight characters. |
| 2 | **Performance** | **8 / 10** | Login is one indexed lookup plus one deliberate bcrypt cost plus a two-write transaction; refresh is a single unique-index read; every authenticated request costs one signature verification and no database round-trip. No N+1, no scan, nothing to cache. Points off for a `RefreshToken` table that grows without a sweep, and for an uncapped client retry loop. |
| 3 | **Enterprise Readiness** | **4 / 10** | The building blocks of a session exist, but the operational controls an enterprise buyer expects do not: no way to revoke an issued access token, no MFA, no auth audit trail beyond `lastLoginAt`, no per-account lockout, no password policy or rotation, no session inventory, no self-service recovery — and one lifecycle path (AUTH-01) that strands every user of a reinstated agency. Deactivation of a user or company is honoured, which is what keeps this from scoring lower. |
| 4 | **Clean Code** | **8 / 10** | 135 lines of controller with four small single-purpose handlers, a 34-line middleware, a 17-line guard, an 11-line schema. Guard clauses read top-to-bottom in the right order, names say what they do, and the comments explain *why* (the email-normalisation note, the "stored row is the source of truth" note) rather than restating the code. Points off only for the hand-built duplicate JWT payload and for authorization state being implicit in a payload shape rather than a named type with one constructor. |
| 5 | **DRY** | **6 / 10** | The server side is disciplined — `signAccess`, `signRefresh` and `cookieOptions` are each defined once. The duplication is at the edges: the access-token payload literal written twice, the company-inactive rule expressed twice, and — the significant one — the whole browser session client copied between `dashboard.html` and `admin.html`, where the two copies have already drifted apart (one verifies with the server, the other trusts `localStorage`). |
| 6 | **UI/UX Professionalism** | **5 / 10** | The sign-in screen itself is genuinely well made: bilingual EN/AR with correct RTL, theme toggle, password reveal, inline per-field errors, a loading state, a distinct message for a network failure, real `aria-label`s and `autocomplete` hints. It is undercut by two controls that do nothing at all — "Forgot password?" and "Remember this device" — by a footer line promising activity logging the system does not perform, by an admin gate that trusts a value the user can edit, and by an expiring session that ends in a silent redirect with no explanation. |

### Weighted result

Weights reflect what this module carries for this product: a session here authorises spending an agency's prepaid wallet.

| Dimension | Score | Weight | Contribution |
|---|---|---|---|
| Best Practices | 6 | 30% | 1.80 |
| Enterprise Readiness | 4 | 25% | 1.00 |
| Clean Code | 8 | 15% | 1.20 |
| UI/UX Professionalism | 5 | 15% | 0.75 |
| DRY | 6 | 10% | 0.60 |
| Performance | 8 | 5% | 0.40 |
| **Overall** | **5.75 / 10** | 100% | |

**Reading of the score.** The code that exists is well written and the core cryptographic choices are correct — this is not a module that needs rewriting. What it lacks is the operational layer around the session: revocation, rotation, audit, recovery, and per-account throttling. Six of the seven "Immediate" items in §9 are extra-small or small changes, and together with items 8–10 they would move Best Practices and Enterprise Readiness substantially without touching the module's shape. AUTH-01 is the one item that is a live defect rather than a hardening gap and should be treated as a bug, not as an improvement.

---

## 11. Coverage Summary

| Aspect | State after this audit |
|---|---|
| Features identified | 12 (F-01…F-12) |
| Use cases documented | 41 |
| Business rules registered | 18 (BR-001…BR-004 carried forward, BR-101…BR-114 new) |
| Issues raised | 17 (3 High, 5 Medium, 6 Low, 3 Informational) |
| Live defect vs hardening gap | 1 defect (AUTH-01); the remainder are hardening or product gaps |
| Test cases specified | 67 (20 unit, 23 integration, 12 security, 12 E2E) |
| Test cases implemented today | 0 for this module (`tests/accounts.test.ts` touches only email normalisation) |
| Dimensions scored | 6 of 6 |

**Suggested next step:** per the audit order in `APPLICATION_AUDIT_REPORT.md` §17, M02 Users & Roles is next — it owns `canManageTarget`, the role-change path, and the session-revocation calls this module depends on, so auditing it immediately after M01 keeps the identity chain contiguous. AUTH-01 and the seven "Immediate" items can be implemented in parallel as a separate change.

---

*End of Phase 2 — M01. No application code, schema, configuration or dependency was modified in producing this report.*
