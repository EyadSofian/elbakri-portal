-- Transport domain redesign + SIM unit-price snapshot.
-- Fully additive: new enum, nullable/defaulted columns, indexes, one FK.
-- Safe to apply to existing data (existing TransportRate rows default to
-- POINT_TO_POINT; existing bookings keep working via the legacy from/to columns).

-- CreateEnum
CREATE TYPE "TransportServiceMode" AS ENUM ('POINT_TO_POINT', 'AIRPORT_TRANSFER', 'HOURLY_CHARTER', 'DAY_USE');

-- AlterTable: TransportRate — priced-product descriptor
ALTER TABLE "TransportRate"
  ADD COLUMN "serviceMode" "TransportServiceMode" NOT NULL DEFAULT 'POINT_TO_POINT',
  ADD COLUMN "serviceNameEn" TEXT,
  ADD COLUMN "serviceNameAr" TEXT,
  ADD COLUMN "serviceArea" TEXT,
  ADD COLUMN "durationHours" INTEGER;

-- AlterTable: TransportBooking — actual journey captured independently of rate labels
ALTER TABLE "TransportBooking"
  ADD COLUMN "serviceMode" "TransportServiceMode",
  ADD COLUMN "rateId" TEXT,
  ADD COLUMN "pickupType" TEXT,
  ADD COLUMN "pickupLocation" TEXT,
  ADD COLUMN "pickupAddress" TEXT,
  ADD COLUMN "dropoffType" TEXT,
  ADD COLUMN "dropoffLocation" TEXT,
  ADD COLUMN "dropoffAddress" TEXT,
  ADD COLUMN "sameRouteReversed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "returnPickupAddress" TEXT,
  ADD COLUMN "returnDropoffAddress" TEXT;

-- AlterTable: SimRequest — explicit unit-price snapshot (no FX); total = unitAmount × quantity
ALTER TABLE "SimRequest"
  ADD COLUMN "unitAmount" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "TransportRate_serviceMode_idx" ON "TransportRate"("serviceMode");
CREATE INDEX "TransportBooking_rateId_idx" ON "TransportBooking"("rateId");

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "TransportRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
