// S20 · PR 404 (registry v150): what one print run prints — at version 150, never owner data, labelled in both
// languages, and shipped as the stickers only (the print run as it was before the setting).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { handoverHistorySchema, printRunSchema, printRunSettings } from '../src/registry-print-run';

const spec = printRunSettings['fulfilment.printRun'];

describe('fulfilment.printRun setting (v150)', () => {
  it('is in the registry at version 150, store-level, labelled in English and Bengali', () => {
    expect(registry['fulfilment.printRun']).toBe(spec);
    expect(spec.version).toBe(150);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships the stickers only, invoices on paper; refuses anything else', () => {
    expect(spec.default).toEqual({ what: 'sticker', invoiceLayout: 'page' });
    expect(printRunSchema.safeParse({ what: 'both', invoiceLayout: 'roll' }).success).toBe(true);
    expect(printRunSchema.safeParse({ what: 'slip', invoiceLayout: 'page' }).success).toBe(false);
    expect(printRunSchema.safeParse({ what: 'sticker', invoiceLayout: 'page', extra: 1 }).success).toBe(false);
  });
});

describe('fulfilment.handover.history setting (v151)', () => {
  const h = printRunSettings['fulfilment.handover.history'];
  it('is in the registry at version 151, labelled in both languages, a week and ten per courier as shipped', () => {
    expect(registry['fulfilment.handover.history']).toBe(h);
    expect(h.version).toBe(151);
    expect(h.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) expect(lookup(messages[lang], h.labelKey)).toBeTruthy();
    expect(h.default).toEqual({ days: 7, perCourier: 10 });
    expect(handoverHistorySchema.safeParse({ days: 0, perCourier: 10 }).success).toBe(false);
    expect(handoverHistorySchema.safeParse({ days: 91, perCourier: 10 }).success).toBe(false);
  });
});
