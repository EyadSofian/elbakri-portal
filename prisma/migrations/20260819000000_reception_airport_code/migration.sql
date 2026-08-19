-- AlterTable
-- The airport moves from the fixed EgyptAirport enum to the admin-managed
-- Airport.code, so a newly added airport can be used without a schema change.
-- Cast IN PLACE: the generated "DROP COLUMN + ADD COLUMN" would have discarded
-- the airport on every existing booking and rate — and, because this column is
-- NOT NULL, would have failed outright on a table that already has rows. The
-- enum labels are the airport codes, so every current value stays valid.
ALTER TABLE "AirportReception" ALTER COLUMN "airport" TYPE TEXT USING "airport"::TEXT;
ALTER TABLE "ReceptionServiceRate" ALTER COLUMN "airport" TYPE TEXT USING "airport"::TEXT;

-- CreateIndex
-- An in-place cast rebuilds the existing index, so guard the recreate.
CREATE INDEX IF NOT EXISTS "ReceptionServiceRate_airport_idx" ON "ReceptionServiceRate"("airport");


-- Nothing references the old enum once both columns are text. Postgres refuses
-- to drop a type still in use, so this fails loudly rather than silently if any
-- column was missed.
DROP TYPE IF EXISTS "EgyptAirport";
