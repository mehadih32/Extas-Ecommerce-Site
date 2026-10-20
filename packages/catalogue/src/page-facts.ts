// PR 33 — what a supplier's or brand's product page says about the product, read from the page's own structured data
// (schema.org Product in JSON-LD, including @graph and ProductGroup variants), its OpenGraph / product meta tags, the
// title and the first heading. Pure: no network, no database. Nothing here is trusted as the shop's own data — the
// draft (link-import.ts) takes only the name, description and the matches to the shop's own dictionaries; the price,
// sizes and the supplier's SKU are shown for information only.

export interface PagePrice {
  amount: string;
  currency: string | null;
}

export interface PageFacts {
  /** The page's own address after forwarding (relative photo links resolve against it). */
  url: string;
  title: string | null;
  name: string | null;
  description: string | null;
  brand: string | null;
  colours: string[];
  sizes: string[];
  material: string | null;
  /** The supplier's own code: information only, never written as the ERP style code. */
  sku: string | null;
  /** Information only: a price is the owner's decision (CLAUDE.md rule 6) and is never copied. */
  price: PagePrice | null;
  /** Absolute http(s) photo links, at most `maxImages`. Not copied: the owner uploads his own photos. */
  images: string[];
  /** Where each fact came from: `jsonld`, `meta`, `html`. */
  sources: string[];
}

const NAME_MAX = 200;
const TEXT_MAX = 10_000;
const LIST_MAX = 40;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Plain text: tags out, entities decoded, white space folded, cut at `max`. */
export function plainText(s: string, max = TEXT_MAX): string {
  const t = decodeEntities(
    s
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return t.length > max ? t.slice(0, max).trimEnd() : t;
}

const oneLine = (s: string, max = NAME_MAX) => plainText(s, max * 2).replace(/\s+/g, ' ').slice(0, max).trim();

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1]!.toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: Json | undefined): Json[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const typesOf = (o: Obj) => list(o['@type']).filter((t): t is string => typeof t === 'string').map((t) => t.replace(/^.*[/#]/, ''));

/** Every JSON-LD object on the page, flattened (arrays and @graph opened). */
function jsonLdObjects(html: string): Obj[] {
  const out: Obj[] = [];
  const walk = (v: Json, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (!isObj(v)) return;
    out.push(v);
    if (Array.isArray(v['@graph'])) walk(v['@graph'], depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1]!.trim()) as Json, 0);
    } catch {
      // a broken block is skipped; the meta tags still count
    }
  }
  return out;
}

const text = (v: Json | undefined): string | null => {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (isObj(v)) return text(v.name ?? v['@value'] ?? v.value);
  if (Array.isArray(v)) return text(v[0]);
  return null;
};

const strings = (v: Json | undefined): string[] =>
  list(v)
    .flatMap((x) => (typeof x === 'string' ? x.split(/\s*[,/|]\s*/) : [text(x) ?? '']))
    .map((s) => oneLine(s, 60))
    .filter(Boolean);

const uniq = (l: string[]) => {
  const seen = new Set<string>();
  return l.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function absolute(link: string, base: string): string | null {
  try {
    const u = new URL(decodeEntities(link.trim()), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function imagesOf(v: Json | undefined): string[] {
  return list(v).flatMap((x) => (typeof x === 'string' ? [x] : isObj(x) ? [text(x.url) ?? text(x.contentUrl) ?? ''] : [])).filter(Boolean);
}

function priceOf(o: Obj): PagePrice | null {
  for (const offer of list(o.offers)) {
    if (!isObj(offer)) continue;
    const amount = text(offer.price) ?? text(offer.lowPrice) ?? (isObj(offer.priceSpecification) ? text(offer.priceSpecification.price) : null);
    if (amount) return { amount, currency: text(offer.priceCurrency) ?? (isObj(offer.priceSpecification) ? text(offer.priceSpecification.priceCurrency) : null) };
  }
  return null;
}

/** The facts of a product page. `maxImages` caps the photo links (a setting). */
export function parseProductPage(html: string, pageUrl: string, maxImages: number): PageFacts {
  const sources = new Set<string>();
  const objects = jsonLdObjects(html);
  const product = objects.find((o) => typesOf(o).includes('Product')) ?? objects.find((o) => typesOf(o).includes('ProductGroup')) ?? null;
  const variants = product ? list(product.hasVariant).filter(isObj) : [];

  const meta = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase();
    if (key && a.content !== undefined && !meta.has(key)) meta.set(key, a.content);
  }
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];

  const pick = (from: string, v: string | null | undefined) => {
    if (v) sources.add(from);
    return v || null;
  };

  const title = titleTag ? oneLine(titleTag) || null : null;
  const name =
    pick('jsonld', product ? oneLine(text(product.name) ?? '') : null) ??
    pick('meta', oneLine(meta.get('og:title') ?? '')) ??
    pick('html', h1 ? oneLine(h1) : null) ??
    pick('html', title ? oneLine(title.split(/\s+[|–—-]\s+/)[0] ?? title) : null);
  const description =
    pick('jsonld', product ? plainText(text(product.description) ?? '') : null) ??
    pick('meta', plainText(meta.get('og:description') ?? '')) ??
    pick('meta', plainText(meta.get('description') ?? ''));
  const brand = pick('jsonld', product ? oneLine(text(product.brand) ?? text(product.manufacturer) ?? '', 120) : null) ?? pick('meta', oneLine(meta.get('product:brand') ?? meta.get('og:brand') ?? '', 120));

  const colours = uniq([...(product ? strings(product.color) : []), ...variants.flatMap((v) => strings(v.color)), ...strings(meta.get('product:color') ?? undefined)]).slice(0, LIST_MAX);
  const sizeProps = product ? list(product.additionalProperty).filter((p): p is Obj => isObj(p) && /^size$/i.test(text(p.name) ?? '')) : [];
  const sizes = uniq([...(product ? strings(product.size) : []), ...variants.flatMap((v) => strings(v.size)), ...sizeProps.flatMap((p) => strings(p.value)), ...strings(meta.get('product:size') ?? undefined)]).slice(0, LIST_MAX);
  if (colours.length || sizes.length) sources.add(product ? 'jsonld' : 'meta');
  const material = pick('jsonld', product ? oneLine(text(product.material) ?? '', 300) : null) ?? pick('meta', oneLine(meta.get('product:material') ?? '', 300));
  const sku = product ? oneLine(text(product.sku) ?? text(product.mpn) ?? text(product.productGroupID) ?? '', 80) || null : null;
  const metaAmount = meta.get('product:price:amount') ?? meta.get('og:price:amount');
  const price = (product ? priceOf(product) ?? variants.map(priceOf).find(Boolean) ?? null : null) ?? (metaAmount ? { amount: metaAmount.trim(), currency: meta.get('product:price:currency') ?? meta.get('og:price:currency') ?? null } : null);

  const images = uniq(
    [...(product ? imagesOf(product.image) : []), ...variants.flatMap((v) => imagesOf(v.image)), meta.get('og:image') ?? '', meta.get('og:image:secure_url') ?? '']
      .filter(Boolean)
      .map((l) => absolute(l, pageUrl))
      .filter((l): l is string => !!l),
  ).slice(0, Math.max(0, maxImages));

  return { url: pageUrl, title, name, description, brand, colours, sizes, material, sku, price, images, sources: [...sources] };
}

/** Lower-case words of a text (letters with their marks and digits of any script), for matching against the shop's dictionaries. */
export function wordsOf(s: string): string[] {
  return (s.toLowerCase().normalize('NFKC').match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}
