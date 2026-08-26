import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_TRANSFER,
  normalizeClockTime,
  readTransferAddOn,
  resolveReturnTime,
} from '../src/shared/transfer-addon';
import {
  activityTransferOperation,
  cruiseTransferOperation,
  packageTransferOperation,
  quoteTransferOperation,
  sortTransferOperations,
} from '../src/shared/transfer-operations';

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

// ── Transport operations queue ─────────────────────────────────────────

test('an activity add-on becomes a transport operations row', () => {
  const row = activityTransferOperation({
    id: 'ab1', refNumber: 'ACT-1', transferRequested: true,
    transferFromType: 'HOTEL', transferFromName: 'Nile Hotel',
    transferToName: 'Nile Hotel', transferPickupTime: '08:00', transferReturnTime: '17:00',
    activity: { name: 'Pyramids' }, company: { id: 'c1', name: 'Atlas' },
    clientName: 'Mona', clientPhone: '+20100', adultsCount: 2, childrenCount: 1,
    activityDate: '2026-09-01', requestedAt: '2026-08-20', status: 'PENDING',
  });
  assert.equal(row?.sourceType, 'ACTIVITY');
  assert.equal(row?.serviceName, 'Pyramids');
  assert.equal(row?.passengerCount, 3);
  assert.equal(row?.fromName, 'Nile Hotel');
  assert.equal(row?.returnTime, '17:00');
});

test('a package line keeps the package reference in the transport queue', () => {
  const row = packageTransferOperation({
    id: 'line1', transferRequested: true, transferFromName: 'Garden City',
    activityName: 'Museum', adultsCount: 1, childrenCount: 0,
    package: {
      id: 'pkg1', refNumber: 'PKG-2026-0001', status: 'PENDING',
      clientName: 'Omar', company: { id: 'c1', name: 'Atlas' },
    },
  });
  assert.equal(row?.sourceType, 'ACTIVITY_PACKAGE');
  assert.equal(row?.parentId, 'pkg1');
  assert.equal(row?.refNumber, 'PKG-2026-0001');
});

test('a quote request keeps its client fields and transfer leg for operations', () => {
  const row = quoteTransferOperation({
    id: 'q1', refNumber: 'QR-2026-0001', transferRequested: true,
    transferFromName: 'Zamalek', transferToName: 'Zamalek',
    serviceName: 'Cairo food tour', adultsCount: 2, childrenCount: 0,
    customFields: { clientName: 'Layla', clientPhone: '+9613' },
  });
  assert.equal(row?.sourceType, 'QUOTE_REQUEST');
  assert.equal(row?.clientName, 'Layla');
  assert.equal(row?.contactNumber, '+9613');
});

test('a cruise add-on carries its sailing date and lead passenger to transport', () => {
  const row = cruiseTransferOperation({
    id: 'cb1', refNumber: 'CRU-2026-0001', transferRequested: true,
    transferFromName: 'Luxor Airport', transferPickupTime: '11:30',
    cruise: { name: 'Royal Nile' }, passengerNames: ['Nadine', 'Karim'],
    adultsCount: 2, childrenCount: 0, checkIn: '2026-10-05', status: 'PENDING',
  });
  assert.equal(row?.sourceType, 'CRUISE');
  assert.equal(row?.serviceDate, '2026-10-05');
  assert.equal(row?.clientName, 'Nadine');
  assert.equal(row?.passengerCount, 2);
});

test('services that did not request a transfer never enter the queue', () => {
  assert.equal(activityTransferOperation({ id: 'ab2', refNumber: 'ACT-2', transferRequested: false }), null);
});

test('the transport queue is ordered by when the transfer was requested', () => {
  const older = activityTransferOperation({
    id: 'old', refNumber: 'ACT-OLD', transferRequested: true,
    transferFromName: 'A', requestedAt: '2026-08-01',
  });
  const newer = activityTransferOperation({
    id: 'new', refNumber: 'ACT-NEW', transferRequested: true,
    transferFromName: 'B', requestedAt: '2026-08-25',
  });
  assert.deepEqual(sortTransferOperations([older, newer]).map((row) => row.refNumber), ['ACT-NEW', 'ACT-OLD']);
});
