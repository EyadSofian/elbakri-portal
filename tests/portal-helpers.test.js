const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * The agent portal is one hand-written HTML file with its logic inline, so the
 * rules it applies — which pricing bases to offer, whether a trip already
 * collects its guests, how many parties a booking needs — were only ever
 * exercised by loading the page in a browser. They are plain functions, so the
 * script is evaluated once in a sandbox with the handful of globals it touches
 * at load time, and the functions are then called directly.
 *
 * The point is that the portal and the server agree: every rule asserted here
 * has a matching assertion in the TypeScript tests. A change to one that is not
 * mirrored in the other shows up as a failure rather than as a price the client
 * was quoted and then not charged.
 */
function loadPortal(file) {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', file), 'utf8');
  const match = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  assert.ok(match, `${file} has an inline script`);

  const noop = () => {};
  const el = () => ({
    value: '', textContent: '', innerHTML: '', placeholder: '', checked: false, dataset: {},
    style: {}, classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    focus: noop, appendChild: noop, remove: noop, insertAdjacentHTML: noop,
    addEventListener: noop, removeEventListener: noop, click: noop, closest: () => null,
    querySelector: () => null, querySelectorAll: () => [], selectedOptions: [],
  });
  const sandbox = {
    console,
    window: { matchMedia: () => ({ addEventListener: noop, matches: false }), location: {} },
    document: {
      documentElement: { lang: 'en' },
      // A stub element for every lookup: the script wires listeners as it loads,
      // and returning null there would fail on the stub's thinness, not on the code.
      getElementById: el,
      querySelector: el,
      querySelectorAll: () => [],
      addEventListener: noop,
      dispatchEvent: noop,
      createElement: el,
      body: { classList: { toggle: noop, add: noop, remove: noop }, appendChild: noop },
    },
    localStorage: { getItem: () => null, setItem: noop, clear: noop, removeItem: noop },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) }),
    setTimeout, clearTimeout, setInterval, clearInterval, URL,
    FormData: class {},
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    navigator: { language: 'en' },
    location: { href: '' },
  };
  sandbox.window.document = sandbox.document;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // The portal destructures window.PortalI18n as it loads, so the real
  // dictionary goes into the same context first — as the page's own tag does.
  vm.runInContext(fs.readFileSync(path.join(root, 'public/assets/i18n.js'), 'utf8'), sandbox);
  vm.runInContext(match[1], sandbox);
  return sandbox;
}

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

test('portal: actPartyUnits matches the server rule exactly', () => {
  // Mirrors tests/activity-pricing.test.ts — a preview that disagreed with the
  // server would quote one price and charge another.
  assert.equal(portal.actPartyUnits(6, 'DOUBLE'), 3);
  assert.equal(portal.actPartyUnits(5, 'DOUBLE'), 3);
  assert.equal(portal.actPartyUnits(4, 'DOUBLE'), 2);
  assert.equal(portal.actPartyUnits(3, 'TRIPLE'), 1);
  assert.equal(portal.actPartyUnits(7, 'TRIPLE'), 3);
  assert.equal(portal.actPartyUnits(4, 'SINGLE'), 4);
});

test('portal: actPartyUnits never charges zero parties', () => {
  assert.equal(portal.actPartyUnits(0, 'DOUBLE'), 1);
  assert.equal(portal.actPartyUnits(-2, 'DOUBLE'), 1);
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
