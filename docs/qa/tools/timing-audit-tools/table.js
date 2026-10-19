/* merge out/*.json → out/TABLE.md (one row per check) + totals */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'out');
const rows = [];
for(const s of ['sliders', 'hover', 'overlays', 'misc', 'extra', 'drag']){ const f = path.join(OUT, s + '.json'); if(fs.existsSync(f)) JSON.parse(fs.readFileSync(f)).forEach(r => rows.push({ suite: s, ...r })); }
const mark = r => r.pass === true ? '✅' : r.pass === false ? '❌' : '—';
const esc = t => String(t == null ? '' : t).replace(/\|/g, '\\|');
let md = '| # | Suite | ID | Device | Lang | Page | Stop / resume checked | Measured | Result |\n|---|---|---|---|---|---|---|---|---|\n';
rows.forEach((r, i) => { md += `| ${i + 1} | ${r.suite} | ${esc(r.id)} | ${r.dev || ''} | ${r.lang || ''} | ${esc(r.page)} | ${esc(r.what)} | ${esc(r.measured)}${r.note ? ' — ' + esc(r.note) : ''} | ${mark(r)} |\n`; });
const p = rows.filter(r => r.pass === true).length, f = rows.filter(r => r.pass === false).length;
md = `Checks: ${rows.length} · ✅ ${p} · ❌ ${f} · — ${rows.length - p - f}\n\n` + md;
fs.writeFileSync(path.join(OUT, 'TABLE.md'), md);
console.log(`TABLE.md: ${rows.length} checks · pass ${p} · fail ${f} · info ${rows.length - p - f}`);
