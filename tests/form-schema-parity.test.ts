import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createActivitySchema, updateActivitySchema } from '../src/modules/activities/activities.schema';
import { createHotelSchema, updateHotelSchema } from '../src/modules/hotels/hotels.schema';
import { transportRateSchema, visaFeeSchema, receptionRateSchema } from '../src/modules/master-data/master-data.schema';
import { createCompanySchema, updateCompanySchema } from '../src/modules/companies/companies.schema';
import { createCruiseSchema, updateCruiseSchema } from '../src/modules/nile-cruise/cruise.schema';
import { sanitizeCustomFields } from '../src/shared/helpers';

/**
 * Every field the admin forms send, against the schema guarding the route.
 *
 * `validate()` replaces req.body with the schema's output, and `z.object()`
 * DROPS keys it does not declare. A form field the schema never declares is
 * therefore discarded in silence: the request returns 200, the form says
 * "saved", and the value is not stored. Nothing errors and nothing logs.
 *
 * This has shipped three times now — the activity inclusions list, the activity
 * transfer flag, and the per-nationality approval fee. It is not a mistake
 * anyone catches by reading, because the two halves live in different files and
 * neither mentions the other.
 *
 * So the form definitions are read out of admin.html and the field lists out of
 * the real compiled Zod shapes. Adding a field to a form without declaring it
 * fails here.
 */

const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

/** The keys a Zod object actually declares. */
function shapeKeys(schema: unknown): string[] {
  const def = (schema as { _def?: { shape?: unknown } })._def;
  const shape = typeof def?.shape === 'function'
    ? (def.shape as () => Record<string, unknown>)()
    : (def?.shape as Record<string, unknown> | undefined);
  assert.ok(shape, 'schema exposes a shape');
  return Object.keys(shape);
}

/** The field names one masterConfigs entity's form posts. */
function masterConfigFields(entity: string): string[] {
  const block = new RegExp(`\\n  ${entity}:\\s*\\{([\\s\\S]*?)\\n  \\},\\n`).exec(admin);
  assert.ok(block, `admin.html declares a masterConfigs entry for "${entity}"`);
  const fields = [...block[1].matchAll(/\{\s*name:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(fields.length > 0, `"${entity}" form has fields`);
  return fields;
}

/** The keys a hand-written editor's `const payload = { … }` posts. */
function payloadKeys(fnName: string): string[] {
  const fn = new RegExp(`function ${fnName}\\b[\\s\\S]*?const payload = \\{([\\s\\S]*?)\\n  \\};`).exec(admin);
  assert.ok(fn, `admin.html has a ${fnName}() building a payload`);
  const keys = [...fn[1].matchAll(/(?:^|\n)\s*(?:\.\.\.\w+,\s*)?([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);
  assert.ok(keys.length > 0, `${fnName}() posts fields`);
  return keys;
}

function assertNothingDropped(fields: string[], schema: unknown, what: string) {
  const declared = shapeKeys(schema);
  const dropped = fields.filter((f) => !declared.includes(f));
  assert.deepEqual(dropped, [], `${what}: these fields are silently discarded on save`);
}

const CASES: [string, () => string[], unknown][] = [
  ['activity form → create', () => masterConfigFields('activities'), createActivitySchema],
  ['activity form → update', () => masterConfigFields('activities'), updateActivitySchema],
  ['transport rate form', () => masterConfigFields('transport'), transportRateSchema],
  ['approval fee form', () => masterConfigFields('visa'), visaFeeSchema],
  ['reception rate form', () => masterConfigFields('reception'), receptionRateSchema],
  ['hotel editor → create', () => payloadKeys('heSave'), createHotelSchema],
  ['hotel editor → update', () => payloadKeys('heSave'), updateHotelSchema],
  ['company form → create', () => payloadKeys('saveCompany'), createCompanySchema],
  ['company form → update', () => payloadKeys('saveCompany'), updateCompanySchema],
  ['cruise form → create', () => masterConfigFields('cruises'), createCruiseSchema],
  ['cruise form → update', () => masterConfigFields('cruises'), updateCruiseSchema],
];

for (const [label, fields, schema] of CASES) {
  test(`${label}: no field is silently dropped`, () => {
    assertNothingDropped(fields(), schema, label);
  });
}

test('the per-nationality approval fee reaches the controller', () => {
  // The third instance of this bug, named so a regression is unmistakable: the
  // admin could pick a nationality, the save reported success, and every row
  // came back priced for everyone.
  const parsed = visaFeeSchema.parse({
    visaType: 'TOURIST',
    nationality: 'IRAQI',
    fee: 100,
  }) as Record<string, unknown>;
  assert.equal(parsed.nationality, 'IRAQI', 'nationality was dropped');
});

test('an approval fee still prices everyone when no nationality is given', () => {
  const parsed = visaFeeSchema.parse({ visaType: 'TOURIST', fee: 100, nationality: '' }) as Record<string, unknown>;
  assert.equal(parsed.nationality, null, 'blank must mean "any nationality"');
});

test('an approval fee refuses a nationality approvals are not filed for', () => {
  assert.throws(() => visaFeeSchema.parse({ visaType: 'TOURIST', fee: 100, nationality: 'SAUDI' }));
});

test('no schema invents a value for a field the edit never mentioned', () => {
  // The activity price transform did exactly that: a PATCH changing one price
  // came out carrying an explicit null for the others, and the controller wrote
  // every one. "Leave it alone" has to survive as absent, everywhere.
  const partialEdits: [string, unknown, Record<string, unknown>][] = [
    ['activity', updateActivitySchema, { priceAdult: 55 }],
    ['transport rate', transportRateSchema, { rate: 100 }],
    ['approval fee', visaFeeSchema, { fee: 100 }],
    ['reception rate', receptionRateSchema, { rate: 50 }],
    ['hotel', updateHotelSchema, { name: 'Hilton Sharm' }],
    ['company', updateCompanySchema, { name: 'Acme Travel' }],
    ['cruise', updateCruiseSchema, { name: 'Nile Goddess' }],
  ];
  for (const [label, schema, input] of partialEdits) {
    const parsed = (schema as { parse: (v: unknown) => Record<string, unknown> }).parse(input);
    const invented = Object.keys(parsed).filter((k) => !(k in input));
    assert.deepEqual(invented, [], `${label}: the schema invented values for fields the edit never sent`);
  }
});

test('the cruise routes reject an enum they cannot store', () => {
  // Before this schema existed the cast went straight to Prisma and came back
  // as a 500 rather than a message the admin could act on.
  assert.throws(() => createCruiseSchema.parse({ name: 'Nile Goddess', shipType: 'SUBMARINE' }));
  assert.throws(() => createCruiseSchema.parse({ name: 'Nile Goddess', route: 'CAIRO_LUXOR' }));
  // …and still accept what an operator actually types.
  const ok = createCruiseSchema.parse({ name: 'Nile Goddess', shipType: 'dahabiya' }) as Record<string, unknown>;
  assert.equal(ok.shipType, 'DAHABIYA');
});

test('a cruise with no headline price is still valid — the rate rows are the price', () => {
  const parsed = createCruiseSchema.parse({ name: 'Nile Goddess', priceFrom: '' }) as Record<string, unknown>;
  assert.equal(parsed.priceFrom, null);
});

test('the cruise form uses structured schedules and pricing periods, not the retired amount fields', () => {
  const fields = masterConfigFields('cruises');
  for (const retired of ['departureDays', 'duration', 'priceFrom', 'currency']) {
    assert.equal(fields.includes(retired), false, `${retired} is still visible in the cruise form`);
  }
  assert.match(admin, /function cruiseCatalogueFormSection\b/);
  assert.match(admin, /id="crSchedRows"/);
  assert.match(admin, /id="crRateRows"/);
  assert.match(admin, /payload\.priceFrom = null/);
});

test('a cruise quote keeps its structured programme and vehicle selection in storage', () => {
  const stored = sanitizeCustomFields({
    cruiseProductMode: 'TRANSFER',
    cruiseScheduleId: 'schedule-4',
    cruiseProgrammeId: 'programme-4',
    cruiseTransferTripType: 'ROUND_TRIP',
    cruiseTransferVehicleType: 'VAN_12',
    cruiseTransferVehicleCapacity: 12,
    cruiseTransferVehicleCount: 2,
    cruiseTransferPricePerVehicle: 180,
    cruiseTransferTotal: 360,
    cruiseSupplements: ['New Year'],
  });
  assert.deepEqual(stored, {
    cruiseProductMode: 'TRANSFER',
    cruiseScheduleId: 'schedule-4',
    cruiseProgrammeId: 'programme-4',
    cruiseTransferTripType: 'ROUND_TRIP',
    cruiseTransferVehicleType: 'VAN_12',
    cruiseTransferVehicleCapacity: 12,
    cruiseTransferVehicleCount: 2,
    cruiseTransferPricePerVehicle: 180,
    cruiseTransferTotal: 360,
    cruiseSupplements: ['New Year'],
  });
});
