-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "priceDouble" DECIMAL(10,2),
ADD COLUMN     "priceSingle" DECIMAL(10,2),
ADD COLUMN     "priceTriple" DECIMAL(10,2),
ALTER COLUMN "priceAdult" DROP NOT NULL,
ALTER COLUMN "priceChild" DROP NOT NULL;

