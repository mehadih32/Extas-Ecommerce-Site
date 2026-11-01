// S13 · PR 258 (registry v169): delivered-purchase optimisation — at version 169, never owner data, labelled in both
// languages, off as it ships with "purchase = the order placed" (PR 257's meaning), and every number bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { deliveredPurchaseSchema, ORDER_TRACKING_SOURCES, tickedSources, trackingSettings } from '../src/registry-tracking';

const spec = trackingSettings['ads.deliveredPurchase'];

describe('delivered-purchase setting (v169)', () => {
  it('is in the registry at version 169, store-level, labelled in English and Bengali', () => {
    expect(registry['ads.deliveredPurchase']).toBe(spec);
    expect(spec.version).toBe(169);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off, a purchase still meaning the order placed, only the shop’s own sources ticked', () => {
    expect(spec.default).toMatchObject({ on: false, purchaseMeans: 'placed' });
    expect(deliveredPurchaseSchema.safeParse(spec.default).success).toBe(true);
    expect(tickedSources(spec.default)).toEqual(['WEBSITE', 'LANDING_PAGE']);
    expect(Object.keys(spec.default.sources)).toEqual([...ORDER_TRACKING_SOURCES]);
  });

  it('refuses an unknown meaning, source or step, and numbers out of range', () => {
    const d = spec.default;
    expect(deliveredPurchaseSchema.safeParse({ ...d, purchaseMeans: 'paid' }).success).toBe(false);
    expect(deliveredPurchaseSchema.safeParse({ ...d, sources: { ...d.sources, POS: true } }).success).toBe(false);
    expect(deliveredPurchaseSchema.safeParse({ ...d, events: { ...d.events, refused: true } }).success).toBe(false);
    expect(deliveredPurchaseSchema.safeParse({ ...d, lookbackHours: 169 }).success).toBe(false);
    expect(deliveredPurchaseSchema.safeParse({ ...d, everyMinutes: 0 }).success).toBe(false);
    expect(deliveredPurchaseSchema.safeParse({ ...d, purchaseMeans: 'delivered', lookbackHours: 168, everyMinutes: 60 }).success).toBe(true);
  });
});
