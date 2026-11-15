// PR 745 — the picture a link to the shop shows in WhatsApp, Facebook and search (Open Graph): the owner's own picture
// (`brand.ogImage`, Website › Brand & menus › Contact & sharing), as the widest size the media pipeline made. Not set, or
// the sizes are not ready yet, or the database does not answer: no picture, exactly as before. Read once per request.
import { cache } from 'react';
import { getPrisma } from '@extas/db/client';
import { imageSources } from '@extas/media';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';

export const ogImageUrl = cache(async (storeId: number): Promise<string | null> => {
  const resolver = settingsResolver();
  if (!resolver || !process.env.DATABASE_URL) return null;
  try {
    const id = await withTimeout(resolver.value('brand.ogImage', { storeId }), settingsTimeoutMs());
    if (!id) return null;
    const found = await withTimeout(imageSources({ db: getPrisma(), settings: resolver }, storeId, [id]), settingsTimeoutMs());
    const widest = [...(found.get(id)?.variants ?? [])].sort((a, b) => b.width - a.width || Number(b.format === 'jpeg') - Number(a.format === 'jpeg'))[0];
    return widest?.url ?? null;
  } catch {
    return null;
  }
});
