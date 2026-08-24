// Extract every inline <script> block from an HTML file and syntax-check it.
// The portal ships as two hand-written HTML files with thousands of lines of
// inline JS; a stray brace is otherwise only found by loading the page.
const fs = require('fs');
const vm = require('vm');
let failed = false;
for (const file of process.argv.slice(2)) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    i += 1;
    const code = m[1];
    const line = html.slice(0, m.index).split('\n').length;
    try {
      new vm.Script(code, { filename: `${file}#script${i}@line${line}` });
    } catch (err) {
      failed = true;
      console.error(`${file} script #${i} (starts line ${line}): ${err.message}`);
    }
  }
  console.log(`${file}: ${i} inline script block(s) checked`);
}
process.exit(failed ? 1 : 0);
