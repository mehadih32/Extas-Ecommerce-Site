// PR 721 — real admin pages beside the approved prototype (docs/demo/admin-proto-v5), for the owner's eyes.
// Signs in like the device gate (tools/smoke.mjs signIn) on the sample database, opens each real page and its prototype
// screen at phone (390) and laptop (1366), and writes real-*, proto-* and side-by-side (pair-*) JPEGs plus pairs.json.
//   node tools/admin-screens.mjs --base=http://127.0.0.1:3000 --proto=http://127.0.0.1:8099 --out=admin-screens \
//        --email=gate@example.test --password-file=/path
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (n, d = '') => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).slice(n.length + 3);
const base = arg('base', 'http://127.0.0.1:3000');
const proto = arg('proto', 'http://127.0.0.1:8099');
const out = arg('out', 'admin-screens');
mkdirSync(out, { recursive: true });
const PAIRS = [
  ['home-A', '/admin?design=A', '#home'],
  ['home-B', '/admin?design=B', '#home'],
  ['home-C', '/admin?design=C', '#home'],
  ['home-D', '/admin?design=D', '#home'],
  ['orders', '/admin/orders', '#orders--all'],
  ['products', '/admin/products', '#products--all'],
  ['couriers', '/admin/delivery/couriers', '#couriers--overview'],
  ['claims', '/admin/delivery/claims', '#couriers--claims'],
  ['sets', '/admin/products/sets', '#products--sets'],
  ['ai-training', '/admin/ai/training', '#ai--train'],
  ['reports-profit', '/admin/reports/profit', '#reports--profit'],
  ['reports-products', '/admin/reports/products', '#reports--products'],
  ['reports-marketing', '/admin/reports/marketing', '#reports--marketing'],
  ['reports-review', '/admin/reports/review', '#reports--review'],
  ['policies', '/admin/website/policies', '#website--policies'],
  ['practice', '/admin/settings/practice', '#settings--keys'],
];
const VPS = [['phone', 390, 844], ['desktop', 1366, 900]];
const MAXH = 2400;
const browser = await chromium.launch();
async function shot(ctx, url, file, wait) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  let status = 0;
  try {
    const r = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    status = r ? r.status() : 0;
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(wait);
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const w = page.viewportSize().width;
    await page.screenshot({ path: file, type: 'jpeg', quality: 72, fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(h, MAXH) } });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    return { status, errors, height: h, overflowPx: over, final: new URL(page.url()).pathname };
  } catch (e) {
    return { status, errors: [...errors, String(e).slice(0, 200)], failed: true };
  } finally {
    await page.close();
  }
}
// sign in once
const sctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const { signIn } = await import('./smoke.mjs');
await signIn(await sctx.newPage(), base, { email: arg('email'), password: readFileSync(arg('password-file'), 'utf8').trim() });
const state = await sctx.storageState();
await sctx.close();
const rows = [];
for (const [vn, w, h] of VPS) {
  const rc = await browser.newContext({ viewport: { width: w, height: h }, storageState: state, deviceScaleFactor: 1, hasTouch: vn === 'phone' });
  const pc = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: vn === 'phone' });
  for (const [key, real, pr] of PAIRS) {
    const r = await shot(rc, base + real, `${out}/real-${key}-${vn}.jpg`, 1200);
    const p = await shot(pc, `${proto}/index.html${pr}`, `${out}/proto-${key}-${vn}.jpg`, 900);
    // side by side
    const b64 = (f) => readFileSync(f).toString('base64');
    try {
      const cp = await (await browser.newContext({ viewport: { width: vn === 'phone' ? 820 : 2760, height: 600 } })).newPage();
      await cp.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;align-items:flex-start;padding:8px"><div><div style="font:700 18px sans-serif;color:#fff">PROTOTYPE (approved)</div><img src="data:image/jpeg;base64,${b64(`${out}/proto-${key}-${vn}.jpg`)}"></div><div><div style="font:700 18px sans-serif;color:#fff">REAL ADMIN</div><img src="data:image/jpeg;base64,${b64(`${out}/real-${key}-${vn}.jpg`)}"></div></body>`);
      await cp.screenshot({ path: `${out}/pair-${key}-${vn}.jpg`, type: 'jpeg', quality: 70, fullPage: true });
      await cp.context().close();
    } catch (e) { /* a missing half */ }
    rows.push({ key, vp: vn, real: r, proto: p });
    console.log(key, vn, JSON.stringify({ real: { s: r.status, h: r.height, ov: r.overflowPx, f: r.final, e: r.errors.length }, proto: { s: p.status, h: p.height } }));
  }
  await rc.close(); await pc.close();
}
writeFileSync(`${out}/pairs.json`, JSON.stringify(rows, null, 1));
await browser.close();
