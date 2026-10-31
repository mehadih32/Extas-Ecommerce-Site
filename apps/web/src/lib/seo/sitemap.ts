// S11 · PR 228 — the sitemaps (Blueprint C12.1 "sitemaps split by type, regenerated automatically"). Pure: what goes
// in, how it is split and how it is written. The data (which pages may be listed) is lib/seo/sitemap-data; the routes
// are app/sitemap.xml (the index) and app/sitemaps/[file] (one file of one kind).
// - Four kinds, one file each (more when a kind holds more than `perFile` addresses): `pages` (home, help pages, the
//   sets hub and builder), `collections` (collections, sub-collections and the named filter pages of PR 227),
//   `products`, `combos` (featured sets and the colour-pair lists on sale).
// - Every address is absolute on the shop's own domain (lib/seo/site). A page whose Bengali twin passed the translation
//   gate (PR 588) is written twice, English and Bengali, each naming both (hreflang, and x-default → English when the
//   owner keeps it); a page without a ready twin is written once, in English.
// - A kind that is empty still has its file (an empty list), so the index never names a file that answers 404.
import { hrefIn } from '../shop/lang';

export const SITEMAP_KINDS = ['pages', 'collections', 'products', 'combos'] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

export interface SitemapEntry {
  /** The page's path without /bn (it may carry a query: a named filter page). */
  path: string;
  /** When the page last changed, when known. */
  lastmod?: Date | null;
  /** The Bengali twin passed the gate: write both twins with their hreflang pair. */
  bn: boolean;
}

export type SitemapSet = Record<SitemapKind, SitemapEntry[]>;

/** A file's name: `products-1.xml`. */
export const sitemapFileName = (kind: SitemapKind, n: number): string => `${kind}-${n}.xml`;

/** The kind and number a file name asks for, or null. */
export function parseSitemapFile(name: string): { kind: SitemapKind; n: number } | null {
  const m = /^([a-z]+)-([1-9]\d{0,4})\.xml$/.exec(name);
  if (!m || !(SITEMAP_KINDS as readonly string[]).includes(m[1]!)) return null;
  return { kind: m[1] as SitemapKind, n: Number(m[2]) };
}

/** How many files a kind takes (at least one: an empty kind still answers). A Bengali twin counts as an address. */
export function filesOf(entries: readonly SitemapEntry[], perFile: number): SitemapEntry[][] {
  const out: SitemapEntry[][] = [[]];
  let used = 0;
  for (const e of entries) {
    const size = e.bn ? 2 : 1;
    if (used + size > perFile && out[out.length - 1]!.length) {
      out.push([]);
      used = 0;
    }
    out[out.length - 1]!.push(e);
    used += size;
  }
  return out;
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const xmlEscape = (s: string): string => s.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]!);

const day = (d: Date) => d.toISOString().slice(0, 10);
const abs = (origin: URL, path: string) => new URL(path, origin).toString();

/** The latest change of a list (null when none is known). */
export function latest(entries: readonly SitemapEntry[]): Date | null {
  let best: Date | null = null;
  for (const e of entries) if (e.lastmod && (!best || e.lastmod > best)) best = e.lastmod;
  return best;
}

/** One file of addresses (`<urlset>`), with the Bengali twins and their hreflang pair. */
export function urlsetXml(origin: URL, entries: readonly SitemapEntry[], xDefault: 'en' | 'none'): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const e of entries) {
    const en = abs(origin, hrefIn('en', e.path));
    const bn = abs(origin, hrefIn('bn', e.path));
    const pair = e.bn
      ? [`<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}"/>`, `<xhtml:link rel="alternate" hreflang="bn" href="${xmlEscape(bn)}"/>`, ...(xDefault === 'en' ? [`<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(en)}"/>`] : [])]
      : [];
    const mod = e.lastmod ? `<lastmod>${day(e.lastmod)}</lastmod>` : '';
    for (const loc of e.bn ? [en, bn] : [en]) out.push(`<url><loc>${xmlEscape(loc)}</loc>${mod}${pair.join('')}</url>`);
  }
  out.push('</urlset>');
  return `${out.join('\n')}\n`;
}

/** The index (`<sitemapindex>`): every file of every kind, at `/sitemaps/<kind>-<n>.xml`. */
export function indexXml(origin: URL, files: readonly { name: string; lastmod: Date | null }[]): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const f of files) out.push(`<sitemap><loc>${xmlEscape(abs(origin, `${SITEMAPS_DIR}/${f.name}`))}</loc>${f.lastmod ? `<lastmod>${day(f.lastmod)}</lastmod>` : ''}</sitemap>`);
  out.push('</sitemapindex>');
  return `${out.join('\n')}\n`;
}

/** Where the kind files live (the index is `/sitemap.xml`). */
export const SITEMAPS_DIR = '/sitemaps';
export const SITEMAP_INDEX = '/sitemap.xml';

/** At most `max` addresses in all, in kind order (a Bengali twin counts; a page is never written without its twin). */
export function capSet(set: SitemapSet, max: number): SitemapSet {
  let room = max;
  const out = {} as SitemapSet;
  for (const kind of SITEMAP_KINDS) {
    out[kind] = [];
    for (const e of set[kind]) {
      const size = e.bn ? 2 : 1;
      if (size > room) {
        room = 0;
        break;
      }
      out[kind].push(e);
      room -= size;
    }
  }
  return out;
}

/** Every file of a set, in kind order, with its latest change. */
export function filesOfSet(set: SitemapSet, perFile: number): { name: string; kind: SitemapKind; n: number; entries: SitemapEntry[]; lastmod: Date | null }[] {
  return SITEMAP_KINDS.flatMap((kind) => filesOf(set[kind], perFile).map((entries, i) => ({ name: sitemapFileName(kind, i + 1), kind, n: i + 1, entries, lastmod: latest(entries) })));
}
