-- Catalogue rows are commercial references. Removing them from the current
-- editor retires them from future sales instead of deleting rows referenced by
-- historical bookings.
ALTER TABLE "CruiseSchedule" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "CruiseCabinRate" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "CruiseProgramme" ADD COLUMN IF NOT EXISTS "catalogueKey" TEXT;
ALTER TABLE "CruiseProgramme" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "CruiseProgrammeRate" ADD COLUMN IF NOT EXISTS "catalogueKey" TEXT;
ALTER TABLE "CruiseProgrammeRate" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "CruiseTransferRate" ADD COLUMN IF NOT EXISTS "catalogueKey" TEXT;
ALTER TABLE "CruiseTransferRate" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CruiseSchedule_cruiseId_retiredAt_idx" ON "CruiseSchedule"("cruiseId", "retiredAt");
CREATE INDEX IF NOT EXISTS "CruiseCabinRate_cruiseId_retiredAt_idx" ON "CruiseCabinRate"("cruiseId", "retiredAt");
CREATE INDEX IF NOT EXISTS "CruiseProgramme_cruiseId_catalogueKey_idx" ON "CruiseProgramme"("cruiseId", "catalogueKey");
CREATE INDEX IF NOT EXISTS "CruiseProgramme_cruiseId_retiredAt_idx" ON "CruiseProgramme"("cruiseId", "retiredAt");
CREATE INDEX IF NOT EXISTS "CruiseProgrammeRate_programmeId_catalogueKey_idx" ON "CruiseProgrammeRate"("programmeId", "catalogueKey");
CREATE INDEX IF NOT EXISTS "CruiseProgrammeRate_programmeId_retiredAt_idx" ON "CruiseProgrammeRate"("programmeId", "retiredAt");
CREATE INDEX IF NOT EXISTS "CruiseTransferRate_cruiseId_catalogueKey_idx" ON "CruiseTransferRate"("cruiseId", "catalogueKey");
CREATE INDEX IF NOT EXISTS "CruiseTransferRate_cruiseId_retiredAt_idx" ON "CruiseTransferRate"("cruiseId", "retiredAt");

-- Typed snapshots preserve the commercial wording even after catalogue labels
-- are legitimately edited for future sales.
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "cruiseNameSnapshot" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "fareNameSnapshot" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "programmeNameSnapshot" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "programmeDescriptionSnapshot" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "programmeNightsSnapshot" INTEGER;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "scheduleDepartureDaySnapshot" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "scheduleReturnDaySnapshot" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferPricePerVehicleSnapshot" DECIMAL(12,2);

-- A quote keeps the server-derived catalogue price separate from the later
-- operations-team quote amount. Client preview numbers never fill these.
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "resolvedAmount" DECIMAL(12,2);
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "resolvedCurrency" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "pricingValidatedAt" TIMESTAMP(3);
