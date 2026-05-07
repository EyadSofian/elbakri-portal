# Elbakri Portal Google Sheets Schema

Google Sheets is the source of truth for master data. Sync is one-way:
Sheets to database. Each row must include a stable `sheetsRowId`; the sync
process uses it to update an existing record or create a new one.

## Workbook

- One workbook per Elbakri Portal instance.
- Configure the workbook ID in Admin -> Sheets Config.
- Each tab name must match the names below.
- Boolean values accept `true/false`, `yes/no`, `1/0`, `active/inactive`.
- Multi-value columns accept semicolon, comma, or pipe separators.
- Amount columns are decimal numbers without currency symbols.

## Tabs

### Hotels

| Column | Required | Notes |
| --- | --- | --- |
| sheetsRowId | Yes | Stable row ID, never reuse for another hotel. |
| name | Yes | English hotel name. |
| nameAr | No | Arabic hotel name. |
| city | Yes | City text. |
| cityAr | No | Arabic city name. |
| country | Yes | ISO code or country name, default `EG`. |
| stars | No | Number, default `3`. |
| address | Yes | Street/location. |
| description | No | English description. |
| descriptionAr | No | Arabic description. |
| amenities | No | List separated by `;`, `,`, or `|`. |
| pricePerNight | Yes | Base rate. |
| currency | No | `USD`, `EGP`, `EUR`, etc. Default `USD`. |
| commissionPercent | No | Percentage added to the base hotel price when an agent books. Default `0`. |
| availableRooms | No | Inventory cap used by booking availability checks. `0` means open inventory. |
| maxGuestsPerRoom | No | Guest capacity used to calculate required rooms. Default `2`. |
| imageUrl | No | Public or uploaded image URL. |
| isActive | No | Default `true`. |

### Hotel Pricing

| Column | Required | Notes |
| --- | --- | --- |
| sheetsRowId | Yes | Stable pricing row ID. |
| hotelSheetsRowId | Preferred | Links to Hotels.sheetsRowId. |
| hotelId | Optional | Database ID fallback. |
| hotelName | Optional | Name fallback when row ID is unavailable. |
| roomType | Yes | `STANDARD`, `DELUXE`, `SUITE`, `EXECUTIVE`. |
| season | No | `LOW`, `REGULAR`, `HIGH`, `PEAK`. |
| pricePerNight | Yes | Rate per room/night. |
| currency | No | Defaults to hotel currency or `USD`. |
| validFrom | Yes | ISO date or spreadsheet date text. |
| validTo | Yes | ISO date or spreadsheet date text. |
| isActive | No | Default `true`. |

### Cruises

| Column | Required | Notes |
| --- | --- | --- |
| sheetsRowId | Yes | Stable cruise row ID. |
| name | Yes | Ship/cruise name. |
| nameAr | No | Arabic name. |
| shipType | No | `CRUISE`, `DAHABIYA`, `FELUCCA`. |
| operator | No | Supplier/operator. |
| cabins | No | Cabin count. |
| route | No | `LUXOR_ASWAN`, `ASWAN_LUXOR`, `LUXOR_ASWAN_LUXOR`. |
| departureDays | No | List such as `Mon;Thu`. |
| duration | No | Nights/days count, default `4`. |
| description | No | English description. |
| descriptionAr | No | Arabic description. |
| priceFrom | Yes | Lead-in rate. |
| currency | No | Default `USD`. |
| imageUrl | No | Image URL. |
| isActive | No | Default `true`. |

### Activities

| Column | Required | Notes |
| --- | --- | --- |
| sheetsRowId | Yes | Stable activity row ID. |
| name | Yes | Activity name. |
| nameAr | No | Arabic name. |
| city | Yes | `CAIRO`, `SHARM_EL_SHEIKH`, `DAHAB`, `HURGHADA`, `EL_GOUNA`, `ALEXANDRIA`. |
| category | No | `SIGHTSEEING`, `DIVING`, `SNORKELING`, `DESERT_SAFARI`, `WATER_SPORTS`, `CULTURAL`, `FOOD_TOUR`, `ADVENTURE`, `RELAXATION`. |
| duration | No | Free text, e.g. `4 hours`. |
| description | No | English description. |
| descriptionAr | No | Arabic description. |
| includes | No | List. |
| excludes | No | List. |
| priceAdult | Yes | Adult rate. |
| priceChild | No | Child rate, defaults to adult rate when blank. |
| currency | No | Default `USD`. |
| minPax | No | Default `1`. |
| maxPax | No | Default `20`. |
| imageUrl | No | Image URL. |
| isActive | No | Default `true`. |

### Transport Rates

| Column | Required | Notes |
| --- | --- | --- |
| sheetsRowId | Yes | Stable transport rate row ID. |
| type | Yes | `AIRPORT_TRANSFER`, `PRIVATE_TRANSFER`, `DAY_TOUR_TRANSPORT`, `INTERCITY`. |
| vehicleType | Yes | `SEDAN`, `SUV`, `VAN_6`, `VAN_12`, `MINIBUS_20`, `BUS_45`, `LUXURY_LIMO`. |
| city | No | City/operating area. |
| fromLocation | No | Origin. |
| toLocation | No | Destination. |
| rate | Yes | Base rate. |
| currency | No | Default `USD`. |
| notes | No | Internal pricing notes. |
| isActive | No | Default `true`. |

### Visa Fees

| Column | Required | Notes |
| --- | --- | --- |
| sheetsRowId | Yes | Stable visa fee row ID. |
| visaType | Yes | `TOURIST`, `BUSINESS`, `TRANSIT`, `STUDENT`, `MEDICAL`, `UMRAH`, `HAJJ`. |
| destinationCountry | Yes | Destination country. |
| processingType | No | `NORMAL`, `EXPRESS`, `URGENT`. |
| fee | Yes | Fee amount. |
| currency | No | Default `USD`. |
| notes | No | Supplier or condition notes. |
| isActive | No | Default `true`. |

### Reception Services

| Column | Required | Notes |
| --- | --- | --- |
| sheetsRowId | Yes | Stable reception service row ID. |
| serviceType | Yes | `MEET_AND_GREET`, `AHLAN_SERVICE`, `VIP_LOUNGE`, `FULL_ASSISTANCE`. |
| airport | No | `CAI`, `HRG`, `SSH`, `LXR`, `ASW`, `HBE`, `MHH`. |
| rate | Yes | Service rate. |
| currency | No | Default `USD`. |
| notes | No | Service conditions. |
| isActive | No | Default `true`. |

## Sync Endpoints

- `POST /api/hotels/sync-sheets`
- `POST /api/hotel-pricing/sync-sheets`
- `POST /api/cruises/sync-sheets`
- `POST /api/activities/sync-sheets`
- `POST /api/transport-rates/sync-sheets`
- `POST /api/visa-fees/sync-sheets`
- `POST /api/reception-services/sync-sheets`
- `POST /api/admin/sheets/sync/:entity`
- `GET /api/admin/sheets/history?limit=10`

All sync endpoints require `SUPERADMIN`.
