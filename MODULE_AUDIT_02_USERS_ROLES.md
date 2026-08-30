# MODULE AUDIT — M02 Users & Roles

**Phase:** 2 (module-by-module audit) · **Module:** M02 — Users & Roles
**Repository:** `eyadsofian/elbakri-portal` · branch `claude/cruise-program-options-oovbji`
**Date:** 2026-08-30
**Workflow position:** Feature → Use Case → Business Rule → Technical Implementation → Test Cases → Issues → Improvements → Score
**Predecessors:** `APPLICATION_AUDIT_REPORT.md` §5 (M02), §6, §12 · `MODULE_AUDIT_01_AUTHENTICATION.md`

M02 is the module that **creates the identities M01 authenticates and revokes the sessions M01 issues**. It is audited immediately after M01 to keep the identity chain contiguous. No application code was modified. Every finding cites the file and line it was read from.

---

## 1. Scope & Method

| Layer | Files read |
|---|---|
| Backend | `src/modules/users/users.controller.ts` (252), `users.routes.ts` (22), `users.schema.ts` (29) |
| Second creation path | `src/modules/companies/companies.controller.ts:92-196` (`createCompany` → first `COMPANY_ADMIN`), `companies.schema.ts` |
| Authorization | `src/middleware/role.ts`, `canManageTarget` (`users.controller.ts:15-18`) |
| Data | `prisma/schema.prisma` → `User`, `Role`, and **every** model carrying `createdById` |
| Frontend | `public/admin.html:2382-2490` (users screen), `public/dashboard.html` (absence of a users screen — verified) |
| Seed | `prisma/seed.ts:22-60` (the only bootstrap identity) |
| Support | `src/shared/helpers.ts` (`generatePassword`), `src/shared/prisma-errors.ts`, `src/shared/email.templates.ts` |

**Out of scope** — how each *other* module consumes `req.user.role` (that matrix is `APPLICATION_AUDIT_REPORT.md` §6). This audit covers the production, mutation and removal of identities, and the enforcement of the role model at its own boundary.

---

## 2. Module Surface

**Endpoints (5)** — mounted at `/api/users` behind `authenticate` (`app.ts:187`), then a **router-level** role gate.

```ts
router.use(requireRole('SUPERADMIN', 'COMPANY_ADMIN'));   // users.routes.ts:15
```

| Method | Path | Role gate | Body schema | Wrapped |
|---|---|---|---|---|
| GET | `/api/users` | SUPERADMIN, COMPANY_ADMIN | — | `asyncHandler` |
| POST | `/api/users` | SUPERADMIN, COMPANY_ADMIN | `createUserSchema` | `asyncHandler` |
| PATCH | `/api/users/:id` | SUPERADMIN, COMPANY_ADMIN | `updateUserSchema` | `asyncHandler` |
| POST | `/api/users/:id/reset-password` | SUPERADMIN, COMPANY_ADMIN | `resetPasswordSchema` | `asyncHandler` |
| DELETE | `/api/users/:id` | SUPERADMIN, COMPANY_ADMIN | — | `asyncHandler` |

This is the only module in the application whose handlers are **all** wrapped in `asyncHandler`, so a rejected promise reaches the global error handler instead of hanging the request.

**A sixth creation path exists outside this router:** `POST /api/admin/companies` creates a company **and its first `COMPANY_ADMIN`** in one transaction (`companies.controller.ts:154-167`).

**Role model** — `enum Role { SUPERADMIN, COMPANY_ADMIN, AGENT }`. Three fixed values, no permission table, no custom roles. `AGENT` is the default (`schema.prisma`, `users.schema.ts:10`).

**Response shape** — every handler returns through `userSelect` (`users.controller.ts:7-11`), an explicit allow-list that omits `password`. No handler can leak a hash.

---

## 3. Features

| ID | Feature | Entry point | Actors |
|---|---|---|---|
| F-01 | List users, company-scoped | `GET /api/users` | SUPERADMIN, COMPANY_ADMIN |
| F-02 | Create a user | `POST /api/users` | SUPERADMIN (any role), COMPANY_ADMIN (AGENT only) |
| F-03 | Update identity, role, company, status | `PATCH /api/users/:id` | SUPERADMIN, COMPANY_ADMIN |
| F-04 | Reset a password and revoke that user's sessions | `POST /api/users/:id/reset-password` | SUPERADMIN, COMPANY_ADMIN |
| F-05 | Remove a user — deactivate or delete by history | `DELETE /api/users/:id` | SUPERADMIN, COMPANY_ADMIN |
| F-06 | Manageability rule | `canManageTarget` | system |
| F-07 | Role gate | `requireRole` at router level | system |
| F-08 | Provision an agency's first administrator | `POST /api/admin/companies` | SUPERADMIN |
| F-09 | Bootstrap the platform's only SuperAdmin | `npm run db:seed` | operator |
| F-10 | Admin users screen | `admin.html:2382-2490` | SUPERADMIN |

---

## 4. Use Cases

### F-01 List

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-01.1 | SUPERADMIN lists all users | every company, paginated | `users.controller.ts:32-34` |
| UC-01.2 | SUPERADMIN filters `?companyId=` | scoped to that company | `:33` |
| UC-01.3 | COMPANY_ADMIN lists | forcibly pinned to their own `companyId` — a supplied `companyId` is ignored | `:34` |
| UC-01.4 | Default call | only `isActive: true` rows | `:26-30` |
| UC-01.5 | `?includeInactive=true` | active and inactive | `:28-29` |
| UC-01.6 | `?isActive=false` | only inactive (explicit filter wins over `includeInactive`) | `:26-27` |
| UC-01.7 | `?limit=500` | capped at 100 by `paginate` | `shared/helpers.ts` |
| UC-01.8 | AGENT calls the endpoint | 403 at the router, before any handler | `users.routes.ts:15` |
| UC-01.9 | Response contents | never includes `password` | `:7-11` |

### F-02 Create

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-02.1 | SUPERADMIN creates an AGENT in company X | 201 + `tempPassword` in the body | `:79-102` |
| UC-02.2 | SUPERADMIN creates a SUPERADMIN | created with `companyId: null` regardless of what was sent | `:86` |
| UC-02.3 | SUPERADMIN creates a company user without `companyId` | 400 `VALIDATION_ERROR` | `:66-69` |
| UC-02.4 | COMPANY_ADMIN creates an AGENT | company and role forcibly rewritten to their own | `:56-63` |
| UC-02.5 | COMPANY_ADMIN sends `role: "COMPANY_ADMIN"` | 403 "Can only create AGENT users" | `:57-60` |
| UC-02.6 | COMPANY_ADMIN sends another company's `companyId` | silently overwritten with their own | `:61` |
| UC-02.7 | No password supplied | 12-char password generated with `crypto.randomInt` | `:71`, `helpers.ts:34-49` |
| UC-02.8 | Password shorter than 8 characters supplied | 400 from Zod | `users.schema.ts:9` |
| UC-02.9 | Duplicate email | 409 `EMAIL_EXISTS` naming the address | `:91-98` |
| UC-02.10 | Mixed-case email | normalised before the write | `users.schema.ts:6` |
| UC-02.11 | **Non-existent `companyId`** | **500** — Prisma P2003 is not mapped | see USR-06 |
| UC-02.12 | `companyId` of a **deactivated** company | 201 — the user is created and can never sign in | see USR-06 |
| UC-02.13 | Credential delivery | **none** — no email is sent | see USR-04 |

### F-03 Update

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-03.1 | SUPERADMIN renames any user | 200 | `:141-152` |
| UC-03.2 | COMPANY_ADMIN edits an AGENT of their company | 200 | `canManageTarget` |
| UC-03.3 | COMPANY_ADMIN edits another COMPANY_ADMIN | 403 | `:17` |
| UC-03.4 | COMPANY_ADMIN edits **themselves** | 403 — their own role is not `AGENT` | `:17` |
| UC-03.5 | COMPANY_ADMIN edits a user of another company | 403 | `:17` |
| UC-03.6 | COMPANY_ADMIN sends `role` | 403 "Only SUPERADMIN can change roles" | `:122-125` |
| UC-03.7 | COMPANY_ADMIN sends `companyId` | 403 "Only SUPERADMIN can change company" | `:127-130` |
| UC-03.8 | Promote an AGENT to SUPERADMIN | allowed; `companyId` forced to null | `:133-134` |
| UC-03.9 | Demote a SUPERADMIN without giving a company | 400 `VALIDATION_ERROR` | `:134-137` |
| UC-03.10 | Change email to one already in use | 409 `EMAIL_EXISTS` | `:153-160` |
| UC-03.11 | Deactivate a user | 200; their next refresh fails, existing access token survives | `:141`, M01 AUTH-02 |
| UC-03.12 | **SUPERADMIN deactivates themselves** | **200 — permanent lockout** | see USR-02 |
| UC-03.13 | **SUPERADMIN demotes themselves to AGENT** | **200 — permanent lockout** | see USR-02 |
| UC-03.14 | Move a user to another company | 200; **no session revocation** | see USR-05 |
| UC-03.15 | Change a user's email | 200; no confirmation to either address | see USR-09 |

### F-04 Reset password

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-04.1 | Admin resets with no body password | 12-char generated password returned | `:181` |
| UC-04.2 | Admin supplies a password | used verbatim if ≥8 characters | `users.schema.ts:24` |
| UC-04.3 | Every refresh token of that user | deleted in the same transaction | `:184-187` |
| UC-04.4 | The user's current access token | still valid until it expires | M01 AUTH-02 |
| UC-04.5 | COMPANY_ADMIN resets a non-AGENT | 403 | `:175-178` |
| UC-04.6 | Delivery | returned in the JSON, shown in a modal, **never emailed** | `:189`, `admin.html:2470-2473` |

### F-05 Remove

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-05.1 | Delete yourself | 400 "You cannot delete your own user" | `:193-196` |
| UC-05.2 | Target has bookings / wallet rows / cruise / transport / activity / visa / reception history | `isActive:false` + tokens revoked, `mode: "DEACTIVATED"` | `:236-243` |
| UC-05.3 | Target has no history at all | hard delete + tokens revoked, `mode: "DELETED"` | `:246-251` |
| UC-05.4 | COMPANY_ADMIN deletes an AGENT of their company | allowed | `canManageTarget` |
| UC-05.5 | COMPANY_ADMIN deletes a COMPANY_ADMIN | 403 | `:17` |
| UC-05.6 | **Target created only quote requests** | **500 `INTERNAL_ERROR`, nothing happens** | see USR-01 |
| UC-05.7 | **Target created only activity packages or SIM requests** | **500 `INTERNAL_ERROR`, nothing happens** | see USR-01 |

### F-08 / F-09 / F-10

| ID | Use case | Expected | Verified |
|---|---|---|---|
| UC-08.1 | Create a company without `adminEmail` | the admin login reuses the company email | `companies.controller.ts:108` |
| UC-08.2 | Create a company whose `adminEmail` already exists | 409 naming *which* email clashed, company rolled back | `:151,170,176-183` |
| UC-08.3 | Company + first admin | created in one transaction — never a company nobody can sign in to | `:123-172` |
| UC-08.4 | Credential delivery for this path | `welcomeEmail` sent to company email, admin email and the internal inbox | `:187-192` |
| UC-09.1 | Seed on an empty database | one SUPERADMIN, random 20-char password printed once | `seed.ts:42-58` |
| UC-09.2 | Seed when that email already exists | left untouched — **cannot restore a locked-out admin** | `seed.ts:31-37` |
| UC-09.3 | `SEED_ADMIN_PASSWORD` under 12 characters | throws | `seed.ts:43-45` |
| UC-10.1 | Admin opens the users page | up to 100 rows, "show inactive" toggle only | `admin.html:2383-2397` |
| UC-10.2 | Admin creates/resets and closes the modal | password is unrecoverable — reset again | `admin.html:2457, 2470` |
| UC-10.3 | COMPANY_ADMIN wants to manage their agents | **no screen exists in the agency portal** | see USR-03 |

---

## 5. Business Rules

Carried forward from `APPLICATION_AUDIT_REPORT.md` §12 and extended.

| ID | Rule | Source | Confidence |
|---|---|---|---|
| BR-005 | A `SUPERADMIN` has no company; every other role must have one | `users.controller.ts:66,86,133-137` | Confirmed |
| BR-006 | A `COMPANY_ADMIN` may manage only `AGENT`s of their own company | `users.controller.ts:15-18` | Confirmed |
| BR-007 | Only a `SUPERADMIN` may change `role` or `companyId` | `users.controller.ts:122-130` | Confirmed |
| BR-008 | Generated passwords use `crypto.randomInt` over a look-alike-free alphabet | `shared/helpers.ts:34-49` | Confirmed |
| BR-201 | A `COMPANY_ADMIN`'s create request is rewritten server-side to their own company and role `AGENT`, whatever was sent | `users.controller.ts:56-63` | Confirmed |
| BR-202 | Setting the role to `SUPERADMIN` nulls `companyId` on both create and update | `:86`, `:133` | Confirmed |
| BR-203 | Removal is **deactivation** when operational history exists and a **hard delete** otherwise | `:236-249` | Confirmed |
| BR-204 | "Operational history" is judged on **7 of the 10** required creator relations in the schema | `:208-234` vs `schema.prisma` | Confirmed |
| BR-205 | Deleting your own account is refused; **deactivating or demoting it is not** | `:211-214` vs `updateUser` (no guard) | Confirmed |
| BR-206 | Password reset and removal revoke refresh tokens; a role or company change does **not** | `:184-187, 239, 247` vs `:141-152` | Confirmed |
| BR-207 | A duplicate email answers 409 naming the address, never a 500 | `:91-98`, `:153-160` | Confirmed |
| BR-208 | For user-level operations the temporary password is returned in the response body and **never emailed** | `:102`, `:189` | Confirmed |
| BR-209 | An agency's first administrator is created inside the company transaction and **is** emailed the credentials | `companies.controller.ts:154-192` | Confirmed |
| BR-210 | Non-admin listing is pinned to the caller's company; `isActive: true` is the default unless explicitly overridden | `:26-34` | Confirmed |
| BR-211 | No handler ever returns the password hash — `userSelect` is an allow-list | `:7-11` | Confirmed |
| BR-212 | The role model is three fixed values with no permission granularity | `schema.prisma` `enum Role` | Confirmed |
| BR-213 | Whether a `COMPANY_ADMIN` is *meant* to administer their own staff, given the API allows it and no interface offers it | `users.routes.ts:15` vs `dashboard.html` | **Unclear** |

---

## 6. Technical Implementation

### 6.1 Authorization: two layers

```
Layer 1  router.use(requireRole('SUPERADMIN','COMPANY_ADMIN'))   coarse — keeps AGENTs out entirely
Layer 2  canManageTarget(caller, target)                          fine  — per-record
             SUPERADMIN                      → always true
             anyone else                     → target.companyId === caller.companyId
                                               AND target.role === 'AGENT'
Layer 3  explicit field guards in updateUser  → role / companyId are SUPERADMIN-only
```

The design is sound: coarse gate first, ownership second, privileged fields third. `canManageTarget` is applied consistently in `updateUser`, `resetUserPassword` and `deleteUser`.

`createUser` does not use it — it cannot, since there is no target yet — and instead **rewrites the payload** to enforce the same rule (`:56-63`). This is effective but expresses policy by mutating `req.body` rather than by deriving a value.

### 6.2 Create

```
POST /api/users
  requireRole(SUPERADMIN, COMPANY_ADMIN)
  validate(createUserSchema)     email normalised; role defaults to AGENT; password ≥8 if supplied
  createUser()
    dead guard          caller.role ∉ {SUPERADMIN, COMPANY_ADMIN}  → unreachable (router already refused)
    COMPANY_ADMIN       role must be AGENT → force companyId + role
    guard               role ≠ SUPERADMIN && !companyId → 400
    generatePassword(12) if none supplied → bcrypt.hash(cost 12)
    user.create(select: userSelect)
        P2002 on email → 409
        P2003 on companyId → rethrown → 500        ← USR-06
    201 { user, tempPassword }                      ← no email sent, USR-04
```

### 6.3 Remove — the branch that decides deactivate vs delete

```ts
const [bookings, transactions, cruiseBookings, transportBookings,
       activityBookings, visaApplications, airportReceptions] = await Promise.all([...]);   // :215-224
const hasOperationalHistory = [...].some(c => c > 0);                                       // :226-234
```

Seven counts, run in parallel. The schema has **ten** models with a **required** `createdById` (therefore `Restrict` on delete, explicitly or by Prisma's default for required relations):

| # | Model | Referential action | Counted by `deleteUser`? |
|---|---|---|---|
| 1 | `Booking` | `onDelete: Restrict` (explicit) | ✅ |
| 2 | `WalletTransaction` | `onDelete: Restrict` (explicit) | ✅ |
| 3 | `CruiseBooking` | Restrict (default) | ✅ |
| 4 | `TransportBooking` | Restrict (default) | ✅ |
| 5 | `ActivityBooking` | Restrict (default) | ✅ |
| 6 | `VisaApplication` | Restrict (default) | ✅ |
| 7 | `AirportReception` | Restrict (default) | ✅ |
| 8 | **`QuoteRequest`** | `onDelete: Restrict` (explicit, `schema.prisma:704`) | ❌ |
| 9 | **`ActivityPackage`** | Restrict (default, `schema.prisma:1480`) | ❌ |
| 10 | **`SimRequest`** | Restrict (default, `schema.prisma:1877`) | ❌ |

Optional creator relations (`ConsolidatedInvoice`, `PlatformWalletTransaction`, `UiTemplateRevision`) are `SetNull` and safe either way.

### 6.4 Session revocation — where it happens and where it does not

| Operation | Refresh tokens revoked | Source |
|---|---|---|
| Password reset | ✅ same transaction | `:184-187` |
| Remove (deactivate branch) | ✅ same transaction | `:239` |
| Remove (delete branch) | ✅ same transaction | `:247` |
| `PATCH` → `isActive: false` | ❌ | `:141-152` |
| `PATCH` → role change | ❌ | `:141-152` |
| `PATCH` → company change | ❌ | `:141-152` |

Deactivation via `PATCH` is partially covered because `refresh` re-reads `user.isActive` (M01 §6.2). A **role or company change is not covered at all**: the stale refresh token keeps working and, on its next use, mints a token with the *new* values — but the *current* access token keeps the old ones for up to an hour.

### 6.5 Frontend

`admin.html:2382-2490` — a `renderSimpleList` table (name, email, company, role badge, status badge, last login, row actions) with a "show inactive" toggle and a "New User" button. The create/edit modal carries name, Arabic name, email, role, company, status and (create only) an optional password. `saveUser` always submits `role`, `companyId` and `isActive`, whether or not they were touched.

`dashboard.html` has **16** `data-page` values and **none of them is `users`** — verified by enumeration.

---

## 7. Test Cases

No test in the repository calls any handler in this module. `tests/accounts.test.ts` covers `users.schema` email normalisation and `isDuplicateEmailError` classification only — the schema and the error helper, not the controller.

### 7.1 Unit (no database)

| ID | Target | Case | Expected |
|---|---|---|---|
| TC-U-01 | `canManageTarget` | SUPERADMIN → any target | true |
| TC-U-02 | `canManageTarget` | COMPANY_ADMIN → AGENT, same company | true |
| TC-U-03 | `canManageTarget` | COMPANY_ADMIN → AGENT, other company | false |
| TC-U-04 | `canManageTarget` | COMPANY_ADMIN → COMPANY_ADMIN, same company | false |
| TC-U-05 | `canManageTarget` | COMPANY_ADMIN → themselves | false |
| TC-U-06 | `canManageTarget` | caller with `companyId: null` and non-SUPERADMIN role → target with `companyId: null` | false (must not match null-to-null) |
| TC-U-07 | `createUserSchema` | role omitted | defaults to `AGENT` |
| TC-U-08 | `createUserSchema` | `password: "short"` | ZodError |
| TC-U-09 | `createUserSchema` | `"  Admin@Corp.COM "` | `admin@corp.com` |
| TC-U-10 | `createUserSchema` | unknown key `isSuperUser: true` | dropped |
| TC-U-11 | `updateUserSchema` | empty object | valid (no-op update) |
| TC-U-12 | `updateUserSchema` | `role: "OWNER"` | ZodError |
| TC-U-13 | `resetPasswordSchema` | `{}` | valid — password generated server-side |
| TC-U-14 | `generatePassword(12)` | 1000 samples | all length 12, alphabet excludes `I l 1 O 0` |
| TC-U-15 | `isDuplicateEmailError` | P2002 on `email` | true |
| TC-U-16 | `isDuplicateEmailError` | P2003 (FK) | false — documents why USR-06 reaches the 500 path |
| TC-U-17 | history-check list | compare the 7 counted models against every required `createdById` in `schema.prisma` | **fails today** — asserts USR-01 stays fixed |

TC-U-17 is the one that matters most: it turns "somebody must remember to update this list" into a test failure.

### 7.2 Integration (disposable Postgres)

| ID | Case | Expected |
|---|---|---|
| TC-I-01 | SUPERADMIN creates an AGENT | 201, hash stored is not the plaintext, `tempPassword` returned |
| TC-I-02 | The created user can immediately sign in with `tempPassword` | 200 from `/api/auth/login` |
| TC-I-03 | SUPERADMIN creates a SUPERADMIN with a `companyId` | stored `companyId` is null |
| TC-I-04 | COMPANY_ADMIN creates a user naming another company and role `COMPANY_ADMIN` | 403 |
| TC-I-05 | COMPANY_ADMIN creates an AGENT naming another company | created in the **caller's** company |
| TC-I-06 | Duplicate email on create | 409, no row written |
| TC-I-07 | **Create with a `companyId` that does not exist** | **500 today** — should be 400 (USR-06) |
| TC-I-08 | **Create inside a deactivated company** | **201 today**, and the user cannot sign in (USR-06) |
| TC-I-09 | AGENT calls any endpoint in the module | 403 at the router |
| TC-I-10 | COMPANY_ADMIN lists with `?companyId=<other>` | own company only |
| TC-I-11 | `?limit=1000` | at most 100 rows |
| TC-I-12 | Response never contains `password` | assert on the serialized body |
| TC-I-13 | COMPANY_ADMIN patches an AGENT's name | 200 |
| TC-I-14 | COMPANY_ADMIN patches an AGENT and includes `role` | 403 |
| TC-I-15 | SUPERADMIN promotes an AGENT to SUPERADMIN | `companyId` becomes null |
| TC-I-16 | SUPERADMIN demotes a SUPERADMIN without a company | 400 |
| TC-I-17 | **SUPERADMIN sets their own `isActive:false`** | **200 today** — should be refused (USR-02) |
| TC-I-18 | **Demote the last SUPERADMIN** | **200 today** — should be refused (USR-02) |
| TC-I-19 | Move a user A→B, then reuse their old access token on a scoped list | still returns company A data (USR-05, M01 AUTH-02) |
| TC-I-20 | Move a user A→B, then refresh | new token carries company B |
| TC-I-21 | Reset a password | old refresh cookie 401s; new password signs in |
| TC-I-22 | Delete a user with a booking | `mode: "DEACTIVATED"`, row still present, tokens gone |
| TC-I-23 | Delete a user with nothing at all | `mode: "DELETED"`, row gone |
| TC-I-24 | **Delete a user whose only record is a `QuoteRequest`** | **500 today** — expected `DEACTIVATED` (USR-01) |
| TC-I-25 | **Delete a user whose only record is an `ActivityPackage`** | **500 today** — expected `DEACTIVATED` (USR-01) |
| TC-I-26 | **Delete a user whose only record is a `SimRequest`** | **500 today** — expected `DEACTIVATED` (USR-01) |
| TC-I-27 | After the failed delete in TC-I-24 | the user's refresh tokens still exist (the transaction rolled back) |
| TC-I-28 | Delete yourself | 400 |
| TC-I-29 | Create a company | company + `COMPANY_ADMIN` + welcome email, all or nothing |
| TC-I-30 | Create a company whose `adminEmail` is taken | 409 naming the admin email; **no** company row left behind |

### 7.3 Security

| ID | Case | Expected |
|---|---|---|
| TC-S-01 | AGENT `POST /api/users` with role `SUPERADMIN` | 403 at the router |
| TC-S-02 | COMPANY_ADMIN escalates themselves via `PATCH /users/<self>` | 403 (target is not an AGENT) |
| TC-S-03 | COMPANY_ADMIN escalates an AGENT to COMPANY_ADMIN | 403 (role change is SUPERADMIN-only) |
| TC-S-04 | COMPANY_ADMIN resets a password in another company | 403 |
| TC-S-05 | COMPANY_ADMIN enumerates users by id across companies | 403 on every operation; list never shows them |
| TC-S-06 | `password` submitted in `updateUserSchema` | dropped — password can only change through the reset route |
| TC-S-07 | Response body of every endpoint | no `password` field anywhere |
| TC-S-08 | Role taken from the JWT, not the body | changing `role` in a forged body has no effect on `caller.role` |
| TC-S-09 | Temp password appears in the browser network log | confirms USR-04's exposure surface |

### 7.4 End-to-end

| ID | Case | Expected |
|---|---|---|
| TC-E-01 | Admin creates a user and closes the password modal | password unrecoverable — documents USR-04 |
| TC-E-02 | Admin edits only a name | request still carries role/company/status |
| TC-E-03 | Admin deletes a user with history | confirm dialog says "delete", toast says "deactivated" — documents USR-12 |
| TC-E-04 | Tenant with 150 users | only 100 render, no pagination control — documents USR-08 |
| TC-E-05 | COMPANY_ADMIN signs in and looks for staff management | no such page — documents USR-03 |
| TC-E-06 | Admin sets their own status to Inactive and reloads | locked out of the product — documents USR-02 |

---

## 8. Issues

### USR-01 — Removing a user fails with a 500 for the most common agent profile · **High**

`deleteUser` decides between deactivation and hard deletion by counting **7** creator relations (`users.controller.ts:208-234`). The schema has **10** with a required `createdById` and therefore `Restrict` semantics. **`QuoteRequest`, `ActivityPackage` and `SimRequest` are not counted.**

A user whose only footprint is quote requests is judged to have no history, so the code takes the hard-delete branch:

```ts
await prisma.$transaction([
  prisma.refreshToken.deleteMany({ where: { userId } }),
  prisma.user.delete({ where: { id: userId } }),      // ← P2003 foreign-key violation
]);
```

Prisma raises a foreign-key error, nothing maps it, `asyncHandler` forwards it, and the global handler answers **500 `INTERNAL_ERROR`** (`app.ts:226-230`). The transaction rolls back, so the user is neither deactivated nor deleted and their sessions are not revoked. The admin sees "Something went wrong. Please try again." and retrying always fails.

*Why this profile is the common one:* per `APPLICATION_AUDIT_REPORT.md` §5 M06, a quote request is the **only** way an agency can transact for hotels, packages and cruises. An agent who works those three products and nothing else produces exactly `QuoteRequest` rows and nothing the counter looks at.

*Recommendation:* count all ten relations, and map P2003 to a 409 or fall back to deactivation so the operation can never end in a 500.

### USR-02 — A SuperAdmin can lock themselves, and the platform, out with no recovery · **High**

`deleteUser` refuses self-deletion (`:193-196`). `updateUser` has **no equivalent guard**, and there is no "last administrator" protection anywhere. A SUPERADMIN may therefore:

* set their own `isActive: false` (`:141`), or
* change their own role to `AGENT` (`:133`).

If they were the only SUPERADMIN, the platform has no administrator and no route back:

| Recovery attempt | Result |
|---|---|
| Sign in | 401 — `!user.isActive` (`auth.controller.ts:33`) |
| Ask another admin | none exists |
| Self-service | none exists (M01 · AUTH-04) |
| `npm run db:seed` | **no help** — idempotent, skips because the email already exists (`seed.ts:31-37`) |
| Forgot password | no such flow |

The only way out is direct database access. The admin UI makes this two clicks: the edit modal exposes a Status dropdown on every row, including the operator's own (`admin.html:2419`).

*Recommendation:* refuse a self-update that clears `isActive` or lowers your own role, and refuse the change when it would leave zero active SUPERADMINs.

### USR-03 — Delegated administration exists in the API and nowhere in the product · **High**

`users.routes.ts:15` admits `COMPANY_ADMIN`, and `canManageTarget` grants them their own AGENTs. But the agency portal has **no users page** — `dashboard.html` carries 16 `data-page` values and none is `users`. The users screen lives only in `admin.html`, which only a SUPERADMIN reaches.

*Consequence:* every agent account in the system must be created, edited, reset and removed by the operator. For a B2B portal whose customers are agencies with their own staff turnover, that is a permanent support load, and it is the load the API was already built to remove.

*Compounding:* the one screen that exists could not simply be reused. `saveUser` (`admin.html:2428-2440`) always includes `role` and `companyId` in the PATCH body, and `updateUser` returns 403 for a non-SUPERADMIN whenever `role` is present (`:122-125`) — so a COMPANY_ADMIN using that form would be refused on every edit, including a pure rename.

*Recommendation:* decide the product question (BR-213). If delegation is intended, add the screen to the agency portal and make the client send only changed fields.

### USR-04 — Credentials are displayed, never delivered · **High**

`createUser` returns `tempPassword` in the response (`:102`) and `resetUserPassword` does the same (`:189`). Neither sends an email — `users.controller.ts` imports no mailer at all. The admin portal shows the value in a modal (`admin.html:2457`, `:2470-2473`) with no copy control, no masking, and no warning that it will not be shown again.

The same product does this correctly one module away: `createCompany` sends `welcomeEmail` with the credentials to the company address, the admin address and the internal inbox (`companies.controller.ts:187-192`). So an agency's **first** user is emailed their password and every user after them is not.

*Impact:* passwords travel by whatever channel the operator improvises — WhatsApp, a phone call, a pasted chat message. Closing the modal loses the password and forces another reset. Combined with M01 · AUTH-04 (no self-service change), a user cannot rotate the password they were handed.

*Recommendation:* send the same `welcomeEmail` from `createUser`, send a reset notice from `resetUserPassword`, and stop returning the plaintext in the body once delivery exists.

### USR-05 — A role or company change leaves the old authority live · **Medium**

`updateUser` writes the new `role`/`companyId` but revokes nothing (`:141-152`), while reset and removal both revoke in the same transaction (`:184-187`, `:239`, `:247`). Because `req.user` is a frozen JWT payload (M01 · AUTH-02, BR-102), the user keeps the **old** role and the **old** `companyId` until the access token expires — and every list and read endpoint scopes on `req.user.companyId`.

Moving a user from agency A to agency B therefore leaves them able to read agency A's bookings, invoices and wallet for up to an hour. This is the cross-tenant case of AUTH-02, and this module is where the change is made.

*Recommendation:* revoke that user's refresh tokens whenever `role`, `companyId` or `isActive` changes — a one-line addition to the existing transaction — and pair it with the shorter access token proposed in M01 §9.

### USR-06 — Company references are unvalidated: a bad id is a 500, an inactive company is accepted · **Medium**

`createUser` and `updateUser` pass `companyId` straight to Prisma (`:86`, `:147`). Two consequences:

* A **non-existent** company id raises P2003. `isDuplicateEmailError` only matches P2002 (`shared/prisma-errors.ts:17`), so it is rethrown → **500** where a 400 belongs.
* A **deactivated** company is accepted. The user is created successfully and can never sign in, because login refuses on the company check (`auth.controller.ts:46-49`) — and after M01 · AUTH-01 they may not even get that message.

*Recommendation:* look the company up first and answer 400 for missing, 400 or an explicit warning for inactive.

### USR-07 — An agency cannot have two administrators who can manage each other · **Medium**

`canManageTarget` requires `target.role === 'AGENT'` (`:17`). A COMPANY_ADMIN therefore cannot edit another COMPANY_ADMIN in the same agency, cannot reset their password, and cannot edit their own profile. An agency with two owners has no internal path to change either account.

This is a deliberate, safe default — it prevents lateral escalation between peers — but combined with USR-03 and USR-04 it means every routine staff change is an operator ticket.

*Recommendation:* decide explicitly whether a COMPANY_ADMIN may manage peers, and separately allow self-service of one's own name and password (M01 §9 item 8).

### USR-08 — The users screen does not scale past 100 rows · **Medium**

`renderUsers` requests `/users?limit=100` (`admin.html:2383`) and `paginate` caps at 100 regardless. There is no page control, no search box, no role filter and no company filter — the only control is "show inactive". Past 100 users the list silently truncates, with nothing on screen to say so.

*Recommendation:* add pagination and at least a name/email search; the API already returns `meta.pages`.

### USR-09 — Email changes are silent and unverified · **Low**

`updateUser` accepts any valid address (`users.schema.ts:17`) with no confirmation to the old or new mailbox and no notification to either. Email is the login identifier, so this silently moves the account to a different address.

### USR-10 — No audit trail for privileged user administration · **Low**

Nothing records who created, edited, deactivated, deleted a user or reset whose password. The only trace on the `User` row is `lastLoginAt`. This is M01 · AUTH-09 seen from the other side: M02 is where the privileged actions happen, so it is where the records would be written.

### USR-11 — Password policy is a length floor · **Low**

`z.string().min(8)` on create and reset (`users.schema.ts:9,24`) — no complexity, no breach-list check, no reuse or expiry. An admin choosing a password for a user needs only eight characters; generated ones are strong (BR-008).

### USR-12 — The delete confirmation does not describe what will happen · **Low**

`deleteUserRecord` asks `Delete <email>?` (`admin.html:2481`) while the backend may deactivate instead (BR-203). The distinction only appears afterwards, in the toast. An operator cannot tell before clicking whether history will be preserved.

### USR-13 — Unreachable defensive branch in `createUser` · **Informational**

`users.controller.ts:51-54` re-checks that the caller is SUPERADMIN or COMPANY_ADMIN. The router already refuses everyone else (`users.routes.ts:15`), so the branch cannot execute. Harmless as defence-in-depth, but it reads as a live rule and is not one.

### USR-14 — Two user-creation paths with different behaviour · **Informational / DRY**

`createUser` and `createCompany` both generate a password, hash it at cost 12 and create a `User`, but they differ in credential delivery (email vs none), in transaction scope, and in error tagging. The `isDuplicateEmailError` → 409 block is written three times (`users.controller.ts:91`, `:153`, `companies.controller.ts:151/170`), and refresh-token revocation is repeated three times inline (`:185`, `:239`, `:247`) with no helper.

---

## 9. Improvements

### Immediate (small, contained, high value)

| # | Change | Addresses | Effort |
|---|---|---|---|
| 1 | Count all ten required creator relations in `deleteUser`, and map P2003 to a 409 instead of a 500 | USR-01 | S |
| 2 | Refuse a self-update that clears your own `isActive` or lowers your own role; refuse any change leaving zero active SUPERADMINs | USR-02 | S |
| 3 | Revoke refresh tokens inside the existing `updateUser` write when `role`, `companyId` or `isActive` changes | USR-05 | XS |
| 4 | Resolve `companyId` before writing — 400 when missing, explicit answer when inactive | USR-06 | S |
| 5 | Send `welcomeEmail` from `createUser` and a reset notice from `resetUserPassword` | USR-04 | S |
| 6 | Say "deactivate or delete" in the confirmation, and add a copy button plus a "shown once" warning to the password modal | USR-12, USR-04 | S |
| 7 | Implement TC-U-01…TC-U-17 — especially **TC-U-17**, which turns the relation list into a test | USR-01, coverage | S |

### Short term

| # | Change | Addresses | Effort |
|---|---|---|---|
| 8 | Add a users screen to the agency portal for COMPANY_ADMIN, and make the client send only changed fields | USR-03 | M |
| 9 | Pagination + name/email search + role filter on the users table | USR-08 | S |
| 10 | `AdminAuditEvent` rows for create / update / reset / remove, written alongside each mutation | USR-10 | M |
| 11 | Email-change confirmation to the old and new addresses | USR-09 | M |
| 12 | Extract one `revokeSessions(tx, userId)` helper and one duplicate-email responder | USR-14 | XS |
| 13 | Implement TC-I-01…TC-I-30 against a disposable Postgres | coverage | M |

### Longer term (product decisions)

| # | Change | Addresses |
|---|---|---|
| 14 | Decide BR-213 — may a COMPANY_ADMIN manage peers, and may any user edit their own profile? | USR-03, USR-07 |
| 15 | Password policy: complexity or a breach-list check | USR-11 |
| 16 | Invitation flow — create the account inactive, let the user set their own password from a signed link, so no plaintext is ever handled | USR-04 |
| 17 | Permissions beyond three fixed roles, if agencies ever need finer delegation | BR-212 |

---

## 10. Score — M02 Users & Roles

Same six dimensions and the same weights used for M01, so module scores stay comparable.

| # | Dimension | Score | Justification |
|---|---|---|---|
| 1 | **Best Practices** | **6 / 10** | The authorization design is the strongest part: a coarse router gate, a single `canManageTarget` applied consistently to all three mutating handlers, and privileged fields guarded separately. `userSelect` is an allow-list so no hash can escape; every handler is wrapped in `asyncHandler` (the only module where that is true); destructive operations run in transactions; duplicate emails become a 409 rather than a 500; bcrypt cost 12 throughout. Held back by unmapped foreign-key errors, unvalidated company references, no self-guard on update, no revocation on role change, and a history check that silently disagrees with the schema. |
| 2 | **Performance** | **8 / 10** | Listing is a paginated `findMany` + `count` on an indexed `companyId`, with a hard cap of 100. Writes are single-row. The removal check issues seven counts in parallel — more round trips than needed, and it is the incomplete list from USR-01, but it is not a scaling problem at this data size. Nothing here degrades with growth except the UI's missing pagination. |
| 3 | **Enterprise Readiness** | **3 / 10** | The lowest score so far, and it is earned by three things rather than by many small ones: a removal path that fails outright for the most common agent profile, a self-lockout with no in-product recovery, and delegated administration that exists in the API but in no interface. On top of those, no admin audit trail, no credential delivery, no email verification, no bulk operations, no pagination at scale, and a role model with no granularity. What keeps it from lower: the deactivate-instead-of-delete design is genuinely right, session revocation on reset and removal is correct, and the company+admin transaction closes a real gap. |
| 4 | **Clean Code** | **7 / 10** | 252 lines, five handlers of comparable size, one shared select, one shared guard, and comments that explain *why* (why `asyncHandler` wraps everything, why a duplicate email is caught at the write rather than pre-checked). Deducted for the unreachable branch at `:51-54`, for expressing policy by mutating `req.body` at `:61-62`, for computing `role` twice when the schema already defaults it, and above all for the seven-model literal at `:208-234` that encodes a schema invariant as a hand-maintained list. |
| 5 | **DRY** | **6 / 10** | `canManageTarget`, `userSelect` and `generatePassword` are each defined once and reused properly. The repetition is at the seams: two creation paths that both generate, hash and create a user with different behaviour; the duplicate-email → 409 block written three times; refresh-token revocation inlined three times with no helper; and the removal-history list duplicating knowledge that already exists in `schema.prisma`. |
| 6 | **UI/UX Professionalism** | **4 / 10** | The admin table itself is consistent with the rest of the portal — role and status badges, row actions, bilingual labels, correct escaping on every interpolation. Everything around it is thin: the capability is absent from the agency portal entirely, there is no pagination, search or role filter, the temporary password appears once in a modal with no copy control and no warning, the delete confirmation describes an action the backend may not take, the edit form resubmits fields the operator never touched, and nothing stops an administrator from switching their own account to Inactive. |

### Weighted result

| Dimension | Score | Weight | Contribution |
|---|---|---|---|
| Best Practices | 6 | 30% | 1.80 |
| Enterprise Readiness | 3 | 25% | 0.75 |
| Clean Code | 7 | 15% | 1.05 |
| UI/UX Professionalism | 4 | 15% | 0.60 |
| DRY | 6 | 10% | 0.60 |
| Performance | 8 | 5% | 0.40 |
| **Overall** | **5.20 / 10** | 100% | |

**Reading of the score.** The authorization model is well built and is not what drags this module down — three fixed roles, enforced in three layers, applied consistently. What costs it is everything around the model: two live defects (USR-01, USR-02), a capability the API grants and the product never exposes (USR-03), and credentials that are shown on a screen rather than delivered (USR-04). None of the four requires redesign; items 1–6 in §9 are all small or extra-small. The single highest-value change is TC-U-17 — a test that compares the removal-history list against the schema — because it converts the class of bug behind USR-01 from "somebody must remember" into a build failure.

### Comparison with M01

| Module | BP | Perf | Ent | Clean | DRY | UI/UX | Overall |
|---|---|---|---|---|---|---|---|
| M01 Authentication | 6 | 8 | 4 | 8 | 6 | 5 | **5.75** |
| M02 Users & Roles | 6 | 8 | 3 | 7 | 6 | 4 | **5.20** |

The two modules fail in the same direction: the code is competent and the operational layer around it is thin. Enterprise Readiness is the lowest dimension in both, and four of M02's issues (USR-02, USR-04, USR-05, USR-10) are only fully resolvable together with M01's (AUTH-02, AUTH-04, AUTH-09) — they are one identity subsystem, and it would be worth fixing them as one piece of work rather than two.

---

## 11. Coverage Summary

| Aspect | State after this audit |
|---|---|
| Features identified | 10 (F-01…F-10) |
| Use cases documented | 47 |
| Business rules registered | 17 (BR-005…BR-008 carried forward, BR-201…BR-213 new; BR-213 Unclear) |
| Issues raised | 14 (4 High, 4 Medium, 4 Low, 2 Informational) |
| Live defects vs hardening gaps | **2 defects** (USR-01, USR-02); USR-03 and USR-04 are missing capability rather than broken code |
| Test cases specified | 62 (17 unit, 30 integration, 9 security, 6 E2E) |
| Test cases implemented today | 0 for this module's handlers |
| Dimensions scored | 6 of 6 |

**Suggested next step:** the audit order in `APPLICATION_AUDIT_REPORT.md` §17 puts **M03 Companies & M04 Wallet** next — the money rail, where the known concurrency risk (R-01) and the credit-limit question (BR-096) live. Fixing the seven "Immediate" items here, together with M01's, would close the identity subsystem in one pass before that audit begins.

---

*End of Phase 2 — M02. No application code, schema, configuration or dependency was modified in producing this report.*
