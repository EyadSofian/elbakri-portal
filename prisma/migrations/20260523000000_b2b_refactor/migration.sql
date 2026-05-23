-- B2B Refactor Migration
-- Changes:
--   1. Add DestinationType, QuoteRequestStatus, QuoteServiceType enums
--   2. Add Destination table
--   3. Add QuoteRequest + QuoteRequestCounter tables
--   4. Add price visibility columns to Hotel and NileCruise
--   5. Add destinationId to Hotel, Activity, TransportRate
--   6. Change Activity.city from ActivityCity enum to TEXT (free-text)
--   7. Drop ActivityCity enum
--   8. Add isConfirmableInApp to Activity
--   9. Make Invoice.bookingId nullable; add activityBookingId, transportBookingId
--  10. Add invoice relation to ActivityBooking and TransportBooking
--  11. Add contactEmail to Company
--  12. Add minCapacity, maxCapacity to TransportRate

-- ─── 1. New enums ───────────────────────────────────────────────────────────
CREATE TYPE "DestinationType" AS ENUM ('CITY', 'RESORT', 'AREA', 'REGION');
CREATE TYPE "QuoteRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'QUOTED', 'ACCEPTED', 'CLOSED', 'CANCELLED');
CREATE TYPE "QuoteServiceType" AS ENUM ('HOTEL', 'PACKAGE', 'CRUISE', 'FLIGHT', 'MULTI_SERVICE');

-- ─── 2. Destination table ────────────────────────────────────────────────────
CREATE TABLE "Destination" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "nameAr"    TEXT,
  "slug"      TEXT NOT NULL,
  "country"   TEXT NOT NULL DEFAULT 'EG',
  "region"    TEXT,
  "type"      "DestinationType" NOT NULL DEFAULT 'CITY',
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");
CREATE INDEX "Destination_slug_idx" ON "Destination"("slug");
CREATE INDEX "Destination_country_idx" ON "Destination"("country");
CREATE INDEX "Destination_isActive_idx" ON "Destination"("isActive");

-- ─── 3. Company – add contactEmail ──────────────────────────────────────────
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;

-- ─── 4. Hotel – add price visibility + destinationId ────────────────────────
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "showPriceToAgents" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "allowQuoteRequest" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "minVisibleTier" "CompanyTier";
ALTER TABLE "Hotel" ADD COLUMN IF NOT EXISTS "destinationId" TEXT;
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_destinationId_fkey"
  FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Hotel_destinationId_idx" ON "Hotel"("destinationId");

-- ─── 5. NileCruise – add price visibility ───────────────────────────────────
ALTER TABLE "NileCruise" ADD COLUMN IF NOT EXISTS "showPriceToAgents" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "NileCruise" ADD COLUMN IF NOT EXISTS "allowQuoteRequest" BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── 6. Activity – change city from enum to TEXT, add new fields ─────────────
-- Step 6a: Add new text column
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "city_new" TEXT;
-- Step 6b: Copy enum values as text
UPDATE "Activity" SET "city_new" = "city"::TEXT;
-- Step 6c: Drop old enum column
ALTER TABLE "Activity" DROP COLUMN "city";
-- Step 6d: Rename new column
ALTER TABLE "Activity" RENAME COLUMN "city_new" TO "city";
-- Step 6e: Set NOT NULL (rows already populated)
ALTER TABLE "Activity" ALTER COLUMN "city" SET NOT NULL;
-- Step 6f: Drop old ActivityCity enum
DROP TYPE IF EXISTS "ActivityCity";
-- Step 6g: Recreate index
CREATE INDEX IF NOT EXISTS "Activity_city_idx" ON "Activity"("city");
-- Step 6h: Add new fields to Activity
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "isConfirmableInApp" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "destinationId" TEXT;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_destinationId_fkey"
  FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Activity_destinationId_idx" ON "Activity"("destinationId");

-- ─── 7. TransportRate – add capacity + destinationId ────────────────────────
ALTER TABLE "TransportRate" ADD COLUMN IF NOT EXISTS "minCapacity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TransportRate" ADD COLUMN IF NOT EXISTS "maxCapacity" INTEGER;
ALTER TABLE "TransportRate" ADD COLUMN IF NOT EXISTS "destinationId" TEXT;
ALTER TABLE "TransportRate" ADD CONSTRAINT "TransportRate_destinationId_fkey"
  FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "TransportRate_destinationId_idx" ON "TransportRate"("destinationId");

-- ─── 8. Invoice – make bookingId nullable, add alt booking refs ──────────────
ALTER TABLE "Invoice" ALTER COLUMN "bookingId" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "activityBookingId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "transportBookingId" TEXT;
-- Unique constraints for the new refs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_activityBookingId_key') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_activityBookingId_key" UNIQUE ("activityBookingId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_transportBookingId_key') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transportBookingId_key" UNIQUE ("transportBookingId");
  END IF;
END $$;
-- Foreign keys
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_activityBookingId_fkey"
  FOREIGN KEY ("activityBookingId") REFERENCES "ActivityBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transportBookingId_fkey"
  FOREIGN KEY ("transportBookingId") REFERENCES "TransportBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 9. QuoteRequest table ───────────────────────────────────────────────────
CREATE TABLE "QuoteRequest" (
  "id"                TEXT NOT NULL,
  "refNumber"         TEXT NOT NULL,
  "serviceType"       "QuoteServiceType" NOT NULL,
  "status"            "QuoteRequestStatus" NOT NULL DEFAULT 'NEW',
  "companyId"         TEXT NOT NULL,
  "createdById"       TEXT NOT NULL,
  "destinationId"     TEXT,
  "destinationName"   TEXT,
  "hotelId"           TEXT,
  "checkIn"           TIMESTAMP(3),
  "checkOut"          TIMESTAMP(3),
  "adultsCount"       INTEGER NOT NULL DEFAULT 1,
  "childrenCount"     INTEGER NOT NULL DEFAULT 0,
  "infantsCount"      INTEGER NOT NULL DEFAULT 0,
  "roomsCount"        INTEGER,
  "nationality"       TEXT,
  "budget"            DECIMAL(12,2),
  "quotedAmount"      DECIMAL(12,2),
  "currency"          TEXT NOT NULL DEFAULT 'USD',
  "customerNotes"     TEXT,
  "internalNotes"     TEXT,
  "contactPreference" TEXT,
  "assignedToId"      TEXT,
  "respondedAt"       TIMESTAMP(3),
  "closedAt"          TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuoteRequest_refNumber_key" ON "QuoteRequest"("refNumber");
CREATE INDEX "QuoteRequest_companyId_idx" ON "QuoteRequest"("companyId");
CREATE INDEX "QuoteRequest_status_idx" ON "QuoteRequest"("status");
CREATE INDEX "QuoteRequest_serviceType_idx" ON "QuoteRequest"("serviceType");
CREATE INDEX "QuoteRequest_refNumber_idx" ON "QuoteRequest"("refNumber");
CREATE INDEX "QuoteRequest_createdAt_idx" ON "QuoteRequest"("createdAt");
CREATE INDEX "QuoteRequest_assignedToId_idx" ON "QuoteRequest"("assignedToId");
ALTER TABLE "QuoteRequest"
  ADD CONSTRAINT "QuoteRequest_companyId_fkey"   FOREIGN KEY ("companyId")    REFERENCES "Company"("id")     ON DELETE RESTRICT  ON UPDATE CASCADE,
  ADD CONSTRAINT "QuoteRequest_createdById_fkey"  FOREIGN KEY ("createdById")  REFERENCES "User"("id")        ON DELETE RESTRICT  ON UPDATE CASCADE,
  ADD CONSTRAINT "QuoteRequest_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "QuoteRequest_hotelId_fkey"      FOREIGN KEY ("hotelId")      REFERENCES "Hotel"("id")       ON DELETE SET NULL  ON UPDATE CASCADE,
  ADD CONSTRAINT "QuoteRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id")        ON DELETE SET NULL  ON UPDATE CASCADE;

-- ─── 10. QuoteRequestCounter table ──────────────────────────────────────────
CREATE TABLE "QuoteRequestCounter" (
  "year"    INTEGER NOT NULL,
  "lastSeq" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "QuoteRequestCounter_pkey" PRIMARY KEY ("year")
);

-- ─── 11. Seed initial destinations from MEA.xlsx areas ──────────────────────
INSERT INTO "Destination" ("id", "name", "nameAr", "slug", "country", "region", "type", "isActive", "createdAt", "updatedAt")
VALUES
  ('dst_north_coast',  'North Coast',    'الساحل الشمالي',  'north-coast',  'EG', 'Mediterranean',  'AREA',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_sharm',        'Sharm El Sheikh','شرم الشيخ',       'sharm-el-sheikh','EG','Red Sea',        'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_dahab',        'Dahab',          'دهب',             'dahab',         'EG', 'Red Sea',        'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_cairo',        'Cairo',          'القاهرة',         'cairo',         'EG', 'Greater Cairo',  'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_alexandria',   'Alexandria',     'الإسكندرية',      'alexandria',    'EG', 'Mediterranean',  'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_hurghada',     'Hurghada',       'الغردقة',         'hurghada',      'EG', 'Red Sea',        'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_marsa_alam',   'Marsa Alam',     'مرسى علم',        'marsa-alam',    'EG', 'Red Sea',        'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_soma_bay',     'Soma Bay',       'سوما باى',        'soma-bay',      'EG', 'Red Sea',        'RESORT', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_el_gouna',     'El Gouna',       'الجونة',          'el-gouna',      'EG', 'Red Sea',        'RESORT', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_nuweiba',      'Nuweiba',        'نويبع',           'nuweiba',       'EG', 'Red Sea',        'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_taba',         'Taba',           'طابا',            'taba',          'EG', 'Red Sea',        'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_luxor',        'Luxor',          'الأقصر',          'luxor',         'EG', 'Upper Egypt',    'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_aswan',        'Aswan',          'أسوان',           'aswan',         'EG', 'Upper Egypt',    'CITY',   TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_ain_sokhna',   'Ain Sokhna',     'العين السخنة',    'ain-sokhna',    'EG', 'Red Sea',        'RESORT', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dst_sinai',        'South Sinai',    'جنوب سيناء',      'south-sinai',   'EG', 'Sinai',          'REGION', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
