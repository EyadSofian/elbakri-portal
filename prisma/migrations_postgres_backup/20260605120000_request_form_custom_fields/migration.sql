-- Request Form Builder: dynamic field storage on each request-producing model.
-- All columns are nullable JSONB (additive, non-destructive).

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "TransportBooking" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "VisaApplication" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "AirportReception" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "SimRequest" ADD COLUMN     "customFields" JSONB;
