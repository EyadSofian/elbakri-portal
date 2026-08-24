const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPortal } = require('./helpers/load-portal');

const portal = loadPortal('dashboard.html');

/**
 * Values built inside the sandbox carry that context's own Array/Object
 * prototypes, so assert.deepEqual rejects them as "same structure but not
 * reference-equal". Round-tripping through JSON brings them back into this
 * realm; it compares the data, which is what these assertions are about.
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

// ── What a trip covers ──────────────────────────────────────────────────────

test('portal: activityInclusionRows reads the marked list', () => {
  assert.deepEqual(
    plain(portal.activityInclusionRows({ inclusions: [{ label: 'Lunch', labelAr: 'الغداء', included: false }] })),
    [{ label: 'Lunch', labelAr: 'الغداء', included: false }],
  );
});

test('portal: activityInclusionRows falls back to the two older lists', () => {
  // A trip saved before the marked list existed must still show its inclusions.
  assert.deepEqual(
    plain(portal.activityInclusionRows({ includes: ['Lunch'], excludes: ['Tips'] }).map((r) => [r.label, r.included])),
    [['Lunch', true], ['Tips', false]],
  );
});

test('portal: activityInclusionRows drops blank lines', () => {
  assert.equal(portal.activityInclusionRows({ inclusions: [{ label: '  ' }, { label: 'Lunch' }] }).length, 1);
});

test('portal: an empty trip renders no inclusion boxes at all', () => {
  assert.equal(portal.activityInclusionBoxes({}), '');
});

test('portal: inclusion boxes label both halves', () => {
  const html = portal.activityInclusionBoxes({ includes: ['Lunch'], excludes: ['Tips'] });
  assert.match(html, /act-inc-box--in/);
  assert.match(html, /act-inc-box--out/);
  assert.match(html, /Lunch/);
  assert.match(html, /Tips/);
});

test('portal: an inclusion line is escaped, never injected', () => {
  const html = portal.activityInclusionBoxes({ includes: ['<img onerror=alert(1)>'] });
  assert.doesNotMatch(html, /<img onerror/);
  assert.match(html, /&lt;img/);
});

// ── Does this trip already collect its guests? ──────────────────────────────

test('portal: actTransferIncluded honours the explicit flag', () => {
  assert.equal(portal.actTransferIncluded({ transferIncluded: true }), true);
});

test('portal: actTransferIncluded reads an inclusion line too', () => {
  assert.equal(portal.actTransferIncluded({ includes: ['Transfer from your hotel'] }), true);
  assert.equal(portal.actTransferIncluded({ includes: ['Lunch'] }), false);
});

test('portal: a transfer listed as NOT included does not count as included', () => {
  assert.equal(portal.actTransferIncluded({ inclusions: [{ label: 'Transfer', included: false }] }), false);
});

test('portal: a trip that includes a transfer is never offered another', () => {
  const html = portal.activityTransferPanel({ transferIncluded: true }, 'act');
  assert.doesNotMatch(html, /actTransferToggle/);
  assert.match(html, /act-transfer-state--on/);
});

test('portal: a trip without a transfer gets the add-transfer control', () => {
  const html = portal.activityTransferPanel({}, 'act');
  assert.match(html, /actTransferToggle/);
  assert.match(html, /actTransferFrom/);
  assert.match(html, /actTransferReturn/);
});

test('portal: the transfer panel starts on the trip’s own return time', () => {
  const html = portal.activityTransferPanel({ returnTime: '05:00 PM' }, 'act');
  assert.match(html, /value="17:00"/);
});

// ── Party pricing: the portal must agree with the server ────────────────────

// A trip sold at every party size, matching the ALL fixture on the server side.
const ALL_PRICES = { SINGLE: 60, DOUBLE: 100, TRIPLE: 120 };
const shape = (lines) => plain(lines || []).map((l) => [l.basis, l.count]);

test('portal: a group composes exactly as the server composes it', () => {
  // Mirrors tests/activity-pricing.test.ts. A preview that disagreed with the
  // server would quote one price and charge another.
  assert.deepEqual(shape(portal.actPartyComposition(6, 'DOUBLE', ALL_PRICES)), [['DOUBLE', 3]]);
  assert.deepEqual(shape(portal.actPartyComposition(5, 'DOUBLE', ALL_PRICES)), [['DOUBLE', 2], ['SINGLE', 1]]);
  assert.deepEqual(shape(portal.actPartyComposition(4, 'TRIPLE', ALL_PRICES)), [['TRIPLE', 1], ['SINGLE', 1]]);
  assert.deepEqual(shape(portal.actPartyComposition(5, 'TRIPLE', ALL_PRICES)), [['TRIPLE', 1], ['DOUBLE', 1]]);
  assert.deepEqual(shape(portal.actPartyComposition(4, 'SINGLE', ALL_PRICES)), [['SINGLE', 4]]);
});

test('portal: the odd guest is previewed at a single rate, as they are charged', () => {
  assert.equal(portal.actCompositionTotal(portal.actPartyComposition(5, 'DOUBLE', ALL_PRICES)), 260);
});

test('portal: an unpriced leftover size falls back to a whole party, as on the server', () => {
  const doubleOnly = { DOUBLE: 100 };
  assert.deepEqual(shape(portal.actPartyComposition(5, 'DOUBLE', doubleOnly)), [['DOUBLE', 2], ['DOUBLE', 1]]);
  assert.equal(portal.actCompositionTotal(portal.actPartyComposition(5, 'DOUBLE', doubleOnly)), 300);
});

test('portal: an unpriced chosen rate previews nothing rather than zero', () => {
  assert.equal(portal.actPartyComposition(4, 'TRIPLE', { DOUBLE: 100 }), null);
});

test('portal: a composition never charges zero parties', () => {
  for (const pax of [0, -2, NaN]) {
    assert.ok(portal.actCompositionUnits(portal.actPartyComposition(pax, 'DOUBLE', ALL_PRICES)) >= 1, String(pax));
  }
});

test('portal: the price row spells the composition out', () => {
  const lines = portal.actPartyComposition(5, 'DOUBLE', ALL_PRICES);
  assert.equal(
    portal.actCompositionLabel(lines, { SINGLE: 'Single', DOUBLE: 'Double', TRIPLE: 'Triple' }),
    '2 × Double + 1 × Single',
  );
});

test('portal: only the priced bases are offered to the client', () => {
  assert.deepEqual(plain(portal.actPartyPriceRows({ priceDouble: 120 }).map((r) => r[0])), ['DOUBLE']);
  assert.deepEqual(plain(portal.actPartyPriceRows({ priceSingle: 70, priceTriple: 150 }).map((r) => r[0])), ['SINGLE', 'TRIPLE']);
  assert.equal(portal.actPartyPriceRows({}).length, 0);
});

test('portal: a zero party price is a real price, not a blank', () => {
  assert.deepEqual(plain(portal.actPartyPriceRows({ priceSingle: 0 }).map((r) => r[0])), ['SINGLE']);
});

// ── Small helpers the forms depend on ───────────────────────────────────────

test('portal: actTimeValue produces what <input type="time"> accepts', () => {
  assert.equal(portal.actTimeValue('05:00 PM'), '17:00');
  assert.equal(portal.actTimeValue('08:05'), '08:05');
  assert.equal(portal.actTimeValue('12:00 AM'), '00:00');
});

test('portal: actTimeValue leaves the field empty rather than guessing', () => {
  for (const bad of ['8:5', 'nonsense', '25:00', '', null, undefined]) {
    assert.equal(portal.actTimeValue(bad), '', String(bad));
  }
});

test('portal: cssUrl escapes a quote so a background-image cannot break out', () => {
  assert.equal(portal.cssUrl("a'b"), "a\\'b");
});

test('portal: weekdayLabel spells a stored day out', () => {
  assert.equal(portal.weekdayLabel('MONDAY'), 'Monday');
});

test('portal: a cruise with no schedule says so rather than rendering blank', () => {
  assert.match(portal.cruiseScheduleSummary({}), /—/);
});

test('portal: a cruise schedule reads departure → return with its night count', () => {
  const html = portal.cruiseScheduleSummary({
    schedules: [{ departureDay: 'MONDAY', returnDay: 'THURSDAY', nights: 3 }],
  });
  assert.match(html, /Monday/);
  assert.match(html, /Thursday/);
  assert.match(html, /3/);
});
