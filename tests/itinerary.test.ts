import test from 'node:test';
import assert from 'node:assert/strict';
import { isMultiDay, itineraryDays, itineraryLines, readItinerary } from '../src/shared/itinerary';

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
  // Multi-day on purpose: this is about which language wins, not about how a
  // row is labelled — a one-day programme numbers its stops instead.
  const rows = readItinerary([
    { day: 1, title: 'Luxor', titleAr: 'الأقصر' },
    { day: 2, title: 'Edfu', titleAr: 'إدفو' },
  ]);
  assert.deepEqual(itineraryLines(rows, 'ar'), ['اليوم 1: الأقصر', 'اليوم 2: إدفو']);
});

test('itineraryLines: a day written only in English still reads in an Arabic list', () => {
  // Falling back is the point — an Arabic voucher must not lose the day.
  const rows = readItinerary([{ day: 2, title: 'Edfu', description: 'Temple of Horus' }]);
  assert.deepEqual(itineraryLines(rows, 'ar'), ['اليوم 2: Edfu — Temple of Horus']);
});

// ── A day trip has stops, not days ─────────────────────────────────────────

test('isMultiDay: a sailing runs over days, a museum visit does not', () => {
  assert.equal(isMultiDay(readItinerary([{ day: 1, title: 'Luxor' }, { day: 2, title: 'Edfu' }])), true);
  assert.equal(isMultiDay(readItinerary([{ day: 1, title: 'Pyramids' }, { day: 1, title: 'Sphinx' }])), false);
  assert.equal(isMultiDay([]), false);
});

test('itineraryLines: a one-day programme numbers its stops in order', () => {
  // "Day 1: Pyramids, Day 1: Sphinx, Day 1: Museum" reads as a mistake. The
  // rows are the order the guests do things in, so they are numbered as such.
  const rows = readItinerary([
    { day: 1, title: 'Giza Pyramids' },
    { day: 1, title: 'The Sphinx', description: 'Photo stop' },
  ]);
  assert.deepEqual(itineraryLines(rows), ['1. Giza Pyramids', '2. The Sphinx — Photo stop']);
});

test('itineraryLines: a single stop is still numbered, not called Day 1', () => {
  assert.deepEqual(itineraryLines(readItinerary([{ title: 'Egyptian Museum' }])), ['1. Egyptian Museum']);
});

test('itineraryLines: one late day is enough to make the whole thing days', () => {
  // Two things on day 1 and one on day 3 is a three-day programme, so every
  // row is labelled by its day — including the two that share day one.
  const rows = readItinerary([
    { day: 1, title: 'Cairo' },
    { day: 1, title: 'Giza' },
    { day: 3, title: 'Alexandria' },
  ]);
  assert.deepEqual(itineraryLines(rows), ['Day 1: Cairo', 'Day 1: Giza', 'Day 3: Alexandria']);
});

test('itineraryLines: a one-day programme numbers stops in Arabic too', () => {
  const rows = readItinerary([{ day: 1, titleAr: 'الأهرامات' }, { day: 1, titleAr: 'أبو الهول' }]);
  assert.deepEqual(itineraryLines(rows, 'ar'), ['1. الأهرامات', '2. أبو الهول']);
});
