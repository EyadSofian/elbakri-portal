/**
 * Every inline handler in a portal, checked against the page's REAL scope.
 *
 * The portals are hand-written HTML with their logic inline, and most buttons
 * are built inside template literals — so a renamed or misspelled function is
 * invisible until someone clicks it and a ReferenceError lands in the console.
 *
 * Regex-scanning the source guesses; this does not. The script is evaluated in
 * a sandbox exactly as the browser would, and each handler's target is then
 * looked up in the resulting scope. If it is not a function there, the button
 * is dead.
 */
const fs = require('fs');
const path = require('path');
const { loadPortal } = require('../tests/helpers/load-portal');

const ROOT = path.join(__dirname, '..');

/** Names a handler expression calls, ignoring method calls and builtins. */
const BUILTIN = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'void',
  'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'parseInt',
  'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'alert', 'confirm',
  'setTimeout', 'clearTimeout', 'Set', 'Map', 'RegExp', 'Error', 'Promise', 'fetch', 'event',
]);

function calledNames(expr) {
  const names = new Set();
  for (const m of expr.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!BUILTIN.has(m[2])) names.add(m[2]);
  }
  return names;
}

let failed = false;
for (const file of process.argv.slice(2)) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const scope = loadPortal(path.basename(file));

  const dead = new Map();
  const seen = new Set();
  let handlers = 0;
  // Both quote styles, and every handler kind the portals actually use.
  const re = /\bon(?:click|change|input|submit|keydown|keyup|scroll|error|focus|blur)\s*=\s*(["'])([\s\S]*?)\1/g;
  for (const m of html.matchAll(re)) {
    handlers += 1;
    const expr = m[2];
    for (const name of calledNames(expr)) {
      // A name interpolated at render time (onclick="${fn}(...)") cannot be
      // resolved from the source; those are covered by their call sites.
      if (name.includes('$')) continue;
      seen.add(name);
      if (typeof scope[name] === 'function') continue;
      const line = html.slice(0, m.index).split('\n').length;
      if (!dead.has(name)) dead.set(name, []);
      if (dead.get(name).length < 4) dead.get(name).push(line);
    }
  }

  console.log(`${file}: ${handlers} handlers calling ${seen.size} distinct functions`);
  if (dead.size === 0) {
    console.log('  all live');
  } else {
    failed = true;
    for (const [name, lines] of [...dead].sort()) {
      console.log(`  DEAD BUTTON → ${name}() is not a function (lines ${lines.join(', ')})`);
    }
  }
}
process.exit(failed ? 1 : 0);
