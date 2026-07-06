ALTER TYPE "Market" ADD VALUE IF NOT EXISTS 'INTERNATIONAL';

CREATE TYPE "ServiceScope" AS ENUM ('ACTIVITY', 'TRANSPORT');
CREATE TYPE "PricingAdjustmentType" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');

ALTER TABLE "Booking"
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3);

ALTER TABLE "Invoice"
  ADD COLUMN "sourceSubtotal" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3);

ALTER TABLE "Invoice"
  ALTER COLUMN "taxRate" SET DEFAULT 0;

ALTER TABLE "TransportBooking"
  ADD COLUMN "groupTypeId" TEXT,
  ADD COLUMN "groupTypeLabel" TEXT,
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3);

ALTER TABLE "ActivityBooking"
  ADD COLUMN "groupTypeId" TEXT,
  ADD COLUMN "groupTypeLabel" TEXT,
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3);

ALTER TABLE "VisaApplication"
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3);

ALTER TABLE "CruiseBooking"
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3);

ALTER TABLE "AirportReception"
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3);

ALTER TABLE "SimRequest"
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3);

ALTER TABLE "Invoice"
  ADD COLUMN "cruiseBookingId" TEXT,
  ADD COLUMN "visaApplicationId" TEXT,
  ADD COLUMN "simRequestId" TEXT;

CREATE TABLE "ServiceGroupType" (
  "id" TEXT NOT NULL,
  "scope" "ServiceScope" NOT NULL,
  "code" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "labelAr" TEXT,
  "descriptionEn" TEXT,
  "descriptionAr" TEXT,
  "destinationId" TEXT,
  "activityId" TEXT,
  "transportRateId" TEXT,
  "adjustmentType" "PricingAdjustmentType" NOT NULL DEFAULT 'NONE',
  "adjustmentValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "minPax" INTEGER NOT NULL DEFAULT 1,
  "maxPax" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceGroupType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsolidatedInvoice" (
  "id" TEXT NOT NULL,
  "statementNumber" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdById" TEXT,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "subtotal" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
  "pdfPath" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsolidatedInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsolidatedInvoiceLine" (
  "id" TEXT NOT NULL,
  "consolidatedInvoiceId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "refNumber" TEXT,
  "service" TEXT NOT NULL,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "InvoiceStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceGroupType_scope_code_destinationId_activityId_transportRateId_key"
  ON "ServiceGroupType"("scope", "code", "destinationId", "activityId", "transportRateId");
CREATE INDEX "ServiceGroupType_scope_isActive_idx" ON "ServiceGroupType"("scope", "isActive");
CREATE INDEX "ServiceGroupType_destinationId_idx" ON "ServiceGroupType"("destinationId");
CREATE INDEX "ServiceGroupType_activityId_idx" ON "ServiceGroupType"("activityId");
CREATE INDEX "ServiceGroupType_transportRateId_idx" ON "ServiceGroupType"("transportRateId");
CREATE INDEX "TransportBooking_groupTypeId_idx" ON "TransportBooking"("groupTypeId");
CREATE INDEX "ActivityBooking_groupTypeId_idx" ON "ActivityBooking"("groupTypeId");
CREATE UNIQUE INDEX "Invoice_cruiseBookingId_key" ON "Invoice"("cruiseBookingId");
CREATE UNIQUE INDEX "Invoice_visaApplicationId_key" ON "Invoice"("visaApplicationId");
CREATE UNIQUE INDEX "Invoice_simRequestId_key" ON "Invoice"("simRequestId");

CREATE UNIQUE INDEX "ConsolidatedInvoice_statementNumber_key" ON "ConsolidatedInvoice"("statementNumber");
CREATE INDEX "ConsolidatedInvoice_companyId_idx" ON "ConsolidatedInvoice"("companyId");
CREATE INDEX "ConsolidatedInvoice_status_idx" ON "ConsolidatedInvoice"("status");
CREATE INDEX "ConsolidatedInvoice_createdAt_idx" ON "ConsolidatedInvoice"("createdAt");
CREATE UNIQUE INDEX "ConsolidatedInvoiceLine_invoiceId_key" ON "ConsolidatedInvoiceLine"("invoiceId");
CREATE INDEX "ConsolidatedInvoiceLine_consolidatedInvoiceId_idx"
  ON "ConsolidatedInvoiceLine"("consolidatedInvoiceId");

ALTER TABLE "ServiceGroupType"
  ADD CONSTRAINT "ServiceGroupType_destinationId_fkey"
  FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceGroupType"
  ADD CONSTRAINT "ServiceGroupType_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceGroupType"
  ADD CONSTRAINT "ServiceGroupType_transportRateId_fkey"
  FOREIGN KEY ("transportRateId") REFERENCES "TransportRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportBooking"
  ADD CONSTRAINT "TransportBooking_groupTypeId_fkey"
  FOREIGN KEY ("groupTypeId") REFERENCES "ServiceGroupType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityBooking"
  ADD CONSTRAINT "ActivityBooking_groupTypeId_fkey"
  FOREIGN KEY ("groupTypeId") REFERENCES "ServiceGroupType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_cruiseBookingId_fkey"
  FOREIGN KEY ("cruiseBookingId") REFERENCES "CruiseBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_visaApplicationId_fkey"
  FOREIGN KEY ("visaApplicationId") REFERENCES "VisaApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_simRequestId_fkey"
  FOREIGN KEY ("simRequestId") REFERENCES "SimRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsolidatedInvoice"
  ADD CONSTRAINT "ConsolidatedInvoice_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsolidatedInvoice"
  ADD CONSTRAINT "ConsolidatedInvoice_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsolidatedInvoiceLine"
  ADD CONSTRAINT "ConsolidatedInvoiceLine_consolidatedInvoiceId_fkey"
  FOREIGN KEY ("consolidatedInvoiceId") REFERENCES "ConsolidatedInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsolidatedInvoiceLine"
  ADD CONSTRAINT "ConsolidatedInvoiceLine_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
