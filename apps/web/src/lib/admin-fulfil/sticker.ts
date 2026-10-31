// S08 · PR 179 — the courier sticker PDF on the server: the parcels from @extas/shipping (what the courier has), the
// owner's sticker settings (`delivery.sticker.layout`, `delivery.sticker.exactAmount`), the shop's name and phone, and
// the sticker's own words in the language the owner chose (messages/admin-fulfil.<lang>.json `ful.sticker.words`),
// drawn by @extas/documents. Amounts are written as the shop writes money, in Western digits (what riders and the
// courier's hub read). The exact-amount line is printed only when the owner turned it on and only on a parcel with
// money to collect (never on a paid parcel, CN-014b idea 10).
import { sharpText, stickerPages, tile, writePdf, type PdfPage, type StickerInput, type StickerLayout, type StickerWords, type TextEngine } from '@extas/documents';
import type { StickerExactAmountSettings, StickerLayoutSettings } from '@extas/settings';
import type { StickerParcel } from '@extas/shipping';
import { formatMoney } from '@/lib/shop/lang';
import { t, type Dict } from '@/lib/i18n';
import { fulfilDicts } from './i18n';

/** Paper and roll sizes in millimetres (international paper sizes and the usual thermal rolls; not owner values). */
const SIZES_MM = { '100x150': [100, 150], '100x100': [100, 100], '75x100': [75, 100], a6: [105, 148], a5: [148, 210] } as const;
/** Four stickers on an A4 sheet: each one a quarter of the sheet. */
const A4: readonly [number, number] = [210, 297];

/** The size one sticker is drawn at, and the sheet it is placed on when stickers share a sheet. */
export function stickerSize(layout: StickerLayoutSettings): { widthMm: number; heightMm: number; sheet: { widthMm: number; heightMm: number; across: number; down: number } | null } {
  if (layout.size === 'custom') return { widthMm: layout.customMm.width, heightMm: layout.customMm.height, sheet: null };
  if (layout.size === 'a4x4') return { widthMm: A4[0] / 2, heightMm: A4[1] / 2, sheet: { widthMm: A4[0], heightMm: A4[1], across: 2, down: 2 } };
  const [w, h] = SIZES_MM[layout.size];
  return { widthMm: w, heightMm: h, sheet: null };
}

/** The sticker's own words in its language. */
export function stickerWords(lang: 'en' | 'bn'): StickerWords {
  const d = fulfilDicts[lang];
  const w = (k: keyof StickerWords) => t(d, `ful.sticker.words.${k}`);
  return {
    to: w('to'),
    order: w('order'),
    collect: w('collect'),
    paid: w('paid'),
    items: w('items'),
    pieces: w('pieces'),
    consignment: w('consignment'),
    tracking: w('tracking'),
    giftFrom: w('giftFrom'),
    deliverAfter: w('deliverAfter'),
    note: w('note'),
    reprint: w('reprint'),
    page: w('page'),
    continued: w('continued'),
    practice: w('practice'),
    setWhole: w('setWhole'),
  };
}

export interface StickerContext {
  layout: StickerLayoutSettings;
  exact: StickerExactAmountSettings;
  shopName: string | null;
  shopPhone: string | null;
}

const money = (minor: number, currency: string) => formatMoney(minor, currency, 'en', false, 'en', '');

/** One parcel as the sticker's data. */
export function stickerInput(p: StickerParcel, c: StickerContext): StickerInput {
  const collect = p.collectMinor > 0 ? money(p.collectMinor, p.currency) : null;
  const exactLine =
    collect && c.exact.enabled
      ? c.exact.text[c.layout.lang]
          .replace(/\{amount\}/g, collect)
          .replace(/\{link\}/g, c.exact.link ?? '')
          .replace(/\s+/g, ' ')
          .trim() || null
      : null;
  return {
    shopName: c.layout.showShop ? c.shopName : null,
    shopPhone: c.layout.showShop ? c.shopPhone : null,
    courierName: p.courierName,
    consignmentId: p.consignmentId,
    trackingCode: p.trackingCode,
    orderNumber: p.orderNumber,
    receiver: p.receiver,
    collect,
    exactLine,
    items: p.items,
    gift: p.gift,
    note: p.note,
    reprint: p.reprint,
    practice: p.practice,
    fixedSets: (p.fixedSets ?? []).map((s) => (c.layout.lang === 'bn' ? (s.nameBn ?? s.nameEn) : s.nameEn)),
  };
}

/** The stickers as one PDF, at the owner's size (four to an A4 sheet when he prints on paper). */
export async function stickersPdf(inputs: readonly StickerInput[], layout: StickerLayoutSettings, title: string, engine: TextEngine = sharpText()): Promise<Buffer> {
  const size = stickerSize(layout);
  const l: StickerLayout = { widthMm: size.widthMm, heightMm: size.heightMm, dpi: layout.dpi, scale: layout.scalePercent / 100, minScale: layout.minScalePercent / 100 };
  const words = stickerWords(layout.lang);
  let pages: PdfPage[] = [];
  for (const input of inputs) pages.push(...(await stickerPages(input, words, l, engine)));
  if (size.sheet) pages = await tile(pages, { ...size.sheet, dpi: layout.dpi });
  return writePdf(pages, { title });
}

/** A sample parcel (made-up words from the messages file) to try the size and the printer. */
export function sampleParcel(dict: Dict, currency: string): StickerParcel {
  const s = (k: string) => t(dict, `ful.sticker.sample.${k}`);
  return {
    shipmentId: 'sample',
    orderNumber: s('order'),
    courierName: s('courier'),
    practice: true,
    consignmentId: s('consignment'),
    trackingCode: s('tracking'),
    receiver: { name: s('name'), phone: s('phone'), address: s('address'), addressLatin: null },
    collectMinor: Number(s('amountMinor')) || 0,
    currency,
    items: [
      { name: s('item1'), colour: s('colour1'), size: s('size1'), quantity: 1 },
      { name: s('item2'), colour: s('colour2'), size: s('size2'), quantity: 2 },
    ],
    gift: null,
    note: s('note'),
    reprint: null,
    fixedSets: [],
  };
}

/** A file name for the PDF (ASCII, safe in a header). */
export const pdfName = (base: string) => `${base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'stickers'}.pdf`;
