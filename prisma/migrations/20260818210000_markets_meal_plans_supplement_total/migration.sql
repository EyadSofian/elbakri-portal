-- AlterEnum
ALTER TYPE "HotelSupplementType" ADD VALUE 'TOTAL_PRICE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Market" ADD VALUE 'MIDDLE_EAST';
ALTER TYPE "Market" ADD VALUE 'NORTH_AFRICA';
ALTER TYPE "Market" ADD VALUE 'ARAB_48';

-- AlterEnum
ALTER TYPE "MealPlan" ADD VALUE 'SOFT_ALL_INCLUSIVE';

-- AlterTable
-- HotelRate.mealPlan moves from the MealPlan enum to a MealPlanOption code.
-- Cast the column IN PLACE: the generated "DROP COLUMN + ADD COLUMN" would have
-- thrown away the meal plan on every existing rate row. The enum labels and the
-- seeded option codes are the same strings, so every current value stays valid.
ALTER TABLE "HotelRate" ALTER COLUMN "mealPlan" TYPE TEXT USING "mealPlan"::TEXT;

-- CreateTable
CREATE TABLE "MealPlanOption" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanOption_code_key" ON "MealPlanOption"("code");

-- CreateIndex
CREATE INDEX "MealPlanOption_isActive_displayOrder_idx" ON "MealPlanOption"("isActive", "displayOrder");


-- Seed the admin-managed list with the plans that already existed, plus Soft
-- All Inclusive. Codes match the old enum labels so rates keep resolving.
INSERT INTO "MealPlanOption" ("id", "code", "labelEn", "labelAr", "isActive", "displayOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'ROOM_ONLY',           'Room Only',           'غرفة فقط',              true, 0, NOW(), NOW()),
  (gen_random_uuid()::text, 'BREAKFAST',           'Bed & Breakfast',     'إفطار',                 true, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'HALF_BOARD',          'Half Board',          'نصف إقامة',             true, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'FULL_BOARD',          'Full Board',          'إقامة كاملة',           true, 3, NOW(), NOW()),
  (gen_random_uuid()::text, 'SOFT_ALL_INCLUSIVE',  'Soft All Inclusive',  'شامل مخفف',             true, 4, NOW(), NOW()),
  (gen_random_uuid()::text, 'ALL_INCLUSIVE',       'All Inclusive',       'شامل',                  true, 5, NOW(), NOW()),
  (gen_random_uuid()::text, 'ULTRA_ALL_INCLUSIVE', 'Ultra All Inclusive', 'شامل فاخر',             true, 6, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
