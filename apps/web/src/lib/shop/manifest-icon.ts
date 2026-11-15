// PR 744 — the home-screen icon's pictures: the sizes the media pipeline made for the picked picture (JPEG only: every phone
// shows it), widest first, as manifest icons, and the one the iPhone's "apple-touch-icon" link uses (the smallest of at
// least 180 px, else the widest). Without a database, or while the sizes are still being made, nothing: the manifest then
// falls back to the shop's tab icon. Never throws.
import { cache } from 'react';
import { getPrisma } from '@extas/db/client';
import { imageSources } from '@extas/media';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '@/lib/settings';
import type { ManifestIcon } from './manifest';

/** The iPhone's icon is at least this wide (the platform's own size, technical). */
const APPLE_MIN = 180; // hardcode-ok: Apple's home-screen icon size in pixels

export const iconSizes = cache(async (storeId: number, assetId: string | null): Promise<(ManifestIcon & { width: number })[]> => {
  const resolver = settingsResolver();
  if (!assetId || !resolver || !process.env.DATABASE_URL) return [];
  try {
    const found = await withTimeout(imageSources({ db: getPrisma(), settings: resolver }, storeId, [assetId]), settingsTimeoutMs());
    return (found.get(assetId)?.variants ?? [])
      .filter((v) => v.format === 'jpeg')
      .sort((a, b) => b.width - a.width)
      .map((v) => ({ src: v.url, sizes: `${v.width}x${v.height}`, type: 'image/jpeg', width: v.width }));
  } catch {
    return [];
  }
});

/** The iPhone link's picture (null: none). */
export async function appleIconUrl(storeId: number, assetId: string | null): Promise<string | null> {
  const all = await iconSizes(storeId, assetId);
  const fit = [...all].reverse().find((x) => x.width >= APPLE_MIN);
  return (fit ?? all[0])?.src ?? null;
}
