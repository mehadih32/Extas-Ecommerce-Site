// S28 · PR 681 — a product's active video for its page. Read-only and public; without a database (CI's build) or when it
// is slow: no video, never a guess.
import { cache } from 'react';
import { getPrisma } from '@extas/db/client';
import { settingsTimeoutMs, withTimeout } from '../settings';
import type { VideoRow } from './pdp-video';

export interface LoadedVideo extends VideoRow {
  createdAt: Date;
  /** The product's own first photo, when no poster was chosen. */
  fallbackPosterAssetId: string | null;
}

export async function activeVideo(storeId: number, productId: string): Promise<LoadedVideo | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = getPrisma();
    return await withTimeout(
      (async () => {
        const v = await db.productVideo.findFirst({ where: { storeId, productId, archivedAt: null }, orderBy: { createdAt: 'desc' } });
        if (!v) return null;
        let fallback: string | null = null;
        if (!v.posterAssetId) {
          const first = await db.productMedia.findFirst({
            where: { storeId, productId, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            select: { assetId: true },
          });
          fallback = first?.assetId ?? null;
        }
        return {
          source: v.source,
          provider: v.provider,
          url: v.url,
          fileAssetId: v.fileAssetId,
          posterAssetId: v.posterAssetId,
          durationSec: v.durationSec,
          titleEn: v.titleEn,
          titleBn: v.titleBn,
          createdAt: v.createdAt,
          fallbackPosterAssetId: fallback,
        } satisfies LoadedVideo;
      })(),
      settingsTimeoutMs() * 2,
    );
  } catch (e) {
    console.warn(`shop: product video unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

export const activeVideoOnce = cache(activeVideo);
