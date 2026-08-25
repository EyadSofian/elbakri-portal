-- An excursion gets the same programme a cruise just got: an ordered list of
--   [{ day, title, titleAr, description, descriptionAr }]
-- instead of the whole itinerary typed into `description` as one paragraph.
--
-- A day trip's rows all sit on day one and read as stops; a multi-day package
-- reads as days. Same column, same parser, same editor.
--
-- Additive and guarded, so a re-run is a no-op and no existing row changes
-- meaning: a trip with no programme keeps a NULL one.
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "itinerary" JSONB;
