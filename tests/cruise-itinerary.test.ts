import test from 'node:test';
import assert from 'node:assert/strict';
import { itineraryDays, itineraryLines, readItinerary } from '../src/shared/cruise-itinerary';

/**
 * A cruise programme is typed by an operator, one row at a time, and read back
 * by the agent portal, the quote request and anything printed later. The rules
 * that decide what a row IS — which ones survive, how they are numbered, what
 * order they come out in — live in one place so those three readers can never
 * disagree about a programme they are all showing the same client.
 */

test('readItinerary: nothing at all is an empty programme', () => {
  assert.deepEqual(readItinerary(null), []);
  assert.deepEqual(readItinerary(undefined), []);
  assert.deepEqual(readItinerary('Day 1: Luxor'), []);
  assert.deepEqual(readItinerary({ day: 1 }), []);
});

test('readItinerary: a row keeps the day number the operator typed', () => {
  const rows = readItinerary([
    { day: 1, title: 'Embarkation', description: 'Board at Luxor' },
    { day: 2, title: 'Edfu & Kom Ombo' },
  ]);
  assert.deepEqual(rows.map((r) => [r.day, r.title]), [[1, 'Embarkation'], [2, 'Edfu & Kom Ombo']]);
});

test('readItinerary: a missing day number falls back to the row position', () => {
  const rows = readItinerary([{ title: 'Embarkation' }, { title: 'Esna' }, { title: 'Aswan' }]);
  assert.deepEqual(rows.map((r) => r.day), [1, 2, 3]);
});

test('readItinerary: a day number that cannot be sailed on is a typo, not a day', () => {
  // Zero, negative and fractional days each fall back to the row's position
  // rather than being stored as a number no itinerary can run to.
  for (const day of [0, -2, 1.5, 'soon', '']) {
    assert.equal(readItinerary([{ day, title: 'Luxor' }])[0].day, 1, `day: ${String(day)}`);
  }
});

test('readItinerary: a numeric string is still a day', () => {
  assert.equal(readItinerary([{ day: '3', title: 'Aswan' }])[0].day, 3);
});

test('readItinerary: a row with nothing in any box is dropped', () => {
  const rows = readItinerary([
    { day: 1, title: '  ', description: '', titleAr: '', descriptionAr: '   ' },
    { day: 2, title: 'Aswan' },
  ]);
  assert.deepEqual(rows.map((r) => r.title), ['Aswan']);
});

test('readItinerary: a row written only in Arabic survives', () => {
  // An operator who fills in the Arabic column and leaves English blank has
  // still written that day — dropping it would lose their work.
  const rows = readItinerary([{ day: 1, titleAr: 'الأقصر' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].titleAr, 'الأقصر');
  assert.equal(rows[0].title, '');
});

test('readItinerary: blank rows do not consume a day number', () => {
  // The dropped row must not leave a gap: the two real rows are days 1 and 2,
  // not 1 and 3, or the programme skips a day the boat actually sails.
  const rows = readItinerary([{ title: 'Luxor' }, { title: '   ' }, { title: 'Aswan' }]);
  assert.deepEqual(rows.map((r) => r.day), [1, 2]);
});

test('readItinerary: rows come out in day order however they were typed', () => {
  const rows = readItinerary([
    { day: 3, title: 'Aswan' },
    { day: 1, title: 'Luxor' },
    { day: 2, title: 'Edfu' },
  ]);
  assert.deepEqual(rows.map((r) => r.title), ['Luxor', 'Edfu', 'Aswan']);
});

test('readItinerary: two things on one day keep the order they were typed in', () => {
  const rows = readItinerary([
    { day: 2, title: 'Kom Ombo' },
    { day: 2, title: 'Edfu' },
  ]);
  assert.deepEqual(rows.map((r) => r.title), ['Kom Ombo', 'Edfu']);
});

test('readItinerary: blank text becomes null, never the string "null"', () => {
  const [row] = readItinerary([{ day: 1, title: 'Luxor', description: '  ', descriptionAr: '' }]);
  assert.equal(row.description, null);
  assert.equal(row.descriptionAr, null);
  assert.equal(row.titleAr, null);
});

test('readItinerary: an unknown key on a row is ignored, not stored', () => {
  const [row] = readItinerary([{ day: 1, title: 'Luxor', priceFrom: 999 }]);
  assert.deepEqual(Object.keys(row).sort(), ['day', 'description', 'descriptionAr', 'title', 'titleAr']);
});

test('itineraryDays: a programme is as long as its last day, not its row count', () => {
  // Two rows on day 2 is a three-day sailing, not a four-day one.
  const rows = readItinerary([{ day: 1, title: 'Luxor' }, { day: 2, title: 'Edfu' }, { day: 2, title: 'Kom Ombo' }]);
  assert.equal(itineraryDays(rows), 2);
  assert.equal(itineraryDays([]), 0);
});

test('itineraryLines: each day reads as one line', () => {
  const rows = readItinerary([
    { day: 1, title: 'Embarkation', description: 'Board at Luxor' },
    { day: 2, title: 'Edfu' },
  ]);
  assert.deepEqual(itineraryLines(rows), ['Day 1: Embarkation — Board at Luxor', 'Day 2: Edfu']);
});

test('itineraryLines: Arabic uses the operator\'s own words where there are any', () => {
  const rows = readItinerary([{ day: 1, title: 'Luxor', titleAr: 'الأقصر' }]);
  assert.deepEqual(itineraryLines(rows, 'ar'), ['اليوم 1: الأقصر']);
});

test('itineraryLines: a day written only in English still reads in an Arabic list', () => {
  // Falling back is the point — an Arabic voucher must not lose the day.
  const rows = readItinerary([{ day: 2, title: 'Edfu', description: 'Temple of Horus' }]);
  assert.deepEqual(itineraryLines(rows, 'ar'), ['اليوم 2: Edfu — Temple of Horus']);
});
