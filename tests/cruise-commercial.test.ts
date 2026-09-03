import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import {
  cruiseIntentFromCustomFields,
  cruiseResolutionFields,
  resolveCruiseCommercialSelection,
} from '../src/modules/nile-cruise/cruise-commercial.service';

const schedule = { id: 's3', cruiseId: 'c1', departureDay: 'FRIDAY', returnDay: 'MONDAY', nights: 3, isActive: true, retiredAt: null };
const programme = { id: 'p3', cruiseId: 'c1', scheduleId: 's3', name: 'Three nights', description: 'Included programme', isActive: true, retiredAt: null };
const programmeRate = { id: 'pr3', programmeId: 'p3', programme, market: 'FOREIGN', currency: 'USD', singlePrice: new Decimal(700), childPrice: new Decimal(300), supplements: [], validFrom: null, validTo: null, isActive: true, retiredAt: null };
const cabinRate = { id: 'r3', cruiseId: 'c1', scheduleId: 's3', cabinName: 'Cruise only', market: 'FOREIGN', currency: 'USD', singlePrice: new Decimal(600), doublePrice: new Decimal(500), triplePrice: new Decimal(400), childPrice: new Decimal(250), supplements: [], validFrom: null, validTo: null, isActive: true, retiredAt: null };
const transferRate = { id: 't6', cruiseId: 'c1', scheduleId: 's3', market: 'FOREIGN', currency: 'USD', amount: new Decimal(100), vehicleCapacity: 6, vehicleType: 'VAN_6', tripType: 'ONE_WAY', fromLocation: 'Cairo', toLocation: 'Luxor', validFrom: null, validTo: null, isActive: true, retiredAt: null };

function marketMatches(filter: any, value: string): boolean {
  return typeof filter === 'string' ? filter === value : Array.isArray(filter?.in) && filter.in.includes(value);
}

function fakeDb(market = 'FOREIGN', patch: Record<string, any> = {}) {
  const data = { schedule, programmeRate, cabinRate, transferRate, ...patch };
  return {
    company: { findUnique: async () => ({ isActive: true, market }) },
    nileCruise: { findFirst: async ({ where }: any) => where.id === 'c1' ? { id: 'c1', name: 'Royal Nile' } : null },
    cruiseSchedule: { findFirst: async ({ where }: any) => where.id === data.schedule.id && where.cruiseId === data.schedule.cruiseId ? data.schedule : null },
    cruiseProgrammeRate: { findFirst: async ({ where }: any) => {
      const row = data.programmeRate;
      return where.id === row.id && marketMatches(where.market, row.market)
        && where.programme.id === row.programme.id && where.programme.scheduleId === row.programme.scheduleId ? row : null;
    } },
    cruiseCabinRate: { findFirst: async ({ where }: any) => {
      const row = data.cabinRate;
      return where.id === row.id && where.scheduleId === row.scheduleId && marketMatches(where.market, row.market) ? row : null;
    } },
    cruiseTransferRate: { findFirst: async ({ where }: any) => {
      const row = data.transferRate;
      return where.id === row.id && where.scheduleId === row.scheduleId && marketMatches(where.market, row.market) ? row : null;
    } },
  };
}

const base = { companyId: 'co1', cruiseId: 'c1', scheduleId: 's3', checkIn: '2026-09-04', checkOut: '2026-09-07', adultsCount: 2, childrenCount: 0 };

test('agent cruise quote price is derived from catalogue ids, never client totals', async () => {
  const intent = cruiseIntentFromCustomFields({
    cruiseScheduleId: 's3', cruiseProductMode: 'CRUISE_ONLY', cruiseRateId: 'r3', cruiseOccupancy: 'DOUBLE',
    cruiseAdultUnitPrice: 1, cruiseProductTotal: 1, cruiseTransferTotal: 1,
  });
  const result = await resolveCruiseCommercialSelection({ ...base, ...intent }, fakeDb());
  assert.equal(result.total!.toString(), '1000');
  const fields = cruiseResolutionFields(result);
  assert.equal(fields.cruiseProductTotal, 1000);
  assert.equal(fields.cruiseResolvedTotal, 1000);
});

test('a 3-night sailing cannot resolve a 4-night programme', async () => {
  const fourNight = { ...programmeRate, programme: { ...programme, id: 'p4', scheduleId: 's4' }, id: 'pr4' };
  await assert.rejects(() => resolveCruiseCommercialSelection({
    ...base, productMode: 'PROGRAMME', programmeId: 'p4', programmeRateId: 'pr4',
  }, fakeDb('FOREIGN', { programmeRate: fourNight })), /PROGRAMME_RATE_NOT_AVAILABLE/);
});

test('Egyptian companies cannot resolve a foreign cruise tariff', async () => {
  await assert.rejects(() => resolveCruiseCommercialSelection({
    ...base, productMode: 'CRUISE_ONLY', cabinRateId: 'r3', occupancy: 'DOUBLE',
  }, fakeDb('EGYPTIAN')), /RATE_NOT_AVAILABLE/);
});

test('programme plus standalone transfer is explicitly refused', async () => {
  await assert.rejects(() => resolveCruiseCommercialSelection({
    ...base, productMode: 'PROGRAMME', programmeId: 'p3', programmeRateId: 'pr3', transferRateId: 't6',
  }, fakeDb()), /TRANSFER_ALREADY_INCLUDED/);
});

test('standalone transfer vehicle count comes from the selected transfer passengers', async () => {
  const result = await resolveCruiseCommercialSelection({
    ...base, adultsCount: 5, childrenCount: 2, productMode: 'TRANSFER', cabinRateId: 'r3', occupancy: 'DOUBLE',
    transferRateId: 't6', transferPaxCount: 3,
  }, fakeDb());
  assert.equal(result.pax, 7);
  assert.equal(result.transferPaxCount, 3);
  assert.equal(result.transferVehicleCount, 1);
  assert.equal(result.transferTotal!.toString(), '100');
  assert.equal(cruiseResolutionFields(result).cruiseTransferPaxCount, 3);
});

test('standalone transfer rejects an invalid explicit passenger count', async () => {
  await assert.rejects(() => resolveCruiseCommercialSelection({
    ...base, productMode: 'TRANSFER', cabinRateId: 'r3', occupancy: 'DOUBLE',
    transferRateId: 't6', transferPaxCount: 0,
  }, fakeDb()), /TRANSFER_PAX_INVALID/);
});

test('thirteen transfer passengers require two twelve-seat vehicles', async () => {
  const twelveSeatRate = { ...transferRate, vehicleCapacity: 12, amount: new Decimal(180), tripType: 'ROUND_TRIP' };
  const result = await resolveCruiseCommercialSelection({
    ...base, productMode: 'TRANSFER', cabinRateId: 'r3', occupancy: 'DOUBLE',
    transferRateId: 't6', transferPaxCount: 13,
  }, fakeDb('FOREIGN', { transferRate: twelveSeatRate }));
  assert.equal(result.transferPaxCount, 13);
  assert.equal(result.transferVehicleCount, 2);
  assert.equal(result.transferTotal!.toString(), '360');
});
