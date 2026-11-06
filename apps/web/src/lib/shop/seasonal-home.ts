// S13 · PR 280 — the home page's seasonal look: only while Marketing › Seasonal home is switched on
// (`marketing.seasonalHome`, off as it ships) and a scheduled window is live now, the home page draws with that
// window's look in place of the owner's own home settings (lib/shop/seasonal-home-model). No database, a slow one, the
// switch off or no live window: the home page is exactly the owner's own (the phone gate's page).
import { getPrisma } from '@extas/db/client';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { readPageSettings, type ShopContext } from './context';
import { liveWindow, lookOf, withLook } from './seasonal-home-model';

/** The shop context the home page draws with: its own, or with the live seasonal look's home settings. */
export async function seasonalHome(c: ShopContext, now = new Date()): Promise<ShopContext> {
  if (!c.live || !process.env.DATABASE_URL) return c;
  try {
    const { 'marketing.seasonalHome': set } = await readPageSettings(['marketing.seasonalHome'], c.storeId);
    if (!set.enabled) return c;
    const rows = await withTimeout(
      getPrisma().scheduledLayoutSwitch.findMany({
        where: { storeId: c.storeId, status: 'SCHEDULED', applyAt: { lte: now }, OR: [{ revertAt: null }, { revertAt: { gt: now } }], snapshot: { archivedAt: null } },
        orderBy: { applyAt: 'desc' },
        take: 2,
        select: { applyAt: true, revertAt: true, status: true, snapshot: { select: { payload: true } } },
      }),
      settingsTimeoutMs(),
    );
    const w = liveWindow(rows, now);
    if (!w) return c;
    const look = lookOf(w.snapshot.payload);
    return Object.keys(look).length ? { ...c, s: withLook(c.s, look) } : c;
  } catch (e) {
    console.warn(`shop: seasonal home unavailable, drawing the usual home page (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return c;
  }
}
