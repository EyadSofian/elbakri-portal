const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPortal } = require('./helpers/load-portal');

const portal = loadPortal('dashboard.html');
const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
const adminSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
const portalCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'portal.css'), 'utf8');

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

test('portal: a priced activity transfer shows its add-on and default route', () => {
  const html = portal.activityTransferPanel({
    transferIncluded: false,
    transferPrice: 18,
    currency: 'USD',
    transferFromName: 'Cairo hotel',
    transferToName: 'Activity point',
  }, 'act');
  assert.match(html, /Fixed add-on/);
  assert.match(html, /18/);
  assert.match(html, /value="Cairo hotel"/);
  assert.match(html, /value="Activity point"/);
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

test('portal: the cruise return date follows the selected 3/4-night schedule', () => {
  assert.equal(portal.crReturnDate('2026-08-31', 4), '2026-09-04');
  assert.equal(portal.crReturnDate('2026-09-04', 3), '2026-09-07');
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
  assert.match(html, /From/);
  assert.match(html, /Back/);
  assert.match(html, /cr-schedule-summary-row/);
});

// ── Picking a cabin AND how many share it ───────────────────────────────────

test('portal: crCabinPrice reads the occupancy the agent picked', () => {
  const rate = { singlePrice: 900, doublePrice: 600, triplePrice: 550 };
  assert.equal(portal.crCabinPrice(rate, 'SINGLE'), 900);
  assert.equal(portal.crCabinPrice(rate, 'DOUBLE'), 600);
  assert.equal(portal.crCabinPrice(rate, 'TRIPLE'), 550);
});

test('portal: a blank cabin price is "not sold that way", never free', () => {
  // Reading a blank as zero would give the cabin away, so every empty shape a
  // rate row can carry has to come back as null.
  for (const blank of [null, undefined, '']) {
    assert.equal(portal.crCabinPrice({ triplePrice: blank }, 'TRIPLE'), null, String(blank));
  }
});

test('portal: crCabinsNeeded never sells half a cabin', () => {
  // Five guests in doubles need three cabins: a half-empty cabin is still a
  // whole cabin on the bill.
  assert.equal(portal.crCabinsNeeded(5, 'DOUBLE'), 3);
  assert.equal(portal.crCabinsNeeded(4, 'DOUBLE'), 2);
  assert.equal(portal.crCabinsNeeded(1, 'SINGLE'), 1);
  assert.equal(portal.crCabinsNeeded(7, 'TRIPLE'), 3);
});

test('portal: crCabinsNeeded treats a nonsense party as one cabin, not zero', () => {
  for (const pax of [0, -3, 'many', null, undefined]) {
    assert.equal(portal.crCabinsNeeded(pax, 'DOUBLE'), 1, String(pax));
  }
});

test('portal: an unpriced boat says the rates are hidden, not that none exist', () => {
  // "No per-person fares set yet" is a lie whenever the boat IS priced and the
  // rates were simply not shown to this agent.
  const hidden = portal.cruiseCabinPicker({ hasRateMatrix: true, priceVisible: false }, []);
  assert.match(hidden, /operations team/);
  assert.doesNotMatch(hidden, /No per-person fares set yet/);

  const unpriced = portal.cruiseCabinPicker({ hasRateMatrix: false, priceVisible: true }, []);
  assert.match(unpriced, /No per-person fares set yet/);

  // Prices hidden from this agent: they cannot know whether the boat is priced,
  // so "nobody has priced it" is not ours to say either way.
  const bothHidden = portal.cruiseCabinPicker({ hasRateMatrix: false, priceVisible: false }, []);
  assert.match(bothHidden, /operations team/);
});

test('portal: every priced cell is a choice, and every blank one is not', () => {
  const html = portal.cruiseCabinPicker({}, [
    { id: 'r1', cabinName: 'Standard', currency: 'USD', singlePrice: 900, doublePrice: 600, triplePrice: null },
  ]);
  assert.match(html, /value="r1\|SINGLE"/);
  assert.match(html, /value="r1\|DOUBLE"/);
  // The triple has no price, so it is not offered as something to book.
  assert.doesNotMatch(html, /value="r1\|TRIPLE"/);
  assert.match(html, /cr-cell-empty/);
});

test('portal: the picker opens on the cheapest cell actually sold', () => {
  const html = portal.cruiseCabinPicker({}, [
    { id: 'r1', cabinName: 'Suite', currency: 'USD', singlePrice: 1500, doublePrice: 1200 },
    { id: 'r2', cabinName: 'Standard', currency: 'USD', singlePrice: 900, doublePrice: 550 },
  ]);
  assert.match(html, /value="r2\|DOUBLE" checked/);
  assert.equal((html.match(/ checked/g) || []).length, 1);
});

test('portal: a cabin name is escaped, never injected', () => {
  const html = portal.cruiseCabinPicker({}, [
    { id: 'r1', cabinName: '<img onerror=alert(1)>', currency: 'USD', doublePrice: 600 },
  ]);
  assert.doesNotMatch(html, /<img onerror/);
  assert.match(html, /&lt;img/);
});

test('portal: the current cruise picker labels occupancy prices per person and shows child price', () => {
  const html = portal.crPerPersonFarePicker({}, [
    { id: 'r1', cabinName: 'Winter', currency: 'USD', singlePrice: 900, doublePrice: 600, triplePrice: 500, childPrice: 225 },
  ]);
  assert.match(html, /per person/);
  assert.match(html, /per child/);
  assert.match(html, /value="r1\|DOUBLE"/);
  assert.doesNotMatch(html, /per cabin/);
});

test('portal: programme pricing is adult/child per person with no occupancy choice', () => {
  assert.match(dashboardSource, /if \(isProgramme\)[\s\S]*?\|PROGRAMME/);
  assert.match(dashboardSource, /rate\.singlePrice[\s\S]*?adultPerPerson/);
  assert.match(adminSource, /class="cr-adult"/);
  assert.doesNotMatch(adminSource, /cr-programme-market-rate[\s\S]{0,1200}class="cr-double"/);
});

test('portal: programmes are filtered by exact schedule so 3 and 4 nights cannot mix', () => {
  assert.match(dashboardSource, /filter\(p => p\.scheduleId === scheduleId\)/);
  assert.match(dashboardSource, /find\(p => p\.id === programmeId && p\.scheduleId === scheduleId\)/);
});

test('portal: cruise transfer prices explicit vehicle products by capacity', () => {
  assert.match(dashboardSource, /id="crTransferPax"/);
  assert.match(dashboardSource, /transferRate\?\.tripType === "ROUND_TRIP"/);
  assert.match(dashboardSource, /Math\.ceil\(transferPax \/ transferCapacity\)/);
  assert.match(dashboardSource, /transferUnitPrice \* transferVehicleCount/);
  assert.doesNotMatch(dashboardSource, /rate\.roundTripAmount/);
  assert.match(adminSource, /class="cr-transfer-vehicle"/);
  assert.match(adminSource, /class="cr-transfer-capacity"/);
  assert.match(adminSource, /class="cr-active"/);
});

test('portal: a priced transfer remains available when the cruise fare is price-on-request', () => {
  assert.match(dashboardSource, /const cruise = selected\?\.cruise \|\| \(state\.cache\.cruisesRows \|\| \[\]\)\.find/);
  assert.match(dashboardSource, /if \(!host \|\| !cruise\)/);
  assert.match(dashboardSource, /transferTotal/);
  assert.match(dashboardSource, /sel\.adultUnitPrice == null[\s\S]*?sel\.transferRate/);
});

test('admin: programmes and transfers have one shared catalogue across cruises', () => {
  assert.match(adminSource, /\/cruise-shared-catalogue/);
  assert.match(adminSource, /renderCruiseSharedCatalogue/);
  assert.match(adminSource, /class="cr-shared-route"/);
  assert.match(adminSource, /class="cr-shared-nights"/);
});

test('portal: selected cruise cards have a WebKit-safe explicit class fallback', () => {
  assert.match(dashboardSource, /function crSyncChoiceCards/);
  assert.match(portalCss, /\.cr-sailing-card\.is-selected/);
});

test('portal: a programme fare with no child rate visibly stays unpriced', () => {
  const html = portal.crPerPersonFarePicker({}, [
    { id: 'r1', cabinName: 'Summer', currency: 'USD', doublePrice: 600, childPrice: null },
  ]);
  assert.match(html, /<td>—<\/td>/);
});

// ── The day-by-day programme ────────────────────────────────────────────────

test('portal: no programme renders nothing at all', () => {
  assert.equal(portal.itineraryHtml(undefined, 'cruise.itinerary', 'Programme'), '');
  assert.equal(portal.itineraryHtml([], 'cruise.itinerary', 'Programme'), '');
});

test('portal: a multi-day programme lists each day with its write-up', () => {
  const html = portal.itineraryHtml([
    { day: 1, title: 'Embarkation', description: 'Board at Luxor' },
    { day: 2, title: 'Edfu & Kom Ombo' },
  ], 'cruise.itinerary', 'Programme');
  assert.match(html, /Day 1/);
  assert.match(html, /Embarkation/);
  assert.match(html, /Board at Luxor/);
  assert.match(html, /Day 2/);
});

test('portal: a one-day programme numbers its stops instead of repeating Day 1', () => {
  // A morning at the Egyptian Museum is a sequence of stops. Labelling them
  // "Day 1, Day 1, Day 1" would read as a mistake, not a programme.
  const html = portal.itineraryHtml([
    { day: 1, title: 'Giza Pyramids' },
    { day: 1, title: 'The Sphinx' },
  ], 'activity.itinerary', 'Programme');
  assert.doesNotMatch(html, /Day 1/);
  assert.match(html, /1\./);
  assert.match(html, /2\./);
});

test('portal: one late day makes the whole programme read as days', () => {
  const html = portal.itineraryHtml([
    { day: 1, title: 'Cairo' },
    { day: 3, title: 'Alexandria' },
  ], 'activity.itinerary', 'Programme');
  assert.match(html, /Day 1/);
  assert.match(html, /Day 3/);
});

test('portal: a programme line is escaped, never injected', () => {
  const html = portal.itineraryHtml(
    [{ day: 1, title: '<img onerror=alert(1)>' }],
    'cruise.itinerary',
    'Programme',
  );
  assert.doesNotMatch(html, /<img onerror/);
  assert.match(html, /&lt;img/);
});

// ── A cruise that does not collect its guests ───────────────────────────────

test('portal: a fare that collects the guests is never offered an added transfer', () => {
  const html = portal.transferPanel({ prefix: 'cr', included: true });
  assert.match(html, /Transfer included/);
  assert.doesNotMatch(html, /crTransferFrom/);
});

test('portal: a fare that does not collect them asks where the driver goes', () => {
  const html = portal.transferPanel({ prefix: 'cr', included: false });
  assert.match(html, /crTransferFrom/);
  assert.match(html, /crTransferTo/);
  assert.match(html, /crTransferPickup/);
  assert.match(html, /crTransferReturn/);
  assert.match(html, /crTransferRequested/);
  assert.match(html, /Add transfer/);
});

test('portal: a cruise transfer stays structured when the quote form opens', () => {
  // If either hand-off disappears, From/Back survive only as prose in Notes
  // and Transport can no longer place the requested car in its queue.
  assert.match(dashboardSource, /state\.quotePrefillTransfer = transfer/);
  assert.match(dashboardSource, /const prefillTransfer = state\.quotePrefillTransfer/);
  assert.match(dashboardSource, /\.\.\.prefillTransfer/);
  assert.match(dashboardSource, /\.\.\.\(ctx\.transfer \|\| \{ transferRequested: false \}\)/);
});

test('portal: the operator\'s own transfer wording is shown, and escaped', () => {
  const html = portal.transferPanel({ prefix: 'cr', included: true, note: '<b>Pier only</b>' });
  assert.match(html, /&lt;b&gt;Pier only/);
  assert.doesNotMatch(html, /<b>Pier only/);
});

test('portal: the return-time hint only appears when a time was inherited', () => {
  // A cruise has no "return time of the trip" to take one from, so promising
  // the agent it was taken from one would be false.
  assert.doesNotMatch(portal.transferPanel({ prefix: 'cr', included: false }), /Taken from the trip/);
  assert.match(
    portal.transferPanel({ prefix: 'act', included: false, returnTime: '05:00 PM' }),
    /Taken from the trip/,
  );
});

test('portal: an activity package sends its chosen pricing basis to the server', () => {
  assert.match(dashboardSource, /pricingBasis:\s*i\.pricingBasis/);
  assert.match(dashboardSource, /pricingBasis,\s*pricingLabel/);
  assert.match(dashboardSource, /pkgPriceResult\(adultsCount, childrenCount, pricingBasis/);
});

test('portal: adding or removing a package item keeps the current destination and cart visible', () => {
  assert.match(dashboardSource, /function renderCurrentActivityPackageDestination/);
  assert.match(dashboardSource, /closeModal\(\);\s*renderCurrentActivityPackageDestination\(\);/);
  assert.match(dashboardSource, /filter\(item => item\.localId !== localId\);\s*renderCurrentActivityPackageDestination\(\);/);
});

test('portal: the activity package choice and destination-first flow are permanently rendered', () => {
  assert.match(dashboardSource, /renderActivities\('package'\)/);
  assert.match(dashboardSource, /return renderActivityDestinations\(\s*"renderActivityPackageByDest"/);
});

test('offers: admin and client both split Offers from Packages', () => {
  assert.match(adminSource, /setOfferAdminTab\('OFFER'\)/);
  assert.match(adminSource, /setOfferAdminTab\('PACKAGE'\)/);
  assert.match(dashboardSource, /setOfferClientTab\('OFFER'\)/);
  assert.match(dashboardSource, /setOfferClientTab\('PACKAGE'\)/);
});

test('offers: the package editor exposes hotel, transfer, activity and price-period steps', () => {
  for (const tab of ['hotels', 'transfers', 'activities', 'pricing']) {
    assert.match(adminSource, new RegExp(`data-of-tab="${tab}"`));
  }
});

test('offers: images are uploaded and placement is not exposed as a redundant field', () => {
  assert.match(adminSource, /type="file" id="ofImgFile"/);
  assert.match(adminSource, /onchange="ofPickImage\(this\)"/);
  assert.match(adminSource, /uploadImageToServer\(file\)/);
  assert.match(adminSource, /class="of-image-preview"/);
  assert.match(adminSource, /type="hidden" id="ofSvcType"/);
  assert.doesNotMatch(adminSource, /<select id="ofSvcType"/);
});

test('admin: checkbox and radio controls cannot inherit a full-width text input', () => {
  assert.match(portalCss, /\.form-field input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(portalCss, /input\[type="checkbox"\][\s\S]*?inline-size:\s*18px/);
  assert.match(adminSource, /class="form-check-control"/);
});

test('portal: package child pricing never falls back to the adult price', () => {
  assert.doesNotMatch(dashboardSource, /priceChild\s*\|\|\s*priceAdult/);
  assert.match(dashboardSource, /children > 0 && ctx\.priceChild === null/);
});
