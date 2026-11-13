// S28 · PR 681 — the product page's video as a plain model: a poster and a play button; the player (an embed of the
// provider, or the shop's own clip) is made only when a customer taps play, so the page stays fast. Nothing is drawn
// while `catalogue.video` is off, and a clip of the shop is served only for a live product (app/media/video).
import { parseVideoLink, isoDuration } from '@extas/catalogue';
import type { CatalogueVideoSettings } from '@extas/settings';

export interface VideoRow {
  source: 'LINK' | 'FILE';
  provider: string;
  url: string | null;
  fileAssetId: string | null;
  posterAssetId: string | null;
  durationSec: number | null;
  titleEn: string | null;
  titleBn: string | null;
}

export interface PdpVideoModel {
  kind: 'embed' | 'file';
  provider: string;
  /** Opened when the customer taps play: the provider's player, or the clip's own address. */
  playUrl: string;
  /** The video's own page (a link people can open), for a link video. */
  watchUrl: string | null;
  durationSec: number | null;
  title: string | null;
  posterAssetId: string | null;
  /** false: the player loads with the page (`catalogue.video.playOnTap` off). */
  playOnTap: boolean;
}

/** The model for a row, or null: the switch is off, the provider is not allowed, or the link is not readable. */
export function videoModel(row: VideoRow | null, set: CatalogueVideoSettings, lang: 'en' | 'bn'): PdpVideoModel | null {
  if (!row || !set.on) return null;
  const title = (lang === 'bn' ? row.titleBn : row.titleEn)?.trim() || row.titleEn?.trim() || null;
  if (row.source === 'FILE') {
    if (!set.allowUpload || !row.fileAssetId) return null;
    return {
      kind: 'file',
      provider: 'FILE',
      playUrl: `/media/video/${row.fileAssetId}`,
      watchUrl: null,
      durationSec: row.durationSec,
      title,
      posterAssetId: row.posterAssetId,
      playOnTap: set.playOnTap,
    };
  }
  const link = row.url ? parseVideoLink(row.url) : null;
  if (!link || !set.providers.includes(link.provider)) return null;
  return {
    kind: 'embed',
    provider: link.provider,
    playUrl: link.embedUrl,
    watchUrl: link.watchUrl,
    durationSec: row.durationSec,
    title,
    posterAssetId: row.posterAssetId,
    playOnTap: set.playOnTap,
  };
}

/** Google's VideoObject for the page's video (needs a poster picture and a length, else null: nothing half-filled). */
export function videoLdOf(
  m: PdpVideoModel | null,
  p: { name: string; description: string | null; posterUrl: string | null; pageUrl: string; uploadDate: string | null },
): Record<string, unknown> | null {
  if (!m || !p.posterUrl || !m.durationSec || !p.uploadDate) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: m.title ?? p.name,
    description: p.description?.trim() || p.name,
    thumbnailUrl: [p.posterUrl],
    uploadDate: p.uploadDate,
    duration: isoDuration(m.durationSec),
    ...(m.kind === 'embed' ? { embedUrl: m.playUrl.split('?')[0] } : { contentUrl: new URL(m.playUrl, p.pageUrl).toString() }),
  };
}
