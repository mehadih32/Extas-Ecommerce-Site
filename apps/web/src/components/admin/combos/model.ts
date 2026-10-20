// S03 · PR 90, 571 — the combo screens' pure helpers: money in the store's currency, the price box's words (one
// decision with the price: the same SetPricing the bag uses), the fixed combo form and its input, and the state tags.
// Every visible word comes from messages/admin-combos.<lang>.json; nothing here writes text of its own.
import type { ComboState, FixedComboInput, SetPricing } from '@extas/combos/pure';

export type Lang = 'bn' | 'en';
type ComboViewLike = {
  slug: string;
  nameEn: string;
  nameBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  type: string;
  startsOn: string | null;
  endsOn: string | null;
  autoApply: boolean;
  sameColour: boolean;
  isFeatured: boolean;
  setPriceMinor: number | null;
  items: { productId: string | null; colourIds: string[]; sizeIds: string[]; fixedVariantId: string | null; quantity: number; labelEn: string | null; labelBn: string | null }[];
};

/** Minor units per major unit (the store's currencies all have two decimals; BDT: 100 paisa = 1 taka). */
export const MINOR = 100;

export function money(minor: number | null | undefined, locale: string, currency: string): string {
  if (minor === null || minor === undefined) return '';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: minor % MINOR ? 2 : 0 }).format(minor / MINOR);
}

/** The currency's symbol in this locale (the price box's prefix). */
export function currencySymbol(locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
}

/** What is typed in a price box (whole taka, Bengali or Latin digits) as minor units; null = empty or not a number. */
export function toMinor(text: string): number | null {
  const latin = text.trim().replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/[,\s]/g, '');
  if (!latin) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(latin)) return Number.NaN;
  return Math.round(Number(latin) * MINOR);
}

export const toMajorText = (minor: number | null | undefined): string => (minor === null || minor === undefined ? '' : String(minor / MINOR));

/** The price box's words (demo acb_saveText): a key under `combos.price.*` and its values. */
export function saveWords(p: SetPricing, fmt: (minor: number | null) => string): { key: string; vars: Record<string, string>; tone: 'ok' | 'warn' | 'bad' } {
  if (p.reason === 'PIECE_NO_PRICE') return { key: 'price.pieceNoPrice', vars: {}, tone: 'bad' };
  if (p.reason === 'NO_SET_PRICE') return { key: 'price.enter', vars: {}, tone: 'bad' };
  if (p.reason === 'NOT_LOWER') return { key: 'price.notLower', vars: { regular: fmt(p.regularMinor) }, tone: 'warn' };
  return { key: 'price.saves', vars: { regular: fmt(p.regularMinor), saving: fmt(p.savingMinor), percent: String(p.savingPercent) }, tone: 'ok' };
}

/** The state pill (demo ACW_STATE): text key and tone. */
export function stateTag(s: ComboState): { key: string; tone: 'ok' | 'info' | 'warn' | 'plain' } {
  switch (s) {
    case 'live':
      return { key: 'state.live', tone: 'ok' };
    case 'soon':
      return { key: 'state.soon', tone: 'info' };
    case 'ended':
      return { key: 'state.ended', tone: 'warn' };
    case 'off':
      return { key: 'state.off', tone: 'plain' };
    default:
      return { key: 'state.draft', tone: 'plain' };
  }
}

export const isArchived = (s: ComboState) => s === 'ended' || s === 'off';

// ---------------------------------------------------------------------------------------------------------------
// The fixed combo form
// ---------------------------------------------------------------------------------------------------------------

export interface ItemForm {
  productId: string;
  colourIds: string[];
  quantity: number;
  labelEn: string;
  labelBn: string;
}

export interface ComboForm {
  slug: string;
  nameEn: string;
  nameBn: string;
  descriptionEn: string;
  descriptionBn: string;
  type: string;
  items: ItemForm[];
  /** What is typed in the price box. */
  price: string;
  startsOn: string;
  endsOn: string;
  autoApply: boolean;
  sameColour: boolean;
}

export const emptyItem = (productId = ''): ItemForm => ({ productId, colourIds: [], quantity: 1, labelEn: '', labelBn: '' });

export const emptyForm = (): ComboForm => ({ slug: '', nameEn: '', nameBn: '', descriptionEn: '', descriptionBn: '', type: 'FIXED_SET', items: [emptyItem(), emptyItem()], price: '', startsOn: '', endsOn: '', autoApply: false, sameColour: false });

export function formFromView(v: ComboViewLike): ComboForm {
  return {
    slug: v.slug,
    nameEn: v.nameEn,
    nameBn: v.nameBn ?? '',
    descriptionEn: v.descriptionEn ?? '',
    descriptionBn: v.descriptionBn ?? '',
    type: v.type,
    items: v.items.map((i) => ({ productId: i.productId ?? '', colourIds: [...i.colourIds], quantity: i.quantity, labelEn: i.labelEn ?? '', labelBn: i.labelBn ?? '' })),
    price: toMajorText(v.setPriceMinor),
    startsOn: v.startsOn ?? '',
    endsOn: v.endsOn ?? '',
    autoApply: v.autoApply,
    sameColour: v.sameColour,
  };
}

/** A link from a name: small letters, digits and single dashes (the owner may change it before saving). */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** The form as the API's input. Empty piece rows are left out; a bad price stays bad (the server names it). */
export function inputFromForm(f: ComboForm): FixedComboInput {
  const price = toMinor(f.price);
  return {
    slug: f.slug.trim() || slugify(f.nameEn),
    nameEn: f.nameEn.trim(),
    nameBn: f.nameBn.trim() || null,
    descriptionEn: f.descriptionEn.trim() || null,
    descriptionBn: f.descriptionBn.trim() || null,
    type: f.type as FixedComboInput['type'],
    items: f.items.filter((i) => i.productId).map((i) => ({ productId: i.productId, colourIds: i.colourIds, quantity: i.quantity, labelEn: i.labelEn.trim() || null, labelBn: i.labelBn.trim() || null })),
    setPriceMinor: price === null ? null : price,
    autoApply: f.autoApply,
    sameColour: f.sameColour,
    startsOn: f.startsOn || null,
    endsOn: f.endsOn || null,
  };
}

/** One product taking every piece: the same-colour switch (K11) applies. */
export const oneProductForm = (f: ComboForm) => {
  const items = f.items.filter((i) => i.productId);
  return items.length > 0 && new Set(items.map((i) => i.productId)).size === 1 && items.reduce((s, i) => s + i.quantity, 0) > 1;
};

/** The name in the admin's language (Bengali falls back to English). */
export const nameIn = (lang: Lang, en: string | null | undefined, bn: string | null | undefined): string => (lang === 'bn' && bn ? bn : (en ?? ''));
