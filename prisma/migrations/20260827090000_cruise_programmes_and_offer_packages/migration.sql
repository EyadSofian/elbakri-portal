-- Nile cruise fares are now per person and tied to an exact sailing schedule.
ALTER TABLE "CruiseCabinRate"
  ADD COLUMN "scheduleId" TEXT,
  ADD COLUMN "childPrice" DECIMAL(10,2),
  ADD COLUMN "supplements" JSONB;

CREATE INDEX "CruiseCabinRate_scheduleId_idx" ON "CruiseCabinRate"("scheduleId");
ALTER TABLE "CruiseCabinRate"
  ADD CONSTRAINT "CruiseCabinRate_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "CruiseSchedule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CruiseProgramme" (
  "id" TEXT NOT NULL,
  "cruiseId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameAr" TEXT,
  "description" TEXT,
  "descriptionAr" TEXT,
  "itinerary" JSONB,
  "transferIncluded" BOOLEAN NOT NULL DEFAULT true,
  "transferFromName" TEXT,
  "transferToName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CruiseProgramme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CruiseProgramme_cruiseId_idx" ON "CruiseProgramme"("cruiseId");
CREATE INDEX "CruiseProgramme_scheduleId_idx" ON "CruiseProgramme"("scheduleId");
CREATE INDEX "CruiseProgramme_cruiseId_isActive_idx" ON "CruiseProgramme"("cruiseId", "isActive");
ALTER TABLE "CruiseProgramme" ADD CONSTRAINT "CruiseProgramme_cruiseId_fkey"
  FOREIGN KEY ("cruiseId") REFERENCES "NileCruise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CruiseProgramme" ADD CONSTRAINT "CruiseProgramme_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "CruiseSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CruiseProgrammeRate" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "market" "Market" NOT NULL,
  "currency" TEXT NOT NULL,
  "singlePrice" DECIMAL(10,2),
  "doublePrice" DECIMAL(10,2),
  "triplePrice" DECIMAL(10,2),
  "childPrice" DECIMAL(10,2),
  "supplements" JSONB,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CruiseProgrammeRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CruiseProgrammeRate_programmeId_idx" ON "CruiseProgrammeRate"("programmeId");
CREATE INDEX "CruiseProgrammeRate_programmeId_market_isActive_idx" ON "CruiseProgrammeRate"("programmeId", "market", "isActive");
ALTER TABLE "CruiseProgrammeRate" ADD CONSTRAINT "CruiseProgrammeRate_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "CruiseProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CruiseTransferRate" (
  "id" TEXT NOT NULL,
  "cruiseId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "market" "Market" NOT NULL,
  "fromLocation" TEXT NOT NULL,
  "toLocation" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CruiseTransferRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CruiseTransferRate_cruiseId_idx" ON "CruiseTransferRate"("cruiseId");
CREATE INDEX "CruiseTransferRate_scheduleId_idx" ON "CruiseTransferRate"("scheduleId");
CREATE INDEX "CruiseTransferRate_cruiseId_market_isActive_idx" ON "CruiseTransferRate"("cruiseId", "market", "isActive");
ALTER TABLE "CruiseTransferRate" ADD CONSTRAINT "CruiseTransferRate_cruiseId_fkey"
  FOREIGN KEY ("cruiseId") REFERENCES "NileCruise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CruiseTransferRate" ADD CONSTRAINT "CruiseTransferRate_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "CruiseSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Offer"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'OFFER',
  ADD COLUMN "hotelItems" JSONB,
  ADD COLUMN "transferItems" JSONB,
  ADD COLUMN "activityItems" JSONB,
  ADD COLUMN "pricingPeriods" JSONB;

ALTER TABLE "CruiseBooking"
  ADD COLUMN "programmeId" TEXT,
  ADD COLUMN "programmeRateId" TEXT,
  ADD COLUMN "transferRateId" TEXT,
  ADD COLUMN "selectedSupplements" JSONB,
  ADD COLUMN "adultUnitPrice" DECIMAL(10,2),
  ADD COLUMN "childUnitPrice" DECIMAL(10,2);

CREATE INDEX "CruiseBooking_programmeId_idx" ON "CruiseBooking"("programmeId");
CREATE INDEX "CruiseBooking_programmeRateId_idx" ON "CruiseBooking"("programmeRateId");
CREATE INDEX "CruiseBooking_transferRateId_idx" ON "CruiseBooking"("transferRateId");
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "CruiseProgramme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_programmeRateId_fkey"
  FOREIGN KEY ("programmeRateId") REFERENCES "CruiseProgrammeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_transferRateId_fkey"
  FOREIGN KEY ("transferRateId") REFERENCES "CruiseTransferRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
