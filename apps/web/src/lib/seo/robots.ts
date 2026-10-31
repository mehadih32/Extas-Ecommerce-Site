// S11 · PR 229 — the shop's robots.txt (Blueprint C12.1; App. answers #56: AI assistants may read the shop, on as
// shipped, so they can name it). Pure: the settings and the request's facts in, the text out.
// - Closed (the owner has not opened the shop to search engines, or the request is not on the store's own domain — the
//   preview, a raw IP): every robot is told to stay out (`Disallow: /`). The preview's own Caddy answers the same.
// - Open: every robot may read the shop except the admin, the API, the ERP's calls and the private pages of a customer
//   (bag, checkout, account, pay links, bulk enquiry: lib/seo/indexing PRIVATE_FAMILIES) in both languages, the search
//   results while they are not a listed kind, and the owner's own extra paths. With the AI switch off, each AI robot
//   the owner lists gets its own group that keeps it out of everything. The sitemap's address closes the file while
//   sitemaps are on.
import type { SeoRobots } from '@extas/settings';
import { BN_PREFIX } from '../shop/lang';
import { ROUTES } from '../shop/routes';
import { PRIVATE_FAMILIES } from './indexing';

/** The paths no robot reads on an open shop: never shop pages, then a customer's own pages in both languages. */
export function closedPaths(searchListed: boolean): string[] {
  const families = [...PRIVATE_FAMILIES, ...(searchListed ? [] : [ROUTES.search.slice(1)])];
  return ['/admin', '/api/', '/erp-api/', ...families.flatMap((f) => [`/${f}`, `${BN_PREFIX}/${f}`])];
}

export interface RobotsFacts {
  /** The shop is open to search engines (`seo.indexing.searchEngines`) and the request came in on the primary domain. */
  open: boolean;
  /** `seo.indexing.pages.search`: the search results may be listed. */
  searchListed: boolean;
  /** The sitemap's full address, or null (sitemaps off, or no address known). */
  sitemap: string | null;
}

/** The robots.txt text. */
export function robotsTxt(policy: SeoRobots, f: RobotsFacts): string {
  if (!f.open) return 'User-agent: *\nDisallow: /\n';
  const closed = [...new Set([...closedPaths(f.searchListed), ...policy.disallow])];
  const lines = ['User-agent: *', ...closed.map((p) => `Disallow: ${p}`), 'Allow: /'];
  if (!policy.aiCrawlers) for (const bot of policy.aiBots) lines.push('', `User-agent: ${bot}`, 'Disallow: /');
  if (f.sitemap) lines.push('', `Sitemap: ${f.sitemap}`);
  return `${lines.join('\n')}\n`;
}
