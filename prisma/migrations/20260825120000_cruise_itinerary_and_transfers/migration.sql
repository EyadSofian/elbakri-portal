-- The Nile cruise learns the three things an agent was asking for by email:
--
--   * the day-by-day programme, so the boat is sold on where it stops rather
--     than on a paragraph of prose;
--   * whether the fare already collects the guests, and an added transfer leg
--     on the booking when it does not — the same shape an activity booking
--     already carries, so a boat and an excursion read alike on a voucher;
--
-- Everything here is additive and guarded, so an environment that already ran
-- part of it (or a re-run after a failed deploy) is a no-op rather than an
-- error, and no existing row changes meaning: a boat with no programme keeps a
-- NULL one, and a fare that never promised a transfer still does not.

-- ── The boat: programme and whether the fare collects the guests ─────────────
ALTER TABLE "NileCruise" ADD COLUMN IF NOT EXISTS "itinerary" JSONB;
ALTER TABLE "NileCruise" ADD COLUMN IF NOT EXISTS "transferIncluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NileCruise" ADD COLUMN IF NOT EXISTS "transferNote" TEXT;
ALTER TABLE "NileCruise" ADD COLUMN IF NOT EXISTS "transferNoteAr" TEXT;

-- ── The booking: an added transfer leg ──────────────────────────────────────
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferFromType" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferFromName" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferToType" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferToName" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferPickupTime" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferReturnTime" TEXT;
ALTER TABLE "CruiseBooking" ADD COLUMN IF NOT EXISTS "transferNotes" TEXT;
