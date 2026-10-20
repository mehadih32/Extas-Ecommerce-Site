// PR 85 — the device gate on the real app (Blueprint Appendix C1/C2, D1.4 mobile hardening; START-HERE "port the QA
// tools to the real app as Playwright tests"). Every URL of lighthouserc.json on every phone (docs/qa/devices.json),
// tablet (docs/qa/device-matrix.js TABLETS, portrait + landscape) and desktop size (docs/qa/devices-desktop.json):
//   - the demo gate's layout checks, reused from docs/qa/device-matrix.js (pageChecks): PAGE-WIDER-THAN-PHONE,
//     HORIZONTAL-SCROLL, STICKS-OUT-RIGHT, TEXT-CUT-OFF, TAPS-OVERLAP; plus JS-ERROR and PAGE-STATUS;
//   - STICKS-OUT-LEFT: nothing is cut off at the left edge;
//   - TAP-TOO-SMALL (touch sizes): every tap target at least 44 × 44 (inline text links at least 32 tall), measured as
//     the area that really takes the tap (elementFromPoint), so invisible padding counts;
//   - INPUT-FONT-UNDER-16 (touch sizes): every form field at least 16 px (no iPhone zoom on focus).
// The rules are data in docs/qa/device-gate.json. Pass = 0 fails. One Chromium, several pages in parallel.
//   node tools/device-gate.mjs [--base=http://127.0.0.1:3000] [--group=phones|tablets|desktop|all]
//                              [--out=device-gate-report] [--concurrency=8] [--urls=/a,/b (instead of lighthouserc)]
// Needs the `playwright` package (CI installs it outside the workspace and sets NODE_PATH) and a running app.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

/** Phones, tablets and desktop sizes, each with its group, pixel ratio and input kind. */
export function deviceList(group, matrix = require(join(root, 'docs/qa/device-matrix.js'))) {
  const desktop = readJson('docs/qa/devices-desktop.json').map((d) => ({ ...d, group: 'desktop', dpr: 1 }));
  const all = { phones: matrix.PHONES, tablets: matrix.TABLETS, desktop };
  const pick = group === 'all' ? [...all.phones, ...all.tablets, ...all.desktop] : all[group];
  if (!pick) throw new Error(`unknown group ${group} (phones, tablets, desktop or all)`);
  return pick.map((d) => ({ ...d, touch: d.group !== 'desktop' }));
}

/** The URLs to check: the paths of lighthouserc.json's ci.collect.url, on the given base. */
export function urlList(base, lighthouserc = readJson('lighthouserc.json')) {
  const urls = lighthouserc?.ci?.collect?.url ?? [];
  return [...new Set(urls.map((u) => new URL(u).pathname + new URL(u).search))].map((p) => new URL(p, base).toString());
}

/* ---------- checks that run inside the page (serialised by Playwright: no closures over module scope) ---------- */
function appChecks(o) {
  const issues = [];
  const W = innerWidth;
  const vis = (e) => {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2; // 1–2 px boxes are visually-hidden text for screen readers
  };
  const inScroller = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
    }
    return false;
  };
  const label = (e) => (e.getAttribute('data-testid') || e.getAttribute('aria-label') || e.id || (e.className && e.className.toString().split(' ').slice(0, 2).join('.')) || e.tagName).slice(0, 40);
  const all = [...document.body.querySelectorAll('*')];
  const list = (arr) => arr.slice(0, 5).join(', ') + (arr.length > 5 ? ` (+${arr.length - 5})` : '');

  // Nothing cut off at the left edge (a box wholly off-screen is an intentional skip link or a closed drawer).
  const left = [];
  for (const e of all) {
    if (!vis(e) || inScroller(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.left < -1 && r.right > 1 && r.width < W * 3) left.push(`${label(e)}←${Math.round(r.left)}`);
  }
  if (left.length) issues.push({ k: 'STICKS-OUT-LEFT', d: list(left) });

  // Form fields at least 16 px on touch screens.
  if (o.inputFont) {
    const small = [];
    const textLike = /^(text|search|email|tel|url|password|number|date|datetime-local|month|time|week)$/;
    for (const e of document.querySelectorAll('input, select, textarea, [contenteditable=""], [contenteditable=true]')) {
      if (e.tagName === 'INPUT' && !textLike.test((e.getAttribute('type') || 'text').toLowerCase())) continue;
      if (!vis(e)) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < o.inputMinFontPx - 0.01) small.push(`${label(e)}:${fs}px`);
    }
    if (small.length) issues.push({ k: 'INPUT-FONT-UNDER-16', d: list(small) });
  }

  // Tap targets: the area that really takes the tap, probed from the centre outwards with elementFromPoint.
  if (o.taps) {
    const small = [];
    const targets = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=switch], [role=checkbox]')]
      .filter((e) => vis(e) && !e.disabled && e.getAttribute('aria-hidden') !== 'true' && getComputedStyle(e).pointerEvents !== 'none' && !e.closest('[inert]'));
    const inlineLink = (e) => {
      if (e.tagName !== 'A' || !/^inline(-block)?$/.test(getComputedStyle(e).display)) return false;
      return [...(e.parentElement?.childNodes ?? [])].some((n) => n !== e && n.nodeType === 3 && n.textContent.trim().length > 0);
    };
    const probe = (e, extra) => {
      const owns = (x, y) => {
        const h = document.elementFromPoint(x, y);
        return !!h && (h === e || e.contains(h) || extra.some((l) => l === h || l.contains(h)));
      };
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = e.getBoundingClientRect();
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      if (!owns(cx, cy)) return { w: r.width, h: r.height };
      const reach = (dx, dy) => { let n = 0; while (n < 64 && owns(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
      return { w: Math.max(r.width, reach(-1, 0) + reach(1, 0) + 1), h: Math.max(r.height, reach(0, -1) + reach(0, 1) + 1) };
    };
    const y0 = scrollY, x0 = scrollX;
    for (const e of targets) {
      const r = e.getBoundingClientRect();
      // Wholly off-screen sideways and not in a scroller: a skip link until focused, a closed drawer; nothing to tap.
      if ((r.right <= 0 || r.left >= W) && !inScroller(e)) continue;
      const labels = e.labels ? [...e.labels].filter(vis) : [];
      if (labels.some((l) => { const lr = l.getBoundingClientRect(); return lr.width >= o.tapMinPx && lr.height >= o.tapMinPx; })) continue;
      const inline = inlineLink(e);
      const needW = inline ? 0 : o.tapMinPx, needH = inline ? o.inlineLinkMinPx : o.tapMinPx;
      if (r.width >= needW && r.height >= needH) continue;
      const s = probe(e, labels);
      if (s.w + 0.5 < needW || s.h + 0.5 < needH) small.push(`${label(e)} ${Math.round(s.w)}×${Math.round(s.h)}${inline ? ' (inline link)' : ''}`);
    }
    scrollTo(x0, y0);
    if (small.length) issues.push({ k: 'TAP-TOO-SMALL', d: list(small) });
  }
  return issues;
}

async function checkOne(browser, device, url, rules, matrix) {
  const ctx = await browser.newContext({
    viewport: { width: device.w, height: device.h },
    deviceScaleFactor: device.dpr || 1,
    isMobile: device.touch,
    hasTouch: device.touch,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  const issues = [];
  let finalUrl = url;
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    finalUrl = page.url();
    if (!res || res.status() >= 400) issues.push({ k: 'PAGE-STATUS', d: `HTTP ${res ? res.status() : 'no answer'}` });
    await page.waitForTimeout(rules.settleMs);
    // Layout first, taps last: the tap probe scrolls the page.
    issues.push(...(await page.evaluate(matrix.pageChecks, device.w)).issues);
    issues.push(...(await page.evaluate(appChecks, {
      inputFont: rules.inputFontGroups.includes(device.group),
      taps: rules.tapGroups.includes(device.group),
      tapMinPx: rules.tapMinPx,
      inlineLinkMinPx: rules.inlineLinkMinPx,
      inputMinFontPx: rules.inputMinFontPx,
    })));
  } catch (e) {
    issues.push({ k: 'PAGE-LOAD', d: String(e).split('\n')[0].slice(0, 160) });
  }
  if (errors.length) issues.push({ k: 'JS-ERROR', d: errors[0] });
  let shot = null;
  if (issues.length && rules.shotDir) {
    shot = `${device.group}-${device.w}x${device.h}-${new URL(url).pathname.replace(/[^a-z0-9]+/gi, '_')}.png`;
    await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
    await page.screenshot({ path: join(rules.shotDir, shot) }).catch(() => { shot = null; });
  }
  await ctx.close();
  return { device: device.name, group: device.group, w: device.w, h: device.h, url: new URL(url).pathname, finalUrl: new URL(finalUrl).pathname, issues, shot };
}

/** A short Markdown report of a run. */
export function markdownReport(results, { base, seconds }) {
  const failing = results.filter((r) => r.issues.length);
  const groups = ['phone', 'tablet', 'desktop'].map((g) => {
    const rs = results.filter((r) => r.group === g);
    return rs.length ? `| ${g} | ${new Set(rs.map((r) => r.device)).size} | ${rs.length} | ${rs.filter((r) => r.issues.length).length} |` : null;
  }).filter(Boolean);
  const kinds = {};
  for (const r of failing) for (const i of r.issues) (kinds[i.k] ??= new Set()).add(`${r.w}×${r.h}`);
  const lines = [
    '# Device gate (PR 85, Appendix C2)',
    '',
    `Result: **${failing.length ? `FAIL — ${failing.length} of ${results.length} device × page checks failed` : `PASS — 0 fails in ${results.length} device × page checks`}** · ${new Set(results.map((r) => r.url)).size} pages · ${Math.round(seconds)} s · ${base}`,
    '',
    '| Group | Sizes | Checks | Failing |',
    '|---|---|---|---|',
    ...groups,
  ];
  if (failing.length) {
    lines.push('', '| Failure | On how many sizes | Sizes |', '|---|---|---|');
    for (const [k, s] of Object.entries(kinds).sort((a, b) => b[1].size - a[1].size)) lines.push(`| ${k} | ${s.size} | ${[...s].slice(0, 8).join(' ')}${s.size > 8 ? ' …' : ''} |`);
    lines.push('', '| Size | Page | Failure | Detail |', '|---|---|---|---|');
    for (const r of failing.slice(0, 60)) for (const i of r.issues) lines.push(`| ${r.device} ${r.w}×${r.h} | ${r.url}${r.finalUrl !== r.url ? ` → ${r.finalUrl}` : ''} | ${i.k} | ${String(i.d).replace(/\|/g, '\\|')} |`);
    if (failing.length > 60) lines.push('', `… and ${failing.length - 60} more in device-gate.json`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
  const rules = readJson('docs/qa/device-gate.json');
  const base = arg('base', 'http://127.0.0.1:3000');
  const out = arg('out', 'device-gate-report');
  const concurrency = Number(arg('concurrency', rules.concurrency));
  const matrix = require(join(root, 'docs/qa/device-matrix.js'));
  const devices = deviceList(arg('group', 'all'), matrix);
  const only = arg('urls', '');
  const urls = only ? only.split(',').map((p) => new URL(p, base).toString()) : urlList(base);
  mkdirSync(join(out, 'shots'), { recursive: true });
  rules.shotDir = join(out, 'shots');

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const jobs = devices.flatMap((d) => urls.map((u) => [d, u]));
  const results = [];
  const started = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < jobs.length) {
      const [d, u] = jobs[next++];
      results.push(await checkOne(browser, d, u, rules, matrix));
    }
  }));
  await browser.close();
  const order = (r) => devices.findIndex((d) => d.name === r.device) * 1000 + urls.findIndex((u) => new URL(u).pathname === r.url);
  results.sort((a, b) => order(a) - order(b));

  const md = markdownReport(results, { base, seconds: (Date.now() - started) / 1000 });
  writeFileSync(join(out, 'device-gate.json'), JSON.stringify(results, null, 1));
  writeFileSync(join(out, 'device-gate.md'), md);
  console.log(md);
  process.exitCode = results.some((r) => r.issues.length) ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
