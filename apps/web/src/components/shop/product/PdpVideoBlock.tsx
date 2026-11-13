// S28 · PR 681 — the product page's video block, on the server: loads the product's active video and its poster and
// draws it (nothing while `catalogue.video` is off or the product has no video). Its VideoObject for search engines is
// built by `videoLdFor` from the same model, so the markup is never about a video the page does not show.
import { getPrisma } from '@extas/db/client';
import { imageSources, type ImageSource } from '@extas/media';
import type { CatalogueVideoSettings } from '@extas/settings';
import { settingsResolver } from '@/lib/settings';
import type { ShopContext } from '@/lib/shop/context';
import { activeVideoOnce } from '@/lib/shop/pdp-video-load';
import { videoLdOf, videoModel, type PdpVideoModel } from '@/lib/shop/pdp-video';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { PdpVideo } from './PdpVideo';

async function posterOf(storeId: number, assetId: string | null): Promise<ImageSource | null> {
  const resolver = settingsResolver();
  if (!assetId || !resolver) return null;
  try {
    return (await imageSources({ db: getPrisma(), settings: resolver }, storeId, [assetId])).get(assetId) ?? null;
  } catch {
    return null;
  }
}

export interface LoadedPdpVideo {
  model: PdpVideoModel;
  poster: ImageSource | null;
  uploadDate: string;
}

export async function loadPdpVideo(c: ShopContext, productId: string, set: CatalogueVideoSettings): Promise<LoadedPdpVideo | null> {
  if (!set.on) return null;
  const row = await activeVideoOnce(c.storeId, productId);
  const model = videoModel(row, set, c.lang);
  if (!row || !model) return null;
  const poster = await posterOf(c.storeId, model.posterAssetId ?? row.fallbackPosterAssetId);
  return { model, poster, uploadDate: row.createdAt.toISOString() };
}

/** The VideoObject for the page (null when the poster, length or date is missing). */
export function videoLdFor(v: LoadedPdpVideo | null, p: { name: string; description: string | null; pageUrl: string }): Record<string, unknown> | null {
  if (!v) return null;
  const variants = v.poster?.variants ?? [];
  const biggest = [...variants].sort((a, b) => b.width - a.width)[0];
  return videoLdOf(v.model, { ...p, posterUrl: biggest ? new URL(biggest.url, p.pageUrl).toString() : null, uploadDate: v.uploadDate });
}

export function PdpVideoBlock({ c, video, name }: { c: ShopContext; video: LoadedPdpVideo | null; name: string }) {
  if (!video) return null;
  const { model, poster } = video;
  const words = {
    title: c.t('pdpx.video.title'),
    play: c.t('pdpx.video.play'),
    frame: c.t('pdpx.video.frame', { name: model.title ?? name }),
    open: c.t('pdpx.video.open', { provider: model.provider === 'YOUTUBE' ? 'YouTube' : model.provider === 'VIMEO' ? 'Vimeo' : 'Facebook' }),
  };
  return (
    <PdpVideo kind={model.kind} playUrl={model.playUrl} watchUrl={model.watchUrl} provider={model.provider} playOnTap={model.playOnTap} words={words}>
      {poster ? (
        <ResponsiveImage image={poster} slot="card2x" sizes="(max-width: 767px) 100vw, 480px" alt={altFor(poster, c.lang, words.frame)} />
      ) : (
        <span className="pdp-video-blank" />
      )}
    </PdpVideo>
  );
}
