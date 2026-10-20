// S03 · PR 571 — the "Make a combo" wizard's form, pure: an empty rule, a saved rule as a form, the form as the API's
// input (the full rule, or only what the live count needs), the link made from the style name, and which step may go
// on. Every visible word comes from messages/admin-combos.<lang>.json.
import type { AutoRuleView } from '@extas/combos';
import type { AutoRuleInput } from '@extas/combos/pure';
import { slugify, toMajorText, toMinor } from './model';

export type PriceMode = 'FIXED' | 'PERCENT';
export type Pairing = 'STYLE' | 'ACROSS' | 'ANY';

export interface RuleForm {
  key: string;
  nameEn: string;
  nameBn: string;
  titleEn: string;
  titleBn: string;
  categoryIds: string[];
  productIds: string[];
  pieces: 2 | 3;
  pairing: Pairing;
  sameColour: boolean;
  excludeColourIds: string[];
  priceMode: PriceMode;
  /** What is typed: whole taka (FIXED) or a whole percentage (PERCENT). */
  price: string;
  sortMode: 'BESTSELLERS' | 'COLOUR';
  pinnedKeys: string[];
  season: string;
  listTemplateKey: string;
  pageTemplateKey: string;
  bagTemplateKey: string;
  noSinglePiece: boolean;
  startsOn: string;
  endsOn: string;
  upsell: boolean;
  upPriceMode: PriceMode;
  upPrice: string;
}

/** A rule as the server sends it (the fields the form reads). */
export interface RuleLike {
  key: string;
  nameEn: string;
  nameBn: string | null;
  titleEn: string | null;
  titleBn: string | null;
  categoryIds: string[];
  productIds: string[];
  pieces: number;
  pairing: Pairing;
  sameColour: boolean;
  excludeColourIds: string[];
  priceMode: PriceMode;
  priceMinor: number | null;
  percentOff: number | null;
  sortMode: 'BESTSELLERS' | 'COLOUR';
  pinnedKeys: string[];
  season: string | null;
  listTemplateKey: string | null;
  pageTemplateKey: string | null;
  bagTemplateKey: string | null;
  noSinglePiece: boolean;
  startsOn: string | null;
  endsOn: string | null;
  addOneMore: boolean;
}

export const emptyRuleForm = (categoryId?: string): RuleForm => ({
  key: '',
  nameEn: '',
  nameBn: '',
  titleEn: '',
  titleBn: '',
  categoryIds: categoryId ? [categoryId] : [],
  productIds: [],
  pieces: 2,
  pairing: 'STYLE',
  sameColour: false,
  excludeColourIds: [],
  priceMode: 'PERCENT',
  price: '',
  sortMode: 'BESTSELLERS',
  pinnedKeys: [],
  season: '',
  listTemplateKey: '',
  pageTemplateKey: '',
  bagTemplateKey: '',
  noSinglePiece: true,
  startsOn: '',
  endsOn: '',
  upsell: false,
  upPriceMode: 'PERCENT',
  upPrice: '',
});

const priceText = (mode: PriceMode, minor: number | null, percent: number | null) => (mode === 'FIXED' ? toMajorText(minor) : percent === null ? '' : String(percent));

export function formFromRule(r: RuleLike, upsell?: { priceMode: PriceMode; priceMinor: number | null; percentOff: number | null } | null): RuleForm {
  return {
    key: r.key,
    nameEn: r.nameEn,
    nameBn: r.nameBn ?? '',
    titleEn: r.titleEn ?? '',
    titleBn: r.titleBn ?? '',
    categoryIds: [...r.categoryIds],
    productIds: [...r.productIds],
    pieces: r.pieces === 3 ? 3 : 2,
    pairing: r.pairing,
    sameColour: r.sameColour,
    excludeColourIds: [...r.excludeColourIds],
    priceMode: r.priceMode,
    price: priceText(r.priceMode, r.priceMinor, r.percentOff),
    sortMode: r.sortMode,
    pinnedKeys: [...r.pinnedKeys],
    season: r.season ?? '',
    listTemplateKey: r.listTemplateKey ?? '',
    pageTemplateKey: r.pageTemplateKey ?? '',
    bagTemplateKey: r.bagTemplateKey ?? '',
    noSinglePiece: r.noSinglePiece,
    startsOn: r.startsOn ?? '',
    endsOn: r.endsOn ?? '',
    upsell: r.addOneMore,
    upPriceMode: upsell?.priceMode ?? r.priceMode,
    upPrice: upsell ? priceText(upsell.priceMode, upsell.priceMinor, upsell.percentOff) : '',
  };
}

/** A typed whole percentage (Bengali digits too); null = empty; NaN = not a whole number. */
export function toPercent(text: string): number | null {
  const latin = text.trim().replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  if (!latin) return null;
  return /^\d{1,2}$/.test(latin) ? Number(latin) : Number.NaN;
}

function pack(mode: PriceMode, text: string): { priceMode: PriceMode; priceMinor: number | null; percentOff: number | null } {
  if (mode === 'FIXED') {
    const m = toMinor(text);
    return { priceMode: mode, priceMinor: m === null || Number.isNaN(m) ? null : m, percentOff: null };
  }
  const p = toPercent(text);
  return { priceMode: mode, priceMinor: null, percentOff: p === null || Number.isNaN(p) || p < 1 ? null : p };
}

/** The price typed is not a number (the screen says so; the server would refuse it). */
export const priceBad = (mode: PriceMode, text: string) => (mode === 'FIXED' ? Number.isNaN(toMinor(text)) : Number.isNaN(toPercent(text)));

/** The style name made from what is bound when none is typed (demo acw_autoTitle). */
export const autoTitle = (boundNames: readonly string[]) => (boundNames.length ? boundNames[0]! : '');

/** A new rule's link: the style name and the pieces (demo zo_slug(title)-pieces). */
export const autoKey = (title: string, pieces: number) => {
  const s = slugify(title);
  return s ? `${s}-${pieces}` : '';
};

/** What the live count needs (no names: the server fills them for a preview). */
export function previewInput(f: RuleForm): Partial<AutoRuleInput> {
  return {
    categoryIds: f.categoryIds,
    productIds: f.productIds,
    pieces: f.pieces,
    pairing: f.pairing,
    sameColour: f.sameColour,
    excludeColourIds: f.excludeColourIds,
    ...pack(f.priceMode, f.price),
    sortMode: f.sortMode,
    pinnedKeys: f.pinnedKeys,
    upsell: f.upsell && f.pieces === 2 ? { ...pack(f.upPriceMode, f.upPrice), nameEn: 'preview' } : null,
  };
}

/** The whole rule as the API's input. */
export function ruleInput(f: RuleForm, names: { upsellNameEn: string; upsellNameBn: string | null }): AutoRuleInput {
  return {
    ...previewInput(f),
    key: f.key.trim(),
    nameEn: f.nameEn.trim(),
    nameBn: f.nameBn.trim() || null,
    titleEn: f.titleEn.trim() || null,
    titleBn: f.titleBn.trim() || null,
    season: f.season || null,
    listTemplateKey: (f.listTemplateKey || null) as AutoRuleInput['listTemplateKey'],
    pageTemplateKey: (f.pageTemplateKey || null) as AutoRuleInput['pageTemplateKey'],
    bagTemplateKey: (f.bagTemplateKey || null) as AutoRuleInput['bagTemplateKey'],
    noSinglePiece: f.noSinglePiece,
    startsOn: f.startsOn || null,
    endsOn: f.endsOn || null,
    upsell: f.upsell && f.pieces === 2 ? { ...pack(f.upPriceMode, f.upPrice), nameEn: names.upsellNameEn, nameBn: names.upsellNameBn } : null,
  } as AutoRuleInput;
}

/** A rule card's change call: POST /rules/:id/<what>, then what to do with the server's answer. */
export type RulePost = (what: string, body: Record<string, unknown>, done?: (v: AutoRuleView) => void) => Promise<void>;

export const WIZARD_STEPS = 8;

/** May the wizard go past this step? (1: something bound; 3: pairs made; 4: a price, when the person may set one.) */
export function stepOk(step: number, f: RuleForm, live: { products: number; made: number } | null, canPrice: boolean): boolean {
  if (step === 1) return f.categoryIds.length + f.productIds.length > 0 && (live === null || live.products > 0);
  if (step === 3) return live === null || live.made > 0;
  if (step === 4) return !canPrice || (!priceBad(f.priceMode, f.price) && pack(f.priceMode, f.price)[f.priceMode === 'FIXED' ? 'priceMinor' : 'percentOff'] !== null);
  return true;
}
