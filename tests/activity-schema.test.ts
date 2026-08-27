import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivitySchema, updateActivitySchema } from '../src/modules/activities/activities.schema';
import {
  ACTIVITY_WRITABLE_FIELDS,
  validatePaidTransferConfiguration,
} from '../src/modules/activities/activities.controller';

/**
 * The schema and the controller have to agree on what an activity is.
 *
 * `validate()` does `req.body = schema.parse(req.body)`, and `z.object()` DROPS
 * keys it does not declare. So a field the admin form sends and the controller
 * writes, but the schema never declares, is silently discarded — the request
 * succeeds, the form says "saved", and the value is simply not there.
 *
 * That is not a hypothetical: the transfer flag and the inclusions list shipped
 * exactly this way. The list below is exported from the controller, so adding a
 * field there fails this test until the schema declares it too.
 */

/** A value the schema will accept for each field, by shape. */
const SAMPLE: Record<string, unknown> = {
  name: 'Desert Safari',
  nameAr: 'سفاري',
  city: 'Sharm El Sheikh',
  destinationId: 'dest_1',
  category: 'DESERT_SAFARI',
  duration: '4 hours',
  timeSlots: ['09:00 AM'],
  description: 'A trip',
  descriptionAr: 'رحلة',
  includes: ['Lunch'],
  excludes: ['Tips'],
  inclusions: [{ label: 'Lunch', labelAr: 'الغداء', included: true }],
  imageUrl: '/uploads/a.jpg',
  galleryUrls: ['/uploads/b.jpg'],
  priceAdult: 50,
  priceChild: 25,
  priceSingle: 60,
  priceDouble: 100,
  priceTriple: 120,
  currency: 'USD',
  minPax: 1,
  maxPax: 20,
  isActive: true,
  isConfirmableInApp: true,
  transferIncluded: true,
  transferNote: 'Pickup from your hotel lobby',
  transferNoteAr: 'الاستلام من لوبي الفندق',
  transferPrice: 18,
  transferFromName: 'Cairo hotel / address',
  transferToName: 'Activity meeting point',
  returnTime: '17:00',
};

test('every field the controller writes is declared by the create schema', () => {
  const missing = ACTIVITY_WRITABLE_FIELDS.filter((f) => !(f in SAMPLE));
  assert.deepEqual(missing, [], 'this test needs a sample value for these fields');

  const payload = Object.fromEntries(ACTIVITY_WRITABLE_FIELDS.map((f) => [f, SAMPLE[f]]));
  const parsed = createActivitySchema.parse(payload) as Record<string, unknown>;

  const dropped = ACTIVITY_WRITABLE_FIELDS.filter((f) => !(f in parsed));
  assert.deepEqual(dropped, [], 'the schema silently drops fields the controller writes');
});

test('every field the controller writes survives an update', () => {
  const payload = Object.fromEntries(ACTIVITY_WRITABLE_FIELDS.map((f) => [f, SAMPLE[f]]));
  const parsed = updateActivitySchema.parse(payload) as Record<string, unknown>;
  const dropped = ACTIVITY_WRITABLE_FIELDS.filter((f) => !(f in parsed));
  assert.deepEqual(dropped, [], 'the update schema silently drops fields the controller writes');
});

test('the transfer flag and the inclusions list reach the controller', () => {
  // The two that shipped broken, named explicitly so a regression is obvious.
  const parsed = createActivitySchema.parse({
    name: 'Desert Safari',
    inclusions: [{ label: 'Transfer from your hotel', included: true }],
    transferIncluded: true,
    returnTime: '17:00',
  }) as Record<string, unknown>;
  assert.ok(Array.isArray(parsed.inclusions), 'inclusions was dropped');
  assert.equal(parsed.transferIncluded, true, 'transferIncluded was dropped');
  assert.equal(parsed.returnTime, '17:00', 'returnTime was dropped');
});

test('a field nobody declared is still refused entry', () => {
  // The stripping itself is the protection — an invented key must not reach Prisma.
  const parsed = createActivitySchema.parse({
    name: 'Desert Safari',
    isActive: false,
    sheetsRowId: 'injected',
    createdAt: '1999-01-01',
  }) as Record<string, unknown>;
  assert.equal('sheetsRowId' in parsed, false);
  assert.equal('createdAt' in parsed, false);
});

test('a blank price stays null rather than becoming a free trip', () => {
  const parsed = createActivitySchema.parse({ name: 'Desert Safari', priceTriple: '' }) as Record<string, unknown>;
  assert.equal(parsed.priceTriple, null);
  // Null, not zero: a 0 would advertise the trip as free.
  assert.notEqual(parsed.priceTriple, 0);
});

test('a zero price is kept — it is a real price, not a blank', () => {
  const parsed = createActivitySchema.parse({ name: 'Desert Safari', priceSingle: 0 }) as Record<string, unknown>;
  assert.equal(parsed.priceSingle, 0);
});

test('a partial edit does not wipe the prices it never mentioned', () => {
  // The transform used to collapse "not sent" to null, so a PATCH changing only
  // the adult price came out carrying an explicit null for the other four — and
  // the controller wrote every one of them. Changing one price wiped the rest.
  const parsed = updateActivitySchema.parse({ priceAdult: 55 }) as Record<string, unknown>;
  assert.equal(parsed.priceAdult, 55);
  for (const untouched of ['priceChild', 'priceSingle', 'priceDouble', 'priceTriple', 'transferPrice']) {
    assert.equal(untouched in parsed, false, `${untouched} was silently cleared`);
  }
});

test('clearing a price is still possible, and still distinct from not sending it', () => {
  const parsed = updateActivitySchema.parse({ priceAdult: 55, priceDouble: '' }) as Record<string, unknown>;
  assert.equal(parsed.priceDouble, null, 'an explicit blank must clear the price');
  assert.equal('priceTriple' in parsed, false, 'an unsent price must stay unchanged');
});

test('a partial edit does not wipe the other optional fields either', () => {
  const parsed = updateActivitySchema.parse({ name: 'Renamed Safari' }) as Record<string, unknown>;
  for (const untouched of ['inclusions', 'transferIncluded', 'returnTime', 'timeSlots', 'galleryUrls']) {
    assert.equal(untouched in parsed, false, `${untouched} was silently cleared`);
  }
});

test('a paid activity transfer needs its price and both route ends', () => {
  assert.match(validatePaidTransferConfiguration({ transferIncluded: false }) || '', /price/i);
  assert.match(validatePaidTransferConfiguration({ transferIncluded: false, transferPrice: 18 }) || '', /pickup/i);
  assert.match(validatePaidTransferConfiguration({
    transferIncluded: false,
    transferPrice: 18,
    transferFromName: 'Cairo hotel',
  }) || '', /return/i);
  assert.equal(validatePaidTransferConfiguration({
    transferIncluded: false,
    transferPrice: 18,
    transferFromName: 'Cairo hotel',
    transferToName: 'Activity point',
  }), null);
});

test('imports that do not select paid transfer stay backward compatible', () => {
  assert.equal(validatePaidTransferConfiguration({ name: 'Imported activity' }), null);
  assert.equal(validatePaidTransferConfiguration({ transferIncluded: true }), null);
});
