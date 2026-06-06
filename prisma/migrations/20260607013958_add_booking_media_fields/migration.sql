-- AlterTable: Booking.com media enrichment fields on Hotel
ALTER TABLE "Hotel" ADD COLUMN     "bookingHotelId" TEXT,
ADD COLUMN     "bookingUrl" TEXT,
ADD COLUMN     "bookingMatchedName" TEXT,
ADD COLUMN     "bookingMatchScore" DECIMAL(4,3),
ADD COLUMN     "mediaNeedsManualReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Hotel_bookingHotelId_idx" ON "Hotel"("bookingHotelId");

-- CreateTable
CREATE TABLE "HotelMediaSyncLog" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "city" TEXT,
    "actorId" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "manualReview" INTEGER NOT NULL DEFAULT 0,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "photoRows" INTEGER NOT NULL DEFAULT 0,
    "triggeredById" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelMediaSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelMediaSyncLog_stage_idx" ON "HotelMediaSyncLog"("stage");

-- CreateIndex
CREATE INDEX "HotelMediaSyncLog_status_idx" ON "HotelMediaSyncLog"("status");

-- CreateIndex
CREATE INDEX "HotelMediaSyncLog_createdAt_idx" ON "HotelMediaSyncLog"("createdAt");
