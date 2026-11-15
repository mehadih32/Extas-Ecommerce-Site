// PR 727 — the admin menu audit. Signs in on the sample database (like tools/admin-screens.mjs), opens EVERY page of
// EVERY section of the admin menu (tools/nav-audit-routes.json, made from apps/web/src/lib/admin-shell/nav-v5.ts +
// sections.ts and kept current by nav-routes.test.ts) at 1366 and 390 px, and records per page: HTTP status, the section
// tab bar (tabs, the active one, what is under "More"), the page chips, the crumb, the h1 pattern, the sidebar's sub-menu
// and console errors. It then compares the pages of one section with each other and flags every page whose tab bar differs
// or has vanished. A second pass clicks through each section's tabs and chips (client navigation, as the owner does) and
// flags a click that changes the bar. Writes nav-audit.json, nav-audit.md and screenshots.
//   node tools/nav-audit.mjs --base=http://127.0.0.1:3000 --out=nav-audit --email=gate@example.test --password-file=/path
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const arg = (n, d = '') => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).slice(n.length + 3);
const base = arg('base', 'http://127.0.0.1:3000');
const out = arg('out', 'nav-audit');
const only = arg('only', '');
mkdirSync(out, { recursive: true });
const routes = JSON.parse(readFileSync(join(here, 'nav-audit-routes.json'), 'utf8'));

// What a page shows of the shell's section chrome (runs in the page).
const SNAP = () => {
  const txt = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const nav = document.querySelector('[data-testid="a2-tabs"]');
  const mains = [...(nav?.querySelectorAll('.a2-tabs-s a.a2-tab') || [])].map((a) => ({ t: txt(a), on: a.classList.contains('on'), shown: shown(a) }));
  const more = nav?.querySelector('[data-testid="a2-more"]');
  const sub = document.querySelector('[data-testid="a2-subtabs"]');
  const chips = [...(sub?.querySelectorAll('a') || [])].map((a) => ({ t: txt(a), on: a.classList.contains('on') }));
  const side = document.querySelector('[data-testid^="a3-nav-"].on');
  const subs = [...document.querySelectorAll('.lm-nw.on .lm-subs a')].map((a) => ({ t: txt(a), on: a.classList.contains('on') }));
  const h1 = [...document.querySelectorAll('h1')].map((h) => txt(h));
  const err = document.querySelector('[data-testid="a2-state"], .a2-state');
  // PR 762: where the section's bar sits (from the top of <main>, page not scrolled) and what follows it; the same on every
  // page of a section, because the shell draws it once above the page (never the page's own heading above it)
  const mainEl = document.getElementById('main');
  const barEl = document.querySelector('[data-testid="a2-bar"]');
  const r = (e) => (e ? e.getBoundingClientRect() : null);
  const mr = r(mainEl);
  const br = r(barEl);
  const after = barEl?.nextElementSibling ? r(barEl.nextElementSibling) : null;
  return {
    barY: br && mr ? Math.round(br.top - mr.top + (mainEl.scrollTop || 0)) : null,
    barH: nav ? Math.round(nav.getBoundingClientRect().height) : null,
    barGap: br && after ? Math.round(after.top - br.bottom) : null,
    barX: br && mr ? Math.round(br.left - mr.left) : null,
    hasTabBar: !!nav,
    tabBarShown: shown(nav),
    mains,
    moreLabel: more ? txt(more) : null,
    moreOn: more ? more.classList.contains('on') : false,
    chips,
    crumb: txt(document.querySelector('[data-testid="a2-crumb"]')) || null,
    head: document.querySelector('.a2-ph') ? 'page-head' : document.querySelector('[data-testid="a2-crumb"]') ? 'crumb-row' : 'none',
    barBeforeH1: nav && document.querySelector('h1') ? !!(nav.compareDocumentPosition(document.querySelector('h1')) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
    h1,
    sideSection: side ? side.getAttribute('data-testid').replace('a3-nav-', '') : null,
    sideSubs: subs,
    stateText: err ? txt(err).slice(0, 80) : null,
    title: document.title,
    scrollOverX: document.documentElement.scrollWidth - window.innerWidth,
  };
};

async function openMore(page) {
  const b = page.locator('[data-testid="a2-tabs"] [data-testid="a2-more"]');
  if (!(await b.count())) return [];
  try {
    await b.first().click({ timeout: 3000 });
    const items = await page.locator('.a2-morepop a').evaluateAll((as) => as.map((a) => ({ t: (a.textContent || '').trim(), on: a.classList.contains('on') })));
    await page.keyboard.press('Escape');
    return items;
  } catch {
    return null;
  }
}

async function visit(ctx, path, shotFile) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 140)));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 140)));
  let status = 0;
  try {
    const r = await page.goto(base + path, { waitUntil: 'load', timeout: 45000 });
    status = r ? r.status() : 0;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const s = await page.evaluate(SNAP);
    s.moreItems = await openMore(page);
    s.final = new URL(page.url()).pathname;
    if (shotFile) await page.screenshot({ path: shotFile, type: 'jpeg', quality: 60, clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.min(page.viewportSize().height, 760) } }).catch(() => {});
    return { path, status, errors, ...s };
  } catch (e) {
    return { path, status, errors: [...errors, String(e).slice(0, 160)], failed: true };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch();
const { signIn } = await import('./smoke.mjs');
const sctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await signIn(await sctx.newPage(), base, { email: arg('email'), password: readFileSync(arg('password-file'), 'utf8').trim() });
const state = await sctx.storageState();
await sctx.close();

const pages = [];
for (const s of routes) for (const t of s.tabs) for (const p of t.pages) pages.push({ section: s.id, tab: t.id, more: t.more, href: p.href });
const queue = pages.filter((p) => !only || p.section === only);

const rows = [];
for (const [vn, w, h] of [['desk', 1366, 900], ['phone', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, storageState: state, hasTouch: vn === 'phone' });
  let i = 0;
  const work = async () => {
    while (i < queue.length) {
      const p = queue[i++];
      const file = `${out}/${vn}-${p.href.replace(/^\/admin\/?/, '').replace(/\//g, '_') || 'home'}.jpg`;
      const r = await visit(ctx, p.href, file);
      rows.push({ vp: vn, ...p, ...r });
    }
  };
  i = 0;
  await Promise.all([work(), work(), work()]);
  await ctx.close();
  console.log('viewport done', vn, rows.length);
}

// Pass 2: click through each section on the desktop (client navigation).
const clicks = [];
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, storageState: state });
  for (const s of routes) {
    if (!s.tabs.length || (only && s.id !== only)) continue;
    const first = s.tabs.find((t) => !t.more) || s.tabs[0];
    const page = await ctx.newPage();
    try {
      await page.goto(base + first.pages[0].href, { waitUntil: 'load', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const sig = async () => {
        const x = await page.evaluate(SNAP);
        return { tabs: x.mains.map((m) => m.t).join(' | '), active: x.mains.filter((m) => m.on).map((m) => m.t).join(','), chips: x.chips.map((c) => c.t).join(' | '), hasBar: x.hasTabBar, h1: x.h1.join(' / '), path: new URL(page.url()).pathname };
      };
      const start = await sig();
      clicks.push({ section: s.id, step: 'start', ...start });
      const labels = start.tabs ? start.tabs.split(' | ') : [];
      for (const label of labels) {
        const link = page.locator('[data-testid="a2-tabs"] .a2-tabs-s a.a2-tab', { hasText: new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first();
        if (!(await link.count())) { clicks.push({ section: s.id, step: 'click ' + label, missing: true }); continue; }
        const before = page.url();
        await link.click().catch(() => {});
        await page.waitForURL((u) => u.toString() !== before, { timeout: 8000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(300);
        const a = await sig();
        clicks.push({ section: s.id, step: 'tab ' + label, ...a });
        const chipLabels = a.chips ? a.chips.split(' | ') : [];
        for (const cl of chipLabels) {
          const chip = page.locator('[data-testid="a2-subtabs"] a', { hasText: new RegExp('^\\s*' + cl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first();
          if (!(await chip.count())) continue;
          const b4 = page.url();
          await chip.click().catch(() => {});
          await page.waitForURL((u) => u.toString() !== b4, { timeout: 8000 }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(300);
          clicks.push({ section: s.id, step: `chip ${label} > ${cl}`, ...(await sig()) });
        }
      }
    } catch (e) {
      clicks.push({ section: s.id, step: 'error', error: String(e).slice(0, 200) });
    } finally {
      await page.close();
    }
    console.log('clicked', s.id);
  }
  await ctx.close();
}
await browser.close();

// Analysis
const flags = [];
const bySec = (vp) => routes.map((s) => ({ s, rows: rows.filter((r) => r.vp === vp && r.section === s.id) }));
for (const vp of ['desk', 'phone']) {
  for (const { s, rows: rs } of bySec(vp)) {
    const ok = rs.filter((r) => !r.failed && r.status < 400 && r.hasTabBar);
    const sigOf = (r) => r.mains.map((m) => m.t).join(' | ') + ' ## ' + (r.moreItems || []).map((m) => m.t).join(' | ');
    const count = new Map();
    for (const r of ok) count.set(sigOf(r), (count.get(sigOf(r)) || 0) + 1);
    const modal = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const mode = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };
    const modalHead = mode(rs.filter((r) => !r.failed).map((r) => r.head));
    const modalBar = mode(ok.map((r) => r.barBeforeH1));
    const modalY = mode(ok.filter((r) => r.barY !== null).map((r) => r.barY));
    const modalH = mode(ok.filter((r) => r.barH !== null).map((r) => r.barH));
    const modalGap = mode(ok.filter((r) => r.barGap !== null).map((r) => r.barGap));
    for (const r of rs) {
      const why = [];
      if (r.failed) why.push('page failed to load');
      else {
        if (r.status >= 400) why.push('HTTP ' + r.status);
        if (r.final && !r.final.startsWith('/admin')) why.push('redirected to ' + r.final);
        if (s.tabs.length > 1 && !r.hasTabBar && !r.stateText) why.push('NO section tab bar');
        if (r.hasTabBar && modal && sigOf(r) !== modal) why.push('tab bar differs from the section\'s usual one: ' + sigOf(r));
        if (r.hasTabBar) {
          const act = r.mains.filter((m) => m.on).length + (r.moreOn ? 1 : 0);
          if (act !== 1) why.push(`${act} tabs marked active`);
        }
        // PR 762 (permanent): the bar must not jump between the pages of a section: same Y, same height, same gap below it
        if (r.hasTabBar && r.barY !== null) {
          if (modalY !== undefined && Math.abs(r.barY - modalY) > 1) why.push(`tab bar Y ${r.barY}px, the section's ${modalY}px (it jumps)`);
          if (modalH !== undefined && Math.abs(r.barH - modalH) > 1) why.push(`tab bar height ${r.barH}px, the section's ${modalH}px`);
          if (modalGap !== undefined && r.barGap !== null && Math.abs(r.barGap - modalGap) > 1) why.push(`gap under the tab bar ${r.barGap}px, the section's ${modalGap}px`);
        }
        if (r.h1.length !== 1) why.push(`${r.h1.length} h1 headings`);
        if (r.head !== modalHead) why.push(`page header pattern "${r.head}" (the section's usual: "${modalHead}")`);
        if (r.hasTabBar && r.barBeforeH1 !== modalBar) why.push(`tab bar ${r.barBeforeH1 ? 'above' : 'below'} the heading (the section's usual: ${modalBar ? 'above' : 'below'})`);
        if (vp === 'phone' && r.hasTabBar && !r.tabBarShown) why.push('tab bar hidden on the phone');
        if (r.sideSection && r.sideSection !== s.id) why.push('sidebar marks section ' + r.sideSection);
        if (!r.sideSection) why.push('sidebar marks no section');
        if (r.errors.length) why.push('console: ' + r.errors.slice(0, 2).join(' ; '));
        if (r.scrollOverX > 1 && vp === 'phone') why.push('sideways scroll ' + r.scrollOverX + 'px');
      }
      if (why.length) flags.push({ vp, section: s.id, tab: r.tab, path: r.href, why });
    }
  }
}
const clickFlags = [];
for (const s of routes) {
  const cs = clicks.filter((c) => c.section === s.id && c.tabs !== undefined);
  const start = cs[0];
  for (const c of cs.slice(1)) if (c.tabs !== start.tabs || !c.hasBar) clickFlags.push({ section: s.id, step: c.step, path: c.path, tabs: c.tabs, expected: start.tabs });
}
writeFileSync(`${out}/nav-audit.json`, JSON.stringify({ rows, clicks, flags, clickFlags }, null, 1));
const md = ['# Admin menu audit', '', `Pages: ${queue.length} x 2 widths. Flags: ${flags.length}. Click flags: ${clickFlags.length}.`, '', '## Per page (desktop)', '', '| Section | Tab | Page | HTTP | Tab bar (active) | More items | Chips | h1 | Header | Errors |', '|---|---|---|---|---|---|---|---|---|---|'];
for (const r of rows.filter((x) => x.vp === 'desk')) {
  md.push(`| ${r.section} | ${r.tab}${r.more ? ' (more)' : ''} | ${r.href} | ${r.status} | ${r.hasTabBar ? r.mains.map((m) => (m.on ? '**' + m.t + '**' : m.t)).join(', ') + (r.moreOn ? ' [More active]' : '') : 'NONE'} | ${(r.moreItems || []).map((m) => m.t).join(', ')} | ${(r.chips || []).map((m) => m.t).join(', ')} | ${(r.h1 || []).join(' / ')} | ${r.head} | ${r.errors?.length || 0} |`);
}
md.push('', '## Flags', '');
for (const f of flags) md.push(`- [${f.vp}] ${f.section} / ${f.tab} ${f.path}: ${f.why.join('; ')}`);
md.push('', '## Click-through flags', '');
for (const f of clickFlags) md.push(`- ${f.section} ${f.step} -> ${f.path}: tabs "${f.tabs}" (expected "${f.expected}")`);
writeFileSync(`${out}/nav-audit.md`, md.join('\n'));
console.log('FLAGS', flags.length, 'CLICKFLAGS', clickFlags.length);
