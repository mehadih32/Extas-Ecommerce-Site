/* Aggregate out/*.json → group table + fail list.  usage: node summarize.js [module] */
const fs = require('fs'), path = require('path'), L = require('./lib');
const dir = L.OUT, only = process.argv.slice(2).find(a => !a.startsWith('--'));
const groupOf = n => (L.DEVICES.find(d => d.name === n) || {}).group || '?';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_') && (!only || f.startsWith(only + '-')));
const by = {}, fails = {}, tot = {pass: 0, fail: 0, info: 0};
for(const f of files){
  const r = JSON.parse(fs.readFileSync(path.join(dir, f)));
  const g = groupOf(r.dev);
  for(const it of r.items){
    const key = r.module + ' ' + it.id.split('@')[0];
    by[key] = by[key] || {}; by[key][g] = by[key][g] || {p: 0, f: 0, i: 0};
    if(it.pass === true){ by[key][g].p++; tot.pass++; } else if(it.pass === false){ by[key][g].f++; tot.fail++; (fails[key] = fails[key] || []).push({dev: r.dev, route: it.id.split('@')[1] || '', m: String(it.measured || '').slice(0, 300), name: it.name}); } else { by[key][g].i++; tot.info++; }
  }
}
console.log(JSON.stringify(tot));
const G = ['phone', 'tablet-p', 'tablet-l', 'desktop'];
for(const k of Object.keys(by).sort()){ console.log(k.padEnd(34) + G.map(g => { const x = by[k][g]; return x ? (x.f ? 'F' + x.f + '/' + (x.p + x.f) : x.p ? 'ok' + x.p : 'i' + x.i) : '-'; }).map(s => s.padEnd(10)).join('')); }
if(process.argv.includes('--fails')) for(const k of Object.keys(fails).sort()){ console.log('\n## ' + k + ' (' + fails[k].length + ')'); const seen = {}; fails[k].forEach(x => { const sig = x.route + '|' + x.m.replace(/\d+/g, '#').slice(0, 120); if(seen[sig]) { seen[sig].push(x.dev); return; } seen[sig] = [x.dev]; x.devs = seen[sig]; }); Object.values(fails[k]).filter(x => x.devs).forEach(x => console.log('- [' + x.devs.join(' ') + '] ' + x.route + ' :: ' + x.m)); }
fs.writeFileSync(path.join(L.OUT, '_summary.json'), JSON.stringify({tot, by, fails}, null, 1));
