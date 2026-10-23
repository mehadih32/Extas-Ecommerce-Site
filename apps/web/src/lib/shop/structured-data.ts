// PR 45 · follow-up 35 (Blueprint C12.1 "visible price and availability matching JSON-LD", C12.4, A4 §9):
// the JSON-LD the shop's pages carry, built only from what the page itself draws: the breadcrumb trail and the category
// page's list of products. Pure: the pages pass their own data in.
export interface LdCrumb {
  name: string;
  /** The page's own address (path, in the page's language); the last crumb is the page itself. */
  href: string;
}

export interface LdListItem {
  name: string;
  href: string;
}

type Ld = Record<string, unknown>;

const CONTEXT = 'https://schema.org';

/** An absolute address on the shop's own origin (the origin the request came in on). */
export function absolute(origin: URL | string, href: string): string {
  return new URL(href, origin).toString();
}

export function breadcrumbLd(origin: URL | string, crumbs: readonly LdCrumb[]): Ld | null {
  if (crumbs.length < 2) return null;
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absolute(origin, c.href) })),
  };
}

export function itemListLd(origin: URL | string, name: string, items: readonly LdListItem[]): Ld | null {
  if (!items.length) return null;
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: absolute(origin, x.href), name: x.name })),
  };
}

/** One `<script type="application/ld+json">` body: JSON with `<` escaped, so a name can never close the script. */
export function ldJson(data: Ld | readonly Ld[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
