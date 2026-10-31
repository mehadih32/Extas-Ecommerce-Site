// S11 · PR 228 — /sitemaps/<kind>-<n>.xml: one file of the shop's sitemaps (lib/seo/sitemap-route).
import { sitemapResponse } from '@/lib/seo/sitemap-route';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  return sitemapResponse((await ctx.params).file);
}
