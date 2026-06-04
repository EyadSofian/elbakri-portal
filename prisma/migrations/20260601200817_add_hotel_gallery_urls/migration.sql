-- Add a gallery image URL list to Hotel (additive, non-destructive).
ALTER TABLE "Hotel" ADD COLUMN "galleryUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
