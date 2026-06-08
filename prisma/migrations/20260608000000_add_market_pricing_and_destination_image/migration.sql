-- CreateEnum
CREATE TYPE "Market" AS ENUM ('EGYPTIAN', 'GULF', 'FOREIGN');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "market" "Market" NOT NULL DEFAULT 'FOREIGN';

-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "priceUsd" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRateCache" (
    "id" TEXT NOT NULL DEFAULT 'latest',
    "base" TEXT NOT NULL DEFAULT 'USD',
    "rates" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxRateCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketPrice_entityType_entityId_idx" ON "MarketPrice"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPrice_entityType_entityId_market_key" ON "MarketPrice"("entityType", "entityId", "market");
