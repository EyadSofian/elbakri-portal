import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/assets/portal.css'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'public/admin.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'public/dashboard.html'), 'utf8');

test('text row actions are not forced into icon-only squares', () => {
  assert.match(css, /\.row-actions \.btn:not\(\.btn-icon\)[\s\S]*?inline-size:\s*auto/);
  assert.match(css, /\.row-actions \.btn:not\(\.btn-icon\)[\s\S]*?min-inline-size:\s*max-content/);
  assert.match(admin, /class="btn btn-outline btn-sm"[^>]*>[\s\S]*?Review/);
  assert.match(dashboard, /class="btn btn-outline btn-sm"[^>]*>[\s\S]*?PDF/);
});

test('shared controls keep icons, labels and modal actions in normal flow', () => {
  assert.match(css, /\.btn > svg,[\s\S]*?position:\s*static/);
  assert.match(css, /\.modal-footer[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /\.modal-footer \.btn\s*\{[^}]*min-inline-size:\s*96px/);
});

test('checkboxes and radios have an explicit compact dark-safe drawing', () => {
  assert.match(css, /input\[type="checkbox"\]:not\(\[role="switch"\]\)[\s\S]*?appearance:\s*none/);
  assert.match(css, /input\[type="checkbox"\]:not\(\[role="switch"\]\):checked[\s\S]*?background-image:/);
  assert.match(css, /:root\[data-theme="dark"\][\s\S]*?input\[type="radio"\]:checked/);
});
