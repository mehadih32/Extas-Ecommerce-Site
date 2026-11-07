// S06 · PR 159 follow-up 324 — the location the customer shared for the rider, where the team may use it
// (`orders.sharedLocation`, both parts off as shipped): a map link on the order page and the point on the courier
// sticker. The order keeps the rounded point only for the owner's days (`risk.capture`; the purge job clears it), so a
// point is used only while it is there and its keep date has not passed — never on a gift (the checkout never asks for
// one there) and never guessed from the address.
import type { Prisma } from '@extas/db/client';
import type { SharedLocationSettings } from '@extas/settings';
import { setting, type OrdersDeps } from './context';

/** What an order holds of a shared point. */
export interface SharedPointFields {
  gpsLat: Prisma.Decimal | number | string | null;
  gpsLng: Prisma.Decimal | number | string | null;
  piiExpiresAt: Date | null;
  isGift?: boolean | null;
}

/** A shared point as it is used: the stored rounded numbers, written as stored ("23.781, 90.412"). */
export interface SharedPoint {
  lat: string;
  lng: string;
  text: string;
}

const num = (v: SharedPointFields['gpsLat']): string | null => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v));
  if (!Number.isFinite(n)) return null;
  // the stored point is already rounded (risk.capture gpsDecimals); trailing zeros of the column add nothing
  return String(n);
};

/** The point while the order still keeps it (null: none shared, cleared, past its keep date, or a gift). */
export function sharedPointOf(o: SharedPointFields, now: Date): SharedPoint | null {
  if (o.isGift) return null;
  if (o.piiExpiresAt && o.piiExpiresAt.getTime() <= now.getTime()) return null;
  const lat = num(o.gpsLat);
  const lng = num(o.gpsLng);
  if (lat === null || lng === null || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) return null;
  return { lat, lng, text: `${lat}, ${lng}` };
}

/** The owner's map address with the point filled in (the setting allows only https addresses). */
export const mapLinkOf = (template: string, p: SharedPoint): string => template.replace(/\{lat\}/g, encodeURIComponent(p.lat)).replace(/\{lng\}/g, encodeURIComponent(p.lng));

export const SHARED_POINT_SELECT = { gpsLat: true, gpsLng: true, piiExpiresAt: true, isGift: true } as const satisfies Prisma.OrderSelect;

/**
 * The order page's map link (`orders.sharedLocation.orderPage`): null while it is off, or when the order keeps no point
 * now. Read in the store the person works in; the page already checked `orders.read`.
 */
export async function orderPageLocation(deps: Pick<OrdersDeps, 'db' | 'settings' | 'now'>, storeId: number, orderId: string): Promise<(SharedPoint & { href: string }) | null> {
  const cfg: SharedLocationSettings = await setting(deps, storeId, 'orders.sharedLocation');
  if (!cfg.orderPage) return null;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId }, select: SHARED_POINT_SELECT });
  const p = o ? sharedPointOf(o, (deps.now ?? (() => new Date()))()) : null;
  return p ? { ...p, href: mapLinkOf(cfg.mapLink, p) } : null;
}
