# BUSINESS LOGIC TEST REPORT — Elbakri Overseas B2B Travel Portal

**Phase:** Business-logic verification & cross-module testing (read-only)
**Date:** 2026-08-31 · **Branch:** `claude/booking-business-logic-audit-mr7qls` · **Base commit:** `bf8f831`
**Scope:** `src/` (110 files, ~19.8k LOC), `prisma/schema.prisma` (76 models/enums), `public/dashboard.html`, `public/admin.html`
**Method:** Full source reading + executable probes against the application's own pure business-logic modules.
**Nothing in the application was modified.** The only file created is this report.

---

## 1. Executive Summary

The portal is technically well-built: input is validated, prices are resolved through one explicit
matrix, wallet movement is centralised in a shared helper, and tenant scoping is applied
consistently in the list endpoints. The previous audit's nine findings are genuinely fixed —
`explicitMoney()` is used everywhere a sale price is stored, `companyId` is threaded into every
resolver call, and the transport service-mode/round-trip work is present and correct.

**But the system is not internally consistent as a business.** The defects that remain are almost
all *relationship* defects rather than code defects — precisely the class this phase was asked to
find. Four things stand out:

1. **The Cruise ↔ Transfer relationship is actively destroyed by ordinary admin work.** Saving the
   shared programme/transfer catalogue runs `deleteMany({})` across *every* boat; saving a single
   cruise's schedule cascade-deletes its entire cabin fare table. Both re-create the rows with new
   ids, so every existing `CruiseBooking` silently loses its `programmeId`, `programmeRateId`,
   `transferRateId`, `cabinRateId` and `scheduleId` to `SetNull`. The booking survives with its
   money intact and **no memory of what was sold**. This is the mechanism behind the suspicion that
   prompted this audit.

2. **The wallet is currency-blind.** Sale prices are now (correctly) stored in the *rate's* currency —
   EGP for the Egyptian market, USD otherwise — but `debitWallet` compares and subtracts that amount
   from `company.balance`, which is denominated in `company.currency`, with **no currency check
   anywhere**. `WalletTransaction` has no currency column at all. Top-ups *are* currency-guarded,
   which shows the omission on the debit side is an oversight, not a decision.

3. **The agent's main revenue path terminates in a dead end.** Agents cannot create hotel, package or
   cruise bookings — all three return `USE_QUOTE_REQUEST`. But **no code anywhere converts an
   accepted QuoteRequest into a booking.** An `ACCEPTED` quote with a `quotedAmount` produces no
   invoice, no wallet movement, no voucher, and appears in no report.

4. **There is no availability system.** Not one query in the codebase counts existing bookings
   against a capacity. `NileCruise.cabins`, `Room.isAvailable`, `Activity.minPax/maxPax` and vehicle
   capacity are all stored, all editable, and all unenforced at booking time.

Alongside these, two endpoints leak the confidential rate book across tenants, five booking types
issue customer vouchers before anyone confirms them and never revoke them on cancellation, every
wallet write is an absolute `balance = x` assignment (lost-update race), and three of the seven
markets are silently unresolvable in the admin price preview.

**43 issues are documented below: 4 BLOCKER, 8 CRITICAL, 11 HIGH, 14 MEDIUM, 6 LOW.**
36 are **Confirmed** (proved by code path or by an executed probe), 7 are **Highly Likely**
(require a live database or two concurrent clients to demonstrate deterministically).
A further **11 missing business rules** and **6 business questions** are listed separately.

### Evidence standard used

* **Confirmed** — the defective path was read end to end and either (a) has no guard anywhere on
  the path, or (b) was reproduced by executing the application's own module in a probe.
* **Highly Likely** — the code path is unambiguous but the outcome depends on runtime conditions
  (transaction isolation, concurrency, live data) that could not be reproduced without a database.
* **Suspected** — inferred from surrounding code; explicitly flagged where used.

### Test environment

| Item | Status |
|---|---|
| Source review | ✅ complete — all 110 `src/` files, full schema, both HTML portals |
| Existing unit suite | ✅ **153/153 pass** (`tests/pricing wallet cruise-rates transfer-addon activity-pricing invoice-totals itinerary`) — a clean baseline |
| Custom probes written for this audit | ✅ **19/19 pass**, all confirming a defect hypothesis (kept out of the repo, in the session scratchpad) |
| Live database | ❌ none available — no `DATABASE_URL`, production is Neon cloud |
| `npm ci` | ⚠️ blocked: `xlsx` is fetched from `cdn.sheetjs.com`, which the environment proxy returns 403 for. Dependencies were installed into an out-of-tree prefix and symlinked as `node_modules/` (gitignored); the repo is untouched. |
| Integration tests (`test:integration`) | ❌ BLOCKED — require `RUN_DB_TESTS=1` and a live Postgres |
| Browser / RTL testing | ❌ BLOCKED — the app cannot boot without a database |

---

## 2. Current Domain Map

**What this is:** a B2B travel portal. Elbakri (the **platform**, SUPERADMIN) sells Egyptian ground
services to **travel agencies** (companies), whose staff (COMPANY_ADMIN, AGENT) book on behalf of
their own end clients. Agencies pay from a **prepaid wallet**; every confirmation debits it.

### Actors

| Role | Who they are | What they can do |
|---|---|---|
| `SUPERADMIN` | Elbakri operations/admin | Everything: catalogue, prices, confirm/approve, all companies, reports |
| `COMPANY_ADMIN` | Agency manager | Book the 6 in-app services, submit quotes, manage own AGENT users, own wallet/invoices |
| `AGENT` | Agency staff | Same booking rights as COMPANY_ADMIN, minus user management |

There is **no operational role** — no Driver, Vehicle, Transfer Manager or Supplier entity exists.
Transport operations is a *view* (`GET /transport-bookings/add-ons`), not a role.

### Two distinct booking paths

```
IN-APP CONFIRMABLE (agent books directly, priced server-side, wallet debited on admin confirm)
   Transport · Activity · Activity Package · Security Approval (visa) · Airport Assist · SIM

QUOTE-ONLY (agent may only ask; admin prices off-system)
   Hotel · Nile Cruise · Multi-service package · Flight
   └── ⚠️ terminates in a QuoteRequest row with no conversion to a booking (BUG-14)
```

### Entities by module

| Module | Catalogue entities | Transactional entities |
|---|---|---|
| **Nile Cruise** | `NileCruise` → `CruiseSchedule` → {`CruiseCabinRate`, `CruiseProgramme` → `CruiseProgrammeRate`, `CruiseTransferRate`}, `CruiseSharedCatalogue` | `CruiseBooking` → `CruiseBookingActivity` |
| **Transport** | `TransportRate`, `Airport`, `ServiceGroupType` | `TransportBooking` |
| **Activities** | `Activity`, `ServiceGroupType` | `ActivityBooking`, `ActivityPackage` → `ActivityPackageItem` |
| **Hotels** | `Hotel` → {`Room`, `HotelImage`, `HotelPricing`, `HotelRate` → `HotelRateSupplement`, `HotelCompanyVisibility`}, `MealPlanOption` | `Booking` |
| **Security approval** | `VisaFee` | `VisaApplication` |
| **Airport assist** | `ReceptionServiceRate` | `AirportReception` |
| **SIM** | `SimPackage` | `SimRequest` |
| **Quotes** | — | `QuoteRequest` |
| **Money** | `MarketPrice`, `FxRateCache` | `Invoice`, `ConsolidatedInvoice` → `ConsolidatedInvoiceLine`, `WalletTransaction`, `PlatformWallet(+Transaction)` |
| **Customer docs** | — | `Voucher` |
| **Tenancy** | `Company`, `User`, `Destination` | `RefreshToken` |
| **Ops** | `Offer`, `UiTemplate`, `SheetsConfig`, `SyncLog` | — |

### The pricing doctrine (correct and consistently applied)

Sale prices are **explicit per currency and never FX-converted**. `explicitMoney()` sets
`exchangeRate = 1` and `sourceCurrency = currency`. `MarketPrice` resolves
`company row (3) → market row (2) → all-markets row (1) → the service's own base column`.
Cruises and dual-priced transport bypass `MarketPrice` and carry EGP/USD columns directly.
`convertMoney()` (real FX) survives but is **called by nothing** in any sale path — verified.

### Lifecycles as implemented

```
BookingStatus (Booking, ActivityBooking, ActivityPackage, TransportBooking,
               CruiseBooking, AirportReception, SimRequest)
   PENDING ──confirm──▶ CONFIRMED ──cancel──▶ CANCELLED
      │                                          ▲
      └──cancel/reject──────────────────────────┘
   COMPLETED ......... unreachable — no code sets it (BUG/MISSING-RULE-1)
   REJECTED .......... reachable only for ActivityPackage and SimRequest

VisaStatus
   PENDING ──submit──▶ SUBMITTED ──approve──▶ APPROVED  (terminal — no cancel exists)
      └──reject────────────────────▶ REJECTED
   UNDER_REVIEW, CANCELLED ......... unreachable

QuoteRequestStatus
   NEW · IN_REVIEW · QUOTED · ACCEPTED · CLOSED · CANCELLED
   ⚠️ any-to-any, no transition validation (BUG-25); ACCEPTED leads nowhere (BUG-14)

InvoiceStatus
   UNPAID ──markPaid──▶ PAID ; UNPAID ──parent cancelled──▶ CANCELLED
   OVERDUE ........... unreachable — dueDate is set everywhere, aged by nothing (MISSING-RULE-2)
```

### Cross-module dependency graph

```
Company ─┬─ User ─── creates ──▶ every booking type
         ├─ balance ◀── debitWallet/refundWallet ── confirm/cancel
         ├─ market  ──▶ MarketPrice tier  +  cruise EGYPTIAN/FOREIGN audience
         └─ currency ──▶ wallet denomination      ⚠️ never reconciled with the sale currency

NileCruise ─ CruiseSchedule ─┬─ CruiseCabinRate ──┐
                             ├─ CruiseProgramme ──┼─ CruiseBooking (5 nullable FKs)
                             └─ CruiseTransferRate┘        ⚠️ all SetNull / Cascade
CruiseSharedCatalogue ──materialise──▶ CruiseProgramme + CruiseTransferRate (ALL boats)

TransportRate ──▶ TransportBooking ──▶ Invoice + Voucher
Activity ──▶ ActivityBooking / ActivityPackageItem ──▶ Invoice + Voucher
{Activity, ActivityPackageItem, CruiseBooking, QuoteRequest}.transferRequested
        ──▶ read-only Transport operations queue (no TransportBooking row is created)
every booking ──▶ Invoice ──▶ ConsolidatedInvoiceLine ──▶ ConsolidatedInvoice
every booking ──▶ reports.loadReportRecords   ⚠️ except ActivityPackage
```

---

## 3. Modules & Features

14 business modules were discovered and reviewed. "Features" counts distinct business capabilities,
not endpoints.

| # | Module | Purpose | Features | Key files |
|---|---|---|---|---|
| 1 | **Nile Cruise** | Sell cabins/programmes on Nile boats + optional priced transfer | 11 | `nile-cruise/cruise.controller.ts`, `cruise-catalogue.controller.ts`, `shared/cruise-rates.ts` |
| 2 | **Transport** | Point-to-point, airport, hourly-charter and day-use ground transport | 10 | `transport/transport.controller.ts`, `transport.resolve.ts` |
| 3 | **Activities** | Sell excursions per-person or as a private party | 8 | `activities/activities.controller.ts`, `shared/activity-pricing.ts` |
| 4 | **Activity Packages** | One package = many excursion lines, one invoice, one voucher | 6 | `activities/activity-packages.controller.ts` |
| 5 | **Hotels** | Hotel catalogue, rate matrix, per-company price visibility | 9 | `hotels/*.controller.ts` |
| 6 | **Hotel/Flight Bookings** | Direct booking (admin only; agents are routed to quotes) | 5 | `bookings/bookings.controller.ts` |
| 7 | **Quote Requests** | Agent asks for a price on a quote-only service | 5 | `quote-requests/quote-requests.controller.ts` |
| 8 | **Security Approval (Visa)** | Egyptian security approvals, priced by nationality/airport/city | 8 | `visa/visa.controller.ts` |
| 9 | **Airport Assist** | Meet & greet / VIP lounge at an airport | 5 | `airport-reception/reception.controller.ts` |
| 10 | **SIM Card** | Sell SIM packages by quantity | 6 | `sim-card/sim-card.controller.ts` |
| 11 | **Wallet & Companies** | Prepaid balances, top-ups, credit limits, platform wallet | 9 | `wallet/`, `companies/companies.controller.ts`, `shared/wallet.ts` |
| 12 | **Invoicing** | Per-booking invoices + consolidated statements + PDFs | 8 | `invoices/invoices.controller.ts`, `consolidated.controller.ts` |
| 13 | **Vouchers** | Price-free customer/driver documents | 5 | `vouchers/vouchers.controller.ts` |
| 14 | **Reports & Search** | Admin overview, per-company report, global search | 4 | `reports/reports.controller.ts`, `search/search.controller.ts` |

**Supporting (reviewed, not separately matrixed):** Master data (transport rates, visa fees,
reception rates, meal plans), Group Types (service-tier price adjustments), Destinations, Airports,
Offers/Packages, UI Template form builder, Google Sheets sync, FX cache, Uploads/private files.

**Total: 99 business features reviewed.**

---

## 4. Business Use Case Inventory

187 business use cases were enumerated and evaluated. The full evaluation is in §5; this section
records the inventory and how it was classified.

| Classification | Count | What it covers |
|---|---:|---|
| Happy Path | 41 | The intended flow completes and leaves a valid business state |
| Alternate Path | 22 | A legitimate variation (round trip, party pricing, programme vs cruise-only) |
| Negative Path | 26 | The system is asked to do something it should refuse |
| Edge Case | 24 | Zero/one/boundary/empty/very-large/invalid inputs |
| **Cross-Module Case** | **38** | Two or more modules must agree — the focus of this phase |
| Permission Case | 19 | Role and ownership boundaries |
| Lifecycle Case | 17 | State transitions and their side effects |
| Data Integrity Case | 15 | Orphans, stale references, contradictory states |
| Concurrency Case | 8 | Two actors at once |

### Cruise → "Assign / price a transfer" — the feature the audit was pointed at

The brief named this feature. It decomposes into 15 use cases; here is how each actually behaves:

| # | Use case | Result | Ref |
|---|---|---|---|
| 1 | Cruise with `transferIncluded = true` → no add-on offered | ✅ PASS | — |
| 2 | Cruise-only + one priced `CruiseTransferRate` | ✅ PASS | — |
| 3 | Programme selected → its transfer is included, add-on suppressed | ✅ PASS | — |
| 4 | Programme selected **and** a `transferRateId` posted | ⚠️ PARTIAL — silently ignored, no error | BUG-35 |
| 5 | `transferRequested` with no rate id | ✅ PASS — `TRANSFER_RATE_REQUIRED` | — |
| 6 | Transfer rate belonging to a **different cruise** | ✅ PASS — rejected | — |
| 7 | Transfer rate belonging to a **different schedule** | ✅ PASS — rejected | — |
| 8 | Transfer rate outside its validity period | ✅ PASS — rejected | — |
| 9 | Transfer rate in a different currency from the fare | ✅ PASS — `MIXED_CURRENCY` | — |
| 10 | Vehicle count derived from passenger count | ⚠️ PARTIAL — driven by a **client-supplied** `transferPaxCount` | BUG-25 |
| 11 | **Admin re-saves the shared catalogue** → existing bookings keep their transfer | ❌ **FAIL** — every `transferRateId` on every boat becomes `NULL` | **BUG-01** |
| 12 | **Admin edits any cruise field** → the boat keeps its fares | ❌ **FAIL** — the whole cabin rate table is cascade-deleted | **BUG-02** |
| 13 | Cancelling the cruise booking removes it from the transfer ops queue | ❌ FAIL — it stays, marked CANCELLED, mixed in with live work | BUG-22 |
| 14 | A legacy `INTERNATIONAL` transfer row is offered to a FOREIGN company | ❌ FAIL — cabin rates accept it, transfer rates do not | BUG-27 |
| 15 | Agent cannot read the other market's transfer prices | ❌ FAIL — `GET /cruises/:id/transfer-rates` returns both, unguarded | **BUG-11** |

**9 of 15 pass. The six failures are all relationship failures, and two of them are BLOCKERs.**

---

## 5. Business Test Matrix

Abbreviations — Test type: **HP** happy · **AP** alternate · **NP** negative · **EC** edge ·
**XM** cross-module · **PC** permission · **LC** lifecycle · **DI** data integrity · **CC** concurrency.
Result: **PASS** · **FAIL** · **PART**ial · **BLOCK**ed (needs a DB) · **CLAR**ification needed.

### 5.1 Nile Cruise

| Module | Feature | Use case | Type | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| Cruise | Catalogue | Create/soft-delete a boat | HP | Row created, `isActive` toggled | As expected | PASS |
| Cruise | Catalogue | `priceFrom` blank stays NULL, not 0 | EC | NULL = "not priced" | `cruiseData` maps `''`→NULL | PASS |
| Cruise | Catalogue | Unknown key in payload cannot reach the DB | NP | Stripped | Explicit field allow-list | PASS |
| Cruise | Catalogue | Deactivate a boat that has PENDING bookings | XM | Warn or block | Silent; bookings keep pointing at it | FAIL (BUG-30) |
| Cruise | Rates | Replace the cabin fare table | HP | New table saved | Saved | PASS |
| Cruise | Rates | Existing bookings keep `cabinRateId` after a rate save | XM | Link preserved or snapshotted | **`SetNull` — link destroyed** | **FAIL (BUG-02)** |
| Cruise | Rates | Every fare must belong to a schedule of this boat | NP | Rejected | Rejected | PASS |
| Cruise | Rates | Rate with no cabin name | EC | Dropped | Dropped | PASS |
| Cruise | Rates | Period `validTo < validFrom` | NP | Rejected | `INVALID_PERIOD_RANGE` | PASS |
| Cruise | Schedules | Save a schedule set | HP | Saved, nights derived | Saved | PASS |
| Cruise | Schedules | Saving schedules preserves the fare table | XM | Fares survive | **Cascade-deleted** | **FAIL (BUG-02)** |
| Cruise | Schedules | Saving schedules preserves booking→schedule links | XM | Preserved | `SetNull` on every booking | **FAIL (BUG-02)** |
| Cruise | Schedules | Editing only the boat's *name* leaves the catalogue alone | XM | No catalogue write | UI re-PUTs schedules → full cascade | **FAIL (BUG-02)** |
| Cruise | Shared catalogue | Save programmes/transfers for one route | HP | Materialised per schedule | Materialised | PASS |
| Cruise | Shared catalogue | Save affects only matching boats | XM | Scoped | **`deleteMany({})` — ALL boats** | **FAIL (BUG-01)** |
| Cruise | Shared catalogue | Bookings keep `programmeId`/`transferRateId` after a save | XM | Preserved | **All `SetNull`** | **FAIL (BUG-01)** |
| Cruise | Shared catalogue | Every programme period needs both EGP and USD | NP | Rejected | `programmePeriodsHaveBothAudiences` | PASS |
| Cruise | Booking | Agent cannot create a cruise booking | PC | `USE_QUOTE_REQUEST` | As expected | PASS |
| Cruise | Booking | Cabin rate + programme rate together | NP | Rejected | `PICK_ONE_FARE` | PASS |
| Cruise | Booking | Programme id without rate id (or vice versa) | NP | Rejected | Rejected | PASS |
| Cruise | Booking | Rate from another market | NP | Rejected | Rejected (INTERNATIONAL≡FOREIGN) | PASS |
| Cruise | Booking | Rate outside its validity period | NP | Rejected | Rejected | PASS |
| Cruise | Booking | Occupancy the cabin is not sold at | NP | Rejected | `OCCUPANCY_NOT_SOLD` | PASS |
| Cruise | Booking | Children with no child price | EC | Rejected, not free | `CHILD_RATE_NOT_AVAILABLE` | PASS |
| Cruise | Booking | Dates must match the sailing leg | XM | Day + length enforced | `validateCruiseStayDates` | PASS |
| Cruise | Booking | Client sends an offset datetime for check-in | EC | Same day everywhere | Validator sees Mon, DB stores Sun | FAIL (BUG-31) |
| Cruise | Booking | More bookings than the boat has cabins | XM | Blocked at capacity | **No capacity check exists** | **FAIL (BUG-13)** |
| Cruise | Booking | Supplement in a foreign currency | NP | Rejected | Rejected | PASS |
| Cruise | Booking | `PERCENTAGE` supplement after `TOTAL_PRICE` | EC | % of the new total | % of the **old** base | FAIL (BUG-24) |
| Cruise | Booking | `TOTAL_PRICE` after `FIXED_AMOUNT` | EC | Deterministic | Order-dependent; the fixed is discarded | FAIL (BUG-24) |
| Cruise | Booking | Add-on tour in a different currency | XM | Rejected or converted | Added raw to the total | FAIL (BUG-38) |
| Cruise | Booking | Transfer vehicle count from pax | XM | Server-derived | Client-supplied `transferPaxCount` | FAIL (BUG-25) |
| Cruise | Confirm | Debits the wallet once, idempotently | LC | One DEBIT | `debitWallet` guard holds | PASS |
| Cruise | Confirm | Rejected when the balance is short | NP | `INSUFFICIENT_BALANCE` | As expected | PASS |
| Cruise | Confirm | EGP fare against a USD wallet | XM | Currency checked | **No check — debited 1:1** | **FAIL (BUG-03)** |
| Cruise | Cancel | Refund is idempotent | LC | One REFUND | `refundWallet` guard holds | PASS |
| Cruise | Cancel | Invoice moves to CANCELLED | XM | Cancelled | Cancelled | PASS |
| Cruise | Cancel | After the sailing date | LC | Fee or refusal | Full refund, no date check | FAIL (BUG-14→policy) |
| Cruise | Cancel | Refund and status change are atomic | CC | One transaction | **Two separate transactions** | FAIL (BUG-33) |
| Cruise | Read | Agent sees only their own company's bookings | PC | Scoped | Scoped | PASS |
| Cruise | Read | `showPriceToAgents=false` hides prices | PC | Hidden | Hidden in `listCruises` | PASS |
| Cruise | Read | …and in the sibling rate endpoints | PC | Hidden | **`GET /:id/rates` returns everything** | **FAIL (BUG-11)** |

### 5.2 Transport

| Module | Feature | Use case | Type | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| Transport | Rate match | Exact typed endpoints | HP | Matched | Matched | PASS |
| Transport | Rate match | Reverse direction on a bidirectional rate | AP | Matched REVERSED | Matched | PASS |
| Transport | Rate match | Disposal never falls back to point-to-point | NP | Kept apart | Mutually exclusive filters | PASS |
| Transport | Rate match | Capacity filters the candidates | XM | min/max applied | Applied — **only without `rateId`** | **FAIL (BUG-10)** |
| Transport | Rate match | `rateId` for a rate that doesn't fit the pax | NP | Rejected | **Accepted, no capacity check** | **FAIL (BUG-10)** |
| Transport | Rate match | `rateId` for an unrelated route | NP | Rejected | **Accepted, recorded as `EXACT`** | **FAIL (BUG-10)** |
| Transport | Booking | Hourly charter needs a real pickup | NP | Rejected | `rateLabels` guard works | PASS |
| Transport | Booking | Rate's own label doesn't count as a pickup | EC | Rejected | Rejected | PASS |
| Transport | Booking | Round trip needs a return time after the outbound | NP | Rejected | Rejected | PASS |
| Transport | Booking | Different return route priced as two legs | AP | Two legs | Two legs, currency-matched | PASS |
| Transport | Booking | Disposal + `isRoundTrip` doesn't double the price | EC | Not doubled | Flag dropped | PASS |
| Transport | Booking | Client cannot post `totalAmount` | NP | Ignored | Not in the accepted body | PASS |
| Transport | Booking | Drop-off before pickup | NP | Rejected | Rejected | PASS |
| Transport | Booking | Unparseable `pickupDateTime` | EC | 400 | **No NaN check → 500** | FAIL (BUG-26) |
| Transport | Booking | Pickup in the past | NP | Rejected or warned | Accepted | FAIL (BUG-26) |
| Transport | Booking | An `Invalid Date` bypasses price validity windows | EC | Windows hold | **Every window passes** | FAIL (BUG-26) |
| Transport | Booking | Same vehicle committed to two overlapping runs | XM | Detected | **No resource model exists** | FAIL (BUG-13) |
| Transport | Booking | Voucher issued while still PENDING | LC | On confirm | **Issued immediately** | FAIL (BUG-15) |
| Transport | Confirm | Debit + invoice + status | LC | All three | All three | PASS |
| Transport | Cancel | Refund + invoice cancelled | LC | Both | Both | PASS |
| Transport | Cancel | Voucher revoked | XM | Revoked | **Still downloadable & regenerable** | **FAIL (BUG-15)** |
| Transport | Rates list | Round-trip override doesn't corrupt the one-way currency | XM | Independent | RT currency overwrites the row's | FAIL (BUG-28) |
| Transport | Ops queue | Add-ons queue is SUPERADMIN-only | PC | Admin only | `requireRole('SUPERADMIN')` | PASS |
| Transport | Ops queue | Cancelled parents excluded | XM | Excluded | **Included** | FAIL (BUG-22) |
| Transport | Ops queue | Covers activity, package, cruise, quote sources | XM | All four | All four | PASS |

### 5.3 Activities & Packages

| Module | Feature | Use case | Type | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| Activity | Booking | Per-person pricing with market override | HP | Override applied | Applied | PASS |
| Activity | Booking | Party pricing (single/double/triple) | AP | Composed correctly | 5 pax on a double = 2 doubles + 1 single | PASS |
| Activity | Booking | Party pricing honours market overrides | XM | Applied | **`MarketPrice` never consulted** | **FAIL (BUG-23)** |
| Activity | Booking | Basis the activity isn't sold at | NP | Rejected | `PRICE_ON_REQUEST` | PASS |
| Activity | Booking | Blank price ≠ free | EC | Rejected | Rejected | PASS |
| Activity | Booking | Legacy party price of 0 treated as "not sold" | EC | Not sold | `hasPartyPrice` requires > 0 | PASS |
| Activity | Booking | Adult/child currencies must match | NP | Rejected | `MIXED_CURRENCY` | PASS |
| Activity | Booking | …and the transfer add-on currency too | XM | Checked | **Not checked — added raw** | **FAIL (BUG-20)** |
| Activity | Booking | `transferIncluded` suppresses a paid add-on | XM | Suppressed | Suppressed | PASS |
| Activity | Booking | Transfer with no pickup point | NP | Rejected | Rejected | PASS |
| Activity | Booking | Booking exceeds `maxPax` | NP | Rejected | **Never enforced anywhere** | **FAIL (BUG-13)** |
| Activity | Booking | Non-confirmable activity | NP | `USE_QUOTE_REQUEST` | As expected | PASS |
| Activity | Booking | Inactive activity | NP | 404 | 404 | PASS |
| Activity | Confirm | Confirm after the activity was deactivated | XM | Warn/block | Confirms silently | FAIL (BUG-30) |
| Package | Create | Overlapping times inside one package | NP | Rejected | `TIME_CONFLICT` | PASS |
| Package | Create | Same client double-booked across two packages | XM | Detected | **Not checked** | FAIL (MISSING-RULE-7) |
| Package | Create | All lines must share one currency | NP | Rejected | Rejected | PASS |
| Package | Create | One package → one invoice → one voucher | XM | Exactly one | Idempotent, `@unique` | PASS |
| Package | Create | Transfer add-on currency vs line currency | XM | Checked | **Not checked** | **FAIL (BUG-20)** |
| Package | Report | Package revenue reaches the report | XM | Counted | **Module absent from reports** | **FAIL (BUG-17)** |
| Package | Invoice | Package line labelled on a statement | XM | Named | **`refNumber:''`, `service:'Service'`** | FAIL (BUG-17) |
| Package | Cancel | Refund + invoice cancelled | LC | Both | Both | PASS |

### 5.4 Hotels, Bookings & Quotes

| Module | Feature | Use case | Type | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| Hotel | Visibility | `showPriceToAgents=false` hides the price | PC | Hidden | Hidden in list + detail | PASS |
| Hotel | Visibility | Per-company `canViewPrice` override | PC | Honoured | Honoured | PASS |
| Hotel | Visibility | `GET /hotels/:id/pricing` honours it | PC | Honoured | **Unguarded — full season table** | **FAIL (BUG-12)** |
| Hotel | Export | `export-excel` honours visibility | PC | Scoped | **COMPANY_ADMIN gets every hotel's rates** | **FAIL (BUG-04)** |
| Hotel | Rate matrix | Admin-only read | PC | Admin only | `requireRole('SUPERADMIN')` | PASS |
| Hotel | Delete | Soft-delete with live bookings | XM | Warn | Silent | FAIL (BUG-30) |
| Booking | Create | Agents routed to quotes | PC | `USE_QUOTE_REQUEST` | As expected | PASS |
| Booking | Create | Room availability / inventory | XM | Checked | **`Room` isn't even loaded** | **FAIL (BUG-13)** |
| Booking | Create | `canRequestQuote=false` blocks a quote | XM | Blocked | **UI-only; API accepts it** | FAIL (MISSING-RULE-8) |
| Booking | Confirm | Wallet debited | LC | Debited | Debited (nested in the invoice guard) | PART (BUG-34) |
| Booking | Reject | Refund is idempotent under concurrency | CC | One refund | **Check is outside the transaction** | **FAIL (BUG-08)** |
| Quote | Create | Cruise dates validated against the leg | XM | Validated | Validated | PASS |
| Quote | Create | Transfer answers survive onto the ops queue | XM | Carried | Carried | PASS |
| Quote | Lifecycle | CLOSED → NEW rejected | NP | Rejected | **Any-to-any accepted** | **FAIL (BUG-25)** |
| Quote | Lifecycle | ACCEPTED becomes a booking | XM | Converted | **No conversion exists anywhere** | **FAIL (BUG-14)** |
| Quote | Lifecycle | `quotedAmount` reaches invoice/wallet/reports | XM | Reaches them | Reaches nothing | **FAIL (BUG-14)** |

### 5.5 Security Approval, Airport Assist, SIM

| Module | Feature | Use case | Type | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| Visa | Pricing | Most-specific fee row wins | HP | Specific wins | `resolveVisaFee` ordering | PASS |
| Visa | Pricing | No configured fee | NP | `PRICE_NOT_CONFIGURED` | As expected | PASS |
| Visa | Lifecycle | PENDING → SUBMITTED → APPROVED | LC | Enforced | Enforced | PASS |
| Visa | Lifecycle | Reject after approval | NP | Rejected | Rejected | PASS |
| Visa | Lifecycle | Cancel an approved application | LC | Possible | **No cancel endpoint exists** | **FAIL (BUG-05)** |
| Visa | Approve | Uses the shared wallet helper | DI | Shared | **Third inlined copy** | FAIL (BUG-37) |
| Visa | Delete | Approved+debited application deleted | XM | Refund first | **Deleted; money never returned** | **FAIL (BUG-05)** |
| Visa | Delete | Wallet ledger left consistent | DI | Consistent | **Orphan DEBIT to a dead ref** | **FAIL (BUG-05)** |
| Visa | Update | Reprice an approved application | XM | Wallet adjusted | **Booking+invoice change, wallet doesn't** | **FAIL (BUG-06)** |
| Visa | Update | Reprice a paid application | NP | Rejected | Rejected | PASS |
| Visa | Update | Status/money not editable via PATCH | NP | Stripped | Zod allow-list | PASS |
| Visa | Docs | Private file scoped to the owning company | PC | Scoped | `companyOwnsFile` | PASS |
| Assist | Booking | Rate resolved per airport + service | HP | Resolved | Resolved | PASS |
| Assist | Cancel | Refund + invoice cancelled | LC | Both | Both | PASS |
| Assist | Voucher | Issued at PENDING | LC | On confirm | Issued immediately | FAIL (BUG-15) |
| SIM | Booking | Quantity × unit price, integer-bounded | HP | Correct | Correct, `unitAmount` snapshotted | PASS |
| SIM | Voucher | Issued on CONFIRMED only | LC | On confirm | **On confirm — the only module that does** | PASS |
| SIM | Cancel | Refund only when previously confirmed | LC | Conditional | Conditional | PASS |

### 5.6 Money, Reporting & Access

| Module | Feature | Use case | Type | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| Wallet | Debit | Idempotent on `reference` | LC | Once | Once | PASS |
| Wallet | Debit | Blocked when the balance is short | NP | Blocked | Blocked | PASS |
| Wallet | Debit | Currency of amount vs balance | XM | Must match | **Never compared** | **FAIL (BUG-03)** |
| Wallet | Debit | `creditLimit` headroom is spendable | XM | Spendable | **Never consulted** | FAIL (BUG-43) |
| Wallet | Debit | Two confirms at once | CC | Both debited | **Absolute `balance=x` → lost update** | **FAIL (BUG-08)** |
| Wallet | Refund | Only after a debit, only once | LC | Guarded | Guarded | PASS |
| Wallet | Top-up | Currency must match the company | NP | Rejected | `CURRENCY_MISMATCH` | PASS |
| Wallet | Top-up | Funded from the platform wallet | XM | Debited | Debited | PASS |
| Company | Update | Change currency with a non-zero balance | XM | Blocked/converted | **Accepted; ledger reinterpreted** | FAIL (BUG-36) |
| Invoice | Create | One per booking, `@unique` per relation | DI | One | One | PASS |
| Invoice | Totals | Tax deliberately zero | HP | 0 | 0 | PASS |
| Invoice | markPaid | Cancelled invoice can be marked PAID | NP | Rejected | **Accepted + "thank you" email** | **FAIL (BUG-09)** |
| Invoice | markPaid | Records the money movement | XM | Recorded | Status flag only | CLAR (Q2) |
| Invoice | Ageing | Past `dueDate` becomes OVERDUE | LC | Aged | **Nothing ever ages it** | FAIL (MISSING-RULE-2) |
| Statement | Create | Single currency enforced | NP | Rejected | `MIXED_CURRENCY` | PASS |
| Statement | Create | Excludes cancelled invoices | XM | Excluded | **Included in the amount due** | **FAIL (BUG-07)** |
| Statement | Create | Package lines labelled | XM | Named | Unnamed | FAIL (BUG-17) |
| Statement | Read | Scoped to the owning company | PC | Scoped | Scoped | PASS |
| Voucher | Create | Idempotent per booking | DI | One | One | PASS |
| Voucher | Download | Scoped to the owning company | PC | Scoped | Scoped | PASS |
| Voucher | Download | Blocked for a cancelled booking | XM | Blocked | **Served, and regenerated on demand** | **FAIL (BUG-15)** |
| Reports | Overview | Every service type counted | XM | All | **`ActivityPackage` missing** | **FAIL (BUG-17)** |
| Reports | Overview | Revenue = confirmed + completed | HP | Correct rule | Correct rule | PASS |
| Reports | Overview | Headline revenue covers all currencies | XM | Split | **`['USD']` only — EGP dropped** | **FAIL (BUG-18)** |
| Reports | Overview | Monthly revenue per currency | XM | Split | **Summed across currencies** | **FAIL (BUG-18)** |
| Reports | Company | Agent restricted to their own company | PC | Restricted | Restricted | PASS |
| Auth | Login | Inactive user or company blocked | PC | Blocked | Blocked | PASS |
| Auth | Token | Deactivated mid-session loses access | PC | Immediately | **Valid for up to 1 hour** | **FAIL (BUG-16)** |
| Auth | Token | Company move takes effect immediately | PC | Immediately | **Stale `companyId` for up to 1 hour** | **FAIL (BUG-16)** |
| Users | Manage | COMPANY_ADMIN limited to own AGENTs | PC | Limited | `canManageTarget` | PASS |
| Users | Delete | Users with history are deactivated | DI | Deactivated | 3 relations missing → 500 | FAIL (BUG-19) |
| Users | Reset | Password reset revokes refresh tokens | PC | Revoked | Revoked | PASS |
| Search | Global | Scoped to the caller's company | PC | Scoped | Scoped | PASS |
| Search | Global | Inactive/hidden hotels excluded | PC | Excluded | Returned | FAIL (BUG-39) |

---

## 6. Confirmed Bugs

### BUG-01 — Saving the shared cruise catalogue detaches every programme and transfer from every existing cruise booking, on every boat

**Severity:** BLOCKER · **Confidence:** Confirmed
**Module:** Nile Cruise · **Feature:** Shared programme/transfer catalogue
**Related Modules:** Cruise Bookings, Invoicing, Vouchers, Transport operations queue, Reports
**Actor:** SUPERADMIN

#### Business Scenario
Operations maintains one reusable catalogue of cruise programmes ("4-night Luxor→Aswan classic")
and priced transfer routes ("Luxor Airport → Boat, VAN_6, 100 USD"). Saving it is routine work — a
new season, a corrected price, a renamed programme. Meanwhile there are live bookings on the water.

#### Preconditions
* At least one confirmed `CruiseBooking` with `programmeId`, `programmeRateId` and/or
  `transferRateId` populated.
* An admin opens the shared catalogue and presses Save (even with no changes).

#### Steps to Reproduce
1. Book a cruise with a programme and a priced transfer; confirm it. Note
   `programmeId`, `programmeRateId`, `transferRateId`.
2. Open the admin cruise catalogue → shared programmes/transfers → **Save**
   (`PUT /api/cruise-shared-catalogue`).
3. Re-read the booking: `GET /api/cruise-bookings`.

#### Expected Business Behaviour
An existing booking is a signed commercial commitment. Re-publishing the catalogue may change what
is *offered from now on*; it must never change or erase what was *already sold*.

#### Actual Behaviour
`saveCruiseSharedCatalogue` calls `materialiseSharedCatalogue(tx, catalogue)` **with no
`onlyCruiseId`**, which executes:

```ts
// cruise-catalogue.controller.ts:484-485
await tx.cruiseProgramme.deleteMany({ where: onlyCruiseId ? { cruiseId: onlyCruiseId } : {} });
await tx.cruiseTransferRate.deleteMany({ where: onlyCruiseId ? { cruiseId: onlyCruiseId } : {} });
```

With `onlyCruiseId` undefined both `where` clauses are `{}` — **every programme and every transfer
rate in the database, for every boat, is deleted** and then re-created with new ids. The schema
routes those deletions straight into the bookings:

```prisma
programmeId     String?
programme       CruiseProgramme?     @relation(..., onDelete: SetNull)   // schema.prisma:1140
programmeRateId String?
programmeRate   CruiseProgrammeRate? @relation(..., onDelete: SetNull)   // schema.prisma:1142
transferRateId  String?
transferRate    CruiseTransferRate?  @relation(..., onDelete: SetNull)   // schema.prisma:1144
```

(`CruiseProgrammeRate` is itself `onDelete: Cascade` from `CruiseProgramme`, so deleting the
programme deletes its rates, which nulls `programmeRateId` too.)

After the save the booking still has its `refNumber`, `totalAmount`, `adultUnitPrice` and
`transferRequested = true` — but `programmeId`, `programmeRateId` and `transferRateId` are all
`NULL`. Because `cruiseInclude` resolves those relations for every read, the booking now reports
`programme: null` and `transferRate: null` to the API, the admin screen and the invoice pipeline.

#### Why This Is a Business Problem
The booking becomes unfulfillable. Nobody can answer "which programme did this client buy?" or
"which vehicle did we sell them, from where, to where?" — the fields that told the driver where to
collect the guests are gone. The row still says a transfer was requested and still carries its price
inside `totalAmount`, so the company has paid for a transfer the system can no longer describe. A
new programme row with the identical name exists beside it, unlinked, which makes the loss easy to
miss until someone tries to operate the booking.

#### Cross-Module Impact
* **Cruise Bookings** — 5 foreign keys nulled per booking.
* **Transport operations queue** — `cruiseTransferOperation` still lists the row
  (`transferRequested` is a boolean on the booking, not the FK) but its route now comes only from
  the denormalised `transferFromName`/`transferToName` snapshot; the authoritative vehicle type,
  capacity and price are gone.
* **Invoicing** — `generateCruiseInvoicePdf` re-reads the booking; a regenerated PDF loses the
  programme description.
* **Reports** — "which programme sells" becomes unanswerable historically.

#### Data Impact
Irreversible. The old `CruiseProgramme` / `CruiseProgrammeRate` / `CruiseTransferRate` rows are
hard-deleted; the FK values on the bookings are overwritten with NULL. There is no audit trail and
no snapshot column to recover from. Note the contrast: `CruiseBookingActivity` *does* snapshot
`name`/`description` "so the voucher still reads correctly after the catalogue entry is renamed or
retired" (schema.prisma:1220-1222) — the programme and transfer were never given the same treatment.

#### Evidence
* `src/modules/nile-cruise/cruise-catalogue.controller.ts:596` — `await materialiseSharedCatalogue(tx, catalogue);` (no third argument)
* `src/modules/nile-cruise/cruise-catalogue.controller.ts:478-486` — the unscoped `deleteMany`
* `prisma/schema.prisma:1140-1145` — the three `SetNull` relations
* `prisma/schema.prisma:1063` — `CruiseProgrammeRate ... onDelete: Cascade`
* `public/admin.html:4674` — the UI's plain Save button; no confirmation, no warning

#### Root Cause Hypothesis
`materialiseSharedCatalogue` was written as a delete-and-recreate "replace the whole set" operation,
matching the pattern used for the per-cruise editors. The `onlyCruiseId` parameter was added later so
`saveCruiseSchedules` could re-materialise one boat, but the global call site was never given a
scope, and no call site considered that `CruiseBooking` holds foreign keys into the tables being
replaced. The booking model was designed to reference priced rows by id precisely to stop
text-matching from repricing bookings (see the comment at schema.prisma:1135) — that intent is
defeated when the rows are periodically destroyed.

#### Recommended Direction
Investigate whether catalogue rows that are referenced by any booking may be deleted at all, and
whether `CruiseBooking` should snapshot the programme/transfer descriptors the way
`CruiseBookingActivity` already snapshots activity names. Decide separately whether a catalogue save
should ever touch boats other than the one being edited. **Do not fix as part of this phase.**

---

### BUG-02 — Editing any field on a cruise silently destroys its entire cabin fare table and unlinks every booking from its schedule and rate

**Severity:** BLOCKER · **Confidence:** Confirmed
**Module:** Nile Cruise · **Feature:** Sailing schedules / cabin rate matrix
**Related Modules:** Cruise Bookings, Invoicing, Reports
**Actor:** SUPERADMIN

#### Business Scenario
An admin opens a boat to fix a typo in its description, or to add a gallery photo, and saves.

#### Preconditions
* A cruise with saved schedules and a cabin rate matrix.
* At least one existing `CruiseBooking` on that cruise.

#### Steps to Reproduce
1. Note the cruise's `CruiseCabinRate` rows and a booking's `cabinRateId` / `scheduleId`.
2. In the admin portal open that cruise, change **only** the description, and Save.
3. Re-read the rates and the booking.

#### Expected Business Behaviour
Editing descriptive copy is not a pricing action. Fares, schedules and their links to sold bookings
must be untouched.

#### Actual Behaviour
The admin save handler unconditionally re-publishes the whole catalogue whenever the cruise form is
open:

```js
// public/admin.html:2162-2164
const scheduleRes = await apiFetch(`/cruises/${savedId}/schedules`, {
  method: "PUT", body: JSON.stringify({ schedules: cruiseCatalogue.schedules }),
});
```

`saveCruiseSchedules` then runs `await tx.cruiseSchedule.deleteMany({ where: { cruiseId } })`
(cruise-catalogue.controller.ts:220). Because `saveCruiseRates` *requires* every fare to carry a
`scheduleId` ("Every fare must belong to this cruise schedule", line 133), **all** cabin rates hang
off a schedule — and the schema cascades:

```prisma
scheduleId  String?
schedule    CruiseSchedule? @relation(..., onDelete: Cascade)   // CruiseCabinRate,   schema.prisma:1013
schedule    CruiseSchedule  @relation(..., onDelete: Cascade)   // CruiseProgramme,   schema.prisma:1044
schedule    CruiseSchedule  @relation(..., onDelete: Cascade)   // CruiseTransferRate, schema.prisma:1101
scheduleId  String?
schedule    CruiseSchedule? @relation(..., onDelete: SetNull)   // CruiseBooking,     schema.prisma:1149
```

So one schedule save deletes every cabin rate, every programme and every transfer rate for that
boat, and nulls `scheduleId` on every booking. `saveCruiseSchedules` then calls
`materialiseSharedCatalogue(tx, sharedCatalogue, cruiseId)` — which restores programmes and transfers
**but not the cabin fares**. The client re-POSTs the fares immediately afterwards
(admin.html:2176), which recreates them *with new ids*, so `cabinRateId` on every existing booking
stays NULL forever.

The comment at admin.html:2160 confirms the ids are known to change: *"Schedules are replaced and
receive new ids, so save them first and map every fare/programme/transfer from its visible row index
to the saved id."* The mapping is applied to the new fare rows; nobody re-maps the bookings.

#### Why This Is a Business Problem
Every historical booking loses the evidence of which cabin category and which sailing leg it was
sold against. `cabinType`, `adultUnitPrice` and `occupancy` are snapshotted so the money survives,
but `cabinRate.cabinName` (the fare-plan label the client actually bought — "Deluxe deck", "Cruise
only") and the schedule are gone. If the intermediate rate save fails, the boat is left with
schedules and **no prices at all** — the UI shows the error *"The cruise was saved, but its
programmes or prices could not be saved"* (admin.html:2179), by which point the old fares are
already destroyed.

#### Cross-Module Impact
Cruise Bookings (`cabinRateId`, `scheduleId` → NULL), the fare table itself (deleted), programmes and
transfer rates (deleted then re-created with new ids — compounding BUG-01), Invoicing, Reports.

#### Data Impact
`CruiseCabinRate` rows are hard-deleted. `CruiseBooking.cabinRateId` and `.scheduleId` are
overwritten with NULL. `NileCruise.departureDays` and `.duration` are also rewritten from the new
schedule set (line 243-248), so a boat's advertised duration can change under live bookings.

#### Evidence
* `public/admin.html:2159-2181` — the unconditional schedule-then-rates re-publish
* `src/modules/nile-cruise/cruise-catalogue.controller.ts:220` — `cruiseSchedule.deleteMany`
* `src/modules/nile-cruise/cruise-catalogue.controller.ts:133-136` — every fare must carry a `scheduleId`
* `src/modules/nile-cruise/cruise-catalogue.controller.ts:140` — `cruiseCabinRate.deleteMany` in the rates save
* `prisma/schema.prisma:1013, 1044, 1101, 1149` — the cascade/SetNull chain

#### Root Cause Hypothesis
The replace-all editor pattern (borrowed from the hotel rate matrix, where nothing references a rate
row) was applied to a model where four child tables and one booking table hold foreign keys into the
replaced rows. The frontend compounds it by treating "save the cruise" and "republish the catalogue"
as one action.

#### Recommended Direction
Investigate whether schedule rows can be matched and updated in place rather than replaced, and
whether the cruise form should issue catalogue writes when no catalogue field was touched. **Do not
fix as part of this phase.**

---

### BUG-03 — The wallet is currency-blind: a sale priced in EGP is debited from a USD balance at 1:1

**Severity:** BLOCKER · **Confidence:** Confirmed
**Module:** Wallet · **Feature:** Debit on confirmation
**Related Modules:** every booking module, Companies, Invoicing, Reports
**Actor:** SUPERADMIN (confirming), affects every company

#### Business Scenario
Elbakri's pricing model is explicitly dual-currency: the Egyptian market is quoted in EGP, everyone
else in USD (`marketCurrency()`, `cruiseAudienceCurrency()`). A company's wallet, however, has a
single `currency`. Nothing forces the two to agree.

#### Preconditions
A company whose `currency` differs from the currency the matched rate resolves to. This is reachable
in normal operation: `Company.market` and `Company.currency` are two independent fields, the price
row's currency is a third, and a `MarketPrice` override carries its own currency
(`MarketPrice.currency`) that need not match anything.

#### Steps to Reproduce
1. Company A: `currency = 'USD'`, `market = 'EGYPTIAN'`, `balance = 100000`.
2. Book a transport rate with `priceEgp = 5000`. `pickDualPrice` returns 5000 **EGP**;
   `explicitMoney(5000,'EGP')` stores `totalAmount = 5000`, `currency = 'EGP'`.
3. Confirm. `debitWallet` runs `company.balance.lt(5000)` → `100000 < 5000` is false → proceed;
   `balance = 100000 - 5000 = 95000`.
4. The company has been charged **5,000 USD** for a **5,000 EGP** service (~100 USD).

#### Expected Business Behaviour
Money in one currency cannot be subtracted from a balance in another. The system should either
refuse the mismatch or convert explicitly and record the rate.

#### Actual Behaviour
`debitWallet` never looks at a currency. It has no currency parameter, `WalletTransaction` has **no
currency column at all**, and the balance check is a bare numeric comparison:

```ts
// src/shared/wallet.ts:36-46
if (input.amount.lte(0)) return { debited: false };
...
const company = await tx.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { balance: true } });
if (company.balance.lt(input.amount)) throw new Error('INSUFFICIENT_BALANCE');
const balanceAfter = balanceBefore.sub(input.amount);
```

The same is true of `refundWallet` and of the two inlined copies (visa.controller.ts:600-625,
bookings.controller.ts:420-437).

The asymmetry is the proof this is an oversight rather than a decision: **top-ups are
currency-guarded.**

```ts
// src/modules/companies/companies.controller.ts:366
if (walletCurrency !== company.currency) throw new Error('CURRENCY_MISMATCH');
```

Money may only *enter* the wallet in the company's own currency; it may leave in any currency at all.

#### Why This Is a Business Problem
Either the agency is massively overcharged (EGP amount taken from a USD balance) or the platform
gives the service away (USD amount taken from an EGP balance: a $500 tour costs the agency 500 EGP,
about $10). `INSUFFICIENT_BALANCE` also becomes meaningless — a company with ample funds is refused,
or one with none is allowed through. Because `WalletTransaction` stores no currency, **the ledger
cannot be audited or corrected after the fact**: there is no way to tell which historical rows were
EGP and which were USD.

The previous audit anticipated exactly this and left it as documented risk (a) — *"admins must align
a company's wallet currency with its market's price rows (documented intent, no auto-FX)"*. It is
enforced by nothing: not the schema, not the API, not the UI.

#### Cross-Module Impact
Every module that confirms or cancels: Transport, Activity, Package, Cruise, Booking, Reception, SIM,
Visa. Companies (`balance` becomes a number without a unit). Reports (`topCompanies[].totalRevenue`
reads `revenueByCurrency[company.currency]`, which returns 0 for any company whose bookings resolved
to a different currency — see BUG-18).

#### Data Impact
`Company.balance` becomes an unlabelled number mixing two currencies. `WalletTransaction` rows are
permanently ambiguous. Reconciliation between the wallet ledger and the invoices (which *do* carry a
currency) becomes impossible.

#### Evidence
* `src/shared/wallet.ts:31-59` (`debitWallet`), `:66-89` (`refundWallet`) — no currency anywhere
* `prisma/schema.prisma:874-890` — `WalletTransaction` has no `currency` field
* `src/modules/companies/companies.controller.ts:366` — the guard that exists on top-ups
* Currency-producing call sites: `transport.resolve.ts:190` (`marketCurrency`),
  `shared/cruise-rates.ts:91` (`cruiseAudienceCurrency`), `shared/pricing.ts:105-109` (`rowValue`
  returns `r.currency`)
* `AUDIT_BASELINE.md` — "Remaining risks (a)"

#### Root Cause Hypothesis
The wallet predates the dual-currency pricing model. When `convertMoney(..., company.currency)` was
removed from all nine flows to stop FX-converting explicit sale prices (previous audit, Finding 5),
the booking currency became "whatever the rate says" — but `debitWallet`, which had always assumed
booking currency == company currency, was not revisited. `PlatformWallet` *is* keyed by currency
(`@id currency`), showing the platform side was modelled correctly; the company side was not.

#### Recommended Direction
Investigate whether the company wallet should be per-currency (mirroring `PlatformWallet`), or
whether a booking whose resolved currency differs from the wallet's should be refused at confirm
time. Either way the decision needs `WalletTransaction.currency` to exist before historical data can
be interpreted. **Do not fix as part of this phase.**

---

### BUG-04 — Any COMPANY_ADMIN can export every hotel's full confidential rate book

**Severity:** BLOCKER · **Confidence:** Confirmed
**Module:** Hotels · **Feature:** Excel export
**Related Modules:** Companies (tenancy), Pricing
**Actor:** COMPANY_ADMIN of any agency

#### Business Scenario
Hotel contract rates are the platform's core commercial asset. The system models this carefully:
`Hotel.showPriceToAgents` hides prices globally, and `HotelCompanyVisibility.canViewPrice` overrides
it per agency. Agency A must not see the rates offered to agency B, and must not see rates it was
never granted.

#### Preconditions
A valid COMPANY_ADMIN token for any agency.

#### Steps to Reproduce
1. Log in as COMPANY_ADMIN of agency A.
2. `GET /api/hotels/export-excel`.
3. Open the workbook.

#### Expected Business Behaviour
The export should contain only what this caller may see: hotels visible to them, priced only where
`showPriceToAgents` or their own `canViewPrice` allows.

#### Actual Behaviour
The handler ignores the caller entirely — the request parameter is discarded (`_req`) — and dumps
every active hotel with every active seasonal price row:

```ts
// src/modules/hotels/pricing.controller.ts:141-146
export async function exportHotelsExcel(_req: Request, res: Response): Promise<void> {
  const hotels = await prisma.hotel.findMany({
    where: { isActive: true },
    include: { pricing: { where: { isActive: true } } },
    orderBy: { name: 'asc' },
  });
```

Each row carries `Hotel Name, City, Country, Stars, Address, Room Type, Season, Price/Night,
Currency, Valid From, Valid To`. There is no `showPriceToAgents` check, no
`HotelCompanyVisibility` join, and no company scope. The route explicitly admits company admins:

```ts
// src/modules/hotels/hotels.routes.ts:45
router.get('/export-excel', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), exportHotelsExcel);
```

The contrast with the same module's own read paths is stark — `listHotels` and `getHotel` both go
through `canSeePrices(hotel, visibilityOverride)` and return `pricePerNight: null` when it is false
(hotels.controller.ts:142, 216).

#### Why This Is a Business Problem
Any agency can extract the entire contracted rate book, including rates negotiated for competitors
and rates for hotels it was deliberately not shown. It leaks the platform's margin structure and its
supplier terms in one request. This is a cross-tenant confidentiality breach in the one dataset the
business most needs to protect, reachable with a legitimate account and no special tooling.

#### Cross-Module Impact
Hotels (visibility model bypassed), Companies (tenant isolation broken), Pricing (the whole
`MarketPrice`/`HotelRate` tiering is rendered pointless — the raw `HotelPricing` table is exposed).

#### Data Impact
Read-only, but the exposure is total and undetectable after the fact (no access log on the route).

#### Evidence
* `src/modules/hotels/pricing.controller.ts:141-180` — the unscoped export
* `src/modules/hotels/hotels.routes.ts:45` — COMPANY_ADMIN is granted the route
* `src/modules/hotels/hotels.controller.ts:141-142, 215-216` — the visibility logic that the export skips
* `prisma/schema.prisma:608-620` — `HotelCompanyVisibility`, the model being bypassed

#### Root Cause Hypothesis
The export was written as an admin convenience (matching `importHotelsExcel`, which is correctly
SUPERADMIN-only) and COMPANY_ADMIN was added to the role list so agencies could export *their own*
view — without the handler ever being taught what that view is. `_req` being unused is the tell: the
function was never given a caller to scope by.

#### Recommended Direction
Investigate whether agencies need an export at all, and if so what it should contain. Compare with
`listHotels`, which already computes the correct per-caller price view. **Do not fix as part of this
phase.**

---

### BUG-05 — Deleting an approved security approval keeps the money and orphans the ledger; the "cancel it instead" it recommends does not exist

**Severity:** CRITICAL · **Confidence:** Confirmed
**Module:** Security Approval (Visa) · **Feature:** Delete · **Related:** Wallet, Invoicing, Vouchers
**Actor:** SUPERADMIN

#### Business Scenario
An approval was filed, approved, and the agency's wallet was debited. The client then cancels the
trip, or the approval was filed against the wrong passport.

#### Preconditions
`VisaApplication` in status `APPROVED` (so a `WalletTransaction` DEBIT exists), with an `UNPAID`
invoice not yet on a consolidated statement.

#### Steps to Reproduce
1. Create and approve an approval for 500 USD. Wallet: 10000 → 9500.
2. `DELETE /api/visa-applications/:id`.
3. Check the company balance and `WalletTransaction`.

#### Expected Business Behaviour
Removing a charged service must return the money, or refuse until it has been.

#### Actual Behaviour
`deleteVisaApplication` guards only against a **paid** invoice or one already on a statement. An
`APPROVED` application with an `UNPAID` invoice passes both checks and is destroyed:

```ts
// src/modules/visa/visa.controller.ts:558-562
await prisma.$transaction(async (tx) => {
  if (existing.voucher) await tx.voucher.delete({ where: { id: existing.voucher.id } });
  if (existing.invoice) await tx.invoice.delete({ where: { id: existing.invoice.id } });
  await tx.visaApplication.delete({ where: { id: existing.id } });
});
```

No `refundWallet`. The balance stays at 9500 and the `WalletTransaction` DEBIT survives, its
`reference` pointing at a `refNumber` (`VIS-2026-nnnn`) that no longer exists anywhere.

The refusal message tells the admin what to do instead:

> *"This approval is already paid — cancel it instead of deleting it"* (visa.controller.ts:546)

**There is no cancel endpoint for a visa.** `visa.routes.ts` exposes `submit`, `approve`, `reject`,
`PATCH` and `DELETE` — nothing else. `rejectVisa` only accepts `PENDING`/`SUBMITTED`, so it cannot
touch an approved one. `VisaStatus.CANCELLED` exists in the enum and is set by no code path.

#### Why This Is a Business Problem
The agency pays for a service it never receives, permanently, with no record connecting the charge to
anything. Every other module refunds on cancel — this one has no way out at all: an approved
approval can be neither cancelled nor safely deleted. Support has no remedy except editing the
database.

#### Cross-Module Impact
Wallet (orphan DEBIT, balance permanently short), Invoicing (invoice hard-deleted, so the charge
vanishes from statements while the debit remains), Vouchers (deleted), Reports (the record leaves
`loadReportRecords`, so revenue silently drops while the wallet says it was collected).

#### Data Impact
Permanent divergence between `Company.balance` and the set of live bookings. A `WalletTransaction`
whose `reference` resolves to nothing — which also means `refundWallet` could never repair it later,
since it keys on that same reference.

#### Evidence
* `src/modules/visa/visa.controller.ts:530-563` — the delete path, no refund
* `src/modules/visa/visa.controller.ts:546` — the message recommending a cancel that does not exist
* `src/modules/visa/visa.routes.ts:11-23` — no cancel route
* `src/shared/wallet.ts:70` — `refundWallet` keys on `reference`, which is destroyed with the row
* `prisma/schema.prisma:204-212` — `VisaStatus.CANCELLED`, unreachable

#### Root Cause Hypothesis
The delete was designed for tidying up mistakes filed before any money moved, and its guards were
written against the *invoice* status (`PAID`) rather than the *application* status (`APPROVED`) —
but the wallet is debited at approval, not at payment, so the guard checks the wrong milestone. The
cancel path it points at was planned and never built.

#### Recommended Direction
Investigate which milestone means "money has moved" for this module (approval, not payment), and
whether the missing cancel-with-refund transition should exist before delete is allowed at all.
**Do not fix as part of this phase.**

---

### BUG-06 — Repricing an approved security approval rewrites the booking and the invoice but not the wallet

**Severity:** CRITICAL · **Confidence:** Confirmed
**Module:** Security Approval · **Feature:** Admin edit with repricing · **Related:** Wallet, Invoicing
**Actor:** SUPERADMIN

#### Business Scenario
An approved approval is corrected — the nationality was wrong, or the processing type changes from
Normal to Express. Both are pricing inputs, so the fee changes.

#### Preconditions
`VisaApplication` in `APPROVED` status, wallet already debited, invoice `UNPAID`.

#### Steps to Reproduce
1. Approve an application at 500 USD. Balance 10000 → 9500; `WalletTransaction.amount = 500`.
2. `PATCH /api/visa-applications/:id` with `{ "processingType": "URGENT" }` (resolves to 900).
3. Compare booking, invoice, wallet.

#### Expected Business Behaviour
Either the wallet is adjusted by the difference, or repricing an already-charged application is
refused — as it already is for a *paid* one.

#### Actual Behaviour
The only guard is on the invoice being `PAID`:

```ts
// src/modules/visa/visa.controller.ts:455-461
if (existing.invoice && existing.invoice.status === 'PAID') {
  res.status(400).json({ ..., error: 'INVOICE_ALREADY_PAID',
    message: 'This approval is already paid — its price can no longer be changed' });
  return;
}
```

An `APPROVED` + `UNPAID` application sails through. `totalAmount`, `currency` and the money snapshot
are overwritten on the application (lines 476-482); `Invoice.subtotal/taxAmount/total` are rewritten
and `pdfPath` is nulled so the PDF regenerates at the new figure (lines 484-497). **No wallet call
appears anywhere in the function.**

Final state: `application.totalAmount = 900`, `invoice.total = 900`,
`walletTransaction.amount = 500`, `company.balance` short by only 500. Three records, three
different answers.

#### Why This Is a Business Problem
The invoice bills 900 and the wallet collected 500. The 400 difference is invisible: no transaction
records it, and `getBalance`'s reconciliation (`totalUsed = debits − refunds`) will never surface it
because it only ever compares the ledger with itself. Repricing *downward* is worse — the agency has
been overcharged and nothing will ever give it back. Because `refundWallet` refunds
`booking.totalAmount` (the *new* figure) and `debitWallet` is keyed on the reference, a later cancel
refunds 900 against a 500 debit — the platform pays out 400 it never took.

#### Cross-Module Impact
Wallet (ledger diverges from the booking), Invoicing (invoice and PDF show an uncollected amount),
Reports (`loadReportRecords` reads `totalAmount` = 900, so reported revenue exceeds money actually
taken), and any later cancellation over-refunds.

#### Data Impact
Permanent three-way inconsistency with no field recording it.

#### Evidence
* `src/modules/visa/visa.controller.ts:448-509` — the reprice block, no wallet interaction
* `src/modules/visa/visa.controller.ts:455` — the guard checks invoice status, not application status
* `src/modules/visa/visa.controller.ts:600-625` — the approval debit this is diverging from
* `src/shared/wallet.ts:66-89` — `refundWallet` would later refund the new amount

#### Root Cause Hypothesis
Same misidentified milestone as BUG-05: the code treats "invoice PAID" as the point of no return,
but the wallet is debited at **approval**. Every other module debits and reprices at the same moment
(creation), so this is the only place where a price can move after money has.

#### Recommended Direction
Investigate which application statuses may still be repriced, and whether a reprice after a debit
should post a compensating ADJUSTMENT transaction (`TransactionType.ADJUSTMENT` exists and is used
by nothing). **Do not fix as part of this phase.**

---

### BUG-07 — Consolidated statements bill cancelled invoices

**Severity:** CRITICAL · **Confidence:** Confirmed
**Module:** Invoicing · **Feature:** Consolidated statement · **Related:** every booking module, Wallet
**Actor:** SUPERADMIN creating a statement; the agency receives it

#### Business Scenario
At month end, operations generates one statement per agency covering that month's invoices. Some of
that month's bookings were cancelled and already refunded.

#### Preconditions
A company with a mix of `UNPAID` and `CANCELLED` invoices in the period, none yet consolidated.

#### Steps to Reproduce
1. Create and confirm a 1000 USD transport booking (invoice `UNPAID`).
2. Cancel it — the wallet is refunded and `invoice.status` becomes `CANCELLED`.
3. `POST /api/invoices/consolidated` for that company and period (no `status` filter, the normal case).
4. Read the statement total.

#### Expected Business Behaviour
A cancelled invoice represents no debt. It must not appear in the amount due.

#### Actual Behaviour
`invoiceFilters` narrows by company, optional status, optional date range and `consolidatedLine:
null`. **Nothing excludes `CANCELLED`:**

```ts
// src/modules/invoices/consolidated.controller.ts:99-112
return {
  companyId: input.companyId,
  ...(input.status && { status: input.status as ... }),
  ...((from || to) && { createdAt: { ... } }),
  ...(input.eligibleOnly && { consolidatedLine: null }),
};
```

The totals then sum every row returned:

```ts
// consolidated.controller.ts:210-212
const subtotal = invoices.reduce((sum, invoice) => sum.add(invoice.subtotal), new Decimal(0));
const total    = invoices.reduce((sum, invoice) => sum.add(invoice.total),    new Decimal(0));
const statementStatus = invoices.every((invoice) => invoice.status === 'PAID') ? 'PAID' : 'UNPAID';
```

The cancelled 1000 is inside `total`, and because it is not `PAID` the whole statement is stamped
`UNPAID`. The PDF and the Excel export both render the line with `Status: CANCELLED` beside an
amount that is nonetheless included in the sum — so the document contradicts itself.

#### Why This Is a Business Problem
The agency is invoiced for services it cancelled and was already refunded for — money it has back in
its wallet is billed again on paper. Every statement containing a cancellation is wrong, and the
error is in the platform's favour, which makes it a credibility and potentially a legal problem. It
also double-counts against the wallet: the refund returned the money, the statement asks for it.

#### Cross-Module Impact
Invoicing (statement totals), Wallet (refunded money re-billed), every booking module that can be
cancelled, and the agency-facing PDF/Excel.

#### Data Impact
`ConsolidatedInvoice.total` is wrong on any statement spanning a cancellation.
`ConsolidatedInvoiceLine.status` snapshots `CANCELLED` correctly, so the inconsistency is visible in
the data but is not acted on. A second, related staleness: once a line is written, later payment of
the underlying invoice never updates `ConsolidatedInvoiceLine.status` or the parent statement.

#### Evidence
* `src/modules/invoices/consolidated.controller.ts:92-112` — `invoiceFilters`, no status exclusion
* `src/modules/invoices/consolidated.controller.ts:210-212` — unconditional summation
* `src/modules/invoices/consolidated.controller.ts:229-241` — the line snapshot keeps `CANCELLED`
* Cancel paths that set `CANCELLED`: `transport.controller.ts:895`, `cruise.controller.ts:700`,
  `activities.controller.ts:723`, `activity-packages.controller.ts:527`, `reception.controller.ts:304`

#### Root Cause Hypothesis
`status` was exposed as an optional *filter* the admin may pass, which was mistaken for the exclusion
rule. The mixed-currency case was thought through carefully (an explicit `MIXED_CURRENCY` refusal at
line 202) — the cancelled case simply was not considered.

#### Recommended Direction
Investigate whether `CANCELLED` invoices should be excluded from eligibility outright, and how a
statement should react when an invoice it already contains is later cancelled or paid. **Do not fix
as part of this phase.**

---

### BUG-08 — Concurrent wallet writes lose money: every balance update is an absolute assignment

**Severity:** CRITICAL · **Confidence:** Highly Likely (deterministic reproduction needs a live DB and two clients)
**Module:** Wallet · **Feature:** Debit / refund / top-up · **Related:** every booking module, Companies
**Actor:** two SUPERADMINs, or one admin double-clicking

#### Business Scenario
Two operations staff confirm two different bookings for the same agency at the same moment — routine
during a busy morning.

#### Preconditions
Postgres at its default `READ COMMITTED` isolation (Prisma's `$transaction(fn)` does not raise it),
two concurrent requests touching the same `Company` row.

#### Steps to Reproduce
1. Company balance 10000.
2. Simultaneously `PATCH /transport-bookings/A/confirm` (300) and `PATCH /activity-bookings/B/confirm` (200).
3. Expect 9500. Observe 9700 or 9800.

#### Expected Business Behaviour
Two debits totalling 500 must leave the balance 500 lower.

#### Actual Behaviour
Every wallet write in the codebase reads the balance, computes a new value in application memory,
and writes it back as an absolute value — never an atomic `{ decrement }`, and with no row lock:

```ts
// src/shared/wallet.ts:41-45
const company = await tx.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { balance: true } });
if (company.balance.lt(input.amount)) throw new Error('INSUFFICIENT_BALANCE');
const balanceBefore = company.balance;
const balanceAfter  = balanceBefore.sub(input.amount);
await tx.company.update({ where: { id: input.companyId }, data: { balance: balanceAfter } });
```

Under `READ COMMITTED` both transactions read 10000, compute 9700 and 9800 respectively, and the
later write wins — one debit is silently lost while both `WalletTransaction` rows are created. The
ledger then shows two debits that the balance does not reflect.

All **seven** write sites share the pattern, so the same race applies to refunds, top-ups and the
platform wallet:

```
src/shared/wallet.ts:45              debitWallet
src/shared/wallet.ts:78              refundWallet
src/modules/visa/visa.controller.ts:611          (inlined debit copy)
src/modules/bookings/bookings.controller.ts:427  (inlined refund copy)
src/modules/companies/companies.controller.ts:383, 404  topupCompany (platform + company)
src/modules/wallet/wallet.controller.ts:173      fundPlatformWallet
```

`rejectBooking` is worse still: its idempotency check runs **outside** the transaction, so two
concurrent rejects can both observe "a debit exists and no refund yet" and both refund:

```ts
// src/modules/bookings/bookings.controller.ts:410-420
const [debit, priorRefund] = await Promise.all([ ...prisma.walletTransaction.findFirst... ]);
if (debit && !priorRefund) {
  await prisma.$transaction(async (tx) => { /* refund */ });
}
```

`refundWallet` at least performs its check inside `tx`, which narrows but does not close the window
under `READ COMMITTED`.

#### Why This Is a Business Problem
The platform silently loses revenue (lost debits) or pays out twice (double refunds), and the
`WalletTransaction` ledger stops reconciling with `Company.balance` — which the code elsewhere calls
"the authoritative remaining balance" (wallet.controller.ts:57). Once they diverge there is no way to
tell which is right. It is also self-inflicted-able by a single user double-clicking Confirm.

#### Cross-Module Impact
Every confirm and cancel path in all eight booking modules; Companies; the balance shown in
`getBalance` and `buildWalletSummary`; every report that reads revenue.

#### Data Impact
`Company.balance` drifts from `SUM(credits) − SUM(debits) + SUM(refunds)` with no marker.
`balanceBefore`/`balanceAfter` on the affected transactions record a sequence that never happened.

#### Evidence
* `src/shared/wallet.ts:41-45, 74-78`
* `src/modules/bookings/bookings.controller.ts:410-437` — check outside the transaction
* All seven sites confirmed by `grep -rn "data: { balance:" src/`
* No `isolationLevel`, `FOR UPDATE`, `increment` or `decrement` appears in any wallet path

#### Root Cause Hypothesis
`balanceBefore`/`balanceAfter` are stored on every `WalletTransaction` for audit, which requires
reading the balance first; the natural implementation then writes the computed value back. Prisma's
atomic `{ decrement }` cannot return the pre-image, so the audit requirement quietly forced the
unsafe pattern. Serialisable isolation or an explicit row lock was never introduced.

#### Recommended Direction
Investigate whether the balance snapshot can be obtained under a row lock or a raised isolation
level, and whether `Company.balance` should be derived from the ledger rather than maintained
alongside it. **Do not fix as part of this phase.**

---

### BUG-09 — A cancelled invoice can be marked PAID, and the customer is thanked for the payment

**Severity:** CRITICAL · **Confidence:** Confirmed
**Module:** Invoicing · **Feature:** Mark as paid · **Related:** every booking module, Wallet, Statements
**Actor:** SUPERADMIN

#### Preconditions
An invoice whose booking was cancelled (`invoice.status = 'CANCELLED'`, wallet already refunded).

#### Steps to Reproduce
1. Confirm then cancel a booking. Invoice → `CANCELLED`, wallet refunded.
2. `PATCH /api/invoices/:id/mark-paid`.

#### Expected Business Behaviour
A cancelled invoice is not payable. The transition should be refused.

#### Actual Behaviour
`markPaid` has no status guard at all — it is a bare update followed by a customer email:

```ts
// src/modules/invoices/invoices.controller.ts:224-229
export async function markPaid(req: Request, res: Response): Promise<void> {
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { status: 'PAID', paidAt: new Date() },
    include: invoiceInclude,
  });
```

…then emails the agency *"Invoice … has been marked as PAID. Thank you!"* (line 248).

Resulting state: **booking CANCELLED + invoice PAID + wallet REFUNDED** — a combination that cannot
occur in reality. Re-marking an already-paid invoice also silently overwrites `paidAt`, destroying
the original payment date.

#### Why This Is a Business Problem
The books show payment collected for a service that was cancelled and refunded. Any statement
generated afterwards reads that invoice as `PAID` and may stamp the whole statement `PAID`
(consolidated.controller.ts:212), so the error propagates. The customer receives a confirmation for a
payment that did not happen against a service they cancelled.

#### Cross-Module Impact
Invoicing, Consolidated statements, Wallet (refund contradicted), Reports (which read booking status,
so the booking still counts as cancelled while its invoice says paid), and outbound email.

#### Data Impact
`Invoice.status = PAID` with `paidAt` set on a cancelled booking; unrecoverable original `paidAt` on
re-marks.

#### Evidence
* `src/modules/invoices/invoices.controller.ts:224-252` — no guard, no idempotency
* Cancel paths setting `CANCELLED` (listed under BUG-07)
* Contrast: `confirmTransportBooking` et al. all begin `if (booking.status !== 'PENDING') throw new Error('INVALID_STATUS')`

#### Root Cause Hypothesis
The booking modules all carry explicit state-machine guards; the invoice module was treated as a
passive record and never given one. `InvoiceStatus` has four values but no transition table anywhere.

#### Recommended Direction
Investigate the legal invoice transitions (in particular whether `CANCELLED` and `PAID` are terminal)
and where they should be enforced. **Do not fix as part of this phase.**

---

### BUG-10 — `rateId` bypasses both capacity and route matching: pay one route's price for a different journey, at any passenger count

**Severity:** CRITICAL · **Confidence:** Confirmed
**Module:** Transport · **Feature:** Rate resolution · **Related:** Vouchers, Invoicing, Operations
**Actor:** AGENT / COMPANY_ADMIN — reachable through ordinary UI use

#### Business Scenario
The booking form fetches a quote, caches the matched `rateId`, and sends it with the booking. The
user may change passenger count, pickup or drop-off after the quote without the form re-quoting.

#### Preconditions
Any active `TransportRate` id — obtainable from `GET /transport-rates` or `/transport-rates/quote`,
both open to agents.

#### Steps to Reproduce
1. Quote a SEDAN airport transfer (`maxCapacity = 3`) for 2 pax → returns `rateId = R`.
2. Change passenger count to 40 and the endpoints to a different city pair.
3. Submit. The payload carries `rateId: R` with the new `passengerCount` and endpoints.

#### Expected Business Behaviour
The rate must be re-validated against what is actually being booked: a 3-seat sedan cannot carry 40
people, and a rate priced for A→B cannot price C→D.

#### Actual Behaviour
`resolveTransportRate` applies capacity and route filters **only when no `rateId` is supplied**. The
`rateId` branch short-circuits both:

```ts
// src/modules/transport/transport.resolve.ts:138-145
if (q.rateId) {
  const rate = await prisma.transportRate.findFirst({ where: { id: q.rateId, isActive: true } });
  if (!rate) return null;
  const fallback: RateMatch['matchedDirection'] = isDisposalMode(rate.serviceMode) ? 'DISPOSAL' : 'EXACT';
  const dir = directionFor(rate, q) ?? fallback;
  return { rate, matchedDirection: dir };
}
```

Only the no-`rateId` path narrows candidates:

```ts
// transport.resolve.ts:161-162
minCapacity: { lte: q.pax },
OR: [{ maxCapacity: null }, { maxCapacity: { gte: q.pax } }],
```

Note also `?? fallback`: when the endpoints do **not** match the rate, `directionFor` returns `null`
and the booking is nonetheless recorded as `matchedDirection: 'EXACT'`. `createTransportBooking`
then stores the route from the *user's own* pickup/drop-off fields
(`fromLocationStore`/`toLocationStore`, transport.controller.ts:613-616) and never re-checks
`passengerCount` against the rate. The voucher prints the user's route; the invoice charges the
unrelated rate's price.

The frontend makes this reachable without any tampering — it sends a cached quote id alongside
current form values:

```js
// public/dashboard.html:4080
rateId: (isDisposal ? disposalRateId : state.transportQuote?.rateId) || undefined,
```

#### Why This Is a Business Problem
Two distinct failures. Commercially, a long intercity run can be bought at a short airport
transfer's price — under-charging with a plausible audit trail. Operationally, 40 passengers are
dispatched against a 3-seat vehicle: the voucher, the invoice and the operations queue all say sedan,
and nothing in the system flags the impossibility. `TransportRate.minCapacity`/`maxCapacity` become
advisory.

#### Cross-Module Impact
Transport (mis-priced booking, wrong `matchedDirection` audit), Vouchers (driver receives an
undeliverable job), Invoicing (invoice built from the wrong rate), Wallet (wrong amount debited),
Operations.

#### Data Impact
`TransportBooking.rateId` points at a rate that does not describe the journey; `matchedDirection`
records `EXACT` for a non-match, making the audit field actively misleading.

#### Evidence
* `src/modules/transport/transport.resolve.ts:138-145` — the unguarded `rateId` branch
* `src/modules/transport/transport.resolve.ts:161-162` — the capacity filter that only the other branch gets
* `src/modules/transport/transport.controller.ts:406-419` — `body.rateId` passed straight through
* `src/modules/transport/transport.controller.ts:613-616` — route stored from user input, not the rate
* `public/dashboard.html:4080` — cached `rateId` sent with live form values

#### Root Cause Hypothesis
`rateId` was introduced as "authoritative — never match a booking to a price by display text"
(schema.prisma:1252) and was therefore trusted as *already validated*, on the assumption it always
comes straight from a quote for the same parameters. The quote is a separate stateless request, so
that assumption does not hold once the user edits the form.

#### Recommended Direction
Investigate whether an explicitly supplied `rateId` should still be validated against `pax` and the
requested endpoints, and what should happen when it does not match (re-quote vs refuse). **Do not fix
as part of this phase.**

---

### BUG-11 — Cruise rate, programme and transfer endpoints hand every agent both markets' price tables, bypassing `showPriceToAgents`

**Severity:** CRITICAL · **Confidence:** Confirmed
**Module:** Nile Cruise · **Feature:** Catalogue read APIs · **Related:** Companies, Pricing
**Actor:** any AGENT / COMPANY_ADMIN

#### Business Scenario
`NileCruise.showPriceToAgents` exists so operations can publish a boat without exposing its fares.
Cruises are also sold at two deliberately different tariffs — EGP for the Egyptian market, USD for
everyone else — which agencies must not be able to compare.

#### Steps to Reproduce
1. As an AGENT of a FOREIGN-market company, `GET /api/cruises` — prices correctly hidden
   (`cabinRates: []`) when `showPriceToAgents = false`.
2. `GET /api/cruises/:id/rates` — the complete table.
3. Same for `/programmes` and `/transfer-rates`.

#### Expected Business Behaviour
The same visibility rule must hold on every endpoint that returns the same numbers, and an agency
should only ever see its own market's tariff.

#### Actual Behaviour
`listCruises` is careful:

```ts
// src/modules/nile-cruise/cruise.controller.ts:132-135
cabinRates:    cruise.showPriceToAgents ? rates : [],
transferRates: cruise.showPriceToAgents ? transferRates : [],
priceFrom:     cruise.showPriceToAgents ? (cheapest?.amount ?? null) : null,
```

The sibling endpoints apply no filter of any kind — no visibility check, no market filter, not even
`isActive`:

```ts
// src/modules/nile-cruise/cruise-catalogue.controller.ts:104-110
export async function listCruiseRates(req: Request, res: Response): Promise<void> {
  const rates = await prisma.cruiseCabinRate.findMany({
    where: { cruiseId: req.params.id },   // ← the only condition
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: rates });
}
```

`listCruiseProgrammes` (line 613) and `listCruiseTransferRates` (line 707) are identical. The routes
deliberately leave them open:

```ts
// src/modules/nile-cruise/cruise.routes.ts:27-33
router.get('/cruises/:id/rates', listCruiseRates);          // ← no requireRole
router.put('/cruises/:id/rates', requireRole('SUPERADMIN'), saveCruiseRates);
```

The comment above them says these are *"readable by agents — the rates are what they quote from"*,
but they return **both** market tiers, **inactive** rows, unpublished future-season pricing, and the
full supplement structure.

The parallel hotel endpoint is admin-only, which shows the intended standard:

```ts
// src/modules/hotels/hotels.routes.ts:66
router.get('/:id/rates', requireRole('SUPERADMIN'), listHotelRatesAdmin);
```

#### Why This Is a Business Problem
A foreign agency reads the Egyptian EGP tariff and sees the margin difference directly; every agency
sees fares operations deliberately withheld, plus deactivated and future-dated rows that were never
meant to be quoted. `showPriceToAgents` becomes decorative for cruises.

#### Cross-Module Impact
Nile Cruise (visibility model bypassed), Companies (market segmentation defeated), Pricing.

#### Evidence
* `src/modules/nile-cruise/cruise-catalogue.controller.ts:104-110, 613-620, 707-713`
* `src/modules/nile-cruise/cruise.routes.ts:27, 29, 31, 33`
* `src/modules/nile-cruise/cruise.controller.ts:132-135` — the gate that is bypassed
* `src/modules/hotels/hotels.routes.ts:66` — the equivalent hotel endpoint, correctly gated

#### Root Cause Hypothesis
These endpoints were written for the admin rate editor and left ungated so the agent booking form
could reuse them, without carrying across the market/visibility filtering that `listCruises` already
implements.

#### Recommended Direction
Investigate what the agent booking form actually needs from these endpoints and whether
`listCruises`' filtered output already covers it. **Do not fix as part of this phase.**

---

### BUG-12 — `GET /api/hotels/:id/pricing` returns the full seasonal rate table regardless of price visibility

**Severity:** CRITICAL · **Confidence:** Confirmed
**Module:** Hotels · **Feature:** Seasonal pricing read · **Related:** Companies, Pricing
**Actor:** any AGENT / COMPANY_ADMIN

#### Steps to Reproduce
1. Find a hotel with `showPriceToAgents = false` (or a `HotelCompanyVisibility` row with
   `canViewPrice = false` for your company). `GET /api/hotels/:id` → `pricePerNight: null`,
   `pricing: []`.
2. `GET /api/hotels/:id/pricing` → every active `HotelPricing` row, with prices.

#### Expected Business Behaviour
Same data, same rule.

#### Actual Behaviour
```ts
// src/modules/hotels/pricing.controller.ts:41-47
export async function getHotelPricing(req: Request, res: Response): Promise<void> {
  const pricing = await prisma.hotelPricing.findMany({
    where: { hotelId: req.params.id, isActive: true },
    orderBy: [{ roomType: 'asc' }, { season: 'asc' }],
  });
  res.json({ success: true, data: pricing });
}
```
No caller, no visibility check. The route is open: `router.get('/:id/pricing', getHotelPricing);`
(hotels.routes.ts:63) — while every write on the same resource is SUPERADMIN-gated.

`getHotel` two files over does exactly the opposite: `pricing: showPrice ? hotel.pricing : []`
(hotels.controller.ts:242).

#### Why This Is a Business Problem
Same commercial exposure as BUG-04, one hotel at a time, and it defeats the per-company visibility
model that the business went to the trouble of building (`HotelCompanyVisibility`, with both a
`canViewPrice` and a `canRequestQuote` flag).

#### Cross-Module Impact
Hotels, Companies (tenant price segmentation), Pricing.

#### Evidence
* `src/modules/hotels/pricing.controller.ts:41-47`
* `src/modules/hotels/hotels.routes.ts:63`
* `src/modules/hotels/hotels.controller.ts:242` — the rule it contradicts
* `prisma/schema.prisma:608-620` — the model bypassed

#### Root Cause Hypothesis
The pricing sub-resource was built as an admin CRUD surface; the read was left open for the agent
detail view without inheriting the visibility logic that lives in `hotels.controller.ts`.

#### Recommended Direction
Investigate whether agents need this endpoint at all given `getHotel` already returns a filtered
`pricing` array. **Do not fix as part of this phase.**

---

### BUG-13 — There is no availability or inventory system anywhere: every capacity field in the schema is unenforced

**Severity:** HIGH · **Confidence:** Confirmed (by exhaustive absence)
**Module:** all booking modules · **Feature:** Availability
**Related:** Nile Cruise, Activities, Hotels, Transport · **Actor:** any booking user

#### Business Scenario
A boat has 60 cabins, an excursion seats 20, a hotel has rooms, a van holds 6. A booking system's
first job is not to sell more than exists.

#### Steps to Reproduce
1. Create a cruise with `cabins = 1`.
2. Create 50 confirmed `CruiseBooking`s on the same schedule and dates. All succeed.
3. Same for an activity with `maxPax = 20` and a 500-adult booking; same for a hotel with no rooms.

#### Expected Business Behaviour
A booking must be refused once the resource is exhausted, and capacity must be re-released on
cancellation.

#### Actual Behaviour
No query anywhere counts existing bookings against a capacity. Verified by search: no
`count({ where: { checkIn … } })`, no overlap query, no availability table, no inventory decrement.
The capacity fields exist, are admin-editable, are displayed — and are read by nothing at booking
time:

| Field | Where it lives | Enforced at booking? |
|---|---|---|
| `NileCruise.cabins` | schema.prisma:929 | **No** — `createCruiseBooking` never reads it |
| `Room.isAvailable`, `Room.capacity` | schema.prisma:496-497 | **No** — `createBooking` never loads `Room` at all, though it stores `roomId` |
| `Activity.minPax` / `maxPax` | schema.prisma:1454-1455 | **No** — absent from `createActivityBooking` and from `createActivityPackage`; also absent from `dashboard.html` entirely |
| `TransportRate.minCapacity` / `maxCapacity` | schema.prisma:1355-1356 | **Partly** — filtered during rate search, skipped whenever `rateId` is supplied (BUG-10) |
| `CruiseTransferRate.vehicleCapacity` | schema.prisma:1109 | Used only to compute how many vehicles to *charge for*, never checked against a fleet |
| `ServiceGroupType.minPax` / `maxPax` | schema.prisma:1648-1649 | Used to select a price tier, not to limit a booking |

`Booking.roomsCount` is taken verbatim from the request — *"How many rooms a party needs is the
booker's call"* (bookings.controller.ts:142) — with no stock behind it.

#### Why This Is a Business Problem
Unlimited overbooking on every product. Operations discovers it only when a client arrives at a full
boat. The same driver and vehicle can be committed to any number of simultaneous transfers, since no
Driver or Vehicle entity exists at all — `VehicleType` is an enum describing a *class* of vehicle,
not a resource that can be allocated. Cancellation "releasing" capacity is moot because nothing
consumed it.

#### Cross-Module Impact
Nile Cruise, Activities, Packages, Hotels/Bookings, Transport, and the operations queue, which lists
work that may be physically impossible to staff.

#### Data Impact
No corruption — the records are individually valid. The *set* of records is collectively impossible,
which is exactly the class of defect this phase was asked to find.

#### Evidence
* `grep -rn "count({ where.*checkIn\|count({ where.*activityDate\|count({ where.*pickupDateTime" src/` → no matches
* `grep -rn "availab\|overlap\|inventory" src/modules/*/[a-z]*.controller.ts` → only `availableBases`
  (a pricing helper), `availableCredit`, and `availableSupplements`
* `grep -n "maxPax\|minPax" public/dashboard.html` → no matches
* `src/modules/bookings/bookings.controller.ts:117-152` — `Room` never queried
* The only conflict logic in the codebase is `findTimeConflict`
  (activity-packages.controller.ts:88-104), which compares lines **within one submitted package** only

#### Root Cause Hypothesis
The portal is modelled as a *request* system — an agency asks, operations confirms manually against
supplier availability held off-system — rather than as an inventory system. That is a coherent
design, but the capacity columns in the schema and the confirm-without-checking flow make it look
like an inventory system to both admins and agents.

#### Recommended Direction
This needs a business decision before any code: is availability held in this system or in the
suppliers'? If the former, the capacity fields need a consumption model; if the latter, they should
stop being presented as limits. See BUSINESS-QUESTION-1. **Do not fix as part of this phase.**

---

### BUG-14 — Accepted quote requests convert into nothing: the agency's main revenue path has no terminus

**Severity:** HIGH · **Confidence:** Confirmed
**Module:** Quote Requests · **Feature:** Lifecycle · **Related:** Bookings, Cruise, Invoicing, Wallet, Reports
**Actor:** AGENT (submits), SUPERADMIN (quotes and accepts)

#### Business Scenario
Hotels, Nile cruises, multi-service packages and flights are all quote-only. An agent asks, an admin
prices it, the agency accepts. That is the platform's largest-value business.

#### Steps to Reproduce
1. As an AGENT, `POST /api/quote-requests` for a cruise. → `QR-2026-0001`, status `NEW`.
2. As SUPERADMIN, `PATCH` it to `QUOTED` with `quotedAmount = 20000`, then to `ACCEPTED`.
3. Look for the resulting booking, invoice, wallet movement, voucher or report entry.

#### Expected Business Behaviour
`ACCEPTED` is the commercial commitment. It should produce a booking (or at least an invoice), move
money, and appear in reports.

#### Actual Behaviour
Nothing happens. `updateQuoteRequest` stamps `confirmedAt`/`confirmedById` and returns
(quote-requests.controller.ts:288-296). There is no conversion code anywhere:

```
grep -rni "convert.*quote|quote.*convert|fromQuote|quoteId" src/  →  no matches
grep -rn "quoteRequest" src/ (outside its own module)             →  2 hits, both read-only
    search.controller.ts:107     (global search)
    transport.controller.ts:96   (transfer add-ons queue)
```

The agent side is firmly closed:
* `createBooking` → `USE_QUOTE_REQUEST` for anyone who is not SUPERADMIN (bookings.controller.ts:80-87)
* `createCruiseBooking` → `USE_QUOTE_REQUEST` for anyone who is not SUPERADMIN (cruise.controller.ts:263-270)
* `createActivityBooking` → `USE_QUOTE_REQUEST` when `isConfirmableInApp = false`

So `quotedAmount` is a `Decimal` that reaches no invoice, no wallet, no statement and no report.
`QuoteRequest` is absent from `loadReportRecords` entirely, so accepted business is invisible to the
dashboard.

The only way to turn an accepted quote into a booking is for a SUPERADMIN to re-key it by hand
through `createBooking`/`createCruiseBooking`, with no link back to the quote — the two records have
no shared identifier.

#### Why This Is a Business Problem
The highest-value flow in the portal has no completion. Revenue is tracked off-system; the wallet is
never debited for it, so an agency's balance does not reflect its real commitments; reports
understate the business by the whole quote-only book. The audit trail between "what we quoted" and
"what we booked" does not exist.

#### Cross-Module Impact
Quote Requests → Bookings (no bridge), Invoicing (no invoice), Wallet (no debit), Vouchers (no
voucher), Reports (whole category absent), Transport ops (the quote's transfer answers reach the
queue, but nothing ever promotes them to a `TransportBooking`).

#### Data Impact
`QuoteRequest.quotedAmount`, `.confirmedAt`, `.confirmedById` are written and never read by any
downstream process. Any manually re-keyed booking is unlinked.

#### Evidence
* `src/modules/quote-requests/quote-requests.controller.ts:271-317` — the whole of the accept path
* `src/modules/bookings/bookings.controller.ts:80-87`, `src/modules/nile-cruise/cruise.controller.ts:263-270`
* `src/modules/reports/reports.controller.ts:33-115` — `loadReportRecords` queries seven models; `quoteRequest` is not among them
* Searches above

#### Root Cause Hypothesis
The quote workflow was built as a communication channel (submit → notify → respond by email) rather
than as a commercial workflow, and the conversion step was left for a later phase that has not
happened. The presence of `confirmedAt`/`confirmedById` — described in the code as *"the quote
lifecycle's 'confirmed' milestone"* — shows the intent existed.

#### Recommended Direction
Investigate what an accepted quote should become for each `serviceType`, and whether the resulting
booking should carry a reference back to the quote. See BUSINESS-QUESTION-3. **Do not fix as part of
this phase.**

---

### BUG-15 — Vouchers are issued before anyone confirms and are never revoked when the booking is cancelled

**Severity:** HIGH · **Confidence:** Confirmed
**Module:** Vouchers · **Feature:** Lifecycle · **Related:** Transport, Activities, Packages, Visa, Airport Assist
**Actor:** any booking user; the voucher reaches the end client and the driver

#### Business Scenario
A voucher is the customer-facing document a guest shows a driver or a hotel. It should exist exactly
when the service is committed, and stop being valid when it is cancelled.

#### Steps to Reproduce
1. `POST /api/transport-bookings` → status `PENDING`. A voucher is created and a PDF written.
2. `PATCH /transport-bookings/:id/cancel` → booking `CANCELLED`, invoice `CANCELLED`, wallet refunded.
3. `GET /api/vouchers/:id/download` → the PDF is still served. Delete the file and call again — it
   is **regenerated** from the cancelled booking.

#### Expected Business Behaviour
Consistent issuance across modules, and a cancelled service must not keep a valid document.

#### Actual Behaviour
**Issued at PENDING** in five modules — before an admin has agreed to anything:
```
transport.controller.ts:735   createTransportBooking   (status 'PENDING')
activities.controller.ts:571  createActivityBooking    (status 'PENDING')
activity-packages.controller.ts:445  createActivityPackage (status 'PENDING')
visa.controller.ts:358        createVisaApplication    (status 'PENDING')
reception.controller.ts:199   createReception          (status 'PENDING')
```
**Issued on CONFIRMED** in exactly one:
```
sim-card.controller.ts:360    if (status === 'CONFIRMED') { … }
```
Six modules, two different answers to the same lifecycle question.

**Never revoked.** No cancel path touches the voucher — `cancelTransportBooking`,
`cancelActivityBooking`, `cancelActivityPackage`, `cancelReception` and the SIM cancel branch all
update the booking and its invoice and stop there. The only `voucher.delete` in the codebase is
inside `deleteVisaApplication` (visa.controller.ts:560).

`downloadVoucher` never looks at the parent's status, and actively rebuilds a missing PDF:

```ts
// src/modules/vouchers/vouchers.controller.ts:313-320
if (!voucher.pdfPath || !fs.existsSync(voucher.pdfPath)) {
  const data = await buildVoucherDataFor(voucher);
  if (data) { … const { path: pdfPath } = await generateVoucherPdf(data); … }
}
```

`Voucher` has no `status`, `cancelledAt` or `isValid` column at all (schema.prisma:2037-2065), so
there is nowhere to record revocation even if a cancel path wanted to.

#### Why This Is a Business Problem
A guest can present a valid-looking voucher for a service that was cancelled and refunded, and a
driver has no way to tell. On the issuance side, the customer receives their document before
operations has agreed to deliver — and if the booking is then rejected for lack of funds
(`INSUFFICIENT_BALANCE`) the document is already out. `listVouchers` shows cancelled bookings'
vouchers with no marker.

#### Cross-Module Impact
Vouchers ↔ Transport / Activity / Package / Visa / Reception lifecycles; operations (a driver may run
a cancelled job); Wallet (service delivered after refund).

#### Data Impact
`Voucher` rows outlive the validity of what they describe, with no field expressing that.

#### Evidence
* Creation sites listed above; SIM's contrasting guard at `sim-card.controller.ts:359-360`
* Cancel paths: `transport.controller.ts:871-903`, `activities.controller.ts:699-734`,
  `activity-packages.controller.ts:509-534`, `reception.controller.ts:279-315`
* `src/modules/vouchers/vouchers.controller.ts:296-333` — download with no status check
* `prisma/schema.prisma:2037-2065` — no status column

#### Root Cause Hypothesis
The comment at each creation site — *"before responding when possible so the company portal can show
'Download Voucher' immediately"* — shows this was a deliberate UX choice, made per-module without a
shared rule, and the cancellation counterpart was never added.

#### Recommended Direction
Investigate the intended voucher lifecycle (issue at confirm or at request? revoke, delete, or
watermark on cancel?) and apply one answer across all six modules. See BUSINESS-QUESTION-4. **Do not
fix as part of this phase.**

---

### BUG-16 — Deactivating a user or company, or moving a user between companies, has no effect for up to an hour

**Severity:** HIGH · **Confidence:** Confirmed
**Module:** Auth / Users · **Feature:** Access revocation · **Related:** every module
**Actor:** SUPERADMIN or COMPANY_ADMIN performing the change; the affected user retains access

#### Business Scenario
Staff leave, an agency is suspended for non-payment, or a user is moved to a different agency.

#### Steps to Reproduce
1. User U of company A logs in (access token TTL is `JWT_EXPIRES_IN`, default **1h**).
2. `PATCH /api/users/U { "isActive": false }` — or suspend company A, or move U to company B.
3. U continues using the existing token.

#### Expected Business Behaviour
Access ends immediately, and a moved user's scope changes immediately.

#### Actual Behaviour
`authenticate` verifies the JWT signature and trusts its claims — it never loads the user:

```ts
// src/middleware/auth.ts:26-32
const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
req.user = payload;
next();
```

Every controller then scopes on `req.user.companyId` and `req.user.role` from that token. Meanwhile
`updateUser` changes `isActive`/`companyId`/`role` **without deleting refresh tokens**
(users.controller.ts:137-152) — even though the module clearly knows the pattern:
`resetUserPassword` (line 178) and `deleteUser` (lines 239, 247) both call
`refreshToken.deleteMany`. `updateCompany` does not revoke anything either.

Consequences until the token expires:
* A deactivated user keeps full API access.
* A suspended company's staff keep reading and writing. Booking *creation* checks
  `company.isActive` (every module does), but list/read endpoints, invoices, wallet and vouchers do not.
* **A user moved from company A to company B keeps `companyId: A` in their token** — so they read and
  write company A's bookings while the database says they belong to B. This is cross-tenant access
  arising from a legitimate admin action.

`login` and `refresh` both check `isActive` and company status correctly (auth.controller.ts:33, 45,
96, 101), which confines the window to one token lifetime — but that window is a full hour by
default.

#### Why This Is a Business Problem
A departing employee retains access for an hour. A suspended agency keeps trading. Most seriously,
the company-move case gives a user access to a company they no longer belong to, defeating the
tenancy model that every controller depends on.

#### Cross-Module Impact
Every authenticated route; Companies (suspension ineffective); tenancy across all modules.

#### Data Impact
Bookings, cancellations and wallet movements can be recorded by a user against a company they no
longer belong to, with `createdById` pointing at a deactivated user.

#### Evidence
* `src/middleware/auth.ts:20-36` — signature-only verification
* `src/modules/users/users.controller.ts:137-152` — no token revocation on update
* `src/modules/users/users.controller.ts:178, 239, 247` — the revocation that exists elsewhere
* `src/modules/companies/companies.controller.ts:320-345` — `isActive` toggle, no revocation
* `.env.example:12` — `JWT_EXPIRES_IN=1h`

#### Root Cause Hypothesis
Standard stateless-JWT trade-off. It was addressed at the two authentication entry points and at
password reset, but the "identity changed" events in the user and company modules were not connected
to the same revocation.

#### Recommended Direction
Investigate whether `authenticate` should re-check user/company state (with caching), or whether
every identity-changing write should revoke tokens the way `resetUserPassword` does. **Do not fix as
part of this phase.**

---

### BUG-17 — Activity packages are invisible to reporting and unlabelled on statements

**Severity:** HIGH · **Confidence:** Confirmed
**Module:** Reports & Invoicing · **Feature:** Revenue aggregation · **Related:** Activity Packages
**Actor:** SUPERADMIN reading the dashboard; agencies receiving statements

#### Steps to Reproduce
1. Create and confirm an activity package for 5,000 USD (wallet debited, invoice created).
2. `GET /api/reports/overview` — the package is in no count and no revenue figure.
3. Put its invoice on a consolidated statement — the line reads `Service` with a blank reference.

#### Expected Business Behaviour
A package is a confirmed, invoiced, wallet-debited sale like any other, and must be counted and
named.

#### Actual Behaviour
`loadReportRecords` queries **seven** models — `booking`, `activityBooking`, `transportBooking`,
`cruiseBooking`, `visaApplication`, `airportReception`, `simRequest`. `activityPackage` is not among
them (reports.controller.ts:35-115), and `bookingsByType` has no `ACTIVITY_PACKAGE` key
(lines 183-193). So package sales are missing from `totalBookings`, `bookingsByType`,
`bookingsByStatus`, `totalRevenue`, `revenueByMonth` and `topCompanies`.

The consolidated statement has the same blind spot: `sourceInclude` covers seven relations and omits
`activityPackage` (consolidated.controller.ts:9-56), so `invoiceLine` falls through every branch:

```ts
// consolidated.controller.ts:61-68, 70-80
const refNumber = inv.booking?.refNumber ?? … ?? inv.simRequest?.refNumber ?? '';
let service = 'Service';
if (inv.booking) … else if (inv.simRequest) …   // no activityPackage branch
```
The line is written with `refNumber: null` and `service: 'Service'` — and that snapshot is what the
PDF and Excel render.

Note the main invoice controller *does* include `activityPackage` (invoices.controller.ts:76-86), so
the omission is specific to these two aggregators.

#### Why This Is a Business Problem
Packages are a headline feature — one package, many excursions, one invoice, one voucher — and their
revenue is absent from every management figure. The dashboard understates the business by the whole
package book, and agencies receive statements with unidentifiable line items they cannot reconcile.

#### Cross-Module Impact
Reports (all metrics), Consolidated statements (PDF and Excel), Activity Packages.

#### Data Impact
Read-side only, but `ConsolidatedInvoiceLine.service`/`refNumber` are **persisted snapshots**, so the
unlabelled lines are stored permanently.

#### Evidence
* `src/modules/reports/reports.controller.ts:35-115`, `:183-193`
* `src/modules/invoices/consolidated.controller.ts:9-56`, `:61-80`
* `src/modules/invoices/invoices.controller.ts:76-86` — where it *is* handled
* `src/modules/activities/activity-packages.controller.ts:471-478` — the package debit that goes uncounted

#### Root Cause Hypothesis
Activity packages were added after the reporting and statement aggregators were written, and those
two aggregators enumerate their sources by hand. Nothing fails when a model is missed.

#### Recommended Direction
Investigate whether the list of billable services can be derived from one place (for example the
`Invoice` relations, which are already exhaustive) rather than re-enumerated per aggregator. **Do not
fix as part of this phase.**

---

### BUG-18 — Reported revenue adds currencies together and the headline figure silently drops every non-USD sale

**Severity:** HIGH · **Confidence:** Confirmed (reproduced by probe)
**Module:** Reports · **Feature:** Revenue aggregation · **Related:** every booking module
**Actor:** SUPERADMIN

#### Business Scenario
The platform sells in EGP to the Egyptian market and USD to everyone else — by design.

#### Steps to Reproduce
1. Confirm bookings worth 250,000 EGP and 1,000 USD.
2. `GET /api/reports/overview`.

#### Expected Business Behaviour
Revenue is reported per currency, or converted at a stated rate. It is never added across currencies.

#### Actual Behaviour
Two separate defects in the same function.

**(a) The headline total keeps only USD.** For the platform-wide overview `reportCurrency` is
hard-coded:
```ts
// reports.controller.ts:266, 273
const reportCurrency = companyId ? companyMap.get(companyId)?.currency ?? 'USD' : 'USD';
totalRevenue: totalRevenueByCurrency[reportCurrency] ?? 0,
```
250,000 EGP of business reports as **0**. Probe: `totalRevenueByCurrency['USD'] ?? 0 === 0`. ✅

**(b) Monthly revenue is summed across currencies.** 
```ts
// reports.controller.ts:257-262
revenue: companyId
  ? revenueByCurrency[companyMap.get(companyId)?.currency ?? 'USD'] ?? 0
  : Object.values(revenueByCurrency).reduce((sum, amount) => sum + amount, 0),
```
100 USD + 5,000 EGP renders as **5,100** of nothing. Probe confirms. ✅

**(c) Per-company totals compound BUG-03.** `topCompanies[].totalRevenue` reads
`revenueByCurrency[company.currency]` (line 249), so a company whose bookings resolved to a different
currency than its wallet shows **0 revenue** while having real confirmed sales.

The correct helper already exists and is used by the invoicing module —
`totalsByCurrency()` (shared/invoicing.ts:29-52), whose own comment says *"adding those two together
would produce a number that means nothing"*. Reports does not use it.

#### Why This Is a Business Problem
Management decisions are made on these numbers. The Egyptian market — a first-class segment with its
own tariff — reads as zero revenue, and the monthly chart shows a figure with no unit that is neither
currency's true value.

#### Cross-Module Impact
Reports ↔ every booking module; Companies (`topCompanies`); compounds BUG-03 and BUG-17.

#### Evidence
* `src/modules/reports/reports.controller.ts:249, 257-262, 266, 273`
* `src/shared/invoicing.ts:29-52` — the correct helper, unused here
* Probes: *"reports sum revenue across currencies into one meaningless number"* and *"reports headline
  totalRevenue silently drops every non-USD sale"* — both pass

#### Root Cause Hypothesis
`totalRevenueByCurrency` and `revenueByCurrency` were added when dual-currency pricing arrived, but
the pre-existing single-number `totalRevenue`/`revenue` fields were kept for the dashboard's existing
charts and given the cheapest possible derivation.

#### Recommended Direction
Investigate what a single-number revenue figure should mean in a two-currency business, and whether
the dashboard should render per-currency series instead. **Do not fix as part of this phase.**

---

### BUG-19 — Deleting a user whose only history is packages, SIM requests or quotes returns a 500

**Severity:** HIGH · **Confidence:** Confirmed
**Module:** Users · **Feature:** Delete · **Related:** Activity Packages, SIM, Quote Requests
**Actor:** SUPERADMIN / COMPANY_ADMIN

#### Steps to Reproduce
1. Create an AGENT who creates one activity package (or one SIM request, or one quote request) and
   nothing else.
2. `DELETE /api/users/:id`.

#### Expected Business Behaviour
A user with operational history is deactivated, not deleted — which is exactly what the code intends.

#### Actual Behaviour
The history check counts **seven** relations and misses three:

```ts
// src/modules/users/users.controller.ts:199-221
const [bookings, transactions, cruiseBookings, transportBookings,
       activityBookings, visaApplications, airportReceptions] = await Promise.all([...]);
const hasOperationalHistory = [...].some((count) => count > 0);
```

Absent: `ActivityPackage` (`createdById`), `SimRequest` (`createdById`), `QuoteRequest`
(`createdById`). With no counted history the code takes the hard-delete branch (line 245), but the
database refuses:

* `QuoteRequest.createdBy … onDelete: Restrict` (schema.prisma:697)
* `ActivityPackage.createdBy` and `SimRequest.createdBy` are required relations with no `onDelete`,
  so Prisma applies `Restrict` by default.

The Prisma error is unhandled, so `asyncHandler` routes it to the global handler:
`500 { error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }`.

Worse, the delete is inside a `$transaction` that first deletes the user's refresh tokens
(line 246) — the transaction rolls back, so nothing is lost, but the admin is left with an
unexplained failure and no way to remove the user.

#### Why This Is a Business Problem
Offboarding silently fails for a whole class of users with a generic error that tells the admin
nothing. The intended graceful path (deactivate and preserve history) is exactly the right behaviour
and simply is not reached.

#### Cross-Module Impact
Users ↔ Activity Packages, SIM, Quote Requests.

#### Data Impact
None (the transaction rolls back), but the user cannot be offboarded through the product.

#### Evidence
* `src/modules/users/users.controller.ts:199-221, 235-251`
* `prisma/schema.prisma:697` (`QuoteRequest`), `:1479-1480` (`ActivityPackage`), `:1876-1877` (`SimRequest`)
* `src/modules/users/users.routes.ts:20` — `asyncHandler` sends the rejection to the 500 handler

#### Root Cause Hypothesis
The relation list was written when the model had seven booking types and was not revisited as
packages, SIM and quotes were added — the same enumeration drift as BUG-17.

#### Recommended Direction
Investigate deriving the history check from `User`'s declared relations rather than a hand-kept list.
**Do not fix as part of this phase.**

---

### BUG-20 — The activity transfer add-on is added in the activity's currency to a total in the market-override currency

**Severity:** HIGH · **Confidence:** Confirmed
**Module:** Activities & Packages · **Feature:** Transfer add-on pricing · **Related:** Pricing, Invoicing, Wallet
**Actor:** any booking user

#### Preconditions
An activity whose `currency = 'USD'` with `transferPrice = 30`, and a `MarketPrice`
`ACTIVITY_ADULT` override for the caller's market in **EGP** — a supported and intended
configuration (`MarketPrice.currency` is explicitly per-row).

#### Steps to Reproduce
1. Book that activity for 1 adult with `transferRequested = true`.
2. Adult price resolves to 1500 **EGP**; the transfer adds `activity.transferPrice = 30` (USD).
3. Total is stored as **1530 EGP**.

#### Expected Business Behaviour
The transfer, priced in USD, cannot be added to an EGP subtotal without a check or a conversion.

#### Actual Behaviour
The adult/child mismatch **is** guarded; the transfer is not.

```ts
// src/modules/activities/activities.controller.ts:468-472
if (childrenCount > 0 && adultPrice.currency !== childPrice.currency) {
  res.status(400).json({ ... error: 'MIXED_CURRENCY', ... }); return;
}
sourceAmountRaw = adultPrice.amount.mul(adultsCount).add(childPrice.amount.mul(childrenCount));
priceCurrency   = adultPrice.currency;      // ← may be EGP from the override
...
// :512-513  — no currency comparison anywhere on this path
transferAmount = activity.transferPrice.toDecimalPlaces(2);   // ← implicitly activity.currency
chargedAmount  = chargedAmount.add(transferAmount);
```
`explicitMoney(chargedAmount, priceCurrency)` then stamps the whole sum with the override currency.

Identical in packages (`activity-packages.controller.ts:305-307`), where the per-line and
line-vs-line currency guards both exist but the transfer is again exempt.

A second, related gap on the same path: **party pricing ignores `MarketPrice` entirely.**
`partyComposition(pax, basis, activity)` reads `activity.priceSingle/Double/Triple` raw and
`priceCurrency = activity.currency` (activities.controller.ts:494). The function takes no price
context — verified by probe (`partyComposition.length === 3`). So a company-specific or market
override configured for an activity applies to per-person bookings and is silently ignored for
private-party bookings of the same activity. (Tracked as BUG-23.)

#### Why This Is a Business Problem
A $30 transfer is billed as 30 EGP (about $0.60) — the platform absorbs the difference — or in the
reverse configuration an agency is billed 30 USD for a 30 EGP transfer. The invoice, the voucher and
the wallet all carry the wrong total, and nothing flags it because the sum is arithmetically valid.

#### Cross-Module Impact
Activities, Packages, Pricing (`MarketPrice` currency), Invoicing, Wallet (compounds BUG-03).

#### Evidence
* `src/modules/activities/activities.controller.ts:468-472` (guard present), `:496-517` (guard absent)
* `src/modules/activities/activity-packages.controller.ts:262-266` (guard present), `:296-311` (absent)
* `prisma/schema.prisma:1416-1418` — `transferPrice` carries no currency of its own; the comment says
  *"It uses the activity currency, so the catalogue, preview and server total can never disagree"* —
  which holds only when no override is in play
* `src/shared/pricing.ts:105-109` — `rowValue` returns the override row's own currency

#### Root Cause Hypothesis
`transferPrice` was designed as an activity-currency field at a time when the booking currency was
always the activity's. Once `MarketPrice` overrides could change the booking currency, the adult/child
comparison was added but the transfer add-on was not brought into it.

#### Recommended Direction
Investigate whether `transferPrice` needs its own currency (or its own `MarketPrice` entity type),
and whether the mixed-currency guard should cover every component of a total rather than named pairs.
**Do not fix as part of this phase.**

---

### BUG-21 — Three of the seven markets are unresolvable, so the admin price preview silently shows the wrong tier

**Severity:** HIGH · **Confidence:** Confirmed (reproduced by probe)
**Module:** Pricing · **Feature:** Admin price preview / market resolution · **Related:** all catalogue modules

#### Steps to Reproduce
1. As SUPERADMIN, preview a hotel/activity/transport price with `?market=MIDDLE_EAST`.
2. Compare with the `MIDDLE_EAST` `MarketPrice` row that exists for that entity.

#### Expected Business Behaviour
All seven `Market` values resolve to their own tier.

#### Actual Behaviour
`isMarket` recognises only four of the seven enum values:

```ts
// src/shared/pricing.ts:47-49
function isMarket(v: unknown): v is Market {
  return v === 'EGYPTIAN' || v === 'INTERNATIONAL' || v === 'GULF' || v === 'FOREIGN';
}
```
The enum has seven: `EGYPTIAN, INTERNATIONAL, GULF, FOREIGN, MIDDLE_EAST, NORTH_AFRICA, ARAB_48`
(schema.prisma:36-44). For the three unrecognised values `resolvePriceContext` returns
`market: null`, so `scoreRow` skips every market-specific row (`if (r.market) return ctx.market && … ? 2 : -1`)
and the preview falls back to the applies-to-all row or the base column — **showing a different price
from the one the customer will actually be charged**, with no error.

This affects only the SUPERADMIN `?market=` preview branch; a real company's market is read from the
database and passes through untouched, so live pricing is correct. But the preview is the tool used
to verify pricing before publishing, and it lies for three markets. `rates.controller.ts:12` proves
the full list was known: `const MARKETS: Market[] = ['EGYPTIAN','INTERNATIONAL','GULF','FOREIGN','MIDDLE_EAST','NORTH_AFRICA','ARAB_48'];`

Probe confirms the downstream effect: a `MIDDLE_EAST` context never matches an `INTERNATIONAL` row
and falls back to base (`resolveExplicitPrice(...).amount === 999`, `overridden === false`). ✅

#### Cross-Module Impact
Pricing preview for Hotels, Activities, Transport, SIM, Security, Airport Assist.

#### Evidence
`src/shared/pricing.ts:47-49`, `:65-70`; `prisma/schema.prisma:36-44`;
`src/modules/hotels/rates.controller.ts:12`

#### Root Cause Hypothesis
`isMarket` was written against the four original markets; the three later additions
(`MIDDLE_EAST`, `NORTH_AFRICA`, `ARAB_48` — the schema comment notes they are *"additive on
purpose"*) were added to the enum and to the rate editors but not to this hand-written guard.

#### Recommended Direction
Investigate deriving the guard from the generated `Market` enum, as `rates.controller.ts` and
`visa.schema.ts` already do. **Do not fix as part of this phase.**

---

### BUG-22 — The transport operations queue mixes cancelled work in with live work

**Severity:** HIGH · **Confidence:** Confirmed
**Module:** Transport operations · **Feature:** Transfer add-ons queue · **Related:** Activities, Packages, Cruise, Quotes

#### Steps to Reproduce
1. Create an activity booking with a transfer; cancel it.
2. `GET /api/transport-bookings/add-ons`.

#### Expected Business Behaviour
A cancelled parent's transfer is not work to be arranged.

#### Actual Behaviour
All four source queries filter on `transferRequested: true` only:

```ts
// src/modules/transport/transport.controller.ts:67-100
prisma.activityBooking.findMany({ where: { transferRequested: true }, take: 200, ... }),
prisma.activityPackageItem.findMany({ where: { transferRequested: true }, ... }),
prisma.cruiseBooking.findMany({ where: { transferRequested: true }, ... }),
prisma.quoteRequest.findMany({ where: { transferRequested: true }, ... }),
```
`sortTransferOperations` filters only nulls (transfer-operations.ts:227). Each row *carries* its
parent's status, so the data is correct — but cancelled rows occupy the `take: 200` window and the
`meta.counts` totals, and nothing separates them.

#### Why This Is a Business Problem
This is operations' only view of transfers to arrange. Cancelled jobs sit in it indefinitely, and
because the cap is 200 per source, a backlog of cancelled rows can push genuinely pending work out of
the list entirely. Combined with BUG-15 (the voucher stays valid), a cancelled transfer can plausibly
be dispatched.

#### Evidence
`src/modules/transport/transport.controller.ts:66-101`; `src/shared/transfer-operations.ts:222-229`

#### Recommended Direction
Investigate which parent statuses represent work to arrange, and whether the cap should apply after
filtering. **Do not fix as part of this phase.**

---

### BUG-23 — Activity party pricing ignores the market price matrix entirely

**Severity:** HIGH · **Confidence:** Confirmed (reproduced by probe)
**Module:** Activities · **Feature:** Party (single/double/triple) pricing · **Related:** Pricing, Packages

An activity booked **per person** resolves its price through `resolveMarketMoney('ACTIVITY_ADULT'…)`,
honouring company-specific and market-specific overrides. The **same activity** booked as a private
party reads the raw catalogue columns and never consults `MarketPrice`:

```ts
// src/modules/activities/activities.controller.ts:489-495
const lines = partyComposition(pax, basis, activity);   // reads activity.priceSingle/Double/Triple
pricingUnits   = compositionUnits(lines);
sourceAmountRaw = compositionTotal(lines);
priceCurrency   = activity.currency;                    // ← never an override currency
```
`partyComposition` accepts no price context at all — probe: `partyComposition.length === 3`
`(pax, basis, prices)`. ✅ Identical in `activity-packages.controller.ts:288-295`. There are no
`ACTIVITY_SINGLE`/`_DOUBLE`/`_TRIPLE` entity types in `MarketEntityType` (pricing.ts:24-34), so a
party rate cannot be overridden even if an admin wanted to.

**Business impact:** a company-specific negotiated rate applies to per-head bookings and is silently
ignored for private tours of the same activity — the agency is charged the public price. The admin
price editor gives no indication that the override it just saved covers only one of the two ways the
activity is sold.

**Evidence:** `src/modules/activities/activities.controller.ts:489-495`;
`src/modules/activities/activity-packages.controller.ts:288-295`;
`src/shared/activity-pricing.ts:110-140`; `src/shared/pricing.ts:24-34`

**Direction:** investigate whether party rates need their own `MarketEntityType` rows. **Do not fix.**

---

## Medium-severity findings

### BUG-24 — Cruise supplements are order-dependent and `PERCENTAGE` uses the pre-supplement base
**Severity:** MEDIUM · **Confidence:** Confirmed (probe) · **Module:** Nile Cruise

`applyCruiseSupplements` accumulates into `total` but always computes percentages from the original
`base`, and `TOTAL_PRICE` *replaces* the running total:

```ts
// src/shared/cruise-rates.ts:271-274
if (supplement.type === 'PERCENTAGE')       total = total.add(base.mul(amount).div(100));
else if (supplement.type === 'FIXED_AMOUNT') total = total.add(amount.mul(heads));
else if (supplement.type === 'TOTAL_PRICE')  total = amount.mul(heads);
```
Probes: a 1000 base with `TOTAL_PRICE 900 ×2 pax` then `PERCENTAGE 10` gives **1900**
(1800 + 10% of *1000*), not 1980. And `FIXED_AMOUNT 50` before `TOTAL_PRICE 900` gives **900** — the
50 is silently discarded — while the same two in the opposite order give **950**. ✅✅
The client controls the order via `body.selectedSupplements`, so the price depends on how the array
was built. **Direction:** investigate whether `TOTAL_PRICE` should be exclusive of other supplements
and what base a percentage applies to. **Do not fix.**

### BUG-25 — Transfer vehicle count and price are driven by a client-supplied passenger count
**Severity:** MEDIUM · **Confidence:** Confirmed (probe) · **Module:** Nile Cruise / Quotes

```ts
// src/modules/nile-cruise/cruise.controller.ts:465
const transferPaxCount = Math.max(1, Math.floor(Number(body.transferPaxCount ?? pax)) || pax);
```
It is never compared with `adultsCount + childrenCount`. `priceCruiseTransfer` then charges
`amount × ceil(pax / capacity)` — probe: 12 guests in a 6-seat van costs 200; claiming
`transferPaxCount: 1` for the same booking costs **100**. ✅ The voucher and the operations queue then
tell the driver to expect 1 passenger. The same unvalidated field is accepted on quote requests
(quote-requests.controller.ts:228-230), where an AGENT supplies it. **Direction:** investigate whether
this should be derived server-side. **Do not fix.**

### BUG-26 — No service date is ever validated as parseable or future, and an invalid date defeats every price validity window
**Severity:** MEDIUM · **Confidence:** Confirmed (probe) · **Module:** all booking modules

No module checks that a service date is in the future — verified across the codebase; the only date
comparison against `new Date()` anywhere is refresh-token expiry (auth.controller.ts:96). Every
service accepts a booking for last year.

`pickupDateTime` is additionally never NaN-checked (`transport.controller.ts:401`) while
`dropoffDateTime` beside it is (line 486) — so an unparseable pickup produces a Prisma failure and a
500 rather than a 400. Before that failure it is used as the pricing date, and probe confirms an
`Invalid Date` makes **every** `validFrom`/`validTo` comparison false, so an expired year-2000 price
row scores as applicable and can win:
`scoreRow(expiredRow, {date: new Date('not-a-date')}) === 1`, and
`resolveExplicitPrice([expired2000Row], …).amount === 10` instead of the base 500. ✅
`createCruiseBooking` does check (`Number.isNaN(checkIn.getTime())`, cruise.controller.ts:333), so the
pattern was known. **Direction:** investigate a shared date parser and whether past dates should be
refused or warned. **Do not fix.**

### BUG-27 — Cruise cabin rates accept `INTERNATIONAL` as `FOREIGN`; transfer rates do not
**Severity:** MEDIUM · **Confidence:** Confirmed (probe) · **Module:** Nile Cruise

`rateApplies` treats the two as one audience via `marketEquivalent` (cruise-rates.ts:113-117), and
`createCruiseBooking` mirrors it for cabin/programme rates (cruise.controller.ts:378-380). Transfer
rates use strict equality in both the catalogue read and the booking lookup:

```ts
// cruise.controller.ts:114        if (rate.market !== cruiseMarket) return false;
// cruise.controller.ts:470        market: expectedMarket,
```
So a legacy `INTERNATIONAL` transfer row is invisible and unbookable for a FOREIGN company whose
cabin rate from the same era resolves fine. Current saves normalise to `EGYPTIAN|FOREIGN`
(`asCruiseMarket`), so this only affects rows written before normalisation — which is exactly the
case `marketEquivalent` was added for. Probe confirms both behaviours. ✅ **Do not fix.**

### BUG-28 — A round-trip price override rewrites the one-way row's currency
**Severity:** MEDIUM · **Confidence:** Confirmed · **Module:** Transport

```ts
// src/modules/transport/transport.controller.ts:934-942
const ow = oneWayOv.get(r.id); if (ow != null) { r.rate = ow.amount; r.currency = ow.currency; }
const rt = rtOv.get(r.id);     if (rt != null) { r.roundTripRate = rt.amount; r.currency = rt.currency; }
```
`TransportRate` has one `currency` for two prices. If only the `TRANSPORT_RT` override exists, `rate`
keeps the base currency while `currency` is overwritten by the RT override's — so the one-way price
is displayed in the wrong currency. **Do not fix.**

### BUG-29 — Two market price rows can score equally; the winner is database order
**Severity:** MEDIUM · **Confidence:** Confirmed (probe) · **Module:** Pricing

`@@unique([entityType, entityId, market, companyId])` permits both a `(companyId=X, market=null)` row
and a `(companyId=X, market=GULF)` row. `scoreRow` returns **3** for both (pricing.ts:102), and
`resolveExplicitPrice` keeps the first with `s > bestScore`, so ordering decides the sale price.
Probe: the same two rows return **100** or **50** depending only on array order. ✅ Pax-range rows on
the same company have the same problem. **Direction:** investigate a tie-break (most specific, or
newest). **Do not fix.**

### BUG-30 — Deactivating a catalogue item with live bookings is silent, and confirmation still succeeds
**Severity:** MEDIUM · **Confidence:** Confirmed · **Module:** Hotels, Activities, Cruise, Transport

All four "deletes" are soft and unconditional:
`deleteHotel` (hotels.controller.ts:333), `deleteActivity` (activities.controller.ts:307),
`deleteCruise` (cruise.controller.ts:222), `deleteTransportRate` (master-data.controller.ts:235).
None counts dependent bookings, none warns, none notifies. `confirmActivityBooking` re-checks only
`booking.status` and `company.isActive` — not `activity.isActive` — so a booking for a withdrawn
excursion still confirms and debits the wallet. **Do not fix.**

### BUG-31 — Cruise stay validation is date-only/UTC while the stored check-in is an instant
**Severity:** MEDIUM · **Confidence:** Confirmed (probe) · **Module:** Nile Cruise

`validateCruiseStayDates` slices the raw string to `YYYY-MM-DD` and parses it as UTC midnight
(cruise-rates.ts:352-357), while `createCruiseBooking` stores `new Date(body.checkIn)` verbatim
(line 331). A client in UTC+3 sending `2026-09-07T00:00:00+03:00` passes the Monday-departure check
but stores `2026-09-06T21:00Z` — a **Sunday** in the database. Probe confirms both halves. ✅ Every
downstream reader (rate validity windows, reports, exports) sees the earlier day. **Do not fix.**

### BUG-32 — A FIXED group-type surcharge carries no currency
**Severity:** MEDIUM · **Confidence:** Confirmed (probe) · **Module:** Group Types

`ServiceGroupType.adjustmentValue` has no currency column, and `applyGroupAdjustment` adds it raw
(group-types.service.ts:87-89). Probe: the same `FIXED 50` becomes +50 on a 1500 EGP total (~$1) and
+50 on a 100 USD total (~2500 EGP). ✅ A VIP surcharge configured against one market is meaningless
against the other. (`PERCENTAGE` is currency-safe; `adjustmentValue` is correctly bounded `min(0)`,
so no negative-total path exists.) **Do not fix.**

### BUG-33 — Refund and status change happen in two separate transactions
**Severity:** MEDIUM · **Confidence:** Confirmed · **Module:** all cancel paths

Every cancel refunds in one transaction and then updates the invoice and booking in a second:
`transport.controller.ts:881-903`, `cruise.controller.ts:686-708`,
`activities.controller.ts:711-733`, `activity-packages.controller.ts:519-533`,
`reception.controller.ts:293-313`. If the second fails, money is back in the wallet while the
booking is still CONFIRMED and its invoice still UNPAID. A retry recovers (the refund is idempotent),
but until then the state is contradictory and a report run in the window over-states revenue.
**Do not fix.**

### BUG-34 — Two modules nest the wallet debit inside the invoice guard
**Severity:** MEDIUM · **Confidence:** Confirmed (latent — not currently reachable) · **Module:** Bookings, Activities

`confirmBooking` (bookings.controller.ts:266-296) and `confirmActivityBooking`
(activities.controller.ts:623-651) place `debitWallet` **inside** `if (!booking.invoice)`. Every other
module debits unconditionally and guards only the invoice creation. Today this is harmless because
these are the only two modules that do not create an invoice at booking time — so the invoice is
always absent at confirm. It is a trap: any future proforma-invoice-on-create change to either module
would silently stop the wallet from being debited, giving away the service. The same asymmetry is a
live product inconsistency in its own right — six modules give the agency a proforma invoice
immediately, these two produce nothing until an admin confirms. **Do not fix.**

### BUG-35 — Choosing a cruise programme silently discards a submitted transfer rate
**Severity:** MEDIUM · **Confidence:** Confirmed · **Module:** Nile Cruise

```ts
// src/modules/nile-cruise/cruise.controller.ts:466
if (!programmeRate && body.transferRateId) { … }
```
When a programme is chosen the posted `transferRateId` is ignored with no error and no price: the
response simply comes back with `transferRateId: null`. The correct rule (a programme already
includes its transfer) is enforced, but by silence rather than by a refusal, so a caller who believes
they bought a transfer is told the booking succeeded. Contrast the explicit `PICK_ONE_FARE` when a
cabin rate and a programme rate are both sent (line 372). **Do not fix.**

### BUG-36 — A company's currency can be changed while it holds a balance and a ledger
**Severity:** MEDIUM · **Confidence:** Confirmed · **Module:** Companies

`updateCompany` writes `currency` with no guard on `balance` or on existing `WalletTransaction` rows
(companies.controller.ts:338). A company with 10,000 USD switched to EGP now holds "10,000 EGP", and
every historical transaction is silently reinterpreted — they carry no currency of their own
(BUG-03). `topupCompany` refuses a currency mismatch on a single top-up while this rewrites the
denomination of the entire account. **Do not fix.**

---

### BUG-43 — The credit limit is shown as spendable and is never spendable
**Severity:** MEDIUM · **Confidence:** Confirmed · **Module:** Wallet / Companies

`buildWalletSummary` computes and returns, to the admin company screen:

```ts
// src/modules/companies/companies.controller.ts:286-292
const availableCredit = Decimal.max(new Decimal(0), company.creditLimit.sub(usedCredit));
return { ..., creditLimit: company.creditLimit, availableCredit,
  spendingPower: Decimal.max(new Decimal(0), company.balance).add(availableCredit), ... };
```
documented as *"spendingPower — balance + availableCredit: what they can actually book."*

`debitWallet` consults only the balance:
```ts
// src/shared/wallet.ts:42
if (company.balance.lt(input.amount)) throw new Error('INSUFFICIENT_BALANCE');
```
`grep -rn "creditLimit" src/` confirms it is read in exactly four places — the company list, the
wallet summary, `me`, and the notification email — and written in two. **No code path anywhere uses
it to authorise spending.** An agency granted a 50,000 credit limit with a zero balance can book
nothing, while the admin screen states it can book 50,000.

**Business impact:** the platform's credit-terms feature does not exist. Admins grant credit that
has no effect and agencies are refused bookings the portal told them they could make. It is also the
visible half of BUSINESS-QUESTION-2 — whether this is a prepaid or a credit-terms business is
unresolved in the code, and the two answers are each half-implemented.

**Evidence:** `src/modules/companies/companies.controller.ts:249-296`; `src/shared/wallet.ts:42`;
`src/modules/wallet/wallet.controller.ts:29`; `src/modules/auth/auth.controller.ts:125`

**Direction:** resolve BUSINESS-QUESTION-2 first — the answer decides whether `creditLimit` should
gate `debitWallet` or be removed from the interface. **Do not fix as part of this phase.**

---

## Low-severity findings

### BUG-37 — Three separate implementations of the wallet debit/refund
**Severity:** LOW · **Confidence:** Confirmed · **Module:** Wallet

`src/shared/wallet.ts` is documented as *"the single source of truth"* for logic that *"was
copy-pasted in ~8 places"*, and seven modules use it. Two do not: `approveVisa`
(visa.controller.ts:600-625) and `rejectBooking` (bookings.controller.ts:410-437) still carry inlined
copies. They already differ in behaviour — `rejectBooking` performs its idempotency check outside the
transaction (BUG-08) — which is exactly the drift the shared module was created to prevent.

### BUG-38 — Cruise add-on tours are added to the total without a currency check
**Severity:** LOW · **Confidence:** Confirmed · **Module:** Nile Cruise

```ts
// cruise.controller.ts:455-458
for (const addOn of addOns) {
  const amount = Number(addOn.amount ?? 0);
  if (Number.isFinite(amount) && amount > 0) sourceAmount = sourceAmount.add(new Decimal(amount));
}
```
The amount is taken from the request and added raw, then every add-on is stamped with
`currency: charge.currency` (line 561) regardless of what the caller intended. The code comment says
add-ons must be *"in the SAME currency"* — nothing checks it. SUPERADMIN-only, hence LOW.

### BUG-39 — Global search returns inactive and price-hidden hotels
**Severity:** LOW · **Confidence:** Confirmed · **Module:** Search

`prisma.hotel.findMany` in `globalSearch` (search.controller.ts:119-125) applies neither
`isActive: true` nor any `HotelCompanyVisibility` filter, while `listHotels` applies both. Names and
cities only — no prices — hence LOW.

### BUG-40 — Reference and invoice numbers are consumed by failed transactions
**Severity:** LOW · **Confidence:** Confirmed · **Module:** all booking modules

`generateRef` and `generateInvoiceNumber` increment their counters in their own transactions before
the booking transaction begins (e.g. `cruise.controller.ts:522-525`,
`transport.controller.ts:634`). A subsequent failure leaves permanent gaps in the `EBK-`/`INV-`
sequences. Harmless operationally; a nuisance for anyone auditing invoice continuity.

### BUG-41 — Offers reference catalogue items as unvalidated JSON
**Severity:** LOW · **Confidence:** Confirmed · **Module:** Offers

`Offer.hotelItems`/`transferItems`/`activityItems` are free-form JSON (schema.prisma:1828-1830) with
no foreign keys and no validation against `Hotel`/`Activity`/`TransportRate` in
`offers.controller.ts`. A published package keeps advertising a deactivated hotel indefinitely, and
nothing reports the broken reference.

### BUG-42 — `readTransferAddOn` silently turns a one-way transfer into a return to the pickup point
**Severity:** LOW · **Confidence:** Confirmed (probe) · **Module:** Transfers

```ts
// src/shared/transfer-addon.ts:110
transferToName: toName ?? fromName,
```
Probe: `readTransferAddOn({transferRequested:true, transferFromName:'Cairo Airport'})` yields
`transferToName: 'Cairo Airport'`. ✅ Deliberate (*"Most transfers bring the guests back where they
were collected"*), but it means an incomplete form produces a confident-looking round trip rather
than a validation error, and the driver's voucher reads "Cairo Airport → Cairo Airport".

---

## 7. Missing Business Rules

Rules whose absence is not a broken code path but a gap in the domain model.

### MISSING-RULE-1 — Nothing ever marks a service as delivered
**Module:** all booking modules · **Business confirmation required:** yes
`BookingStatus.COMPLETED` exists, is filterable (`bookings.controller.ts:48`), and counts as revenue
(`reports.controller.ts:18, 25`). **No code path sets it** — verified: the only occurrence of
`status: 'COMPLETED'` in `src/` is in `demo/demo.fixtures.ts:87`. Every delivered service stays
`CONFIRMED` for ever, so a transfer that ran last March is indistinguishable from one scheduled for
next year, and there is no operational close-out step. **Risk:** no delivery accountability; no
trigger for post-service processes; the cancellation gap below is a direct consequence.

### MISSING-RULE-2 — Invoices are never aged
**Module:** Invoicing · **Business confirmation required:** no
Every module sets `dueDate: new Date(Date.now() + 7*24*60*60*1000)`. `InvoiceStatus.OVERDUE` exists.
Nothing compares the two — there is no scheduled job, no cron, no on-read derivation. An invoice 90
days past due still reads `UNPAID`. **Risk:** no receivables ageing; the credit-control fields exist
but produce nothing.

### MISSING-RULE-3 — There is no cancellation policy
**Module:** all booking modules · **Business confirmation required:** yes
Every cancel path checks only `['PENDING','CONFIRMED'].includes(status)`. No service-date comparison,
no cancellation window, no fee, no non-refundable rate concept. **An agent can cancel a transfer that
ran yesterday and receive a 100% refund** — `refundWallet` returns the full `totalAmount`
unconditionally. In a travel business this is the single most consequential missing rule after
availability. **Risk:** unbounded revenue leakage; no way to model non-refundable supplier costs.

### MISSING-RULE-4 — Availability is not modelled
**Module:** all · **Business confirmation required:** yes
See BUG-13. No consumption, no release, no overbooking guard. **Risk:** overselling every product.

### MISSING-RULE-5 — Activity pax limits are enforced nowhere
**Module:** Activities · **Business confirmation required:** no
`Activity.minPax`/`maxPax` are stored, editable in the admin form
(`ACTIVITY_NUMBER_FIELDS`, activities.controller.ts:201) and returned to clients — and read by no
booking path in either the backend or `dashboard.html` (`grep maxPax public/dashboard.html` → no
matches). **Risk:** bookings that exceed what the operator can run; the field misleads admins into
thinking a limit is in force.

### MISSING-RULE-6 — Accepted quotes have no conversion
**Module:** Quote Requests · **Business confirmation required:** yes
See BUG-14. **Risk:** the platform's largest revenue stream is untracked.

### MISSING-RULE-7 — No cross-booking double-booking check
**Module:** Activities / Packages · **Business confirmation required:** yes
`findTimeConflict` compares only the lines inside one submitted package
(activity-packages.controller.ts:88-104). The same client on the same day across two packages, or
across a package and a standalone booking, is never checked — and there is no client entity to check
against (`clientName` is free text on each booking). **Risk:** guests booked onto two trips at once.

### MISSING-RULE-8 — `canRequestQuote` is enforced only in the UI
**Module:** Hotels / Quotes · **Business confirmation required:** no
`Hotel.allowQuoteRequest` and `HotelCompanyVisibility.canRequestQuote` are computed and returned by
`listHotels`/`getHotel` (hotels.controller.ts:154, 243), but `createQuoteRequest` accepts any
`hotelId` without consulting either. **Risk:** agencies can request quotes for hotels deliberately
closed to them; the visibility model is advisory.

### MISSING-RULE-9 — No cancel transition for a security approval
**Module:** Security Approval · **Business confirmation required:** yes
See BUG-05. `VisaStatus.CANCELLED` and `UNDER_REVIEW` are both unreachable. **Risk:** approved
approvals cannot be unwound through the product at all.

### MISSING-RULE-10 — Wallet and invoice are two unreconciled money models
**Module:** Wallet / Invoicing · **Business confirmation required:** yes
Confirmation debits the prepaid wallet. `markPaid` separately flips an invoice to `PAID` and moves
no money — no `WalletTransaction`, no `PlatformWalletTransaction`. Nothing reconciles the two, and
`TransactionType.ADJUSTMENT` exists but is written by no code path. **Risk:** it is not determinable
from the data whether a given service was paid for once, twice, or not at all. See
BUSINESS-QUESTION-2.

### MISSING-RULE-11 — Deactivating a catalogue item does not notify or block
**Module:** Hotels / Activities / Cruise / Transport · **Business confirmation required:** no
See BUG-30. **Risk:** live bookings quietly reference withdrawn products.

---

## 8. Business Questions

Genuine ambiguities where the intended rule cannot be determined from the code. **Not invented
requirements — each is a fork the implementation does not resolve.**

### BUSINESS-QUESTION-1 — Is availability held in this system or in the suppliers'?
**Current behaviour:** capacity fields exist on four models; none is enforced (BUG-13).
**Possible answers:** (a) the portal is a *request* system and operations checks supplier availability
off-system — then the capacity fields should stop looking like limits; (b) the portal owns allotment
— then it needs a consumption model, release-on-cancel, and an overbooking guard.
**Why it matters:** it decides whether BUG-13 is a defect or a documentation problem, and it gates
MISSING-RULE-4 and -5. **Modules affected:** Cruise, Activities, Hotels, Transport, Packages.

### BUSINESS-QUESTION-2 — Is the wallet or the invoice the source of truth for payment?
**Current behaviour:** the wallet is debited at confirmation; `markPaid` independently flips an
invoice with no money movement; consolidated statements bill invoices that the wallet already
collected (and cancelled ones — BUG-07).
**Possible answers:** (a) prepaid only — then `markPaid` and statements are reporting artefacts and
should be derived from the wallet; (b) credit terms — then the wallet should not be debited at
confirmation and `creditLimit` should be spendable (BUG-43).
**Why it matters:** agencies are currently charged once against the wallet and invoiced again on a
statement, with nothing reconciling them. **Modules affected:** Wallet, Invoicing, Companies, Reports.

### BUSINESS-QUESTION-3 — What should an accepted quote become?
**Current behaviour:** nothing (BUG-14).
**Possible answers:** (a) auto-create the matching booking type at `quotedAmount`; (b) create an
invoice only; (c) remain manual, but link the re-keyed booking back to the quote.
**Why it matters:** it determines whether the quote-only book ever reaches the wallet, invoicing and
reporting. **Modules affected:** Quotes, Bookings, Cruise, Invoicing, Wallet, Reports.

### BUSINESS-QUESTION-4 — When is a voucher issued, and what happens to it on cancellation?
**Current behaviour:** five modules issue at `PENDING`, SIM issues at `CONFIRMED`, none revokes
(BUG-15).
**Possible answers:** (a) issue at confirmation and delete on cancel; (b) issue at request but mark
void; (c) keep as-is and rely on the driver checking the portal.
**Why it matters:** a cancelled service currently keeps a valid, regenerable customer document.
**Modules affected:** Vouchers, Transport, Activities, Packages, Visa, Airport Assist.

### BUSINESS-QUESTION-5 — Should `INTERNATIONAL` and `FOREIGN` be one market everywhere?
**Current behaviour:** cruise pricing treats them as equivalent (`marketEquivalent`,
cruise-rates.ts:113-117); `MarketPrice.scoreRow` requires exact equality (pricing.ts:102); cruise
*transfer* rates use exact equality too (BUG-27). Three rules for one question.
**Possible answers:** (a) they are the same audience — apply `marketEquivalent` in `scoreRow`;
(b) they are distinct — remove it from the cruise path and migrate the legacy rows.
**Why it matters:** the same company can currently be quoted from a row for one product and refused
the equivalent row for another. **Modules affected:** Pricing, Cruise, all catalogue modules.

### BUSINESS-QUESTION-6 — What should a company's `market` or `currency` change do to existing data?
**Current behaviour:** both are freely editable (companies.controller.ts:320-345). Changing `market`
silently re-tiers every future quote; changing `currency` reinterprets the existing balance and the
whole ledger (BUG-36). Existing bookings keep their own snapshots and are unaffected.
**Possible answers:** (a) refuse a currency change while `balance != 0` or any transaction exists;
(b) convert the balance at a recorded rate; (c) allow it, but require `WalletTransaction.currency`
to exist first.
**Why it matters:** this is the routine admin action most likely to corrupt financial history.
**Modules affected:** Companies, Wallet, Pricing.

---

## 9. Cross-Module Testing

| Module A | Module B | Relationship | Scenarios tested | Result | Problems |
|---|---|---|---|---|---|
| **Cruise catalogue** | **Cruise booking** | 5 FKs: cabinRate, programme, programmeRate, transferRate, schedule | 8 | ❌ **FAIL** | **BUG-01, BUG-02** — all five nulled by routine admin saves |
| **Cruise** | **Transfer (CruiseTransferRate)** | schedule- and market-bound priced route | 15 | ❌ **FAIL** | BUG-01, BUG-11, BUG-25, BUG-27, BUG-35 |
| Cruise programme | Transfer inclusion | programme includes its transfer; cruise-only may buy one | 4 | ⚠️ PARTIAL | Rule correct; a posted rate id is silently dropped (BUG-35) |
| Cruise booking | Transport ops queue | `transferRequested` surfaces the job | 3 | ⚠️ PARTIAL | Cancelled parents remain (BUG-22) |
| Cruise schedule | Cabin rates / programmes / transfers | Cascade parent | 4 | ❌ **FAIL** | **BUG-02** — whole fare table destroyed |
| Cruise | Company market | EGYPTIAN vs FOREIGN tariff | 5 | ⚠️ PARTIAL | Divergent equivalence rules (BUG-27, Q5) |
| **Transport rate** | **Transport booking** | `rateId` is the priced product | 6 | ❌ **FAIL** | **BUG-10** — capacity and route unvalidated |
| Transport booking | Invoice | proforma at creation | 3 | ✅ PASS | — |
| Transport booking | Voucher | customer document | 4 | ❌ FAIL | BUG-15 — issued at PENDING, never revoked |
| Transport booking | Wallet | debit on confirm, refund on cancel | 5 | ⚠️ PARTIAL | Correct logic; currency-blind (BUG-03), racy (BUG-08) |
| Activity | Activity booking | catalogue → sale | 7 | ⚠️ PARTIAL | Party pricing ignores overrides (BUG-23); pax limits ignored (BUG-13) |
| Activity | Transfer add-on | `transferIncluded` / `transferPrice` | 6 | ⚠️ PARTIAL | Currency unchecked (BUG-20) |
| Activity booking | Transport ops queue | add-on surfaces as work | 3 | ⚠️ PARTIAL | Cancelled parents remain (BUG-22) |
| **Activity package** | **Reports** | package revenue | 2 | ❌ **FAIL** | **BUG-17** — module absent |
| **Activity package** | **Consolidated statement** | statement line | 2 | ❌ **FAIL** | BUG-17 — unlabelled line |
| Activity package | Package items | one package, one invoice, one voucher | 5 | ✅ PASS | Idempotent, `@unique` enforced |
| Package items | Time conflicts | intra-package overlap | 3 | ⚠️ PARTIAL | Only within one payload (MISSING-RULE-7) |
| **Quote request** | **Booking / Cruise / Invoice / Wallet** | accepted quote → sale | 4 | ❌ **FAIL** | **BUG-14** — no conversion exists |
| Quote request | Transport ops queue | quoted transfer reaches operations | 3 | ✅ PASS | The one quote relationship that works |
| Quote request | Cruise schedule | dates validated against the leg | 3 | ✅ PASS | `validateCruiseStayDates` applied |
| **Hotel** | **Company visibility** | per-agency price rules | 6 | ❌ **FAIL** | **BUG-04, BUG-12** — two endpoints bypass it |
| Hotel | Booking | room inventory | 3 | ❌ FAIL | BUG-13 — `Room` never consulted |
| Hotel | Quote request | `canRequestQuote` | 2 | ❌ FAIL | MISSING-RULE-8 — UI-only |
| **Visa** | **Wallet** | debit on approve, refund on unwind | 5 | ❌ **FAIL** | **BUG-05, BUG-06** — no refund, no reconciliation |
| Visa | Invoice | reprice keeps them in step | 3 | ⚠️ PARTIAL | Invoice follows, wallet does not (BUG-06) |
| Visa | VisaFee | most-specific fee wins | 4 | ✅ PASS | — |
| Visa | Private files | document ownership | 3 | ✅ PASS | `companyOwnsFile` correct |
| **Invoice** | **Booking status** | cancelled booking → cancelled invoice | 4 | ⚠️ PARTIAL | Cancel works; `markPaid` can undo it (BUG-09) |
| **Invoice** | **Consolidated statement** | eligibility and totals | 5 | ❌ **FAIL** | **BUG-07** — cancelled invoices billed |
| Invoice | Wallet | one charge per service | 3 | ❓ CLAR | Two unreconciled models (Q2) |
| **Wallet** | **Company currency** | denomination | 4 | ❌ **FAIL** | **BUG-03** — never compared |
| Wallet | Credit limit | spendable headroom | 2 | ❌ FAIL | BUG-43 — displayed, never usable |
| Wallet | Platform wallet | top-up funding | 3 | ✅ PASS | Correctly currency-guarded |
| **User** | **Company** | tenancy via JWT | 5 | ❌ **FAIL** | **BUG-16** — stale claims for up to 1h |
| User | Booking history | delete vs deactivate | 3 | ❌ FAIL | BUG-19 — 3 relations missed → 500 |
| Group type | Activity / Transport pricing | tier adjustment | 5 | ⚠️ PARTIAL | Correct selection; currency-blind FIXED (BUG-32) |
| MarketPrice | all catalogue modules | override resolution | 8 | ⚠️ PARTIAL | 3 markets unresolvable (BUG-21); ties arbitrary (BUG-29); party rates excluded (BUG-23) |
| Voucher | all 6 service modules | customer document lifecycle | 6 | ❌ FAIL | BUG-15 |
| Reports | all 8 booking modules | revenue and counts | 6 | ❌ FAIL | BUG-17 (package missing), BUG-18 (currency) |
| Offer | Hotel / Activity / Transport | advertised items | 2 | ⚠️ PARTIAL | Unvalidated JSON refs (BUG-41) |
| Sheets sync | catalogue modules | import | 2 | ⏸️ BLOCKED | Needs Google credentials |

**42 relationships tested · 11 PASS · 15 PARTIAL · 15 FAIL · 1 BLOCKED**

---

## 10. Business Invariants

| ID | Invariant | Modules | How it was tested | Result |
|---|---|---|---|---|
| INV-01 | A booking always references the priced row it was sold from | Cruise | Traced the catalogue save → FK path | ❌ **BROKEN** (BUG-01/02) |
| INV-02 | Money debited is in the same currency as the balance | Wallet | Read every debit path; no currency exists on the ledger | ❌ **BROKEN** (BUG-03) |
| INV-03 | An agency sees only prices it is entitled to | Hotels, Cruise | Compared guarded vs unguarded endpoints | ❌ **BROKEN** (BUG-04/11/12) |
| INV-04 | A charged service that is unwound returns the money | Visa | Traced delete/reprice paths | ❌ **BROKEN** (BUG-05/06) |
| INV-05 | A cancelled invoice is never billed or paid | Invoicing | Read statement eligibility and `markPaid` | ❌ **BROKEN** (BUG-07/09) |
| INV-06 | Concurrent debits both take effect | Wallet | Read the update pattern at all 7 sites | ❌ **BROKEN** (BUG-08) |
| INV-07 | A booking never exceeds the resource's capacity | all | Searched for any capacity comparison | ❌ **BROKEN** (BUG-10/13) |
| INV-08 | A valid customer document implies a live service | Vouchers | Traced download vs cancel | ❌ **BROKEN** (BUG-15) |
| INV-09 | Revoked access takes effect immediately | Auth | Read `authenticate` + `updateUser` | ❌ **BROKEN** (BUG-16) |
| INV-10 | Every confirmed sale appears in the reports | Reports | Compared the model list against the schema | ❌ **BROKEN** (BUG-17) |
| INV-11 | Amounts in different currencies are never summed | Reports | Probe on the aggregation expression | ❌ **BROKEN** (BUG-18) |
| INV-12 | A user with history is never hard-deleted | Users | Compared the count list against the relations | ❌ **BROKEN** (BUG-19) |
| INV-13 | Every component of a total shares one currency | Activities | Read every addend on the total | ❌ **BROKEN** (BUG-20) |
| INV-14 | A price is deterministic for a given context | Pricing, Cruise | Probes on `scoreRow` and supplements | ❌ **BROKEN** (BUG-24/29) |
| INV-15 | The client cannot influence the server-side price | Cruise | Traced `transferPaxCount` | ❌ **BROKEN** (BUG-25) |
| INV-16 | Wallet debit is idempotent per reference | Wallet | Existing suite + read | ✅ **HOLDS** (single-threaded) |
| INV-17 | Wallet refund requires a prior debit and happens once | Wallet | Existing suite + read | ✅ **HOLDS** (single-threaded) |
| INV-18 | One booking has at most one invoice | Invoicing | `@unique` on all 9 relations | ✅ **HOLDS** (DB-enforced) |
| INV-19 | One booking has at most one voucher | Vouchers | `@unique` + idempotent create | ✅ **HOLDS** (DB-enforced) |
| INV-20 | Reference numbers are globally unique | all | One shared counter, atomic increment | ✅ **HOLDS** |
| INV-21 | A sale price is never FX-converted | all | `convertMoney` is called by no sale path | ✅ **HOLDS** |
| INV-22 | A blank price means "not sold", never free | Activities, Cruise, Hotels | Existing suite + read | ✅ **HOLDS** |
| INV-23 | A booking cannot be confirmed twice | all | `status !== 'PENDING'` guard in all 8 | ✅ **HOLDS** |
| INV-24 | A booking cannot be created for an inactive company | all | `company.isActive` checked in all 8 | ✅ **HOLDS** |
| INV-25 | An agent reads only their own company's records | all | Every list/detail scoped on `companyId` | ✅ **HOLDS** (given a fresh token — see BUG-16) |
| INV-26 | A cruise booking's dates match a real sailing leg | Cruise | `validateCruiseStayDates` | ✅ **HOLDS** (modulo BUG-31) |
| INV-27 | A package's lines all share one currency | Packages | Explicit guard | ✅ **HOLDS** (except the transfer — BUG-20) |
| INV-28 | An unknown payload key cannot reach the database | Cruise, Visa | Field allow-lists / Zod | ✅ **HOLDS** |
| INV-29 | Private documents are reachable only by their owner | Files | `companyOwnsFile` | ✅ **HOLDS** |
| INV-30 | Capacity cannot go negative | all | No capacity is tracked at all | ⚠️ **VACUOUS** (BUG-13) |

**15 broken · 14 hold · 1 vacuous.**

---

## 11. State Transition Testing

| Entity | From | Action | To | Expected | Actual | Result |
|---|---|---|---|---|---|---|
| Booking (all 8 types) | PENDING | confirm | CONFIRMED | Debit + invoice + audit | As expected | PASS |
| Booking | CONFIRMED | confirm again | — | Refused | `INVALID_STATUS` | PASS |
| Booking | CANCELLED | confirm | — | Refused | `INVALID_STATUS` | PASS |
| Booking | PENDING | cancel | CANCELLED | No refund (nothing debited) | `refundWallet` no-ops correctly | PASS |
| Booking | CONFIRMED | cancel | CANCELLED | Refund + invoice cancelled | Both, in two transactions | PART (BUG-33) |
| Booking | CONFIRMED | cancel **after the service date** | CANCELLED | Fee or refusal | Full refund | FAIL (MISSING-RULE-3) |
| Booking | CANCELLED | cancel again | — | Refused | `INVALID_STATUS` | PASS |
| Booking | CONFIRMED | *service delivered* | COMPLETED | Reachable | **No code sets it** | FAIL (MISSING-RULE-1) |
| Booking | any | → REJECTED | REJECTED | Consistent across modules | Only Package and SIM offer it | PART |
| Transport | PENDING | confirm with an insufficient balance | PENDING | Refused | `INSUFFICIENT_BALANCE` | PASS |
| Cruise | PENDING | confirm | CONFIRMED | Debit + invoice | As expected | PASS |
| Visa | PENDING | submit | SUBMITTED | Stamped | As expected | PASS |
| Visa | SUBMITTED | submit again | — | Refused | `INVALID_STATUS` | PASS |
| Visa | PENDING/SUBMITTED | approve | APPROVED | Debit + invoice | As expected | PASS |
| Visa | APPROVED | approve again | — | Refused | `INVALID_STATUS` | PASS |
| Visa | APPROVED | reject | — | Refused | `INVALID_STATUS` | PASS |
| Visa | APPROVED | cancel | CANCELLED | Refund | **No cancel route exists** | FAIL (BUG-05) |
| Visa | APPROVED | delete | (gone) | Refund first, or refuse | Deleted, money kept | **FAIL (BUG-05)** |
| Visa | APPROVED | reprice | APPROVED | Wallet adjusted | Wallet untouched | **FAIL (BUG-06)** |
| Visa | any | → UNDER_REVIEW | UNDER_REVIEW | Reachable | **Unreachable** | FAIL |
| Quote | NEW | → QUOTED | QUOTED | `respondedAt` stamped | Stamped | PASS |
| Quote | QUOTED | → ACCEPTED | ACCEPTED | Becomes a booking | **Nothing happens** | **FAIL (BUG-14)** |
| Quote | CLOSED | → NEW | — | Refused | **Accepted** | **FAIL (BUG-25)** |
| Quote | CANCELLED | → ACCEPTED | — | Refused | **Accepted** | **FAIL (BUG-25)** |
| Quote | CANCELLED | cancel again | — | Refused | `INVALID_STATUS` | PASS |
| Invoice | UNPAID | markPaid | PAID | `paidAt` stamped | Stamped | PASS |
| Invoice | CANCELLED | markPaid | — | Refused | **Accepted + email** | **FAIL (BUG-09)** |
| Invoice | PAID | markPaid again | PAID | Idempotent | `paidAt` overwritten | FAIL (BUG-09) |
| Invoice | UNPAID | *past dueDate* | OVERDUE | Aged | **Never aged** | FAIL (MISSING-RULE-2) |
| Invoice | UNPAID | parent cancelled | CANCELLED | Cancelled | Cancelled | PASS |
| Statement | UNPAID | underlying invoice paid | PAID | Reflects reality | **Never updated** | FAIL (BUG-07) |
| User | active | deactivate | inactive | Access ends | Valid up to 1h | **FAIL (BUG-16)** |
| User | active | move company | new scope | Immediate | Stale up to 1h | **FAIL (BUG-16)** |
| Company | active | deactivate | inactive | Staff locked out | New bookings blocked; reads continue | PART (BUG-16) |
| Voucher | issued | parent cancelled | void | Invalidated | **Stays valid and regenerable** | **FAIL (BUG-15)** |

**36 transitions tested · 17 PASS · 4 PARTIAL · 15 FAIL.**

---

## 12. Role & Permission Testing

| Role | Module | Feature | Expected access | Actual access | Result |
|---|---|---|---|---|---|
| AGENT | Bookings | Create hotel/flight booking | Denied → quote | `USE_QUOTE_REQUEST` | PASS |
| AGENT | Cruise | Create cruise booking | Denied → quote | `USE_QUOTE_REQUEST` | PASS |
| AGENT | Cruise | Confirm a booking | Denied | `requireRole('SUPERADMIN')` | PASS |
| AGENT | Cruise | Read the catalogue | Own market, if published | **Both markets, incl. inactive** | **FAIL (BUG-11)** |
| AGENT | Cruise | Write the catalogue | Denied | Denied | PASS |
| AGENT | Transport | Create booking | Allowed, own company | Allowed, own company | PASS |
| AGENT | Transport | Confirm | Denied | Denied | PASS |
| AGENT | Transport | Cancel another company's booking | Denied | Ownership checked | PASS |
| AGENT | Transport | Transfer add-ons queue | Denied | `requireRole('SUPERADMIN')` | PASS |
| AGENT | Hotels | See a hidden price | Denied | Hidden in list/detail | PASS |
| AGENT | Hotels | `GET /:id/pricing` | Denied | **Full season table** | **FAIL (BUG-12)** |
| AGENT | Hotels | Rate matrix | Denied | `requireRole('SUPERADMIN')` | PASS |
| COMPANY_ADMIN | Hotels | `export-excel` | Own view only | **Every hotel's rate book** | **FAIL (BUG-04)** |
| AGENT | Invoices | List | Own company | Own company | PASS |
| AGENT | Invoices | Download another company's | Denied | Ownership checked | PASS |
| AGENT | Invoices | markPaid | Denied | `requireRole('SUPERADMIN')` | PASS |
| AGENT | Statements | Download another company's | Denied | `findForCaller` | PASS |
| AGENT | Wallet | Read own balance | Allowed | Allowed | PASS |
| AGENT | Wallet | Read all transactions | Denied | `/admin/wallet/*` is SUPERADMIN | PASS |
| AGENT | Reports | Platform overview | Denied | `requireRole('SUPERADMIN')` | PASS |
| AGENT | Reports | Another company's report | Denied | `caller.companyId !== id` → 403 | PASS |
| AGENT | Vouchers | Download another company's | Denied | Ownership checked | PASS |
| AGENT | Vouchers | Regenerate | Denied | SUPERADMIN check in handler | PASS |
| AGENT | Files | Another company's passport scan | Denied | `companyOwnsFile` | PASS |
| AGENT | Search | Cross-company results | Denied | Scoped to `companyId` | PASS |
| AGENT | Search | Inactive / hidden hotels | Denied | Returned (names only) | FAIL (BUG-39) |
| AGENT | Users | Any user management | Denied | `requireRole(SUPERADMIN, COMPANY_ADMIN)` | PASS |
| COMPANY_ADMIN | Users | Create an AGENT in own company | Allowed | Allowed, `companyId` forced | PASS |
| COMPANY_ADMIN | Users | Create a COMPANY_ADMIN | Denied | Forced to AGENT | PASS |
| COMPANY_ADMIN | Users | Edit a user in another company | Denied | `canManageTarget` | PASS |
| COMPANY_ADMIN | Users | Change a role | Denied | Explicit 403 | PASS |
| COMPANY_ADMIN | Companies | Any company admin route | Denied | `/admin/companies` is SUPERADMIN | PASS |
| Deactivated user | any | Any request | Denied | **Allowed up to 1h** | **FAIL (BUG-16)** |
| Moved user | any | Old company's data | Denied | **Allowed up to 1h** | **FAIL (BUG-16)** |
| SUPERADMIN | Sheets sync | Import | Allowed | Self-guarded router | PASS |
| SUPERADMIN | Price rows | Edit the matrix | Allowed | SUPERADMIN | PASS |
| SUPERADMIN | Cruise | Preview a MIDDLE_EAST price | Correct tier | **Falls back to base** | FAIL (BUG-21) |

**37 checks · 31 PASS · 6 FAIL.** The role *plumbing* is sound — every failure is a business-rule
gap (an unguarded sibling endpoint or a stale token), not a broken `requireRole`.

---

## 13. Ownership & Assignment Testing

* **Who owns a record.** `companyId` + `createdById` on every transactional model, `onDelete: Restrict`
  on the creator. Ownership is checked on every cancel and detail read
  (`caller.role !== 'SUPERADMIN' && x.companyId !== caller.companyId → 403`) — verified across all
  eight modules. ✅
* **Who may act.** There is **no per-record assignment model** except `QuoteRequest.assignedToId`,
  which is set by `updateQuoteRequest` and read by the list filter only — it grants nothing and
  restricts nothing. An assigned admin has no more rights than any other, and reassignment has no
  effect on access.
* **No Transfer Manager exists.** The brief asked about a "Transfer Manager inside a Cruise
  workflow". There is no such role, no `Driver`, no `Vehicle`, no `Supplier` entity. Transport
  operations is a read-only aggregate view restricted to SUPERADMIN. Consequently the questions
  "does the previous assignee retain access?" and "does the new assignee gain it?" have no
  implementation to test against — **assignment is not modelled**. This is a design gap to confirm
  with the business rather than a defect.
* **Ownership changes.** A user moved between companies keeps their old scope for up to a token
  lifetime (BUG-16). Their historical bookings correctly stay with the original company
  (`companyId` is on the booking, not derived from the user). ✅
* **Agent vs company-admin scoping.** Both see *all* of their company's bookings; an AGENT is not
  restricted to records they created. Consistent across all modules — appears intentional for a small
  agency, worth confirming for larger ones.

---

## 14. Date & Time Testing

| Aspect | Finding |
|---|---|
| Past dates | Accepted everywhere, in every module (MISSING-RULE-3, BUG-26) |
| Invalid dates | `pickupDateTime` unchecked → 500 (BUG-26); cruise `checkIn` correctly checked |
| Invalid date → pricing | **Defeats every `validFrom`/`validTo` window** — probe-confirmed (BUG-26) |
| Timezone handling | No timezone model. `validateCruiseStayDates` parses UTC date-only; storage keeps the offset instant → day drift (BUG-31, probe-confirmed) |
| Day boundaries | `nightsBetween` handles weekday wrap correctly (Fri→Mon = 3, Mon→Mon = 7) ✅ |
| Ordering checks | Drop-off ≥ pickup ✅; return > outbound ✅; checkOut > checkIn ✅; `validTo ≥ validFrom` on rate rows ✅ |
| Clock times | `normalizeClockTime` accepts 12h and 24h, zero-pads, rejects malformed ✅ (existing suite) |
| Schedule matching | Departure weekday, night count and return weekday all enforced ✅ |
| Cancellation windows | None (MISSING-RULE-3) |
| Operating hours / holidays / blackout dates | Not modelled |
| Rate validity periods | Correctly applied — with a valid date (probe) |
| Statement period `to` | Correctly extended to 23:59:59.999 ✅ |

---

## 15. Capacity & Availability Testing

Every scenario in this category is **vacuous** because no capacity is tracked (BUG-13). Recording
what was checked:

| Scenario | Result |
|---|---|
| Capacity 0 / 1 / exactly max / max + 1 | No effect — no capacity is consulted |
| Capacity reduced after bookings exist | No effect, no warning |
| Cancelled booking releases capacity | Nothing to release |
| Two agents book the last unit simultaneously | Both succeed |
| Vehicle capacity vs passenger count | Enforced during rate *search*; bypassed via `rateId` (BUG-10) |
| Cruise cabins vs bookings | Never compared |
| Activity `maxPax` vs pax | Never compared (MISSING-RULE-5) |
| Hotel rooms vs `roomsCount` | Never compared; `Room` is not even loaded |
| Modules disagreeing on availability | They cannot — none of them has an opinion |

---

## 16. Financial Logic Testing

| Aspect | Result | Notes |
|---|---|---|
| Base price resolution | ✅ PASS | company → market → all → base, correctly scored |
| Explicit price, no FX | ✅ PASS | `explicitMoney` everywhere; `convertMoney` called by no sale path |
| Quantity × unit price (SIM) | ✅ PASS | Integer-bounded, `unitAmount` snapshotted |
| Per-person vs party pricing | ✅ PASS | Composition arithmetic correct (probe) |
| Party pricing + overrides | ❌ FAIL | Overrides ignored (BUG-23) |
| Round-trip pricing | ✅ PASS | Explicit RT price, or two legs, or ×2 — all flagged in `pricingRule` |
| Disposal not doubled | ✅ PASS | Round-trip flag dropped for time-block products |
| Group-type adjustment | ⚠️ PARTIAL | Correct maths; FIXED is currency-blind (BUG-32) |
| Supplements | ❌ FAIL | Order-dependent; wrong percentage base (BUG-24) |
| Transfer add-on currency | ❌ FAIL | Unchecked (BUG-20) |
| Cruise add-on currency | ❌ FAIL | Unchecked (BUG-38) |
| Mixed currency in a package | ✅ PASS | Explicitly refused |
| Mixed currency in a statement | ✅ PASS | Explicitly refused |
| Tax | ✅ PASS | Deliberately 0; documented |
| Rounding | ✅ PASS | `toDecimalPlaces(2)` at every boundary; `Decimal` throughout, no floats |
| Negative / zero amounts | ✅ PASS | `decOrNull` rejects negatives; `debitWallet` no-ops on ≤ 0; group adjustments bounded ≥ 0 |
| Discount | ⚠️ PARTIAL | Unbounded but SUPERADMIN-only; guarded by `sourceTotal.lte(0)` |
| Commission | ✅ N/A | Deliberately zero — rate rows carry the selling price |
| Wallet debit currency | ❌ **FAIL** | BUG-03 |
| Refund amount | ⚠️ PARTIAL | Always 100%, no policy (MISSING-RULE-3); over-refunds after a reprice (BUG-06) |
| Partial refund | ❌ Not supported | No mechanism |
| Credit limit | ❌ FAIL | Displayed, never usable (BUG-43) |
| Front-end vs back-end amount | ✅ PASS | The server never accepts a client `totalAmount` on any in-app flow; `pricing-parity` tests exist and pass |
| Booking vs invoice amount | ✅ PASS | Invoice built from `booking.totalAmount` |
| Invoice vs wallet amount | ❌ FAIL | Diverges after a visa reprice (BUG-06) |
| Report vs booking amount | ⚠️ PARTIAL | Reads `totalAmount` correctly; aggregates wrongly (BUG-18) |

---

## 17. Data Consistency Testing

| Impossible state | Reachable? | How |
|---|---|---|
| Booking references a deleted priced row | **Yes** | BUG-01/02 — five FKs nulled by a routine save |
| Wallet DEBIT references a non-existent booking | **Yes** | BUG-05 — visa deleted, debit kept |
| Booking total ≠ invoice total ≠ debited amount | **Yes** | BUG-06 |
| Invoice PAID + booking CANCELLED + wallet REFUNDED | **Yes** | BUG-09 |
| Statement bills an already-refunded service | **Yes** | BUG-07 |
| `Company.balance` ≠ ledger sum | **Yes** | BUG-08 (race), BUG-06 (reprice) |
| Balance denominated in two currencies at once | **Yes** | BUG-03 |
| Valid voucher for a cancelled service | **Yes** | BUG-15 |
| Booking whose creator's company no longer matches | **Yes** | BUG-16 |
| More bookings than the resource holds | **Yes** | BUG-13 |
| Booking priced from a rate for a different route | **Yes** | BUG-10 |
| Confirmed booking against a withdrawn catalogue item | **Yes** | BUG-30 |
| Offer advertising a deactivated hotel | **Yes** | BUG-41 |
| Two invoices for one booking | No | `@unique` on all 9 relations ✅ |
| Two vouchers for one booking | No | `@unique` + idempotent create ✅ |
| Duplicate reference number | No | Single atomic counter ✅ |
| Orphaned package item | No | `onDelete: Cascade` ✅ |
| Booking with no company | No | Required FK + `Restrict` ✅ |
| Cruise fare belonging to another boat's schedule | No | Validated on save ✅ |
| Programme rate for the wrong cruise | No | Validated in `createCruiseBooking` ✅ |

---

## 18. Concurrency Risks

| # | Scenario | Risk | Confidence |
|---|---|---|---|
| C-1 | Two confirms for one company at once | **Lost debit** — absolute `balance = x` under READ COMMITTED (BUG-08) | Highly Likely |
| C-2 | Two rejects of one booking | **Double refund** — idempotency check outside the transaction (bookings.controller.ts:410) | Highly Likely |
| C-3 | Confirm + cancel racing | Refund and status live in separate transactions (BUG-33) | Highly Likely |
| C-4 | Two agents book the last unit | Both succeed — no capacity exists (BUG-13) | Confirmed |
| C-5 | Catalogue save during a booking | The booking's FK targets are deleted mid-flight (BUG-01/02) | Highly Likely |
| C-6 | Two top-ups at once | Same lost-update pattern on `PlatformWallet` and `Company` | Highly Likely |
| C-7 | Concurrent reference generation | **Safe** — atomic `{ increment: 1 }` upsert | Confirmed safe |
| C-8 | Double-clicking Confirm | Debit is idempotent on `reference`, so a same-booking double-click is safe; the *cross-booking* race (C-1) is not | Confirmed safe / see C-1 |

None was reproduced deterministically — that needs a live database and two clients. All are
`Highly Likely` on code reading, and C-1/C-2/C-6 share one root cause (read-modify-write with no lock
and no raised isolation level).

---

## 19. Frontend / Backend Consistency

| # | Finding | Direction |
|---|---|---|
| F-1 | The cruise admin form re-publishes schedules and rates on **every** save, including description-only edits, destroying the fare table | **Frontend causes a backend cascade** (BUG-02) — `admin.html:2159-2181` |
| F-2 | Neither the shared catalogue save nor the cruise save warns that live bookings will be detached; deletes elsewhere use `confirmAction` | **Frontend under-warns** (BUG-01/02) — `admin.html:4674` |
| F-3 | The transport form sends a cached `state.transportQuote.rateId` with current pax and endpoints | **Frontend sends stale data the backend trusts** (BUG-10) — `dashboard.html:4080` |
| F-4 | `maxPax`/`minPax` appear nowhere in `dashboard.html` | **Both layers omit the rule** (MISSING-RULE-5) |
| F-5 | The wallet screen shows `spendingPower = balance + availableCredit`; the booking engine refuses anything above `balance` | **Frontend promises what the backend refuses** (BUG-43) |
| F-6 | The UI disables the transfer picker once a programme is chosen; the API silently drops a posted `transferRateId` instead of refusing | **Frontend blocks, backend permits-and-ignores** (BUG-35) |
| F-7 | The UI hides hotel prices per `priceVisible`; two sibling endpoints return them anyway | **Frontend-only enforcement** (BUG-04/12) |
| F-8 | The cruise UI hides prices per `showPriceToAgents`; the rate endpoints return both markets | **Frontend-only enforcement** (BUG-11) |
| F-9 | Quote status is a free dropdown; the backend accepts any transition | **Neither layer enforces the state machine** (BUG-25) |
| F-10 | Date inputs are date-only; the backend stores an instant and validates on the raw string | **Representation mismatch** (BUG-31) |
| F-11 | Client-side ordering checks (return after outbound, drop-off after pickup) are mirrored server-side | ✅ **Consistent** |
| F-12 | No in-app flow accepts a client-supplied `totalAmount`; the UI relies on `/quote` for display only | ✅ **Consistent** — the strongest part of the design |

---

## 20. Database Consistency

Assessing whether business rules are protected **at the right layer** — not flagging every absent
constraint.

| Rule | UI | API | DB | Assessment |
|---|:--:|:--:|:--:|---|
| One invoice per booking | — | ✅ | ✅ `@unique` | **Correct** — enforced where it matters |
| One voucher per booking | — | ✅ | ✅ `@unique` | **Correct** |
| Unique company / user email | ✅ | ✅ 409 | ✅ `@unique` | **Correct** |
| Unique reference numbers | — | ✅ | ✅ `@unique` + counter | **Correct** |
| Booking must have a company | — | ✅ | ✅ Required FK + `Restrict` | **Correct** |
| Package item must have a package | — | ✅ | ✅ `Cascade` | **Correct** |
| One price row per (entity, market, company) | — | ✅ | ✅ `@unique` | **Partly** — permits two rows that both score 3 (BUG-29) |
| Booking → priced row must survive | — | ❌ | ❌ `SetNull` | **WRONG LAYER** — `SetNull` silently accepts a state the business forbids (BUG-01/02). A snapshot column or `Restrict` would express the rule |
| Wallet currency matches balance | — | ❌ | ❌ no column | **MISSING EVERYWHERE** (BUG-03). `WalletTransaction` needs `currency` before this is even expressible |
| Capacity not exceeded | ❌ | ❌ | ❌ | **MISSING EVERYWHERE** (BUG-13) |
| Price visibility | ✅ | ⚠️ partial | — | **UI-only on two endpoints** (BUG-04/12) — correctly an API concern |
| `canRequestQuote` | ✅ | ❌ | — | **UI-only** (MISSING-RULE-8) |
| Activity pax limits | ❌ | ❌ | ❌ | **MISSING EVERYWHERE** (MISSING-RULE-5) |
| Invoice state machine | ⚠️ | ❌ | — | **MISSING** (BUG-09) — belongs in the API |
| Quote state machine | ❌ | ❌ | — | **MISSING** (BUG-25) — belongs in the API |
| Concurrent balance safety | — | ❌ | ❌ no lock | **MISSING** (BUG-08) — needs a DB-level guarantee |

**Read:** the DB layer is used correctly for identity and referential rules. The gaps are all
*behavioural* rules that belong in the API and are absent there — plus one case (booking → priced row)
where a permissive referential action actively enables an invalid business state.

---

## 21. Reporting Consistency

| Check | Result |
|---|---|
| Cancelled bookings excluded from revenue | ✅ PASS — `isRevenueRecord` counts only CONFIRMED/COMPLETED |
| Revenue matches confirmed bookings | ⚠️ PARTIAL — the rule is right, the aggregation is not (BUG-18) |
| Every service type counted | ❌ FAIL — `ActivityPackage` absent (BUG-17) |
| Revenue split by currency | ❌ FAIL — headline keeps USD only; monthly sums across currencies (BUG-18) |
| Per-company revenue | ❌ FAIL — keyed on `company.currency`, so mismatched companies show 0 (BUG-18c) |
| Refunds reduce revenue | ✅ PASS — via the status change, not by subtracting refunds |
| Revenue dated by confirmation | ✅ PASS — `confirmedAt ?? requestedAt` |
| Transfer counts match actual transfers | ❌ FAIL — the ops queue includes cancelled parents (BUG-22) |
| Reports update after lifecycle changes | ✅ PASS — computed live, never cached |
| Agency sees only its own report | ✅ PASS — `getCompanyReport` ownership check |
| Quote pipeline reported | ❌ FAIL — `QuoteRequest` absent from reports entirely (BUG-14) |
| Wallet ledger reconciles with the balance | ⚠️ PARTIAL — `getBalance` reconciles them by construction (`totalDeposited = max(credits, balance + used)`), which **masks** any real divergence from BUG-06/08 rather than surfacing it |

---

## 22. Business Logic Coverage

Inventory, not a score.

| Module | Features found | Features tested | Pass | Fail | Partial | Blocked |
|---|---:|---:|---:|---:|---:|---:|
| Nile Cruise | 11 | 11 | 5 | 4 | 2 | 0 |
| Transport | 10 | 10 | 5 | 3 | 2 | 0 |
| Activities | 8 | 8 | 4 | 2 | 2 | 0 |
| Activity Packages | 6 | 6 | 3 | 2 | 1 | 0 |
| Hotels | 9 | 9 | 5 | 3 | 1 | 0 |
| Hotel/Flight Bookings | 5 | 5 | 2 | 2 | 1 | 0 |
| Quote Requests | 5 | 5 | 2 | 3 | 0 | 0 |
| Security Approval | 8 | 8 | 4 | 3 | 1 | 0 |
| Airport Assist | 5 | 5 | 4 | 1 | 0 | 0 |
| SIM Card | 6 | 6 | 6 | 0 | 0 | 0 |
| Wallet & Companies | 9 | 9 | 4 | 4 | 1 | 0 |
| Invoicing | 8 | 8 | 4 | 3 | 1 | 0 |
| Vouchers | 5 | 5 | 3 | 2 | 0 | 0 |
| Reports & Search | 4 | 4 | 1 | 3 | 0 | 0 |
| **Total** | **99** | **99** | **52** | **35** | **12** | **0** |

Supporting modules reviewed without a separate feature matrix: Master data, Group Types,
Destinations, Airports, Offers, UI Templates, FX, Uploads/Files, Sheets sync, Enrichment.

**Every major module appears above. No module was left untested.**

---

## 23. Blocked Tests

| Area | Why blocked | What it would take |
|---|---|---|
| Integration suite (`tests/integration.test.ts`) | Requires `RUN_DB_TESTS=1` + live Postgres; skips cleanly (22 skipped) | A disposable Postgres and the pending migration applied |
| Concurrency (C-1 … C-6) | Needs two simultaneous clients against one database | Same, plus a load driver |
| Browser / Arabic RTL workflows | The app cannot boot without a database | Same; Chromium and Playwright are available in this environment |
| Google Sheets sync | Needs `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_SHEETS_ID` | Service-account credentials |
| Apify hotel-media enrichment | External API, no token | An Apify token |
| Email delivery | No SMTP configured | SMTP credentials or a capture server |
| PDF rendering fidelity | Generators read live records | A database with representative data |
| Production data profiling (orphans, mixed-currency ledgers, bookings with NULL cruise FKs) | Production is Neon cloud; deliberately not touched | Read-only credentials, or a restored snapshot |
| `xlsx`-dependent paths (`export-excel`, `import-excel`, statement Excel) | `cdn.sheetjs.com` returns 403 through the environment proxy, so the package could not be installed | Network access to the SheetJS CDN, or a registry mirror |

**Not safely executable without an isolated test environment.** No production data was read or
modified at any point.

### A note on what production data would likely reveal

BUG-01 and BUG-02 are *historical* — every past catalogue save has already detached whatever bookings
existed at the time. A read-only query against production would quantify it directly:

```sql
-- Cruise bookings that have lost their catalogue links (illustrative; NOT run)
SELECT count(*) FROM "CruiseBooking"
WHERE ("programmeId" IS NULL AND "programmeRateId" IS NULL AND "transferRequested" = true)
   OR ("cabinRateId" IS NULL AND "occupancy" IS NOT NULL);

-- Wallet ledger entries whose booking no longer exists (BUG-05)
-- Companies whose balance disagrees with their ledger (BUG-06, BUG-08)
```
This is the single highest-value next step and requires nothing but read access.

---

## 24. Highest-Risk Areas

Ranked by *business* exposure, not by how broken the code looks.

1. **The cruise catalogue → booking relationship.** Two BLOCKERs, triggered by routine admin work,
   with no warning and no recovery. Every past save has already caused damage. Nothing else in the
   system silently destroys commercial records.
2. **The wallet.** Currency-blind (BUG-03), racy (BUG-08), unreconciled with the visa module
   (BUG-05/06), and its ledger has no currency column, so historical rows cannot be interpreted or
   repaired.
3. **Price confidentiality.** Two endpoints (BUG-04, BUG-12) plus three cruise endpoints (BUG-11)
   expose contract rates across tenants. The visibility *model* is well designed; it is bypassed by
   siblings of the endpoints that implement it.
4. **The quote-only revenue stream.** The highest-value products cannot be booked in-app and accepted
   quotes convert to nothing (BUG-14). This is unfinished work, not a bug, but it means the wallet,
   invoicing and reporting cover only part of the business.
5. **Availability.** No inventory anywhere (BUG-13). Whether that is a defect depends on
   BUSINESS-QUESTION-1 — but the capacity fields currently promise a guarantee that does not exist.
6. **Cancellation.** Unconditional, always 100%, valid after the service date (MISSING-RULE-3).
7. **Vouchers.** Issued before commitment, never revoked (BUG-15) — the customer-facing consequence
   of the lifecycle gaps above.
8. **Reporting.** Two structural errors (BUG-17, BUG-18) mean management figures understate the
   business and mis-state its currency.

---

## 25. Recommended Next Testing Order

1. **Query production read-only** for the historical footprint of BUG-01/02/05/06/08 (see §23).
   Needs nothing but read access and answers "how much damage is already done".
2. **Stand up a disposable Postgres**, apply the pending migration, run
   `RUN_DB_TESTS=1 npm run test:integration`. Everything below depends on it.
3. **Re-test the cruise catalogue cycle end to end** with a live database: book → save catalogue →
   re-read. Confirms BUG-01/02 dynamically and measures the blast radius per save.
4. **Concurrency harness** on the wallet: two simultaneous confirms, two simultaneous rejects, two
   top-ups. Confirms C-1, C-2, C-6.
5. **Permission sweep** with real tokens across the endpoints in §12, specifically BUG-04, BUG-11 and
   BUG-12, plus the deactivated-user and moved-user windows (BUG-16).
6. **Money reconciliation** on a seeded dataset: for every booking, compare
   `booking.totalAmount` / `invoice.total` / `SUM(walletTransaction)` / `company.balance`. Surfaces
   BUG-03, BUG-06 and BUG-08 in one pass.
7. **Browser + Arabic RTL** on the cruise admin form and the transport booking form — the two places
   where the frontend causes a backend defect (F-1, F-3).
8. **Lifecycle sweep**: every transition in §11 against a live database, including the COMPLETED and
   OVERDUE gaps.

---

# BUSINESS LOGIC TEST SUMMARY

### Totals

| | |
|---|---:|
| **Modules reviewed** | **14** (+ 10 supporting) |
| **Features reviewed** | **99** |
| **Business scenarios tested** | **187** |
| **Cross-module relationships tested** | **42** |
| **State transitions tested** | 36 |
| **Business invariants tested** | 30 |
| **Role/permission checks** | 37 |
| **Executable probes written** | 19 (all pass, all confirming a defect) |
| **Existing unit suite** | 153/153 pass (clean baseline) |

### Confirmed Bugs — 43 total

| Severity | Count | IDs |
|---|---:|---|
| **BLOCKER** | **4** | BUG-01, 02, 03, 04 |
| **CRITICAL** | **8** | BUG-05, 06, 07, 08, 09, 10, 11, 12 |
| **HIGH** | **11** | BUG-13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23 |
| **MEDIUM** | **14** | BUG-24 … BUG-36, BUG-43 |
| **LOW** | **6** | BUG-37 … BUG-42 |

**Confidence split — 36 Confirmed, 7 Highly Likely.**
Highly Likely (all needing a live DB or two concurrent clients): **BUG-08** and concurrency scenarios
C-1/C-2/C-3/C-5/C-6, plus **BUG-34** (latent — the path exists but is not currently reachable).
Everything else is Confirmed: the defective path was read end to end with no guard on it, or was
reproduced by executing the application's own module.

### Missing Business Rules — 11
### Business Clarifications Required — 6

---

# TOP CRITICAL FINDINGS

1. **BUG-01 — Saving the shared cruise catalogue detaches every booking on every boat**
   Cruise catalogue → Cruise booking (+ Transfer, Invoicing, Operations)
   *Impact:* `materialiseSharedCatalogue` runs `deleteMany({})` with no cruise scope; `SetNull`
   nulls `programmeId`, `programmeRateId` and `transferRateId` on **every** existing cruise booking.
   The booking keeps its money and its `transferRequested` flag but no longer knows what was sold or
   where the driver collects the guests. No warning, no recovery, and every past save has already
   done it.

2. **BUG-02 — Editing any cruise field destroys its entire fare table**
   Cruise schedule → Cabin rates / Programmes / Transfers / Bookings
   *Impact:* the admin form re-PUTs schedules on every save; `deleteMany` + four `Cascade` relations
   wipe the fares, programmes and transfer rates, and `SetNull` unlinks every booking's
   `cabinRateId` and `scheduleId`. The rates are re-created with new ids, so bookings never re-link.
   A description-only edit is enough.

3. **BUG-03 — The wallet debits EGP amounts from USD balances at 1:1**
   Wallet → every booking module
   *Impact:* sale prices are stored in the rate's currency; `debitWallet` compares and subtracts
   against `company.balance` with no currency check, and `WalletTransaction` has no currency column.
   Either the agency is overcharged ~50× or the platform gives the service away. Top-ups *are*
   currency-guarded, which shows the omission.

4. **BUG-04 — Any COMPANY_ADMIN can export every hotel's confidential rate book**
   Hotels → Companies (tenancy)
   *Impact:* `GET /api/hotels/export-excel` discards the caller (`_req`) and dumps every active hotel
   with every seasonal price, ignoring `showPriceToAgents` and `HotelCompanyVisibility`. One request,
   a legitimate account, total exposure of the platform's commercial terms.

5. **BUG-05 — Deleting an approved security approval keeps the money and orphans the ledger**
   Visa → Wallet, Invoicing
   *Impact:* the delete guard checks the *invoice* (`PAID`) but the wallet is debited at *approval*.
   An approved application is destroyed with its invoice and voucher; the DEBIT survives pointing at
   a dead reference and is never refunded. The error message recommends cancelling instead — **no
   cancel endpoint exists**.

6. **BUG-06 — Repricing an approved approval desynchronises booking, invoice and wallet**
   Visa → Wallet, Invoicing, Reports
   *Impact:* `totalAmount` and the invoice are rewritten; the wallet is not touched. Three records,
   three different amounts, and a later cancel refunds the *new* figure against the *old* debit.

7. **BUG-07 — Consolidated statements bill cancelled, already-refunded invoices**
   Invoicing → every booking module, Wallet
   *Impact:* eligibility filters on company, period and "not yet consolidated" — never on status.
   Cancelled invoices are summed into the amount due, and the PDF prints `Status: CANCELLED` beside
   an amount it includes.

8. **BUG-08 — Concurrent wallet writes lose money**
   Wallet → every booking module
   *Impact:* all seven balance writes are absolute `balance = x` assignments after an unlocked read,
   under READ COMMITTED. Two simultaneous confirms lose one debit; `rejectBooking` checks
   idempotency outside its transaction and can double-refund.

9. **BUG-09 — A cancelled invoice can be marked PAID, and the customer is thanked for it**
   Invoicing → Wallet, Statements
   *Impact:* `markPaid` has no status guard. Produces booking CANCELLED + invoice PAID + wallet
   REFUNDED, and emails a payment confirmation.

10. **BUG-10 — `rateId` bypasses capacity and route matching**
    Transport → Vouchers, Invoicing, Operations
    *Impact:* the `rateId` branch of `resolveTransportRate` skips the capacity filter entirely and
    records a non-matching route as `EXACT`. Book 40 passengers on a 3-seat sedan, or pay a short
    airport transfer's price for an intercity run. Reachable through ordinary UI use, because the
    form sends a cached quote id with live form values.

11. **BUG-11 / BUG-12 — Cruise and hotel price tables exposed to every agent**
    Cruise / Hotels → Companies
    *Impact:* `GET /cruises/:id/{rates,programmes,transfer-rates}` and `GET /hotels/:id/pricing` apply
    no visibility filter, no market filter and not even `isActive`. A foreign agency reads the
    Egyptian EGP tariff. The equivalent hotel rate endpoint *is* SUPERADMIN-gated, showing the
    intended standard.

---

# BROKEN CROSS-MODULE RELATIONSHIPS

Explicitly, the relationships that do not hold:

| Relationship | What breaks |
|---|---|
| **Cruise catalogue → Cruise booking** | All five foreign keys nulled by a routine admin save (BUG-01, BUG-02) |
| **Cruise → Transfer** | `transferRateId` destroyed; legacy `INTERNATIONAL` rows unbookable; vehicle count client-controlled (BUG-01, BUG-25, BUG-27) |
| **Cruise schedule → Cabin rates / Programmes** | Cascade-deleted whenever schedules are re-saved (BUG-02) |
| **Cruise booking → Transport operations** | Cancelled bookings remain in the work queue (BUG-22) |
| **Transport rate → Transport booking** | `rateId` accepted without capacity or route validation (BUG-10) |
| **Booking → Voucher** | Issued before confirmation, never revoked on cancellation (BUG-15) |
| **Visa → Wallet** | Delete keeps the money; reprice desynchronises the ledger (BUG-05, BUG-06) |
| **Invoice → Booking status** | `markPaid` can contradict a cancellation (BUG-09) |
| **Invoice → Consolidated statement** | Cancelled invoices billed; later payments never reflected (BUG-07) |
| **Wallet → Company currency** | Never compared; the ledger has no currency at all (BUG-03) |
| **Wallet → Credit limit** | Headroom displayed to admins, refused by the booking engine (BUG-43) |
| **Quote request → Booking** | **No relationship exists** — accepted quotes convert to nothing (BUG-14) |
| **Activity package → Reports** | Module absent from the aggregator (BUG-17) |
| **Activity package → Consolidated statement** | Line rendered unlabelled (BUG-17) |
| **Activity → MarketPrice** | Party rates never consult the matrix (BUG-23) |
| **Activity → Transfer add-on** | Currencies never reconciled (BUG-20) |
| **Hotel → Company visibility** | Bypassed by the export and the pricing endpoint (BUG-04, BUG-12) |
| **Hotel → Booking** | Room inventory never consulted (BUG-13) |
| **User → Company** | Stale `companyId` in the token for up to an hour after a move (BUG-16) |
| **User → Booking history** | Three relations missing from the delete guard → 500 (BUG-19) |
| **Every booking → Capacity** | No relationship exists at all (BUG-13) |

---

# BUSINESS FLOWS THAT WORK CORRECTLY

Verified working — as important as the failures:

* **Explicit price resolution, with no FX.** `company → market → all → base` scoring is correct;
  `explicitMoney` is used at every sale site; `convertMoney` is reachable from no sale path. The
  previous audit's Findings 5 and 6 are genuinely fixed.
* **Server-authoritative pricing.** No in-app booking flow accepts a client `totalAmount`. Verified
  across all eight modules.
* **Wallet idempotency (single-threaded).** `debitWallet` debits once per reference; `refundWallet`
  refunds only after a debit and only once. Covered by the existing suite and re-verified.
* **Top-up currency safety.** `CURRENCY_MISMATCH` correctly refuses a top-up in the wrong currency,
  and top-ups are properly funded from the platform wallet.
* **Confirm-state guards.** All eight modules refuse to confirm anything that is not `PENDING` and
  refuse an inactive company.
* **Tenant scoping.** Every list, detail, cancel and download endpoint scopes on `companyId` —
  Bookings, Cruise, Transport, Activities, Packages, Invoices, Statements, Wallet, Vouchers, Search,
  Reports, Files. 31 of 37 permission checks pass, and all six failures are business-rule gaps rather
  than broken `requireRole`.
* **Private document ownership.** `companyOwnsFile` correctly ties a passport or ticket scan to the
  company whose booking references it.
* **Cruise schedule/date integrity.** Departure weekday, night count and return weekday are all
  enforced against the selected leg, in both the booking and the quote paths. Weekday wrap-around
  arithmetic is correct.
* **Cruise fare/programme selection rules.** Cabin-vs-programme exclusivity, schedule binding, market
  matching, validity periods, child-price requirements and "a programme already includes its
  transfer" are all correctly enforced.
* **Activity pricing arithmetic.** Party composition (5 on a double = 2 doubles + 1 single), the
  blank-is-not-free rule, and the legacy-zero-means-not-sold rule are all correct.
* **Package integrity.** One package → one invoice → one voucher, idempotent and `@unique`-enforced;
  intra-package time-conflict detection works; mixed-currency lines refused.
* **Mixed-currency refusals** where they exist: package lines, statements, cruise transfer vs fare,
  adult vs child.
* **Decimal money throughout.** No floating point anywhere in a money path; consistent
  `toDecimalPlaces(2)`.
* **Reference-number generation.** Atomic counter increments; globally unique across all service
  prefixes.
* **Input hardening.** Field allow-lists (cruise), Zod schemas (visa, users, hotels, activities),
  `sanitizeCustomFields`, and `escapeHtml` on every interpolated email value.
* **The transport service-mode work from the previous audit.** Hourly/day-use pickup enforcement,
  the `rateLabels` guard, independent round-trip legs and the "same route reversed" toggle all behave
  as documented.
* **Quote → Transport operations.** The one quote relationship that is fully wired: transfer answers
  captured on a quote reach the operations queue intact.

---

# BUSINESS FLOWS THAT COULD NOT BE VERIFIED

| Flow | Why |
|---|---|
| Any end-to-end flow against a real database | No `DATABASE_URL`; production is Neon cloud and was deliberately not touched |
| Concurrency (C-1 … C-6) | Requires two simultaneous clients against one database |
| Google Sheets import/sync | Missing service-account credentials |
| Apify hotel-media enrichment | External API, no token |
| Email notifications | No SMTP configured |
| PDF output fidelity (invoice, voucher, statement) | Generators read live records |
| Excel export/import paths | The `xlsx` package could not be installed — `cdn.sheetjs.com` returns 403 through the environment proxy |
| Browser and Arabic RTL workflows | The app cannot boot without a database |
| Historical data damage from BUG-01/02/05/06 | Requires read-only production access |
| The intended *business* rules behind the 6 clarifications in §8 | Requires the business, not the code |

---

# FINAL CONCLUSION

**1. Is the core business logic internally consistent?**
No. Individual modules are consistent within themselves and the pricing engine is genuinely sound —
but the modules disagree with each other at almost every seam. Fifteen of thirty business invariants
are broken, and every one of them spans two or more modules.

**2. Are there broken relationships between modules?**
Yes — 15 of the 42 relationships tested fail outright and 15 more are partial. The worst is
**Cruise catalogue → Cruise booking**, where routine admin work silently nulls five foreign keys on
every existing booking. The suspicion that prompted this audit was correct, and BUG-01/BUG-02 are the
mechanism.

**3. Are there workflows that succeed technically but fail as business?**
Yes, and this is the dominant failure mode. A catalogue save returns 200 and destroys commercial
records. A confirm returns 200 and debits the wrong currency. `markPaid` returns 200 on a cancelled
invoice and emails a thank-you. A transport booking returns 201 having sold a 3-seat car to 40
people. A quote is accepted and nothing happens. In every case the HTTP response and the database
write are both "successful".

**4. Are there important missing business rules?**
Yes — 11. The most consequential are: no availability model, no cancellation policy, no
service-delivery state, no quote→booking conversion, and no receivables ageing. Four of the five are
capabilities the schema *appears* to offer (`cabins`, `maxPax`, `COMPLETED`, `OVERDUE`, `dueDate`)
but no code implements.

**5. Are there dangerous state transitions?**
Yes. `CANCELLED → PAID` on an invoice (BUG-09); any-to-any on a quote (BUG-25); repricing after a
debit (BUG-06); deleting a charged approval (BUG-05); and two unreachable-but-referenced states
(`COMPLETED`, `OVERDUE`) that reports and filters already treat as real.

**6. Are there permission/ownership problems?**
The role *plumbing* is sound — 31 of 37 checks pass and every list endpoint is correctly scoped. The
problems are business-level: three endpoints leak the rate book to agencies (BUG-04, 11, 12), and
deactivation or a company move takes up to an hour to take effect, during which a moved user can
still read and write their **former** company's data (BUG-16).

**7. Are frontend, backend and database rules consistent?**
No, in three distinct patterns. **UI-only enforcement:** price visibility, `canRequestQuote`, quote
transitions. **Frontend causes a backend defect:** the cruise form's unconditional catalogue
re-publish (BUG-02) and the transport form's stale cached `rateId` (BUG-10). **Frontend promises what
the backend refuses:** `spendingPower` includes credit the booking engine will not accept (BUG-43).
Where the three layers agree — server-authoritative pricing, referential identity constraints,
tenant scoping — they agree well.

**8. Which module should be investigated FIRST?**
**Nile Cruise — specifically `cruise-catalogue.controller.ts` and the admin cruise form.** It holds
both BLOCKERs, the damage is ongoing and cumulative with every save, it is silent, and it is
irreversible. It is also the module the original suspicion pointed at.

**9. Which cross-module relationship is the highest risk?**
**Cruise catalogue → Cruise booking** (five `SetNull`/`Cascade` foreign keys destroyed by routine
admin work). Runner-up: **Wallet → Company currency**, which has no relationship at all where the
business requires one, and whose ledger cannot even record the information needed to repair it.

**10. What should be tested next?**
A read-only query against production to size the historical damage from BUG-01/02/05/06/08 — it
needs nothing but read access and tells you whether this is a future risk or an existing loss. Then a
disposable Postgres for the integration suite, the concurrency harness and a full money-reconciliation
pass. The ordered plan is in §25.

---

*Report produced by static analysis, targeted probes against the application's own business-logic
modules, and a full reading of the schema, the API layer and both HTML portals. No application code,
schema, migration, configuration or data was modified. Nothing was committed beyond this report.*
