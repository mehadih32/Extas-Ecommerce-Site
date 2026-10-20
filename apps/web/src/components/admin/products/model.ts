// PR 21, 26, 29, 35 — the product screens' pure part (no React, no database), shared by the server pages and the
// browser components and tested on its own (model.test.ts):
// - money: the store's currency (`store.currency`) and locale; prices are typed in whole units and sent in minor units;
// - the publish checklist as text (the check codes of @extas/catalogue health.ts → messages, never the server's words);
// - the edit form: its state from the saved product, and the one "Save changes" request built from what changed.
import type { CheckResult, NamingView, ProductFormInput, ProductView, VariantView } from '@extas/catalogue';
import { t, type Dict } from '@/lib/i18n';

// ------------------------------------------------------------------------------------------------ shared shapes

export interface Money {
  currency: string;
  locale: string;
  /** The currency's minor-unit digits (from Intl). */
  digits: number;
}

export interface CategoryOption {
  id: string;
  nameEn: string;
  nameBn: string | null;
  depth: number;
}
export interface FabricOption {
  id: string;
  nameEn: string;
  nameBn: string | null;
}
export interface ColourOption {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  erpColorCode: string | null;
}
export interface SizeOption {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  erpSizeCode: string | null;
}

export type Lang = 'bn' | 'en';

/** The name in the page language, else the English one. */
export const nameIn = (lang: Lang, o: { nameEn: string; nameBn: string | null }) => (lang === 'bn' && o.nameBn ? o.nameBn : o.nameEn);

// ------------------------------------------------------------------------------------------------ money

export function moneyOf(currency: string, locale: string): Money {
  let digits: number;
  try {
    digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  } catch {
    digits = 0;
  }
  return { currency, locale, digits };
}

/** Whole numbers as the demo writes them: Western digits in both languages (the admin's own choice, V12). */
export function formatNumber(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).format(n);
  } catch {
    return String(n);
  }
}

export function formatMoney(minor: number, m: Money): string {
  const unit = 10 ** m.digits;
  try {
    return new Intl.NumberFormat(m.locale, { style: 'currency', currency: m.currency, currencyDisplay: 'narrowSymbol', numberingSystem: 'latn', minimumFractionDigits: minor % unit === 0 ? 0 : m.digits, maximumFractionDigits: m.digits }).format(minor / unit);
  } catch {
    return String(minor / unit);
  }
}

/** A stored price as the form shows it: whole units, no trailing zeros; '' when there is none. */
export function toMajor(minor: number | null | undefined, m: Money): string {
  return minor == null ? '' : String(minor / 10 ** m.digits);
}

/** A typed price in minor units; null = empty; undefined = not a valid amount. */
export function toMinor(text: string, m: Money): number | null | undefined {
  const v = text.trim().replace(/,/g, '');
  if (!v) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(v);
  if (!match) return undefined;
  if ((match[2]?.length ?? 0) > m.digits) return undefined;
  return Math.round(Number(v) * 10 ** m.digits);
}

// ------------------------------------------------------------------------------------------------ the checklist as text

const listOf = (dict: Dict, items: string[]) => items.join(t(dict, 'checks.sep'));

/** Detail codes with a `more:n` tail turned into words. */
function withMore(dict: Dict, details: string[], each: (d: string) => string | null): string {
  const out: string[] = [];
  for (const d of details) {
    if (d.startsWith('more:')) out.push(t(dict, 'checks.more', { n: d.slice(5) }));
    else {
      const s = each(d);
      if (s) out.push(s);
    }
  }
  return listOf(dict, out);
}

/** One failing (or passing) check, in a short sentence. */
export function checkText(dict: Dict, c: Pick<CheckResult, 'key' | 'ok' | 'details'>, colourName: (id: string) => string = (id) => id): string {
  const k = `checks.${c.key}`;
  if (c.ok) return t(dict, `${k}.ok`);
  const d = c.details;
  switch (c.key) {
    case 'price':
      return d.includes('none') ? t(dict, `${k}.none`) : t(dict, `${k}.sku`, { list: withMore(dict, d, (x) => (x.startsWith('sku:') ? x.slice(4) : null)) });
    case 'photos': {
      const count = d.find((x) => x.startsWith('count:'))?.slice(6) ?? '';
      const [have = '', need = ''] = count.split('/');
      const kinds = d
        .filter((x) => !x.startsWith('count:'))
        .map((x) => (x.startsWith('FRONT:') ? t(dict, 'products.photos.frontOf', { colour: colourName(x.slice(6)) }) : t(dict, `products.photos.kinds.${x}`)));
      return kinds.length ? t(dict, `${k}.missing`, { count: have, minimum: need, list: listOf(dict, kinds) }) : t(dict, `${k}.few`, { count: have, minimum: need });
    }
    case 'seo':
      return t(dict, `${k}.missing`, {
        list: withMore(dict, d, (x) => {
          const [field = '', flag] = x.split(':');
          const name = t(dict, `checks.seo.fields.${field}`);
          return flag === 'over' ? t(dict, 'checks.seo.over', { field: name }) : name;
        }),
      });
    default: {
      const code = d.includes('archived') ? 'archived' : 'none';
      const text = t(dict, `${k}.${code}`);
      return text === `${k}.${code}` ? t(dict, `${k}.none`) : text;
    }
  }
}

/**
 * A refusal as text: `products.errors.<code>`, else the admin's `errors.<code>`, else the general server error. The
 * form's `step:` / `saved:` markers become "saved … stopped at …"; CHECKLIST_FAILED names the checks.
 */
export function refusalText(dict: Dict, code: string | undefined, details: string[] = []): string {
  const c = code ?? 'server-error';
  const steps = details.filter((x) => x.startsWith('step:')).map((x) => t(dict, `products.save.steps.${x.slice(5)}`));
  const saved = details.filter((x) => x.startsWith('saved:')).map((x) => t(dict, `products.save.steps.${x.slice(6)}`));
  const rest = details.filter((x) => !x.startsWith('step:') && !x.startsWith('saved:'));
  const fields = c === 'CHECKLIST_FAILED' ? listOf(dict, rest.map((k) => t(dict, `checks.${k}.label`))) : rest.join(', ');
  let text = t(dict, `products.errors.${c}`, { fields });
  if (text === `products.errors.${c}`) text = t(dict, `errors.${c}`, { fields });
  if (text === `errors.${c}`) text = t(dict, 'errors.server-error');
  if (steps.length) text = `${text} ${t(dict, saved.length ? 'products.save.partial' : 'products.save.stopped', { step: listOf(dict, steps), saved: listOf(dict, saved) })}`;
  return text;
}

// ------------------------------------------------------------------------------------------------ the edit form

export interface PriceCell {
  price: string;
  compareAt: string;
}
export interface FreshCell extends PriceCell {
  sku: string;
}

export interface FormState {
  categoryId: string;
  fabricId: string;
  erpStyleCode: string;
  descriptionEn: string;
  descriptionBn: string;
  careEn: string;
  careBn: string;
  nameEn: string;
  nameBn: string;
  slug: string;
  seoTitleEn: string;
  seoTitleBn: string;
  metaDescriptionEn: string;
  metaDescriptionBn: string;
  feedTitle: string;
  /** The product's colours, in order. */
  colours: string[];
  /** The sizes shown in the grid (sizes with a live variant, plus any picked now). */
  sizes: string[];
  /** Live variants' prices, by variant id. */
  prices: Record<string, PriceCell>;
  /** New colour × size cells, by comboKey(). A cell without a SKU is not made. */
  fresh: Record<string, FreshCell>;
}

export const comboKey = (colourId: string | null, sizeId: string | null) => `${colourId ?? ''}|${sizeId ?? ''}`;
export const liveVariants = (p: Pick<ProductView, 'variants'>) => p.variants.filter((v) => !v.archived);

const own = (f: { value: string; source: string }) => (f.source === 'own' ? f.value : '');

export function initialState(p: ProductView, n: NamingView, m: Money): FormState {
  const live = liveVariants(p);
  const sizes = [...new Map(live.filter((v) => v.size).map((v) => [v.size!.id, v.size!.sortOrder])).entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  return {
    categoryId: p.category?.id ?? '',
    fabricId: p.fabric?.id ?? '',
    erpStyleCode: p.erpStyleCode ?? '',
    descriptionEn: p.descriptionEn ?? '',
    descriptionBn: p.descriptionBn ?? '',
    careEn: p.careEn ?? '',
    careBn: p.careBn ?? '',
    nameEn: n.nameEn,
    nameBn: n.nameBn ?? '',
    slug: n.slug,
    seoTitleEn: own(n.seoTitle.en),
    seoTitleBn: own(n.seoTitle.bn),
    metaDescriptionEn: own(n.metaDescription.en),
    metaDescriptionBn: own(n.metaDescription.bn),
    feedTitle: own(n.feedTitle),
    colours: p.colours.filter((c) => !c.archived).map((c) => c.colourId),
    sizes,
    prices: Object.fromEntries(live.map((v) => [v.id, { price: toMajor(v.priceMinor, m), compareAt: toMajor(v.compareAtMinor, m) }])),
    fresh: {},
  };
}

/** The variant that is retired by this draft: its colour or its size is no longer picked. */
export function isDropped(v: VariantView, s: Pick<FormState, 'colours' | 'sizes'>): boolean {
  return (!!v.colour && !s.colours.includes(v.colour.id)) || (!!v.size && !s.sizes.includes(v.size.id));
}

const PRODUCT_FIELDS = ['categoryId', 'fabricId', 'erpStyleCode', 'descriptionEn', 'descriptionBn', 'careEn', 'careBn'] as const;
const NAMING_OPTIONAL = ['nameBn', 'seoTitleEn', 'seoTitleBn', 'metaDescriptionEn', 'metaDescriptionBn', 'feedTitle'] as const;

export interface Built {
  input: ProductFormInput;
  /** What cannot be sent as typed: `nameEn`, `price:<SKU or colour/size>`, `compareAt:<…>`. */
  problems: string[];
  dirty: boolean;
}

/**
 * The "Save changes" request: only what differs from the saved state. Empty text clears an optional field (null);
 * prices are sent only by someone who may change them (`catalogue.prices`; the server checks again).
 */
export function buildSave(base: FormState, draft: FormState, p: ProductView, m: Money, canPrices: boolean): Built {
  const input: ProductFormInput = {};
  const problems: string[] = [];
  const nul = (v: string) => (v.trim() ? v.trim() : null);

  const product: NonNullable<ProductFormInput['product']> = {};
  for (const f of PRODUCT_FIELDS) if (draft[f] !== base[f]) product[f] = nul(draft[f]);
  if (Object.keys(product).length) input.product = product;

  const naming: NonNullable<ProductFormInput['naming']> = {};
  if (draft.nameEn !== base.nameEn) {
    if (!draft.nameEn.trim()) problems.push('nameEn');
    else naming.nameEn = draft.nameEn.trim();
  }
  if (draft.slug !== base.slug) naming.slug = draft.slug.trim();
  for (const f of NAMING_OPTIONAL) if (draft[f] !== base[f]) naming[f] = nul(draft[f]);
  if (Object.keys(naming).length) input.naming = naming;

  const live = liveVariants(p);
  const retire = live.filter((v) => isDropped(v, draft)).map((v) => v.id);
  if (retire.length) input.retire = retire;

  const price = (cell: PriceCell, label: string) => {
    const pm = toMinor(cell.price, m);
    const cm = toMinor(cell.compareAt, m);
    if (pm === undefined) problems.push(`price:${label}`);
    if (cm === undefined) problems.push(`compareAt:${label}`);
    return { pm, cm };
  };

  if (canPrices) {
    const variants: NonNullable<ProductFormInput['variants']> = [];
    for (const v of live) {
      if (retire.includes(v.id)) continue;
      const was = base.prices[v.id];
      const now = draft.prices[v.id];
      if (!was || !now || (was.price === now.price && was.compareAt === now.compareAt)) continue;
      const { pm, cm } = price(now, v.sku);
      if (pm === undefined || cm === undefined) continue;
      const patch: { priceMinor?: number | null; compareAtMinor?: number | null } = {};
      if (was.price !== now.price) patch.priceMinor = pm;
      if (was.compareAt !== now.compareAt) patch.compareAtMinor = cm;
      variants.push({ id: v.id, patch });
    }
    if (variants.length) input.variants = variants;
  }

  const coloursChanged = draft.colours.length !== base.colours.length || draft.colours.some((c, i) => base.colours[i] !== c);
  if (coloursChanged) input.colours = [...draft.colours];

  const existing = new Set(live.filter((v) => !retire.includes(v.id)).map((v) => comboKey(v.colour?.id ?? null, v.size?.id ?? null)));
  const create: NonNullable<ProductFormInput['create']> = [];
  for (const colourId of draft.colours) {
    for (const sizeId of draft.sizes) {
      const key = comboKey(colourId, sizeId);
      const cell = draft.fresh[key];
      if (existing.has(key) || !cell || !cell.sku.trim()) continue;
      const row: NonNullable<ProductFormInput['create']>[number] = { sku: cell.sku.trim(), colourId, sizeId };
      if (canPrices) {
        const { pm, cm } = price(cell, cell.sku.trim());
        if (pm === undefined || cm === undefined) continue;
        if (pm !== null) row.priceMinor = pm;
        if (cm !== null) row.compareAtMinor = cm;
      }
      create.push(row);
    }
  }
  if (create.length) input.create = create;

  return { input, problems, dirty: Object.keys(input).length > 0 || problems.length > 0 };
}
