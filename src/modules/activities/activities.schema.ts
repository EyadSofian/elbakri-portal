import { z } from 'zod';

// The admin form posts `null` for every field the user left blank, so an
// optional field must be `.nullable().optional()` — plain `.optional()` accepts
// `undefined` and REJECTS `null`, which fails the whole save. Every field the
// form sends must also be declared: z.object() strips keys it does not know
// about, so an undeclared field is silently dropped and quietly never saves.

/**
 * A price the operator may leave blank.
 *
 * Blank means "not sold this way" and must stay null — a 0 would advertise the
 * excursion as free. But NOT SENT is a third thing again, and it has to survive
 * as `undefined`: the transform used to collapse it to null, so a PATCH that
 * changed only the adult price came out of the schema carrying an explicit null
 * for the other four and wiped them. "Leave it alone" and "clear it" are
 * different instructions, and the schema has to keep them apart.
 */
const optionalPrice = z.union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  });

const stringList = z.union([z.array(z.string()), z.string(), z.null()]).optional();

const activityShape = {
  name: z.string().min(2),
  nameAr: z.string().nullable().optional(),
  // Free-text city, kept in step with the linked destination when there is one.
  city: z.string().nullable().optional(),
  destinationId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  timeSlots: stringList,
  description: z.string().nullable().optional(),
  descriptionAr: z.string().nullable().optional(),
  includes: stringList,
  excludes: stringList,
  // What the trip covers, as one ordered list of marked rows. The two flat
  // lists above are still written from it on save, so anything reading those
  // keeps working — but this is what the editor actually sends.
  inclusions: z.union([
    z.array(z.object({
      label: z.string(),
      labelAr: z.string().nullable().optional(),
      included: z.boolean().optional(),
    })),
    z.array(z.string()),
    z.string(),
    z.null(),
  ]).optional(),
  // Whether the price already collects the guests, and when it drops them back.
  // Without these declared the portal's "Add transfer" panel has nothing to key
  // off and the return time can never prefill a transfer's pickup.
  transferIncluded: z.boolean().nullable().optional(),
  transferNote: z.string().nullable().optional(),
  transferNoteAr: z.string().nullable().optional(),
  returnTime: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  galleryUrls: stringList,
  priceAdult: optionalPrice,
  priceChild: optionalPrice,
  priceSingle: optionalPrice,
  priceDouble: optionalPrice,
  priceTriple: optionalPrice,
  currency: z.string().nullable().optional(),
  minPax: z.coerce.number().int().min(1).nullable().optional(),
  maxPax: z.coerce.number().int().min(1).nullable().optional(),
  isActive: z.boolean().nullable().optional(),
  isConfirmableInApp: z.boolean().nullable().optional(),
};

export const createActivitySchema = z.object(activityShape);
// Editing sends only what changed, so every field is optional here — including
// `name`, which create requires.
export const updateActivitySchema = z.object({ ...activityShape, name: z.string().min(2).optional() });

export type ActivityInput = z.infer<typeof createActivitySchema>;
