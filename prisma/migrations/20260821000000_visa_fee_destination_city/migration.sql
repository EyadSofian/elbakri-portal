-- A security approval fee can now be priced per destination — where the guests
-- stay — and not only per arrival airport.
--
-- Both narrowers become optional so one row can cover a single airport, a single
-- destination, the exact pair, or every approval of its type; the resolver takes
-- the most specific row that matches a request.
--
-- Existing rows are left exactly as they are: their airport keeps matching what
-- it matched before, and a NULL destination means "any", so nothing reprices on
-- deploy. Rows written with the old 'Egypt' placeholder still match only a
-- request for 'Egypt' — blank them from the Approval fees page to turn one into
-- a catch-all, rather than having this migration guess.
ALTER TABLE "VisaFee" ADD COLUMN IF NOT EXISTS "destinationCity" TEXT;
ALTER TABLE "VisaFee" ALTER COLUMN "destinationCountry" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "VisaFee_destinationCity_idx" ON "VisaFee"("destinationCity");
