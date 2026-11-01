// S08 · PR 180 — the rider's handover sheet as the paper list's data, and as a real PDF: the letterhead, the courier
// in the title, one ticked line per parcel with its consignment id and the amount to collect, the total, the signature
// lines and the receiver's name only when the owner wants them, the reprint and practice marks, in both languages.
import { describe, expect, it } from 'vitest';
import { shippingSettings } from '@extas/settings';
import type { HandoverSheet } from '@extas/shipping';
import { boxText, readPdf } from '@extas/documents/test-kit';
import { handoverDocument, handoverPdf, printedAt } from './handover';

const CFG = shippingSettings['delivery.handover.sheet'].default;
const sheet = (over: Partial<HandoverSheet> = {}): HandoverSheet => ({
  batchId: '0192f000-0000-7000-8000-00000000abcd',
  courierName: 'Steadfast main',
  practice: false,
  currency: 'BDT',
  printCount: 1,
  printedAt: '2026-10-24T05:30:00.000Z',
  lines: [
    { shipmentId: 's1', orderId: 'o1', orderNumber: 'EX-1001', consignmentId: 'SF100', receiverName: 'Rahim Uddin', collectMinor: 158_000, pieces: 2 }, // hardcode-ok: a made-up test amount
    { shipmentId: 's2', orderId: 'o2', orderNumber: 'EX-1002', consignmentId: 'SF101', receiverName: 'Karim Mia', collectMinor: 0, pieces: 1 },
  ],
  totals: { parcels: 2, pieces: 3, collectMinor: 158_000 }, // hardcode-ok: a made-up test amount
  replay: false,
  ...over,
});
const HEAD = { name: 'Sample Shop', address: 'Sample address', phone: '01700000000' }; // hardcode-ok: a made-up test number

describe('PR 180 · the handover sheet', () => {
  it('lists every parcel with a tick box, its consignment id and the amount to collect, the total, and the signature lines', () => {
    const doc = handoverDocument(sheet(), CFG, HEAD, 'Asia/Dhaka');
    expect(doc.letterhead).toEqual(['Sample Shop', 'Sample address', '01700000000']); // hardcode-ok: a made-up test number
    expect(doc.title).toBe('Handover sheet · Steadfast main');
    expect(doc.columns.map((c) => c.title)).toEqual(['#', 'Order', 'Consignment', 'Receiver', 'Pcs', 'Collect']);
    expect(doc.rows).toEqual([
      { cells: ['1', 'EX-1001', 'SF100', 'Rahim Uddin', '2', '৳1,580'], tick: true },
      { cells: ['2', 'EX-1002', 'SF101', 'Karim Mia', '1', 'paid'], tick: true },
    ]);
    expect(doc.after).toEqual(['Total to collect: ৳1,580 (2 parcels)']);
    expect(doc.signatures).toHaveLength(2);
    expect(doc.summary[1]).toBe(`Printed ${printedAt('2026-10-24T05:30:00.000Z', 'Asia/Dhaka')} · print 1`);
    expect(printedAt('2026-10-24T05:30:00.000Z', 'Asia/Dhaka')).toContain('11:30');
    expect(doc.foot).toBe('Batch 0000ABCD · print 1');
    expect([doc.widthMm, doc.heightMm, doc.dpi]).toEqual([210, 297, 150]);
  });

  it('leaves the names and the signatures out when the owner turns them off; marks a reprint and practice parcels', () => {
    const doc = handoverDocument(sheet({ printCount: 3, practice: true }), { ...CFG, receiverName: false, signatures: false, paper: 'a5' }, HEAD, 'Asia/Dhaka');
    expect(doc.columns.map((c) => c.title)).not.toContain('Receiver');
    expect(doc.rows[0]!.cells).toHaveLength(5);
    expect(doc.signatures).toEqual([]);
    expect(doc.summary.join(' ')).toContain('PRINTED AGAIN (3)');
    expect(doc.summary.join(' ')).toContain('PRACTICE');
    expect([doc.widthMm, doc.heightMm]).toEqual([148, 210]);
  });

  it('PR 406: a copy of a handed-over sheet says COPY with the rider and the time, not "printed again"', () => {
    const doc = handoverDocument(sheet({ printCount: 2, copy: { receivedBy: 'Rider Rahim', handedOverAt: '2026-10-24T08:00:00.000Z' } }), CFG, HEAD, 'Asia/Dhaka');
    const all = doc.summary.join(' ');
    expect(all).toContain(`COPY — handed over to Rider Rahim on ${printedAt('2026-10-24T08:00:00.000Z', 'Asia/Dhaka')}`);
    expect(all).not.toContain('PRINTED AGAIN');
    const bn = handoverDocument(sheet({ copy: { receivedBy: null, handedOverAt: '2026-10-24T08:00:00.000Z' } }), { ...CFG, lang: 'bn' }, HEAD, 'Asia/Dhaka');
    expect(bn.summary.join(' ')).toContain('কপি');
    expect(bn.summary.join(' ')).toContain('—');
  });

  it('speaks Bengali when the owner chooses it, with Western digits for the amounts', () => {
    const doc = handoverDocument(sheet(), { ...CFG, lang: 'bn' }, HEAD, 'Asia/Dhaka');
    expect(doc.title).toBe('হ্যান্ডওভার শিট · Steadfast main');
    expect(doc.after?.[0]).toContain('৳1,580');
    expect(doc.rows[1]!.cells[5]).toBe('পেইড');
  });

  it('draws one A4 PDF page', async () => {
    const read = readPdf(await handoverPdf(sheet(), CFG, HEAD, 'Asia/Dhaka', boxText()));
    expect(read.xrefOk).toBe(true);
    expect(read.pages).toHaveLength(1);
    expect(read.pages[0]!.mediaBox.map(Math.round)).toEqual([0, 0, 595, 842]);
  });
});
