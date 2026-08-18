import { z } from 'zod';

// The admin hotel form sends `null` for every optional field the user left
// blank, so an optional field here must be `.nullable().optional()`, not just
// `.optional()` — in Zod, `.optional()` alone accepts `undefined` and REJECTS
// `null`, which failed the whole save with "Expected string, received null".
// Every field the form sends must also be declared: z.object() strips keys it
// does not know about, so an undeclared field is silently dropped before the
// controller ever sees it, and quietly never saves.
export const createHotelSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().nullable().optional(),
  city: z.string().min(1),
  cityAr: z.string().nullable().optional(),
  country: z.string().min(2),
  stars: z.number().int().min(1).max(7).default(3),
  address: z.string().min(5),
  description: z.string().nullable().optional(),
  descriptionAr: z.string().nullable().optional(),
  amenities: z.array(z.string()).default([]),
  // Accept absolute URLs (e.g. proxied Booking images) AND relative upload paths (/uploads/..).
  imageUrl: z.string().min(1).nullable().optional(),
  galleryUrls: z.array(z.string()).default([]),
  pricePerNight: z.number().positive(),
  currency: z.string().default('USD'),
  commissionPercent: z.number().min(0).max(100).default(0),
  availableRooms: z.number().int().min(0).default(0),
  maxGuestsPerRoom: z.number().int().min(1).max(12).default(2),
  showPriceToAgents: z.boolean().default(false),
  allowQuoteRequest: z.boolean().default(true),
  minVisibleTier: z.enum(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM']).nullable().optional(),
  destinationId: z.string().nullable().optional(),
  // Sub-area within the city (e.g. Naama Bay), the public rating, and the
  // active toggle — all sent by the admin form and all real columns.
  area: z.string().nullable().optional(),
  googleRating: z.number().min(0).max(5).nullable().optional(),
  isActive: z.boolean().optional(),
  // Structured hotel policies (all optional free text, EN + AR)
  checkInTime: z.string().nullable().optional(),
  checkOutTime: z.string().nullable().optional(),
  cancellationPolicy: z.string().nullable().optional(),
  cancellationPolicyAr: z.string().nullable().optional(),
  childrenPolicy: z.string().nullable().optional(),
  childrenPolicyAr: z.string().nullable().optional(),
  extraBedPolicy: z.string().nullable().optional(),
  extraBedPolicyAr: z.string().nullable().optional(),
  mealPolicy: z.string().nullable().optional(),
  mealPolicyAr: z.string().nullable().optional(),
  importantNotes: z.string().nullable().optional(),
  importantNotesAr: z.string().nullable().optional(),
});

export const updateHotelSchema = createHotelSchema.partial();

export type CreateHotelInput = z.infer<typeof createHotelSchema>;
export type UpdateHotelInput = z.infer<typeof updateHotelSchema>;
