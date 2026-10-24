#!/usr/bin/env node
// PR 576 — the combo template test matrix. Plays every template of the three combo pages like a first-time guest on a
// running app with the sample data (a test server: EXTAS_SHOP_TEST_PAGES=1 for the bag fill), on each screen of
// docs/qa/combo-matrix.json, through the template preview links, measures each run and scores it with
// tools/combo-ranking.mjs (the weights of docs/owner/COMBO-RANKING.md §2). Writes the runs and the ranking to
// <out>/latest.json and the report docs/qa/COMBO-TEMPLATE-MATRIX.md (Bengali summary first, then the tables).
//
//   node tools/combo-matrix.mjs --base=http://127.0.0.1:3000 [--out=docs/qa/combo-ranking] [--only=product,category,bag]
//
// The guest: on a pair page it taps the main button once too early (the error must be inline, nothing added), then
// picks the first size it can in every size row that has none, taps the button and repeats until the set is in the
// bag (POST /api/bag/sets answered 2xx) or `maxSteps` runs out (a knock-out). On a category page it taps the first
// card until a pair page opens (L4 adds right on its card), and goes on as on a pair page. In the bag it changes one
// piece's size (a template without sizes in the bag counts the "Change size or colour" journey, `linkTaps`), and
// checks that the money is the same as in the current look. Needs the `playwright` package (CI sets NODE_PATH).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { humanSeconds, rankTemplates, scoreBag, scoreCategory, scoreProduct } from './combo-ranking.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** `?tpl=P1` added to a path that may already carry a query. */
export const withParam = (path, key, value) => `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;

/** Digits of a shown price (Bengali digits too) → a number; null when there are none. */
export function moneyOf(text) {
  const western = String(text ?? '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  const digits = western.replace(/[^0-9-]/g, '');
  return digits ? Number(digits) : null;
}

// ---- what the page reports about itself (runs in the browser) ----
/* eslint-disable no-undef */
function measurePage(sel) {
  const vh = window.innerHeight;
  const bar = document.querySelector(sel.bar);
  const barTop = bar && bar.getBoundingClientRect().height > 0 && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : vh;
  const limit = Math.min(vh, barTop);
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= limit + 0.5;
  };
  const started = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < limit && r.bottom > 0;
  };
  const main = document.querySelector('main') ?? document.body;
  // words above the fold, in the page's own content
  let words = 0;
  const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.textContent.trim();
    if (!t || !n.parentElement || n.parentElement.closest('script,style,[aria-hidden="true"],.sr')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.height > 0 && r.top < limit && r.bottom > 0) words += t.split(/\s+/).length;
  }
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  let cut = 0;
  for (const el of main.querySelectorAll('*')) {
    if (!shown(el) || el.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) cut += 1;
  }
  let wrapped = 0;
  for (const el of main.querySelectorAll(sel.prices)) {
    if (!shown(el)) continue;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
    if (el.getBoundingClientRect().height > lh * 1.8) wrapped += 1;
  }
  let small = 0;
  for (const el of main.querySelectorAll('button, select, input:not([type=hidden]), [role=radio], summary')) {
    if (!shown(el) || el.closest('[aria-hidden="true"]') || el.closest('details:not([open]) > :not(summary)')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const min = el.classList.contains('link') ? 32 : 44; // the device gate's own minimums (docs/qa/device-gate.json)
    if (Math.min(r.width, r.height) + 0.5 < min) small += 1;
  }
  const first = (sel.first ?? []).map((group) => group.some((s) => (s.startsWith('~') ? started(document.querySelector(s.slice(1))) : visible(document.querySelector(s)))));
  const cards = [...document.querySelectorAll(sel.cards ?? '[data-x-none]')];
  return {
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    words,
    cut,
    wrapped,
    small,
    first,
    fullCards: cards.filter(visible).length,
    cardsTwoScreens: cards.filter((c) => c.getBoundingClientRect().top < vh * 2).length,
  };
}
/* eslint-enable no-undef */

const PRODUCT_SEL = {
  bar: '.ca-mbar, [data-testid="cb-mbar"]',
  prices: '[data-testid="ca-price"], [data-testid="cb-price"]',
  // photo (started), price line, first size row, the button (the phone's sticky bar counts)
  first: [['~[data-testid="ca-hero"]', '~.cb-gallery', '~.ca-ph', '~.pimg'], ['[data-testid="ca-price"]', '[data-testid="cb-price"]', '[data-testid="cb-pricebox"]'], ['.ca-sizes', '[data-testid="cb-size"]', '.size-pill'], ['[data-testid="ca-cta-d"]', '[data-testid="cb-add"]', '~[data-testid="ca-mbar"]', '~[data-testid="cb-mbar"]']],
};
const CATEGORY_SEL = {
  bar: '[data-x-none]',
  prices: '.ca-cprice',
  first: [['.ca-cprice'], ['.ca-bdg.save', '.ca-savetxt']],
  cards: '[data-testid="ca-card"], [data-testid="ca-l4"], .ca-big',
};
const BAG_SEL = { bar: '.bg-mbar:not(.bg-mbar-off)', prices: '[data-testid="bag-set-price"]', first: [] };

const ctaOf = (phone) => (phone ? '[data-testid="ca-cta"]:visible, [data-testid="cb-mbar"] button:visible, [data-testid="ca-l4-add"]:visible' : '[data-testid="ca-cta-d"]:visible, [data-testid="cb-add"]:visible, [data-testid="ca-l4-add"]:visible');

/** Taps an element like a person: counts a scroll when it is not on the screen yet. */
async function tap(page, loc, m) {
  const inView = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  if (!inView) m.scrolls += 1;
  await loc.click({ timeout: 4000 });
  m.taps += 1;
}

/** The first size a guest can take in a size row that has none picked yet (in page order), or null. Size pills that
 * are links (a list's "My size" filter) are not a choice of the set. */
async function nextSize(page, root = 'main') {
  const sel = `${root} button.size-pill`;
  const handle = await page.evaluateHandle((q) => {
    const pills = [...document.querySelectorAll(q)].filter((p) => p.getClientRects().length > 0);
    const groups = [...new Set(pills.map((p) => p.parentElement))];
    for (const g of groups) {
      const mine = pills.filter((p) => p.parentElement === g);
      if (mine.some((p) => p.classList.contains('on') || p.getAttribute('aria-pressed') === 'true')) continue;
      const ok = mine.find((p) => !p.classList.contains('out') && p.getAttribute('aria-disabled') !== 'true' && !p.disabled);
      if (ok) return ok;
    }
    return null;
  }, sel);
  const el = handle.asElement();
  return el ? page.locator(sel).nth(await el.evaluate((x, q) => [...document.querySelectorAll(q)].indexOf(x), sel)) : null;
}

/** Plays a pair page (or one L4 card, `root`) to the bag; `m` gathers taps and scrolls. A shopper on L4 picks the size
 * and taps "Add both" on one card, so only that card's size row and button are played. */
async function playToBag(page, phone, m, maxSteps, settleMs, root = null) {
  const added = () => page.waitForResponse((r) => r.url().includes('/api/bag/sets') && r.request().method() === 'POST' && r.ok(), { timeout: 2500 }).then(() => true, () => false);
  for (let step = 0; step < maxSteps; step += 1) {
    const size = await nextSize(page, root ?? 'main');
    if (size) {
      await tap(page, size, m);
      await page.waitForTimeout(150);
      continue;
    }
    const cta = page.locator(root ? `${root} [data-testid="ca-l4-add"]` : ctaOf(phone)).first();
    if (!(await cta.count())) return false;
    const wait = added();
    await tap(page, cta, m);
    if (await wait) return true;
    await page.waitForTimeout(settleMs);
  }
  return false;
}

async function productRun(browser, base, screen, tpl, s, cfg) {
  const ctx = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, isMobile: screen.phone, hasTouch: screen.phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  const m = { taps: 0, scrolls: 0, pages: 0 };
  try {
    await page.goto(new URL(withParam(s.path, 'tpl', tpl), base).toString(), { waitUntil: 'load' });
    await page.locator(ctaOf(screen.phone)).first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(cfg.settleMs);
    const look = await page.evaluate(measurePage, PRODUCT_SEL);
    // the early tap: an inline error, nothing added
    let early = false;
    const posted = page.waitForRequest((r) => r.url().includes('/api/bag/sets') && r.method() === 'POST', { timeout: 1500 }).then(() => true, () => false);
    await page.locator(ctaOf(screen.phone)).first().click();
    const wentIn = await posted;
    if (!wentIn) early = (await page.locator('main [role="alert"]:visible, [data-testid="ca-err"]:visible, [data-testid="cb-size-err"]:visible, .size-pill-err:visible').count()) > 0;
    const ok = wentIn || (await playToBag(page, screen.phone, m, cfg.maxSteps, cfg.settleMs));
    return { ...m, added: ok, early, look, errors };
  } catch (e) {
    return { ...m, added: false, early: false, look: null, errors: [...errors, String(e).slice(0, 200)] };
  } finally {
    await ctx.close();
  }
}

async function categoryRun(browser, base, screen, tpl, s, cfg, next) {
  const ctx = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, isMobile: screen.phone, hasTouch: screen.phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  const m = { taps: 0, scrolls: 0, pages: 0 };
  try {
    await page.goto(new URL(withParam(s.path, 'tpl', tpl), base).toString(), { waitUntil: 'load' });
    await page.waitForTimeout(cfg.settleMs);
    const look = await page.evaluate(measurePage, CATEGORY_SEL);
    let ok = false;
    for (let hop = 0; hop < 3 && !ok; hop += 1) {
      // L4: the size and "Add both to bag" are on the first card itself (a pair with no size in common links to its page)
      const l4 = page.locator('[data-testid="ca-l4"]:visible').first();
      if ((await l4.count()) && (await l4.locator('[data-testid="ca-l4-add"]').count())) {
        await l4.evaluate((el) => el.setAttribute('data-matrix-card', '1'));
        ok = await playToBag(page, screen.phone, m, cfg.maxSteps, cfg.settleMs, '[data-matrix-card="1"]');
        break;
      }
      const card = page.locator('[data-testid="ca-card"]:visible, [data-testid="ca-l4"] a.ca-l4ph:visible').first();
      if (!(await card.count())) break;
      const before = page.url();
      await Promise.all([page.waitForURL((u) => u.toString() !== before, { timeout: 8000 }), tap(page, card, m)]);
      await page.waitForLoadState('load');
      await page.waitForTimeout(cfg.settleMs);
      m.pages += 1;
      const path = new URL(page.url()).pathname.replace(/^\/bn(?=\/)/, '');
      if (path.startsWith('/combo/')) {
        // the method: the category journey goes on in the pair page template `next` (P1), the same for every L
        await page.goto(withParam(page.url(), 'tpl', next), { waitUntil: 'load' });
        await page.locator(ctaOf(screen.phone)).first().waitFor({ timeout: 10000 });
        ok = await playToBag(page, screen.phone, m, cfg.maxSteps, cfg.settleMs);
      }
    }
    return { ...m, added: ok, look, errors };
  } catch (e) {
    return { ...m, added: false, look: null, errors: [...errors, String(e).slice(0, 200)] };
  } finally {
    await ctx.close();
  }
}

async function bagRun(browser, base, screen, tpl, fill, cfg) {
  const ctx = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, isMobile: screen.phone, hasTouch: screen.phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  const m = { taps: 0, scrolls: 0, pages: 0 };
  try {
    const r = await ctx.request.post(new URL(fill.fill, base).toString(), { headers: { origin: new URL(base).origin }, failOnStatusCode: false });
    if (!r.ok()) throw new Error(`fill ${fill.fill} answered ${r.status()} (EXTAS_SHOP_TEST_PAGES=1?)`);
    await page.goto(new URL(withParam('/bag', 'btpl', tpl), base).toString(), { waitUntil: 'load' });
    await page.waitForTimeout(cfg.settleMs);
    const look = await page.evaluate(measurePage, BAG_SEL);
    const facts = await page.evaluate(() => {
      const vh = window.innerHeight;
      const bar = document.querySelector('.bg-mbar:not(.bg-mbar-off)');
      const limit = bar && bar.getBoundingClientRect().height > 0 ? Math.min(vh, bar.getBoundingClientRect().top) : vh;
      const sets = [...document.querySelectorAll('[data-testid="bag-set"]')];
      const full = sets.filter((s) => {
        const b = s.getBoundingClientRect();
        return b.top >= 0 && b.bottom <= limit + 0.5;
      }).length;
      const total = document.querySelector('[data-testid="bag-total"]');
      const tb = total?.getBoundingClientRect();
      return {
        sets: sets.length,
        full,
        totalSeen: Boolean((tb && tb.top >= 0 && tb.bottom <= vh) || (bar && bar.textContent.trim())),
        total: total?.textContent ?? null,
        prices: sets.map((s) => s.querySelector('[data-testid="bag-set-price"]')?.textContent ?? null),
        features: sets.map((s) => ['[data-testid="bag-set-change"]', '[data-bag-act="save"]', '[data-bag-act="remove"]'].filter((q) => s.querySelector(q)).length / 3),
        px: sets.length ? sets.reduce((a, s) => a + s.getBoundingClientRect().height, 0) / sets.length : null,
      };
    });
    // change one piece's size: right in the bag when the template can, else the "Change size or colour" journey
    let changed = false;
    let inBag = false;
    const set = page.locator('[data-testid="bag-set"]').first();
    const sel = set.locator('[data-testid="bag-size-sel"]').first();
    if ((await sel.count()) > 0) {
      inBag = true;
      const closed = set.locator('xpath=self::details[not(@open)]');
      if (await closed.count()) await tap(page, set.locator('summary').first(), m);
      const was = await sel.inputValue();
      const to = (await sel.locator('option:not([disabled])').evaluateAll((os) => os.map((o) => o.value))).find((v) => v !== was);
      if (to) {
        const done = page.waitForResponse((x) => x.url().includes('/api/bag/sets') && x.request().method() === 'PATCH' && x.ok(), { timeout: 4000 }).then(() => true, () => false);
        if (!(await sel.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight;
        })))
          m.scrolls += 1;
        await sel.selectOption(to);
        m.taps += 2; // open the list, choose the size
        changed = await done;
        if (changed) {
          await page.waitForTimeout(cfg.settleMs * 2);
          const now = await page.locator('[data-testid="bag-set"]').first().locator('[data-testid="bag-size-sel"]').first().inputValue().catch(() => null);
          changed = now === to;
        }
      }
    } else if ((await set.locator('[data-testid="bag-set-change"]').count()) > 0) {
      m.taps += cfg.linkTaps;
      m.pages += 1;
      changed = true;
    }
    return { ...m, changed, inBag, look, facts, errors };
  } catch (e) {
    return { ...m, changed: false, inBag: false, look: null, facts: null, errors: [...errors, String(e).slice(0, 200)] };
  } finally {
    await ctx.close();
  }
}

const share = (flags) => (flags.length ? flags.filter(Boolean).length / flags.length : 0);

/** Runs `jobs` (async functions) `n` at a time, in order. */
async function pool(jobs, n) {
  const out = new Array(jobs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < jobs.length) {
        const k = i++;
        out[k] = await jobs[k]();
      }
    }),
  );
  return out;
}

export async function runMatrix({ base, only, cfg, browser }) {
  const runs = { product: [], category: [], bag: [] };
  const jobs = [];
  if (only.has('product'))
    for (const screen of cfg.screens)
      for (const s of cfg.product.sets)
        for (const tpl of cfg.product.templates)
          jobs.push(async () => {
            const r = await productRun(browser, base, screen, tpl, s, cfg);
            runs.product.push({ page: 'product', template: tpl, set: s.set, setLabel: s.label, screen: screen.name, phone: screen.phone, ...r });
          });
  if (only.has('category'))
    for (const screen of cfg.screens)
      for (const s of cfg.category.sets)
        for (const tpl of cfg.category.templates)
          jobs.push(async () => {
            const r = await categoryRun(browser, base, screen, tpl, s, cfg, cfg.category.next);
            runs.category.push({ page: 'category', template: tpl, set: s.set, setLabel: s.label, screen: screen.name, phone: screen.phone, ...r });
          });
  if (only.has('bag'))
    for (const screen of cfg.screens)
      for (const fill of cfg.bag.fills)
        for (const tpl of cfg.bag.templates)
          jobs.push(async () => {
            const r = await bagRun(browser, base, screen, tpl, fill, { ...cfg, linkTaps: cfg.bag.linkTaps });
            runs.bag.push({ page: 'bag', template: tpl, fill: fill.label, sets: fill.sets, screen: screen.name, phone: screen.phone, ...r });
          });
  await pool(jobs, cfg.concurrency ?? 4);
  return runs;
}

/** Scores the runs (pure: the tests feed it made-up runs). */
export function scoreRuns(runs) {
  const desktopAdded = new Map(runs.product.filter((r) => !r.phone).map((r) => [`${r.template}|${r.set}`, r.added]));
  const product = runs.product.map((r) => {
    const l = r.look ?? {};
    const s = scoreProduct({
      set: r.set,
      added: r.added,
      taps: r.taps,
      scrolls: r.scrolls,
      first: share(l.first ?? []),
      earlyError: r.early,
      jsErrors: r.errors.length,
      overflow: l.overflow,
      cut: l.cut,
      wrapped: l.wrapped,
      small: l.small,
      words: l.words,
      desktopAdded: desktopAdded.get(`${r.template}|${r.set}`) ?? false,
    });
    return { ...r, seconds: humanSeconds(r), ...s };
  });
  const category = runs.category.map((r) => {
    const l = r.look ?? {};
    const firstFlags = [...(l.first ?? []), (l.fullCards ?? 0) >= 2];
    const s = scoreCategory({ set: r.set, added: r.added, taps: r.taps, scrolls: r.scrolls, pages: r.pages, first: share(firstFlags), cards: l.cardsTwoScreens, jsErrors: r.errors.length, overflow: l.overflow, cut: l.cut, wrapped: l.wrapped, small: l.small, words: l.words });
    return { ...r, seconds: humanSeconds(r), ...s };
  });
  // the money never changes with the template: the bag's total and each set's price as in the current look
  const baseline = new Map(runs.bag.filter((r) => r.template === 'current' && r.facts).map((r) => [`${r.screen}|${r.fill}`, r.facts]));
  const bag = runs.bag.map((r) => {
    const l = r.look ?? {};
    const f = r.facts;
    const b = baseline.get(`${r.screen}|${r.fill}`);
    const sum = (xs) => xs.reduce((a, x) => a + (moneyOf(x) ?? 0), 0);
    const moneyOk = Boolean(f && b && moneyOf(f.total) !== null && moneyOf(f.total) === moneyOf(b.total) && sum(f.prices) === sum(b.prices) && f.prices.every((x) => moneyOf(x) !== null));
    const first = f ? (f.sets ? 0.7 * (f.full / f.sets) : 0) + (f.totalSeen ? 0.3 : 0) : 0;
    const s = scoreBag({ changed: r.changed, taps: r.taps, scrolls: r.scrolls, pages: r.pages, moneyOk, first, features: f ? f.features.reduce((a, x) => a + x, 0) / Math.max(1, f.features.length) : 0, overflow: l.overflow, cut: l.cut, wrapped: l.wrapped, small: l.small, pxPerSet: f?.px ?? null });
    return { ...r, moneyOk, seconds: humanSeconds(r), ...s };
  });
  return { product, category, bag, ranking: { product: rankTemplates(product), category: rankTemplates(category), bag: rankTemplates(bag) } };
}

// ---- the report ----
const NAMES = {
  current: 'Current look',
  L1: 'Pair grid',
  L2: 'Style cards',
  L3: 'Hub',
  L4: 'Big list',
  L5: '2 or 3 first',
  P1: 'Pair page',
  P2: 'Pick colours',
  P3: 'Top + bottom',
  P4: 'Mixed set',
  P5: 'Fixed pack',
  B1: 'Grouped card',
  B2: 'Size in the bag',
  B3: 'Add 1 more',
  B4: 'Price split',
  B5: 'Compact row',
};
const BN_NAMES = {
  current: 'এখনকার চেহারা',
  L1: 'জোড়ার গ্রিড',
  L2: 'স্টাইল কার্ড',
  L3: 'হাব',
  L4: 'বড় তালিকা',
  L5: '২ না ৩ আগে',
  P1: 'জোড়ার পাতা',
  P2: 'রং বাছুন',
  P3: 'উপর + নিচ',
  P4: 'মিক্সড সেট',
  P5: 'ঠিক করা প্যাক',
  B1: 'একটা কার্ড',
  B2: 'ব্যাগেই সাইজ',
  B3: 'আর ১টা',
  B4: 'দাম ভেঙে',
  B5: 'ছোট সারি',
};
const SETTING = { product: 'combos.template.page', category: 'combos.template.list', bag: 'combos.template.bag' };
const PAGE_BN = { category: 'ক্যাটাগরি পাতা', product: 'কম্বোর পাতা', bag: 'ব্যাগ' };
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

function table(kind, scored, rank, by) {
  const groups = [...new Set(scored.map(by))];
  const head = `| Template | ${groups.join(' | ')} | mean | lowest | taps (mean) | est. s | knock-outs |`;
  const line = `|---|${groups.map(() => '---').join('|')}|---|---|---|---|---|`;
  const rows = rank.map((r, i) => {
    const mine = scored.filter((x) => x.template === r.template);
    const cells = groups.map((g) => mean(mine.filter((x) => by(x) === g).map((x) => x.total)));
    const name = `${i === 0 ? '**' : ''}${r.template} ${NAMES[r.template] ?? ''}${i === 0 ? '**' : ''}`;
    return `| ${name} | ${cells.join(' | ')} | ${r.mean} | ${r.lowest} | ${mean(mine.map((x) => x.taps))} | ${mean(mine.map((x) => x.seconds))} | ${r.knockedOut} |`;
  });
  return [`### ${kind}`, '', head, line, ...rows, ''].join('\n');
}

function parts(scored, rank) {
  const keys = Object.keys(scored[0]?.parts ?? {});
  const head = `| Template | ${keys.join(' | ')} |`;
  const line = `|---|${keys.map(() => '---').join('|')}|`;
  const rows = rank.map((r) => {
    const mine = scored.filter((x) => x.template === r.template);
    return `| ${r.template} | ${keys.map((k) => mean(mine.map((x) => x.parts[k]))).join(' | ')} |`;
  });
  return [head, line, ...rows, ''].join('\n');
}

export function report(result, meta) {
  const r = result.ranking;
  const win = (k) => r[k][0];
  const bn = (k) => {
    const w = win(k);
    if (!w) return `- ${PAGE_BN[k]}: চালানো হয়নি।`;
    const rest = r[k].slice(1, 3).map((x) => `${x.template} ${x.mean}`).join(', ');
    return `- **${PAGE_BN[k]}: ${w.template} (${BN_NAMES[w.template] ?? ''}) — ${w.mean}/100।** এর পরে ${rest}। চালু করতে: অ্যাডমিন → কম্বো → দোকানের ডিফল্ট টেমপ্লেট (\`${SETTING[k]}\`)।`;
  };
  const runs = result.product.length + result.category.length + result.bag.length;
  const ko = [...result.product, ...result.category, ...result.bag].filter((x) => x.knockedOut);
  const money = result.bag.length ? (result.bag.every((x) => x.moneyOk) ? 'ব্যাগের টাকা সব ডিজাইনে এখনকার চেহারার সমান।' : 'ব্যাগের টাকা কোনো ডিজাইনে এখনকার চেহারার সাথে মেলেনি — নিচের তালিকা দেখুন।') : '';
  const lines = [
    '# Combo template matrix and ranking (PR 576)',
    '',
    `Generated by \`node tools/combo-matrix.mjs\` on ${meta.date} against ${meta.base} (sample data), commit ${meta.commit}. Method and weights: \`docs/owner/COMBO-RANKING.md\` §2, \`tools/combo-ranking.mjs\`. Runs: \`docs/qa/combo-ranking/latest.json\`. Matrix: \`docs/qa/combo-matrix.json\`.`,
    '',
    '## মালিকের জন্য সংক্ষেপে',
    '',
    `- আসল দোকানের (নমুনা ডেটা) প্রতিটা কম্বো ডিজাইন কাস্টমারের মতো চালিয়ে দেখা হয়েছে: ${meta.screens} স্ক্রিনে, মোট ${runs}টা পরীক্ষা। ${ko.length ? `${ko.length}টা পরীক্ষায় কাজ শেষ হয়নি (নিচে আছে)।` : 'একটাও আটকায়নি।'} ${money}`,
    bn('category'),
    bn('product'),
    bn('bag'),
    '- এখন দোকান "এখনকার চেহারা"-তেই আছে — কিছুই বদলানো হয়নি। উপরের বিজয়ী নিতে চাইলে শুধু ওই সেটিং বদলালেই হবে।',
    '',
    '## Ranking (score / 100, mean over sets and screens)',
    '',
    table('Category page', result.category, r.category, (x) => x.setLabel),
    parts(result.category, r.category),
    table('Product page', result.product, r.product, (x) => x.setLabel),
    parts(result.product, r.product),
    table('Bag', result.bag, r.bag, (x) => x.fill),
    parts(result.bag, r.bag),
    '## Knock-outs and errors',
    '',
    ...(ko.length ? ko.map((x) => `- ${x.page} ${x.template} · ${x.setLabel ?? x.fill} · ${x.screen}: ${x.errors.slice(0, 2).join(' | ') || 'did not reach the end of its journey'}`) : ['- none']),
    '',
    '## Limits',
    '',
    '- An agent, not people: the 5-second "what do you pay?" test and a tap test with real shoppers are still to do.',
    '- Chromium only (no WebKit here); the sample catalogue, not the owner\'s.',
    '- A bag template without a size in the bag counts the "Change size or colour" journey (pair page on the set\'s picks, its size, Update) instead of playing it.',
    "- Tap targets are counted at 44 px by their box: the current pair page's 34 px colour swatches count as small here, while the device gate's hit-area rule passes them (follow-up).",
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const base = args.base ?? 'http://127.0.0.1:3000';
  const out = resolve(root, args.out ?? 'docs/qa/combo-ranking');
  const only = new Set((args.only ?? 'product,category,bag').split(','));
  const cfg = JSON.parse(readFileSync(join(root, 'docs/qa/combo-matrix.json'), 'utf8'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const runs = await runMatrix({ base, only, cfg, browser });
  await browser.close();
  const result = scoreRuns(runs);
  const order = (xs) => [...xs].sort((a, b) => `${a.template}|${a.set ?? a.fill}|${a.screen}`.localeCompare(`${b.template}|${b.set ?? b.fill}|${b.screen}`));
  const meta = { date: new Date().toISOString().slice(0, 10), base, commit: args.commit ?? 'working tree', screens: cfg.screens.map((s) => `${s.width}×${s.height}`).join(', ') };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'latest.json'), JSON.stringify({ meta, ranking: result.ranking, runs: { product: order(result.product), category: order(result.category), bag: order(result.bag) } }, null, 1) + '\n');
  writeFileSync(join(root, 'docs/qa/COMBO-TEMPLATE-MATRIX.md'), report(result, meta));
  for (const k of ['category', 'product', 'bag']) if (result.ranking[k].length) console.log(`${k}: ${result.ranking[k].map((x) => `${x.template} ${x.mean}${x.knockedOut ? ` (${x.knockedOut} KO)` : ''}`).join(' · ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
