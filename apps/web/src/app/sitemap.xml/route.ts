// S11 · PR 228 — /sitemap.xml: the index of the shop's sitemaps, one file per kind (lib/seo/sitemap-route).
import { sitemapResponse } from '@/lib/seo/sitemap-route';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return sitemapResponse(null);
}
