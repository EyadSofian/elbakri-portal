import { z } from 'zod';

/**
 * Validation for the Nile cruise catalogue write paths.
 *
 * These two endpoints had no schema at all: the controller cast `body.shipType`
 * straight to the enum, so a typo reached Prisma and came back as a 500 rather
 * than a message anyone could act on.
 *
 * The semantics match the other master-data schemas so the admin editors behave
 * the same everywhere:
 *   - enums are accepted case-insensitively and reject anything else;
 *   - '' means "clear this field" and becomes null;
 *   - a field that is entirely absent stays absent, so a partial edit never
 *     wipes what it did not mention;
 *   - unknown keys are stripped.
 *
 * Every field the catalogue form sends must be declared here. An undeclared one
 * is dropped in silence — tests/form-schema-parity.test.ts holds the two lists
 * against each other so that cannot happen quietly again.
 */

const SHIP_TYPES = ['CRUISE', 'DAHABIYA', 'FELUCCA'] as const;
const ROUTES = ['LUXOR_ASWAN', 'ASWAN_LUXOR', 'LUXOR_ASWAN_LUXOR'] as const;

function enumField<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (v) => (v === '' ? null : typeof v === 'string' ? v.toUpperCase() : v),
    z.enum(values as unknown as [string, ...string[]]).nullable().optional(),
  );
}

const strField = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.null(), z.string().max(5000)]).optional(),
);

const numField = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.null(), z.coerce.number().finite().min(0)]).optional(),
);

/** A list the form may send as an array, one string, or delimited text. */
const listField = z.union([z.array(z.string()), z.string(), z.null()]).optional();

/**
 * The day-by-day programme. Only the shape is checked here — which rows are
 * real, how they are numbered and how they sort is `readItinerary`'s job, so
 * the form and the database can never disagree about what a programme is.
 */
const itineraryField = z.union([
  z.array(z.object({
    day: z.union([z.number(), z.string(), z.null()]).optional(),
    title: z.string().max(300).nullable().optional(),
    titleAr: z.string().max(300).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    descriptionAr: z.string().max(5000).nullable().optional(),
  }).passthrough()),
  z.null(),
]).optional();

const cruiseShape = {
  name: z.string().min(2),
  nameAr: strField,
  shipType: enumField(SHIP_TYPES),
  operator: strField,
  cabins: numField,
  route: enumField(ROUTES),
  departureDays: listField,
  duration: numField,
  description: strField,
  descriptionAr: strField,
  itinerary: itineraryField,
  // Does the fare already collect the guests? When it does not, the portal
  // offers the agent an added transfer leg rather than leaving them to guess.
  transferIncluded: z.boolean().optional(),
  transferNote: strField,
  transferNoteAr: strField,
  // The cabin rate rows are the price; this is only the optional headline.
  priceFrom: numField,
  currency: strField,
  imageUrl: strField,
  galleryUrls: listField,
  showPriceToAgents: z.boolean().optional(),
  allowQuoteRequest: z.boolean().optional(),
  isActive: z.boolean().optional(),
};

export const createCruiseSchema = z.object(cruiseShape);
/** Editing sends only what changed, so the name is optional here too. */
export const updateCruiseSchema = z.object({ ...cruiseShape, name: z.string().min(2).optional() });
