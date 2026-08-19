-- An activity can carry a photo gallery on top of its single main image, so
-- the admin can upload several pictures for one excursion. Nullable JSON: an
-- activity with no extra photos keeps NULL rather than an empty array, which
-- matches how Hotel.galleryUrls behaves.
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "galleryUrls" JSONB;
