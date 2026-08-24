-- One migration for a batch of related portal changes. Everything here is
-- additive and guarded, so an environment that already ran part of it (or a
-- re-run after a failed deploy) is a no-op rather than an error, and no
-- existing row changes meaning:
--
--   * Activities learn whether a transfer is included, what the trip's own
--     inclusions are as a marked list, and when the guests get back.
--   * Activity bookings and package lines can carry an added transfer leg.
--   * A transport booking can record when it is due at the other end.
--   * Hotels get a tagged photo library ("Sea View", "Single Room", …).
--   * A security-approval fee can be priced per nationality.
--   * A Nile cruise is priced by cabin rate rows and sails to a schedule,
--     the way a hotel is priced by rate rows.

-- ── Activities ───────────────────────────────────────────────────────────────
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "inclusions" JSONB;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "transferIncluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "transferNote" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "transferNoteAr" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "returnTime" TEXT;

-- ── Activity bookings: added transfer leg ────────────────────────────────────
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "transferRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "transferFromType" TEXT;
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "transferFromName" TEXT;
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "transferToType" TEXT;
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "transferToName" TEXT;
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "transferPickupTime" TEXT;
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "transferReturnTime" TEXT;
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "transferNotes" TEXT;

ALTER TABLE "ActivityPackageItem" ADD COLUMN IF NOT EXISTS "transferRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ActivityPackageItem" ADD COLUMN IF NOT EXISTS "transferFromType" TEXT;
ALTER TABLE "ActivityPackageItem" ADD COLUMN IF NOT EXISTS "transferFromName" TEXT;
ALTER TABLE "ActivityPackageItem" ADD COLUMN IF NOT EXISTS "transferToType" TEXT;
ALTER TABLE "ActivityPackageItem" ADD COLUMN IF NOT EXISTS "transferToName" TEXT;
ALTER TABLE "ActivityPackageItem" ADD COLUMN IF NOT EXISTS "transferPickupTime" TEXT;
ALTER TABLE "ActivityPackageItem" ADD COLUMN IF NOT EXISTS "transferReturnTime" TEXT;
ALTER TABLE "ActivityPackageItem" ADD COLUMN IF NOT EXISTS "transferNotes" TEXT;

-- ── Transport: due time at the far end ───────────────────────────────────────
ALTER TABLE "TransportBooking" ADD COLUMN IF NOT EXISTS "dropoffDateTime" TIMESTAMP(3);

-- ── Hotel tagged photo library ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HotelImage" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "tagLabel" TEXT NOT NULL,
    "tagLabelAr" TEXT,
    "caption" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HotelImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HotelImage_hotelId_idx" ON "HotelImage"("hotelId");
CREATE INDEX IF NOT EXISTS "HotelImage_hotelId_tag_idx" ON "HotelImage"("hotelId", "tag");
DO $$ BEGIN
  ALTER TABLE "HotelImage" ADD CONSTRAINT "HotelImage_hotelId_fkey"
    FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Security approval fee per nationality ───────────────────────────────────
ALTER TABLE "VisaFee" ADD COLUMN IF NOT EXISTS "nationality" TEXT;
CREATE INDEX IF NOT EXISTS "VisaFee_nationality_idx" ON "VisaFee"("nationality");

-- ── Nile cruise: gallery + rate rows + sailing schedule ─────────────────────
ALTER TABLE "NileCruise" ADD COLUMN IF NOT EXISTS "galleryUrls" JSONB;
-- priceFrom becomes the optional "from" headline; the rate rows are the price.
ALTER TABLE "NileCruise" ALTER COLUMN "priceFrom" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "CruiseSchedule" (
    "id" TEXT NOT NULL,
    "cruiseId" TEXT NOT NULL,
    "departureDay" TEXT NOT NULL,
    "returnDay" TEXT NOT NULL,
    "nights" INTEGER NOT NULL DEFAULT 4,
    "label" TEXT,
    "labelAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CruiseSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CruiseSchedule_cruiseId_idx" ON "CruiseSchedule"("cruiseId");
CREATE INDEX IF NOT EXISTS "CruiseSchedule_cruiseId_isActive_idx" ON "CruiseSchedule"("cruiseId", "isActive");
DO $$ BEGIN
  ALTER TABLE "CruiseSchedule" ADD CONSTRAINT "CruiseSchedule_cruiseId_fkey"
    FOREIGN KEY ("cruiseId") REFERENCES "NileCruise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CruiseCabinRate" (
    "id" TEXT NOT NULL,
    "cruiseId" TEXT NOT NULL,
    "cabinName" TEXT NOT NULL,
    "cabinType" "CabinType" NOT NULL DEFAULT 'STANDARD',
    "market" "Market",
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "singlePrice" DECIMAL(10,2),
    "doublePrice" DECIMAL(10,2),
    "triplePrice" DECIMAL(10,2),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CruiseCabinRate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CruiseCabinRate_cruiseId_idx" ON "CruiseCabinRate"("cruiseId");
CREATE INDEX IF NOT EXISTS "CruiseCabinRate_cruiseId_isActive_idx" ON "CruiseCabinRate"("cruiseId", "isActive");
DO $$ BEGIN
  ALTER TABLE "CruiseCabinRate" ADD CONSTRAINT "CruiseCabinRate_cruiseId_fkey"
    FOREIGN KEY ("cruiseId") REFERENCES "NileCruise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Cruise bookings: which row priced it, and any tours added on top ─────────
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "cabinRateId" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "occupancy" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "cabinCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "scheduleId" TEXT;
CREATE INDEX IF NOT EXISTS "CruiseBooking_cabinRateId_idx" ON "CruiseBooking"("cabinRateId");
CREATE INDEX IF NOT EXISTS "CruiseBooking_scheduleId_idx" ON "CruiseBooking"("scheduleId");
DO $$ BEGIN
  ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_cabinRateId_fkey"
    FOREIGN KEY ("cabinRateId") REFERENCES "CruiseCabinRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "CruiseSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CruiseBookingActivity" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "activityId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "activityDate" TIMESTAMP(3),
    "paxCount" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CruiseBookingActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CruiseBookingActivity_bookingId_idx" ON "CruiseBookingActivity"("bookingId");
CREATE INDEX IF NOT EXISTS "CruiseBookingActivity_activityId_idx" ON "CruiseBookingActivity"("activityId");
DO $$ BEGIN
  ALTER TABLE "CruiseBookingActivity" ADD CONSTRAINT "CruiseBookingActivity_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "CruiseBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CruiseBookingActivity" ADD CONSTRAINT "CruiseBookingActivity_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- How many party units an activity booking was charged for (a "double" prices
-- two people, so six guests are three doubles). Existing rows keep 1, which is
-- what every party-priced booking taken before this change was charged.
ALTER TABLE "ActivityBooking" ADD COLUMN IF NOT EXISTS "pricingUnits" INTEGER NOT NULL DEFAULT 1;
