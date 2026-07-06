-- Phase 1: Requested & Confirmed dates
-- Adds requestedAt (audit "Date Requested"), confirmedAt ("Date Confirmed") and
-- confirmedById (the admin who confirmed) to every customer request/booking model.
-- Existing rows are backfilled: requestedAt <- createdAt, and confirmedAt is set
-- for rows already in a confirmed/approved state so historical audit data is sane.

-- ─────────────────────────────────────────────
-- AlterTable: add columns
-- ─────────────────────────────────────────────

ALTER TABLE "Booking"
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedById" TEXT;

ALTER TABLE "QuoteRequest"
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT;

ALTER TABLE "CruiseBooking"
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT;

ALTER TABLE "TransportBooking"
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT;

ALTER TABLE "ActivityBooking"
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT;

ALTER TABLE "VisaApplication"
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT;

ALTER TABLE "AirportReception"
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT;

ALTER TABLE "SimRequest"
  ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT;

-- ─────────────────────────────────────────────
-- Backfill requestedAt from createdAt (accurate historical request time)
-- ─────────────────────────────────────────────

UPDATE "Booking"          SET "requestedAt" = "createdAt";
UPDATE "QuoteRequest"     SET "requestedAt" = "createdAt";
UPDATE "CruiseBooking"    SET "requestedAt" = "createdAt";
UPDATE "TransportBooking" SET "requestedAt" = "createdAt";
UPDATE "ActivityBooking"  SET "requestedAt" = "createdAt";
UPDATE "VisaApplication"  SET "requestedAt" = "createdAt";
UPDATE "AirportReception" SET "requestedAt" = "createdAt";
UPDATE "SimRequest"       SET "requestedAt" = "createdAt";

-- ─────────────────────────────────────────────
-- Backfill confirmedAt for rows already in a confirmed/approved state
-- ─────────────────────────────────────────────

UPDATE "Booking"          SET "confirmedAt" = "updatedAt"
  WHERE "status" IN ('CONFIRMED', 'COMPLETED') AND "confirmedAt" IS NULL;
UPDATE "QuoteRequest"     SET "confirmedAt" = COALESCE("respondedAt", "updatedAt")
  WHERE "status" = 'ACCEPTED';
UPDATE "CruiseBooking"    SET "confirmedAt" = "updatedAt"
  WHERE "status" IN ('CONFIRMED', 'COMPLETED');
UPDATE "TransportBooking" SET "confirmedAt" = "updatedAt"
  WHERE "status" IN ('CONFIRMED', 'COMPLETED');
UPDATE "ActivityBooking"  SET "confirmedAt" = "updatedAt"
  WHERE "status" IN ('CONFIRMED', 'COMPLETED');
UPDATE "VisaApplication"  SET "confirmedAt" = COALESCE("approvedAt", "updatedAt")
  WHERE "status" = 'APPROVED';
UPDATE "AirportReception" SET "confirmedAt" = "updatedAt"
  WHERE "status" IN ('CONFIRMED', 'COMPLETED');
UPDATE "SimRequest"       SET "confirmedAt" = "updatedAt"
  WHERE "status" IN ('CONFIRMED', 'COMPLETED');

-- ─────────────────────────────────────────────
-- CreateIndex
-- ─────────────────────────────────────────────

CREATE INDEX "Booking_confirmedById_idx"          ON "Booking"("confirmedById");
CREATE INDEX "QuoteRequest_confirmedById_idx"      ON "QuoteRequest"("confirmedById");
CREATE INDEX "CruiseBooking_confirmedById_idx"     ON "CruiseBooking"("confirmedById");
CREATE INDEX "TransportBooking_confirmedById_idx"  ON "TransportBooking"("confirmedById");
CREATE INDEX "ActivityBooking_confirmedById_idx"   ON "ActivityBooking"("confirmedById");
CREATE INDEX "VisaApplication_confirmedById_idx"   ON "VisaApplication"("confirmedById");
CREATE INDEX "AirportReception_confirmedById_idx"  ON "AirportReception"("confirmedById");
CREATE INDEX "SimRequest_confirmedById_idx"        ON "SimRequest"("confirmedById");

-- ─────────────────────────────────────────────
-- AddForeignKey: confirmedById -> User(id)
-- ─────────────────────────────────────────────

ALTER TABLE "Booking"          ADD CONSTRAINT "Booking_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteRequest"     ADD CONSTRAINT "QuoteRequest_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CruiseBooking"    ADD CONSTRAINT "CruiseBooking_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityBooking"  ADD CONSTRAINT "ActivityBooking_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisaApplication"  ADD CONSTRAINT "VisaApplication_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AirportReception" ADD CONSTRAINT "AirportReception_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SimRequest"       ADD CONSTRAINT "SimRequest_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
