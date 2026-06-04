# Elbakri Portal Google Sheets Schema

Google Sheets is the source of truth for master data. Sync is one-way:
Sheets → database. Each row must include a stable `sheetsRowId` (where applicable);
the sync process uses it to update an existing record or create a new one.

## Workbook

- One workbook per Elbakri Portal instance.
- Configure the workbook ID in Admin → Sheets Config.
- Each tab name must match the names below exactly.
- Boolean values accept `true/false`, `yes/no`, `1/0`, `active/inactive`.
- Multi-value columns accept semicolon, comma, or pipe separators.
- Amount columns are decimal numbers without currency symbols.
- Rows with missing required fields are **skipped** and logged as errors — they are never silently imported with bad defaults.

---

## Google Sheets setup

The live sync reads a Google Sheet through a **service account**. One-time setup:

1. **Create a service account** in Google Cloud → IAM → Service Accounts, and generate a JSON key.
2. **Share the spreadsheet** (Share button) with the service account's email
   (`...@...iam.gserviceaccount.com`) as **Viewer**. Sync is read-only.
3. **Set environment variables** (never commit these — `.env` is git-ignored):

   ```bash
   GOOGLE_SERVICE_ACCOUNT_EMAIL=elbakri-sync@your-project.iam.gserviceaccount.com
   # Wrap in quotes and escape newlines as \n (the app un-escapes them at runtime):
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
   GOOGLE_SHEETS_ID=1MdYMNfpSEbXLRV8hkthqH-iEcy5pofoHdg-HQwRE5sg
   ```

   `GOOGLE_SHEETS_ID` is the long ID in the sheet URL:
   `https://docs.google.com/spreadsheets/d/`**`<THIS PART>`**`/edit`.
   It can also be set/overridden at runtime in **Admin → Sheets Config**.
4. **Test the connection** in Admin → Sheets Config → *Test Connection*.
5. **Run a sync** per entity from the module toolbar (*Sync from Sheets*) or the
   Sheets Config table. Each run reports `synced / created / updated / skipped / errors`.

> If credentials are missing the sync endpoints return a clear, non-fatal error
> (`GOOGLE_SHEETS_ID is not configured`) — they never crash the server.

---

## Preparing data from the raw "MEA" rate workbook

The raw operator workbook (`MEA (1).xlsx`) is **not directly syncable**. Its tabs
(`NORTH COAST`, `SSH TRIPS`, `TRANSFER EGYPT`, `SSH LIST`, `CAIRO HOTELS`,
`CAIRO+ALEX TRIPS`) use merged cells, title rows, multi-row records and free-text
prices like `20$ ADULT 12$CHILD`. To get this data into the DB there are three paths:

| Data | How it gets in | Notes |
| ---- | -------------- | ----- |
| Sharm hotel directory (`SSH LIST`) + Cairo hotel names (`CAIRO HOTELS`) | `npm run db:import:mea -- "<path to MEA.xlsx>"` | Idempotent. Parses the clean directory + best-effort Cairo names. Upserts by `sheetsRowId = mea-ssh-<slug>` / `mea-cairo-<slug>`. |
| North-Coast hotels + seasonal pricing, Sharm/Cairo activities, transfers | `npm run db:seed:mea` | Curated, normalized transcription of the dirty rate matrices (correct prices, Arabic names, categories). |
| Ongoing master-data updates | Google Sheets sync | Maintain the **normalized tabs documented below** in your Google Sheet, then *Sync from Sheets*. |

**To use Google Sheets sync going forward**, re-shape the raw rates into the clean,
one-row-per-record tabs below (each row carrying a stable `sheetsRowId`). The raw
workbook's layout will not import correctly through the sync — the normalized tabs are
the contract.

---

## Tabs

### Destinations

Dynamic destination/area master list. Replaces the old `ActivityCity` enum.
Import this sheet **before** Hotels and Activities so foreign keys resolve correctly.

| Column  | Required | Notes |
| ------- | -------- | ----- |
| name    | Yes      | English destination name, e.g. `North Coast`, `Sharm El Sheikh`. |
| nameAr  | No       | Arabic name. |
| slug    | Yes      | URL-safe unique identifier, e.g. `north-coast`. Auto-generated from name if blank. |
| country | No       | ISO-2 country code. Default `EG`. |
| region  | No       | Broader region, e.g. `Red Sea`, `Mediterranean`, `Upper Egypt`. |
| type    | No       | `CITY`, `RESORT`, `AREA`, or `REGION`. Default `CITY`. |
| isActive| No       | Default `true`. |

---

### Hotels

| Column            | Required | Notes |
| ----------------- | -------- | ----- |
| sheetsRowId       | Yes      | Stable row ID, never reuse for another hotel. |
| name              | Yes      | English hotel name. |
| nameAr            | No       | Arabic hotel name. |
| city              | Yes      | City/area text. Should match a Destination name. |
| cityAr            | No       | Arabic city name. |
| country           | No       | ISO code. Default `EG`. |
| stars             | No       | Number 1–5. Default `3`. |
| address           | Yes      | Street/location. |
| description       | No       | English description. |
| descriptionAr     | No       | Arabic description. |
| amenities         | No       | Semicolon-separated list. |
| pricePerNight     | Yes      | Base/fallback rate (used when no HotelPricing row applies). |
| currency          | No       | `USD`, `EGP`, `EUR`. Default `USD`. |
| commissionPercent | No       | Agent markup %. Default `0`. |
| availableRooms    | No       | `0` = open inventory. Default `0`. |
| maxGuestsPerRoom  | No       | Used to auto-calculate rooms from pax. Default `2`. |
| showPriceToAgents | No       | `true/false`. When `false` agents see "Price on request". Default `false`. |
| allowQuoteRequest | No       | `true/false`. Default `true`. |
| minVisibleTier    | No       | `STANDARD`, `SILVER`, `GOLD`, or `PLATINUM`. Leave blank for all tiers. |
| imageUrl          | No       | Public image URL. |
| isActive          | No       | Default `true`. |

---

### Hotel Pricing

Seasonal/date-range pricing. Rows here override the Hotel base `pricePerNight`.

| Column           | Required | Notes |
| ---------------- | -------- | ----- |
| sheetsRowId      | Yes      | Stable pricing row ID. |
| hotelSheetsRowId | Preferred| Links to Hotels.sheetsRowId. |
| hotelId          | Optional | Database ID fallback. |
| hotelName        | Optional | Name fallback when row ID unavailable. |
| roomType         | Yes      | `STANDARD`, `DELUXE`, `SUITE`, `EXECUTIVE`. |
| season           | No       | `LOW`, `REGULAR`, `HIGH`, `PEAK`. |
| pricePerNight    | Yes      | Rate per room/night. |
| currency         | No       | Defaults to hotel currency or `USD`. |
| validFrom        | Yes      | ISO date `YYYY-MM-DD` or spreadsheet date. |
| validTo          | Yes      | ISO date `YYYY-MM-DD` or spreadsheet date. |
| isActive         | No       | Default `true`. |

---

### Hotel Supplements

Per-room-type or per-package supplements (e.g. SGL supplement, chalet rates).
Stored the same as HotelPricing with a `supplementType` label column.

| Column          | Required | Notes |
| --------------- | -------- | ----- |
| sheetsRowId     | Yes      | Stable row ID. |
| hotelSheetsRowId| Yes      | Links to Hotels.sheetsRowId. |
| supplementType  | Yes      | Free text label, e.g. `SGL Supplement`, `Chalet GV 6pax`. |
| amount          | Yes      | Extra charge amount. |
| currency        | No       | Default hotel currency or `USD`. |
| validFrom       | No       | ISO date. |
| validTo         | No       | ISO date. |
| isActive        | No       | Default `true`. |

> **Note:** Supplement rows are imported into HotelPricing with `roomType = SUITE`
> and a description note until a dedicated Supplements table is added.

---

### On-Request Hotels

Hotels that Elbakri can quote but does not manage inventory for.
Appears in "Other hotels available upon request" sections (e.g. Rixos, Palma Bay).

| Column          | Required | Notes |
| --------------- | -------- | ----- |
| sheetsRowId     | Yes      | Stable row ID. |
| name            | Yes      | Hotel name. |
| nameAr          | No       | Arabic name. |
| city            | Yes      | City/area text. |
| stars           | No       | Number. |
| notes           | No       | Availability conditions or supplier notes. |
| isActive        | No       | Default `true`. |

> **Note:** On-request hotels are imported as Hotels with `allowQuoteRequest = true`
> and `showPriceToAgents = false` so agents see "Available on request."

---

### Activities

Activities, day tours, excursions, and attraction tickets.

| Column            | Required | Notes |
| ----------------- | -------- | ----- |
| sheetsRowId       | Yes      | Stable activity row ID. |
| name              | Yes      | Activity name. |
| nameAr            | No       | Arabic name. |
| city              | Yes      | Free-text city/destination name (not a fixed enum). |
| category          | No       | `SIGHTSEEING`, `DIVING`, `SNORKELING`, `DESERT_SAFARI`, `WATER_SPORTS`, `CULTURAL`, `FOOD_TOUR`, `ADVENTURE`, `RELAXATION`. |
| duration          | No       | Free text, e.g. `4 hours`, `Full day`. |
| description       | No       | English description. |
| descriptionAr     | No       | Arabic description. |
| includes          | No       | Semicolon-separated list. |
| excludes          | No       | Semicolon-separated list. |
| priceAdult        | Yes      | Adult rate. Must be a clean decimal (e.g. `45` not `45$` or `45USD`). |
| priceChild        | No       | Child rate. Defaults to adult rate if blank. |
| currency          | No       | Default `USD`. |
| minPax            | No       | Minimum participants. Default `1`. |
| maxPax            | No       | Maximum participants. Default `20`. |
| isConfirmableInApp| No       | `true/false`. If `false`, creates a quote request instead of a confirmable booking. Default `true`. |
| imageUrl          | No       | Image URL. |
| isActive          | No       | Default `true`. |

> **Data quality warning:** Values like `110$CHLD` in the source sheet must be cleaned
> before import. The sync will log an error and **skip** any row where `priceAdult`
> cannot be parsed as a plain number.

---

### Attraction Tickets

Museum and attraction entry tickets with adult/child prices.
Same columns as Activities with `category = SIGHTSEEING`.

---

### Transport Rates

Point-to-point transfer matrix (FROM → TO × vehicle type).

| Column       | Required | Notes |
| ------------ | -------- | ----- |
| sheetsRowId  | Yes      | Stable transport rate row ID. |
| type         | Yes      | `AIRPORT_TRANSFER`, `PRIVATE_TRANSFER`, `DAY_TOUR_TRANSPORT`, `INTERCITY`. |
| vehicleType  | Yes      | `SEDAN`, `SUV`, `VAN_6`, `VAN_12`, `MINIBUS_20`, `BUS_45`, `LUXURY_LIMO`. |
| fromLocation | No       | Origin city/point (free text). |
| toLocation   | No       | Destination city/point (free text). |
| city         | No       | Operating city/area (for day-tour transport). |
| rate         | Yes      | Price. Must be a clean decimal. "By request" cells must be left blank. |
| currency     | No       | Default `USD`. |
| minCapacity  | No       | Min passengers (inclusive). Default `1`. |
| maxCapacity  | No       | Max passengers (inclusive). |
| notes        | No       | Internal notes, e.g. `Includes 2 bags`, `Toll not included`. |
| isActive     | No       | Default `true`. |

> **MEA.xlsx mapping:** Each vehicle column (Sedan/SUV/Van) in the TRANSFER EGYPT
> sheet becomes a separate row. Routes with "cars by request" in the rate column
> are imported as `isActive = false` with a note so they become quote-only.

---

### Cruises

| Column           | Required | Notes |
| ---------------- | -------- | ----- |
| sheetsRowId      | Yes      | Stable cruise row ID. |
| name             | Yes      | Ship/cruise name. |
| nameAr           | No       | Arabic name. |
| shipType         | No       | `CRUISE`, `DAHABIYA`, `FELUCCA`. |
| operator         | No       | Supplier/operator. |
| cabins           | No       | Cabin count. |
| route            | No       | `LUXOR_ASWAN`, `ASWAN_LUXOR`, `LUXOR_ASWAN_LUXOR`. |
| departureDays    | No       | e.g. `Mon;Thu`. |
| duration         | No       | Nights/days. Default `4`. |
| description      | No       | English description. |
| descriptionAr    | No       | Arabic description. |
| priceFrom        | Yes      | Lead-in rate. |
| currency         | No       | Default `USD`. |
| showPriceToAgents| No       | `true/false`. Default `false`. |
| allowQuoteRequest| No       | `true/false`. Default `true`. |
| imageUrl         | No       | Image URL. |
| isActive         | No       | Default `true`. |

---

### Visa Fees

| Column             | Required | Notes |
| ------------------ | -------- | ----- |
| sheetsRowId        | Yes      | Stable visa fee row ID. |
| visaType           | Yes      | `TOURIST`, `BUSINESS`, `TRANSIT`, `STUDENT`, `MEDICAL`, `UMRAH`, `HAJJ`. |
| destinationCountry | Yes      | Destination country name or ISO code. |
| processingType     | No       | `NORMAL`, `EXPRESS`, `URGENT`. |
| fee                | Yes      | Fee amount. |
| currency           | No       | Default `USD`. |
| notes              | No       | Conditions or supplier notes. |
| isActive           | No       | Default `true`. |

---

### Reception Services

| Column      | Required | Notes |
| ----------- | -------- | ----- |
| sheetsRowId | Yes      | Stable reception service row ID. |
| serviceType | Yes      | `MEET_AND_GREET`, `AHLAN_SERVICE`, `VIP_LOUNGE`, `FULL_ASSISTANCE`. |
| airport     | No       | `CAI`, `HRG`, `SSH`, `LXR`, `ASW`, `HBE`, `MHH`. |
| rate        | Yes      | Service rate. |
| currency    | No       | Default `USD`. |
| notes       | No       | Service conditions. |
| isActive    | No       | Default `true`. |

---

## Sync Endpoints

| Method | Path | Entity |
| ------ | ---- | ------ |
| POST | `/api/destinations/sync-sheets` | Destinations |
| POST | `/api/hotels/sync-sheets` | Hotels |
| POST | `/api/hotel-pricing/sync-sheets` | Hotel Pricing |
| POST | `/api/cruises/sync-sheets` | Cruises |
| POST | `/api/activities/sync-sheets` | Activities |
| POST | `/api/transport-rates/sync-sheets` | Transport Rates |
| POST | `/api/visa-fees/sync-sheets` | Visa Fees |
| POST | `/api/reception-services/sync-sheets` | Reception Services |
| POST | `/api/admin/sheets/sync/:entity` | Any entity (admin UI) |
| GET  | `/api/admin/sheets/history?limit=10` | Sync history |

All sync endpoints require `SUPERADMIN` role.

## Import Order

To avoid foreign-key resolution failures, sync tabs in this order:

1. **Destinations** — must be imported first so Hotels and Activities can link to them.
2. **Hotels**
3. **Hotel Pricing**
4. **Activities** / **Attraction Tickets**
5. **Transport Rates**
6. **Cruises**
7. **Visa Fees**
8. **Reception Services**

## Error Handling

- Rows with missing required fields are **skipped** (counted in `skipped`).
- Rows that fail validation (bad amounts, invalid enums) are **logged as errors** and skipped.
- Errors do not abort the sync — the full sheet is always processed.
- The sync result returns `{ status, synced, created, updated, skipped, errors[] }`.
- `status = PARTIAL` when some rows succeed and some error.
- `status = FAILED` when no rows succeed.
