# BUSINESS LOGIC FIX REPORT

Source: `TARGETED_BUSINESS_REQUIREMENTS_TEST_REPORT.md` at audited commit `bf8f831`.

## Stage 0 Result

### Baseline

- `npm test`: 341 passed, 0 failed.
- Cruise pricing: 47 passed, 0 failed.
- Transfer: 22 passed, 0 failed.
- Activity pricing/schema: 48 passed, 0 failed.
- Offers/Packages: 3 passed, 0 failed.
- Invoice totals: 8 passed, 0 failed.
- Portal/Quote presentation: 78 passed, 0 failed.
- `npm run build`, `npm run test:html`, `npm run test:audit`: PASS.
- Integration: 1 guard passed; 22 database scenarios skipped because no local disposable DB was configured.

### Working checklist

- [x] REQ-BUG-01 — Agent cruise quote is client-authoritative
- [x] REQ-BUG-02 — Package prices never resolve
- [x] REQ-BUG-03 — Cruise price audience disclosure
- [x] REQ-BUG-04 — Package price audience disclosure
- [x] REQ-BUG-05 — Shared cruise catalogue destroys relationships
- [x] REQ-BUG-06 — Cruise edit destroys schedule/rate relationships
- [x] REQ-BUG-07 — Supplement order changes price
- [x] REQ-BUG-08 — Package components are unvalidated free text
- [x] REQ-BUG-09 — Package transfer has no rate/price reference
- [x] REQ-BUG-10 — Package edit drops incomplete rows
- [x] REQ-BUG-11 — Invalid historical package cannot be deactivated
- [x] REQ-BUG-12 — Activity Package missing from reports/statements
- [x] REQ-BUG-13 — Retired cruise Tours still chargeable
- [x] REQ-BUG-14 — Missing To becomes From→From
- [x] REQ-BUG-15 — Percentage supplement currency inconsistency
- [x] REQ-BUG-16 — Duplicate supplements double-charge
- [x] REQ-BUG-17 — Package periods overlap
- [x] REQ-BUG-18 — Client hides periods after the first three
- [x] REQ-BUG-19 — Programme silently discards standalone transfer

## REQ-BUG-05 — Shared catalogue relationship destruction

Status: FIXED

Files Changed: Prisma schema/migration, cruise catalogue controller, admin identity round-trip, shared retirable sync helper and tests.

Root Cause: Shared materialisation deleted every Programme and Transfer row globally, then recreated new IDs.

Implementation: Shared rows now have stable catalogue keys. Materialised Programmes, Programme Rates and Transfer Rates are updated in place. Removed products are retired (`retiredAt`) rather than deleted.

Tests Added: Stable-ID metadata update, retirement without deletion, legacy row adoption, scoped-ID rejection, and source guard against destructive delete paths.

Regression Tests: 347/347 passed after Stage 1.

Business Invariant Verified: Existing booking foreign keys remain valid through shared catalogue saves; unrelated cruises retain stable row IDs.

Notes: Future bookings ignore retired rows; historical relations stay readable.

## REQ-BUG-06 — Cruise edit destroys schedule/rate relationships

Status: FIXED

Files Changed: Prisma schema/migration, cruise catalogue controller, admin form, cruise booking snapshots.

Root Cause: Every metadata save re-posted schedules; the API deleted all schedules and cascaded through fares/programmes/transfers.

Implementation: Schedule and fare IDs now round-trip through the editor and are updated in place. Removed rows are retired. New bookings snapshot cruise/fare/programme/schedule/transfer commercial descriptions.

Tests Added: Admin identity round-trip and non-destructive synchronisation coverage.

Regression Tests: Cruise + Stage 1 focused 53/53; complete suite 347/347.

Business Invariant Verified: Description/image edits no longer regenerate schedule or fare IDs; booking money and descriptive snapshots are immutable.

Notes: The migration is additive and does not rewrite historical rows.

## Stage 1 Result

### Fixed

REQ-BUG-05, REQ-BUG-06

### Tests

347 passed, 0 failed

### Regression

PASS

### Remaining Risks

Database-backed relationship tests require the disposable integration database that Stage 0 found unavailable locally. The implementation is additive, compiles against generated Prisma types, and has pure synchronisation regression coverage.

### Safe to continue?

YES

## Final implementation result

### Nile Cruise commercial logic

- Cruise-only, cruise-with-programme and cruise-with-standalone-transfer are resolved on the server from catalogue IDs; client-authored totals are ignored.
- Three- and four-night schedules remain separate and a programme/rate/transfer must belong to the selected schedule.
- Programme fares are per person. Cruise-only fares support only the Single/Double/Triple occupancies explicitly priced by the operator.
- Standalone transfers are priced per vehicle, use the configured one-way/round-trip row and vehicle capacity, and calculate the required vehicle count from real passengers.
- A programme already includes its transfer; programme plus a standalone transfer is rejected instead of silently dropping or double-charging it.
- Egyptian companies see only EGP rows; other companies see only USD/foreign rows. Unpriced cases fail closed as price-on-request.
- Supplements are deterministic, duplicate supplements are rejected, fixed-currency mismatches are rejected, and percentage supplements are currencyless.
- Legacy Cruise Tours can no longer be charged. Missing destinations are never fabricated as From→From.

### Offers and Packages

- Offer and Package are separate catalogue kinds in admin and client UI.
- Packages now use real Hotel/HotelRate/MealPlan, TransportRate and Activity relations rather than unvalidated free text.
- Package price periods are first-class rows for Egyptian/EGP and Foreign/USD audiences, with Single/Double/Triple/Child values and overlap rejection.
- Package prices resolve server-side by company market, travel date and occupancy; quote requests store stable relation IDs and commercial snapshots.
- Incomplete component rows are rejected explicitly. Removed rows are retired, not deleted, and metadata-only edits do not reconstruct relationships.
- Existing legacy package JSON is preserved by the migration and flagged for admin reconfiguration; it is hidden from clients until linked to real records, but may still be safely deactivated.
- Client UI displays every applicable period and meaningful component names, calculates the price before enabling Send Request, and does not leak the other market's tariff.

### Reporting and UI integrity

- Activity Packages are included in report counts/revenue and consolidated invoice details.
- Admin controls, checkboxes, package selectors and client package cards/modal were normalised; external font/export resources no longer block local rendering.
- Demo mode contains a fully related package and a working server-price resolver for safe UI review without a database.

### Data-safety guarantees

- Both migrations are additive: no booking, quote, cruise, programme, rate, transfer, offer or legacy JSON row is deleted.
- Cruise and package catalogue children keep stable IDs and use `retiredAt` for removals, preserving historical foreign keys and snapshots.
- No replace-all `deleteMany` path remains in the cruise catalogue or package editor.

### Final verification (2026-09-01)

- `npm run build`: PASS.
- `npm test`: 363 passed, 0 failed, 0 skipped.
- `npm run test:html`: PASS.
- `npm run test:audit`: PASS — 222 dashboard handlers, 451 admin handlers and every frontend API path are valid.
- `prisma validate`: PASS.
- Demo package API: related package loaded and Double + one child resolved to the configured server total.
- Database integration guard: PASS. The 22 database scenarios remain skipped locally because no disposable PostgreSQL instance is installed/configured; they were not falsely reported as executed.

## Follow-up verification (2026-09-03)

### Nile Cruise transfer passenger count

- The number of transfer passengers is now a separate, required customer choice; it no longer silently follows the number of cruise guests.
- The authoritative server resolver validates the choice (1–500), derives the number of vehicles from the selected vehicle capacity, and calculates the transfer total per vehicle.
- The value survives both direct cruise bookings and quote requests, is stored in `transferPaxCount`, is included in the protected cruise selection snapshot, is visible in the admin request, and is consumed by Transport operations.
- User verification: 13 transfer passengers + a 12-seat round-trip vehicle produced 2 vehicles and EGP 7,800 (2 × EGP 3,900).
- Admin verification: the request displayed the same 13 passengers, round-trip product, 12-seat vehicle, 2 vehicles and EGP 7,800 total.

### Shared control layout

- Text actions no longer inherit icon-only square dimensions.
- Button icons remain in normal flex flow and cannot overlap their labels.
- Toolbars and modal actions wrap safely; modal footers no longer cover form content.
- Checkboxes and radios use one compact, explicit drawing in light and dark themes.

### Verification gate

- `npm test`: 368 passed, 0 failed (includes the new 13-passenger / 12-seat server test).
- `npm run build`: PASS.
- `npm run test:html`: PASS.
- `npm run test:audit`: PASS — 222 dashboard handlers, 451 admin handlers and every frontend API path are valid.
- Browser layout audit at 1280 × 720: no overflowing buttons, modal actions or modal containers.
