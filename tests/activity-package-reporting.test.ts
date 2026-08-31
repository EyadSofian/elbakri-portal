import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { invoiceLine } from '../src/modules/invoices/consolidated.controller';

test('activity packages are loaded into business reports as their own booking type', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/reports/reports.controller.ts'),
    'utf8',
  );
  assert.match(source, /prisma\.activityPackage\.findMany/);
  assert.match(source, /type: 'ACTIVITY_PACKAGE'/);
  assert.match(source, /ACTIVITY_PACKAGE: 0/);
});

test('consolidated invoices retain the activity-package reference and useful service label', () => {
  const line = invoiceLine({
    invoiceNumber: 'INV-2026-1',
    activityPackage: {
      refNumber: 'PKG-2026-1',
      clientName: 'Test Traveller',
      _count: { items: 3 },
    },
    activityBooking: null,
    transportBooking: null,
    airportReception: null,
    cruiseBooking: null,
    visaApplication: null,
    simRequest: null,
    booking: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    total: 250,
    currency: 'USD',
    status: 'UNPAID',
  } as never);

  assert.equal(line.refNumber, 'PKG-2026-1');
  assert.equal(line.service, 'Activity Package: 3 items · Test Traveller');
  assert.equal(line.total, 250);
});
