// S20 · PR 407 (registry v63): the printed invoice, its chat picture and issuing — version 63 in the Orders group, never
// owner data, labelled in both languages, defaults valid. The chat copy is a JPG picture by default (§59 answer 45) and
// every placed order gets its invoice (B2.1 locked).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { invoiceImageSchema, invoiceIssueSchema, invoicePrintSchema, invoiceSettings } from '../src/registry-invoice';

describe('invoice settings (v63)', () => {
  it('every key is in the registry at version 63 in the Orders group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(invoiceSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(63);
      expect(spec.group, key).toBe('orders');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('prints on A4 or an 80 mm roll with the courier barcode; only the offered sizes and printers', () => {
    const p = invoiceSettings['documents.invoice.print'].default;
    expect(p).toMatchObject({ paper: 'a4', roll: 'roll80', barcode: true });
    expect(invoicePrintSchema.safeParse({ ...p, paper: 'letter' }).success).toBe(false);
    expect(invoicePrintSchema.safeParse({ ...p, dpi: 72 }).success).toBe(false);
    expect(invoicePrintSchema.safeParse({ ...p, maxPerPdf: 0 }).success).toBe(false);
  });

  it('the chat copy is a picture by default; issuing is on and paced', () => {
    expect(invoiceSettings['documents.invoice.image'].default.format).toBe('jpg');
    expect(invoiceImageSchema.safeParse({ format: 'png', widthPx: 1240, quality: 85 }).success).toBe(false);
    expect(invoiceSettings['documents.invoice.issue'].default.enabled).toBe(true);
    expect(invoiceIssueSchema.safeParse({ enabled: true, everyMinutes: 0, perRun: 10 }).success).toBe(false);
  });
});
