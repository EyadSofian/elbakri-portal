-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL', 'RUNNING');

-- AlterTable
ALTER TABLE "Company"
ADD COLUMN "billingAddress" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "themeColor" TEXT,
ADD COLUMN "lastActivityAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HotelPricing" ADD COLUMN "sheetsRowId" TEXT;

-- AlterTable
ALTER TABLE "NileCruise" ADD COLUMN "sheetsRowId" TEXT;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "sheetsRowId" TEXT;

-- CreateTable
CREATE TABLE "TransportRate" (
    "id" TEXT NOT NULL,
    "sheetsRowId" TEXT,
    "type" "TransportType" NOT NULL DEFAULT 'PRIVATE_TRANSFER',
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'SEDAN',
    "city" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "rate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaFee" (
    "id" TEXT NOT NULL,
    "sheetsRowId" TEXT,
    "visaType" "VisaType" NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "processingType" "ProcessingType" NOT NULL DEFAULT 'NORMAL',
    "fee" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceptionServiceRate" (
    "id" TEXT NOT NULL,
    "sheetsRowId" TEXT,
    "serviceType" "ReceptionType" NOT NULL,
    "airport" "EgyptAirport",
    "rate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceptionServiceRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetsConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "spreadsheetId" TEXT,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" "SyncStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "spreadsheetId" TEXT,
    "status" "SyncStatus" NOT NULL,
    "synced" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelPricing_sheetsRowId_idx" ON "HotelPricing"("sheetsRowId");

-- CreateIndex
CREATE INDEX "NileCruise_sheetsRowId_idx" ON "NileCruise"("sheetsRowId");

-- CreateIndex
CREATE INDEX "Activity_sheetsRowId_idx" ON "Activity"("sheetsRowId");

-- CreateIndex
CREATE INDEX "TransportRate_sheetsRowId_idx" ON "TransportRate"("sheetsRowId");

-- CreateIndex
CREATE INDEX "TransportRate_type_idx" ON "TransportRate"("type");

-- CreateIndex
CREATE INDEX "TransportRate_vehicleType_idx" ON "TransportRate"("vehicleType");

-- CreateIndex
CREATE INDEX "VisaFee_sheetsRowId_idx" ON "VisaFee"("sheetsRowId");

-- CreateIndex
CREATE INDEX "VisaFee_visaType_idx" ON "VisaFee"("visaType");

-- CreateIndex
CREATE INDEX "VisaFee_destinationCountry_idx" ON "VisaFee"("destinationCountry");

-- CreateIndex
CREATE INDEX "ReceptionServiceRate_sheetsRowId_idx" ON "ReceptionServiceRate"("sheetsRowId");

-- CreateIndex
CREATE INDEX "ReceptionServiceRate_serviceType_idx" ON "ReceptionServiceRate"("serviceType");

-- CreateIndex
CREATE INDEX "ReceptionServiceRate_airport_idx" ON "ReceptionServiceRate"("airport");

-- CreateIndex
CREATE INDEX "SyncLog_entity_idx" ON "SyncLog"("entity");

-- CreateIndex
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");

-- CreateIndex
CREATE INDEX "SyncLog_createdAt_idx" ON "SyncLog"("createdAt");
