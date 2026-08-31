import test from 'node:test';
import assert from 'node:assert/strict';
import { syncRetirableRows } from '../src/shared/retirable-sync';
import fs from 'node:fs';
import path from 'node:path';

test('catalogue metadata edits update the same row id instead of replacing it', async () => {
  const updated: string[] = [];
  const created: string[] = [];
  const retired: string[] = [];
  const result = await syncRetirableRows({
    existing: [{ id: 'programme-a', name: 'Old name' }],
    incoming: [{ id: 'programme-a', name: 'New name' }],
    incomingId: (row) => row.id,
    update: async (row) => { updated.push(row.id); return row.id; },
    create: async (row) => { created.push(row.name); return 'new'; },
    retire: async (row) => { retired.push(row.id); },
  });
  assert.deepEqual(result, ['programme-a']);
  assert.deepEqual(updated, ['programme-a']);
  assert.deepEqual(created, []);
  assert.deepEqual(retired, []);
});

test('removed catalogue rows are retired and keep their ids for historical bookings', async () => {
  const retired: string[] = [];
  await syncRetirableRows({
    existing: [{ id: 'sold-rate' }, { id: 'current-rate' }],
    incoming: [{ id: 'current-rate' }],
    incomingId: (row) => row.id,
    update: async (row) => row.id,
    create: async () => 'new',
    retire: async (row) => { retired.push(row.id); },
  });
  assert.deepEqual(retired, ['sold-rate']);
});

test('an id from another catalogue scope is rejected rather than recreated', async () => {
  await assert.rejects(() => syncRetirableRows({
    existing: [{ id: 'owned-row' }],
    incoming: [{ id: 'other-cruise-row' }],
    incomingId: (row) => row.id,
    update: async (row) => row.id,
    create: async () => 'new',
    retire: async () => undefined,
    invalidIdError: 'CATALOGUE_ROW_NOT_FOUND',
  }), /CATALOGUE_ROW_NOT_FOUND/);
});

test('legacy rows can be claimed once and gain stable identity on their first safe save', async () => {
  const updated: string[] = [];
  await syncRetirableRows({
    existing: [{ id: 'legacy-a', key: null, name: 'Classic' }],
    incoming: [{ id: null, key: 'catalogue-1', name: 'Classic' }],
    incomingId: (row) => row.id,
    legacyMatch: (row, candidate) => candidate.key === null && row.name === candidate.name,
    update: async (row) => { updated.push(row.id); return row.id; },
    create: async () => 'new',
    retire: async () => undefined,
  });
  assert.deepEqual(updated, ['legacy-a']);
});

test('cruise catalogue controllers contain no replace-all delete path', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/modules/nile-cruise/cruise-catalogue.controller.ts'), 'utf8');
  assert.doesNotMatch(source, /cruise(?:Schedule|CabinRate|Programme|ProgrammeRate|TransferRate)\.deleteMany/);
  assert.doesNotMatch(source, /materialiseSharedCatalogue[\s\S]*?deleteMany/);
});

test('the admin round-trips schedule, fare and shared catalogue identities', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'public/admin.html'), 'utf8');
  assert.match(source, /id: row\.dataset\.scheduleId \|\| null/);
  assert.match(source, /id: row\.dataset\.rateId \|\| null/);
  assert.match(source, /catalogueKey: card\.dataset\.catalogueKey \|\| null/);
  assert.match(source, /catalogueKey: row\.dataset\.catalogueKey \|\| null/);
});
