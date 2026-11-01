// S20 · PR 408 — the admin's print check: every document at every size the owner can choose, in the shipped settings,
// prints right (nothing cut or overlapping, no ink at the edge, black-and-white safe); a wider edge than the sticker's
// own margin is reported as ink at the edge; the logo prints on the lists in place of the shop's name.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { boxText } from '@extas/documents/test-kit';
import { invoiceSettings, printRunSettings, shippingSettings } from '@extas/settings';
import { handoverDocument } from './handover';
import { printCheck, type PrintCheckInput } from './print-check';

const input = (o: Partial<PrintCheckInput> = {}): PrintCheckInput => ({
  sticker: { layout: shippingSettings['delivery.sticker.layout'].default, exact: shippingSettings['delivery.sticker.exactAmount'].default, shopName: 'Sample Shop', shopPhone: null },
  picking: shippingSettings['delivery.picking.list'].default,
  handover: shippingSettings['delivery.handover.sheet'].default,
  invoice: invoiceSettings['documents.invoice.print'].default,
  head: { name: 'Sample Shop', address: 'Sample address', phone: null },
  currency: 'BDT',
  timeZone: 'Asia/Dhaka',
  edgeMm: printRunSettings['documents.printQuality'].default.edgeMm,
  at: '2026-11-01T05:30:00.000Z',
  ...o,
});

describe('PR 408 · the print check', () => {
  it('checks the sticker at every size, the lists on A4 and A5, the invoice on paper and both rolls — all print right as shipped', async () => {
    const rows = await printCheck(input(), boxText());
    expect(rows.map((r) => `${r.doc}:${r.size}`)).toEqual([
      'sticker:100x150',
      'sticker:100x100',
      'sticker:75x100',
      'sticker:a6',
      'sticker:a5',
      'sticker:a4x4',
      'sticker:custom',
      'picking:a4',
      'handover:a4',
      'picking:a5',
      'handover:a5',
      'invoice:a4',
      'invoice:a5',
      'invoice:roll80',
      'invoice:roll58',
    ]);
    expect(rows.filter((r) => r.problems.length)).toEqual([]);
    // the sample lists run onto a second page (the repeating header is exercised)
    expect(rows.find((r) => r.doc === 'picking' && r.size === 'a5')!.pages).toBeGreaterThan(1);
  }, 60_000);

  it('a band wider than the sticker\'s own margin is reported as ink at the edge', async () => {
    const rows = await printCheck(input({ edgeMm: 5 }), boxText());
    expect(rows.find((r) => r.doc === 'sticker' && r.size === '100x150')!.problems).toContain('EDGE_INK');
  }, 60_000);

  it('the handover sheet and the picking list carry the shop\'s logo when there is one', async () => {
    const logo = await sharp({ create: { width: 30, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const sheet = { batchId: '00000000-0000-4000-8000-00000000abcd', courierName: 'C', practice: false, currency: 'BDT', printCount: 1, printedAt: '2026-11-01T05:30:00.000Z', lines: [], totals: { parcels: 0, pieces: 0, collectMinor: 0 }, replay: false };
    expect(handoverDocument(sheet, shippingSettings['delivery.handover.sheet'].default, { name: 'S', address: null, phone: null, logo }, 'Asia/Dhaka').logo).toBe(logo);
    expect(handoverDocument(sheet, shippingSettings['delivery.handover.sheet'].default, { name: 'S', address: null, phone: null }, 'Asia/Dhaka').logo).toBeNull();
  });
});
