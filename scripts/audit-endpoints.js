/**
 * Every API path the portals call, checked against the routes the server mounts.
 *
 * A button can be perfectly wired to a live function and still do nothing,
 * because the endpoint behind it was renamed or never existed. That failure is
 * a 404 in the network tab — invisible until someone tries it.
 *
 * This resolves each `apiFetch("/…")` call in the portals against the Express
 * route table, matching `:param` segments, and reports paths nothing serves.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Resolve a module's import specifier to a file on disk. */
function resolveModule(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base + '.ts', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Which file each imported router name comes from, and what it is called THERE.
 *
 * A file can export more than one router (ui-templates exports an admin one and
 * a user one), and each is registered under its own variable name — so the
 * local alias alone is not enough to find the right routes.
 */
function importMap(file, src) {
  const map = new Map();
  const add = (localName, exportedName, spec) => {
    const resolved = resolveModule(file, spec);
    if (resolved && localName) map.set(localName, { file: resolved, exported: exportedName });
  };
  // `import x from '…'` / `import x, { a, b as c } from '…'`
  for (const m of src.matchAll(/import\s+(\w+)\s*(?:,\s*\{([^}]*)\})?\s*from\s*'([^']+)'/g)) {
    add(m[1], null, m[3]); // default export — the router variable is usually `router`
    for (const named of (m[2] || '').split(',')) {
      const parts = named.trim().split(/\s+as\s+/);
      if (parts[0]) add(parts[parts.length - 1].trim(), parts[0].trim(), m[3]);
    }
  }
  // `import { a, b as c } from '…'`
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    for (const named of m[1].split(',')) {
      const parts = named.trim().split(/\s+as\s+/);
      if (parts[0]) add(parts[parts.length - 1].trim(), parts[0].trim(), m[2]);
    }
  }
  return map;
}

/**
 * Walk the route tree from a router file, following nested `router.use(...)`
 * mounts. A router mounted inside another router (admin → companies) would
 * otherwise look like it serves nothing.
 */
function collectRoutes(file, prefix, exported, routes, seen = new Set()) {
  const key = `${file}@${prefix}@${exported ?? ''}`;
  if (!file || seen.has(key) || !fs.existsSync(file)) return;
  seen.add(key);
  const src = fs.readFileSync(file, 'utf8');

  // The variable this router is registered under inside its own file. A default
  // export is conventionally `router`; a named export keeps its export name.
  // A default export is registered under whatever variable the file exports —
  // `export default adminSheetsRouter`, not necessarily `router`.
  const defaultExport = /export\s+default\s+(\w+)\s*;/.exec(src);
  const varName = exported ?? defaultExport?.[1] ?? 'router';
  const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const routeRe = new RegExp(`${esc}\\.(get|post|patch|put|delete)\\(\\s*'([^']*)'`, 'g');
  for (const m of src.matchAll(routeRe)) {
    routes.push({
      method: m[1].toUpperCase(),
      pattern: (prefix + m[2]).replace(/\/+$/, '') || '/',
    });
  }

  const imports = importMap(file, src);
  const useRe = new RegExp(`${esc}\\.use\\(\\s*'([^']+)'\\s*,([^;]*?)\\)\\s*;`, 'g');
  for (const m of src.matchAll(useRe)) {
    for (const name of m[2].matchAll(/(\w*[Rr]outer\w*)/g)) {
      const target = imports.get(name[1]);
      if (target) collectRoutes(target.file, prefix + m[1], target.exported, routes, seen);
      // A router declared in this same file, mounted under a sub-path.
      else if (new RegExp(`(?:const|let)\\s+${name[1]}\\s*=\\s*Router\\(`).test(src)) {
        collectRoutes(file, prefix + m[1], name[1], routes, seen);
      }
    }
  }
}

/** Every route the server actually mounts, as a full path pattern. */
function readRoutes() {
  const appFile = path.join(ROOT, 'src/app.ts');
  const app = fs.readFileSync(appFile, 'utf8');
  const imports = importMap(appFile, app);
  const routes = [];
  for (const m of app.matchAll(/app\.use\(\s*'([^']+)'\s*,([^;]*?)\)\s*;/g)) {
    for (const name of m[2].matchAll(/(\w*[Rr]outer\w*)/g)) {
      const target = imports.get(name[1]);
      if (target) collectRoutes(target.file, m[1], target.exported, routes);
    }
  }
  return routes;
}

/** Does a concrete request path match a route pattern with :params? */
function matches(pattern, reqPath) {
  const p = pattern.split('/').filter(Boolean);
  const r = reqPath.split('/').filter(Boolean);
  if (p.length !== r.length) return false;
  return p.every((seg, i) => seg.startsWith(':') || seg === r[i]);
}

const routes = readRoutes();

let failed = false;
const seen = new Set();
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const unresolved = new Map();
  let checked = 0;
  // apiFetch("/x") and fetch("/api/x") — the two ways the portals call in.
  // The whole quoted string is captured (query strings included, so a call like
  // `/activities?${params}` is still checked on its path), then the query is
  // dropped — only the path is routed.
  const calls = [
    ...src.matchAll(/apiFetch\(\s*([`"'])([^`"']*)\1(\s*\+)?/g),
    ...src.matchAll(/fetch\(\s*([`"'])\/api([^`"']*)\1(\s*\+)?/g),
  ];
  for (const m of calls) {
    const pathPart = m[2].split('?')[0];
    // A path built by concatenation — apiFetch("/ui-templates/" + target) —
    // ends mid-segment, so the concatenated value is the missing param.
    const concatenated = (Boolean(m[3]) && !m[2].includes('?')) || pathPart.endsWith('/');
    // A template literal's ${…} is a param wherever it appears.
    const raw = (pathPart.replace(/\$\{[^}]*\}/g, ':param').replace(/\/+$/, ''))
      + (concatenated ? '/:param' : '');
    // apiFetch's own `fetch("/api" + path)` is the wrapper, not a call site.
    if (raw === '/:param') continue;
    if (!raw.startsWith('/')) continue;
    checked += 1;
    const key = raw;
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = routes.some((r) => matches(r.pattern, '/api' + raw));
    if (!hit) {
      const line = src.slice(0, m.index).split('\n').length;
      if (!unresolved.has(raw)) unresolved.set(raw, []);
      if (unresolved.get(raw).length < 4) unresolved.get(raw).push(line);
    }
  }
  console.log(`${file}: ${checked} API calls`);
  if (!unresolved.size) {
    console.log('  every path matches a mounted route');
  } else {
    failed = true;
    for (const [p, lines] of [...unresolved].sort()) {
      console.log(`  NO ROUTE → ${p}  (lines ${lines.join(', ')})`);
    }
  }
}
console.log(`\n(${routes.length} routes mounted)`);
process.exit(failed ? 1 : 0);
