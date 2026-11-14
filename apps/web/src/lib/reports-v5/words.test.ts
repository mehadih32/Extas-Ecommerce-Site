// S28 · PR 714-717 — the words of the four report pages: both languages say the same things, every word a page asks for exists,
// Bengali uses Western digits, and the menu, the guide map, the smoke list and the export route agree on the four pages.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import bn from '../../../messages/admin-reports-v5.bn.json';
import en from '../../../messages/admin-reports-v5.en.json';
import { t, type Dict } from '../i18n';
import { SHELL_SECTIONS } from '../admin-shell/sections';
import { EXPORT_KINDS, EXPORT_PERMISSION, exportRoute } from './export';

const flat = (o: unknown, p = ''): Record<string, string> =>
  Object.entries(o as Record<string, unknown>).reduce<Record<string, string>>((a, [k, v]) => (typeof v === 'string' ? { ...a, [`${p}${k}`]: v } : { ...a, ...flat(v, `${p}${k}.`) }), {});
const E = flat(en.reportsV5);
const B = flat(bn.reportsV5);
const DICT = { en: { reportsV5: en.reportsV5 } as unknown as Dict, bn: { reportsV5: bn.reportsV5 } as unknown as Dict };
/** What the screen would write: a word that is not found comes back as its own key. */
const says = (lang: 'en' | 'bn', key: string) => t(DICT[lang], `reportsV5.${key}`) !== `reportsV5.${key}`;
const ROOT = join(__dirname, '..', '..');
const PAGES = { profit: 'app/admin/reports/profit/page.tsx', products: 'app/admin/reports/products/page.tsx', marketing: 'app/admin/reports/marketing/page.tsx', review: 'app/admin/reports/review/page.tsx' } as const;

/** The report pages that are in the app (they are added one register PR at a time: 714, 715, 716, 717). */
const BUILT = (Object.keys(PAGES) as (keyof typeof PAGES)[]).filter((k) => existsSync(join(ROOT, PAGES[k])));

describe('words of the v5 reports', () => {
  it('both languages have the same keys and the same {placeholders}', () => {
    expect(Object.keys(B).sort()).toEqual(Object.keys(E).sort());
    for (const k of Object.keys(E)) expect((B[k]!.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((E[k]!.match(/\{\w+\}/g) ?? []).sort());
  });
  it('every word of the file is reachable by its dotted key (a key with a dot inside would not be)', () => {
    for (const k of Object.keys(E)) for (const l of ['en', 'bn'] as const) expect(says(l, k), `${l} ${k}`).toBe(true);
  });
  it('Bengali has Bengali letters and Western digits only', () => {
    for (const [k, v] of Object.entries(B)) {
      expect(v, k).not.toMatch(/[০-৯]/);
      if (!/^channel\./.test(k)) expect(v, k).toMatch(/[ঀ-৿]/);
    }
  });
  it('every word a page asks for exists', () => {
    for (const page of BUILT) {
      const src = readFileSync(join(ROOT, PAGES[page]), 'utf8');
      for (const m of src.matchAll(/\bc\('([A-Za-z0-9_.]+)'/g)) for (const l of ['en', 'bn'] as const) expect(says(l, `${page}.${m[1]}`), `${l} ${page}: c('${m[1]}')`).toBe(true);
      for (const m of src.matchAll(/\bcc\('([A-Za-z0-9_.]+)'/g)) for (const l of ['en', 'bn'] as const) expect(says(l, `common.${m[1]}`), `${l} ${page}: cc('${m[1]}')`).toBe(true);
    }
    const parts = readFileSync(join(ROOT, 'components/admin/reports/ReportBar.tsx'), 'utf8') + readFileSync(join(ROOT, 'components/admin/reports/ReportParts.tsx'), 'utf8');
    for (const m of parts.matchAll(/reportsV5\.common\.([A-Za-z0-9_.]+)'/g)) expect(says('en', `common.${m[1]}`), m[1]).toBe(true);
  });
  it('the review lines the rules can write all have words', () => {
    for (const k of ['salesUp', 'salesDown', 'profitUp', 'profitDown', 'loss', 'bestGroup', 'returnsDown', 'returnsUp', 'thinGroup', 'lowGroup', 'adsUnknown', 'uncosted', 'unsold', 'restock', 'unsoldNext', 'checkPrices', 'adsNext', 'costsNext']) for (const l of ['en', 'bn'] as const) expect(says(l, `review.line.${k}`), `${l} ${k}`).toBe(true);
  });
});

describe('the four pages in the menu, the guides, the smoke list and the export', () => {
  const reports = SHELL_SECTIONS.find((s) => s.id === 'reports')!;
  const tab = (id: string) => reports.tabs.find((x) => x.id === id)!;
  const ROUTES = { profit: ['profitReport', '/admin/reports/profit'], products: ['productsReport', '/admin/reports/products'], marketing: ['marketingReport', '/admin/reports/marketing'], review: ['monthlyReview', '/admin/reports/review'] } as const;
  it('at least one page is built, so the checks below are not empty', () => {
    expect(BUILT.length).toBeGreaterThan(0);
    expect(EXPORT_KINDS.length).toBe(Object.keys(PAGES).length);
  });
  it('each tab is in Reports with the page and the read key its export asks for', () => {
    for (const k of BUILT) {
      const [id, href] = ROUTES[k];
      const p = tab(id).pages[0]!;
      expect(p.href).toBe(href);
      expect(p.perm).toBe(EXPORT_PERMISSION[k]);
      expect(tab(id).more).toBeFalsy();
    }
  });
  it('each page has a guide entry, a smoke-test entry and a device-gate entry', () => {
    const help = JSON.parse(readFileSync(join(ROOT, 'lib/admin-shell/help-pages.json'), 'utf8')) as { pages: { id: string; route: string }[] };
    const smoke = JSON.parse(readFileSync(join(ROOT, '../../../docs/qa/smoke.json'), 'utf8')) as { admin: string[] };
    const gate = readFileSync(join(ROOT, '../../../docs/qa/device-gate.json'), 'utf8');
    for (const k of BUILT) {
      const href = ROUTES[k][1];
      expect(help.pages.some((x) => x.route === href && x.id === `reports/${k}`), href).toBe(true);
      expect(smoke.admin, href).toContain(href);
      expect(gate, href).toContain(`"${href}"`);
    }
  });
  it('the export refuses what it should before it reads anything', async () => {
    expect((await exportRoute('nope', new Request('https://x.test/api/admin/reports/export/nope'), null)).status).toBe(404);
    expect((await exportRoute('profit', new Request('https://x.test/api/admin/reports/export/profit', { method: 'POST' }), null)).status).toBe(405);
    expect((await exportRoute('profit', new Request('https://x.test/api/admin/reports/export/profit'), null)).status).toBe(503);
  });
});
