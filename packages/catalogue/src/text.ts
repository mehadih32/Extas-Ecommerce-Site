// Pure text helpers of the catalogue: links (slugs), the name/link/title templates of PR 590, dictionary matching and
// the "other brand's name" note. Ported from the approved demo (docs/demo/src/95-admin-naming.js, nm_slug, nm_tpl,
// nm_brandHits, nm_norm) so the real shop behaves exactly like the demo. No database, no settings: callers pass them.

export interface SlugOptions {
  /** `naming.slugMaxLength` */
  maxLength: number;
  /** `naming.slugAmpersand`: the word a "&" becomes. */
  ampersand: string;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isSlug = (s: string): boolean => SLUG_RE.test(s);

const stripMarks = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** A link from any text: English letters and digits joined by hyphens ("Piqué Polo & Co" → "pique-polo-and-co"). */
export function slugify(text: string, opts: SlugOptions): string {
  return stripMarks(String(text ?? ''))
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ` ${opts.ampersand} `)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, opts.maxLength)
    .replace(/-+$/, '');
}

const reEsc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The values of the template tokens for one product (see `namingTokens` in @extas/settings). */
export type TokenValues = Record<string, string>;

/**
 * Fills a template. A token with no value becomes empty; an unknown token stays as written (the setting's schema only
 * allows known tokens). Afterwards the brand said twice in a row ("Lacoste Lacoste Polo") is said once, a word or
 * phrase repeated in a row ("Pique Polo Polo") is said once, and stray separators at the ends are dropped — the demo's
 * nm_tpl rules. With `slug` the result is a link.
 */
export function fillTemplate(template: string, values: TokenValues, slug?: SlugOptions): string {
  const out0 = String(template ?? '').replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(values, k) ? (values[k] ?? '') : m));
  const brand = values.brand ?? '';
  let out = out0;
  if (brand) {
    const b = reEsc(brand);
    out = out.replace(new RegExp(`(${b})[\\s\\-]+${b}(?=$|[^A-Za-z0-9])`, 'gi'), '$1');
  }
  if (slug) {
    let s = slugify(out, slug);
    const bs = slugify(brand, slug);
    if (bs) s = s.replace(new RegExp(`(^|-)${reEsc(bs)}-${reEsc(bs)}(?=-|$)`), `$1${bs}`);
    return s.replace(/(^|-)((?:[a-z0-9]+-){0,2}[a-z0-9]+)(?:-\2)+(?=-|$)/g, '$1$2');
  }
  out = out.replace(/(^|\s)(\S+(?:\s\S+){0,2})(?:\s+\2)+(?=\s|$)/gi, '$1$2');
  return out
    .replace(/\s{2,}/g, ' ')
    // separators left next to each other by an empty token ("Polo — | Shop") keep only the last one
    .replace(/(?:\s+[—|·-])+(?=\s)/g, (m) => ` ${m.trim().slice(-1)}`)
    .replace(/\s+([,.।])/g, '$1')
    .replace(/^[\s,.।|·—-]+|[\s,|·—-]+$/g, '')
    .replace(/([.।])[\s.।]*(?=[.।])/g, '')
    .trim();
}

/** The name without the brand in front ("Lacoste Classic Polo" → "Classic Polo"). */
export function stripBrand(name: string, brand: string): string {
  const n = String(name ?? '');
  return brand && n.toLowerCase().startsWith(`${brand.toLowerCase()} `) ? n.slice(brand.length + 1) : n;
}

/** True when `word` appears in `text` as a whole word (case-insensitive). */
export function hasWord(text: string, word: string): boolean {
  if (!word) return false;
  return new RegExp(`(^|[^a-z0-9])${reEsc(word.toLowerCase())}($|[^a-z0-9])`).test(String(text ?? '').toLowerCase());
}

/**
 * The names from `brands` found in `text` (a name, link or title). The product's own brand never counts, nor a listed
 * brand that is part of it ("Polo Ralph Lauren" on a Ralph Lauren product). In a link the brand is looked for as
 * whole hyphen-separated words.
 */
export function otherBrandHits(text: string, ownBrand: string, brands: readonly string[], isLink: boolean, slug: SlugOptions): string[] {
  if (!text) return [];
  const ownS = slugify(ownBrand, slug);
  const hay = `-${slugify(text, slug)}-`;
  const out: string[] = [];
  for (const b of brands) {
    const bs = slugify(b, slug);
    if (!bs) continue;
    if (ownS && (ownS.includes(bs) || bs.includes(ownS))) continue;
    const hit = isLink ? hay.includes(`-${bs}-`) : hasWord(String(text).replace(/['’]/g, ''), b.replace(/['’]/g, ''));
    if (hit && !out.includes(b)) out.push(b);
  }
  return out;
}

/** A name as the dictionary compares it: no accents, lower case, single spaces ("  Bottle  GREEN " → "bottle green"). */
export function normalizeName(s: string): string {
  return stripMarks(String(s ?? ''))
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

/**
 * A path as the redirect table stores it: no host, query or hash, a leading slash, no trailing slash, lower case
 * ("https://shop.example/Product/Old-Polo/?x=1" → "/product/old-polo"). The demo's nm_norm.
 */
export function normalizePath(path: string): string {
  let p = String(path ?? '').trim();
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep as typed */
  }
  p = p.replace(/^https?:\/\/[^/]+/i, '').replace(/^#/, '').split('?')[0]!.split('#')[0]!;
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/+$/, '');
  return (p || '/').toLowerCase();
}

/** The product page path for a link: `naming.productPathPrefix` + "/" + slug. */
export const productPath = (prefix: string, slug: string): string => `${prefix.replace(/\/+$/, '')}/${slug}`;

/** The slug in a product path, or null when the path is not under the prefix. */
export function slugFromPath(prefix: string, path: string): string | null {
  const p = normalizePath(path);
  const pre = normalizePath(prefix);
  if (!p.startsWith(`${pre}/`)) return null;
  const rest = p.slice(pre.length + 1);
  return isSlug(rest) ? rest : null;
}

/** Characters (code points) of a title, for the length notes. */
export const charCount = (s: string): number => [...String(s ?? '')].length;
