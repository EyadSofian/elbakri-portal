const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

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
  // This helper lives in tests/helpers/, so the repo root is two levels up.
  const root = path.join(__dirname, '..', '..');
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


module.exports = { loadPortal };
