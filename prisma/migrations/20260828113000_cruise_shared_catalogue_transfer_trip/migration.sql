ALTER TABLE "CruiseTransferRate"
  ADD COLUMN IF NOT EXISTS "roundTripAmount" DECIMAL(10,2);

ALTER TABLE "CruiseBooking"
  ADD COLUMN IF NOT EXISTS "transferTripType" TEXT,
  ADD COLUMN IF NOT EXISTS "transferPaxCount" INTEGER;

ALTER TABLE "QuoteRequest"
  ADD COLUMN IF NOT EXISTS "transferTripType" TEXT,
  ADD COLUMN IF NOT EXISTS "transferPaxCount" INTEGER;

CREATE TABLE IF NOT EXISTS "CruiseSharedCatalogue" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "programmes" JSONB NOT NULL,
  "transferRates" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CruiseSharedCatalogue_pkey" PRIMARY KEY ("id")
);
