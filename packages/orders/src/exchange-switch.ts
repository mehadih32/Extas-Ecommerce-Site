// PR 188 (S08; Blueprint B1.8) — the exchange variant switcher: the piece going out is changed to another size of the
// same product and colour (the customer asks for L instead of XL after all). The money box never changes: the other
// size must cost the same now (PRICE_DIFFERS otherwise — an exchange never changes a price, CLAUDE.md rule 6), and it
// must be free in stock.
//   - A requested exchange: the line is changed on the exchange, after a stock check on the shared pool.
//   - An approved one: the linked exchange order's line is changed through the one order service (`edit`, the same
//     path as the team's size change, PR 142): the order's row lock, its version, the stock held again under the
//     checkout's row locks (the old size let go, the new one held; OUT_OF_STOCK changes nothing), the ERP sent the
//     order again if it had it, the timeline and the audit row — and the exchange line is changed in the same
//     transaction. Once the courier is booked the machine refuses it (SIM-F-004).
import { z } from 'zod';
import { sellableKinds, sellableUnits } from '@extas/inventory';
import { discountWasFor } from '@extas/rules';
import { allow, parse, TX, type Db, type OrdersDeps, type Tx, type Who } from './context';
import { applyEdit } from './edit';
import { OrdersError } from './errors';
import { lockExchange } from './exchange';
import { auditRow, eventRow, execute, inventoryOf, staffBy } from './service';

export interface ExchangeSize {
  variantId: string;
  sku: string;
  sizeKey: string | null;
  sizeLabel: string | null;
  sellable: number;
  /** The price now with its live discount (null: not on sale). */
  priceMinor: number | null;
  /** The same price as the piece chosen: only these may be switched to. */
  samePrice: boolean;
  current: boolean;
}

export interface ExchangeSizes {
  exchangeItemId: string;
  newVariantId: string | null;
  sizes: ExchangeSize[];
}

const priceNow = async (deps: OrdersDeps, storeId: number, variantId: string) => (await discountWasFor(deps, { storeId, variantId }))?.discountedMinor ?? null;

async function sizesFor(deps: OrdersDeps, db: Db, storeId: number, item: { id: string; newVariantId: string | null; newUnitMinor: number }): Promise<ExchangeSizes> {
  if (!item.newVariantId) return { exchangeItemId: item.id, newVariantId: null, sizes: [] };
  const cur = await db.productVariant.findUnique({ where: { id: item.newVariantId }, select: { productId: true, colourId: true } });
  if (!cur) return { exchangeItemId: item.id, newVariantId: item.newVariantId, sizes: [] };
  const kinds = await sellableKinds(inventoryOf(deps));
  const rows = await db.productVariant.findMany({
    where: { storeId, productId: cur.productId, colourId: cur.colourId, archivedAt: null, product: { status: 'PUBLISHED', archivedAt: null } },
    orderBy: [{ size: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true, sku: true, size: { select: { key: true, label: true } }, stockLevels: { select: { available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } } } },
  });
  const sizes: ExchangeSize[] = [];
  for (const v of rows) {
    const price = await priceNow(deps, storeId, v.id);
    sizes.push({ variantId: v.id, sku: v.sku, sizeKey: v.size?.key ?? null, sizeLabel: v.size?.label ?? null, sellable: sellableUnits(v.stockLevels, kinds), priceMinor: price, samePrice: price === item.newUnitMinor, current: v.id === item.newVariantId });
  }
  return { exchangeItemId: item.id, newVariantId: item.newVariantId, sizes };
}

/** The other sizes of each piece going out (same product and colour), with stock and price. Needs `returns.view`. */
export async function exchangeSizes(deps: OrdersDeps, who: Who, exchangeId: string): Promise<ExchangeSizes[]> {
  await allow(deps, who, 'returns.view');
  if (!z.uuid().safeParse(exchangeId).success) throw new OrdersError('NOT_FOUND', 'no such exchange', ['exchangeId']);
  const ex = await deps.db.exchange.findFirst({ where: { id: exchangeId, storeId: who.storeId }, include: { items: { orderBy: { createdAt: 'asc' } } } });
  if (!ex) throw new OrdersError('NOT_FOUND', 'no such exchange', ['exchangeId']);
  return Promise.all(ex.items.map((i) => sizesFor(deps, deps.db, who.storeId, i)));
}

export const exchangeSwitchInput = z.object({ exchangeItemId: z.uuid(), newVariantId: z.uuid() }).strict();

export interface SwitchResult {
  exchangeId: string;
  exchangeItemId: string;
  from: { variantId: string | null; sku: string | null; sizeLabel: string | null };
  to: { variantId: string; sku: string; sizeLabel: string | null };
  /** The linked exchange order changed too (an approved exchange). */
  newOrderId: string | null;
}

/** The exchange steps at which the piece going out may still switch size. */
export const EXCHANGE_SWITCHABLE = ['REQUESTED', 'APPROVED', 'PICKUP_BOOKED'] as const;

/**
 * Switches one piece going out to another size of the same product and colour at the same price. Needs
 * `returns.decide`; `version` is the exchange's version the screen showed.
 */
export async function switchExchangeVariant(deps: OrdersDeps, who: Who, exchangeId: string, input: unknown, opts: { version?: number } = {}): Promise<SwitchResult> {
  await allow(deps, who, 'returns.decide');
  const d = parse(exchangeSwitchInput, input, 'size switch');
  const by = staffBy(who.actor, who.ctx);
  const head = await deps.db.exchange.findFirst({ where: { id: exchangeId, storeId: who.storeId }, select: { id: true, status: true, newOrderId: true } });
  if (!head) throw new OrdersError('NOT_FOUND', 'no such exchange', ['exchangeId']);

  /** Checks the switch on the locked exchange and writes it there; returns what changed. */
  const onExchange = async (tx: Tx, lockedStatus: readonly string[]) => {
    const ex = await lockExchange(tx, who.storeId, exchangeId);
    if (opts.version !== undefined && opts.version !== ex.version) throw new OrdersError('STALE', 'the exchange changed since it was read', ['version'], { version: ex.version, status: ex.status });
    if (!lockedStatus.includes(ex.status)) throw new OrdersError('EXCHANGE_STATE', 'the piece going out is switched only before it ships', ['status'], { status: ex.status });
    const item = ex.items.find((i) => i.id === d.exchangeItemId);
    if (!item) throw new OrdersError('NOT_FOUND', 'no such piece on this exchange', ['exchangeItemId']);
    if (item.newVariantId === d.newVariantId) throw new OrdersError('NOTHING_CHANGED', 'that is the size already chosen', ['newVariantId']);
    const choices = await sizesFor(deps, tx, who.storeId, item);
    const pick = choices.sizes.find((s) => s.variantId === d.newVariantId);
    if (!pick) throw new OrdersError('NOT_SAME_PIECE', 'the piece changes only to another size of the same product and colour', ['newVariantId']);
    if (!pick.samePrice) throw new OrdersError('PRICE_DIFFERS', 'that size costs another price now; an exchange never changes a price', ['newVariantId'], { priceMinor: pick.priceMinor, linePriceMinor: item.newUnitMinor });
    if (ex.status === 'REQUESTED' && pick.sellable < item.quantity) throw new OrdersError('OUT_OF_STOCK', 'not enough pieces are free now', [pick.sku]);
    await tx.exchangeItem.update({ where: { id: item.id }, data: { newVariantId: pick.variantId, newSku: pick.sku, newSizeLabel: pick.sizeLabel } });
    const after = await tx.exchange.update({ where: { id: ex.id }, data: { version: { increment: 1 } }, select: { version: true } });
    const from = { variantId: item.newVariantId, sku: item.newSku, sizeLabel: item.newSizeLabel };
    const to = { variantId: pick.variantId, sku: pick.sku, sizeLabel: pick.sizeLabel };
    await eventRow(tx, by, { storeId: ex.storeId, orderId: ex.orderId, type: 'exchange.switched', data: { exchangeId: ex.id, number: ex.number, exchangeItemId: item.id, from, to } });
    await auditRow(tx, by, { storeId: ex.storeId, action: 'exchange.switched', entityType: 'Exchange', entityId: ex.id, before: { version: ex.version, ...from }, after: { version: after.version, ...to } });
    return { ex, item, from, to };
  };

  if (head.status === 'REQUESTED' || !head.newOrderId) {
    return deps.db.$transaction(async (tx) => {
      const r = await onExchange(tx, ['REQUESTED']);
      return { exchangeId: r.ex.id, exchangeItemId: r.item.id, from: r.from, to: r.to, newOrderId: null };
    }, TX);
  }

  // Approved: the linked exchange order's line through the order service's edit (row lock, stock under the row locks).
  let out: SwitchResult | null = null;
  await execute(
    deps,
    { storeId: who.storeId, orderId: head.newOrderId },
    by,
    {
      command: 'edit',
      input: { exchangeSwitch: d },
      effect: async (tx, o) => {
        const r = await onExchange(tx, EXCHANGE_SWITCHABLE);
        const line = await tx.orderItem.findFirst({ where: { storeId: o.storeId, orderId: o.id, status: 'ACTIVE', variantId: r.from.variantId ?? undefined }, orderBy: { createdAt: 'asc' }, select: { id: true } });
        if (!line) throw new OrdersError('NOT_FOUND', 'the exchange order has no line for this piece', ['exchangeItemId']);
        const done = await applyEdit(deps, tx, o, { lines: [{ lineId: line.id, variantId: r.to.variantId }] }, { reason: 'exchange-size', by, sameColour: true, priceOf: (id) => priceNow(deps, o.storeId, id) });
        out = { exchangeId: r.ex.id, exchangeItemId: r.item.id, from: r.from, to: r.to, newOrderId: o.id };
        return { ...done.effect, eventData: { ...done.effect.eventData, exchange: { id: r.ex.id, number: r.ex.number } } };
      },
    },
    {},
  );
  return out!;
}
