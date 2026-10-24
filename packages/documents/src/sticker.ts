// PR 179 (Blueprint B1.4; SIM-F-004, SIM-F-007; CN-014b idea 10; follow-up 376) — the courier sticker, the one
// fulfilment document. Everything on it comes in as data, already in words: the shop and the courier, the courier's
// consignment id as a Code 128 barcode with the id and the courier's tracking code under it (both always from the
// courier, never made by the shop), the receiver (a gift's receiver, never the sender's phone), the order number, the
// amount the rider collects — big, on a black band — or "paid, collect nothing", the exact-amount line when the owner
// turned it on (never on a paid parcel), a gift's sender and "deliver on or after", every piece in a bordered box
// (name, colour, size, quantity; no prices), the delivery note, and "REPRINT n" on a reprint.
//
// Nothing is cut and nothing overlaps: the sticker is measured first; when it does not fit, the type is made smaller,
// down to the owner's smallest size, and only then do the remaining pieces carry on onto a second sticker ("2/2") with
// the order number and the receiver's name on it.
import { Sheet, type TextBlock, type TextEngine, type TextStyle } from './layout';
import { writePdf, type PdfPage } from './pdf';

/** The words printed on a sticker, in the language the owner chose ({n}, {of}: page; {count}: how many). */
export interface StickerWords {
  to: string;
  order: string;
  /** Before the amount to collect, e.g. "Collect". */
  collect: string;
  /** A parcel with nothing to collect. */
  paid: string;
  items: string;
  /** How many pieces ({count}). */
  pieces: string;
  consignment: string;
  tracking: string;
  giftFrom: string;
  deliverAfter: string;
  note: string;
  /** "REPRINT {n}". */
  reprint: string;
  /** "{n}/{of}". */
  page: string;
  /** "Continued on the next sticker". */
  continued: string;
  /** A practice parcel (the courier is on its practice mode): never a real parcel. */
  practice: string;
}

export interface StickerItem {
  name: string;
  colour: string | null;
  size: string | null;
  quantity: number;
}

/** One sticker's data, already in words (amounts formatted by the caller). */
export interface StickerInput {
  shopName: string | null;
  shopPhone: string | null;
  courierName: string;
  consignmentId: string | null;
  trackingCode: string | null;
  orderNumber: string;
  receiver: { name: string | null; phone: string | null; address: string | null };
  /** The amount the rider collects, formatted ("৳1,580"); null when there is nothing to collect. */
  collect: string | null;
  /** The exact-amount line (owner's switch; never on a paid parcel). */
  exactLine: string | null;
  items: readonly StickerItem[];
  gift: { from: string | null; deliverAfter: string | null; note: string | null } | null;
  note: string | null;
  /** The reprint number (1 for the first reprint), or null for the first print. */
  reprint: number | null;
  practice: boolean;
}

export interface StickerLayout {
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** The type size, 1 = normal. */
  scale: number;
  /** The smallest the type may get before the pieces carry on onto a second sticker. */
  minScale: number;
}

/** Points of the type at scale 1 (the sticker's own proportions, not owner values). */
const SIZE = { small: 8, body: 10, name: 13, collect: 20, head: 10 } as const;
const MARGIN_MM = 3;
const GAP_MM = 1.2;
const BARCODE_MM = 13; // hardcode-ok: the sticker's own proportion (the barcode's height), not a business number
/** Each smaller step of the type while fitting. */
const STEP = 0.05;

const fill = (text: string, values: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/** A piece of the sticker, measured: its height and how to draw it at a given top. */
interface Part {
  h: number;
  draw(sheet: Sheet, y: number): void;
}

/** The parts of one sticker at one type scale. */
async function partsAt(input: StickerInput, words: StickerWords, sheet: Sheet, scale: number) {
  const m = sheet.px(MARGIN_MM);
  const w = sheet.width - 2 * m;
  const gap = sheet.px(GAP_MM);
  const pad = Math.max(2, Math.round(sheet.px(1.2)));
  const line = Math.max(1, Math.round(sheet.dpi / 100));
  const st = (size: keyof typeof SIZE, o: Omit<TextStyle, 'sizePt'> = {}): TextStyle => ({ sizePt: SIZE[size] * scale, ...o });
  const shape = (text: string | null | undefined, style: TextStyle, width = w): Promise<TextBlock> => sheet.shape(text ?? '', style, width);
  const text = (b: TextBlock, x = m, width = w, align: TextStyle['align'] = 'left'): Part => ({ h: b.height, draw: (s, y) => s.place(b, x, y, width, align) });
  const rule = (): Part => ({ h: gap * 2, draw: (s, y) => s.line(m, y + gap, m + w, y + gap, line) });
  const space = (h = gap): Part => ({ h, draw: () => undefined });

  const head: Part[] = [];
  // the practice mark first: a practice parcel is never mistaken for a real one
  if (input.practice) {
    const b = await shape(words.practice, st('head', { bold: true, inverse: true, align: 'centre' }), w - 2 * pad);
    head.push({ h: b.height + 2 * pad, draw: (s, y) => { s.rect(m, y, w, b.height + 2 * pad, { fill: true }); s.place(b, m + pad, y + pad, w - 2 * pad, 'centre'); } }, space());
  }
  // shop (left) and courier (right)
  const shop = await shape([input.shopName, input.shopPhone].filter(Boolean).join(' · '), st('head', { bold: true }), Math.round(w * 0.6));
  const courier = await shape(input.courierName, st('head', { bold: true, align: 'right' }), Math.round(w * 0.4));
  head.push({ h: Math.max(shop.height, courier.height), draw: (s, y) => { s.place(shop, m, y, Math.round(w * 0.6)); s.place(courier, m + Math.round(w * 0.6), y, Math.round(w * 0.4), 'right'); } }, rule());
  // the courier's consignment id as a barcode, the id and its tracking code under it
  if (input.consignmentId) {
    const bh = sheet.px(BARCODE_MM * Math.min(1, scale));
    const id = await shape(`${words.consignment} ${input.consignmentId}`, st('body', { bold: true, align: 'centre' }));
    const track = input.trackingCode && input.trackingCode !== input.consignmentId ? await shape(`${words.tracking} ${input.trackingCode}`, st('small', { align: 'centre' })) : await shape('', st('small'));
    head.push({
      h: bh + gap + id.height + track.height,
      draw: (s, y) => {
        if (!s.barcode(input.consignmentId!, m, y, w, bh)) s.rect(m, y, w, bh, { stroke: line });
        s.place(id, m, y + bh + gap, w, 'centre');
        s.place(track, m, y + bh + gap + id.height, w, 'centre');
      },
    }, rule());
  }
  // the receiver
  head.push(text(await shape(words.to, st('small'))));
  head.push(text(await shape(input.receiver.name, st('name', { bold: true }))));
  head.push(text(await shape(input.receiver.phone, st('name', { bold: true }))));
  head.push(text(await shape(input.receiver.address, st('body'))), space());
  // the order number and the pieces
  const pieces = input.items.reduce((s, i) => s + i.quantity, 0);
  const order = await shape(`${words.order} ${input.orderNumber}`, st('body', { bold: true }), Math.round(w * 0.6));
  const count = await shape(fill(words.pieces, { count: pieces }), st('body', { align: 'right' }), Math.round(w * 0.4));
  head.push({ h: Math.max(order.height, count.height), draw: (s, y) => { s.place(order, m, y, Math.round(w * 0.6)); s.place(count, m + Math.round(w * 0.6), y, Math.round(w * 0.4), 'right'); } }, space());
  // the amount to collect, big on a black band; a paid parcel says so in a box
  if (input.collect) {
    const b = await shape(`${words.collect} ${input.collect}`, st('collect', { bold: true, inverse: true, align: 'centre' }), w - 2 * pad);
    head.push({ h: b.height + 2 * pad, draw: (s, y) => { s.rect(m, y, w, b.height + 2 * pad, { fill: true }); s.place(b, m + pad, y + pad, w - 2 * pad, 'centre'); } });
    if (input.exactLine) head.push(space(Math.round(gap / 2)), text(await shape(input.exactLine, st('small', { bold: true, align: 'centre' })), m, w, 'centre'));
  } else {
    const b = await shape(words.paid, st('name', { bold: true, align: 'centre' }), w - 2 * pad);
    head.push({ h: b.height + 2 * pad, draw: (s, y) => { s.rect(m, y, w, b.height + 2 * pad, { stroke: line * 2 }); s.place(b, m + pad, y + pad, w - 2 * pad, 'centre'); } });
  }
  head.push(space());
  // a gift: who it is from and the day (SIM-F-007)
  if (input.gift) {
    const g = [input.gift.from ? `${words.giftFrom} ${input.gift.from}` : null, input.gift.deliverAfter ? `${words.deliverAfter} ${input.gift.deliverAfter}` : null].filter(Boolean).join(' · ');
    head.push(text(await shape(g, st('body', { bold: true }))));
    if (input.gift.note) head.push(text(await shape(input.gift.note, st('small'))));
    head.push(space());
  }
  head.push(text(await shape(words.items, st('small', { bold: true }))));

  // the pieces, one row each, in a bordered box
  const nameW = Math.round((w - 2 * pad) * 0.82);
  const qtyW = w - 2 * pad - nameW;
  const items: Part[] = [];
  for (const it of input.items) {
    const variant = [it.colour, it.size].filter(Boolean).join(' · ');
    const name = await shape(variant ? `${it.name} — ${variant}` : it.name, st('body'), nameW);
    const qty = await shape(`× ${it.quantity}`, st('body', { bold: true, align: 'right' }), qtyW);
    const h = Math.max(name.height, qty.height) + 2 * pad;
    items.push({
      h,
      draw: (s, y) => {
        s.rect(m, y, w, h + line, { stroke: line });
        s.place(name, m + pad, y + pad, nameW);
        s.place(qty, m + pad + nameW, y + pad, qtyW, 'right');
      },
    });
  }

  const tail: Part[] = [];
  if (input.note?.trim()) tail.push(space(), text(await shape(`${words.note}: ${input.note.trim()}`, st('small'))));
  const footer = async (n: number, of: number): Promise<Part> => {
    const left = await shape(input.reprint ? fill(words.reprint, { n: input.reprint }) : '', st('small', { bold: true }), Math.round(w / 2));
    const right = await shape(of > 1 ? fill(words.page, { n, of }) : '', st('small', { bold: true, align: 'right' }), Math.round(w / 2));
    return { h: Math.max(left.height, right.height), draw: (s, y) => { s.place(left, m, y, Math.round(w / 2)); s.place(right, m + Math.round(w / 2), y, Math.round(w / 2), 'right'); } };
  };
  // the top of a continuation sticker: the order and the receiver, so the two never part
  const again = [text(await shape(`${words.order} ${input.orderNumber} · ${input.receiver.name ?? ''}`, st('body', { bold: true }))), rule()];
  const continued = text(await shape(words.continued, st('small', { bold: true, align: 'centre' })), m, w, 'centre');
  return { head, items, tail, footer, again, continued, room: sheet.height - 2 * m, top: m };
}

const sum = (parts: readonly Part[]) => parts.reduce((s, p) => s + p.h, 0);

/** The pages of one sticker (one, or more when the pieces carry on). */
export async function stickerPages(input: StickerInput, words: StickerWords, layout: StickerLayout, engine: TextEngine): Promise<PdfPage[]> {
  const measure = new Sheet(layout.widthMm, layout.heightMm, layout.dpi, engine);
  let scale = layout.scale;
  let parts = await partsAt(input, words, measure, scale);
  const fits = async () => sum(parts.head) + sum(parts.items) + sum(parts.tail) + (await parts.footer(1, 1)).h <= parts.room;
  while (!(await fits()) && scale - STEP >= layout.minScale - 1e-9) {
    scale = Math.round((scale - STEP) * 100) / 100;
    parts = await partsAt(input, words, measure, scale);
  }
  // pages: the head, as many pieces as fit, and the rest on continuation stickers; the note and the footer last
  const footerH = (await parts.footer(1, 2)).h;
  const groups: Part[][] = [];
  const whole = await fits();
  if (whole) groups.push([...parts.head, ...parts.items]);
  let i = whole ? parts.items.length : 0;
  let first = !whole;
  while (first || i < parts.items.length) {
    const top = first ? parts.head : parts.again;
    let room = parts.room - sum(top) - footerH;
    const rows: Part[] = [];
    while (i < parts.items.length) {
      const rest = parts.items.length - i - 1;
      const need = parts.items[i]!.h + (rest > 0 ? 0 : sum(parts.tail));
      // the last row needs the tail with it; any other row needs room for the "continued" line after it. A
      // continuation sticker always takes at least one row (a piece taller than a sticker is cut, never dropped).
      if (need > room - (rest > 0 ? parts.continued.h : 0) && (rows.length || first)) break;
      rows.push(parts.items[i]!);
      room -= parts.items[i]!.h;
      i++;
    }
    groups.push([...top, ...rows]);
    first = false;
  }
  const pages: PdfPage[] = [];
  for (let p = 0; p < groups.length; p++) {
    const sheet = new Sheet(layout.widthMm, layout.heightMm, layout.dpi, engine);
    let y = parts.top;
    const body = groups[p]!;
    const last = p === groups.length - 1;
    for (const part of body) {
      part.draw(sheet, y);
      y += part.h;
    }
    if (last) for (const part of parts.tail) { part.draw(sheet, y); y += part.h; }
    else { parts.continued.draw(sheet, y); }
    const f = await parts.footer(p + 1, groups.length);
    f.draw(sheet, parts.top + parts.room - f.h);
    pages.push(await sheet.render());
  }
  return pages;
}

/** Every sticker of a print, in the order given, as one PDF. */
export async function stickerPdf(inputs: readonly StickerInput[], words: StickerWords, layout: StickerLayout, engine: TextEngine, meta: { title?: string; created?: Date } = {}): Promise<Buffer> {
  const pages: PdfPage[] = [];
  for (const input of inputs) pages.push(...(await stickerPages(input, words, layout, engine)));
  return writePdf(pages, meta);
}
