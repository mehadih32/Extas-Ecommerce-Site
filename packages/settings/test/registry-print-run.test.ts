// S20 · PR 404 (registry v150): what one print run prints — at version 150, never owner data, labelled in both
// languages, and shipped as the stickers only (the print run as it was before the setting).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { printRunSchema, printRunSettings } from '../src/registry-print-run';

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
