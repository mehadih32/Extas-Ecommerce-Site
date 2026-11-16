// PR 971 (prototype v5, Orders › Incomplete › Report): the page the visitor was on when the bag was made and the kind of
// device, noted from the first add to the bag (Cart.landingPage, Cart.device; nullable, filled from now on), and the
// report that groups the left checkouts of the filtered days by them. Bags made before the notes stay "not recorded".
import type { Prisma } from '@extas/db/client';
import { bagValue } from './incomplete-model';

export const DEVICES = ['MOBILE', 'TABLET', 'DESKTOP'] as const;
export type Device = (typeof DEVICES)[number];

/** The longest landing path kept (a path is short; anything longer is cut). */
export const LANDING_MAX = 120; // hardcode-ok: a field-length guard, not a business number

/** The kind of device from the browser's own words; null when it says nothing usable (nothing is guessed). */
export function deviceOf(userAgent: string | null | undefined): Device | null {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return null;
  if (/ipad|tablet|kindle|silk|playbook/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return 'TABLET';
  if (/mobi|iphone|ipod|android|windows phone|opera mini/.test(ua)) return 'MOBILE';
  if (/windows|macintosh|x11|linux|cros/.test(ua)) return 'DESKTOP';
  return null;
}

/**
 * The shop page the visitor was on, from the request's Referer: its path only (never the query or a fragment), and only
 * when it is this shop's own address. Anything else is null.
 */
export function landingOf(referer: string | null | undefined, host: string | null | undefined): string | null {
  if (!referer || !host) return null;
  try {
    const u = new URL(referer);
    if (u.host.toLowerCase() !== host.toLowerCase()) return null;
    const path = u.pathname.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LANDING_MAX);
    return path.startsWith('/') ? path : null;
  } catch {
    return null;
  }
}

export interface ReportRow {
  /** The path or device; null: not recorded. */
  key: string | null;
  bags: number;
  valueMinor: number;
}

/** Counts and worth per key, biggest first; "not recorded" (null) goes last. Pure. */
export function groupReport(rows: readonly { key: string | null; valueMinor: number }[]): ReportRow[] {
  const by = new Map<string | null, ReportRow>();
  for (const r of rows) {
    const g = by.get(r.key) ?? { key: r.key, bags: 0, valueMinor: 0 };
    g.bags += 1;
    g.valueMinor += r.valueMinor;
    by.set(r.key, g);
  }
  return [...by.values()].sort((a, b) => (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0) || b.bags - a.bags || b.valueMinor - a.valueMinor);
}

export interface IncompleteReport {
  landing: ReportRow[];
  device: ReportRow[];
  total: number;
}

type Db = Pick<Prisma.TransactionClient, 'checkoutDraft' | 'cart' | 'cartItem'>;

/** The left checkouts of the filtered days (the same `where` as the list), grouped by landing page and by device. */
export async function incompleteReport(db: Db, storeId: number, where: Prisma.CheckoutDraftWhereInput, limit: number): Promise<IncompleteReport> {
  const drafts = await db.checkoutDraft.findMany({ where, orderBy: { lastActivityAt: 'desc' }, take: limit, select: { cartId: true } });
  const cartIds = [...new Set(drafts.map((d) => d.cartId).filter((x): x is string => !!x))];
  const [carts, items] = cartIds.length
    ? await Promise.all([
        db.cart.findMany({ where: { storeId, id: { in: cartIds } }, select: { id: true, landingPage: true, device: true } }),
        db.cartItem.findMany({ where: { storeId, cartId: { in: cartIds }, removedAt: null, savedForLater: false }, select: { cartId: true, quantity: true, unitPriceMinor: true, comboGroupKey: true, setPriceMinor: true } }),
      ])
    : [[], []];
  const cart = new Map(carts.map((c) => [c.id, c]));
  const lines = new Map<string, typeof items>();
  for (const i of items) lines.set(i.cartId, [...(lines.get(i.cartId) ?? []), i]);
  const facts = drafts.map((d) => {
    const c = d.cartId ? cart.get(d.cartId) : undefined;
    return { landing: c?.landingPage ?? null, device: c?.device ?? null, valueMinor: bagValue(d.cartId ? (lines.get(d.cartId) ?? []) : []) };
  });
  return {
    landing: groupReport(facts.map((f) => ({ key: f.landing, valueMinor: f.valueMinor }))),
    device: groupReport(facts.map((f) => ({ key: f.device, valueMinor: f.valueMinor }))),
    total: facts.length,
  };
}
