// node pixdiff.js <dirA> <dirB> [diffOutDir]  — compares every PNG present in both dirs, pixel by pixel.
const fs = require('fs'), path = require('path'); const { PNG } = require('pngjs');
const [A, B, D] = process.argv.slice(2); if (D) fs.mkdirSync(D, { recursive: true });
let bad = 0, n = 0, miss = 0; const rows = [];
for (const f of fs.readdirSync(A).filter(f => f.endsWith('.png')).sort()) {
  if (!fs.existsSync(path.join(B, f))) { miss++; continue; }
  n++;
  const a = PNG.sync.read(fs.readFileSync(path.join(A, f))), b = PNG.sync.read(fs.readFileSync(path.join(B, f)));
  if (a.width !== b.width || a.height !== b.height) { rows.push(['SIZE', f, `${a.width}x${a.height} -> ${b.width}x${b.height}`]); bad++; continue; }
  let diff = 0, minY = 1e9, maxY = -1; const out = D ? new PNG({ width: a.width, height: a.height }) : null;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2];
    if (d) { diff++; const y = (i / 4 / a.width) | 0; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (out) { out.data[i] = d ? 255 : a.data[i] * .3; out.data[i + 1] = d ? 0 : a.data[i + 1] * .3; out.data[i + 2] = d ? 0 : a.data[i + 2] * .3; out.data[i + 3] = 255; }
  }
  if (diff) { bad++; rows.push(['DIFF', f, diff + ' px, y ' + minY + '-' + maxY]); if (out) fs.writeFileSync(path.join(D, f), PNG.sync.write(out)); }
}
rows.forEach(r => console.log(r.join('  ')));
console.log(`compared ${n}, different ${bad}` + (miss ? `, not in B: ${miss}` : ''));
process.exit(bad ? 1 : 0);
