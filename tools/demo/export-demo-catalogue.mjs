// S28 — turns the approved demo's 72 products into packages/catalogue/src/demo-catalogue.json (run again if the demo data changes).
// Usage: node tools/demo/export-demo-catalogue.mjs
import vm from 'node:vm';
import fs from 'node:fs';
const ctx = {
  console,
  document: {},
  localStorage: { getItem: () => null, setItem() {} },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['01-data.js', '01y-combo-auto-data.js', '01z-combo-test.js', '01zz-demo-more.js'])
  vm.runInContext(fs.readFileSync(`docs/demo/src/${f}`, 'utf8'), ctx, {
    filename: f,
  });
const all = ctx.DB;
const ids = new Set();
const base = { DB: undefined };
// the 72: the two data files only (the combo test's own 14 styles are not part of the catalogue)
const ctx2 = {
  console,
  document: {},
  localStorage: { getItem: () => null, setItem() {} },
};
ctx2.window = ctx2;
vm.createContext(ctx2);
for (const f of ['01-data.js', '01zz-demo-more.js'])
  vm.runInContext(fs.readFileSync(`docs/demo/src/${f}`, 'utf8'), ctx2, {
    filename: f,
  });
const D = ctx2.DB;
if (D.products.length !== 72) throw new Error(`expected 72 demo products, got ${D.products.length}`);
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const sizeKey = (s) => (/^\d+$/.test(s) && s.length === 2 ? `w${s}` : slugify(s));
const camel = (s) =>
  s
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1)))
    .join('');
const garmentKey = { socks: 'accessory' };
const chartGarment = {
  'polo-regular': 'polo',
  'polo-slim': 'polo',
  'tee-regular': 'tee',
  'shirt-regular': 'shirt',
  'panjabi-classic': 'panjabi',
  'hoodie-regular': 'hoodie',
  'chino-slim': 'trouser',
  'ca-polo6': 'polo',
  'ct-tracktop': 'tracktop',
  'ct-jogger': 'jogger',
  'ct-puffer': 'puffer',
  'ct-hoodie6': 'hoodie',
  'ct-sweater': 'sweater',
  'ct-polo6': 'polo',
  'ct-tee6': 'tee',
};
const usedCharts = [...new Set(D.products.map((p) => p.chart).filter(Boolean))];
const out = {
  $comment:
    'S28 — the approved demo catalogue (docs/demo/src/01-data.js + 01zz-demo-more.js): 72 styles made by tools/demo/export-demo-catalogue.mjs. Made-up sample data, prices in minor units (poisha).',
  categories: [...new Set(D.products.map((p) => p.cat))].map((id) => {
    const c = all.categories.find((x) => x.id === id);
    return {
      slug: id,
      nameEn: c.name,
      nameBn: c.bn,
      garment: garmentKey[c.garment] ?? c.garment,
      hidden: !!c.hidden,
      introEn: c.blurb,
    };
  }),
  colours: [...new Set(D.products.flatMap((p) => p.colors))].map((k) => ({
    key: k,
    nameEn: all.colors[k].name,
    hex: all.colors[k].hex.toUpperCase(),
    noteEn: all.colorNotes?.[k] ?? null,
  })),
  sizes: [...new Set(D.products.flatMap((p) => p.sizes))].map((s) => ({
    key: sizeKey(s),
    label: s,
    sortOrder: {
      s: 10,
      m: 20,
      l: 30,
      xl: 40,
      xxl: 50,
      '3xl': 55,
      w30: 60,
      w32: 70,
      w34: 80,
      w36: 90,
      'one-size': 100,
    }[sizeKey(s)],
  })),
  charts: usedCharts.map((k) => {
    const c = all.sizeCharts[k];
    return {
      key: k,
      name: c.name,
      garment: chartGarment[k],
      fitKey: slugify(c.name.split('·')[1] ?? 'regular').split('-')[0] || 'regular',
      easeInch: c.ease,
      fields: c.fields.map((f) => ({ key: camel(f), labelEn: f })),
      rows: Object.entries(c.rows).map(([s, v]) => ({
        size: sizeKey(s),
        values: v,
      })),
    };
  }),
  products: D.products.map((p, i) => ({
    slug: `demo-${slugify(p.id)}`,
    id: p.id,
    nameEn: p.name,
    category: p.cat,
    collection: p.collection,
    tag: p.tag || null,
    template: p.template,
    sortRank: (i + 1) * 10,
    descriptionEn: p.desc,
    careEn: p.care,
    fabric: p.fabric,
    fit: p.fit,
    fitNote: p.fitNote,
    model: p.hasModel && p.model ? p.model : null,
    freeDelivery: p.freeDelivery === true,
    chart: p.chart || null,
    priceMinor: Math.round(p.price * 100),
    compareAtMinor: p.compareAt ? Math.round(p.compareAt * 100) : null,
    colours: p.colors,
    sizes: p.sizes.map(sizeKey),
    stock: Object.fromEntries(p.colors.map((c) => [c, p.sizes.map((s) => p.stock[c][s] ?? 0)])),
  })),
};
out.collections = [...new Set(D.products.map((p) => p.collection))].map((n) => ({ slug: slugify(n), nameEn: n }));
out.tags = [...new Set(D.products.map((p) => p.tag).filter(Boolean))].map((n) => ({ slug: slugify(n), name: n }));
for (const p of out.products) {
  p.collection = slugify(p.collection);
  if (p.tag) p.tag = slugify(p.tag);
}
fs.writeFileSync('packages/catalogue/src/demo-catalogue.json', JSON.stringify(out, null, 1) + '\n');
console.log(out.products.length, 'products', out.categories.length, 'categories', out.charts.length, 'charts', out.colours.length, 'colours', out.sizes.length, 'sizes');
