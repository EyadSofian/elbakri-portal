-- A not-included activity transfer is a priced catalogue add-on, not a free
-- note attached to a booking. The route is prefilled for the agent and the
-- charged amount is snapshotted on standalone and package bookings.
ALTER TABLE "Activity"
  ADD COLUMN IF NOT EXISTS "transferPrice" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "transferFromName" TEXT,
  ADD COLUMN IF NOT EXISTS "transferToName" TEXT;

ALTER TABLE "ActivityBooking"
  ADD COLUMN IF NOT EXISTS "transferAmount" DECIMAL(12,2);

ALTER TABLE "ActivityPackageItem"
  ADD COLUMN IF NOT EXISTS "transferAmount" DECIMAL(12,2);
