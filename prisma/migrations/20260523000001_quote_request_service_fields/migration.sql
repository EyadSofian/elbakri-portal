-- B2B Fix: Add service identity fields to QuoteRequest
-- Soft references (no FK constraints) for flexibility across cruise / activity / transport

ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "serviceId"   TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "serviceName" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "cruiseId"    TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "activityId"  TEXT;
