-- Transport round-trip + hotel fields, Activity Packages, currency-aware
-- price matrix, and security/airport voucher fields.
-- All changes are additive and safe to apply on the existing database.

-- ─────────────────────────────────────────────
-- 1. TRANSPORT: return-leg + pickup/drop-off hotel fields
-- ─────────────────────────────────────────────
ALTER TABLE "TransportBooking"
  ADD COLUMN IF NOT EXISTS "pickupHotelName"        TEXT,
  ADD COLUMN IF NOT EXISTS "dropoffHotelName"       TEXT,
  ADD COLUMN IF NOT EXISTS "returnFromLocation"     TEXT,
  ADD COLUMN IF NOT EXISTS "returnToLocation"       TEXT,
  ADD COLUMN IF NOT EXISTS "returnFromType"         TEXT,
  ADD COLUMN IF NOT EXISTS "returnToType"           TEXT,
  ADD COLUMN IF NOT EXISTS "returnPickupHotelName"  TEXT,
  ADD COLUMN IF NOT EXISTS "returnDropoffHotelName" TEXT;

-- ─────────────────────────────────────────────
-- 2. SECURITY APPROVAL (Visa) + AIRPORT ASSIST voucher fields
-- ─────────────────────────────────────────────
ALTER TABLE "VisaApplication"
  ADD COLUMN IF NOT EXISTS "comingFrom"   TEXT,
  ADD COLUMN IF NOT EXISTS "flightNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "arrivalTime"  TIMESTAMP(3);

ALTER TABLE "AirportReception"
  ADD COLUMN IF NOT EXISTS "comingFrom" TEXT;

-- ─────────────────────────────────────────────
-- 3. ACTIVITY PACKAGES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ActivityPackage" (
  "id"             TEXT NOT NULL,
  "refNumber"      TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "createdById"    TEXT NOT NULL,
  "clientName"     TEXT,
  "clientPhone"    TEXT,
  "hotelName"      TEXT,
  "adultsCount"    INTEGER NOT NULL DEFAULT 1,
  "childrenCount"  INTEGER NOT NULL DEFAULT 0,
  "childAges"      JSONB,
  "notes"          TEXT,
  "totalAmount"    DECIMAL(12,2) NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "sourceAmount"   DECIMAL(12,2),
  "sourceCurrency" TEXT,
  "exchangeRate"   DECIMAL(18,8),
  "exchangeRateAt" TIMESTAMP(3),
  "status"         "BookingStatus" NOT NULL DEFAULT 'PENDING',
  "customFields"   JSONB,
  "requestedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt"    TIMESTAMP(3),
  "confirmedById"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActivityPackage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ActivityPackage_refNumber_key" ON "ActivityPackage"("refNumber");
CREATE INDEX IF NOT EXISTS "ActivityPackage_companyId_idx" ON "ActivityPackage"("companyId");
CREATE INDEX IF NOT EXISTS "ActivityPackage_status_idx" ON "ActivityPackage"("status");
CREATE INDEX IF NOT EXISTS "ActivityPackage_confirmedById_idx" ON "ActivityPackage"("confirmedById");

CREATE TABLE IF NOT EXISTS "ActivityPackageItem" (
  "id"               TEXT NOT NULL,
  "packageId"        TEXT NOT NULL,
  "activityId"       TEXT NOT NULL,
  "activityName"     TEXT NOT NULL,
  "city"             TEXT,
  "activityDate"     TIMESTAMP(3) NOT NULL,
  "selectedTime"     TEXT,
  "endTime"          TEXT,
  "adultsCount"      INTEGER NOT NULL DEFAULT 1,
  "childrenCount"    INTEGER NOT NULL DEFAULT 0,
  "childAges"        JSONB,
  "hotelName"        TEXT,
  "clientPhone"      TEXT,
  "activityType"     TEXT,
  "groupTypeId"      TEXT,
  "groupTypeLabel"   TEXT,
  "transferIncluded" BOOLEAN,
  "notes"            TEXT,
  "lineAmount"       DECIMAL(12,2),
  "currency"         TEXT NOT NULL DEFAULT 'USD',
  "displayOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActivityPackageItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActivityPackageItem_packageId_idx" ON "ActivityPackageItem"("packageId");
CREATE INDEX IF NOT EXISTS "ActivityPackageItem_activityId_idx" ON "ActivityPackageItem"("activityId");

CREATE TABLE IF NOT EXISTS "ActivityPackageCounter" (
  "year"    INTEGER NOT NULL,
  "lastSeq" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ActivityPackageCounter_pkey" PRIMARY KEY ("year")
);

-- FK: ActivityPackage → Company / User
DO $$ BEGIN
  ALTER TABLE "ActivityPackage" ADD CONSTRAINT "ActivityPackage_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ActivityPackage" ADD CONSTRAINT "ActivityPackage_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ActivityPackage" ADD CONSTRAINT "ActivityPackage_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- FK: ActivityPackageItem → ActivityPackage / Activity
DO $$ BEGIN
  ALTER TABLE "ActivityPackageItem" ADD CONSTRAINT "ActivityPackageItem_packageId_fkey"
    FOREIGN KEY ("packageId") REFERENCES "ActivityPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ActivityPackageItem" ADD CONSTRAINT "ActivityPackageItem_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- 4. INVOICE + VOUCHER ↔ ActivityPackage links
-- ─────────────────────────────────────────────
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "activityPackageId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_activityPackageId_key" ON "Invoice"("activityPackageId");
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_activityPackageId_fkey"
    FOREIGN KEY ("activityPackageId") REFERENCES "ActivityPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "activityPackageId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_activityPackageId_key" ON "Voucher"("activityPackageId");
DO $$ BEGIN
  ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_activityPackageId_fkey"
    FOREIGN KEY ("activityPackageId") REFERENCES "ActivityPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- 5. MARKET PRICE → currency-aware price matrix
-- ─────────────────────────────────────────────
-- Drop the old (entityType, entityId, market) unique so company/all rows can coexist
ALTER TABLE "MarketPrice" DROP CONSTRAINT IF EXISTS "MarketPrice_entityType_entityId_market_key";

ALTER TABLE "MarketPrice" ALTER COLUMN "market" DROP NOT NULL;
ALTER TABLE "MarketPrice" ALTER COLUMN "priceUsd" DROP NOT NULL;

ALTER TABLE "MarketPrice"
  ADD COLUMN IF NOT EXISTS "companyId"        TEXT,
  ADD COLUMN IF NOT EXISTS "label"            TEXT,
  ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "amount"           DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "nationalityGroup" TEXT,
  ADD COLUMN IF NOT EXISTS "minPax"           INTEGER,
  ADD COLUMN IF NOT EXISTS "maxPax"           INTEGER,
  ADD COLUMN IF NOT EXISTS "validFrom"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "validTo"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isActive"         BOOLEAN NOT NULL DEFAULT true;

-- Backfill: existing per-market USD overrides become explicit USD amounts
UPDATE "MarketPrice" SET "amount" = "priceUsd", "currency" = 'USD'
  WHERE "amount" IS NULL AND "priceUsd" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "MarketPrice_entityType_entityId_market_companyId_key"
  ON "MarketPrice"("entityType", "entityId", "market", "companyId");
CREATE INDEX IF NOT EXISTS "MarketPrice_companyId_idx" ON "MarketPrice"("companyId");

DO $$ BEGIN
  ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
