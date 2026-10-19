/* one row per item (ID without the track name): where, measured range, result → out/ITEMS.md */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'out');
let all = []; for(const s of ['sliders', 'hover', 'overlays', 'misc', 'extra', 'drag']){ const f = path.join(OUT, s + '.json'); if(fs.existsSync(f)) all = all.concat(JSON.parse(fs.readFileSync(f))); }
const key = r => r.id.startsWith('OV ') ? r.id : r.id.split(' ')[0];
const g = new Map();
all.forEach(r => { const k = key(r); if(!g.has(k)) g.set(k, []); g.get(k).push(r); });
const esc = t => String(t == null ? '' : t).replace(/\|/g, '\\|');
let md = '| Item | Stop → resume checked | Where (pages · devices) | Measured | Result |\n|---|---|---|---|---|\n';
for(const [k, rs] of g){
  const p = rs.filter(r => r.pass === true).length, f = rs.filter(r => r.pass === false).length, i = rs.length - p - f;
  const pages = [...new Set(rs.map(r => r.page))].join(', '), devs = [...new Set(rs.map(r => r.dev + (r.lang && r.lang !== 'en' ? '/' + r.lang : '')))].join(', ');
  const nums = rs.map(r => { const m = String(r.measured).match(/^(-?\d+) ms/); return m ? +m[1] : null; }).filter(x => x !== null);
  let meas = nums.length === rs.length && nums.length > 1 ? `${Math.min(...nums)}–${Math.max(...nums)} ms` : (rs.find(r => r.pass === false) || rs[0]).measured;
  const res = f ? `❌ ${f}/${rs.length}` : p ? `✅ ${p}/${rs.length}` : '— info';
  md += `| ${esc(k)} | ${esc(rs[0].what)} | ${esc(pages)} · ${esc(devs)} | ${esc(meas)} | ${res} |\n`;
}
fs.writeFileSync(path.join(OUT, 'ITEMS.md'), md);
console.log('items', g.size);
