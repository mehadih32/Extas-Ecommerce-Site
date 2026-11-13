// S28 · PR 681 — /sitemaps/videos.xml: the product videos for search engines (lib/seo/video-sitemap).
import { videoSitemapResponse } from '@/lib/seo/sitemap-route';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return videoSitemapResponse();
}
