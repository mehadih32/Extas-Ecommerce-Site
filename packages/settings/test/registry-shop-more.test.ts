// S02 · the third storefront batch (PR 53, 67–71, 74, 75): every key at version 21, the demo's defaults, the limits,
// and CN-018 (what the demo does not do by default is off).
import { describe, expect, it } from 'vitest';
import { messages, lookup } from '../src/messages';
import { registry } from '../src/registry';
import { pdpFitSchema, pdpIconsSchema, pdpRowsSchema, shopMoreSettings } from '../src/registry-shop-more';

describe('third storefront batch settings (v21)', () => {
  it('every key is in the registry at version 21, public, never owner data, with both labels', () => {
    for (const [key, spec] of Object.entries(shopMoreSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(21);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${lang} ${key}`).toBeTruthy();
        if (spec.helpKey) expect(lookup(messages[lang], spec.helpKey), `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  it('PR 53: the first-screen budget is the demo PDP_FIT and refuses a floor above the ceiling', () => {
    const f = shopMoreSettings['pdp.fit'].default;
    expect(f).toMatchObject({ clearPx: 4.75, photoMinPx: 150, photoMinVh: 0.2, photoMaxPx: 500, photoMaxVh: 0.52, deepVh: 0.345 });
    expect(pdpFitSchema.safeParse({ ...f, photoMinVh: 0.6, photoMaxVh: 0.5 }).success).toBe(false);
    expect(pdpFitSchema.safeParse({ ...f, photoMinPx: 600, photoMaxPx: 400 }).success).toBe(false);
    expect(pdpFitSchema.safeParse({ ...f, clearPx: 30 }).success).toBe(false);
    expect(pdpFitSchema.safeParse({ ...f, extra: 1 }).success).toBe(false);
  });

  it('PR 67: the rows match the demo (two phone rows of 6, one desktop slider, a never-empty grid every 35 s)', () => {
    const r = shopMoreSettings['pdp.rows'].default;
    expect(r).toMatchObject({ pairs: true, pairRows: 2, perRow: 6, deskStyle: 'one', recent: true, recentMax: 6, deskGrid: true, swapSec: 35, pairTitle: null });
    expect(r.order.top[0]).toBe('trousers');
    expect(r.order.bottom[0]).toBe('polos');
    expect(pdpRowsSchema.safeParse({ ...r, recentMax: 12, recentKeep: 6 }).success).toBe(false);
    expect(pdpRowsSchema.safeParse({ ...r, order: { ...r.order, top: ['Not A Slug'] } }).success).toBe(false);
    expect(pdpRowsSchema.safeParse({ ...r, groupOf: { tee: 'middle' } }).success).toBe(false);
    expect(pdpRowsSchema.safeParse({ ...r, pairTitle: { en: 'Pair it with', bn: 'এর সাথে মানায়' } }).success).toBe(true);
  });

  it('PR 68: the floating rail is off, the heart after the title (demo SHOWN.pdpIcons); the drift is capped', () => {
    const i = shopMoreSettings['pdp.icons'].default;
    expect(i).toMatchObject({ panel: false, wish: 'title', whatsapp: false, driftMaxPx: 38 });
    expect(pdpIconsSchema.safeParse({ ...i, wish: 'photo' }).success).toBe(false);
    expect(pdpIconsSchema.safeParse({ ...i, driftMaxPx: 500 }).success).toBe(false);
  });

  it('PR 70: the floating WhatsApp disc is a switch, off (Note 3.1); never the home page, the product page or the bag when on', () => {
    const f = shopMoreSettings['shell.fab'].default;
    expect(f.on).toBe(false);
    expect(f.pages.home).toBe(false);
    expect(f.pages.product).toBe(false);
    expect(f.pages.bag).toBe(false);
    expect(f).toMatchObject({ side: 'right', place: 'low' });
    expect(shopMoreSettings['shell.fab'].group).toBe('shell');
  });
});
