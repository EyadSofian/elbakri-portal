-- Per-company hotel price visibility overrides.
-- These records override the default hotel showPriceToAgents/minVisibleTier rules
-- for a single company when present.

CREATE TABLE "HotelCompanyVisibility" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "canViewPrice" BOOLEAN NOT NULL DEFAULT true,
    "canRequestQuote" BOOLEAN,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelCompanyVisibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotelCompanyVisibility_hotelId_companyId_key" ON "HotelCompanyVisibility"("hotelId", "companyId");
CREATE INDEX "HotelCompanyVisibility_hotelId_idx" ON "HotelCompanyVisibility"("hotelId");
CREATE INDEX "HotelCompanyVisibility_companyId_idx" ON "HotelCompanyVisibility"("companyId");

ALTER TABLE "HotelCompanyVisibility"
  ADD CONSTRAINT "HotelCompanyVisibility_hotelId_fkey"
  FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HotelCompanyVisibility"
  ADD CONSTRAINT "HotelCompanyVisibility_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
