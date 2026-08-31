import assert from 'node:assert/strict';
import test from 'node:test';
import { offerKind, presentOffer } from '../src/modules/offers/offers-v2.controller';
import { normalizePackageComponents, resolvePackagePrice, validatePackageReferences } from '../src/modules/offers/package-commercial.service';

const validPayload = () => ({
  hotelItems: [{ id: 'component-hotel', hotelId: 'hotel-1', hotelRateId: 'hotel-rate-1', nights: 3, mealPlan: 'HB' }],
  transferItems: [{ id: 'component-transfer', transportRateId: 'transfer-1', included: true }],
  activityItems: [{ id: 'component-activity', activityId: 'activity-1', dayNumber: 2 }],
  pricingPeriods: [
    { id: 'p1e', validFrom: '2026-10-01', validTo: '2026-10-31', market: 'EGYPTIAN', singlePrice: 101, doublePrice: 202, triplePrice: 303, childPrice: 41 },
    { id: 'p2e', validFrom: '2026-11-01', validTo: '2026-11-30', market: 'EGYPTIAN', singlePrice: 111, doublePrice: 222, triplePrice: 333, childPrice: 51 },
    { id: 'p1f', validFrom: '2026-10-01', validTo: '2026-10-31', market: 'FOREIGN', singlePrice: 11, doublePrice: 22, triplePrice: 33, childPrice: 5 },
    { id: 'p2f', validFrom: '2026-11-01', validTo: '2026-11-30', market: 'FOREIGN', singlePrice: 15, doublePrice: 25, triplePrice: 35, childPrice: 6 },
  ],
});

test('offers and packages remain separate catalogue kinds', () => {
  assert.equal(offerKind('PACKAGE'), 'PACKAGE');
  assert.equal(offerKind('package'), 'PACKAGE');
  assert.equal(offerKind('OFFER'), 'OFFER');
});

test('package normaliser keeps stable relation ids and every price period', () => {
  const data = normalizePackageComponents(validPayload());
  assert.equal(data.hotelItems[0].hotelId, 'hotel-1');
  assert.equal(data.hotelItems[0].hotelRateId, 'hotel-rate-1');
  assert.equal(data.transferItems[0].transportRateId, 'transfer-1');
  assert.equal(data.activityItems[0].activityId, 'activity-1');
  assert.equal(data.pricingPeriods.length, 4);
  assert.equal(data.pricingPeriods[0].currency, 'EGP');
  assert.equal(data.pricingPeriods[2].currency, 'USD');
});

test('incomplete rows fail explicitly instead of disappearing on an unrelated edit', () => {
  assert.throws(() => normalizePackageComponents({ ...validPayload(), transferItems: [{ transportRateId: '' }] }), /PACKAGE_TRANSFER_INVALID/);
  assert.throws(() => normalizePackageComponents({ ...validPayload(), activityItems: [{ activityId: '' }] }), /PACKAGE_ACTIVITY_INVALID/);
  assert.throws(() => normalizePackageComponents({ ...validPayload(), hotelItems: [] }), /PACKAGE_HOTEL_REQUIRED/);
});

test('overlapping periods for one audience are rejected', () => {
  const payload = validPayload();
  payload.pricingPeriods.push({ id: 'overlap', validFrom: '2026-10-15', validTo: '2026-10-20', market: 'EGYPTIAN', singlePrice: 1, doublePrice: 2, triplePrice: 3, childPrice: 1 });
  assert.throws(() => normalizePackageComponents(payload), /PACKAGE_PERIOD_OVERLAP/);
});

test('relation validation rejects invalid IDs and mismatched hotel rates', async () => {
  const components = normalizePackageComponents(validPayload());
  const base = {
    hotel: { findMany: async () => [{ id: 'hotel-1' }] },
    hotelRate: { findMany: async () => [{ id: 'hotel-rate-1', hotelId: 'hotel-1' }] },
    transportRate: { findMany: async () => [{ id: 'transfer-1', fromName: 'Airport', toName: 'Hotel' }] },
    activity: { findMany: async () => [{ id: 'activity-1' }] },
    mealPlanOption: { findMany: async () => [{ code: 'HB' }] },
  };
  await validatePackageReferences(components, base);
  await assert.rejects(validatePackageReferences(components, { ...base, activity: { findMany: async () => [] } }), /PACKAGE_ACTIVITY_NOT_AVAILABLE/);
  await assert.rejects(validatePackageReferences(components, { ...base, transportRate: { findMany: async () => [] } }), /PACKAGE_TRANSFER_NOT_AVAILABLE/);
  await assert.rejects(validatePackageReferences(components, { ...base, hotelRate: { findMany: async () => [{ id: 'hotel-rate-1', hotelId: 'wrong' }] } }), /PACKAGE_HOTEL_RATE_MISMATCH/);
});

function resolverDb(market = 'EGYPTIAN', active = true) {
  const payload = normalizePackageComponents(validPayload());
  return {
    company: { findUnique: async () => ({ isActive: true, market }) },
    offer: { findFirst: async () => active ? ({
      id: 'package-1', title: 'Egypt Explorer', titleAr: 'اكتشف مصر', validFrom: null, validTo: null,
      packageHotels: [{ id: 'ch', hotelId: 'hotel-1', hotelRateId: 'hotel-rate-1', nights: 3, mealPlan: 'HB', hotel: { name: 'Nile Hotel' }, hotelRate: { roomName: 'Deluxe' } }],
      packageTransfers: [{ id: 'ct', transportRateId: 'transfer-1', included: true, transportRate: { fromName: 'Airport', toName: 'Hotel', vehicleType: 'VAN' } }],
      packageActivities: [{ id: 'ca', activityId: 'activity-1', dayNumber: 2, activity: { name: 'Pyramids', nameAr: 'الأهرامات' } }],
      packagePricePeriods: payload.pricingPeriods.map((period) => ({ ...period, validFrom: new Date(`${period.validFrom}T00:00:00Z`), validTo: new Date(`${period.validTo}T23:59:59Z`) })),
    }) : null },
  };
}

test('server resolves the full 2-period × occupancy matrix with unique values', async () => {
  const cases = [
    ['2026-10-10', 'SINGLE', 101], ['2026-10-10', 'DOUBLE', 202], ['2026-10-10', 'TRIPLE', 303],
    ['2026-11-10', 'SINGLE', 111], ['2026-11-10', 'DOUBLE', 222], ['2026-11-10', 'TRIPLE', 333],
  ] as const;
  for (const [travelDate, occupancy, expected] of cases) {
    const result = await resolvePackagePrice({ packageId: 'package-1', companyId: 'company-1', travelDate, occupancy, childrenCount: 0 }, resolverDb());
    assert.equal(result.total.toNumber(), expected, `${travelDate} ${occupancy}`);
    assert.equal(result.currency, 'EGP');
  }
  const withChildren = await resolvePackagePrice({ packageId: 'package-1', companyId: 'company-1', travelDate: '2026-11-10', occupancy: 'DOUBLE', childrenCount: 2 }, resolverDb());
  assert.equal(withChildren.total.toNumber(), 324);
});

test('server selects only the company audience and ignores client-authored totals', async () => {
  const result = await resolvePackagePrice({ packageId: 'package-1', companyId: 'company-1', travelDate: '2026-10-10', occupancy: 'TRIPLE', childrenCount: 1, ...({ total: 0, currency: 'EGP' } as any) }, resolverDb('FOREIGN'));
  assert.equal(result.baseAmount.toNumber(), 33);
  assert.equal(result.total.toNumber(), 38);
  assert.equal(result.currency, 'USD');
});

test('agent package payload contains only its pricing audience and no internal relation arrays', () => {
  const offer = presentOffer({
    id: 'package-1', kind: 'PACKAGE', packageNeedsConfiguration: false,
    packageHotels: [{ id: 'h', hotelId: 'hotel-1', hotelRateId: null, nights: 1, mealPlan: null, hotel: { name: 'Hotel' }, hotelRate: null }],
    packageTransfers: [], packageActivities: [],
    packagePricePeriods: [
      { id: 'eg', market: 'EGYPTIAN', currency: 'EGP', validFrom: new Date('2026-10-01'), validTo: new Date('2026-10-31'), singlePrice: 1, doublePrice: 2, triplePrice: 3, childPrice: 1 },
      { id: 'us', market: 'FOREIGN', currency: 'USD', validFrom: new Date('2026-10-01'), validTo: new Date('2026-10-31'), singlePrice: 10, doublePrice: 20, triplePrice: 30, childPrice: 10 },
    ],
  }, 'EGYPTIAN') as any;
  assert.deepEqual(offer.pricingPeriods.map((period: any) => period.currency), ['EGP']);
  assert.equal('packagePricePeriods' in offer, false);
  assert.equal('packageHotels' in offer, false);
});

test('inactive and unpriced packages fail closed', async () => {
  await assert.rejects(resolvePackagePrice({ packageId: 'package-1', companyId: 'company-1', travelDate: '2026-10-10', occupancy: 'SINGLE' }, resolverDb('EGYPTIAN', false)), /PACKAGE_NOT_AVAILABLE/);
  await assert.rejects(resolvePackagePrice({ packageId: 'package-1', companyId: 'company-1', travelDate: '2027-01-10', occupancy: 'SINGLE' }, resolverDb()), /PACKAGE_PRICE_NOT_AVAILABLE/);
});
