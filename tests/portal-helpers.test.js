const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPortal } = require('./helpers/load-portal');

const portal = loadPortal('dashboard.html');
const adminPortal = loadPortal('admin.html');
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

test('portal: an unpriced activity is routed to a quote instead of a dead booking flow', () => {
  assert.equal(portal.actHasBookablePrice({}), false);
  assert.equal(portal.actHasBookablePrice({ priceAdult: 0 }), true);
  assert.equal(portal.actHasBookablePrice({ priceDouble: 85 }), true);
  assert.match(dashboardSource, /const directBookable = a\.isConfirmableInApp !== false && actHasBookablePrice\(a\)/);
  assert.match(dashboardSource, /directBookable[\s\S]{0,500}?submitActivityQuoteBtn/);
  assert.match(dashboardSource, /actHasBookablePrice\(a\)[\s\S]{0,500}?openActivityDetails/);
});

test('portal: legacy zero party prices do not create fake booking modes', () => {
  assert.deepEqual(plain(portal.actPartyPriceRows({ priceSingle: 0, priceDouble: 0 }).map((r) => r[0])), []);
  assert.equal(portal.actHasBookablePrice({ priceAdult: 60, priceSingle: 0 }), true);
  assert.equal(portal.actPartyPrice({ SINGLE: 0 }, 'SINGLE'), null);
});

test('portal: an activity with no configured service types does not show a fake no-data choice', () => {
  assert.equal(portal.activityGroupTypeOptions([]), '');
  assert.match(dashboardSource, /id="actGroupTypeField"[^>]*groupTypes\.length/);
  assert.match(dashboardSource, /field\.style\.display = state\.activityGroupTypes\.length \? "" : "none"/);
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

test('admin: cruise nights are derived from From / Back and cannot drift', () => {
  assert.equal(adminPortal.crScheduleNightsForDays('MONDAY', 'FRIDAY'), 4);
  assert.equal(adminPortal.crScheduleNightsForDays('FRIDAY', 'MONDAY'), 3);
  assert.equal(adminPortal.crScheduleNightsForDays('MONDAY', 'MONDAY'), 7);
  assert.match(adminSource, /class="cr-nights"[^>]*readonly/);
  assert.match(adminSource, /const nights = crScheduleNightsForDays/);
});

test('portal: selected cruise departure and return dates are locked in the request', () => {
  assert.match(dashboardSource, /lockCruiseDates: serviceType === "CRUISE"/);
  assert.match(dashboardSource, /class="cr-locked-date"/);
  assert.match(dashboardSource, /readonly aria-readonly="true"/);
  assert.match(dashboardSource, /const isCruise = serviceType === "CRUISE";[\s\S]{0,600}const body =/);
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

test('portal: all programme durations stay visible and selecting one moves to its sailing', () => {
  assert.match(dashboardSource, /function crRenderProgrammeChoices/);
  assert.match(dashboardSource, /const programmes = cruise\.programmes \|\| \[\]/);
  assert.match(dashboardSource, /crSelectScheduleRadio\(programme\.scheduleId\)/);
  assert.match(dashboardSource, /row\.id === state\.cruiseSelection\.programmeId && row\.scheduleId === scheduleId/);
});

test('portal: the sailing date moves to the next real departure day', () => {
  assert.equal(portal.crNextDepartureDate('2026-08-30', 'MONDAY'), '2026-08-31');
  assert.equal(portal.crNextDepartureDate('2026-08-30', 'FRIDAY'), '2026-09-04');
  assert.equal(portal.crNextDepartureDate('2026-08-31', 'MONDAY'), '2026-08-31');
});

test('portal: a programme without an applicable rate is visible but cannot be selected', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(portal.crProgrammeBookability({ priceVisible: true }, { hasRates: false, rates: [] }))),
    { selectable: false, status: 'UNAVAILABLE' },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(portal.crProgrammeBookability({ priceVisible: true }, { hasRates: true, rates: [{ singlePrice: 150 }] }))),
    { selectable: true, status: 'PRICED' },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(portal.crProgrammeBookability({ priceVisible: false }, { hasRates: true, rates: [] }))),
    { selectable: true, status: 'PRICE_ON_REQUEST' },
  );
});

test('portal: a requested Nile cruise product can never silently downgrade', () => {
  assert.equal(portal.crProductSelectionError('CRUISE_ONLY', { cruise: {} }), null);
  assert.equal(portal.crProductSelectionError('PROGRAMME', { cruise: {}, programme: null }), 'PROGRAMME_REQUIRED');
  assert.equal(portal.crProductSelectionError('PROGRAMME', { cruise: {}, programme: { hasRates: false } }), 'PROGRAMME_UNAVAILABLE');
  assert.equal(portal.crProductSelectionError('PROGRAMME', { cruise: {}, programme: { hasRates: true } }), null);
  assert.equal(portal.crProductSelectionError('TRANSFER', { cruise: {}, transferRate: null }), 'TRANSFER_REQUIRED');
  assert.equal(portal.crProductSelectionError('TRANSFER', { cruise: {}, transferRate: { id: 'tr-1' }, transferPax: 0 }), 'TRANSFER_PAX_INVALID');
  assert.equal(portal.crProductSelectionError('TRANSFER', { cruise: {}, transferRate: { id: 'tr-1' }, transferPax: 3 }), null);
  assert.match(dashboardSource, /crProductSelectionError\(productMode, selection\)/);
});

test('portal: Nile cruise presents three explicit mutually-exclusive products', () => {
  assert.match(dashboardSource, /name="crProductMode" value="CRUISE_ONLY"/);
  assert.match(dashboardSource, /name="crProductMode" value="PROGRAMME"/);
  assert.match(dashboardSource, /name="crProductMode" value="TRANSFER"/);
  assert.match(dashboardSource, /mode !== "TRANSFER"/);
  assert.match(dashboardSource, /mode === "TRANSFER" && !programme/);
});

test('portal: cruise transfer prices explicit vehicle products by capacity', () => {
  assert.match(dashboardSource, /id="crTransferPax"/);
  assert.match(dashboardSource, /rate\?\.tripType === "ROUND_TRIP"/);
  assert.deepEqual(
    plain(portal.crVehicleTransferPrice({ amount: 100, vehicleCapacity: 6, tripType: 'ONE_WAY' }, 6)),
    { pax: 6, capacity: 6, vehicleCount: 1, unitPrice: 100, total: 100, tripType: 'ONE_WAY' },
  );
  assert.deepEqual(
    plain(portal.crVehicleTransferPrice({ amount: 180, vehicleCapacity: 12, tripType: 'ROUND_TRIP' }, 13)),
    { pax: 13, capacity: 12, vehicleCount: 2, unitPrice: 180, total: 360, tripType: 'ROUND_TRIP' },
  );
  assert.doesNotMatch(dashboardSource, /rate\.roundTripAmount/);
  assert.match(adminSource, /class="cr-transfer-vehicle"/);
  assert.match(adminSource, /class="cr-transfer-capacity"/);
  assert.match(adminSource, /class="cr-active"/);
});

test('portal: Nile cruise programme reaches the quote as structured business data', () => {
  const fields = portal.crQuoteSelectionFields('PROGRAMME', {
    programme: { id: 'programme-3', name: 'Three nights programme' },
    rate: { id: 'programme-rate-3' },
    occupancy: null,
    adultUnitPrice: 790,
    childUnitPrice: 285,
    total: 1865,
    currency: 'USD',
    supplements: [{ name: 'New Year' }],
    transferRate: null,
  }, {
    id: 'schedule-3', departureDay: 'FRIDAY', returnDay: 'MONDAY', nights: 3,
  }, '2026-09-04');

  assert.deepEqual(plain(fields), {
    cruiseProductMode: 'PROGRAMME',
    cruiseScheduleId: 'schedule-3',
    cruiseScheduleRoute: 'FRIDAY_TO_MONDAY',
    cruiseNights: 3,
    cruiseSailingDate: '2026-09-04',
    cruiseProgrammeId: 'programme-3',
    cruiseProgrammeName: 'Three nights programme',
    cruiseRateId: 'programme-rate-3',
    cruiseAdultUnitPrice: 790,
    cruiseChildUnitPrice: 285,
    cruiseCurrency: 'USD',
    cruiseProductTotal: 1865,
    cruiseSupplements: ['New Year'],
  });
});

test('portal: Nile cruise transfer reaches the quote as one vehicle product, not a per-person guess', () => {
  const fields = portal.crQuoteSelectionFields('TRANSFER', {
    programme: null,
    rate: { id: 'cabin-rate-4' },
    occupancy: 'DOUBLE',
    adultUnitPrice: 500,
    childUnitPrice: 200,
    total: 2360,
    currency: 'USD',
    supplements: [],
    transferRate: { id: 'transfer-rt-12', vehicleType: 'VAN_12', currency: 'USD' },
    transferTripType: 'ROUND_TRIP',
    transferPax: 13,
    transferCapacity: 12,
    transferVehicleCount: 2,
    transferUnitPrice: 180,
    transferTotal: 360,
  }, {
    id: 'schedule-4', departureDay: 'MONDAY', returnDay: 'FRIDAY', nights: 4,
  }, '2026-08-31');

  assert.equal(fields.cruiseProductMode, 'TRANSFER');
  assert.equal(fields.cruiseTransferRateId, 'transfer-rt-12');
  assert.equal(fields.cruiseTransferTripType, 'ROUND_TRIP');
  assert.equal(fields.cruiseTransferVehicleType, 'VAN_12');
  assert.equal(fields.cruiseTransferVehicleCapacity, 12);
  assert.equal(fields.cruiseTransferPaxCount, 13);
  assert.equal(fields.cruiseTransferVehicleCount, 2);
  assert.equal(fields.cruiseTransferPricePerVehicle, 180);
  assert.equal(fields.cruiseTransferTotal, 360);
  assert.match(adminSource, /cruiseTransferPaxCount \?\? q\.transferPaxCount/);
});

test('portal: cruise selection fields survive both template and fallback quote forms', () => {
  assert.deepEqual(
    plain(portal.mergeQuoteCustomFields({ agentReference: 'A-7' }, { cruiseProductMode: 'PROGRAMME', cruiseProgrammeId: 'p-3' })),
    { agentReference: 'A-7', cruiseProductMode: 'PROGRAMME', cruiseProgrammeId: 'p-3' },
  );
  assert.match(dashboardSource, /state\.quotePrefillCustomFields = crQuoteSelectionFields/);
  assert.match(dashboardSource, /prefillCustomFields: prefillCustomFields/);
  assert.match(dashboardSource, /customFields: mergeQuoteCustomFields\(custom, ctx\.prefillCustomFields\)/);
  assert.match(dashboardSource, /customFields: prefillCustomFields/);
});

test('portal: the cruise request payload keeps programme and transfer selections intact', () => {
  const payload = portal.buildCruiseQuotePayload({
    nationality: 'Lebanese', checkIn: '2026-09-04', checkOut: '2026-09-07',
    adults: 2, children: 0, notes: 'Three nights',
  }, {
    serviceId: 'cruise-1', serviceName: 'MS Nile Dawn',
    prefillCustomFields: {
      cruiseProductMode: 'PROGRAMME', cruiseScheduleId: 'schedule-3',
      cruiseProgrammeId: 'programme-3', cruiseRateId: 'rate-3',
    },
    transfer: { transferRequested: false, transferIncluded: true },
  }, { agentReference: 'AG-9' });

  assert.equal(payload.cruiseId, 'cruise-1');
  assert.equal(payload.customFields.cruiseProductMode, 'PROGRAMME');
  assert.equal(payload.customFields.cruiseProgrammeId, 'programme-3');
  assert.equal(payload.customFields.cruiseRateId, 'rate-3');
  assert.equal(payload.customFields.agentReference, 'AG-9');
  assert.equal(payload.transferRequested, false);

  const transferPayload = portal.buildCruiseQuotePayload({
    nationality: 'Egyptian', checkIn: '2026-09-07', checkOut: '2026-09-11',
    adults: 7, children: 0, notes: 'Separate transfer party',
  }, {
    serviceId: 'cruise-1', serviceName: 'MS Nile Dawn',
    prefillCustomFields: {
      cruiseProductMode: 'TRANSFER', cruiseScheduleId: 'schedule-4',
      cruiseTransferRateId: 'transfer-rt-12', cruiseTransferPaxCount: 13,
    },
    transfer: {
      transferRequested: true, transferTripType: 'ROUND_TRIP', transferPaxCount: 13,
      transferVehicleType: 'VAN_12', transferVehicleCapacity: 12, transferVehicleCount: 2,
    },
  }, {});
  assert.equal(transferPayload.adultsCount, 7);
  assert.equal(transferPayload.transferPaxCount, 13);
  assert.equal(transferPayload.customFields.cruiseTransferPaxCount, 13);
  assert.equal(transferPayload.transferVehicleCount, 2);
});

test('portal: an empty or malformed request-form template falls back to the complete built-in form', () => {
  assert.equal(portal.rfTemplateHasFields(null), false);
  assert.equal(portal.rfTemplateHasFields([]), false);
  assert.equal(portal.rfTemplateHasFields({ config: { fields: [] } }), false);
  assert.equal(portal.rfTemplateHasFields({ config: { fields: [{ key: 'notes', type: 'textarea' }] } }), true);
  assert.match(dashboardSource, /rfTemplateHasFields\(r\?\.data\) \? r\.data : null/);
});

test('portal: security templates cannot make the passport or flight ticket optional', () => {
  assert.equal(portal.rfFieldRequired('security_approval', { key: 'passportUrl' }), true);
  assert.equal(portal.rfFieldRequired('security_approval', { key: 'flightTicketUrl', required: false }), true);
  assert.equal(portal.rfFieldRequired('security_approval', { key: 'notes' }), false);
  assert.equal(portal.rfFieldRequired('hotel_request', { key: 'passportUrl' }), false);
  assert.match(adminSource, /key:"passportUrl"[\s\S]{0,160}?required:true/);
  assert.match(adminSource, /key:"flightTicketUrl"[\s\S]{0,160}?required:true/);
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

test('admin: a Nile cruise request shows the chosen programme and vehicle product as operations data', () => {
  const html = adminPortal.cruiseSelectionBlock({
    customFields: {
      cruiseProductMode: 'TRANSFER',
      cruiseScheduleRoute: 'MONDAY_TO_FRIDAY',
      cruiseNights: 4,
      cruiseSailingDate: '2026-08-31',
      cruiseOccupancy: 'DOUBLE',
      cruiseTransferRateId: 'transfer-rt-12',
      cruiseTransferTripType: 'ROUND_TRIP',
      cruiseTransferVehicleType: 'VAN_12',
      cruiseTransferVehicleCapacity: 12,
      cruiseTransferVehicleCount: 2,
      cruiseTransferPricePerVehicle: 180,
      cruiseTransferTotal: 360,
      cruiseCurrency: 'USD',
    },
    transferRequested: true,
    transferFromName: 'Luxor Airport',
    transferToName: 'Cruise dock',
    transferPaxCount: 13,
  });
  assert.match(html, /Cruise \+ transfer/);
  assert.match(html, /Monday → Friday/);
  assert.match(html, /Round-trip/);
  assert.match(html, /13 passengers/i);
  assert.match(html, /VAN 12/);
  assert.match(html, /2 vehicles/);
  assert.match(html, /360/);
  assert.doesNotMatch(html, /cruiseTransferRateId/);
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

test('portal: the activity package cart stays visible on mobile instead of becoming a hidden filter drawer', () => {
  assert.match(dashboardSource, /class="filter-rail activity-package-cart-rail"/);
  assert.match(portalCss, /\.activity-package-cart-rail\s*\{[\s\S]*?position:\s*static[\s\S]*?transform:\s*none\s*!important/);
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
