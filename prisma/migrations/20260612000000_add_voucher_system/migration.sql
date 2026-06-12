-- CreateTable: Voucher (customer-facing document, no price)
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "transportBookingId" TEXT,
    "activityBookingId" TEXT,
    "visaApplicationId" TEXT,
    "airportReceptionId" TEXT,
    "simRequestId" TEXT,
    "companyId" TEXT NOT NULL,
    "clientName" TEXT,
    "pdfPath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VoucherCounter
CREATE TABLE "VoucherCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VoucherCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_voucherNumber_key" ON "Voucher"("voucherNumber");
CREATE UNIQUE INDEX "Voucher_transportBookingId_key" ON "Voucher"("transportBookingId");
CREATE UNIQUE INDEX "Voucher_activityBookingId_key" ON "Voucher"("activityBookingId");
CREATE UNIQUE INDEX "Voucher_visaApplicationId_key" ON "Voucher"("visaApplicationId");
CREATE UNIQUE INDEX "Voucher_airportReceptionId_key" ON "Voucher"("airportReceptionId");
CREATE UNIQUE INDEX "Voucher_simRequestId_key" ON "Voucher"("simRequestId");
CREATE INDEX "Voucher_companyId_idx" ON "Voucher"("companyId");
CREATE INDEX "Voucher_serviceType_idx" ON "Voucher"("serviceType");
CREATE INDEX "Voucher_createdAt_idx" ON "Voucher"("createdAt");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_transportBookingId_fkey" FOREIGN KEY ("transportBookingId") REFERENCES "TransportBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_activityBookingId_fkey" FOREIGN KEY ("activityBookingId") REFERENCES "ActivityBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_visaApplicationId_fkey" FOREIGN KEY ("visaApplicationId") REFERENCES "VisaApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_airportReceptionId_fkey" FOREIGN KEY ("airportReceptionId") REFERENCES "AirportReception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_simRequestId_fkey" FOREIGN KEY ("simRequestId") REFERENCES "SimRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed Security Approval (VisaFee) rates from MEA workbook
-- SSH (Sharm El Sheikh): 15 USD/pax
-- CAI (Cairo): 140 USD/pax
-- HBE (Borg El Arab): 140 USD/pax (same as Cairo)
INSERT INTO "VisaFee" ("id", "visaType", "destinationCountry", "processingType", "fee", "currency", "notes", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'TOURIST', 'SSH', 'NORMAL', 15, 'USD', 'Sharm El Sheikh security approval — 15 USD/pax (MEA 2026)', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'TOURIST', 'CAI', 'NORMAL', 140, 'USD', 'Cairo security approval — 140 USD/pax (MEA 2026)', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'TOURIST', 'HBE', 'NORMAL', 140, 'USD', 'Borg El Arab security approval — 140 USD/pax (MEA 2026)', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Seed Airport Assist (ReceptionServiceRate) rates from MEA workbook
-- SSH: 15 USD/pax (Meet & Greet)
-- CAI: 20 USD/pax (Meet & Greet)
INSERT INTO "ReceptionServiceRate" ("id", "serviceType", "airport", "rate", "currency", "notes", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'MEET_AND_GREET', 'SSH', 15, 'USD', 'Sharm El Sheikh airport meet & greet — 15 USD/pax (MEA 2026)', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'MEET_AND_GREET', 'CAI', 20, 'USD', 'Cairo airport meet & greet — 20 USD/pax (MEA 2026)', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'AHLAN_SERVICE',   'SSH', 15, 'USD', 'Sharm El Sheikh Ahlan service — 15 USD/pax (MEA 2026)', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'AHLAN_SERVICE',   'CAI', 20, 'USD', 'Cairo Ahlan service — 20 USD/pax (MEA 2026)', true, NOW(), NOW())
ON CONFLICT DO NOTHING;
