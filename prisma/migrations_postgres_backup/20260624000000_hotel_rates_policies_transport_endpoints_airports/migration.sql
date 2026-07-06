-- Additive migration: structured hotel rate matrix + supplements, hotel
-- policies, typed transport endpoints + dual EGP/USD + bidirectional routes,
-- and an admin-managed Airport table. No destructive operations.

-- CreateEnum
CREATE TYPE "TransportEndpointType" AS ENUM ('AIRPORT', 'HOTEL', 'DESTINATION');

-- CreateEnum
CREATE TYPE "HotelSupplementType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE', 'TEXT_ONLY');

-- AlterTable: Hotel policies
ALTER TABLE "Hotel" ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "cancellationPolicyAr" TEXT,
ADD COLUMN     "checkInTime" TEXT,
ADD COLUMN     "checkOutTime" TEXT,
ADD COLUMN     "childrenPolicy" TEXT,
ADD COLUMN     "childrenPolicyAr" TEXT,
ADD COLUMN     "extraBedPolicy" TEXT,
ADD COLUMN     "extraBedPolicyAr" TEXT,
ADD COLUMN     "importantNotes" TEXT,
ADD COLUMN     "importantNotesAr" TEXT,
ADD COLUMN     "mealPolicy" TEXT,
ADD COLUMN     "mealPolicyAr" TEXT;

-- AlterTable: TransportBooking direction metadata
ALTER TABLE "TransportBooking" ADD COLUMN     "matchedDirection" TEXT;

-- AlterTable: TransportRate typed endpoints + dual pricing + bidirectional
ALTER TABLE "TransportRate" ADD COLUMN     "fromId" TEXT,
ADD COLUMN     "fromName" TEXT,
ADD COLUMN     "fromType" "TransportEndpointType",
ADD COLUMN     "isBidirectional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceEgp" DECIMAL(10,2),
ADD COLUMN     "priceUsd" DECIMAL(10,2),
ADD COLUMN     "roundTripPriceEgp" DECIMAL(10,2),
ADD COLUMN     "roundTripPriceUsd" DECIMAL(10,2),
ADD COLUMN     "toId" TEXT,
ADD COLUMN     "toName" TEXT,
ADD COLUMN     "toType" "TransportEndpointType";

-- CreateTable
CREATE TABLE "HotelRate" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "market" "Market",
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "singlePrice" DECIMAL(10,2),
    "doublePrice" DECIMAL(10,2),
    "triplePrice" DECIMAL(10,2),
    "mealPlan" "MealPlan",
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRateSupplement" (
    "id" TEXT NOT NULL,
    "rateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HotelSupplementType" NOT NULL DEFAULT 'TEXT_ONLY',
    "amount" DECIMAL(10,2),
    "currency" TEXT,
    "notes" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRateSupplement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Airport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "city" TEXT,
    "cityAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Airport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelRate_hotelId_idx" ON "HotelRate"("hotelId");

-- CreateIndex
CREATE INDEX "HotelRate_hotelId_isActive_idx" ON "HotelRate"("hotelId", "isActive");

-- CreateIndex
CREATE INDEX "HotelRateSupplement_rateId_idx" ON "HotelRateSupplement"("rateId");

-- CreateIndex
CREATE UNIQUE INDEX "Airport_code_key" ON "Airport"("code");

-- CreateIndex
CREATE INDEX "Airport_isActive_idx" ON "Airport"("isActive");

-- CreateIndex
CREATE INDEX "TransportRate_fromType_fromId_idx" ON "TransportRate"("fromType", "fromId");

-- CreateIndex
CREATE INDEX "TransportRate_toType_toId_idx" ON "TransportRate"("toType", "toId");

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRateSupplement" ADD CONSTRAINT "HotelRateSupplement_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "HotelRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
