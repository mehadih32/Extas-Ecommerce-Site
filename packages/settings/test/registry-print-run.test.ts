// S20 · PR 404 (registry v150): what one print run prints — at version 150, never owner data, labelled in both
// languages, and shipped as the stickers only (the print run as it was before the setting).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { handoverHistorySchema, invoiceDesignSchema, printQualitySchema, printRunSchema, printRunSettings } from '../src/registry-print-run';

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

describe('documents.printQuality setting (v152)', () => {
  const q = printRunSettings['documents.printQuality'];
  it('is in the registry at version 152, labelled in both languages, the logo on lists and a 2 mm edge as shipped', () => {
    expect(registry['documents.printQuality']).toBe(q);
    expect(q.version).toBe(152);
    for (const lang of ['en', 'bn'] as const) expect(lookup(messages[lang], q.helpKey!)).toBeTruthy();
    expect(q.default).toEqual({ logoOnLists: true, edgeMm: 2 });
    expect(printQualitySchema.safeParse({ logoOnLists: true, edgeMm: 6 }).success).toBe(false);
    expect(printQualitySchema.safeParse({ logoOnLists: false, edgeMm: 0 }).success).toBe(true);
  });
});

describe('documents.invoice.design setting (v153)', () => {
  const d = printRunSettings['documents.invoice.design'];
  it('is in the registry at version 153, labelled in both languages, classic as shipped, one of seven', () => {
    expect(registry['documents.invoice.design']).toBe(d);
    expect(d.version).toBe(153);
    for (const lang of ['en', 'bn'] as const) expect(lookup(messages[lang], d.helpKey!)).toBeTruthy();
    expect(d.default).toEqual({ design: 'classic' });
    expect(invoiceDesignSchema.safeParse({ design: 'cards' }).success).toBe(true);
    expect(invoiceDesignSchema.safeParse({ design: 'neon' }).success).toBe(false);
  });
});
