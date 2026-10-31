import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sharpText, tile } from './layout';
import { mmToPt, writePdf } from './pdf';
import { stickerPages, stickerPdf, type StickerLayout } from './sticker';
import { boxText, decode128, readPdf, sampleSticker, SAMPLE_WORDS } from './test-kit';

const LAYOUT: StickerLayout = { widthMm: 100, heightMm: 150, dpi: 203, scale: 1, minScale: 0.8 };

/** Finds a pixel row of the page that a scanner reads as a Code 128 barcode, and returns what it says. */
function scan(image: { width: number; height: number; gray: Buffer }): string | null {
  for (let y = 0; y < image.height; y++) {
    const row = image.gray.subarray(y * image.width, (y + 1) * image.width);
    const dark = (x: number) => row[x]! < 128;
    let first = -1;
    let last = -1;
    for (let x = 0; x < image.width; x++) if (dark(x)) { if (first < 0) first = x; last = x; }
    if (first < 0) continue;
    const runs: number[] = [];
    let x = first;
    while (x <= last) {
      const d = dark(x);
      let n = 0;
      while (x <= last && dark(x) === d) { n++; x++; }
      runs.push(n);
    }
    if (runs.length < 20) continue;
    const module = Math.min(...runs);
    try {
      return decode128(runs.map((r) => Math.round(r / module)));
    } catch {
      continue;
    }
  }
  return null;
}

describe('the PDF writer', () => {
  it('writes PDF 1.4 pages at their exact size, with a valid cross-reference table', () => {
    const page = { widthPt: mmToPt(100), heightPt: mmToPt(150), image: { width: 4, height: 2, gray: Buffer.from([0, 255, 0, 255, 255, 0, 255, 0]) } };
    const pdf = readPdf(writePdf([page, page], { title: 'Stickers 1042' }));
    expect(pdf.version).toBe('1.4');
    expect(pdf.xrefOk).toBe(true);
    expect(pdf.title).toBe('Stickers 1042');
    expect(pdf.pages).toHaveLength(2);
    expect(pdf.pages[0]!.mediaBox).toEqual([0, 0, 283.46, 425.2]);
    expect([...pdf.pages[1]!.image.gray]).toEqual([0, 255, 0, 255, 255, 0, 255, 0]);
  });

  it('refuses no pages and a picture of the wrong size', () => {
    expect(() => writePdf([])).toThrow();
    expect(() => writePdf([{ widthPt: 10, heightPt: 10, image: { width: 2, height: 2, gray: Buffer.alloc(3) } }])).toThrow();
  });
});

describe('the courier sticker', () => {
  it('prints the courier id as a barcode a scanner reads, the amount to collect, the receiver and every piece', async () => {
    const engine = boxText();
    const pages = await stickerPages(sampleSticker(), SAMPLE_WORDS, LAYOUT, engine);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.image.width).toBe(799);
    expect(pages[0]!.image.height).toBe(1199);
    expect(scan(pages[0]!.image)).toBe('12345678');
    expect(engine.calls).toEqual(expect.arrayContaining(['Consignment 12345678', 'Tracking TRK12345', 'Rahim Uddin', '01711111111', 'House 4, Road 2, Dhanmondi, Dhaka', 'Order 1042', '1 pcs', 'Collect ৳1,580', 'Linen shirt — White · M', '× 1']));
    // no prices on the sticker, no "paid" words on a parcel with money to collect, no reprint mark on a first print
    expect(engine.calls).not.toContain(SAMPLE_WORDS.paid);
    expect(engine.calls.some((c) => c.startsWith('REPRINT'))).toBe(false);
  });

  it('says "collect nothing" on a paid parcel and never prints the exact-amount line there', async () => {
    const engine = boxText();
    await stickerPages(sampleSticker({ collect: null, exactLine: 'Pay exactly ৳0' }), SAMPLE_WORDS, LAYOUT, engine);
    expect(engine.calls).toContain(SAMPLE_WORDS.paid);
    expect(engine.calls.some((c) => c.startsWith('Collect'))).toBe(false);
    expect(engine.calls).not.toContain('Pay exactly ৳0');
  });

  it('prints the exact-amount line under the amount when it is given', async () => {
    const engine = boxText();
    await stickerPages(sampleSticker({ exactLine: 'Pay exactly ৳1,580. The rider may not ask for more.' }), SAMPLE_WORDS, LAYOUT, engine);
    expect(engine.calls).toContain('Pay exactly ৳1,580. The rider may not ask for more.');
  });

  it('SIM-F-048: a Bengali address carries its Latin line under it, in the order the rider reads them', async () => {
    const engine = boxText();
    const address = 'মাস্টারপাড়া, গাবতলী, বগুড়া';
    const latin = 'Mastarpara, Gabtoli, Bogura · Gabtali, Bogura';
    await stickerPages(sampleSticker({ receiver: { name: 'Rahim Uddin', phone: '01711111111', address, addressLatin: latin } }), SAMPLE_WORDS, LAYOUT, engine);
    expect(engine.calls.indexOf(latin)).toBe(engine.calls.indexOf(address) + 1);
    const plain = boxText();
    await stickerPages(sampleSticker(), SAMPLE_WORDS, LAYOUT, plain);
    expect(plain.calls.some((c) => c.includes('·') && c.includes('Bogura'))).toBe(false);
  });

  it('SIM-F-007: a gift shows who it is from and the day, under the receiver', async () => {
    const engine = boxText();
    await stickerPages(sampleSticker({ gift: { from: 'Ayesha', deliverAfter: '2026-10-30', note: 'Happy Eid' } }), SAMPLE_WORDS, LAYOUT, engine);
    expect(engine.calls).toContain('Gift from Ayesha · Deliver on or after 2026-10-30');
    expect(engine.calls).toContain('Happy Eid');
  });

  it('marks a reprint and a practice parcel', async () => {
    const engine = boxText();
    await stickerPages(sampleSticker({ reprint: 2, practice: true }), SAMPLE_WORDS, LAYOUT, engine);
    expect(engine.calls).toContain('REPRINT 2');
    expect(engine.calls).toContain(SAMPLE_WORDS.practice);
  });

  it("never invents an id: without the courier's id there is no barcode and no id line", async () => {
    const engine = boxText();
    const pages = await stickerPages(sampleSticker({ consignmentId: null, trackingCode: null }), SAMPLE_WORDS, LAYOUT, engine);
    expect(scan(pages[0]!.image)).toBeNull();
    expect(engine.calls.some((c) => c.startsWith('Consignment'))).toBe(false);
  });

  it('makes the type smaller first, then carries the pieces onto a second sticker with the order and the receiver', async () => {
    const few = Array.from({ length: 6 }, (_, i) => ({ name: `Panjabi style ${i + 1}`, colour: 'Sky', size: 'L', quantity: 1 }));
    const fit = boxText();
    expect(await stickerPages(sampleSticker({ items: few }), SAMPLE_WORDS, LAYOUT, fit)).toHaveLength(1);
    expect(fit.sizes.get('× 1')).toBe(10);
    const more = Array.from({ length: 11 }, (_, i) => ({ name: `Panjabi style ${i + 1}`, colour: 'Sky', size: 'L', quantity: 1 }));
    const smaller = boxText();
    expect(await stickerPages(sampleSticker({ items: more }), SAMPLE_WORDS, LAYOUT, smaller)).toHaveLength(1);
    expect(smaller.sizes.get('× 1')).toBeLessThan(10);
    expect(smaller.sizes.get('× 1')).toBeGreaterThanOrEqual(8);

    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Panjabi style ${i + 1}`, colour: 'Sky', size: 'L', quantity: 1 + (i % 2) }));
    const engine = boxText();
    const pages = await stickerPages(sampleSticker({ items: many, note: 'Call before coming' }), SAMPLE_WORDS, LAYOUT, engine);
    expect(pages.length).toBeGreaterThan(1);
    expect(engine.calls).toContain(`1/${pages.length}`);
    expect(engine.calls).toContain(`${pages.length}/${pages.length}`);
    expect(engine.calls).toContain('Order 1042 · Rahim Uddin');
    expect(engine.calls).toContain(SAMPLE_WORDS.continued);
    expect(engine.calls).toContain('60 pcs');
    expect(engine.sizes.get('× 1')).toBeCloseTo(8);
    for (const it of many) expect(engine.calls).toContain(`${it.name} — Sky · L`);
  });

  it('puts four stickers on an A4 sheet when the owner prints on paper', async () => {
    const small = { ...LAYOUT, widthMm: 105, heightMm: 148.5, dpi: 150 };
    const one = await stickerPages(sampleSticker(), SAMPLE_WORDS, small, boxText());
    const sheets = await tile([...one, ...one, ...one, ...one, ...one], { widthMm: 210, heightMm: 297, across: 2, down: 2, dpi: 150 });
    expect(sheets).toHaveLength(2);
    expect(sheets[0]!.widthPt).toBeCloseTo(mmToPt(210));
  });

  it('draws real Bengali and English text with the server fonts into one PDF', async () => {
    const bn = { ...SAMPLE_WORDS, to: 'প্রাপক', collect: 'আদায় করুন', items: 'পণ্য', order: 'অর্ডার' };
    const pdf = await stickerPdf([sampleSticker({ receiver: { name: 'রহিম উদ্দিন', phone: '01711111111', address: 'বাসা ৪, রোড ২, ধানমন্ডি, ঢাকা' }, gift: { from: 'আয়েশা', deliverAfter: '2026-10-30', note: null } })], bn, LAYOUT, sharpText(), { title: 'Sticker 1042' });
    if (process.env.STICKER_PDF_OUT) writeFileSync(process.env.STICKER_PDF_OUT, pdf);
    const read = readPdf(pdf);
    expect(read.xrefOk).toBe(true);
    expect(read.pages).toHaveLength(1);
    const img = read.pages[0]!.image;
    const darkShare = [...img.gray].filter((v) => v < 128).length / img.gray.length;
    expect(darkShare).toBeGreaterThan(0.02);
    expect(darkShare).toBeLessThan(0.6);
    expect(scan(img)).toBe('12345678');
  });
});
