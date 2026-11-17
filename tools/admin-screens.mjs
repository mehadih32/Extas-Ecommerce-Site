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
const PAIRS0 = [
  ['home-A', '/admin?design=A', '#home'],
  ['home-B', '/admin?design=B', '#home'],
  ['home-C', '/admin?design=C', '#home'],
  ['home-D', '/admin?design=D', '#home'],
  ['orders', '/admin/orders', '#orders--all'],
  ['products', '/admin/products', '#products--all'],
  ['couriers', '/admin/delivery', '#couriers--overview'],
  ['claims', '/admin/delivery/claims', '#couriers--claims'],
  ['sets', '/admin/products/sets', '#products--sets'],
  ['ai-training', '/admin/ai/training', '#ai--train'],
  ['reports-profit', '/admin/reports/profit', '#reports--profit'],
  ['reports-products', '/admin/reports/products', '#reports--products'],
  ['reports-marketing', '/admin/reports/marketing', '#reports--marketing'],
  ['reports-review', '/admin/reports/review', '#reports--review'],
  ['policies', '/admin/website/policies', '#website--policies'],
  ['practice', '/admin/settings/practice', '#settings--store'],
];
// PR 910: the website, finance and settings pages (`--set=d2`) also write real-/proto-<key>.txt (the words on the page)
const D2 = [
  ['w-control', '/admin/website/control', '#website--layout'],
  ['w-layouts', '/admin/website/layouts', '#website--layout'],
  ['w-words', '/admin/website/words', '#website--text'],
  ['w-policies', '/admin/website/policies', '#website--policies'],
  ['w-blog', '/admin/website/blog', '#website--blog'],
  ['w-analytics', '/admin/website/analytics', '#website--analytics'],
  ['w-seo', '/admin/website/seo', '#website--seo'],
  ['f-overview', '/admin/money', '#finance--overview'],
  ['f-cash', '/admin/money/cash', '#finance--cash'],
  ['f-pnl', '/admin/money/profit', '#finance--pnl'],
  ['f-costs', '/admin/money/budgets', '#finance--costs'],
  ['f-erp', '/admin/money/books', '#finance--erp'],
  ['f-couriers', '/admin/money/couriers', '#finance--couriers'],
  ['f-wallet', '/admin/money/refunds', '#finance--wallet'],
  ['f-vat', '/admin/money/vat', '#finance--vat'],
  ['s-store', '/admin/settings/store', '#settings--store'],
  ['s-erp', '/admin/settings/erp-link', '#settings--erp'],
  ['s-couriers', '/admin/delivery/settings', '#settings--couriers'],
  ['s-payments', '/admin/settings/checkout', '#settings--payments'],
  ['s-messages', '/admin/messages/templates', '#settings--messages'],
  ['s-team', '/admin/settings/people', '#settings--team'],
  ['s-demo', '/admin/products/demo', '#settings--demo'],
  ['s-keys', '/admin/integrations', '#settings--keys'],
  ['s-backups', '/admin/settings/system/backups', '#settings--backups'],
  ['s-health', '/admin/settings/system/health', '#settings--health'],
  ['s-ai', '/admin/ai', '#settings--ai'],
  ['s-updates', '/admin/settings/system/updates', '#settings--updates'],
  ['s-security', '/admin/settings/security', '#settings--security'],
  ['s-activity', '/admin/settings/activity', '#settings--activity'],
  ['s-privacy', '/admin/settings/privacy', '#settings--privacy'],
  ['s-telegram', '/admin/settings/telegram-approvals', '#settings--telegram'],
  ['s-help', '/admin/help', '#settings--manual'],
];
// batch 2026-11-17-1: the prototype's other tabs (orders, couriers, products, customers, inbox, rules, marketing, reports, AI), `--set=d3`
const D3 = [
  ['o-batch', '/admin/orders/batch', '#orders--batch'],
  ['o-processing', '/admin/orders/confirm', '#orders--processing'],
  ['o-ship', '/admin/orders/packing', '#orders--ship'],
  ['o-returns', '/admin/orders/returns', '#orders--returns'],
  ['o-incomplete', '/admin/orders/incomplete', '#orders--incomplete'],
  ['c-c360', '/admin/delivery/courier-360', '#couriers--c360'],
  ['p-add', '/admin/products/new', '#products--add'],
  ['p-stock', '/admin/stock', '#products--stock'],
  ['p-ranking', '/admin/products/ranking', '#products--ranking'],
  ['p-combos', '/admin/combos', '#products--combos'],
  ['p-reviews', '/admin/products/reviews', '#products--reviews'],
  ['p-sizecharts', '/admin/size-charts', '#products--sizecharts'],
  ['u-all', '/admin/customers', '#customers--all'],
  ['u-groups', '/admin/customers/segments', '#customers--groups'],
  ['u-loyalty', '/admin/customers/loyalty', '#customers--loyalty'],
  ['u-merge', '/admin/customers/review', '#customers--merge'],
  ['i-chats', '/admin/support', '#inbox--chats'],
  ['i-replies', '/admin/support/replies', '#inbox--replies'],
  ['i-stats', '/admin/support/analytics', '#inbox--stats'],
  ['r-all', '/admin/rules', '#rules--all'],
  ['r-coupons', '/admin/rules/offers', '#rules--coupons'],
  ['r-popups', '/admin/rules/notices', '#rules--popups'],
  ['m-overview', '/admin/marketing/overview', '#marketing--overview'],
  ['m-campaigns', '/admin/marketing/campaigns', '#marketing--campaigns'],
  ['m-messages', '/admin/marketing/message-campaigns', '#marketing--messages'],
  ['m-audiences', '/admin/marketing/audiences', '#marketing--audiences'],
  ['m-calendar', '/admin/marketing/calendar', '#marketing--calendar'],
  ['m-plan', '/admin/marketing/plan', '#marketing--plan'],
  ['m-tools', '/admin/marketing/ad-platforms', '#marketing--tools'],
  ['rp-overview', '/admin/reports', '#reports--overview'],
  ['rp-sales', '/admin/reports/orders', '#reports--sales'],
  ['rp-customers', '/admin/reports/customers', '#reports--customers'],
  ['rp-delivery', '/admin/reports/delivery', '#reports--delivery'],
  ['rp-couriers', '/admin/reports/couriers', '#reports--couriers'],
  ['rp-areas', '/admin/reports/areas', '#reports--areas'],
  ['rp-team', '/admin/reports/team', '#reports--team'],
  ['a-approvals', '/admin/ai/approvals', '#ai--approvals'],
  ['a-agents', '/admin/agents', '#ai--agents'],
  ['a-costs', '/admin/ai/cost-book', '#ai--costs'],
];
const SETS = { d2: D2, d3: D3, all: [...PAIRS0, ...D2, ...D3] };
const PAIRS = (SETS[arg('set')] ?? PAIRS0).filter(([k]) => !arg('only') || arg('only').split(',').some((p) => k.startsWith(p)));
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
    if (file.includes('-desktop')) {
      const txt = await page.evaluate(() => (document.querySelector('main') || document.body).innerText);
      writeFileSync(file.replace(/\.jpg$/, '.txt'), txt);
      // the parts a person sees: headings, button words, how many fields / tables, the first filled button's colour
      const facts = await page.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; };
        const root = document.querySelector('main') || document.body;
        // a leading icon glyph (arrow, star, printer) is not part of the name: the prototype draws those as pictures
        const tx = (e) => (e.innerText || e.getAttribute('aria-label') || e.value || '').replace(/\s+/g, ' ').replace(/^[\u2190-\u21FF\u2300-\u23FF\u2600-\u27BF+]\s*/u, '').trim();
        const uniq = (a) => [...new Set(a.filter(Boolean))];
        // PR 1069: a filter chip or a period button drawn as a link (a2-view, cl-chip, rpseg a ...) counts as a button, as the prototype's chips do
        const btns = [...root.querySelectorAll('button, [role=button], [role=tab], a[class*=btn], a[class*=chip], a[class*=a2-view], .rpseg a, [class*=seg] a, [class*=pill] a, input[type=submit]')].filter(vis);
        const filled = btns.find((b) => { const c = getComputedStyle(b).backgroundColor; return c && c !== 'rgba(0, 0, 0, 0)' && c !== 'rgb(255, 255, 255)'; });
        return {
          headings: uniq([...root.querySelectorAll('h1, h2, h3')].filter(vis).map(tx)).slice(0, 40),
          buttons: uniq(btns.map(tx)).slice(0, 120),
          // a word that shows as its own key (reportsV5.common.p.today): a missing message, always a defect
          rawKeys: (root.innerText.match(/\b[a-z][A-Za-z0-9]+(\.[a-z][A-Za-z0-9]+){2,}\b/g) || []).filter((k) => !/^(www|extas)\./.test(k) && !/\.(com|bd|org|net)$/.test(k)).length,
          tabs: uniq([...root.querySelectorAll('[role=tab], nav a')].filter(vis).map(tx)).slice(0, 40),
          fields: root.querySelectorAll('input:not([type=hidden]), select, textarea').length,
          tables: root.querySelectorAll('table').length,
          primary: filled ? getComputedStyle(filled).backgroundColor : null,
          font: getComputedStyle(document.body).fontFamily.split(',')[0],
        };
      });
      writeFileSync(file.replace(/\.jpg$/, '.json'), JSON.stringify(facts));
    }
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
    const r = await shot(rc, base + real, `${out}/real-${key}-${vn}.jpg`, 2500);
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
