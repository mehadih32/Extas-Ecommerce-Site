// Follow-up 16 (PR 195, 197, 203; CN-017 SIM-F-006; Blueprint B1.15 #2) — oversold stock is never hidden.
//
// When an ERP sync takes stock away under open orders (a piece sold in the outlet, a count corrected), the shared
// balance of the SKU (low-stock.ts `sharedBalance`: available − holds over every live sellable pool) goes below zero.
// It is shown as it is (−1, never 0), and every open order that still waits to be packed and holds that SKU gets a
// shortage card: a PackingIssue of kind SHORTAGE on the order line. The card stays open until a person decides
// (swap the size, ship the rest, cancel the line, or the piece was found), and while it is open the order cannot be
// booked with a courier (`assertBookable`, which the booking step calls; S08 builds that step).
//
// What this file does NOT do: carry out the decision. Swapping a size, shipping part of an order or cancelling a line
// changes the order and its money, which belongs to the order state machine (waits for the owner's approval, CN-022).
// The decision is recorded, with who and when, in the card and the audit log. Cards are never deleted and never
// closed by themselves: stock coming back does not decide for the team.
//
// Runs after every stock change (afterStockChange: the pull, a re-sync, an ERP webhook) for the SKUs that changed, and
// with the low-stock sweep over every SKU. The packing screen (S08) reads `listShortages`; until it exists the API is
// here and no admin screen is added (CN-019).
import { z } from 'zod';
import { allow, logChange, nowOf, parse, type Db, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';
import { sellableKinds } from './locations';
import { sharedBalance } from './low-stock';
import type { PoolRow } from './reservations';

/** The PackingIssue kind of a shortage card (PackingIssue.kind is text; Damaged / Not found use their own kinds). */
export const SHORTAGE_KIND = 'SHORTAGE';
/** What the team can decide on a card (B1.15 #2), plus "the piece was found" when the count was wrong. */
export const SHORTAGE_DECISIONS = ['SWAP_SIZE', 'SHIP_REST', 'CANCEL_LINE', 'STOCK_FOUND'] as const;
export type ShortageDecision = (typeof SHORTAGE_DECISIONS)[number];
/** Orders that still wait to be packed: a piece they hold can still be missing on the shelf. */
export const WAITING_TO_PACK = ['PLACED', 'CONFIRMED', 'ON_HOLD', 'PROCESSING'] as const;

/** The SKUs whose balance is below zero, with how many pieces are missing. */
export function shortSkus(balance: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [sku, n] of balance) if (n < 0) out.set(sku, -n);
  return out;
}

async function balances(deps: InventoryDeps, skus: string[] | null): Promise<Map<string, number>> {
  const [rows, kinds] = await Promise.all([
    deps.db.stockLevel.findMany({
      where: skus ? { variant: { sku: { in: skus } } } : {},
      select: {
        id: true,
        variantId: true,
        locationId: true,
        available: true,
        cartReserved: true,
        erpUpdatedAt: true,
        variant: { select: { sku: true, storeId: true } },
        location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } },
      },
    }),
    sellableKinds(deps),
  ]);
  const pool: PoolRow[] = rows.map((r) => ({
    id: r.id,
    variantId: r.variantId,
    locationId: r.locationId,
    available: r.available,
    cartReserved: r.cartReserved,
    erpUpdatedAt: r.erpUpdatedAt,
    sku: r.variant.sku,
    storeId: r.variant.storeId,
    kind: r.location.kind,
    live: !r.location.archivedAt && !r.location.warehouse.archivedAt,
  }));
  return sharedBalance(pool, kinds);
}

export interface ShortageRun {
  checked: number;
  /** SKUs below zero. */
  short: number;
  /** New cards (one per order line that holds a short SKU and had no open card). */
  raised: number;
  /** Open shortage cards after the run, every store. */
  open: number;
}

/** Raises the shortage cards for these SKUs (every SKU when omitted). Never closes one. */
export async function evaluateShortages(deps: InventoryDeps, opts: { skus?: string[] } = {}): Promise<ShortageRun> {
  const out: ShortageRun = { checked: 0, short: 0, raised: 0, open: 0 };
  if (opts.skus && !opts.skus.length) return out;
  const balance = await balances(deps, opts.skus ?? null);
  out.checked = balance.size;
  const short = shortSkus(balance);
  out.short = short.size;
  if (short.size) {
    await deps.db.$transaction(async (tx) => {
      // One evaluation at a time, so two runs at once never raise the same card twice.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('extas:inventory:shortage'))`;
      const lines = await tx.orderItem.findMany({
        // The line's own SKU snapshot is the ERP SKU it was sold as.
        where: { status: 'ACTIVE', sku: { in: [...short.keys()] }, order: { status: { in: [...WAITING_TO_PACK] }, archivedAt: null } },
        select: { id: true, orderId: true, storeId: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!lines.length) return;
      // A line already has its card while one is open, or once the team decided what happens to it (the order flow
      // carries that out). Only "the piece was found" lets the line be raised again if it falls short once more.
      const cards = await tx.packingIssue.findMany({
        where: { kind: SHORTAGE_KIND, orderItemId: { in: lines.map((l) => l.id) }, OR: [{ resolvedAt: null }, { resolution: { not: 'STOCK_FOUND' } }] },
        select: { orderItemId: true },
      });
      const has = new Set(cards.map((o) => o.orderItemId));
      const fresh = lines.filter((l) => !has.has(l.id));
      if (fresh.length) {
        await tx.packingIssue.createMany({ data: fresh.map((l) => ({ storeId: l.storeId, orderId: l.orderId, orderItemId: l.id, kind: SHORTAGE_KIND })) });
        out.raised = fresh.length;
      }
    });
  }
  out.open = await deps.db.packingIssue.count({ where: { kind: SHORTAGE_KIND, resolvedAt: null } });
  return out;
}

export interface ShortageCard {
  id: string;
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  sku: string;
  productName: { en: string; bn: string | null };
  quantity: number;
  /** The SKU's shared balance now (below zero while it is still short). */
  balance: number;
  raisedAt: string;
  decision: ShortageDecision | null;
  decidedAt: string | null;
}

async function cardsOf(db: Db, rows: { id: string; orderId: string; orderItemId: string; resolution: string | null; resolvedAt: Date | null; createdAt: Date }[], balance: Map<string, number>): Promise<ShortageCard[]> {
  const items = await db.orderItem.findMany({
    where: { id: { in: rows.map((r) => r.orderItemId) } },
    select: { id: true, sku: true, productName: true, productId: true, quantity: true, order: { select: { number: true } } },
  });
  const products = await db.product.findMany({ where: { id: { in: items.map((i) => i.productId).filter((p): p is string => !!p) } }, select: { id: true, nameEn: true, nameBn: true } });
  const productById = new Map(products.map((p) => [p.id, p]));
  const byId = new Map(items.map((i) => [i.id, i]));
  return rows.flatMap((r) => {
    const i = byId.get(r.orderItemId);
    if (!i) return [];
    const sku = i.sku;
    const p = i.productId ? productById.get(i.productId) : undefined;
    return [
      {
        id: r.id,
        orderId: r.orderId,
        orderNumber: i.order.number,
        orderItemId: r.orderItemId,
        sku,
        productName: { en: p?.nameEn ?? i.productName, bn: p?.nameBn ?? null },
        quantity: i.quantity,
        balance: balance.get(sku) ?? 0,
        raisedAt: r.createdAt.toISOString(),
        decision: (SHORTAGE_DECISIONS as readonly string[]).includes(r.resolution ?? '') ? (r.resolution as ShortageDecision) : null,
        decidedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      },
    ];
  });
}

/** The open shortage cards of the acting store, oldest first, and every SKU below zero (the stock count report). */
export async function listShortages(deps: InventoryDeps, who: Who): Promise<{ cards: ShortageCard[]; negatives: { sku: string; balance: number }[] }> {
  await allow(deps, who, 'inventory.read');
  const balance = await balances(deps, null);
  const open = await deps.db.packingIssue.findMany({ where: { storeId: who.storeId, kind: SHORTAGE_KIND, resolvedAt: null }, orderBy: { createdAt: 'asc' } });
  return {
    cards: await cardsOf(deps.db, open, balance),
    negatives: [...balance].filter(([, n]) => n < 0).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([sku, n]) => ({ sku, balance: n })),
  };
}

const decideSchema = z.object({ decision: z.enum(SHORTAGE_DECISIONS), note: z.string().trim().max(500).optional() }).strict();

/**
 * A person decides a shortage card (`inventory.audit`: the stock-difference permission). The decision is recorded; the
 * order itself is changed by the order flow (state machine, CN-022), never here. A decided card no longer blocks booking.
 */
export async function decideShortage(deps: InventoryDeps, who: Who, id: string, input: unknown): Promise<ShortageCard> {
  await allow(deps, who, 'inventory.audit');
  const b = parse(decideSchema, input, 'decision');
  const now = nowOf(deps);
  const row = await deps.db.$transaction(async (tx) => {
    const before = await tx.packingIssue.findFirst({ where: { id, storeId: who.storeId, kind: SHORTAGE_KIND } });
    if (!before) throw new InventoryError('NOT_FOUND', 'no such shortage card', ['id']);
    if (before.resolvedAt) throw new InventoryError('CONFLICT', 'this card is already decided', ['id']);
    const after = await tx.packingIssue.update({ where: { id }, data: { resolution: b.decision, resolvedAt: now, resolvedById: who.actor.staffUserId ?? null, note: b.note ?? before.note } });
    await logChange(tx, who, { action: 'inventory.shortage.decide', entityType: 'PackingIssue', entityId: id, before: { resolution: null }, after: { resolution: b.decision, note: b.note ?? null }, storeId: who.storeId });
    return after;
  });
  const balance = await balances(deps, null);
  return (await cardsOf(deps.db, [row], balance))[0]!;
}

/** What stops this order from being booked with a courier: its open packing issues (shortage cards first). */
export async function bookingBlockers(db: Db, storeId: number, orderId: string): Promise<{ issueId: string; orderItemId: string; kind: string }[]> {
  const open = await db.packingIssue.findMany({ where: { storeId, orderId, resolvedAt: null }, orderBy: { createdAt: 'asc' } });
  return open.sort((a, b) => Number(b.kind === SHORTAGE_KIND) - Number(a.kind === SHORTAGE_KIND)).map((i) => ({ issueId: i.id, orderItemId: i.orderItemId, kind: i.kind }));
}

/** The booking step (S08) calls this first: an order with an open card is refused until a person decides. */
export async function assertBookable(db: Db, storeId: number, orderId: string): Promise<void> {
  const blockers = await bookingBlockers(db, storeId, orderId);
  if (blockers.length) throw new InventoryError('SHORTAGE_OPEN', 'this order has an open packing card; a person decides it before booking', blockers.map((b) => `${b.kind}:${b.orderItemId}`));
}
