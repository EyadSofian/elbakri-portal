-- CreateEnum
CREATE TYPE "MealPlan" AS ENUM ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE', 'ULTRA_ALL_INCLUSIVE');

-- AlterTable
ALTER TABLE "AirportReception" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "ticketUrl" TEXT,
ADD COLUMN     "travelDetails" TEXT;

-- AlterTable
ALTER TABLE "Destination" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "childAges" JSONB,
ADD COLUMN     "mealPlan" "MealPlan",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VisaApplication" ADD COLUMN     "flightTicketUrl" TEXT,
ADD COLUMN     "hotelName" TEXT,
ADD COLUMN     "passportUrl" TEXT,
ADD COLUMN     "paxCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "imageUrl" TEXT,
    "serviceType" TEXT,
    "ctaLabel" TEXT,
    "ctaLabelAr" TEXT,
    "ctaAction" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "dataSize" TEXT NOT NULL,
    "minutes" TEXT,
    "validity" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimRequest" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "packageId" TEXT,
    "clientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "arrivalDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_isActive_idx" ON "Offer"("isActive");

-- CreateIndex
CREATE INDEX "Offer_priority_idx" ON "Offer"("priority");

-- CreateIndex
CREATE INDEX "SimPackage_isActive_idx" ON "SimPackage"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SimRequest_refNumber_key" ON "SimRequest"("refNumber");

-- CreateIndex
CREATE INDEX "SimRequest_companyId_idx" ON "SimRequest"("companyId");

-- CreateIndex
CREATE INDEX "SimRequest_status_idx" ON "SimRequest"("status");

-- AddForeignKey
ALTER TABLE "SimRequest" ADD CONSTRAINT "SimRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimRequest" ADD CONSTRAINT "SimRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimRequest" ADD CONSTRAINT "SimRequest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SimPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
