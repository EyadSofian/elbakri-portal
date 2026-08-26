-- A transfer requested alongside a price-on-request service must reach the
-- same Transport operations queue as a confirmed-in-app activity or cruise.
-- These columns mirror the existing ActivityBooking / CruiseBooking transfer
-- shape; all are additive, and old quotes remain "no transfer".
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "transferRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "transferFromType" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "transferFromName" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "transferToType" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "transferToName" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "transferPickupTime" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "transferReturnTime" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "transferNotes" TEXT;

CREATE INDEX IF NOT EXISTS "QuoteRequest_transferRequested_idx"
  ON "QuoteRequest"("transferRequested");
