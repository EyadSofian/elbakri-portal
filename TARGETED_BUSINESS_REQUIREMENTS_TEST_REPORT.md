# TARGETED BUSINESS REQUIREMENTS TEST REPORT
## Nile Cruise · Programmes · Transfers · Activity Packages · Offers/Packages

**Verified against:** `origin/main` = `bf8f831` (current HEAD at time of writing)
**Date:** 2026-08-31 · **Scope:** 20 stated business requirements
**Method:** full source trace (Admin UI → API → business logic → DB → resolver → Client UI → payload → stored transaction) plus **50 executable probes** run against the application's own modules.
**Nothing was modified.** The only artifact created is this report.

---

## 0. Codebase currency check — read this first

The prompt warns that the app may have changed since `BUSINESS_LOGIC_TEST_REPORT.md`. It has not:

```
$ git fetch origin main && git diff --stat bf8f831 origin/main
(empty)
```

`origin/main` is still `bf8f831` — **byte-identical** to the commit the previous report audited. No fixes have landed.

That does **not** make this report a copy of the old one. These are **different requirements**, and most were never tested in this framing (per-person *presentation*, programme↔transfer double-charge, 3/4-night binding, Offers-vs-Packages separation, the package builder, package price resolution). Everything below was re-derived from source at current HEAD. Section 22 re-verifies the old findings that overlap these requirements and marks each explicitly.

**One structural fact reframes several requirements and was not surfaced in the previous report:**

> Agents cannot create cruise bookings — `createCruiseBooking` returns `USE_QUOTE_REQUEST` for anyone who is not SUPERADMIN. **The only cruise path a customer/agency has is `POST /api/quote-requests`.** That endpoint performs *almost no* cruise business validation, and the entire commercial selection — programme, rate, occupancy, unit prices, product total, supplements, transfer and transfer total — is **computed in the browser and stored verbatim as `customFields` JSON**.

So for most requirements below there are **two answers**: one for the SUPERADMIN booking API (generally correct) and one for the agent quote API (generally unenforced). Where they differ, the agent path is the one that decides the business result, and it is reported as such.

---

## 1. Test environment

| Item | Status |
|---|---|
| Source trace (backend, schema, `admin.html`, `dashboard.html`, i18n) | ✅ complete |
| Custom probes for these requirements | ✅ **50/50 pass**, each pinning one behaviour |
| Existing cruise suite (`tests/cruise-rates.test.ts`) | ✅ 47/47 pass — clean baseline |
| Live database | ❌ none (`DATABASE_URL` unset; production is Neon, deliberately untouched) |
| Browser (Admin + Client runtime) | ❌ app cannot boot without a DB |
| Excel-dependent paths | ❌ `xlsx` unavailable — `cdn.sheetjs.com` returns 403 through the proxy |

Probe files (kept **outside** the repo, in the session scratchpad): `req-cruise.ts` (15), `req-supp.ts` (20), `req-pkg.ts` (15).

**Runtime honesty:** REQ 15 (reload/state persistence) and every "click it in the browser" step are marked **BLOCKED**, not PASS. Where a requirement depends on actual persistence or DOM behaviour I verified the data round-trip at source level and say so explicitly rather than claiming a runtime pass.

---

## 2. Overall result

| Result | Count | Requirements |
|---|---:|---|
| **PASS** | **4** | REQ 4, 5, 11, 19 |
| **FAIL** | **3** | REQ 12, 16, 18 |
| **PARTIAL** | **12** | REQ 1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 17, 20 |
| **BLOCKED** | **1** | REQ 15 |

**19 REQ-BUGs** raised: 3 BLOCKER, 3 CRITICAL, 6 HIGH, 6 MEDIUM, 1 LOW.

---

## 3. Requirement-by-requirement result

### REQ 1 — Nile Cruise programme pricing: Egyptian EGP / Foreign USD — **PARTIAL**

**Audience source (as asked):** the authoritative source is **`Company.market`**, never traveller nationality and never an explicit selector.
`resolvePriceContext(req)` → `company.market` → `cruiseAudience(market)` → `'EGYPTIAN' | 'FOREIGN'`
(`cruise.controller.ts:92-93`, `shared/cruise-rates.ts:88-90`). The client mirrors it: `state.user?.company?.market === "EGYPTIAN" ? "EGYPTIAN" : "FOREIGN"` (`dashboard.html:6143`). `QuoteRequest.nationality` exists and is captured, but **is not consulted by any pricing path** — it is a passenger detail only.

**Currency binding is enforced on write, not merely displayed.** `asCruiseMarket()` folds any value to `EGYPTIAN|FOREIGN` and `cruiseCurrency()` derives the currency from it — the admin cannot save a mismatched pair (`cruise-catalogue.controller.ts:31-37`). The admin currency input is `readonly` and driven by the market selector (`admin.html:7087`). ✅

**Pricing resolution — PASS** (probes 1-5): an EGYPTIAN row never applies to a FOREIGN audience and vice versa.

**Confidentiality — FAIL.** Three endpoints return **both** tariffs to any authenticated agent, with no role guard, no market filter and not even an `isActive` filter:

| Endpoint | Guard | Returns |
|---|---|---|
| `GET /api/cruises` | ✅ market-filtered + `showPriceToAgents` | correct |
| `GET /api/cruises/:id/rates` | ❌ none | every cabin rate, both markets, incl. inactive |
| `GET /api/cruises/:id/programmes` | ❌ none | every programme + **both** tariff rows |
| `GET /api/cruises/:id/transfer-rates` | ❌ none | every transfer rate, both markets |

A FOREIGN agency reads the Egyptian EGP tariff directly. → **REQ-BUG-03**

---

### REQ 2 — Programme ↔ Transfer — **PARTIAL**

| Case | UI | Booking API (SUPERADMIN) | Quote API (agent — the real path) |
|---|---|---|---|
| A: Programme → transfer included, not charged | ✅ | ✅ | ❌ |
| B: No programme → cruise only, no transfer | ✅ | ✅ | ❌ |
| C: No programme + explicit standalone transfer | ✅ | ✅ | ❌ |

**UI — PASS.** A mutually exclusive mode selector (`crProductMode()` = `PROGRAMME` | `TRANSFER`). With a programme the transfer selector is not rendered at all; a read-only panel shows the included route `transferFromName → transferToName` (`dashboard.html:2030-2031`). `crReadSelection` hard-nulls the transfer when a programme is present: `mode === "TRANSFER" && !programme ? ... : null` (`:2205`). Double charge is impossible through the interface.

**Booking API — PASS.** Independently enforced: `if (!programmeRate && body.transferRateId)` gates the entire transfer lookup and price addition (`cruise.controller.ts:466`), and `transfer = programmeRate ? readTransferAddOn({}, { transferIncluded: true }) : …` (`:497`). Probe 20 confirms `transferIncluded:true` nulls the add-on whatever the payload says. Posting programme + transfer cannot double-charge.
*Caveat:* the transfer is dropped **silently** — no error, no warning (contrast the explicit `PICK_ONE_FARE` when two fares are sent). → **REQ-BUG-19**

**Quote API — FAIL.** `createQuoteRequest` never inspects `cruiseProgrammeId` or `cruiseTransferRateId`. Both can be present with both `cruiseProductTotal` and `cruiseTransferTotal`, and the row is stored as sent. → **REQ-BUG-01**

**Programme removed / switched:** handled client-side — `crProductMode` re-renders and `crReadSelection` re-reads from the DOM, so no Programme-A data can survive into a Programme-B selection *in the payload*. Runtime DOM verification is **BLOCKED** (no browser).

---

### REQ 3 — 3-night / 4-night logic — **PARTIAL**

**Catalogue materialisation — PASS.** A programme/transfer is only created against a schedule with the **same nights** and a shared route corridor:
`cruiseRoutesShareCorridor(cruise.route, programme.route) && Number(programme.nights) === schedule.nights` (`cruise-catalogue.controller.ts:494-496, 536-538`). A 3-night programme can never be materialised onto a 4-night leg. Probes 14-15.

**Booking API — PASS.** The invariant `programme ∈ schedule` and `programmeRate ∈ programme` is enforced in the query itself:
```ts
programme: { id: body.programmeId, cruiseId: body.cruiseId, isActive: true,
             ...(body.scheduleId ? { scheduleId: body.scheduleId } : {}) }   // :360-368
```
plus `if (rate?.scheduleId && rate.scheduleId !== body.scheduleId) throw RATE_NOT_AVAILABLE` (`:353`) and the transfer lookup pinned to `scheduleId` (`:470`). A Frankenstein booking is rejected here.

**Quote API — FAIL.** Only the schedule↔cruise link and the calendar dates are checked (`quote-requests.controller.ts:148-170`). `cruiseProgrammeId`, `cruiseRateId`, `cruiseNights` and every price are unvalidated. Worse, the whole block is gated on `if (cruiseScheduleId)` — **omit that one field and no cruise validation runs at all**, not even the dates. A 3-night sailing carrying a 4-night programme id and a 4-night total is accepted. → **REQ-BUG-01**

---

### REQ 4 — Cruise pricing is PER PERSON — **PASS**

**Calculation — PASS** (probes 6-15, deliberately distinct values):

| Case | Rate | Pax | Expected | Actual |
|---|---|---|---|---|
| Double, Egyptian | 12,222 EGP pp | 2 adults | 24,444 | **24,444 EGP** ✅ |
| Triple, Foreign | 433 USD pp | 3 adults | 1,299 | **1,299 USD** ✅ |
| Single, Foreign | 611 USD pp | 1 adult | 611 | **611 USD** ✅ |
| Double + child | 522 / 344 USD pp | 2A+1C | 1,388 | **1,388 USD** ✅ |
| 4-night double | 722 USD pp | 2 adults | 1,444 | **1,444 USD** ✅ (distinct from 3-night 1,044 — proves the right row fired) |

`priceCruisePerPerson` multiplies by heads, not cabins (`cruise-rates.ts:187-207`).

**Presentation — PASS.** "per person" is stated at every level and in both languages:
- Client step heading: *"Guests and per-person price"* + *"Single, Double and Triple are sharing bases; every amount shown is per person"* (`dashboard.html:1662`)
- Client fare cards: `per person` under each amount (`:1961`), `adult · per person` (`:1946`), summary line *"Per-person price"* (`:2369`)
- Admin rate editor: every occupancy input labelled `Single · per person`, `Double · per person`, `Triple · per person`, `Child · per person` (`admin.html:4788-4791, 4847-4848`)
- Arabic: `perPerson: "بالفرد"` (`i18n.js:1304`)
- The transfer is explicitly contrasted: *"The price is for the whole vehicle, not per person"* (`i18n.js:2160`)

**No misleading legacy language.** Searched `per cabin`, `cabin total`, `room total` across both portals — **zero occurrences**.

**Tampering — PASS.** `adults` is floored at 1 (`Math.max(1, Math.floor(input.adults) || 1)`), so a posted `adultsCount: 0` or `-5` still charges one person (probe 12). The booking API derives the total from `adultsCount`/`childrenCount` on the request, never from a client-sent total.
*Residual:* the legacy **per-cabin** function `priceCruiseBooking` still exists and returns a different number for the same inputs (522 vs 1,044 — probe 11). It is called by no controller, so it is dead code, not an active defect. Logged as `OUTDATED-TEST-01` context.

**Quote path caveat:** on the agent path the *displayed and stored* per-person figures are computed in the browser (`cruiseAdultUnitPrice`, `cruiseProductTotal`). The arithmetic rule is right; the authority is not (REQ 18).

---

### REQ 5 — Only two Nile Cruise price audiences — **PASS**

Probe 1 exercises **all seven** `Market` enum values:

```
EGYPTIAN → EGYPTIAN
INTERNATIONAL, GULF, FOREIGN, MIDDLE_EAST, NORTH_AFRICA, ARAB_48 → FOREIGN
```
`new Set(...).size === 2`. Exactly two buckets, no third pricing behaviour.

- **Write side:** `asCruiseMarket()` folds every legacy value to `EGYPTIAN|FOREIGN` on every save (`cruise-catalogue.controller.ts:31-33`), so new rows can only be one of two.
- **Read side:** `marketEquivalent()` folds a legacy `INTERNATIONAL` row into `FOREIGN` so pre-normalisation data still prices (probe 4).
- **Legacy `GULF` rows:** match neither audience (probe 5) — they become invisible rather than becoming a third bucket. Correct per the requirement ("must not create a third customer-pricing behaviour"), though such rows are silently unsellable. Noted, not a bug against this requirement.

**Contradiction with the wider codebase (reported as required):** `MarketPrice.scoreRow` — used by hotels, activities, transport, SIM — requires **exact** market equality and does *not* treat INTERNATIONAL as FOREIGN, and `isMarket()` in `shared/pricing.ts:47` recognises only 4 of the 7 values. Cruise pricing is self-consistent and meets this requirement; the rest of the platform uses a different market rule. Flagged as a cross-module inconsistency, not a REQ-5 failure.

---

### REQ 6 — Nile Cruise supplements — **PARTIAL**

Chain verified: admin editor → `cleanSupplements()` → stored as JSON on the rate → returned by the catalogue → selected by name → `applyCruiseSupplements()` → added to the fare → snapshotted to `CruiseBooking.selectedSupplements`.

| Test | Result |
|---|---|
| No supplement | ✅ 1000 → 1000 |
| One FIXED_AMOUNT (per person) | ✅ 1000 → 1154 (77×2) |
| PERCENTAGE on the fare | ✅ 1000 → 1100 |
| TEXT_ONLY never charges | ✅ |
| Multiple FIXED accumulate | ✅ 1000 → 1160 |
| Negative amount refused | ✅ null |
| Blank amount refused, not zero | ✅ null |
| Wrong currency refused (fixed/total) | ✅ null |
| Supplement for the wrong programme/rate | ✅ filtered out — only names present on the chosen rate are honoured (`cruise.controller.ts:420-423`) |
| **Order-independence `[A,B]` vs `[B,A]`** | ✅ for FIXED+FIXED and FIXED+PERCENT |
| **`[FIXED, TOTAL_PRICE]` vs `[TOTAL_PRICE, FIXED]`** | ❌ **1800 vs 1900** — the order the client sends changes the price → **REQ-BUG-07** |
| **PERCENTAGE after TOTAL_PRICE** | ❌ computed on the *pre-supplement* base (1900, not 1980) → **REQ-BUG-07** |
| Duplicate supplement | ❌ applied **twice** (1000 → 1200), no dedupe → **REQ-BUG-16** |
| PERCENTAGE with a foreign currency tag | ❌ **accepted** — the currency guard is skipped for percentages → **REQ-BUG-15** |
| Expired supplement | ⚠️ **not expressible** — a supplement is `{name,type,amount,currency}` with no `validFrom`/`validTo` (probe 15). Cannot be tested because the concept does not exist. |

The requirement's explicit invariant — *"the final amount must NOT change merely because the frontend sends supplements in a different array order"* — **is violated** whenever a `TOTAL_PRICE` supplement is combined with any other.

---

### REQ 7 — Standalone transfer without a programme — **PARTIAL**

- **Default is correct:** with no programme and no explicit choice, `crProductMode()` yields no transfer and `readTransferAddOn` returns the all-null `NO_TRANSFER` unless `transferRequested` is truthy (probe 19). A transfer never "magically exists". ✅
- **Explicit add works:** mode `TRANSFER` renders an admin-priced vehicle picker showing `from → to · trip type · vehicle (capacity) · price`, with a live vehicle count (`dashboard.html:2038-2044`). ✅
- **Own price, not a programme price:** the booking API resolves the amount from `CruiseTransferRate`, pinned to cruise + schedule + market + validity, and rejects a currency mismatch against the fare (`cruise.controller.ts:466-487`). ✅
- **Vehicle/capacity/pax preserved:** `transferVehicleType`, `transferVehicleCapacity`, `transferVehicleCount`, `transferPaxCount` are all stored (`:501-511`). Pricing is per vehicle × `ceil(pax/capacity)` — probes 16-17 (12 pax in a 6-seater = 2 vehicles = 1,554). ✅
- ❌ **`transferPaxCount` is client-supplied** and never reconciled with `adultsCount + childrenCount` (`:465`), so the vehicle count and price can be understated.
- ❌ On the **quote path** none of this is validated (REQ-BUG-01).

---

### REQ 8 — Cairo transfer, From → To — **PARTIAL**

The admin defines `fromLocation`, `toLocation`, `market`, `amount`, `currency` (market-derived), `tripType`, `vehicleType`, `vehicleCapacity`, `validFrom/validTo`, bound to a `scheduleId` (`saveCruiseTransferRates`, `cruise-catalogue.controller.ts:702-772`). Routes are **operator-entered free text** — I did not invent any.

Chain: admin → `CruiseTransferRate` → catalogue → client picker showing `from → to` → booking → `transferFromName`/`transferToName` persisted on `CruiseBooking` → surfaced to operations via `cruiseTransferOperation()` with `fromName`/`toName` → printed on the voucher. **From and To survive end to end.** ✅

❌ **The negative test fails.** The requirement states a transfer with From but no To *must not* silently become From → From. `readTransferAddOn` does exactly that:
```ts
transferToName: toName ?? fromName,     // shared/transfer-addon.ts:110
```
Probe 18: `{transferRequested:true, transferFromName:'Cairo Airport'}` → `transferToName: 'Cairo Airport'`. A confident but fake route reaches the driver's voucher. → **REQ-BUG-14**
(The *rate-driven* path is safe — `saveCruiseTransferRates` requires both endpoints. The fabrication happens on the free-text add-on path used by activities, packages, cruises and quotes.)

---

### REQ 9 — Remove Nile Cruise Tours from the user flow — **PARTIAL**

**Client — PASS.** `grep -n "addOns" public/dashboard.html` → **zero matches**. The customer-facing tour picker is gone, replaced by the programme flow: choose cruise → choose sailing leg → choose *Programme* or *Cruise only* → optional standalone transfer. The admin has no cruise-tour editor either (`crAddOn`/`addOnActivity` → no matches). The `addOns` seen in `admin.html:6047` is a **different feature** — the Transport transfer-request queue (`GET /transport-bookings/add-ons`) — not cruise tours.

**Backend — STILL ACTIVE.** This is not dormant legacy code:
```ts
addOns?: { activityId?, name?, description?, activityDate?, paxCount?, amount? }[]   // :294
const addOns = (Array.isArray(body.addOns) ? body.addOns : []) …                      // :466
if (Number.isFinite(amount) && amount > 0) sourceAmount = sourceAmount.add(new Decimal(amount));  // :469-470
addOns: { create: addOns.map(...) }                                                   // :555-556
```
`createCruiseBooking` still accepts tour lines, **adds a client-supplied `amount` straight to the total with no currency check**, writes `CruiseBookingActivity` rows, and `cruiseInclude` returns them on every read. SUPERADMIN-only, so no agent can reach it — but the old business concept is still chargeable through the API. → **REQ-BUG-13**

---

### REQ 10 — Activity Package must appear and persist — **PARTIAL**

| Step | Result | Evidence |
|---|---|---|
| Admin/agent creates a package | ✅ | cart → `POST /activity-packages` (`dashboard.html:4743`) |
| API returns it | ✅ | `GET /activity-packages?limit=100` (`:4459`) |
| Client sees it | ✅ | `renderActivityPackageHistory` — ref, item count, activity names, client |
| Client can select/open it | ✅ | package cart flow with per-line basis, dates, transfer |
| Items shown | ✅ | `(p.items||[]).map(i=>i.activityName)` |
| **Price correct** | ✅ | **the payload carries no prices at all** — every line is priced server-side from `activityId` + `pricingBasis` + counts (`activity-packages.controller.ts:196-280`). Server-authoritative. |
| Booking sends package id / backend loads same | ✅ | one `ActivityPackage` + `ActivityPackageItem[]` in one transaction |
| Persisted transaction references it | ✅ | `Invoice.activityPackageId` `@unique`; `Voucher.activityPackageId` `@unique` |
| Summary displays package | ✅ | `packageInclude` returns items + invoice + voucher |
| **Invoice identifies it** | ⚠️ **split** | per-invoice PDF ✅ (`pdf.generator.ts:288-289, 340`); **consolidated statement ❌** — `activityPackage` count = 0 in `consolidated.controller.ts`, so the line renders `service: 'Service'`, `refNumber: ''` |
| Voucher identifies it | ✅ | `buildActivityPackageVoucherData` renders every item |
| **Reporting includes it** | ❌ | `activityPackage` count = **0** in `reports.controller.ts`; `loadReportRecords` queries 7 models and omits it |

The specific bugs hunted for — package invisible in UI, click does nothing, selection UI-only, backend ignores it, price doesn't reach the total, disappears from booking details — **none reproduce**. The two that do are the **downstream** ones: package revenue is invisible to reports, and its statement line is generic. → **REQ-BUG-12**

---

### REQ 11 — Offers and Packages are two different things — **PASS**

| Aspect | Result |
|---|---|
| Distinct entity concept | ✅ `Offer.kind` = `OFFER` \| `PACKAGE`, normalised by `offerKind()` (probe 1) |
| Admin separate creation flows | ✅ `offerAdminTab`, `openOfferForm(id, forcedKind)`; a PACKAGE renders the four-step component builder, an OFFER does not (`admin.html:6916, 6966-6994`) |
| Admin separate labels | ✅ "New Package"/"Edit Package" vs "New Offer"/"Edit Offer" |
| Client separate tabs | ✅ `setOfferClientTab('OFFER'\|'PACKAGE')` + two buttons (`dashboard.html:6129-6132, 6176-6179`) |
| Client separate data source | ✅ `GET /offers?activeOnly=true&kind=${kind}` — server-side filter, not a client array filter |
| API filtering | ✅ `if (kind) where.kind = offerKind(kind)` |
| Separate empty states | ✅ "No active packages" vs "No active offers" |
| Separate card rendering | ✅ packages get a components grid + price table, offers do not |
| An Offer cannot appear as a Package | ✅ `getActiveOffer` hard-filters `kind: 'OFFER'`, so the dashboard popup never shows a package |
| Publish/active state | ✅ `isActive` + `validFrom`/`validTo` window applied per tab |

The separation is real at every layer.
*Minor:* opening an existing **OFFER** while the PACKAGE tab is active resolves `kind` to PACKAGE (`o?.kind === "PACKAGE" || forcedKind === "PACKAGE"`), which would convert it on save. Only reachable if the id is opened from the wrong tab, which the tab-filtered list prevents. Logged as an edge case, not a REQ-11 failure.

---

### REQ 12 — Package content / builder — **FAIL**

The **structure** is there; the **connection** is not.

**Builder — PASS.** Four numbered tabs exactly as specified: `1 Hotels · 2 Transfers · 3 Activities · 4 Price periods` (`admin.html:6985-6990`), each with add/remove rows.

**Components — FAIL. They store decorative text, which is precisely what the requirement forbids.**

| Tab | Fields actually captured | Required | Verdict |
|---|---|---|---|
| Hotel | `name` (text), `hotelId` (**optional free-text box**), `nights`, `mealPlan` (**free text**) | hotel, room/rate, period, occupancy | ❌ no room/rate, no period, no occupancy; `hotelId` is typed by hand and validated against nothing |
| Transfer | `from` (text), `to` (text), `vehicleType` (**free text, labelled "Vehicle / notes"**) | selection, From, To, **rate/price**, inclusion | ❌ **no price and no rate reference at all** (probe 8: keys are exactly `from,to,vehicleType`) |
| Activity | `name` (text), `activityId` (**optional free-text box**), `date` (**free text**, e.g. "Day 2 or 2026-10-01") | selected activities persist and appear | ⚠️ persists; client shows only a **count**, never the names (only hotel names are listed) |
| Price | `validFrom`, `validTo`, `market`, `currency` (derived, readonly), `single`, `double`, `triple`, `child` | periods + occupancies + children | ⚠️ stored and validated, **never resolved** |

Probe 7 proves the free-text problem: `hotelId: 'not-a-real-id'` and `activityId: 'also-not-real'` are accepted verbatim. Nothing joins them to `Hotel`/`Activity`. → **REQ-BUG-08**, **REQ-BUG-09**

**Price resolution — FAIL, and this is the decisive finding.**

The requirement's central test is: *"Verify that selecting different dates/occupancies actually resolves the correct configured price."*

**There is no resolver.** Exhaustive search:

```
$ grep -rn "pricingPeriods" src/ --include=*.ts
  → only offers.controller.ts (write + echo) and demo fixtures
$ grep -rn "Offer" src/ (outside its own module)
  → only demo router
$ sed -n '/^model Offer/,/^}/p' prisma/schema.prisma | grep "@relation"
  → NO RELATIONS — Offer is standalone
```

No function anywhere takes `(package, date, occupancy) → price`. `Offer` has **zero** foreign keys. There is **no package booking, quote or cart path** — the only client action on a package card is `ctaAction → setPage(...)`, which navigates to a generic service page. A customer cannot buy a package, so no price is ever selected, resolved, calculated or stored.

**The required Period × Occupancy matrix is therefore unexecutable:**

| Case | Configured | Resolved by app | Result |
|---|---|---|---|
| Period A + Single | 100 | — | **BLOCKED — no resolver** |
| Period A + Double | 200 | — | **BLOCKED** |
| Period A + Triple | 300 | — | **BLOCKED** |
| Period A + Child | 40 | — | **BLOCKED** |
| Period B + Single | 110 | — | **BLOCKED** |
| Period B + Double | 220 | — | **BLOCKED** |
| Period B + Triple | 330 | — | **BLOCKED** |
| Period B + Child | 50 | — | **BLOCKED** |

What I *could* verify (probe 3) is that all 12 configured values survive the save byte-for-byte and stay distinct — so the false-PASS the requirement warns about ("every field exists but the resolver always returns one price") is ruled out: there is no resolver returning anything. → **REQ-BUG-02**

**Additional gap:** overlapping periods for the same market are accepted with no tie-break (probe 13), so even if a resolver were added the stored data is already ambiguous. → **REQ-BUG-17**

---

### REQ 13 — Package relationship integrity — **PARTIAL**

**The good news, stated plainly:** the package/offer implementation does **not** repeat the cruise catalogue's destructive pattern. `updateOffer` has **no `deleteMany`, no cascade, no id regeneration**. Components are a JSON column rewritten in place, and omitted keys fall back to the stored value:

```ts
hotelItems: hotelItems === undefined ? existing.hotelItems : hotelItems,   // :170
```

**Create → Read → edit title → Read again — PASS.** Probe 4: `packageData(packageData(x)) === packageData(x)`. The normaliser is idempotent, so a title-only edit round-trips Hotel A, Transfer X, Activity Y and Pricing Period P unchanged. The admin form re-populates every row from the loaded record and re-sends them (`admin.html:7015-7018`, `ofCollectPackageRows`), so the UI path preserves them too.

**Change only Transfer X → Transfer Z — PASS.** Hotel, activity and pricing arrays are independent keys; replacing one leaves the others untouched.

**Two real defects:**

1. **Silent row deletion on an unrelated edit.** `packageData` re-normalises and `.filter(Boolean)`s. A transfer missing its `to` is **dropped entirely** (probe 5); a hotel row with a blank name is dropped (probe 6). So editing the *title* of a package whose transfer was saved incomplete permanently deletes that transfer, with a 200 response. → **REQ-BUG-10**
2. **Edit trap.** `packageData` throws `PACKAGE_HOTEL_REQUIRED` when there are no hotel items (probe 12). Because `updateOffer` runs it on **every** PACKAGE update — including `toggleOffer`, which sends only `{isActive}` — a package that ever reaches a hotel-less state can never again be edited, activated or deactivated: every request returns 400. → **REQ-BUG-11**

Also noted: `jsonRows` caps arrays at `.slice(0, 100)`, so a package with more than 100 items of a type silently truncates on every save.

---

### REQ 14 — Published client data must match admin data — **PARTIAL**

**Cruise programme price — chain verified to display:**

| Stage | Value | Evidence |
|---|---|---|
| Admin input | 15,000 EGP, market EGYPTIAN | `admin.html:4847` (`Adult · per person`), currency readonly from market |
| Normalise | `market: EGYPTIAN`, `currency: EGP`, `singlePrice: 15000` | `cruise-catalogue.controller.ts:513-517` |
| DB | `CruiseProgrammeRate.singlePrice = 15000`, `currency = 'EGP'` | schema:1068-1080 |
| API | returned only to an EGYPTIAN-market caller | `applicableRates(..., cruiseMarket, date)` |
| Client display | `15,000 EGP · adult · per person` | `dashboard.html:1946` |
| Calculation (2 pax) | 30,000 EGP | `priceCruiseProgrammePerPerson` — probe 15 ✅ |
| **Stored quote** | **30,000 EGP — supplied by the browser, not recomputed** | `cruiseProductTotal` in `customFields` |

Every step matches **until the last one**, where the value stored is the client's own arithmetic rather than a server re-derivation. The number is right when the client is honest; nothing makes it right. → **REQ-BUG-01**

**Package price chain — breaks earlier:** admin → DB → API all carry the same values (probe 3), and the client renders them in a Single/Double/Triple/Child table. But `periods.slice(0, 3)` shows **at most three periods** (`dashboard.html:6157`) — a package with more has the rest silently invisible → **REQ-BUG-18** — and no booking calculation exists at all (REQ 12).

**Leak in the same chain:** the client filters periods to the company's market *in the browser*; the API returns **all** periods for **both** markets in the JSON. → **REQ-BUG-04**

---

### REQ 15 — Reload / state persistence — **BLOCKED**

Cannot be honestly answered without a database and a browser. Both are unavailable, and this requirement is specifically about runtime behaviour after a hard reload.

What I verified at source level instead (data round-trip, not UI state):

| Item | Source-level round-trip |
|---|---|
| programme, programme rate, cruise duration | ✅ real FK columns on `CruiseBooking`; re-read via `cruiseInclude` — **but see REQ 16/17: catalogue edits null them** |
| transfer inclusion, standalone transfer, From, To | ✅ persisted columns |
| supplements | ✅ `selectedSupplements` JSON snapshot |
| Egyptian/Foreign audience | ✅ derived from `Company.market` on every request, so it cannot go stale |
| Activity Package | ✅ real rows + `@unique` invoice/voucher links |
| Offer/Package type, Hotel/Transfer/Activity items, S/D/T/Child rates, price periods | ✅ idempotent JSON round-trip (probe 4); admin form re-populates every row from the record |

**Not verified:** that the admin form and client selection actually re-render these after F5 — that is DOM behaviour, and claiming a pass from source alone would be exactly the false positive the prompt warns against.

---

### REQ 16 — Edit regression tests — **FAIL**

| Harmless edit | Expected | Actual |
|---|---|---|
| **Change cruise description only** | nothing else changes | ❌ **the entire cabin fare table is destroyed** |
| Change programme name only | prices + transfer linkage stay | ❌ same cascade |
| Change package title only | components stay | ✅ **PASS** (probe 4) — except incomplete rows are dropped (REQ-BUG-10) |

**Re-verified at current HEAD, unchanged:**

The admin cruise form re-publishes the schedule set on **every** save, whatever field was touched:
```js
if (cruiseCatalogue && savedId) {
  const scheduleRes = await apiFetch(`/cruises/${savedId}/schedules`, { method: "PUT", ... });   // admin.html:2162
```
`saveCruiseSchedules` then runs `tx.cruiseSchedule.deleteMany({ where: { cruiseId } })` (`:219`). Since `saveCruiseRates` *requires* every fare to carry a `scheduleId` (`:133`), **all** cabin rates hang off a schedule, and the schema cascades:

```
CruiseCabinRate.schedule     onDelete: Cascade
CruiseProgramme.schedule     onDelete: Cascade
CruiseTransferRate.schedule  onDelete: Cascade
CruiseBooking.schedule       onDelete: SetNull
```
Programmes and transfers are re-materialised; **cabin fares are not**, and every re-created row gets a new id. → **REQ-BUG-06**

Separately, `saveCruiseSharedCatalogue` still calls `materialiseSharedCatalogue(tx, catalogue)` with **no cruise scope** (`:611`), so `deleteMany({})` wipes programmes and transfer rates for **every boat** (`:484-485`). → **REQ-BUG-05**

---

### REQ 17 — Existing bookings as immutable commercial history — **PARTIAL**

**Money — PASS.** A cruise booking snapshots `adultUnitPrice`, `childUnitPrice`, `occupancy`, `cabinType`, `totalAmount`, `currency`, `sourceAmount`, `exchangeRate` on its own row. Raising a programme from 500 to 600 does **not** touch an existing booking: nothing in `saveCruiseProgrammes` or the shared catalogue writes to `CruiseBooking`. A booking sold at 500 × 2 keeps 1,000. ✅

**Relationships — FAIL.** The requirement explicitly forbids catalogue maintenance erasing programme, programme rate, schedule, transfer, From/To, occupancy or supplements from an existing transaction. Confirmed at current HEAD, `CruiseBooking` carries five `SetNull` foreign keys:

```
cabinRateId · programmeId · programmeRateId · transferRateId · scheduleId   → all onDelete: SetNull
```

So a routine catalogue save nulls all five on every existing booking. What survives is the money and the denormalised `transferFromName`/`transferToName` text; what is lost is *which* programme, *which* rate, *which* sailing leg and *which* vehicle product was sold. `occupancy` and `selectedSupplements` survive (own columns).

Contrast: `CruiseBookingActivity` **does** snapshot `name`/`description` precisely so a voucher still reads correctly after a catalogue entry is renamed (schema:1220-1222) — the programme and transfer were never given the same treatment. → **REQ-BUG-05**, **REQ-BUG-06**

---

### REQ 18 — Frontend cannot be the authority — **FAIL**

| Tampering attempt | Booking API (SUPERADMIN) | Quote API (agent) |
|---|---|---|
| Egyptian account sends a FOREIGN rate id | ✅ rejected (`RATE_NOT_AVAILABLE`) | ❌ stored |
| 3-night sailing + 4-night programme id | ✅ rejected | ❌ stored |
| Programme + standalone transfer | ✅ transfer dropped | ❌ both stored |
| Altered transfer price | ✅ ignored — resolved from the rate | ❌ `cruiseTransferTotal` stored as sent |
| Altered pax count | ✅ floored/derived (probe 12) | ❌ stored as sent |
| Wrong supplement amount | ✅ ignored — amount read from the rate | ❌ names only, no amounts validated |
| Price directly in the body | ✅ not accepted (transport); cruise `totalAmount` only when no rate row exists | ❌ `cruiseProductTotal` accepted |
| Package item id not selected | n/a — no package booking exists | n/a |
| Inactive offer / expired period | ❌ not applicable — no package purchase path |

**The verdict turns on which path a customer actually uses.** The booking API is genuinely server-authoritative and passes every tampering test. But agents are *routed away from it* (`USE_QUOTE_REQUEST`), and the quote endpoint they are sent to reconstructs nothing:

```ts
const customFields = sanitizeCustomFields(body.customFields);   // type-checks primitives only
// …only cruiseScheduleId + calendar dates are validated…
customFields: customFields ?? undefined,                        // stored verbatim
```

`sanitizeCustomFields` enforces *shape* (≤40 flat primitive keys), never *business truth*. For the customer-facing cruise flow the frontend is the authority. → **REQ-BUG-01**

---

### REQ 19 — Test real calculations, not only structure — **PASS**

50 probes with deliberately unique values so a wrong rule cannot look right:

| Set | Single | Double | Triple | Child |
|---|---|---|---|---|
| 3-night Egyptian (EGP) | 13,111 | 12,222 | 11,333 | 9,444 |
| 3-night Foreign (USD) | 611 | 522 | 433 | 344 |
| 4-night Egyptian (EGP) | 17,111 | 16,222 | 15,333 | 13,444 |
| 4-night Foreign (USD) | 811 | 722 | 633 | 544 |
| Package Period A (USD) | 100 | 200 | 300 | 40 |
| Package Period B (USD) | 110 | 220 | 330 | 50 |
| Package Period A (EGP) | 5,100 | 5,200 | 5,300 | 540 |
| Standalone transfer | 777/vehicle | | | |
| Supplements | 77 fixed · 10% · 900 total-price | | | |

Every cruise assertion resolved to its own distinct value — 3-night double (1,044) vs 4-night double (1,444) proves the correct row fired, not a constant. All 12 package values survived save distinct. No file, schema or config was touched; probes live outside the repo.

---

### REQ 20 — Cross-module trace — **PARTIAL**

**Cruise → Schedule → Programme → Rate → Audience → Occupancy → Supplement → Transfer → Quote/Booking → Invoice**
✅ intact on the SUPERADMIN booking path. ❌ On the agent quote path the chain is not reconstructed (REQ-BUG-01), and ❌ the Programme/Rate/Transfer/Schedule links are destroyed by catalogue edits (REQ-BUG-05/06).

**Standalone Transfer → From → To → Price → Operations**
✅ intact — `cruiseTransferOperation()` surfaces `fromName`/`toName`/vehicle/pax into the ops queue. ⚠️ pax is client-supplied; ⚠️ cancelled parents are not filtered out of that queue.

**Activity → Activity Package → Client → Booking → Invoice → Voucher → Reports**
✅ through Voucher. ❌ **Reports** (module absent) and ❌ **consolidated statement** (unlabelled line). → REQ-BUG-12

**Package → Hotel → Transfer → Activity → Price Period → Occupancy → Client display**
❌ broken at the first hop: components are unvalidated free text with no foreign keys, the transfer has no price, and no occupancy/period resolution exists. → REQ-BUG-02/08/09

---

## 4. Required test matrix

| ID | Requirement | Scenario | Expected | Actual | Result | Evidence |
|---|---|---|---|---|---|---|
| T-01 | 1 | All 7 markets → audience | 2 buckets | 2 buckets | PASS | probe 1 |
| T-02 | 1 | EGYPTIAN row for FOREIGN caller | not applicable | not applicable | PASS | probe 2 |
| T-03 | 1 | FOREIGN row for EGYPTIAN caller | not applicable | not applicable | PASS | probe 3 |
| T-04 | 1 | Agent reads `/cruises/:id/rates` | own tariff only | **both tariffs + inactive** | **FAIL** | routes:26 |
| T-05 | 1 | Agent reads `/cruises/:id/programmes` | own tariff only | **both tariffs** | **FAIL** | routes:30 |
| T-06 | 1 | Agent reads `/cruises/:id/transfer-rates` | own tariff only | **both markets** | **FAIL** | routes:32 |
| T-07 | 1 | `GET /cruises` list | filtered | filtered | PASS | ctrl:132-135 |
| T-08 | 2 | Programme → transfer selector hidden | hidden | hidden | PASS | dash:2030 |
| T-09 | 2 | Programme + transferRateId (booking API) | no double charge | dropped silently | PASS | ctrl:466 |
| T-10 | 2 | Programme + transfer (quote API) | rejected | **both stored** | **FAIL** | quote:148-170 |
| T-11 | 2 | `transferIncluded` overrides payload | no add-on | no add-on | PASS | probe 20 |
| T-12 | 3 | 3-night schedule + 4-night programme (booking) | rejected | rejected | PASS | ctrl:360-368 |
| T-13 | 3 | Same, quote API | rejected | **accepted** | **FAIL** | quote:148 |
| T-14 | 3 | Omit `cruiseScheduleId` entirely | still validated | **no validation at all** | **FAIL** | quote:151 |
| T-15 | 3 | Programme materialised onto wrong nights | impossible | impossible | PASS | cat:494-496 |
| T-16 | 4 | Double 12,222 × 2 adults | 24,444 | 24,444 | PASS | probe 6 |
| T-17 | 4 | Triple 433 × 3 adults | 1,299 | 1,299 | PASS | probe 7 |
| T-18 | 4 | Single 611 × 1 adult | 611 | 611 | PASS | probe 8 |
| T-19 | 4 | 2 adults + 1 child | 1,388 | 1,388 | PASS | probe 9 |
| T-20 | 4 | "per person" stated in UI | stated | stated (EN+AR) | PASS | dash:1662 |
| T-21 | 4 | "per cabin"/"cabin total" language | absent | absent | PASS | grep = 0 |
| T-22 | 4 | Post adultsCount 0 | floored to 1 | floored to 1 | PASS | probe 12 |
| T-23 | 4 | Occupancy not sold | refused | null, not 0 | PASS | probe 13 |
| T-24 | 5 | Legacy INTERNATIONAL | → FOREIGN | → FOREIGN | PASS | probe 4 |
| T-25 | 5 | Legacy GULF | no 3rd bucket | unreachable | PASS | probe 5 |
| T-26 | 6 | `[A,B]` vs `[B,A]` FIXED | equal | equal | PASS | probe 6 |
| T-27 | 6 | `[FIXED,TOTAL]` vs `[TOTAL,FIXED]` | equal | **1800 vs 1900** | **FAIL** | probe 8 |
| T-28 | 6 | % after TOTAL_PRICE | % of new total | % of old base | **FAIL** | probe 9 |
| T-29 | 6 | Duplicate supplement | once / refused | **twice** | **FAIL** | probe 10 |
| T-30 | 6 | Wrong-currency FIXED | refused | refused | PASS | probe 11 |
| T-31 | 6 | Wrong-currency PERCENTAGE | refused | **accepted** | **FAIL** | probe 12 |
| T-32 | 6 | Expired supplement | refused | **concept absent** | BLOCKED | probe 15 |
| T-33 | 6 | Supplement for wrong rate | filtered | filtered | PASS | ctrl:420-423 |
| T-34 | 7 | Default no-programme transfer | none | none | PASS | probe 19 |
| T-35 | 7 | 12 pax / 6-seater | 2 vehicles | 2 vehicles, 1,554 | PASS | probe 16 |
| T-36 | 7 | Client-supplied transferPaxCount | server-derived | **client-supplied** | **FAIL** | ctrl:465 |
| T-37 | 8 | From→To persisted to operations | preserved | preserved | PASS | transfer-operations.ts |
| T-38 | 8 | From with no To | refused | **From→From** | **FAIL** | probe 18 |
| T-39 | 9 | Cruise tours in client UI | absent | absent | PASS | grep = 0 |
| T-40 | 9 | Cruise tours in API | absent | **live + chargeable** | **FAIL** | ctrl:466-470 |
| T-41 | 10 | Package visible to client | visible | visible | PASS | dash:4459 |
| T-42 | 10 | Package price server-side | server | server (no client price) | PASS | pkg-ctrl:196-280 |
| T-43 | 10 | Package on invoice PDF | identified | identified | PASS | pdf:288-289 |
| T-44 | 10 | Package on statement | identified | **generic "Service"** | **FAIL** | consolidated = 0 hits |
| T-45 | 10 | Package in reports | counted | **absent** | **FAIL** | reports = 0 hits |
| T-46 | 11 | Offer vs Package separate tabs | separate | separate | PASS | dash:6129 |
| T-47 | 11 | Server-side kind filter | filtered | filtered | PASS | offers:64 |
| T-48 | 11 | Package in offer popup | excluded | excluded | PASS | offers:239 |
| T-49 | 12 | Period × occupancy resolution | resolves | **no resolver exists** | **FAIL** | grep |
| T-50 | 12 | Package transfer price | present | **no price field** | **FAIL** | probe 8 |
| T-51 | 12 | hotelId/activityId validated | validated | **free text** | **FAIL** | probe 7 |
| T-52 | 12 | 12 configured values distinct | distinct | distinct | PASS | probe 3 |
| T-53 | 12 | Overlapping periods | tie-break | **both stored** | **FAIL** | probe 13 |
| T-54 | 13 | Title-only edit preserves all | preserved | preserved | PASS | probe 4 |
| T-55 | 13 | Edit with incomplete transfer | preserved/flagged | **deleted** | **FAIL** | probe 5 |
| T-56 | 13 | Toggle a hotel-less package | works | **400 forever** | **FAIL** | probe 12 |
| T-57 | 14 | Admin→DB→API→client price | identical | identical | PASS | trace §REQ14 |
| T-58 | 14 | Stored quote total | server-derived | **client-supplied** | **FAIL** | dash:2299 |
| T-59 | 14 | >3 package periods shown | all | **first 3 only** | **FAIL** | dash:6157 |
| T-60 | 15 | Hard-reload persistence | persists | — | BLOCKED | no browser/DB |
| T-61 | 16 | Cruise description-only edit | no side effects | **fare table destroyed** | **FAIL** | admin:2162 |
| T-62 | 16 | Package title-only edit | no side effects | preserved | PASS | probe 4 |
| T-63 | 17 | Price raise vs old booking | snapshot kept | snapshot kept | PASS | schema:1146-1152 |
| T-64 | 17 | Catalogue edit vs booking links | preserved | **5 FKs nulled** | **FAIL** | schema SetNull ×5 |
| T-65 | 18 | Tampering, booking API | rejected | rejected | PASS | §REQ18 |
| T-66 | 18 | Tampering, quote API | rejected | **accepted** | **FAIL** | §REQ18 |
| T-67 | 19 | Distinct values prove the rule | distinct | distinct | PASS | 50 probes |
| T-68 | 20 | Package → components trace | connected | **free text** | **FAIL** | §REQ20 |

**68 scenarios · 34 PASS · 30 FAIL · 2 BLOCKED · (2 counted within PARTIAL requirements)**

---

## 5. Special Nile Cruise matrix

Pricing source is always: **audience from `Company.market` → programme rate (if programme) else cabin rate → per-person × heads → supplements → optional transfer**.

| Duration | Audience | Occupancy | Programme? | Transfer | Suppl. | Expected pricing source | Result |
|---|---|---|---|---|---|---|---|
| 3n | Egyptian | Single | No | No | No | cabin rate EGP `singlePrice` × 1 | PASS |
| 3n | Egyptian | Double | No | No | No | cabin rate EGP `doublePrice` × 2 = 24,444 | PASS |
| 3n | Egyptian | Triple | No | No | No | cabin rate EGP `triplePrice` × 3 | PASS |
| 3n | Foreign | Single | No | No | No | cabin rate USD 611 × 1 | PASS |
| 3n | Foreign | Double | No | No | No | cabin rate USD 522 × 2 = 1,044 | PASS |
| 3n | Foreign | Triple | No | No | No | cabin rate USD 433 × 3 = 1,299 | PASS |
| 4n | Egyptian | Single | No | No | No | 4-night EGP row, distinct from 3n | PASS |
| 4n | Egyptian | Double | No | No | No | 4-night EGP row × 2 | PASS |
| 4n | Egyptian | Triple | No | No | No | 4-night EGP row × 3 | PASS |
| 4n | Foreign | Single | No | No | No | 4-night USD 811 × 1 | PASS |
| 4n | Foreign | Double | No | No | No | 4-night USD 722 × 2 = 1,444 | PASS |
| 4n | Foreign | Triple | No | No | No | 4-night USD 633 × 3 | PASS |
| 3n | Egyptian | n/a | **Yes** | included | No | programme EGP adult × heads | PASS |
| 3n | Foreign | n/a | **Yes** | included | No | programme USD adult × heads | PASS |
| 4n | Egyptian | n/a | **Yes** | included | No | 4-night programme, schedule-bound | PASS |
| 4n | Foreign | n/a | **Yes** | included | No | 4-night programme, schedule-bound | PASS |
| 3n | Foreign | Double | No | **Yes** | No | cabin × 2 + transfer/vehicle × vehicles | PASS |
| 3n | Foreign | Double | No | Yes | No | *transfer pax is client-supplied* | **FAIL** (T-36) |
| 3n | Foreign | Double | No | No | **Yes** | cabin × 2 + per-person supplement | PASS |
| 3n | Foreign | Double | No | No | **2 suppl.** | order-independent total | **FAIL** if one is TOTAL_PRICE (T-27) |
| 3n | Foreign | n/a | Yes | **+ standalone** | No | programme only, transfer dropped | PASS (booking) / **FAIL** (quote) |
| 3n | any | any | 4-night programme | — | — | rejected | PASS (booking) / **FAIL** (quote) |

*Occupancy is marked n/a for programmes: a programme is deliberately one per-traveller price with no sharing basis, so Single/Double/Triple do not apply — combinations that the product does not support were not fabricated.*

---

## 6. Required transfer matrix

| Programme Selected | Programme Includes Transfer | Standalone Requested | Expected Charge | Actual | Result |
|---|---|---|---|---|---|
| YES | YES | NO | programme only | programme only | **PASS** |
| YES | YES | **YES** | programme only, no duplicate | booking API: transfer dropped | **PASS** |
| YES | YES | **YES** | programme only, no duplicate | **quote API: both stored** | **FAIL** |
| NO | n/a | NO | cruise only | cruise only | **PASS** |
| NO | n/a | YES | cruise + standalone at its own price | cruise + `CruiseTransferRate` price | **PASS** |
| NO | n/a | YES, From only | refused | **From → From fabricated** | **FAIL** |

---

## 7. Required Offers / Packages matrix

| Entity | Admin Create | Admin Reload | Client Visible | Correct Tab | Components Persist | Correct Price | Result |
|---|---|---|---|---|---|---|---|
| **OFFER** | ✅ own flow | ✅ (source round-trip; DOM BLOCKED) | ✅ | ✅ `kind=OFFER` | n/a (offers carry no components) | n/a | **PASS** |
| **PACKAGE** | ✅ 4-tab builder | ✅ (source round-trip; DOM BLOCKED) | ✅ | ✅ `kind=PACKAGE` | ⚠️ persist as **free text**; incomplete rows silently dropped | ❌ **never resolved — no resolver, no purchase path** | **FAIL** |

---

## 8. Confirmed bugs

### REQ-BUG-01 — The agent's only cruise path performs no business validation: programme, rate, transfer and every price are client-authored

**Severity:** BLOCKER · **Requirement:** 2, 3, 14, 18 · **Confidence:** Confirmed
**Module:** Quote Requests · **Related:** Nile Cruise, Pricing, Invoicing, Reports

#### Requirement
REQ 18: *"Backend independently reconstructs or validates the business transaction. A UI restriction without backend enforcement is FAIL."* REQ 3: a programme must belong to the selected sailing. REQ 2: programme + standalone transfer must never double-charge.

#### Preconditions
Any AGENT/COMPANY_ADMIN token. Agents cannot use the booking API — `createCruiseBooking` returns `USE_QUOTE_REQUEST` for anyone who is not SUPERADMIN (`cruise.controller.ts:263-270`), so this is their **only** cruise path.

#### Steps to Reproduce
1. `POST /api/quote-requests` with `serviceType: "CRUISE"`, `cruiseId`, and `customFields` containing a 3-night `cruiseScheduleId` alongside a **4-night** `cruiseProgrammeId`, a foreign `cruiseRateId` for an Egyptian company, **both** `cruiseProgrammeId` and `cruiseTransferRateId`, and `cruiseProductTotal: 1`.
2. Read the stored quote.
3. Repeat while simply **omitting `cruiseScheduleId`** — now even the dates are not checked.

#### Expected Business Behaviour
The server re-derives the commercial transaction from the catalogue: verify the programme belongs to the schedule, the rate belongs to the programme and the audience, drop a transfer when a programme is chosen, and recompute the total.

#### Actual Behaviour
`createQuoteRequest` validates exactly two things — that `cruiseScheduleId` belongs to `cruiseId` and is active, and that `checkIn`/`checkOut` match that leg's departure day, night count and return day (`quote-requests.controller.ts:148-170`). Everything else is stored verbatim:

```ts
const customFields = sanitizeCustomFields(body.customFields);
const cruiseScheduleId = body.serviceType === 'CRUISE' ? String(customFields?.cruiseScheduleId ?? '').trim() : '';
if (cruiseScheduleId) { /* …the only cruise checks… */ }
…
customFields: customFields ?? undefined,
```

The client computes and posts the whole commercial selection (`dashboard.html:2290-2308`):
`cruiseProgrammeId`, `cruiseProgrammeName`, `cruiseRateId`, `cruiseOccupancy`, `cruiseAdultUnitPrice`, `cruiseChildUnitPrice`, `cruiseCurrency`, `cruiseProductTotal`, `cruiseSupplements`, `cruiseTransferRateId`, `cruiseTransferVehicleCount`, `cruiseTransferPricePerVehicle`, `cruiseTransferTotal`.

`sanitizeCustomFields` enforces **shape only** — ≤40 flat primitive keys, strings truncated at 2,000 chars (`shared/helpers.ts:88-125`). It has no notion of a programme, a rate or a price. The `if (cruiseScheduleId)` gate means omitting one field disables all cruise validation.

#### Business Impact
Every cruise enquiry an agency submits carries numbers the platform never checked. Operations quotes from a record that can name a programme not sold on that sailing, an occupancy not offered, a transfer that should be included in the fare, and a total of the agency's choosing. The booking API's careful guards are bypassed simply by using the route agents are told to use.

#### Cross-Module Impact
Nile Cruise (programme/rate/schedule integrity), Transport (a transfer that should be included reaches the ops queue as separate work), Pricing (audience never enforced), Invoicing and Reports (an admin quoting from these figures propagates them).

#### Data Impact
`QuoteRequest.customFields` holds unvalidated commercial data indistinguishable from validated data. Nothing marks it as client-asserted.

#### Evidence
`src/modules/quote-requests/quote-requests.controller.ts:148-170, 240`; `src/shared/helpers.ts:88-125`; `public/dashboard.html:2290-2310`; `src/modules/nile-cruise/cruise.controller.ts:263-270` (the redirect that makes this the only path).

#### Root Cause Hypothesis
The cruise selector was built to feed a *quote* — historically a free-text enquiry where an admin priced everything by hand. It was then upgraded to carry a fully priced product selection, but `createQuoteRequest` was only taught the one rule that could break a calendar (schedule vs dates). The generic `customFields` bag made adding rich data possible without adding validation.

#### Regression Risk
Adding validation here will reject quotes the UI currently produces if any client-side computation disagrees with the server — expect a migration/compatibility question for quotes already stored. Validating `cruiseProgrammeId` against the schedule will also surface historical rows whose programme was later deleted by REQ-BUG-05/06.

---

### REQ-BUG-02 — Package pricing periods and Single/Double/Triple/Child rates never resolve into anything

**Severity:** BLOCKER · **Requirement:** 12, 20 · **Confidence:** Confirmed
**Module:** Offers/Packages · **Related:** Hotels, Transport, Activities, Invoicing

#### Requirement
REQ 12: *"Verify that selecting different dates/occupancies actually resolves the correct configured price."* REQ 20: `Package → Hotel → Transfer → Activity → Price Period → Occupancy Rates → Client display`.

#### Steps to Reproduce
1. Create a package with Period A (100/200/300/40) and Period B (110/220/330/50).
2. As a client, open Packages and attempt to select a date and an occupancy.
3. Search the codebase for anything that resolves a package price.

#### Expected Business Behaviour
Choosing a travel date and an occupancy returns that period's configured amount, which flows into a request/booking total.

#### Actual Behaviour
No selection is possible and no resolver exists:
```
grep -rn "pricingPeriods" src/ --include=*.ts   → offers.controller.ts only (write + echo)
grep -rn "Offer" src/ (outside its module)      → demo router only
model Offer … @relation                          → none; Offer has zero foreign keys
```
The client renders a read-only table of up to three periods; the only action on a package card is `ctaAction → setPage(...)`, which navigates to a generic service page. There is no package cart, quote, booking, invoice or voucher. The 8-cell Period × Occupancy matrix required by REQ 12 is unexecutable.

#### Business Impact
Packages are a catalogue brochure, not a sellable product. Every configured price is decorative; no revenue can be attributed to a package; the four-tab builder implies a capability the system does not have.

#### Cross-Module Impact
No link to Hotels, Transport, Activities, Invoicing, Wallet or Reports.

#### Data Impact
`Offer.pricingPeriods` is validated on write (probe 3 confirms all 12 values persist distinct) and read by nothing but the display.

#### Evidence
`src/modules/offers/offers.controller.ts:25-44`; `prisma/schema.prisma` `model Offer` (no relations); `public/dashboard.html:6148-6165`; searches above.

#### Root Cause Hypothesis
The package builder was delivered as an admin/marketing surface first, with the purchase path deferred. `Offer` was reused as the storage model, and it was never designed to be a transactable entity.

#### Regression Risk
Adding a purchase path means giving `Offer` real relations and a resolver; the existing free-text `hotelId`/`activityId` values (REQ-BUG-08) will not join to anything, so historical packages will need re-entry.

---

### REQ-BUG-03 — Cruise rate, programme and transfer endpoints expose both audiences' prices to any agent

**Severity:** CRITICAL · **Requirement:** 1 (security rule) · **Confidence:** Confirmed
**Previous report:** BUG-11 — **STILL PRESENT**, unchanged at `bf8f831`

#### Requirement
*"A customer/agency must see ONLY the price applicable to them… Do not accept 'the UI hides it' if the API still exposes it."*

#### Steps to Reproduce
As an AGENT of a FOREIGN-market company: `GET /api/cruises` (prices correctly filtered), then `GET /api/cruises/:id/rates`, `/programmes`, `/transfer-rates`.

#### Actual Behaviour
```ts
export async function listCruiseRates(req, res) {
  const rates = await prisma.cruiseCabinRate.findMany({
    where: { cruiseId: req.params.id },       // ← the only condition
    orderBy: [...] });
  res.json({ success: true, data: rates });
}
```
Identical in `listCruiseProgrammes` (`:613`) and `listCruiseTransferRates` (`:707`). The routes carry no `requireRole` (`cruise.routes.ts:26, 30, 32`). No market filter, no `showPriceToAgents` check, no `isActive` filter — a foreign agency reads the Egyptian EGP tariff, unpublished fares and deactivated rows. `listCruises` does all three correctly (`cruise.controller.ts:132-135`), so the same numbers are protected on one endpoint and served on its sibling. The parallel hotel endpoint **is** admin-only (`hotels.routes.ts:66`), which shows the intended standard.

#### Business Impact
Margin structure between the Egyptian and foreign books is directly readable by any agency.

#### Evidence
`src/modules/nile-cruise/cruise-catalogue.controller.ts:104-110, 613-621, 707-713`; `src/modules/nile-cruise/cruise.routes.ts:26-33`.

#### Regression Risk
The agent booking form reads these endpoints; gating them requires `listCruises`' filtered output to cover the form's needs first.

---

### REQ-BUG-04 — The Offers API returns the other market's package prices; only the browser filters them

**Severity:** HIGH · **Requirement:** 1 (security rule), 11 · **Confidence:** Confirmed · **NEW**

#### Steps to Reproduce
As an EGYPTIAN-market company: `GET /api/offers?activeOnly=true&kind=PACKAGE` and inspect the raw JSON.

#### Actual Behaviour
`listOffers` returns whole `Offer` rows with no market awareness — `market` appears in `offers.controller.ts` only inside `packageData` (the **write** path). The client alone filters:
```js
const periods = (o.pricingPeriods || []).filter(period =>
  (period.market === "EGYPTIAN" ? "EGYPTIAN" : "FOREIGN") === companyMarket);   // dashboard.html:6148
```
So an Egyptian agency's browser receives every FOREIGN USD package price, and vice versa. This is exactly the pattern the requirement names: the UI hides it, the API exposes it.

#### Evidence
`src/modules/offers/offers.controller.ts:56-95` (no market filter); `public/dashboard.html:6148`.

#### Regression Risk
Filtering server-side changes the payload shape the card renderer expects.

---

### REQ-BUG-05 — Saving the shared cruise catalogue deletes every programme and transfer rate on every boat

**Severity:** BLOCKER · **Requirement:** 16, 17 · **Confidence:** Confirmed
**Previous report:** BUG-01 — **STILL PRESENT**, unchanged

`saveCruiseSharedCatalogue` calls `materialiseSharedCatalogue(tx, catalogue)` with **no `onlyCruiseId`** (`:611`), so both statements run unscoped:
```ts
await tx.cruiseProgramme.deleteMany({ where: onlyCruiseId ? { cruiseId: onlyCruiseId } : {} });    // :484
await tx.cruiseTransferRate.deleteMany({ where: onlyCruiseId ? { cruiseId: onlyCruiseId } : {} }); // :485
```
`CruiseBooking.programmeId`, `.programmeRateId` and `.transferRateId` are all `onDelete: SetNull`, so **every existing cruise booking on every boat loses its programme, its rate and its transfer** on any catalogue save. Rows are re-created with new ids, so nothing re-links. Directly violates REQ 17 ("do not allow admin catalogue maintenance to erase from an existing transaction: programme, programme rate, schedule, transfer…"). Money survives; the relationship history does not.

**Evidence:** `cruise-catalogue.controller.ts:478-486, 611`; `schema.prisma` `CruiseBooking` five `SetNull` FKs.
**Regression risk:** scoping the delete changes cross-boat catalogue semantics; snapshotting descriptors on the booking (as `CruiseBookingActivity` already does) is the lower-risk direction.

---

### REQ-BUG-06 — Editing any cruise field destroys its whole cabin fare table and unlinks every booking

**Severity:** BLOCKER · **Requirement:** 16, 17 · **Confidence:** Confirmed
**Previous report:** BUG-02 — **STILL PRESENT**, unchanged

REQ 16 states explicitly: *"Change Cruise description only → Expected: NO change to schedule, programme, programme rates, transfer, cabin/occupancy rates, supplements, existing bookings."*

The admin form re-publishes schedules on **every** save (`admin.html:2162`), `saveCruiseSchedules` runs `cruiseSchedule.deleteMany({ where: { cruiseId } })` (`:219`), and because every fare must carry a `scheduleId` (`:133`) the four `Cascade` relations wipe cabin rates, programmes and transfer rates while `CruiseBooking.scheduleId`/`cabinRateId` go to `SetNull`. Programmes and transfers are re-materialised; **cabin fares are not** — the client re-POSTs them as new rows with new ids.

**Evidence:** `public/admin.html:2159-2181`; `cruise-catalogue.controller.ts:133, 219, 250`; `schema.prisma:1013, 1044, 1101, 1149`.
**Regression risk:** if the intermediate rate save fails the boat is left with schedules and no prices at all — the UI already has a message for that state.

---

### REQ-BUG-07 — Supplement order changes the price; percentages use the pre-supplement base

**Severity:** HIGH · **Requirement:** 6 (explicit invariant) · **Confidence:** Confirmed
**Previous report:** BUG-24 — **STILL PRESENT**

REQ 6: *"The final amount must NOT change merely because the frontend sends selected supplements in a different array order."*

```ts
if (supplement.type === 'PERCENTAGE')        total = total.add(base.mul(amount).div(100));  // always the ORIGINAL base
else if (supplement.type === 'FIXED_AMOUNT') total = total.add(amount.mul(heads));
else if (supplement.type === 'TOTAL_PRICE')  total = amount.mul(heads);                     // REPLACES the running total
```
Probes 8-9 on a 1,000 base, 2 pax:
- `[FIXED 50, TOTAL_PRICE 900]` → **1,800** (the 50/person is silently discarded)
- `[TOTAL_PRICE 900, FIXED 50]` → **1,900**
- `[TOTAL_PRICE 900, PERCENT 10]` → **1,900** (10% of 1,000, not of 1,800 — 1,980 expected)

The client controls the array order via `body.selectedSupplements`, so the same two selections produce two different prices.
**Evidence:** `src/shared/cruise-rates.ts:262-277`. **Regression risk:** fixing the base changes totals on existing quotes; any correction needs a decision on whether TOTAL_PRICE is exclusive of other supplements.

---

### REQ-BUG-08 — Package components are unvalidated free text with no foreign keys

**Severity:** HIGH · **Requirement:** 12, 13, 20 · **Confidence:** Confirmed · **NEW**

REQ 12: *"The final package must connect these components rather than storing only decorative text."*

The builder captures a hotel as `{name, hotelId?, nights, mealPlan}` where `hotelId` is an **optional free-text input** the admin types by hand (`admin.html:7059-7063`), and an activity as `{name, activityId?, date}` with `date` free text ("Day 2 or 2026-10-01"). `packageData` accepts both verbatim — probe 7 stores `hotelId: 'not-a-real-id'` and `activityId: 'also-not-real'` without complaint. `mealPlan` is free text rather than a `MealPlanOption` code; `vehicleType` is free text labelled "Vehicle / notes" rather than the `VehicleType` enum. `Offer` has no relations, so nothing can join.

Consequently REQ 12's hotel sub-requirements (room/rate, period, occupancy) have no representation at all.
**Evidence:** `offers.controller.ts:9-24`; `admin.html:7057-7078`; probe 7.

---

### REQ-BUG-09 — A package transfer has no price and no rate reference

**Severity:** HIGH · **Requirement:** 12 · **Confidence:** Confirmed · **NEW**

REQ 12 requires a package transfer to carry *"transfer selection, From, To, rate/price, inclusion in package"*. Probe 8 shows the stored keys are exactly `from`, `to`, `vehicleType` — **no price, no currency, no `transportRateId`**. The transfer tab collects three text boxes. A package's transport component is therefore unpriceable and unlinked to the transport catalogue.
**Evidence:** `offers.controller.ts:14-19`; `admin.html:7066-7071`; probe 8.

---

### REQ-BUG-10 — An unrelated package edit silently deletes incomplete component rows

**Severity:** MEDIUM · **Requirement:** 13 · **Confidence:** Confirmed · **NEW**

`packageData` re-normalises on every update and `.filter(Boolean)`s. A transfer saved with a From but no To is **dropped entirely** (probe 5); a hotel row with a blank name is dropped (probe 6). Because `updateOffer` runs `packageData` on every PACKAGE write — including a title-only PATCH — an ordinary edit permanently deletes those rows and returns 200. This is the *"ordinary admin edit destroys already-published package relationships"* case REQ 13 asks about; it is milder than the cruise cascade but real.
**Evidence:** `offers.controller.ts:9-24, 170-176`; probes 5-6.

---

### REQ-BUG-11 — A package with no hotel can never be edited, activated or deactivated

**Severity:** MEDIUM · **Requirement:** 13 · **Confidence:** Confirmed · **NEW**

`packageData` throws `PACKAGE_HOTEL_REQUIRED` when `hotelItems` is empty (probe 12). `updateOffer` calls it on **every** PACKAGE update, and `toggleOffer` sends only `{isActive}` — which falls back to `existing.hotelItems`. If that is empty or null (a record created before this validation, or an OFFER whose `kind` was flipped), every subsequent write returns 400. The package becomes permanently frozen, including the ability to deactivate it.
**Evidence:** `offers.controller.ts:38, 165-176`; `admin.html:7157`.

---

### REQ-BUG-12 — Activity Package revenue is absent from reports and unlabelled on statements

**Severity:** HIGH · **Requirement:** 10, 20 · **Confidence:** Confirmed
**Previous report:** BUG-17 — **STILL PRESENT**

Re-verified at HEAD: `grep -c activityPackage` returns **0** in both `reports.controller.ts` and `consolidated.controller.ts`. `loadReportRecords` queries seven models (booking, activityBooking, transportBooking, cruiseBooking, visaApplication, airportReception, simRequest) and omits `activityPackage`, so package sales appear in no count and no revenue figure. `sourceInclude` omits it too, so `invoiceLine` falls through every branch and writes `service: 'Service'`, `refNumber: ''` — persisted into `ConsolidatedInvoiceLine` and rendered into the PDF and Excel.

The per-invoice PDF **does** handle packages (`pdf.generator.ts:288-289, 340`), so this is specifically the two aggregators.
**Evidence:** `reports.controller.ts:35-115`; `consolidated.controller.ts:9-80`.

---

### REQ-BUG-13 — The old Nile Cruise tour add-ons are gone from the UI but still live and chargeable in the API

**Severity:** MEDIUM · **Requirement:** 9 · **Confidence:** Confirmed

REQ 9 asks to distinguish unused legacy code from active old logic. This is **active**: `createCruiseBooking` still accepts `body.addOns[]`, adds a **client-supplied `amount`** straight to `sourceAmount` with no currency check, writes `CruiseBookingActivity` rows, and returns them via `cruiseInclude` on every read.

```ts
for (const addOn of addOns) {
  const amount = Number(addOn.amount ?? 0);
  if (Number.isFinite(amount) && amount > 0) sourceAmount = sourceAmount.add(new Decimal(amount));   // :469-470
}
```
The client no longer offers it (`grep addOns dashboard.html` → 0), and the endpoint is SUPERADMIN-only, so no agent can reach it. But the replaced business concept remains purchasable, and the price is unvalidated.
**Evidence:** `cruise.controller.ts:35, 294, 466-470, 555-556`; `schema.prisma` `CruiseBookingActivity`.

---

### REQ-BUG-14 — A transfer with a pickup but no drop-off is fabricated as From → From

**Severity:** MEDIUM · **Requirement:** 8 (explicit negative test) · **Confidence:** Confirmed
**Previous report:** BUG-42 — **STILL PRESENT**

REQ 8: *"A transfer with From but no To must NOT silently become From → From. Missing route data must not produce a confident but fake route."*

```ts
transferToName: toName ?? fromName,     // shared/transfer-addon.ts:110
```
Probe 18: `{transferRequested:true, transferFromName:'Cairo Airport'}` → `transferToName: 'Cairo Airport'`. The voucher and the operations queue then both read "Cairo Airport → Cairo Airport". The comment calls it a convenience ("most transfers bring the guests back where they were collected"), but the requirement forbids exactly this. The rate-driven cruise transfer path is unaffected — `saveCruiseTransferRates` requires both endpoints.
**Evidence:** `src/shared/transfer-addon.ts:104-112`; probe 18.

---

### REQ-BUG-15 — A percentage supplement bypasses the currency check

**Severity:** MEDIUM · **Requirement:** 6 · **Confidence:** Confirmed · **NEW**

```ts
if (supplement.currency && supplement.currency !== currency && supplement.type !== 'PERCENTAGE') return null;
```
The `!== 'PERCENTAGE'` clause means a supplement tagged EGP is accepted onto a USD fare as long as it is a percentage (probe 12). Arithmetically a percentage is currency-neutral, so no wrong number is produced today — but it means "Egyptian booking + EGP supplement" and "Foreign booking + USD supplement" are enforced for fixed amounts and unenforced for percentages, which is the inconsistency REQ 6 asks about.
**Evidence:** `src/shared/cruise-rates.ts:271`.

---

### REQ-BUG-16 — Duplicate supplements are charged twice

**Severity:** MEDIUM · **Requirement:** 6 · **Confidence:** Confirmed · **NEW**

REQ 6 asks to *"attempt duplicate supplement"*. Sending the same supplement name twice applies it twice — 1,000 → 1,200 for a 50/person supplement at 2 pax (probe 10). The selection filter uses `Set.has(name)` to decide *whether* a supplement is allowed, but keeps every matching entry rather than de-duplicating, so a repeated name multiplies the charge.
**Evidence:** `cruise.controller.ts:420-423`; `cruise-rates.ts:262-277`; probe 10.

---

### REQ-BUG-17 — Overlapping package price periods are accepted with no tie-break

**Severity:** MEDIUM · **Requirement:** 12 · **Confidence:** Confirmed · **NEW**

`packageData` validates each period in isolation (dates present, ordered, four prices ≥ 0) but never compares periods. Two overlapping FOREIGN periods with different prices both persist (probe 13). Even if a resolver were added (REQ-BUG-02), the stored data is already ambiguous for any date in the overlap.
**Evidence:** `offers.controller.ts:39-43`; probe 13.

---

### REQ-BUG-18 — The client shows only the first three package price periods

**Severity:** LOW · **Requirement:** 12, 14 · **Confidence:** Confirmed · **NEW**

`periods.slice(0, 3)` (`dashboard.html:6157`) after the market filter. A package with four or more periods for the caller's market silently hides the rest, so the published client view does not match the admin configuration (REQ 14).

---

### REQ-BUG-19 — A programme silently discards a submitted transfer instead of refusing it

**Severity:** LOW · **Requirement:** 2 · **Confidence:** Confirmed

On the booking API, `if (!programmeRate && body.transferRateId)` means a payload carrying both a programme and a transfer succeeds with the transfer dropped, no error and no warning — the response simply returns `transferRateId: null`. The commercial outcome is correct (no double charge, satisfying REQ 2), but a caller that believed it was buying a transfer is told the booking succeeded. Contrast the explicit `PICK_ONE_FARE` refusal when a cabin rate and a programme rate are both sent.
**Evidence:** `cruise.controller.ts:372, 466`.

---

## 9. Re-verification of previous findings

Re-tested at current HEAD (`bf8f831`), not copied.

| Old ID | Finding | Status now | Note |
|---|---|---|---|
| BUG-01 | Shared catalogue save wipes all boats' programmes/transfers | **STILL PRESENT** | `:611` still passes no scope → REQ-BUG-05 |
| BUG-02 | Cruise edit destroys the fare table | **STILL PRESENT** | `admin.html:2162` unchanged → REQ-BUG-06 |
| BUG-11 | Cruise rate endpoints leak both audiences | **STILL PRESENT** | no guards added → REQ-BUG-03 |
| BUG-17 | Activity Package absent from reports/statements | **STILL PRESENT** | `grep -c` = 0 in both → REQ-BUG-12 |
| BUG-24 | Supplement order-dependence | **STILL PRESENT** | probes 8-9 → REQ-BUG-07 |
| BUG-25 | Client-supplied `transferPaxCount` | **STILL PRESENT** | `:465` unchanged (T-36) |
| BUG-27 | Cruise transfer market strict-match vs cabin equivalence | **STILL PRESENT** | legacy `INTERNATIONAL` transfer rows unreachable |
| BUG-35 | Programme silently discards a posted transfer | **STILL PRESENT** | → REQ-BUG-19 |
| BUG-38 | Cruise add-on amounts added with no currency check | **STILL PRESENT** | → REQ-BUG-13 |
| BUG-41 | Offers reference catalogue items as unvalidated JSON | **STILL PRESENT — and larger than reported** | now shown to break REQ 12 entirely → REQ-BUG-08/09 |
| BUG-42 | `readTransferAddOn` fabricates From → From | **STILL PRESENT** | probe 18 → REQ-BUG-14 |

No previously reported finding in this area has been fixed, partially fixed or regressed — the code is the same commit.

### Obsolete tests

| ID | Item | Why obsolete |
|---|---|---|
| `OUTDATED-TEST-01` | `priceCruiseBooking()` — the **per-cabin** pricer, and the `cabinsNeeded`/`OCCUPANCY_SIZE` helpers around it | REQ 4 makes cruise pricing per **person**. This function returns 522 where the live path returns 1,044 for the same inputs (probe 11). It is called by no controller. Its presence in `tests/cruise-rates.test.ts` is not a bug against REQ 4 — it tests a superseded rule. Recommend confirming it is dead before anyone reuses it by mistake. |
| `OUTDATED-TEST-02` | `CruiseBooking.cabinCount` | Written as a constant `1` with the comment *"legacy export field; never a price multiplier"* (`cruise.controller.ts:391`). Consistent with REQ 4; retained for exports. |
| `OUTDATED-TEST-03` | Any expectation that the client offers Nile Cruise **Tours** | REQ 9 replaces that flow with programme selection; the client correctly has none. The backend remnant is tracked as REQ-BUG-13, not as an outdated test. |

---

## 10. Blocked verification

| Area | Why | What it needs |
|---|---|---|
| REQ 15 in full — hard-reload persistence, Admin and Client | App cannot boot without a database | Disposable Postgres + the pending migration + a browser (Chromium/Playwright are available here) |
| Live API tampering (REQ 18) — actually POSTing the malformed payloads | Same | Same |
| Package Period × Occupancy resolution matrix (REQ 12) | **Not environmental** — no resolver exists to test | A resolver would have to be built first |
| Expired-supplement test (REQ 6) | **Not environmental** — supplements have no validity fields | A schema decision |
| Admin/Client DOM behaviour: programme switch, programme removal, stale data | No browser | Same as REQ 15 |
| Excel statement output | `xlsx` unavailable (`cdn.sheetjs.com` → 403 via proxy) | Registry mirror or CDN access |

Two of these are worth separating clearly: the package price matrix and the expired supplement are **not** blocked by my environment — they are blocked because the feature does not exist. Running them against a live database would not change the result.

---

## 11. Verdict

`NOT READY — BUSINESS LOGIC FAILURES REMAIN`

Three blockers decide it:

1. **REQ-BUG-01** — the agent's only cruise path validates almost nothing; programme, rate, transfer and every price are client-authored.
2. **REQ-BUG-02** — package pricing periods and Single/Double/Triple/Child rates resolve into nothing; packages cannot be sold.
3. **REQ-BUG-05 / REQ-BUG-06** — routine catalogue edits still destroy cruise fare tables and detach every existing booking from its programme, rate, schedule and transfer.

What is genuinely right and should not be disturbed: the two-audience model (EGP/USD) is correct and enforced on write; per-person pricing is correct in calculation *and* in how it is presented, in both languages; the programme-includes-transfer rule is properly enforced in the UI and in the booking API; the 3/4-night binding is watertight on the booking path; Offers and Packages are cleanly separated at every layer; and Activity Package pricing is fully server-authoritative.

---

*Verified by source trace and 50 executable probes against the application's own modules at commit `bf8f831`. No application code, schema, migration, configuration or data was modified. The probes live outside the repository.*
