// S25 · PR 489 (Blueprint C8.3, layer a) — the storefront's own read of the live campaign overlays: a small,
// time-bound label drawn on top of the product card, the listing, the search result and the product page at display
// time. Nothing here is stored on the product or written onto a photo; nothing here changes a price (CLAUDE.md rule
// 6). Read fresh on every page (the overlay table is small and the whole point is that turning one on or off shows at
// once), guarded the same way as the rest of the catalogue: without a database, or when it is slow, the list is empty
// and the page still draws with no overlay at all.
import { getPrisma } from '@extas/db/client';
import { activeOverlayFor, listCampaignOverlays, type CampaignOverlayView, type OverlayBadge } from '@extas/creative-studio';
import { settingsTimeoutMs, withTimeout } from '../settings';

/** Every overlay that could possibly be live for the store, for one batched call shared by every card on a page. */
export async function liveCampaignOverlays(storeId: number): Promise<CampaignOverlayView[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await withTimeout(listCampaignOverlays({ db: getPrisma() }, storeId), settingsTimeoutMs());
  } catch (e) {
    console.warn(`shop: campaign overlays unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return [];
  }
}

/** One product's own overlay (the product page: a single, cheap lookup rather than the batched list above). */
export async function overlayForTarget(storeId: number, target: { slug: string; categorySlug: string | null }, now: Date = new Date()): Promise<OverlayBadge | null> {
  const overlays = await liveCampaignOverlays(storeId);
  return activeOverlayFor(overlays, target, now);
}
