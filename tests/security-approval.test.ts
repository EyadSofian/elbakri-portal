import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_NATIONALITY_CODES,
  isSecurityNationality,
  normalizeSecurityNationality,
  securityNationalityLabel,
} from '../src/shared/security-nationalities';
import { pickVisaFeeRow, visaFeeSpecificity } from '../src/modules/visa/visa.controller';

// Approvals are filed for three nationalities only, and each can be priced on
// its own. The row that matches the request most closely wins.

test('the list is exactly the three nationalities approvals are filed for', () => {
  assert.deepEqual([...SECURITY_NATIONALITY_CODES], ['LEBANESE', 'IRAQI', 'SYRIAN']);
});

test('normalizeSecurityNationality: accepts the codes themselves', () => {
  assert.equal(normalizeSecurityNationality('LEBANESE'), 'LEBANESE');
  assert.equal(normalizeSecurityNationality('iraqi'), 'IRAQI');
  assert.equal(normalizeSecurityNationality(' Syrian '), 'SYRIAN');
});

test('normalizeSecurityNationality: an approval filed under the country name still resolves', () => {
  // Rows saved before the fixed list existed hold free text; they must keep
  // matching the price they were filed under.
  assert.equal(normalizeSecurityNationality('Lebanon'), 'LEBANESE');
  assert.equal(normalizeSecurityNationality('Iraq'), 'IRAQI');
  assert.equal(normalizeSecurityNationality('Syria'), 'SYRIAN');
});

test('normalizeSecurityNationality: the Arabic labels resolve too', () => {
  assert.equal(normalizeSecurityNationality('لبناني'), 'LEBANESE');
  assert.equal(normalizeSecurityNationality('عراقي'), 'IRAQI');
  assert.equal(normalizeSecurityNationality('سوري'), 'SYRIAN');
});

test('normalizeSecurityNationality: anything else is not one of the three', () => {
  for (const other of ['Saudi', 'Egyptian', '', null, undefined, 'LEB']) {
    assert.equal(normalizeSecurityNationality(other), null, String(other));
  }
});

test('isSecurityNationality mirrors the normaliser', () => {
  assert.equal(isSecurityNationality('Lebanon'), true);
  assert.equal(isSecurityNationality('Saudi'), false);
});

test('securityNationalityLabel prints the English name for a stored code', () => {
  assert.equal(securityNationalityLabel('IRAQI'), 'Iraqi');
  assert.equal(securityNationalityLabel('Iraq'), 'Iraqi');
  // An unrecognised value is echoed back rather than blanked — an old row still
  // shows whatever it was filed under.
  assert.equal(securityNationalityLabel('Martian'), 'Martian');
  assert.equal(securityNationalityLabel(null), null);
});

// ── Which fee row prices a request ──────────────────────────────────────────

test('visaFeeSpecificity: nationality outranks destination outranks airport', () => {
  // An Iraqi approval into Cairo is priced as an Iraqi approval, not as "a
  // Cairo approval that happens to be Iraqi".
  assert.ok(
    visaFeeSpecificity({ nationality: 'IRAQI' })
    > visaFeeSpecificity({ destinationCity: 'CAIRO' }),
  );
  assert.ok(
    visaFeeSpecificity({ destinationCity: 'CAIRO' })
    > visaFeeSpecificity({ destinationCountry: 'CAI' }),
  );
});

test('visaFeeSpecificity: a row with nothing filled in is the catch-all', () => {
  assert.equal(visaFeeSpecificity({}), 0);
});

test('visaFeeSpecificity: narrowers add up', () => {
  assert.equal(
    visaFeeSpecificity({ nationality: 'IRAQI', destinationCity: 'CAIRO', destinationCountry: 'CAI' }),
    7,
  );
});

test('pickVisaFeeRow: the most specific matching row wins', () => {
  const rows = [
    { id: 'catch-all' },
    { id: 'cairo', destinationCity: 'CAIRO' },
    { id: 'iraqi', nationality: 'IRAQI' },
  ];
  assert.equal(pickVisaFeeRow(rows)!.id, 'iraqi');
});

test('pickVisaFeeRow: a catch-all still prices a request when it is all there is', () => {
  assert.equal(pickVisaFeeRow([{ id: 'catch-all' }])!.id, 'catch-all');
});

test('pickVisaFeeRow: ties go to the first row, which is the most recently edited', () => {
  // The caller passes rows ordered by updatedAt desc, so "first" means "newest".
  const rows = [
    { id: 'newer', destinationCity: 'CAIRO' },
    { id: 'older', destinationCity: 'CAIRO' },
  ];
  assert.equal(pickVisaFeeRow(rows)!.id, 'newer');
});

test('pickVisaFeeRow: nothing matching is null — the desk quotes it by hand', () => {
  assert.equal(pickVisaFeeRow([]), null);
});
