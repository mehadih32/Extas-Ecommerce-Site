// S02 · product page settings (PR 49–64): every key at version 19, the demo's defaults, and the limits.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { pdpGallerySchema, pdpRulesSchema, pdpStockSchema, pdpTrustSchema, productSettings } from '../src/registry-product';

describe('product page settings (v19)', () => {
  it('every product page key is in the registry at version 19, public, never owner data', () => {
    for (const [key, spec] of Object.entries(productSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(19);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
    }
  });

  it('CN-018: a line that makes a promise is off until the owner switches it on', () => {
    expect(productSettings['pdp.stock'].default.dispatchCutoff).toBeNull();
    expect(productSettings['pdp.rules'].default.trialLine).toBe(false);
    expect(productSettings['pdp.buy'].default.callToOrder).toBe(false);
    expect(productSettings['pdp.size'].default.notifyBack).toBe(false);
    expect(productSettings['pdp.trust'].default.items.find((i) => i.id === 'original')?.on).toBe(false);
  });

  it('zoom steps grow; the dispatch time is a clock time; ids are unique', () => {
    const g = productSettings['pdp.gallery'].default;
    expect(pdpGallerySchema.safeParse({ ...g, zoomSteps: [2, 1.5] }).success).toBe(false);
    expect(pdpGallerySchema.safeParse({ ...g, drawingViews: [] }).success).toBe(false);
    expect(pdpGallerySchema.safeParse({ ...g, desktopTrimPx: 201 }).success).toBe(false);
    expect(pdpGallerySchema.safeParse({ ...g, thumbsMax: 1 }).success).toBe(false);
    const s = productSettings['pdp.stock'].default;
    expect(pdpStockSchema.safeParse({ ...s, dispatchCutoff: '17:00' }).success).toBe(true);
    expect(pdpStockSchema.safeParse({ ...s, dispatchCutoff: '25:00' }).success).toBe(false);
    const t = productSettings['pdp.trust'].default;
    expect(pdpTrustSchema.safeParse({ ...t, items: [...t.items, t.items[0]] }).success).toBe(false);
    const r = productSettings['pdp.rules'].default;
    expect(pdpRulesSchema.safeParse({ ...r, cells: [r.cells[0], r.cells[0]] }).success).toBe(false);
  });
});
