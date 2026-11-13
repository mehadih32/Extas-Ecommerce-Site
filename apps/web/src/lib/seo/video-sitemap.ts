// S28 · PR 681 — the video sitemap (/sitemaps/videos.xml): one <video:video> per product page that has a video, with its
// poster, title, description, length and either the player (a link video) or the clip's own address (an uploaded clip).
// Listed in the sitemap index only while there is at least one. Pure writing here; the loader reads the live rows.
import { getPrisma } from '@extas/db/client';
import { imageSources } from '@extas/media';
import { parseVideoLink } from '@extas/catalogue';
import { settingsResolver } from '../settings';
import { productPath } from '../shop/home-model';
import { readPageSettings } from '../shop/context';
import { xmlEscape } from './sitemap';

export interface VideoSitemapItem {
  /** Absolute address of the product page. */
  page: string;
  title: string;
  description: string;
  thumbnail: string;
  /** The player address (a link video) or the clip's address (an uploaded one). */
  player: string | null;
  content: string | null;
  durationSec: number;
  published: Date;
}

export const VIDEO_SITEMAP_FILE = 'videos.xml';

export function videoUrlsetXml(items: readonly VideoSitemapItem[]): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
  ];
  for (const v of items) {
    if (!v.player && !v.content) continue;
    out.push(
      `<url><loc>${xmlEscape(v.page)}</loc><video:video><video:thumbnail_loc>${xmlEscape(v.thumbnail)}</video:thumbnail_loc><video:title>${xmlEscape(v.title)}</video:title><video:description>${xmlEscape(v.description)}</video:description>${v.content ? `<video:content_loc>${xmlEscape(v.content)}</video:content_loc>` : ''}${v.player ? `<video:player_loc>${xmlEscape(v.player)}</video:player_loc>` : ''}<video:duration>${Math.round(v.durationSec)}</video:duration><video:publication_date>${v.published.toISOString()}</video:publication_date></video:video></url>`,
    );
  }
  out.push('</urlset>');
  return `${out.join('\n')}\n`;
}

/** The index with the video file added (before the closing tag); the index is returned as it came when there is no video. */
export function indexWithVideos(indexXml: string, origin: URL, any: boolean): string {
  if (!any) return indexXml;
  const loc = new URL(`/sitemaps/${VIDEO_SITEMAP_FILE}`, origin).toString();
  return indexXml.replace('</sitemapindex>', `<sitemap><loc>${xmlEscape(loc)}</loc></sitemap>\n</sitemapindex>`);
}

/** The videos of live products that have a poster and a length (what the sitemap may say), or none while the switch is off. */
export async function videoSitemapItems(storeId: number, origin: URL): Promise<VideoSitemapItem[]> {
  if (!process.env.DATABASE_URL) return [];
  const set = await readPageSettings(['catalogue.video', 'naming.productPathPrefix'] as const, storeId);
  if (!set['catalogue.video'].on) return [];
  const db = getPrisma();
  const videos = await db.productVideo.findMany({ where: { storeId, archivedAt: null, durationSec: { not: null } }, orderBy: { createdAt: 'desc' }, take: 5000 });
  if (!videos.length) return [];
  const products = await db.product.findMany({
    where: { storeId, id: { in: videos.map((v) => v.productId) }, status: 'PUBLISHED', isDemo: false, archivedAt: null },
    select: { id: true, slug: true, nameEn: true, descriptionEn: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const firstPhoto = await db.productMedia.findMany({
    where: { storeId, productId: { in: products.map((p) => p.id) }, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    select: { productId: true, assetId: true },
  });
  const photoOf = new Map<string, string>();
  for (const f of firstPhoto) if (!photoOf.has(f.productId)) photoOf.set(f.productId, f.assetId);
  const resolver = settingsResolver();
  const assetIds = videos.flatMap((v) => [v.posterAssetId ?? photoOf.get(v.productId)]).filter((x): x is string => !!x);
  const images = resolver && assetIds.length ? await imageSources({ db, settings: resolver }, storeId, assetIds) : new Map();
  const out: VideoSitemapItem[] = [];
  for (const v of videos) {
    const p = byId.get(v.productId);
    if (!p || v.durationSec === null) continue;
    const img = images.get(v.posterAssetId ?? photoOf.get(v.productId) ?? '');
    const big = img ? [...img.variants].sort((a, b) => b.width - a.width)[0] : null;
    if (!big) continue;
    const link = v.source === 'LINK' && v.url ? parseVideoLink(v.url) : null;
    if (v.source === 'LINK' && !link) continue;
    out.push({
      page: new URL(productPath(set['naming.productPathPrefix'], p.slug), origin).toString(),
      title: (v.titleEn?.trim() || p.nameEn).slice(0, 100),
      description: (p.descriptionEn?.trim() || p.nameEn).slice(0, 2000),
      thumbnail: new URL(big.url, origin).toString(),
      player: link ? link.embedUrl.split('?')[0]! : null,
      content: v.source === 'FILE' && v.fileAssetId ? new URL(`/media/video/${v.fileAssetId}`, origin).toString() : null,
      durationSec: v.durationSec,
      published: v.createdAt,
    });
  }
  return out;
}
