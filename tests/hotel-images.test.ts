import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByTag, normalizeHotelImage, tagKey } from '../src/modules/hotels/images.controller';

// Hotel photos filed under a name the operator invents — "Sea View", "Single
// Room" — so an agent can show a client the pictures they actually asked for.

test('tagKey: two spellings of the same album share one key', () => {
  // Without this "Sea View" and "sea  view" would render as two albums holding
  // half the photos each.
  assert.equal(tagKey('Sea View'), tagKey('sea  view'));
  assert.equal(tagKey('Sea View'), 'SEA_VIEW');
});

test('tagKey: punctuation is folded, edges are trimmed', () => {
  assert.equal(tagKey('  Sea-View!  '), 'SEA_VIEW');
  assert.equal(tagKey('Aqua / Park'), 'AQUA_PARK');
});

test('tagKey: an Arabic album name keeps its letters', () => {
  assert.equal(tagKey('إطلالة بحرية'), 'إطلالة_بحرية');
});

test('tagKey: nothing usable is an empty key', () => {
  for (const bad of ['', '   ', '!!!', null, undefined]) {
    assert.equal(tagKey(bad), '', String(bad));
  }
});

test('normalizeHotelImage: a full row is cleaned and keyed', () => {
  assert.deepEqual(
    normalizeHotelImage({ url: ' /uploads/a.jpg ', tagLabel: ' Sea View ', tagLabelAr: 'إطلالة بحرية', caption: ' Room 402 ' }),
    { url: '/uploads/a.jpg', tag: 'SEA_VIEW', tagLabel: 'Sea View', tagLabelAr: 'إطلالة بحرية', caption: 'Room 402' },
  );
});

test('normalizeHotelImage: the label alone is enough to file a photo', () => {
  const row = normalizeHotelImage({ url: '/a.jpg', tagLabel: 'Single Room' })!;
  assert.equal(row.tag, 'SINGLE_ROOM');
  assert.equal(row.tagLabel, 'Single Room');
});

test('normalizeHotelImage: a photo with no URL is nothing', () => {
  assert.equal(normalizeHotelImage({ tagLabel: 'Sea View' }), null);
});

test('normalizeHotelImage: an untagged photo belongs in the plain gallery', () => {
  // Storing it here would create a nameless album in every hotel's gallery.
  assert.equal(normalizeHotelImage({ url: '/a.jpg' }), null);
  assert.equal(normalizeHotelImage({ url: '/a.jpg', tagLabel: '   ' }), null);
});

test('normalizeHotelImage: optional fields come back as null, not empty strings', () => {
  const row = normalizeHotelImage({ url: '/a.jpg', tagLabel: 'Sea View', tagLabelAr: '  ', caption: '' })!;
  assert.equal(row.tagLabelAr, null);
  assert.equal(row.caption, null);
});

test('groupByTag: photos are grouped in the order their album first appears', () => {
  const groups = groupByTag([
    { tag: 'SEA_VIEW', tagLabel: 'Sea View', tagLabelAr: null, url: 'a' },
    { tag: 'POOL', tagLabel: 'Pool', tagLabelAr: null, url: 'b' },
    { tag: 'SEA_VIEW', tagLabel: 'Sea View', tagLabelAr: null, url: 'c' },
  ] as never[]);
  assert.deepEqual(groups.map((g) => g.tag), ['SEA_VIEW', 'POOL']);
  assert.equal(groups[0].images.length, 2);
});

test('groupByTag: a later row can supply the Arabic label the first one lacked', () => {
  const groups = groupByTag([
    { tag: 'SEA_VIEW', tagLabel: 'Sea View', tagLabelAr: null, url: 'a' },
    { tag: 'SEA_VIEW', tagLabel: 'Sea View', tagLabelAr: 'إطلالة بحرية', url: 'b' },
  ] as never[]);
  assert.equal(groups[0].labelAr, 'إطلالة بحرية');
});

test('groupByTag: nothing in, nothing out', () => {
  assert.deepEqual(groupByTag([]), []);
});
