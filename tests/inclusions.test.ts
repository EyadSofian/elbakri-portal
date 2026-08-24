import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInclusions,
  excludedLabels,
  includedLabels,
  mentionsTransfer,
  normalizeInclusions,
  setInclusions,
  transferIsIncluded,
} from '../src/shared/inclusions';

// What a trip covers is one ordered list of marked rows. The two flat lists
// (`includes` / `excludes`) are still written from it, because vouchers, the
// Sheets importer and older clients all read them.

test('normalizeInclusions: reads the marked shape', () => {
  const rows = normalizeInclusions([
    { label: 'Lunch', labelAr: 'الغداء', included: true },
    { label: 'Tips', included: false },
  ]);
  assert.deepEqual(rows, [
    { label: 'Lunch', labelAr: 'الغداء', included: true },
    { label: 'Tips', labelAr: null, included: false },
  ]);
});

test('normalizeInclusions: a plain list of strings is all included', () => {
  // What an importer or an older client sends — every line was an inclusion.
  assert.deepEqual(
    normalizeInclusions(['Lunch', 'Guide']).map((r) => r.included),
    [true, true],
  );
});

test('normalizeInclusions: a missing `included` defaults to included', () => {
  // An older payload never said "not included"; flipping those rows would
  // rewrite what the operator had already published.
  assert.equal(normalizeInclusions([{ label: 'Lunch' }])[0].included, true);
});

test('normalizeInclusions: parses a JSON-encoded list', () => {
  const rows = normalizeInclusions('[{"label":"Lunch","included":false}]');
  assert.deepEqual(rows, [{ label: 'Lunch', labelAr: null, included: false }]);
});

test('normalizeInclusions: splits a delimited string', () => {
  assert.deepEqual(normalizeInclusions('Lunch, Guide').map((r) => r.label), ['Lunch', 'Guide']);
});

test('normalizeInclusions: drops blank and whitespace-only rows', () => {
  assert.deepEqual(normalizeInclusions([{ label: '   ' }, { label: '' }, null, 'Lunch']).length, 1);
});

test('normalizeInclusions: a duplicate label keeps its first answer', () => {
  // Lunch cannot be both included and not included; the first row wins so the
  // two boxes can never contradict each other on the same line.
  const rows = normalizeInclusions([
    { label: 'Lunch', included: true },
    { label: 'lunch', included: false },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].included, true);
});

test('normalizeInclusions: anything unusable is an empty list', () => {
  for (const input of [null, undefined, '', 42, {}]) {
    assert.deepEqual(normalizeInclusions(input), [], String(input));
  }
});

test('includedLabels / excludedLabels split the same list', () => {
  const rows = normalizeInclusions([
    { label: 'Lunch', included: true },
    { label: 'Tips', included: false },
    { label: 'Guide', included: true },
  ]);
  assert.deepEqual(includedLabels(rows), ['Lunch', 'Guide']);
  assert.deepEqual(excludedLabels(rows), ['Tips']);
});

test('buildInclusions: the marked list wins when the form sends one', () => {
  const rows = buildInclusions({
    inclusions: [{ label: 'Lunch', included: false }],
    includes: ['Ignored'],
  });
  assert.deepEqual(rows, [{ label: 'Lunch', labelAr: null, included: false }]);
});

test('buildInclusions: an explicitly empty list clears everything', () => {
  assert.deepEqual(buildInclusions({ inclusions: [], includes: ['Lunch'] }), []);
});

test('buildInclusions: folds the two old lists into one marked list', () => {
  const rows = buildInclusions({ includes: ['Lunch', 'Guide'], excludes: ['Tips'] });
  assert.deepEqual(rows, [
    { label: 'Lunch', labelAr: null, included: true },
    { label: 'Guide', labelAr: null, included: true },
    { label: 'Tips', labelAr: null, included: false },
  ]);
});

test('buildInclusions: a line typed into both boxes is included once', () => {
  const rows = buildInclusions({ includes: ['Lunch'], excludes: ['lunch'] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].included, true);
});

test('setInclusions produces a plain JSON-safe array', () => {
  const stored = setInclusions(normalizeInclusions([{ label: 'Lunch', included: false }]));
  assert.deepEqual(stored, [{ label: 'Lunch', labelAr: null, included: false }]);
  assert.doesNotThrow(() => JSON.stringify(stored));
});

// ── Does this trip already collect its guests? ──────────────────────────────

test('mentionsTransfer: recognises how operators actually write it', () => {
  assert.equal(mentionsTransfer(['Transfer from your hotel']), true);
  assert.equal(mentionsTransfer(['Hotel pick-up and drop-off']), true);
  assert.equal(mentionsTransfer(['Transport included']), true);
  assert.equal(mentionsTransfer(['مواصلات من الفندق']), true);
});

test('mentionsTransfer: does not fire on unrelated lines', () => {
  assert.equal(mentionsTransfer(['Lunch', 'Entry tickets', 'Guide']), false);
});

test('transferIsIncluded: the explicit flag is enough on its own', () => {
  assert.equal(transferIsIncluded({ transferIncluded: true }), true);
});

test('transferIsIncluded: an inclusion line counts too', () => {
  // An operator who wrote "Transfer from your hotel" into the inclusions has
  // said the trip collects its guests. Reading only the flag would have offered
  // to add a second transfer on top.
  assert.equal(
    transferIsIncluded({ inclusions: [{ label: 'Transfer from your hotel', included: true }] }),
    true,
  );
});

test('transferIsIncluded: a transfer listed as NOT included does not count', () => {
  assert.equal(
    transferIsIncluded({ inclusions: [{ label: 'Transfer', included: false }] }),
    false,
  );
});

test('transferIsIncluded: falls back to the old flat list', () => {
  assert.equal(transferIsIncluded({ includes: ['Transfer from your hotel'] }), true);
  assert.equal(transferIsIncluded({ includes: ['Lunch'] }), false);
});

test('transferIsIncluded: nothing said means not included', () => {
  assert.equal(transferIsIncluded({}), false);
});
