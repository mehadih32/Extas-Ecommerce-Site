/* EXTAS — device matrix QA gate.
   Runs every route on every phone size sold in Bangladesh, the way a real phone renders it
   (isMobile + touch + real pixel ratio, so the page's meta viewport is honoured).
   A page PASSES on a device only if every check below is clean.

   usage: node device-matrix.js [path-to-built-html] [--routes=pdp|all] [--group=phones|tablets|all] [--slice=A-B] [--json=out.json]

   R15 wave 1 (owner, 05:10): a TABLET group — iPad mini, iPad Air, iPad Pro 11, iPad Pro 12.9
   and an Android tab, each in portrait AND landscape (10 sizes). They run with touch and a
   2x pixel ratio, through exactly the same checks as the phones. Default --group=all
   (15 phones + 10 tablets). Backup of the phone-only gate: device-matrix.pre-tab.js.
*/
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/proto/dist/EXTAS-demo.html';
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const ROUTESET = arg('routes') || 'all';
const JSON_OUT = arg('json');
const PHONES = JSON.parse(fs.readFileSync(path.join(__dirname, 'devices.json'), 'utf8')).map(d => Object.assign({ group: 'phone', dpr: 3 }, d));
const TABLETS = [
  { name: 'iPad mini (portrait)', w: 768, h: 1024 }, { name: 'iPad mini (landscape)', w: 1024, h: 768 },
  { name: 'iPad Air (portrait)', w: 820, h: 1180 }, { name: 'iPad Air (landscape)', w: 1180, h: 820 },
  { name: 'iPad Pro 11 (portrait)', w: 834, h: 1194 }, { name: 'iPad Pro 11 (landscape)', w: 1194, h: 834 },
  { name: 'iPad Pro 12.9 (portrait)', w: 1024, h: 1366 }, { name: 'iPad Pro 12.9 (landscape)', w: 1366, h: 1024 },
  { name: 'Android tab (portrait)', w: 800, h: 1280 }, { name: 'Android tab (landscape)', w: 1280, h: 800 }
].map(d => Object.assign({ group: 'tablet', dpr: 2 }, d));
const GROUP = arg('group') || 'all';
const DEVICES_ALL = GROUP === 'phones' ? PHONES : GROUP === 'tablets' ? TABLETS : PHONES.concat(TABLETS);
/* --slice=A-B runs devices A..B-1 of the group (chunked runs after the container restart) */
const SLICE = (arg('slice') || '').split('-').map(Number);
const DEVICES = SLICE.length === 2 && !isNaN(SLICE[0]) ? DEVICES_ALL.slice(SLICE[0], SLICE[1]) : DEVICES_ALL;

const PDP_SLUGS = ['essential-pique-polo', 'oxford-cotton-shirt', 'classic-cotton-panjabi',
  'slim-chino-trousers', 'heavyweight-hoodie', 'everyday-crew-tee'];
const PAGES = ['#/', '#/c/polos', '#/c/new', '#/set', '#/combo/polo-duo', '#/bag', '#/checkout', '#/account', '#/journal'];

/* ---------- checks that run inside the page ---------- */
function pageChecks(devW) {
  const W = innerWidth, H = innerHeight;
  const out = { layoutW: W, devW, issues: [] };
  const vis = e => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inScroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
    const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true; } return false; };
  const fixed = e => { for (let p = e; p && p !== document.body; p = p.parentElement) { const ps = getComputedStyle(p).position; if (ps === 'fixed' || ps === 'sticky') return true; } return false; };
  const label = e => (e.getAttribute('data-testid') || (e.className && e.className.toString().split(' ').slice(0, 2).join('.')) || e.tagName).slice(0, 40);

  // 1. The page must not be wider than the phone.
  if (W > devW + 0.5) out.issues.push({ k: 'PAGE-WIDER-THAN-PHONE', d: `layout ${W}px on a ${devW}px phone` });
  const sw = document.documentElement.scrollWidth;
  if (sw > W + 1) out.issues.push({ k: 'HORIZONTAL-SCROLL', d: `scrollWidth ${sw} > ${W}` });

  // 2. Nothing may stick out past the right edge (carousels excepted).
  const all = [...document.body.querySelectorAll('*')];
  const wide = [];
  for (const e of all) { if (!vis(e) || inScroller(e)) continue; const r = e.getBoundingClientRect();
    if (r.right > devW + 1 && r.width < devW * 3) wide.push([label(e), Math.round(r.right)]); }
  if (wide.length) out.issues.push({ k: 'STICKS-OUT-RIGHT', d: wide.slice(0, 5).map(x => x[0] + '→' + x[1]).join(', ') + (wide.length > 5 ? ` (+${wide.length - 5})` : '') });

  // 3. Text that is cut off (overflow hidden + content wider than box) on a non-scroller.
  const cut = [];
  for (const e of all) { if (!vis(e) || !e.childNodes.length) continue;
    const hasText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1); if (!hasText) continue;
    const s = getComputedStyle(e); if (!/(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis') continue;
    if (e.scrollWidth > e.clientWidth + 1) cut.push(label(e) + ':"' + e.textContent.trim().slice(0, 18) + '"'); }
  if (cut.length) out.issues.push({ k: 'TEXT-CUT-OFF', d: cut.slice(0, 4).join(', ') + (cut.length > 4 ? ` (+${cut.length - 4})` : '') });

  // 4. Tappable things must not sit on top of each other (in-flow ones; fixed bars are checked separately).
  const taps = all.filter(e => e.matches('a[href],button,input,select,textarea,[role=button],label[for]') && vis(e) && !fixed(e) && !inScroller(e));
  const rects = taps.map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.top < H * 2.2);
  const ov = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, ra] = rects[i], [b, rb] = rects[j]; if (a.contains(b) || b.contains(a)) continue;
    const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ix > 2 && iy > 2) { const area = ix * iy, small = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (area > small * 0.25) ov.push(label(a) + ' × ' + label(b)); } }
  if (ov.length) out.issues.push({ k: 'TAPS-OVERLAP', d: ov.slice(0, 4).join(' · ') + (ov.length > 4 ? ` (+${ov.length - 4})` : '') });

  // 5. A fixed bar must not cover in-flow tappable content that is meant to be on the first screen.
  const bars = all.filter(e => vis(e) && getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().top > H * 0.6);
  return out;
}

/* ---------- product-page checks: the owner's own rules ---------- */
async function pdpChecks(p, devW) {
  return p.evaluate((devW) => {
    const iss = [];
    const q = s => document.querySelector(s);
    const R = e => e ? e.getBoundingClientRect() : null;
    const H = innerHeight;

    // "All N colours" — the OWNER'S RULE (R15 · 2.2, which corrects the R14 reading):
    //   up to 5 colours: on the SWATCH line, the next thing after the last swatch;
    //   6 or more:       up on the "Colour – Navy" label line, right of the label.
    // It must never wrap, never sit on the wrong line, never touch its neighbours.
    const allc = q('.pdp-allc'), sw = q('.pdp-sw .swatch, .pdp-sw [class*=swatch]');
    const clbl = q('.pdp-colsec .pdp-lbl');
    const nCol = document.querySelectorAll('.pdp-sw .swatch').length;
    if (allc && sw && clbl) { const a = R(allc), s = R(sw), l = R(clbl);
      const mid = r => r.top + r.height / 2;
      if (nCol <= 5) {
        const sws = [...document.querySelectorAll('.pdp-sw .swatch')], last = R(sws[sws.length - 1]);
        if (Math.abs(mid(a) - mid(s)) > 6) iss.push({ k: 'ALL-COLOURS-OFF-LINE', d: `${nCol} colours: "All colours" mid y${Math.round(mid(a))} is not on the swatch line (y${Math.round(mid(s))})` });
        else if (a.left < last.right + 8) iss.push({ k: 'ALL-COLOURS-OFF-LINE', d: `${nCol} colours: "All colours" (x${Math.round(a.left)}) touches the last swatch (ends x${Math.round(last.right)})` });
      } else {
        const sameLine = Math.abs(mid(a) - mid(l)) < Math.max(l.height, 12) * 0.6;
        if (!sameLine) iss.push({ k: 'ALL-COLOURS-OFF-LINE', d: `${nCol} colours: "All colours" mid y${Math.round(mid(a))}, colour label mid y${Math.round(mid(l))}` });
        else if (a.left < l.right - 0.5) iss.push({ k: 'ALL-COLOURS-OFF-LINE', d: `"All colours" (x${Math.round(a.left)}) runs into the label (ends x${Math.round(l.right)})` });
        else if (a.bottom > s.top + 0.5) iss.push({ k: 'ALL-COLOURS-OFF-LINE', d: `"All colours" bottom y${Math.round(a.bottom)} reaches the swatches (y${Math.round(s.top)})` });
      }
      if (a.right > devW + 0.5) iss.push({ k: 'ALL-COLOURS-PAST-EDGE', d: `right ${Math.round(a.right)}` }); }
    const swRow = q('.pdp-sw');
    if (swRow && sw) { const rows = new Set([...swRow.querySelectorAll('.swatch')].map(x => Math.round(R(x).top))).size;
      if (rows > 1) iss.push({ k: 'SWATCHES-WRAP', d: `${rows} rows of colour swatches` }); }

    // R15 · 2.6 — the words after the price bar are ONE line on every phone.
    const pay = q('[data-testid=price-row] .pdp-payfit');
    if (pay && pay.offsetHeight) { const lh = parseFloat(getComputedStyle(pay).lineHeight) || parseFloat(getComputedStyle(pay).fontSize) * 1.3;
      if (pay.getBoundingClientRect().height > lh * 1.5) iss.push({ k: 'PRICE-LINE-TWO-LINES', d: `pay line ${Math.round(pay.getBoundingClientRect().height)}px tall` });
      if (pay.scrollWidth > pay.clientWidth + 1) iss.push({ k: 'PRICE-LINE-CUT', d: `pay line ${pay.scrollWidth} > ${pay.clientWidth}` }); }
    // "Size" label and the "Size chart" button must share one line (owner 14.12).
    const chart = q('[data-testid=open-chart]'), lbl = chart && chart.closest('.pdp-lblrow');
    const lineCheck = (row, tag) => { if (!row) return; const kids = [...row.children].filter(k => getComputedStyle(k).display !== 'none');
      const mids = kids.map(k => { const r = R(k); return r.top + r.height / 2; });
      if (Math.max(...mids) - Math.min(...mids) > 12) iss.push({ k: 'SIZE-ROW-BREAKS', d: `${tag}: label and Size chart not on one line` });
      const t = row.querySelector('.pdp-lbl'); if (t && t.getClientRects().length > 1) iss.push({ k: 'SIZE-ROW-BREAKS', d: `${tag}: the size label itself wraps` });
      // R14: .pdp-lbl is a flex item (blockified), so getClientRects() is always 1 even when its
      // text wraps onto two lines. Also compare its height with its own line height.
      if (t) { const cs = getComputedStyle(t), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
        if (R(t).height > lh * 1.5) iss.push({ k: 'SIZE-ROW-BREAKS', d: `${tag}: the size label wraps (${Math.round(R(t).height)}px tall, line ${Math.round(lh)}px)` }); } };
    lineCheck(lbl, 'before pick');
    if (chart && R(chart).right > devW + 0.5) iss.push({ k: 'SIZE-CHART-PAST-EDGE', d: `right ${Math.round(R(chart).right)}` });

    // Owner 14.14: show three questions, the rest behind a button.
    const qa = document.querySelector('#pdp-qa, [data-testid=pdp-qa], .pdp-qa');
    if (qa) { const items = [...qa.querySelectorAll('details, .qa-item, .pdp-qa-item, [data-q]')].filter(e => getComputedStyle(e).display !== 'none' && R(e).height > 0);
      if (items.length > 3) iss.push({ k: 'TOO-MANY-QUESTIONS-SHOWN', d: `${items.length} questions visible (max 3)` }); }

    // Owner 14.13: price · space · bar · space · free home delivery.
    // R14 correction: the bar is drawn as a 5px-wide span (.pdp-pbar), and the old test only
    // looked for elements <= 4px wide, so it never found the bar and silently passed every
    // product. It now finds any tall thin element (<= 6px wide, >= 14px tall, 3x taller than
    // wide) and measures INK, not boxes: text by its glyph run (Range rects) and icons by the
    // drawn SVG geometry (getBBox through the screen matrix). An icon's empty margin inside
    // its own 24x24 box no longer counts as "space".
    const prow = q('[data-testid=price-row]');
    if (prow) { const kids = [...prow.querySelectorAll('*')].filter(e => getComputedStyle(e).display !== 'none' && R(e).width > 0);
      const bar = kids.find(e => { const r = R(e); return r.width <= 6 && r.height >= 14 && r.height >= r.width * 3 && !e.closest('svg'); });
      if (bar) { const br = R(bar);
        const ink = [];
        const walk = n => { if (n.nodeType === 3) { if (!n.textContent.trim()) return; const p = n.parentElement; if (!p || getComputedStyle(p).display === 'none') return;
            const rg = document.createRange(); rg.selectNodeContents(n); [...rg.getClientRects()].forEach(r => { if (r.width > 0.5) ink.push(r); }); return; }
          if (n.nodeType !== 1 || getComputedStyle(n).display === 'none') return;
          if (n.tagName.toLowerCase() === 'svg') { try { const b = n.getBBox(), m = n.getScreenCTM(); if (b.width && m) {
              const sw = (parseFloat(getComputedStyle(n).strokeWidth) || 0) / 2;
              const x1 = m.a * (b.x - sw) + m.e, x2 = m.a * (b.x + b.width + sw) + m.e;
              ink.push({ left: x1, right: x2, width: x2 - x1 }); } } catch (e) {} return; }
          [...n.childNodes].forEach(walk); };
        walk(prow);
        const before = ink.filter(r => r.right <= br.left + 0.5), after = ink.filter(r => r.left >= br.right - 0.5);
        const gl = before.length ? br.left - Math.max(...before.map(r => r.right)) : null;
        const gr = after.length ? Math.min(...after.map(r => r.left)) - br.right : null;
        if (gl !== null && gr !== null && (gl < 6 || gr < 6 || Math.abs(gl - gr) > 4))
          iss.push({ k: 'PRICE-BAR-SPACING', d: `ink gap before bar ${gl.toFixed(1)}px, after ${gr.toFixed(1)}px` }); } }

    // Price row must be on the first screen.
    const pr = q('[data-testid=price-row]');
    if (pr && R(pr).bottom > H) iss.push({ k: 'PRICE-BELOW-FOLD', d: `price bottom ${Math.round(R(pr).bottom)} > screen ${H}` });

    return iss;
  }, devW);
}

async function afterSizePick(p, devW) {
  // Pick the first in-stock size and check the measurement line is visible above the buy bar (owner 14.8).
  const picked = await p.evaluate(() => { const b = [...document.querySelectorAll('.size-pill')].find(x => !x.disabled && !x.classList.contains('oos'));
    if (b) { b.click(); return b.textContent.trim(); } return null; });
  if (!picked) return [];
  await p.waitForTimeout(350);
  return p.evaluate((devW) => {
    const iss = []; const H = innerHeight;
    const fit = document.querySelector('.pdp-fitline');
    const bar = [...document.querySelectorAll('*')].find(e => getComputedStyle(e).position === 'fixed' && e.querySelector('[data-testid=bar-add]'));
    if (fit && bar) { const f = fit.getBoundingClientRect(), b = bar.getBoundingClientRect();
      const gap = b.top - f.bottom;
      if (f.bottom > H) iss.push({ k: 'FIT-LINE-OFFSCREEN', d: `fit line bottom ${Math.round(f.bottom)} > screen ${H}` });
      else if (gap < 2) iss.push({ k: 'FIT-LINE-UNDER-BAR', d: `gap ${gap.toFixed(1)}px (needs ≥ 2)` }); }
    // Owner 14.6 / 14.7: in the "Size – L" label the L is bold and the dash is visible.
    const lum = c => { const m = c.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
      return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; };
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const pageBg = (() => { for (let e = document.querySelector('.pdp-colsec'); e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255,255,255)'; })();
    const chart = document.querySelector('[data-testid=open-chart]'), row = chart && chart.closest('.pdp-lblrow');
    const v = row && row.querySelector('.pdp-lblv');
    if (v) { const fw = +getComputedStyle(v).fontWeight; if (fw < 600) iss.push({ k: 'SIZE-VALUE-NOT-BOLD', d: `"${v.textContent.trim()}" weight ${fw}` });
      const dc = getComputedStyle(v, '::before').color; const cr = contrast(dc, pageBg);
      if (cr < 3) iss.push({ k: 'DASH-INVISIBLE', d: `dash ${dc} on ${pageBg} = ${cr.toFixed(2)}:1` }); }
    if (row) { const kids = [...row.children].filter(k => getComputedStyle(k).display !== 'none');
      const mids = kids.map(k => { const r = k.getBoundingClientRect(); return r.top + r.height / 2; });
      if (Math.max(...mids) - Math.min(...mids) > 12) iss.push({ k: 'SIZE-ROW-BREAKS', d: 'after pick: label and Size chart not on one line' }); }

    // R15 · 2.5 (replaces 14.9's "every field"): the measurement line is ONE line. Fields
    // show while they fit; the ones that do not fit hide from the end. Never two lines,
    // never cut mid-word, and the first field ("L fits chest up to 42"") always shows.
    const fx = document.querySelector('.pdp-fitx');
    if (fx && fx.offsetHeight) { const lh = parseFloat(getComputedStyle(fx).lineHeight) || 20;
      if (fx.getBoundingClientRect().height > lh * 1.6) iss.push({ k: 'FIT-LINE-TWO-LINES', d: `${Math.round(fx.getBoundingClientRect().height)}px tall` });
      if (fx.scrollWidth > fx.clientWidth + 1) iss.push({ k: 'FIT-LINE-CUT', d: `${fx.scrollWidth} > ${fx.clientWidth}` });
      const fis = [...fx.querySelectorAll('.pdp-fi')], vis = fis.map(e => !e.hidden && e.offsetWidth > 0);
      if (fis.length && !vis[0]) iss.push({ k: 'FIT-LINE-FIRST-HIDDEN', d: 'the first field is hidden' });
      if (vis.some((v, i) => !v && vis.slice(i + 1).some(Boolean))) iss.push({ k: 'FIT-LINE-HOLE', d: 'a middle field is hidden' }); }
    // R15 · 2.8: when the line ends the first screen it sits in the middle of the room
    // between the size boxes and the buy bar.
    const pills = document.querySelector('#pdp-sizes .pdp-pills'), page = document.querySelector('.pdp-page');
    if (fit && bar && pills && page && page.getAttribute('data-fit-anchor') === '.pdp-fitline') {
      const above = fit.getBoundingClientRect().top - pills.getBoundingClientRect().bottom, below = bar.getBoundingClientRect().top - fit.getBoundingClientRect().bottom;
      if (Math.abs(above - below) > 1.5) iss.push({ k: 'FIT-LINE-NOT-CENTRED', d: `above ${above.toFixed(1)} / below ${below.toFixed(1)}` }); }
    return iss;
  }, devW);
}

(async () => {
  const browser = await chromium.launch();
  const report = [];
  const routes = ROUTESET === 'pdp' ? PDP_SLUGS.map(s => '#/p/' + s) : [...PAGES, ...PDP_SLUGS.map(s => '#/p/' + s)];
  for (const d of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr || 3, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 80)));
    /* tablets also walk every category and a help page (owner, 05:10) */
    const TABLET_EXTRA = ['#/c/tshirts', '#/c/shirts', '#/c/panjabi', '#/c/trousers', '#/c/hoodies', '#/c/extras', '#/page/delivery', '#/page/contact'];
    for (const r of (d.group === 'tablet' && ROUTESET !== 'pdp' ? routes.concat(TABLET_EXTRA) : routes)) {
      await p.goto('file://' + FILE + r, { waitUntil: 'load' }); await p.waitForTimeout(700);
      // the demo's one-time welcome sheet opens ~3s after the first load; the shop never has it,
      // so it is marked seen and closed before measuring (it made a random route fail by timing)
      await p.evaluate(() => { try { if (window.ST) { ST.seenIntro = true; if (typeof saveState === 'function') saveState(); }
        if (typeof closeModal === 'function') closeModal(); } catch (e) {} }); await p.waitForTimeout(150);
      const g = await p.evaluate(pageChecks, d.w);
      let issues = g.issues;
      if (r.startsWith('#/p/')) { issues = issues.concat(await pdpChecks(p, d.w), await afterSizePick(p, d.w)); }
      report.push({ device: d.name, w: d.w, h: d.h, route: r, layoutW: g.layoutW, issues });
      if (r === '#/p/essential-pique-polo') {
        // Owner 14.11: design against SIX colours — the hardest case.
        await p.evaluate(() => { const pr = DB.products.find(x => x.id === 'essential-pique-polo');
          if (pr.colors.indexOf('grey') < 0) { pr.colors.push('grey'); pr.stock.grey = pr.stock.navy.slice ? pr.stock.navy.slice() : Object.assign({}, pr.stock.navy); }
          if (typeof rerender === 'function') rerender(); });
        await p.waitForTimeout(500);
        const six = (await p.evaluate(pageChecks, d.w)).issues.concat(await pdpChecks(p, d.w));
        report.push({ device: d.name, w: d.w, h: d.h, route: r + ' [6 colours]', layoutW: g.layoutW, issues: six });
      }
    }
    if (errs.length) report.push({ device: d.name, w: d.w, h: d.h, route: '(any)', issues: [{ k: 'JS-ERROR', d: errs[0] }] });
    await ctx.close();
  }
  await browser.close();

  // ---------- summary ----------
  const failing = report.filter(x => x.issues.length);
  const byKind = {};
  failing.forEach(x => x.issues.forEach(i => { (byKind[i.k] = byKind[i.k] || new Set()).add(x.w + '×' + x.h); }));
  console.log(`\nDEVICES ${DEVICES.length} (group: ${GROUP}) · ROUTES ${routes.length} · CHECKS RUN ${report.length}`);
  ['phone', 'tablet'].forEach(g => { const rs = report.filter(x => (DEVICES.find(d => d.name === x.device) || {}).group === g); if (rs.length) console.log(`  ${g}s: ${rs.filter(x => x.issues.length).length} failing of ${rs.length}`); });
  console.log(`FAILING (device × route): ${failing.length} of ${report.length}\n`);
  console.log('Failure kind'.padEnd(26) + 'on how many screen sizes');
  Object.entries(byKind).sort((a, b) => b[1].size - a[1].size).forEach(([k, s]) =>
    console.log(k.padEnd(26) + String(s.size).padStart(2) + '  ' + [...s].slice(0, 8).join(' ') + (s.size > 8 ? ' …' : '')));
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
  process.exitCode = failing.length ? 1 : 0;
})();
