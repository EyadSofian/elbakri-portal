-- Every Nile cruise sells the same programmes and the same transfers, so both
-- may now be written once for the whole fleet: "cruiseId"/"scheduleId" become
-- nullable and "nights" says which sailing legs a shared row belongs to.
ALTER TABLE "CruiseProgramme" ALTER COLUMN "cruiseId" DROP NOT NULL;
ALTER TABLE "CruiseProgramme" ALTER COLUMN "scheduleId" DROP NOT NULL;
ALTER TABLE "CruiseProgramme" ADD COLUMN "nights" INTEGER;
CREATE INDEX "CruiseProgramme_nights_isActive_idx" ON "CruiseProgramme"("nights", "isActive");

ALTER TABLE "CruiseTransferRate" ALTER COLUMN "cruiseId" DROP NOT NULL;
ALTER TABLE "CruiseTransferRate" ALTER COLUMN "scheduleId" DROP NOT NULL;
ALTER TABLE "CruiseTransferRate" ADD COLUMN "nights" INTEGER;
CREATE INDEX "CruiseTransferRate_nights_market_isActive_idx"
  ON "CruiseTransferRate"("nights", "market", "isActive");

-- A programme is one price per adult, not three identical occupancy columns.
-- Existing rows keep their history and are read through the new column: double
-- is the amount an operator actually typed for nearly all of them, so it wins,
-- then single, then triple.
ALTER TABLE "CruiseProgrammeRate" ADD COLUMN "adultPrice" DECIMAL(10,2);
UPDATE "CruiseProgrammeRate"
   SET "adultPrice" = COALESCE("doublePrice", "singlePrice", "triplePrice")
 WHERE "adultPrice" IS NULL;

-- A transfer is quoted one-way or both ways, per seat or per car. Existing
-- rows were per-person one-way amounts, which is what the defaults preserve.
ALTER TABLE "CruiseTransferRate" ADD COLUMN "roundTripAmount" DECIMAL(10,2);
ALTER TABLE "CruiseTransferRate" ADD COLUMN "perPerson" BOOLEAN NOT NULL DEFAULT true;

-- How many seats a booked transfer was priced for, and whether it comes back.
ALTER TABLE "CruiseBooking" ADD COLUMN "transferPax" INTEGER;
ALTER TABLE "CruiseBooking" ADD COLUMN "transferRoundTrip" BOOLEAN NOT NULL DEFAULT false;

-- The same two answers on a quote request: an agent asking for a price still
-- has to tell Transport how many people the car collects and whether it waits.
ALTER TABLE "QuoteRequest" ADD COLUMN "transferPax" INTEGER;
ALTER TABLE "QuoteRequest" ADD COLUMN "transferRoundTrip" BOOLEAN NOT NULL DEFAULT false;
