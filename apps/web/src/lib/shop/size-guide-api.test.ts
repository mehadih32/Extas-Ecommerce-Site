// Follow-up 155 — GET /api/shop/size-guide (lib/shop/size-guide-api).
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { guideWords, sizeGuideHandler, type GuideDeps, type SizeGuideAnswer } from './size-guide-api';
import type { GuideEntry } from './size-guide';

const entry = (slug: string, finds: boolean): GuideEntry => ({
  slug,
  name: slug,
  garment: 'polo',
  bottom: false,
  href: `/collections/${slug}`,
  chart: { name: 'C', fields: [{ key: 'chest', label: 'Chest', howTo: null }], rows: [{ size: 'M', inch: [40], cm: [102] }], easeInch: 4 },
  labels: { M: 'M' },
  finds,
});
const finder = registry['pdp.finder'].default;
const deps = (on = true, asked: string[] = []): GuideDeps => ({
  data: async (_s, lang) => {
    asked.push(lang);
    return { entries: [entry('polos', true), entry('caps', false)], finder: { ...finder, on } };
  },
  context: async () => ({ t: (k) => `[${k}]`, bnDigits: true }),
});
const get = (q = '') => new Request(`http://shop.test/api/shop/size-guide${q}`);

describe('the size guide window`s answer (follow-up 155)', () => {
  it('gives the categories the finder can answer for, the rules, the digits and the words, in the asked language', async () => {
    const asked: string[] = [];
    const r = await sizeGuideHandler(get('?lang=bn'), 2, deps(true, asked));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const a = (await r.json()) as SizeGuideAnswer;
    expect(asked).toEqual(['bn']);
    expect(a).toMatchObject({ ok: true, lang: 'bn', bnDigits: true });
    expect(a.entries.map((e) => e.slug)).toEqual(['polos']);
    expect(a.finder?.holdMs).toBe(finder.holdMs);
    expect(a.words['finder.title']).toBe('[finder.title]');
    expect(a.words['sizeGuide.pick']).toBe('[sizeGuide.pick]');
    expect(a.words['pdp.cm']).toBe('[pdp.cm]');
  });

  it('with Find My Size off: no finder and nothing to offer (the link goes to the size guide page)', async () => {
    const a = (await (await sizeGuideHandler(get(), 2, deps(false))).json()) as SizeGuideAnswer;
    expect(a.finder).toBeNull();
    expect(a.entries).toEqual([]);
    expect(a.lang).toBe('en');
    expect(a.bnDigits).toBe(false); // an English page keeps Western digits
  });

  it('an unknown language is English; only GET; a failed read answers 503', async () => {
    const asked: string[] = [];
    await sizeGuideHandler(get('?lang=fr'), 2, deps(true, asked));
    expect(asked).toEqual(['en']);
    expect((await sizeGuideHandler(new Request('http://shop.test/api/shop/size-guide', { method: 'POST' }), 2, deps())).status).toBe(405);
    const broken: GuideDeps = { ...deps(), data: async () => Promise.reject(new Error('down')) };
    expect((await sizeGuideHandler(get(), 2, broken)).status).toBe(503);
  });

  it('carries Find My Size`s words but not the T3 card`s', () => {
    const w = guideWords((k) => k);
    expect(Object.keys(w)).toContain('finder.why.covers');
    expect(Object.keys(w).some((k) => k.startsWith('finder.t3.'))).toBe(false);
    expect(Object.keys(w)).toContain('sizeGuide.shop');
  });
});
