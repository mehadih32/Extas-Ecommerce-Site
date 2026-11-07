// S13 · PR 280 — the home page's seasonal look: only while Marketing › Seasonal home is switched on
// (`marketing.seasonalHome`, off as it ships) and a scheduled window is live now, the home page draws with that
// window's look in place of the owner's own home settings (lib/shop/seasonal-home-model). No database, a slow one, the
// switch off or no live window: the home page is exactly the owner's own (the phone gate's page).
// Follow-up 648: a preview of a saved look before its window starts — the home page with `?seasonal-look=<look>`, drawn
// with that look only for a signed-in staff member who may see Seasonal home (`marketing.campaigns.read`), the switch on
// or off. A customer has no admin session, so nothing is read for him and his home page is the usual one; a page
// answered to an admin session is never cached (lib/cache-policy).
import { cookies } from 'next/headers';
import { getPrisma } from '@extas/db/client';
import { adminDeps, guardAdmin, SESSION_COOKIE, type AdminDeps } from '../admin-auth';
import { forwardedRequest } from '../admin-shell/session';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { readPageSettings, type ShopContext } from './context';
import { HOME_LOOK_SCOPE, liveWindow, lookOf, previewLookId, withLook, type HomeLook } from './seasonal-home-model';

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

/**
 * Follow-up 648: the saved look `lookId` for this request's staff member, or null — no session, no
 * `marketing.campaigns.read`, a look that is not a home look or was set aside. Reads nothing that changes anything.
 */
export async function previewLookFor(deps: AdminDeps, request: Request, storeId: number, lookId: string): Promise<{ name: string; look: HomeLook } | null> {
  const g = await guardAdmin(request, deps, { permission: 'marketing.campaigns.read', storeId });
  if (g instanceof Response) return null;
  const row = await deps.db.layoutSnapshot.findFirst({
    where: { id: lookId, storeId, isLaunchDefault: false, archivedAt: null, payload: { path: ['scope'], equals: HOME_LOOK_SCOPE } },
    select: { name: true, payload: true },
  });
  return row ? { name: row.name, look: lookOf(row.payload) } : null;
}

/** Follow-up 648: the shop context with the previewed look, and the look's name for the preview note; null = no preview. */
export async function seasonalPreview(c: ShopContext, raw: unknown): Promise<{ c: ShopContext; name: string } | null> {
  const lookId = previewLookId(raw);
  if (!lookId || !c.live || !process.env.DATABASE_URL) return null;
  try {
    if (!(await cookies()).get(SESSION_COOKIE)?.value) return null;
    const deps = adminDeps();
    if (!deps) return null;
    const got = await withTimeout(previewLookFor(deps, await forwardedRequest(), c.storeId, lookId), settingsTimeoutMs());
    return got ? { c: { ...c, s: withLook(c.s, got.look) }, name: got.name } : null;
  } catch (e) {
    console.warn(`shop: seasonal preview unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
