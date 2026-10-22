import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deviceList, markdownReport, pickLinks, signedInPlan, urlList } from './device-gate.mjs';

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

  it('the shipped signed-in config checks the controls of follow-up 5 on seeded pages', () => {
    const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/qa/device-gate.json'), 'utf8'));
    const expected = [...Object.values(rules.signedIn.expect).flat(), ...rules.signedIn.discover.flatMap((d) => d.expect)];
    for (const sel of ['.pa-x', '.pa-col', '.pa-kind', '.sc-item', 'a.st-name']) expect(expected).toContain(sel);
    expect(rules.signedIn.discover.every((d) => d.required)).toBe(true);
    expect(rules.signedIn.signedOutPaths).toContain('/admin/login');
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
