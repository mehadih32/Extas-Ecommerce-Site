import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deviceList, filledPlan, firstScreenFor, markdownReport, openedPlan, pickLinks, shardOf, signedInPlan, urlList } from './device-gate.mjs';

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
    const rc = { ci: { collect: { url: ['http://127.0.0.1:3000/status', 'http://127.0.0.1:3000/admin/login?x=1', 'http://127.0.0.1:3000/status'] } } };
    expect(urlList('http://localhost:4000', rc)).toEqual(['http://localhost:4000/status', 'http://localhost:4000/admin/login?x=1']);
  });

  it('plans the signed-in run: lighthouserc paths, extra urls and discovered pages, each with its data-only controls', () => {
    const rc = ['http://127.0.0.1:3000/admin/login', 'http://127.0.0.1:3000/admin/products', 'http://127.0.0.1:3000/admin/stock'];
    const signedIn = {
      signedOutPaths: ['/admin/login'],
      urls: ['/admin/products/new', '/admin/products'],
      expect: { '/admin/stock': ['a.st-name'] },
    };
    const plan = signedInPlan('http://h:1', signedIn, rc, [{ path: '/admin/products/p1', expect: ['.pa-x', '.pa-kind'] }]);
    expect(plan.map((p) => new URL(p.url).pathname)).toEqual(['/admin/login', '/admin/products', '/admin/stock', '/admin/products/new', '/admin/products/p1']);
    expect(plan.find((p) => p.url.endsWith('/admin/login')).signedOut).toBe(true);
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

  it('the shipped signed-in config checks the controls of follow-up 5 on seeded pages', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const expected = [...Object.values(rules.signedIn.expect).flat(), ...rules.signedIn.discover.flatMap((d) => d.expect)];
    for (const sel of ['.pa-x', '.pa-col', '.pa-kind', '.sc-item', 'a.st-name']) expect(expected).toContain(sel);
    expect(rules.signedIn.discover.every((d) => d.required)).toBe(true);
    expect(rules.signedIn.signedOutPaths).toContain('/admin/login');
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
    const plan = openedPlan('http://h:1', rules.opened);
    expect(plan.map((p) => p.url)).toEqual(['http://h:1/?gate=opened', 'http://h:1/bn?gate=opened']);
    expect(plan.every((p) => p.signedOut && p.clicks[0] === 'button[data-act="open-menu"]' && p.clicks.includes('[data-testid="mn-acc"]'))).toBe(true);
    expect(plan[0].groups).toEqual(['phone', 'tablet']);
    expect(plan[0].maxWidth).toBe(1023);
    expect(plan[0].expect).toContain('[data-testid="mn-sub"]');
    expect(openedPlan('http://h:1', undefined)).toEqual([]);
    expect(openedPlan('http://h:1', [{ paths: ['/'] }])).toEqual([]);
    expect(openedPlan('http://h:1', { paths: ['/x'], clicks: ['b'] })).toEqual([{ url: 'http://h:1/x?gate=opened', signedOut: true, expect: [], clicks: ['b'] }]);
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

  it('reports PASS at 0 fails and lists every failure otherwise', () => {
    const ok = { device: 'p', group: 'phone', w: 360, h: 800, url: '/status', finalUrl: '/status', issues: [] };
    expect(markdownReport([ok], { base: 'b', seconds: 1 })).toMatch(/PASS — 0 fails in 1 device × page checks/);
    const bad = { ...ok, url: '/admin/x', finalUrl: '/admin/login', issues: [{ k: 'TAP-TOO-SMALL', d: 'chip 56×36' }] };
    const md = markdownReport([ok, bad], { base: 'b', seconds: 1 });
    expect(md).toMatch(/FAIL — 1 of 2/);
    expect(md).toContain('| p 360×800 | /admin/x → /admin/login | TAP-TOO-SMALL | chip 56×36 |');
  });
});
