import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { SEARCH_KINDS, pageForKind } from '../src/modules/search/search.controller';

/**
 * A search result is only useful if the page it points at exists.
 *
 * The portal opens a hit with `setPage(hit.page)`, and both portals resolve an
 * unknown name as `pageLoaders[page] || renderDashboard` — silently. So a page
 * name the portal does not register does not raise anything; the user clicks a
 * result and lands on the dashboard, and the search looks broken for no
 * visible reason.
 *
 * That shipped: quotes were mapped to `my-quotes`, which only the agent portal
 * has. Every admin who clicked a quote result was sent to the dashboard.
 *
 * These tests read the page names straight out of the two portals, so renaming
 * a page there fails here rather than quietly breaking search.
 */

/** The pages a portal registers, read from its own pageLoaders map. */
function portalPages(file: string): Set<string> {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
  const block = /const pageLoaders\s*=\s*\{([\s\S]*?)\n\};/.exec(html);
  assert.ok(block, `${file} declares a pageLoaders map`);
  const pages = new Set<string>();
  for (const m of block[1].matchAll(/(?:^|\n)\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$-]*))\s*:/g)) {
    pages.add(m[1] ?? m[2] ?? m[3]);
  }
  return pages;
}

const AGENT = portalPages('dashboard.html');
const ADMIN = portalPages('admin.html');

test('both portals were read and actually register pages', () => {
  // A regex that silently matched nothing would make every test below vacuous.
  assert.ok(AGENT.size > 10, `agent portal pages: ${AGENT.size}`);
  assert.ok(ADMIN.size > 10, `admin portal pages: ${ADMIN.size}`);
  assert.ok(AGENT.has('dashboard') && ADMIN.has('dashboard'));
});

test('every page the search sends an agent to exists in the agent portal', () => {
  // COMPANY hits are only ever produced for an admin — an agency has one company.
  const forAgents = SEARCH_KINDS.filter((k) => k !== 'COMPANY');
  const missing = forAgents
    .map((kind) => [kind, pageForKind(kind, false)] as const)
    .filter(([, page]) => !AGENT.has(page));
  assert.deepEqual(missing, [], 'these hits would drop an agent on the dashboard');
});

test('every page the search sends an admin to exists in the admin portal', () => {
  const missing = SEARCH_KINDS
    .map((kind) => [kind, pageForKind(kind, true)] as const)
    .filter(([, page]) => !ADMIN.has(page));
  assert.deepEqual(missing, [], 'these hits would drop an admin on the dashboard');
});

test('quotes route to the page each portal actually calls them', () => {
  // The bug that shipped, named so a regression is unmistakable.
  assert.equal(pageForKind('QUOTE', false), 'my-quotes');
  assert.equal(pageForKind('QUOTE', true), 'quote-requests');
  assert.ok(AGENT.has('my-quotes'));
  assert.ok(ADMIN.has('quote-requests'));
  assert.equal(ADMIN.has('my-quotes'), false, 'the admin portal has no my-quotes page');
});

test('no kind falls through to the dashboard', () => {
  // `dashboard` is the fallback for an unmapped kind — reaching it means the
  // switch is missing a case, not that the record lives on the dashboard.
  for (const kind of SEARCH_KINDS) {
    for (const isAdmin of [true, false]) {
      if (kind === 'COMPANY' && !isAdmin) continue;
      assert.notEqual(
        pageForKind(kind, isAdmin),
        'dashboard',
        `${kind} (admin=${isAdmin}) is not mapped to a page`,
      );
    }
  }
});

test('the services the portal sells are all searchable', () => {
  // A ref number an agent is holding should find its booking whatever service
  // it belongs to; before this only hotel, transport and quote refs did.
  for (const kind of ['ACTIVITY', 'PACKAGE', 'CRUISE', 'SECURITY_APPROVAL', 'AIRPORT_ASSIST', 'SIM'] as const) {
    assert.ok(SEARCH_KINDS.includes(kind), `${kind} is not searchable`);
  }
});
