-- A security approval now records where the guests are staying — Cairo, Sharm
-- El Sheikh or the North Coast — separately from "destinationCountry", which
-- holds the arrival airport code and only says where they land.
-- Nullable: approvals filed before the question existed have no answer to give,
-- and inventing one would put a guess on their voucher.
ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "destinationCity" TEXT;
