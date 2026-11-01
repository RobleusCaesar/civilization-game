// tools/terrain-core.src.js (readable: ip(X) bilinear reads) -> js/terrain-core.js (inlined for the JIT).
// node tools/build-terrain-core.cjs   — tests/terrain-v4.mjs checks the committed output equals a fresh build.
const fs = require('fs'), path = require('path');
function build(s) {
  s = s.replace(/^\s*const ip = A => A\[k00\] \* w0 \+ A\[k10\] \* w1 \+ A\[k01\] \* w2 \+ A\[k11\] \* w3;\n/m, '');
  let n = 0;
  s = s.replace(/\bip\((\w+)\)/g, (m, a) => { n++; return '(' + a + '[k00] * w0 + ' + a + '[k10] * w1 + ' + a + '[k01] * w2 + ' + a + '[k11] * w3)'; });
  return { out: '/* GENERATED from tools/terrain-core.src.js by tools/build-terrain-core.cjs — edit the source */\n' + s, n };
}
module.exports = build;
if (require.main === module) {
  const root = path.join(__dirname, '..');
  const { out, n } = build(fs.readFileSync(path.join(root, 'tools/terrain-core.src.js'), 'utf8'));
  fs.writeFileSync(path.join(root, 'js/terrain-core.js'), out);
  console.log('js/terrain-core.js built, ' + n + ' reads inlined');
}
