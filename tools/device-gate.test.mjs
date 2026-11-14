import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boxChecks, deviceList, filledPlan, firstScreenFor, heroSettled, langCookieOf, markdownReport, navWordsSqueezed, openedPlan, phoneBarOutside, pickLinks, scriptsVerdict, shardOf, signedInPlan, signedOpenedPlan, urlList } from './device-gate.mjs';

// The browser part runs in CI's device-gate job (Playwright + Chromium); these are the pure parts.
const matrix = {
  PHONES: [{ name: 'p', w: 360, h: 800, group: 'phone', dpr: 3 }],
  TABLETS: [{ name: 't', w: 768, h: 1024, group: 'tablet', dpr: 2 }],
};

describe('device gate', () => {
  it('lists phones and tablets with touch, the C1 desktop widths without', () => {
    const all = deviceList('all', matrix);
    expect(all.filter((d) => d.touch).map((d) => d.name)).toEqual(['p', 't']);
    const desktop = all.filter((d) => d.group === 'desktop');
    expect(desktop.map((d) => d.w)).toEqual([1024, 1280, 1366, 1440, 1536, 1920]);
    expect(desktop.every((d) => !d.touch && d.dpr === 1)).toBe(true);
    expect(deviceList('phones', matrix)).toHaveLength(1);
    expect(() => deviceList('watches', matrix)).toThrow(/unknown group/);
  });

  it('PR 17 (CN-023) · splits the sizes round-robin into shards that together are every size, once', () => {
    const all = deviceList('all', matrix);
    expect(shardOf(all, '')).toBe(all);
    const parts = [1, 2, 3].map((k) => shardOf(all, `${k}/3`));
    expect(parts.map((p) => p.length)).toEqual([3, 3, 2]);
    expect(parts.flat().map((d) => d.name).sort()).toEqual(all.map((d) => d.name).sort());
    expect(parts[0].map((d) => d.name)).toEqual([all[0].name, all[3].name, all[6].name]);
    for (const bad of ['0/3', '4/3', '1/0', 'x', '1-2']) expect(() => shardOf(all, bad)).toThrow(/--shard/);
  });

  it('takes the lighthouserc URLs onto the base, once each', () => {
    const rc = { ci: { collect: { url: ['http://127.0.0.1:3000/status', 'http://127.0.0.1:3000/access?x=1', 'http://127.0.0.1:3000/status'] } } };
    expect(urlList('http://localhost:4000', rc)).toEqual(['http://localhost:4000/status', 'http://localhost:4000/access?x=1']);
  });

  it('plans the signed-in run: lighthouserc paths, extra urls and discovered pages, each with its data-only controls', () => {
    const rc = ['http://127.0.0.1:3000/access', 'http://127.0.0.1:3000/admin/products', 'http://127.0.0.1:3000/admin/stock'];
    const signedIn = {
      signedOutPaths: ['/access'],
      urls: ['/admin/products/new', '/admin/products'],
      expect: { '/admin/stock': ['a.st-name'] },
    };
    const plan = signedInPlan('http://h:1', signedIn, rc, [{ path: '/admin/products/p1', expect: ['.pa-x', '.pa-kind'] }]);
    expect(plan.map((p) => new URL(p.url).pathname)).toEqual(['/access', '/admin/products', '/admin/stock', '/admin/products/new', '/admin/products/p1']);
    expect(plan.find((p) => p.url.endsWith('/access')).signedOut).toBe(true);
    expect(plan.filter((p) => p.signedOut)).toHaveLength(1);
    expect(plan.find((p) => p.url.endsWith('/admin/stock')).expect).toEqual(['a.st-name']);
    expect(plan.find((p) => p.url.endsWith('/admin/products/p1')).expect).toEqual(['.pa-x', '.pa-kind']);
  });

  it('PR 100 · a page whose query changes it (?try=1) takes its own control list, not the plain path\'s', () => {
    const signedIn = { urls: ['/combos/build-your-own', '/combos/build-your-own?try=1'], expect: { '/combos/build-your-own': ['.off'], '/combos/build-your-own?try=1': ['.on'] } };
    const plan = signedInPlan('http://h:1', signedIn, []);
    expect(plan.find((p) => p.url.endsWith('/combos/build-your-own')).expect).toEqual(['.off']);
    expect(plan.find((p) => p.url.endsWith('?try=1')).expect).toEqual(['.on']);
  });

  it('a page opened with a query takes the controls listed with that query, else those of its bare path (PR 572)', () => {
    const rc = ['http://h:1/combos/r', 'http://h:1/combos/r?tpl=L4', 'http://h:1/combos/r?tpl=L3'];
    const signedIn = { expect: { '/combos/r': ['.ca-card'], '/combos/r?tpl=L4': ['.ca-l4'] } };
    const plan = signedInPlan('http://h:1', signedIn, rc);
    expect(plan.map((p) => p.expect)).toEqual([['.ca-card'], ['.ca-l4'], ['.ca-card']]);
  });

  it('the shipped signed-in config checks the controls of follow-up 5 on seeded pages', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const expected = [...Object.values(rules.signedIn.expect).flat(), ...rules.signedIn.discover.flatMap((d) => d.expect)];
    for (const sel of ['.pa-x', '.pa-col', '.pa-kind', '.sc-item', 'a.st-name']) expect(expected).toContain(sel);
    expect(rules.signedIn.discover.every((d) => d.required)).toBe(true);
    expect(rules.signedIn.signedOutPaths).toContain('/access');
  });

  it('PR 107 · plans the filled bag: opened signed out after the fill, apart from the empty bag, its lines expected', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const plan = filledPlan('http://h:1', rules.filled);
    // PR 71: the wishlist is filled too; follow-up 59: pages drawn with the sample contact (the header's WhatsApp)
    expect(plan.slice(0, 4).map((p) => p.url)).toEqual([
      'http://h:1/bag?gate=filled',
      'http://h:1/bn/bag?gate=filled',
      'http://h:1/account/wishlist?gate=filled',
      'http://h:1/bn/account/wishlist?gate=filled',
    ]);
    const contact = plan.filter((p) => p.fill === 'http://h:1/api/shop/try-contact');
    expect(contact.map((p) => new URL(p.url).pathname)).toEqual(expect.arrayContaining(['/', '/p/essential-pique-polo', '/checkout/thanks/0']));
    expect(contact.every((p) => p.expect.includes('[data-testid="hdr-wa"]'))).toBe(true);
    expect(plan.slice(0, 2).every((p) => p.signedOut && p.fill === 'http://h:1/api/bag/try')).toBe(true);
    expect(plan.slice(2, 4).every((p) => p.signedOut && p.fill === 'http://h:1/api/wishlist/try')).toBe(true);
    expect(plan[0].expect).toContain('.bg-line');
    expect(plan[2].expect).toContain('[data-testid="wish-item"]');
    expect(filledPlan('http://h:1', undefined)).toEqual([]);
    // one fill, as before PR 71
    expect(filledPlan('http://h:1', rules.filled[0]).map((p) => p.url)).toEqual(['http://h:1/bag?gate=filled', 'http://h:1/bn/bag?gate=filled']);
    // follow-up 260: a filled page may be measured with something opened on it (the order page's edit form)
    const opened = filledPlan('http://h:1', { fill: '/api/account/try-cards', paths: ['/account/orders/TRY-146?cards=1'], expect: ['#x'], clicks: ['[data-testid="order-edit-open"]'] });
    expect(opened).toEqual([{ url: 'http://h:1/account/orders/TRY-146?cards=1&gate=filled', signedOut: true, expect: ['#x'], fill: 'http://h:1/api/account/try-cards', clicks: ['[data-testid="order-edit-open"]'] }]);
    expect(filledPlan('http://h:1', rules.filled[0]).every((p) => !('clicks' in p))).toBe(true);
    const rc = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lighthouserc.json'), 'utf8')).ci.collect.url.map((u) => new URL(u).pathname);
    for (const p of ['/bag', '/bn/bag']) expect(rc).toContain(p);
  });

  it('follow-up 75 · plans the phone menu opened with its sub-categories, on phones and tablets only', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const plan = openedPlan('http://h:1', rules.opened).filter((p) => p.clicks[0] === 'button[data-act="open-menu"]');
    expect(plan.map((p) => p.url)).toEqual(['http://h:1/?gate=opened', 'http://h:1/bn?gate=opened']);
    expect(plan.every((p) => p.signedOut && p.clicks[0] === 'button[data-act="open-menu"]' && p.clicks.includes('[data-testid="mn-acc"]'))).toBe(true);
    expect(plan[0].groups).toEqual(['phone', 'tablet']);
    expect(plan[0].maxWidth).toBe(1023);
    expect(plan[0].expect).toContain('[data-testid="mn-sub"]');
    expect(openedPlan('http://h:1', undefined)).toEqual([]);
    expect(openedPlan('http://h:1', [{ paths: ['/'] }])).toEqual([]);
    expect(openedPlan('http://h:1', { paths: ['/x'], clicks: ['b'] })).toEqual([{ url: 'http://h:1/x?gate=opened', signedOut: true, expect: [], clicks: ['b'] }]);
  });

  it('follow-up 155 · plans the size guide window opened from the footer and from its page, every width, waiting for its data', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const plan = openedPlan('http://h:1', rules.opened).filter((p) => p.expect.includes('[data-testid="size-guide-modal"]'));
    expect(plan.map((p) => p.url)).toEqual([
      'http://h:1/collections/polos?gate=opened',
      'http://h:1/bn/collections/polos?gate=opened',
      'http://h:1/help/size-guide?gate=opened',
      'http://h:1/bn/help/size-guide?gate=opened',
    ]);
    expect(plan.every((p) => !p.groups && !p.maxWidth)).toBe(true);
    expect(new Set(openedPlan('http://h:1', rules.opened).map((p) => p.url)).size).toBe(openedPlan('http://h:1', rules.opened).length);
    expect(rules.openWaitMs).toBeGreaterThan(rules.settleMs);
  });

  it('qa-gate I1 (PR 621) · plans the admin forms opened in place, signed in, once per admin language', () => {
    const entry = { paths: ['/admin/x?storeId=2'], clicks: ['[data-testid="f"]'], expect: ['[data-testid="f-panel"]'], langs: ['en', 'bn'], groups: ['phone'], maxWidth: 430 };
    const plan = signedOpenedPlan('http://h:1', [entry]);
    expect(plan.map((p) => p.url)).toEqual(['http://h:1/admin/x?storeId=2&gate=opened-en', 'http://h:1/admin/x?storeId=2&gate=opened-bn']);
    expect(plan.map((p) => p.lang)).toEqual(['en', 'bn']);
    expect(plan.every((p) => !p.signedOut && p.clicks[0] === '[data-testid="f"]' && p.expect[0] === '[data-testid="f-panel"]' && p.groups[0] === 'phone' && p.maxWidth === 430)).toBe(true);
    // no languages named: the admin's own language, once
    expect(signedOpenedPlan('http://h:1', { paths: ['/admin/y'], clicks: ['b'] })).toEqual([{ url: 'http://h:1/admin/y?gate=opened', signedOut: false, expect: [], clicks: ['b'], lang: null }]);
    expect(signedOpenedPlan('http://h:1', undefined)).toEqual([]);
    expect(signedOpenedPlan('http://h:1', [{ paths: ['/admin/z'] }])).toEqual([]);
  });

  it('qa-gate I1 (PR 621) · the language cookie is the admin`s own (name and path from the config), on the gate`s host', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const shell = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../apps/web/src/lib/admin-nav.ts'), 'utf8');
    expect(shell).toContain(`ADMIN_LANG_COOKIE = '${rules.signedIn.langCookie.name}'`);
    expect(langCookieOf(rules.signedIn.langCookie, 'http://127.0.0.1:3000', 'bn')).toEqual({ name: rules.signedIn.langCookie.name, value: 'bn', domain: '127.0.0.1', path: rules.signedIn.langCookie.path, sameSite: 'Lax' });
    expect(langCookieOf(rules.signedIn.langCookie, 'http://127.0.0.1:3000', null)).toBeNull();
    expect(langCookieOf(undefined, 'http://127.0.0.1:3000', 'bn')).toBeNull();
  });

  it('qa-gate I1 (PR 621) · the shipped config opens the v6 sample store`s ERP forms and its hold notice, in English and Bengali', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const opened = rules.signedIn.opened;
    const plan = signedOpenedPlan('http://h:1', opened);
    const clicks = plan.flatMap((p) => p.clicks);
    for (const id of ['books-adjust', 'books-note', 'books-run', 'books-pin-set', 'books-month-close', 'books-pay']) expect(clicks).toContain(`[data-testid="${id}"]`);
    // F1: Differences with "Put right" opened, measured on phones from 320 px in both languages
    const diff = plan.filter((p) => p.url.includes('/admin/money/books/differences'));
    expect(diff.map((p) => p.lang).sort()).toEqual(['bn', 'en']);
    expect(diff.every((p) => p.expect.includes('[data-testid="books-adjust-panel"]') && !p.groups && !p.maxWidth)).toBe(true);
    // the hold notice of the sample store is on
    expect(plan.flatMap((p) => p.expect)).toContain('[data-testid="books-hold"][data-hold="on"]');
    // every entry is the v6 sample store's (data/sample-erp-v6.json, seeded in CI only) and expects what it opened
    for (const p of plan) {
      expect(new URL(p.url).searchParams.get('storeId')).toBe(String(rules.signedIn.v6SampleStoreId));
      for (const c of p.clicks) expect(p.expect).toContain(c.replace(/"\]$/, '-panel"]'));
    }
    const ci = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../.github/actions/seeded-app/action.yml'), 'utf8');
    expect(ci).toMatch(/pnpm --filter @extas\/combos sample\n\s+pnpm --filter @extas\/inventory sample:v6/);
  });

  it('PR 53 · checks the first screen of every product page: the sizes above the bar on phones, the buy buttons on desktops', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const fs = rules.firstScreen;
    const phone = { group: 'phone' };
    const desk = { group: 'desktop' };
    for (const p of ['/p/essential-pique-polo', '/bn/p/essential-pique-polo', '/p/essential-pique-polo/navy']) {
      expect(firstScreenFor(`http://h:1${p}`, phone, fs)).toMatchObject({ phone: true, blocks: ['.pdp-pills', '.pdp-fitline'], bar: '.pdp-mbar' });
      expect(firstScreenFor(`http://h:1${p}`, desk, fs)).toMatchObject({ phone: false, tap: null });
    }
    expect(firstScreenFor('http://h:1/p/x', phone, fs).tap).toMatch(/size-pill:not\(\.out\)/);
    expect(firstScreenFor('http://h:1/p/x', desk, fs).buy).toContain('[data-testid="order-now"]');
    expect(firstScreenFor('http://h:1/p/x', { group: 'tablet' }, fs)).toBeNull();
    // a phone waits for the budget's mark before measuring; a desktop has no budget to wait for
    expect(firstScreenFor('http://h:1/p/x', phone, fs).ready).toBe('.pdp-page[data-fit-anchor]');
    expect(firstScreenFor('http://h:1/p/x', desk, fs).ready).toBeNull();
    for (const p of ['/', '/bag', '/collections/polos', '/admin/products/p1']) expect(firstScreenFor(`http://h:1${p}`, phone, fs)).toBeNull();
    expect(firstScreenFor('http://h:1/p/x', phone, undefined)).toBeNull();
    // every garment kind of the sample shop is measured: categories are opened and their first product taken
    const from = rules.signedIn.discover.map((d) => d.from);
    for (const c of ['shirts', 'panjabi', 'hoodies']) expect(from).toContain(`/collections/${c}`);
  });

  it('picks distinct same-site links from a page, the first N', () => {
    expect(pickLinks(['/admin/products/a?x=1', '/admin/products/a', '//evil.test/x', 'https://x.test/y', '/admin/products/b', '/admin/products/c'], 2)).toEqual(['/admin/products/a', '/admin/products/b']);
    expect(pickLinks([], 3)).toEqual([]);
  });

  it('PR 85 follow-up · a shop page whose scripts never ran is NO-SCRIPTS, not measured; a slow one ("pending") is measured', () => {
    expect(scriptsVerdict(true, null)).toMatchObject({ k: 'NO-SCRIPTS' });
    expect(scriptsVerdict(true, 'pending')).toBeNull();
    expect(scriptsVerdict(true, 'done')).toBeNull();
    expect(scriptsVerdict(false, null)).toBeNull();
  });

  it('PR 85 follow-up · the dev server lets a page opened at 127.0.0.1 run its scripts (local gate runs)', () => {
    const cfg = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../apps/web/next.config.ts'), 'utf8');
    expect(cfg).toMatch(/allowedDevOrigins:\s*\[[^\]]*'127\.0\.0\.1'/);
  });

  it('reports PASS at 0 fails and lists every failure otherwise', () => {
    const ok = { device: 'p', group: 'phone', w: 360, h: 800, url: '/status', finalUrl: '/status', issues: [] };
    expect(markdownReport([ok], { base: 'b', seconds: 1 })).toMatch(/PASS — 0 fails in 1 device × page checks/);
    const bad = { ...ok, url: '/admin/x', finalUrl: '/access', issues: [{ k: 'TAP-TOO-SMALL', d: 'chip 56×36' }] };
    const md = markdownReport([ok, bad], { base: 'b', seconds: 1 });
    expect(md).toMatch(/FAIL — 1 of 2/);
    expect(md).toContain('| p 360×800 | /admin/x → /access | TAP-TOO-SMALL | chip 56×36 |');
  });
});

describe('follow-up 46 · the hero pins are measured after the slider fitted them', () => {
  const doc = (marks) => ({ querySelectorAll: () => marks.map((m) => ({ getAttribute: () => m })) });
  it('waits while a hero slider has not marked its fit, and passes a page with no hero', () => {
    expect(heroSettled(doc([]))).toBe(true);
    expect(heroSettled(doc(['done']))).toBe(true);
    expect(heroSettled(doc([null]))).toBe(false);
    expect(heroSettled(doc(['done', null]))).toBe(false);
  });
});

describe('PR 40 follow-up · a computer nav item is never narrower than its words', () => {
  const item = (text, box, words, hidden = false) => ({ text, box, words, hidden, textContent: ` ${text} `, getBoundingClientRect: () => ({ width: box }) });
  const doc = (items) => ({
    querySelectorAll: () => items,
    createRange: () => {
      let on = null;
      return { selectNodeContents: (a) => (on = a), getBoundingClientRect: () => ({ width: on.words }) };
    },
  });
  it('fails an item squeezed under its words, passes whole ones, hidden ones and a pixel of rounding', () => {
    expect(navWordsSqueezed(doc([item('New in', 42, 41.5), item('Polos', 45, 45.8), item('More', 0, 30), item('Sets', 32, 40, true)]))).toEqual([]);
    expect(navWordsSqueezed(doc([item('T-Shirts', 32, 52), item('Shirts', 37, 37)]))).toEqual([{ k: 'NAV-WORDS-SQUEEZED', d: 'T-Shirts 32<52' }]);
  });

  it('follow-up of PR 505 · boxes: a listed part past the screen or wider than its box, and a listed tap box under 44 px', () => {
    const el = (right, w, h, sw = w) => ({ getBoundingClientRect: () => ({ right, width: w, height: h }), scrollWidth: sw, clientWidth: w });
    const doc = (map) => ({ querySelectorAll: (sel) => map[sel] ?? [] });
    const d = doc({ '.pill': [el(300, 280, 20), el(360, 344, 20), el(0, 0, 0)], '.wide': [el(200, 100, 20, 140)], '.tick': [el(40, 44, 44), el(30, 18, 18)] });
    expect(boxChecks({ inside: ['.pill', '.wide'], tap44: ['.tick'] }, d, 320)).toEqual([
      { k: 'PAST-THE-EDGE', d: '.pill 360>320, .wide 200>320' },
      { k: 'OWN-TAP-UNDER-44', d: '.tick 18×18' },
    ]);
    // a desktop size checks no taps; a page that keeps its parts whole passes
    expect(boxChecks({ inside: ['.pill'], tap44: ['.tick'], taps: false }, doc({ '.pill': [el(300, 280, 20)], '.tick': [el(30, 18, 18)] }), 320)).toEqual([]);
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    expect(rules.boxes['/admin/messages/journey'].inside).toContain('[data-testid="journey-channels"] .a2-pill');
    expect(rules.signedIn.urls).toContain('/admin/messages/journey');
  });
});

describe('PR 626 follow-up · the phone bottom bar', () => {
  const page = (bar) => ({
    querySelector: (sel) => (sel === '[data-testid="lm-bar"]' && bar ? { getBoundingClientRect: () => ({ left: bar.l, right: bar.r, width: bar.r - bar.l, height: bar.h ?? 64 }) } : null),
    defaultView: { getComputedStyle: () => ({ contain: bar?.contain ?? '' }) },
  });
  it('passes a bar inside the phone that clips what it holds, and a page without one or with it hidden', () => {
    expect(phoneBarOutside(320, page({ l: 10, r: 310, contain: 'layout paint' }))).toEqual([]);
    expect(phoneBarOutside(320, page({ l: 10, r: 310.4, contain: 'strict' }))).toEqual([]);
    expect(phoneBarOutside(320, page(null))).toEqual([]);
    expect(phoneBarOutside(1366, page({ l: 0, r: 0, h: 0 }))).toEqual([]);
  });
  it('fails a bar past the phone\'s edge (the 320 px phone with the Orders badge) and one that lets its contents out', () => {
    expect(phoneBarOutside(320, page({ l: 10, r: 331, contain: 'layout paint' }))).toEqual([{ k: 'PHONE-BAR-OUTSIDE', d: 'the bar spans 10–331 px on a 320 px phone' }]);
    expect(phoneBarOutside(320, page({ l: 10, r: 310, contain: 'none' }))).toEqual([{ k: 'PHONE-BAR-OUTSIDE', d: 'it does not clip what it holds (contain: none)' }]);
    expect(phoneBarOutside(320, page({ l: 10, r: 310, contain: 'layout' }))[0].k).toBe('PHONE-BAR-OUTSIDE');
  });
});
