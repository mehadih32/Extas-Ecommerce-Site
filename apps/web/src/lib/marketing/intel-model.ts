// S13 · PR 548 (register "Market and competitor intelligence"; demo MKT-07 `97x-adm2-marketing.js` "Market &
// competitors", `/admin/marketing/intel`) — reading a followed shop's own public page, pure: no network, no
// database. The owner supplies the link; `intel.ts` fetches it through the page reader connection (PR 33, the SAME
// one "Import from a link" and the source-link writer use, never a second reader) and hands the HTML here.
//
// - `parseCompetitorPage` reads every schema.org Product the page itself declares (JSON-LD `Product`/`@graph`,
//   the same standard structured data most shop pages already carry) plus its own headings — never anything the
//   page does not say about itself, and never a price we write back: "Proposals only — prices change in the ERP."
// - `matchProducts` lines a followed shop's products up against ours by name alone (Jaccard token overlap, the
//   same technique `blog.clusters`'s "alike topic" check already uses), so the page can show "they are lower" /
//   "you are lower" without ever guessing at a SKU that was never given.
// - `diffFacts` says what changed since the last time this link was read (a new product, a price that moved) —
//   the "Change alerts" card highlights this; nothing here sends the note anywhere by itself (that channel is not
//   built yet; an honest gap, left for the messaging PRs).
import { decodeEntities, plainText } from '@extas/catalogue';

export const URL_MAX = 2000; // hardcode-ok: a field length, not a business number
export const PRODUCTS_MAX = 60; // hardcode-ok: a page this size already covers a whole listing
export const HEADINGS_MAX = 12; // hardcode-ok: an outline this long is already plenty

export interface CompetitorFact {
  name: string;
  /** As the page itself wrote it (a string, not parsed): never trusted as a number until `matchProducts` reads it. */
  priceAmount: string | null;
  currency: string | null;
}

export interface CompetitorPageFacts {
  title: string | null;
  /** The page's own `<h2>`/`<h3>` headings, in order, deduplicated. */
  headings: string[];
  /** Every schema.org Product the page declares about itself, deduplicated by name. */
  products: CompetitorFact[];
}

const oneLine = (s: string, max = 200): string => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/gu, ' ').trim().slice(0, max);

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
const isObj = (v: Json | undefined): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: Json | undefined): Json[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const typesOf = (o: Obj) =>
  list(o['@type'])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.replace(/^.*[/#]/, ''));
const text = (v: Json | undefined): string | null => {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (isObj(v)) return text(v.name ?? v['@value'] ?? v.value);
  if (Array.isArray(v)) return text(v[0]);
  return null;
};

/** Every JSON-LD object on the page, flattened (arrays and `@graph` opened; a broken block is skipped). */
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
      // skipped
    }
  }
  return out;
}

function priceOf(o: Obj): { amount: string; currency: string | null } | null {
  for (const offer of list(o.offers)) {
    if (!isObj(offer)) continue;
    const amount = text(offer.price) ?? text(offer.lowPrice) ?? (isObj(offer.priceSpecification) ? text(offer.priceSpecification.price) : null);
    if (amount) return { amount, currency: text(offer.priceCurrency) ?? (isObj(offer.priceSpecification) ? text(offer.priceSpecification.priceCurrency) : null) };
  }
  return null;
}

/**
 * Reads a followed shop's own facts from its page: its title, its own `<h2>`/`<h3>` outline, and every product it
 * declares through schema.org structured data. A page with no JSON-LD product at all still gives its title and
 * headings; the caller decides whether that counts as `PAGE_UNREADABLE`.
 */
export function parseCompetitorPage(html: string, pageUrl: string): CompetitorPageFacts {
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const ogTitle = html.match(/<meta\b[^>]*\bproperty\s*=\s*["']og:title["'][^>]*>/i)?.[0]?.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
  const title = oneLine(ogTitle ?? titleTag ?? '', 200) || null;

  const headings: string[] = [];
  for (const m of html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)) {
    const h = oneLine(m[1]!, 150);
    if (h && !headings.includes(h)) headings.push(h);
    if (headings.length >= HEADINGS_MAX) break;
  }

  const products: CompetitorFact[] = [];
  const seen = new Set<string>();
  for (const o of jsonLdObjects(html)) {
    if (!typesOf(o).includes('Product')) continue;
    const name = oneLine(text(o.name) ?? '', 150);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const p = priceOf(o);
    products.push({ name, priceAmount: p?.amount ?? null, currency: p?.currency ?? null });
    if (products.length >= PRODUCTS_MAX) break;
  }

  return { title, headings, products };
}

/** An http(s) address with no user name or password (the page reader itself blocks private/blocked addresses). */
export function publicUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return null;
  u.hash = '';
  return u;
}

// ---- matching our products to theirs (PR 242's "alike topic" technique, reimplemented here: a different domain,
// the same small idea — Jaccard overlap of the words, nothing fancier) ----

const STOP = new Set(['a', 'an', 'and', 'for', 'of', 'the', 'to', 'with', 'in']);

export function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{M}\p{N}]+/u)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
}

export interface OurProduct {
  id: string;
  name: string;
  priceMinor: number;
}

export interface MatchedProduct {
  ourId: string;
  ourName: string;
  ourPriceMinor: number;
  theirName: string;
  /** null when their price could not be read as a number, or was in a different currency. */
  theirPriceMinor: number | null;
  /** `theirPriceMinor - ourPriceMinor`: negative means they are lower. */
  gapMinor: number | null;
  score: number;
}

/** Parses a page's own price string ("1,250.00") into minor units for the given currency's decimal places. */
function minorOf(amount: string, digits: number): number | null {
  const n = Number(amount.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10 ** digits) : null;
}

/**
 * For each of our products, the best-matching product this shop's page declared (Jaccard word overlap, at least
 * `minScore` of 0–1), with the price gap when a currency is readable and matches ours (or the page named none, in
 * which case it is read as the same currency). Only ever read, never written: "Proposals only — prices change in
 * the ERP."
 */
export function matchProducts(ours: readonly OurProduct[], theirs: readonly CompetitorFact[], minScore: number, currency: string, digits: number): MatchedProduct[] {
  const theirTokens = theirs.map((t) => tokens(t.name));
  const out: MatchedProduct[] = [];
  for (const o of ours) {
    const a = tokens(o.name);
    let best = -1;
    let bestIdx = -1;
    for (let i = 0; i < theirs.length; i++) {
      const s = jaccard(a, theirTokens[i]!);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || best < minScore) continue;
    const their = theirs[bestIdx]!;
    const theirPriceMinor = their.priceAmount && (!their.currency || their.currency.toUpperCase() === currency.toUpperCase()) ? minorOf(their.priceAmount, digits) : null;
    out.push({ ourId: o.id, ourName: o.name, ourPriceMinor: o.priceMinor, theirName: their.name, theirPriceMinor, gapMinor: theirPriceMinor === null ? null : theirPriceMinor - o.priceMinor, score: Math.round(best * 100) });
  }
  return out;
}

// ---- what changed since the last read ----

export type ChangeKind = 'first' | 'lower' | 'higher' | 'newProducts' | 'none';

export interface PriceChange {
  name: string;
  fromMinor: number | null;
  toMinor: number | null;
}

export interface FactsDiff {
  kind: ChangeKind;
  priceChanges: PriceChange[];
  newProducts: string[];
}

/** `prev` is the last report's facts (null on the very first read of this link). */
export function diffFacts(prev: CompetitorPageFacts | null, cur: CompetitorPageFacts, digits: number): FactsDiff {
  if (!prev) return { kind: 'first', priceChanges: [], newProducts: [] };
  const prevByName = new Map(prev.products.map((p) => [p.name.toLowerCase(), p] as const));
  const curNames = new Set(cur.products.map((p) => p.name.toLowerCase()));
  const newProducts = cur.products.filter((p) => !prevByName.has(p.name.toLowerCase())).map((p) => p.name);
  const priceChanges: PriceChange[] = [];
  for (const p of cur.products) {
    const was = prevByName.get(p.name.toLowerCase());
    if (!was) continue;
    const fromMinor = was.priceAmount ? minorOf(was.priceAmount, digits) : null;
    const toMinor = p.priceAmount ? minorOf(p.priceAmount, digits) : null;
    if (fromMinor !== null && toMinor !== null && fromMinor !== toMinor) priceChanges.push({ name: p.name, fromMinor, toMinor });
  }
  const removedCount = [...prevByName.keys()].filter((n) => !curNames.has(n)).length;
  const lowered = priceChanges.filter((c) => c.toMinor! < c.fromMinor!).length;
  const raised = priceChanges.length - lowered;
  const kind: ChangeKind = lowered >= raised && lowered > 0 ? 'lower' : raised > 0 ? 'higher' : newProducts.length || removedCount ? 'newProducts' : 'none';
  return { kind, priceChanges, newProducts };
}
