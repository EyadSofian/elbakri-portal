-- Nile-cruise optional transfers are sold per vehicle, with an explicit
-- journey type and capacity. Existing one-way rows remain usable as VAN_6;
-- legacy round-trip amounts are materialised as separate products the next
-- time the shared catalogue is saved.
ALTER TABLE "CruiseTransferRate"
  ADD COLUMN "tripType" TEXT NOT NULL DEFAULT 'ONE_WAY',
  ADD COLUMN "vehicleType" "VehicleType" NOT NULL DEFAULT 'VAN_6',
  ADD COLUMN "vehicleCapacity" INTEGER NOT NULL DEFAULT 6;

ALTER TABLE "CruiseBooking"
  ADD COLUMN "transferVehicleType" TEXT,
  ADD COLUMN "transferVehicleCapacity" INTEGER,
  ADD COLUMN "transferVehicleCount" INTEGER;

ALTER TABLE "QuoteRequest"
  ADD COLUMN "transferVehicleType" TEXT,
  ADD COLUMN "transferVehicleCapacity" INTEGER,
  ADD COLUMN "transferVehicleCount" INTEGER;

CREATE INDEX "CruiseTransferRate_vehicleType_idx" ON "CruiseTransferRate"("vehicleType");
