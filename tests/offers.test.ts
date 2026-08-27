import test from 'node:test';
import assert from 'node:assert/strict';
import { offerKind, packageData } from '../src/modules/offers/offers.controller';

test('offers and packages remain two explicit catalogue kinds', () => {
  assert.equal(offerKind('PACKAGE'), 'PACKAGE');
  assert.equal(offerKind('package'), 'PACKAGE');
  assert.equal(offerKind('OFFER'), 'OFFER');
  assert.equal(offerKind(undefined), 'OFFER');
});

test('package rows keep the four requested component groups', () => {
  const data = packageData({
    hotelItems: [{ name: 'Nile Hotel', nights: 3, mealPlan: 'HB' }],
    transferItems: [{ from: 'Cairo Airport', to: 'Nile Hotel', vehicleType: 'Sedan' }],
    activityItems: [{ name: 'Pyramids', date: 'Day 2' }],
    pricingPeriods: [{
      validFrom: '2026-10-01', validTo: '2026-12-20', market: 'EGYPTIAN',
      currency: 'USD', singlePrice: 100, doublePrice: 80, triplePrice: 70, childPrice: 40,
    }],
  });
  assert.equal(data.hotelItems.length, 1);
  assert.equal(data.transferItems.length, 1);
  assert.equal(data.activityItems.length, 1);
  assert.equal(data.pricingPeriods.length, 1);
  assert.equal(data.pricingPeriods[0].currency, 'EGP');
});

test('a package cannot be saved without a hotel and a complete price period', () => {
  assert.throws(() => packageData({ hotelItems: [], pricingPeriods: [] }), /PACKAGE_HOTEL_REQUIRED/);
  assert.throws(() => packageData({
    hotelItems: [{ name: 'Nile Hotel' }],
    pricingPeriods: [{ validFrom: '2026-10-01', validTo: '', singlePrice: 100 }],
  }), /PACKAGE_PRICE_PERIOD_INVALID/);
});
