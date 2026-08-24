import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_TRANSFER,
  normalizeClockTime,
  readTransferAddOn,
  resolveReturnTime,
} from '../src/shared/transfer-addon';

// A trip that says "transfer not included" can carry one: where the driver
// collects the clients, where they go back, and when.

// ── normalizeClockTime ──────────────────────────────────────────────────────

test('normalizeClockTime: zero-pads so two bookings compare the same way', () => {
  assert.equal(normalizeClockTime('8:05'), '08:05');
  assert.equal(normalizeClockTime('08:05'), '08:05');
});

test('normalizeClockTime: reads the 12-hour form operators type', () => {
  assert.equal(normalizeClockTime('05:00 PM'), '17:00');
  assert.equal(normalizeClockTime('5:00 pm'), '17:00');
  assert.equal(normalizeClockTime('12:00 AM'), '00:00');
  assert.equal(normalizeClockTime('12:00 PM'), '12:00');
});

test('normalizeClockTime: rejects what is not a time', () => {
  for (const bad of ['half past', '25:00', '10:75', '13:00 PM', '', null, undefined, 'noon']) {
    assert.equal(normalizeClockTime(bad), null, String(bad));
  }
});

// ── resolveReturnTime ───────────────────────────────────────────────────────

test('resolveReturnTime: falls back to the trip’s own return time', () => {
  // The whole point of the field: the driver should be there when the trip ends.
  assert.equal(resolveReturnTime(undefined, '05:00 PM'), '17:00');
});

test('resolveReturnTime: an explicit answer wins', () => {
  // They may be going on somewhere else after the trip.
  assert.equal(resolveReturnTime('19:30', '05:00 PM'), '19:30');
});

test('resolveReturnTime: an unusable explicit answer falls back rather than losing it', () => {
  assert.equal(resolveReturnTime('later', '17:00'), '17:00');
});

test('resolveReturnTime: nothing known stays null', () => {
  assert.equal(resolveReturnTime(undefined, undefined), null);
});

// ── readTransferAddOn ───────────────────────────────────────────────────────

test('readTransferAddOn: no request means no transfer', () => {
  assert.deepEqual(readTransferAddOn({}), NO_TRANSFER);
});

test('readTransferAddOn: a trip that already includes one can never carry another', () => {
  // Otherwise the booking would promise the same car twice.
  const result = readTransferAddOn(
    { transferRequested: true, transferFromName: 'Hilton' },
    { transferIncluded: true },
  );
  assert.equal(result.transferRequested, false);
  assert.equal(result.transferFromName, null);
});

test('readTransferAddOn: reads a full request', () => {
  const result = readTransferAddOn({
    transferRequested: true,
    transferFromType: 'HOTEL',
    transferFromName: 'Hilton Sharm',
    transferToType: 'AIRPORT',
    transferToName: 'SSH',
    transferPickupTime: '8:30',
    transferReturnTime: '18:00',
    transferNotes: 'Two child seats',
  });
  assert.deepEqual(result, {
    transferRequested: true,
    transferFromType: 'HOTEL',
    transferFromName: 'Hilton Sharm',
    transferToType: 'AIRPORT',
    transferToName: 'SSH',
    transferPickupTime: '08:30',
    transferReturnTime: '18:00',
    transferNotes: 'Two child seats',
  });
});

test('readTransferAddOn: the return leg defaults to the pickup point', () => {
  // Most transfers bring people back where they were collected.
  const result = readTransferAddOn({
    transferRequested: true,
    transferFromType: 'HOTEL',
    transferFromName: 'Hilton Sharm',
  });
  assert.equal(result.transferToName, 'Hilton Sharm');
  assert.equal(result.transferToType, 'HOTEL');
});

test('readTransferAddOn: a typed place with no kind is an address', () => {
  const result = readTransferAddOn({ transferRequested: true, transferFromName: '12 Naama Bay' });
  assert.equal(result.transferFromType, 'ADDRESS');
});

test('readTransferAddOn: an unknown endpoint kind falls back to address', () => {
  const result = readTransferAddOn({
    transferRequested: true,
    transferFromType: 'SPACESHIP',
    transferFromName: 'Hilton',
  });
  assert.equal(result.transferFromType, 'ADDRESS');
});

test('readTransferAddOn: the return time is taken from the trip when not given', () => {
  const result = readTransferAddOn(
    { transferRequested: true, transferFromName: 'Hilton' },
    { activityReturnTime: '05:00 PM' },
  );
  assert.equal(result.transferReturnTime, '17:00');
});

test('readTransferAddOn: blank text fields become null, not empty strings', () => {
  const result = readTransferAddOn({
    transferRequested: true,
    transferFromName: '   ',
    transferNotes: '  ',
  });
  assert.equal(result.transferFromName, null);
  assert.equal(result.transferNotes, null);
  assert.equal(result.transferFromType, null);
});

test('readTransferAddOn: NO_TRANSFER is never handed out by reference', () => {
  // Callers spread the result into a Prisma create; a shared object would be
  // one accidental mutation away from leaking between bookings.
  const a = readTransferAddOn({});
  const b = readTransferAddOn({});
  assert.notEqual(a, b);
  assert.notEqual(a, NO_TRANSFER);
  assert.deepEqual(a, b);
});
