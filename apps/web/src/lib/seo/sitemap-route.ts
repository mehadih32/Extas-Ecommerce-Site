// S11 · PR 228 — the answers of /sitemap.xml (the index) and /sitemaps/<kind>-<n>.xml (one file): XML on the shop's own
// address (lib/seo/site), made from the kept set (lib/seo/sitemap-data). Off (`seo.sitemaps.enabled`), or a file that
// does not exist, answers 404. A sitemap is never a search result itself (X-Robots-Tag), and a cache in front keeps it
// no longer than the set is kept here. PR 236: the language pairs only while `seo.hreflang.inSitemaps` is on.
import { shopStoreId } from '../shop/store-id';
import { siteAddress } from './site';
import { filesOfSet, indexXml, parseSitemapFile, urlsetXml } from './sitemap';
import { sitemapSet, sitemapSettings } from './sitemap-data';
import { indexWithVideos, videoSitemapItems, videoUrlsetXml } from './video-sitemap';

const xml = (body: string, minutes: number) =>
  new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': `public, max-age=0, s-maxage=${Math.max(60, minutes * 60)}`,
      'x-robots-tag': 'noindex',
    },
  });
const missing = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });

/** /sitemaps/videos.xml (S28 · PR 681). */
export async function videoSitemapResponse(): Promise<Response> {
  const storeId = shopStoreId();
  const set = await sitemapSettings(storeId);
  if (!set['seo.sitemaps'].enabled) return missing();
  const site = await siteAddress(storeId);
  if (!site.origin) return missing();
  return xml(videoUrlsetXml(await videoSitemapItems(storeId, site.origin).catch(() => [])), set['seo.sitemaps'].cacheMinutes);
}

/** `file`: null for the index, else the asked file name. */
export async function sitemapResponse(file: string | null): Promise<Response> {
  const storeId = shopStoreId();
  const set = await sitemapSettings(storeId);
  const s = set['seo.sitemaps'];
  if (!s.enabled) return missing();
  const asked = file === null ? null : parseSitemapFile(file);
  if (file !== null && !asked) return missing();
  const site = await siteAddress(storeId);
  if (!site.origin) return missing();
  const { set: entries } = await sitemapSet(storeId, set);
  const files = filesOfSet(entries, s.perFile);
  // S28 · PR 681: the video sitemap is listed while a live product has a video
  if (!asked) return xml(indexWithVideos(indexXml(site.origin, files), site.origin, (await videoSitemapItems(storeId, site.origin).catch(() => [])).length > 0), s.cacheMinutes);
  const one = files.find((f) => f.kind === asked.kind && f.n === asked.n);
  return one ? xml(urlsetXml(site.origin, one.entries, set['seo.indexing'].xDefault, set['seo.hreflang'].inSitemaps), s.cacheMinutes) : missing();
}
