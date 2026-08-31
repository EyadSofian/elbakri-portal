-- Turn commercial packages into validated business products without rewriting
-- the legacy JSON. Existing PACKAGE rows are marked for explicit admin review;
-- no free-text identifier is guessed into a foreign key.
ALTER TABLE "Offer"
  ADD COLUMN "packageNeedsConfiguration" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Offer"
SET "packageNeedsConfiguration" = true
WHERE "kind" = 'PACKAGE';

ALTER TABLE "QuoteRequest"
  ADD COLUMN "commercialPackageId" TEXT,
  ADD COLUMN "commercialPackagePricePeriodId" TEXT;

CREATE TABLE "CommercialPackageHotel" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "hotelRateId" TEXT,
  "nights" INTEGER NOT NULL DEFAULT 1,
  "mealPlan" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialPackageHotel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialPackageTransfer" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "transportRateId" TEXT NOT NULL,
  "included" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialPackageTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialPackageActivity" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "dayNumber" INTEGER,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialPackageActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialPackagePricePeriod" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "market" "Market" NOT NULL,
  "currency" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3) NOT NULL,
  "singlePrice" DECIMAL(12,2) NOT NULL,
  "doublePrice" DECIMAL(12,2) NOT NULL,
  "triplePrice" DECIMAL(12,2) NOT NULL,
  "childPrice" DECIMAL(12,2) NOT NULL,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialPackagePricePeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommercialPackageHotel_offerId_retiredAt_idx" ON "CommercialPackageHotel"("offerId", "retiredAt");
CREATE INDEX "CommercialPackageHotel_hotelId_idx" ON "CommercialPackageHotel"("hotelId");
CREATE INDEX "CommercialPackageHotel_hotelRateId_idx" ON "CommercialPackageHotel"("hotelRateId");
CREATE INDEX "CommercialPackageTransfer_offerId_retiredAt_idx" ON "CommercialPackageTransfer"("offerId", "retiredAt");
CREATE INDEX "CommercialPackageTransfer_transportRateId_idx" ON "CommercialPackageTransfer"("transportRateId");
CREATE INDEX "CommercialPackageActivity_offerId_retiredAt_idx" ON "CommercialPackageActivity"("offerId", "retiredAt");
CREATE INDEX "CommercialPackageActivity_activityId_idx" ON "CommercialPackageActivity"("activityId");
CREATE INDEX "CommercialPackagePricePeriod_offerId_market_validFrom_validTo_idx" ON "CommercialPackagePricePeriod"("offerId", "market", "validFrom", "validTo");
CREATE INDEX "CommercialPackagePricePeriod_offerId_retiredAt_idx" ON "CommercialPackagePricePeriod"("offerId", "retiredAt");
CREATE INDEX "QuoteRequest_commercialPackageId_idx" ON "QuoteRequest"("commercialPackageId");
CREATE INDEX "QuoteRequest_commercialPackagePricePeriodId_idx" ON "QuoteRequest"("commercialPackagePricePeriodId");

ALTER TABLE "CommercialPackageHotel" ADD CONSTRAINT "CommercialPackageHotel_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialPackageHotel" ADD CONSTRAINT "CommercialPackageHotel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialPackageHotel" ADD CONSTRAINT "CommercialPackageHotel_hotelRateId_fkey" FOREIGN KEY ("hotelRateId") REFERENCES "HotelRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialPackageTransfer" ADD CONSTRAINT "CommercialPackageTransfer_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialPackageTransfer" ADD CONSTRAINT "CommercialPackageTransfer_transportRateId_fkey" FOREIGN KEY ("transportRateId") REFERENCES "TransportRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialPackageActivity" ADD CONSTRAINT "CommercialPackageActivity_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialPackageActivity" ADD CONSTRAINT "CommercialPackageActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialPackagePricePeriod" ADD CONSTRAINT "CommercialPackagePricePeriod_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_commercialPackageId_fkey" FOREIGN KEY ("commercialPackageId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_commercialPackagePricePeriodId_fkey" FOREIGN KEY ("commercialPackagePricePeriodId") REFERENCES "CommercialPackagePricePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
