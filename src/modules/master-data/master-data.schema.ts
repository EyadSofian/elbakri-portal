import { z } from 'zod';

// Validation for the admin master-data write paths (transport rates, visa fees,
// reception service rates). Previously these endpoints had NO validation and the
// controller silently coerced bad enums to a default (e.g. a typo'd vehicleType
// became SEDAN). These schemas REJECT invalid input with a 400 instead.
//
// Semantics preserved from the old hand-rolled coercion so the admin editors keep
// working unchanged:
//   - enums are accepted case-insensitively (the UI sends UPPER, but be lenient);
//   - '' is treated as null ("clear this field"); null passes through as null;
//   - a field that is entirely absent is omitted (partial update);
//   - unknown keys are stripped (z.object default), never rejected.

/** Optional, nullable enum that tolerates case and maps '' → null. Rejects junk. */
/** An uppercase reference code (e.g. Airport.code) — open-ended by design. */
const codeField = z.preprocess(
  (v) => (v === '' ? null : typeof v === 'string' ? v.trim().toUpperCase() : v),
  z.string().min(2).max(10).nullable().optional(),
);

function enumField<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (v) => (v === '' ? null : typeof v === 'string' ? v.toUpperCase() : v),
    z.enum(values as unknown as [string, ...string[]]).nullable().optional(),
  );
}

/** Optional, nullable number that maps '' → null and rejects non-numeric input.
 *  null is checked BEFORE coercion so it is never turned into 0. */
const numField = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.null(), z.coerce.number().finite()]).optional(),
);

const strField = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.null(), z.string().max(500)]).optional(),
);

const boolField = z.boolean().optional();

const TRANSPORT_TYPES = ['AIRPORT_TRANSFER', 'PRIVATE_TRANSFER', 'DAY_TOUR_TRANSPORT', 'INTERCITY'] as const;
const VEHICLE_TYPES = ['SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO'] as const;
const SERVICE_MODES = ['POINT_TO_POINT', 'AIRPORT_TRANSFER', 'HOURLY_CHARTER', 'DAY_USE'] as const;
const ENDPOINT_TYPES = ['AIRPORT', 'HOTEL', 'DESTINATION'] as const;
const VISA_TYPES = ['TOURIST', 'BUSINESS', 'TRANSIT', 'STUDENT', 'MEDICAL', 'UMRAH', 'HAJJ'] as const;
const PROCESSING_TYPES = ['NORMAL', 'EXPRESS', 'URGENT'] as const;
const RECEPTION_TYPES = ['MEET_AND_GREET', 'AHLAN_SERVICE', 'VIP_LOUNGE', 'FULL_ASSISTANCE'] as const;
// Airports are admin-managed (the Airport table), so a rate must accept any
// code the admin has added. The code is checked against that table in the
// controller — validating it here against a frozen list is what made a newly
// added airport unusable.

// One lenient-but-validating schema for both create and update (the transport rate
// editor always PATCHes the full payload). Unknown keys are stripped.
export const transportRateSchema = z.object({
  type: enumField(TRANSPORT_TYPES),
  serviceMode: enumField(SERVICE_MODES),
  vehicleType: enumField(VEHICLE_TYPES),
  serviceArea: strField,
  serviceNameEn: strField,
  serviceNameAr: strField,
  city: strField,
  durationHours: numField,
  fromType: enumField(ENDPOINT_TYPES),
  fromId: strField,
  fromName: strField,
  toType: enumField(ENDPOINT_TYPES),
  toId: strField,
  toName: strField,
  fromLocation: strField,
  toLocation: strField,
  isBidirectional: boolField,
  priceEgp: numField,
  priceUsd: numField,
  roundTripPriceEgp: numField,
  roundTripPriceUsd: numField,
  rate: numField,
  currency: strField,
  roundTripRate: numField,
  minCapacity: numField,
  maxCapacity: numField,
  notes: strField,
  isActive: boolField,
});

export const visaFeeSchema = z.object({
  visaType: enumField(VISA_TYPES),
  destinationCountry: strField,
  processingType: enumField(PROCESSING_TYPES),
  fee: numField,
  currency: strField,
  notes: strField,
  isActive: boolField,
});

export const receptionRateSchema = z.object({
  serviceType: enumField(RECEPTION_TYPES),
  airport: codeField, // any Airport.code — existence is checked in the controller
  rate: numField,
  currency: strField,
  notes: strField,
  isActive: boolField,
});
