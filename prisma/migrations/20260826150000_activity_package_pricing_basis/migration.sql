-- Activity package lines use the same explicit pricing basis as standalone
-- activity bookings. Existing lines were priced per person, so that is the
-- safe backfill/default; pricingUnits is the number of party units charged.
ALTER TABLE "ActivityPackageItem"
  ADD COLUMN IF NOT EXISTS "pricingBasis" TEXT DEFAULT 'PER_PERSON';

ALTER TABLE "ActivityPackageItem"
  ADD COLUMN IF NOT EXISTS "pricingUnits" INTEGER NOT NULL DEFAULT 1;
