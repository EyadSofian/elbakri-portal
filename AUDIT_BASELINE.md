# Elbakri Portal — Phase 0 Baseline Audit (before any code edits)

Date: 2026-06-14 · Branch: `main` · Baseline build: **green** (`tsc` exit 0) · `prisma validate`: **pass** · `prisma generate`: **pass** · HTML inline-script syntax (admin/dashboard/login) + `i18n.js`: **all OK**

Uncommitted state preserved: `M src/modules/hotels/hotels.schema.ts`, `?? SECURITY_AND_REVIEW_AR.md` (untouched).

DB note: production DB is **Neon cloud** (`ep-frosty-cake…neon.tech`). No local `psql`. All functional testing runs against a **disposable local Postgres in Docker** (`elbakri-test-db`, port 55432). Production data is never modified.

---

## Schema findings (good news)
The data model is already largely in place — most findings are **logic/UI**, not schema gaps:
- `TransportBooking` already has `fromType/toType/pickupHotelName/dropoffHotelName`, `isRoundTrip`, and `return*` leg columns.
- `MarketPrice` already stores an explicit `amount` + `currency` with company-override + market rows, and `src/shared/pricing.ts` already resolves **company → market → all → base** with **no FX** (`resolveMarketMoney`). The bug is in **callers**.
- `ActivityPackage` / `ActivityPackageItem` exist; `createVoucherForService` is **idempotent** (vouchers.controller.ts:242-256) and voucher relations are `@unique`.

Missing schema (for the transport redesign, §1): `TransportRate.serviceMode/serviceNameEn/serviceNameAr/serviceArea/durationHours`; `TransportBooking.rateId/pickupType/pickupAddress/dropoffType/dropoffLocation/dropoffAddress` + a `sameRouteReversed` flag.

---

## Baseline failing tests (confirmed by code inspection; to be re-confirmed on the test DB)

| # | Flow | Result | Root cause (file:line) |
|---|------|--------|------------------------|
| 1 | Cairo **8 Hours** requires a real pickup hotel/address | ❌ FAIL | `transport.controller.ts:194` only checks `!fromLocation && !pickupHotelName`. For an hourly rate `fromLocation="Cairo (8 hours)"` (the **rate label**) is non-empty, so a booking with **no real pickup** passes. No `serviceMode`; no "where should the driver pick you up" section. (**Finding 1**) |
| 2 | Cairo **12 Hours** requires a real pickup | ❌ FAIL | Same code path as #1. |
| 3 | One-Way airport → hotel | ⚠️ PARTIAL | Hotel-name validation exists (191-192) but the selling price is **FX-converted** (see #9). |
| 4 | Round Trip with **different** return endpoints | ❌ FAIL | `transport.controller.ts:284-289`: return endpoints **default to reversed outbound** and return types are **inferred** (`returnFromType ?? body.toType`). No "Same route reversed" toggle, no independent capture, no "return must be after outbound" check, return hotel-requiredness falls back to outbound. (**Finding 2**) |
| 5 | SIM quantity 1 → 3 (normal form) | ⚠️ PARTIAL | Server multiplies by qty correctly (`sim-card.controller.ts:187`) **but** FX-converts the unit price (see #9), has **no integer/max validation** (174: `parseInt||1`), and returns no explicit unit-price snapshot. |
| 6 | SIM quantity in the **Form Builder** form | ❌ FAIL | Generic form renderer does not recompute price on package/quantity change. (**Finding 3** — to be pinpointed in `dashboard.html`.) |
| 7 | Activity package with 2 activities | ✅ PASS (1 pkg + items) | But each line is **FX-converted** to `company.currency` and mixed-currency lines are converted **silently** (`activity-packages.controller.ts:210-211`). |
| 8 | One package record + one voucher only | ✅ PASS | `createVoucherForService` idempotent; `@unique` voucher relations. (**Finding 4** preserved.) |
| 9 | Egyptian (EGP) & Foreign (USD) explicit prices per service | ❌ FAIL | **Finding 5** — every booking flow takes the explicit admin price from `resolveMarketMoney` and then `convertMoney(..., company.currency)`, converting 50 USD → EGP (and vice-versa). **Finding 6** — most resolver calls pass only `company.market` and **omit `companyId`**, so company-specific overrides are ignored. |

### Finding 5 — sale-price FX conversion to remove (call sites)
`transport.controller.ts:99-100,253` · `sim-card.controller.ts:186` · `activity-packages.controller.ts:210-211` · `activities.controller.ts:190,196-197` · `visa.controller.ts:84,180` · `airport-reception.controller.ts:86,134` · `cruise.controller.ts:146` · `bookings.controller.ts:168` (hotels).

### Finding 6 — resolver calls missing `companyId`
`transport.controller.ts:80,82,250,251,568,569` · `activities.controller.ts:42,45,175,176` · `sim-card.controller.ts:28,184` · `hotels.controller.ts:123,201` · `cruise.controller.ts:44` · `bookings.controller.ts:148`. (Only `activity-packages.controller.ts:206-207` passes `companyId` today.)

### §8 automated tests
None exist yet (no test runner configured). All target tests in §8 are **absent** at baseline.

---

## Fix plan (ordered)
1. **Pricing (Findings 5 & 6)** — stop FX-converting explicit admin prices; thread full `{market, companyId, pax, date}` context into every resolver. Money snapshot keeps rate=1.
2. **Transport domain (§1, §2)** — add `serviceMode`, rate descriptors, and independent booking pickup/dropoff fields; reject hourly/day-use without a real pickup.
3. **Round trip (§3)** — two independent legs, "same route reversed" toggle, return-after-outbound validation.
4. **SIM quantity (§4)** — integer bounds + unit-price snapshot server-side; live recompute in both forms.
5. **Activity package (§6)** — preserve one-package design; explicit mixed-currency handling.
6. **Admin price editor + service-aware UI (§5, §7)**.
7. **Automated tests (§8)** + **live browser/RTL tests (§9)**.

---

## Implementation results (2026-06-14)

**Verification gate — all green:** `npx prisma validate` ✅ · `npm run build` (tsc) **exit 0** ✅ · `npm test` **11/11 pass** ✅ · `npm run test:integration` skips cleanly (22 skipped, guard passes) ✅ · inline-script syntax admin/dashboard/i18n ✅.

| Finding | Status | What changed |
|---|---|---|
| 1 Cairo 8/12h pickup | ✅ fixed | `serviceMode` enum; backend rejects hourly/day-use without a real pickup and the rate's own label can never count as one (`rateLabels` guard); UI adds Address/Landmark pickup + "where should the driver pick you up" enforcement |
| 2 Round-trip legs | ✅ fixed | Independent return leg captured (types + locations + hotels + addresses); "Same route reversed" toggle (default on); return-after-outbound check; two-leg pricing |
| 3 SIM qty recalc | ✅ fixed | Form Builder field-dependency hook (`rfFieldChanged` + robust `rfQuantityField`, no fragile regex); live unit×qty summary; server integer validation + `unitAmount` snapshot + `pricing` in response |
| 4 Activity package | ✅ preserved | One package + items, one invoice, one idempotent voucher; mixed-currency now rejected explicitly |
| 5 Explicit-price FX | ✅ fixed | `convertMoney→company.currency` removed from all 9 flows; new `explicitMoney()`; admin full price-matrix editor |
| 6 Missing companyId | ✅ fixed | Full `{market, companyId, pax, date}` context threaded into every resolver call |

**Migration:** `prisma/migrations/20260614000000_transport_service_mode_and_sim_unit/migration.sql` — additive (new enum, nullable/defaulted columns, 2 indexes, 1 FK). Verified column-for-column against `prisma migrate diff --from-empty` canonical SQL. **Not yet applied** (no test DB available this session).

**NOT yet run (need a disposable test DB — user chose "test later"):** apply migration, `RUN_DB_TESTS=1 npm run test:integration`, live browser + Arabic RTL. **Not committed/pushed.**

**Remaining risks:** (a) booking currency now follows the matched price row — admins must align a company's wallet currency with its market's price rows (documented intent, no auto-FX). (b) SIM/Security/Airport explicit per-market prices: SIM resolves via the matrix but has no matrix UI yet (own admin form); Visa/Reception still price from their own fee tables (FX removed, but not wired to `MarketPrice`). (c) All frontend + integration/browser behaviour is unverified pending a DB.
