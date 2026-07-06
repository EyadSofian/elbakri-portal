-- Phase 2: Destination images
-- Adds accessible alt text (EN/AR) and an optional image gallery to Destination.
-- imageUrl already exists (added in 20260608000000_add_market_pricing_and_destination_image).

ALTER TABLE "Destination"
  ADD COLUMN "imageAltEn" TEXT,
  ADD COLUMN "imageAltAr" TEXT,
  ADD COLUMN "galleryUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
