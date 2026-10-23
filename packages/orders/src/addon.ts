// PR 127 — "Add to this parcel" (demo 52-thanks.js ty_look, ty_lookAdd): a real order line added to an order that is
// not yet with the courier. It is a command of the one order service (`addLine` / `removeLine`, pure.ts), so the row
// lock, the version, the timeline and the audit row are never skipped, and the machine refuses it once a courier is
// booked (SIM-F-004: an edit after booking never reaches the parcel, so it is never accepted), while a cancel is asked
// or the customer asked to cancel.
//
// Money: the new line is priced as its product page prices it now (@extas/rules discountWasFor: the price and its live,
// coupon-free discount); nothing already on the order is priced again. The order's subtotal, total and Cash on Delivery
// amount grow (or shrink, when the line comes out again) by exactly the line's total; the delivery charge, the order's
// offers and the wallet stay as stored. The band's COD limit is checked on the new amount. Stock: the line's pieces are
// held on the shared pool like the order's own (@extas/inventory holdOrderUnits). An order the ERP already has is sent
// again as a new revision with its lines as they are now.
//
// The owner's switch (`orders.addOn`, off by default): whether customers may add at all, until when (while the order
// is new, or until it is confirmed and picking starts), for how long after placing, how many lines and pieces. Cash on
// Delivery orders only: a prepaid order's extra amount would need a payment of its own (S07). Staff add or take out
// lines through the admin API (`orders.lines`) under the same machine and the same COD rule.
import { z } from 'zod';
import { holdOrderUnits, InventoryError, releaseOrderUnits } from '@extas/inventory';
import { discountWasFor } from '@extas/rules';
import { allow, nowOf, parse, setting, UUID, type OrdersDeps, type Tx, type Who } from './context';
import type { CustomerRef } from './customer';
import { OrdersError } from './errors';
import { addOnClosedWhy, type AddOnClosed } from './pure';
import { execute, factsOf, inventoryOf, MACHINE_SELECT, machineOf, queueErpOrder, staffBy, type By, type CommandOptions, type CommandResult, type LockedOrder, type OrderFacts } from './service';

/** Where a line was added from (OrderItem.addedVia). */
export const ADD_ON_SOURCES = ['thanks', 'account', 'admin'] as const;
export type AddOnSource = (typeof ADD_ON_SOURCES)[number];

const number = z.string().trim().min(1).max(40);
const variantId = z.string().regex(UUID);
export const addLineInput = z.object({ variantId, quantity: z.int().min(1).max(20).optional() }).strict();
export const customerAddInput = z.object({ number, variantId, quantity: z.int().min(1).max(20).optional(), from: z.enum(['thanks', 'account']).optional() }).strict();
export const customerRemoveInput = z.object({ number, lineId: z.string().regex(UUID) }).strict();

/** One added line as the shop shows it. */
export interface AddOnLine {
  id: string;
  variantId: string | null;
  productId: string | null;
  quantity: number;
  lineTotalMinor: number;
}

/** What the thank-you page and the order page may offer now. */
export interface AddOnState {
  open: boolean;
  /** Why it is closed (null while open). */
  closed: AddOnClosed | null;
  lines: AddOnLine[];
  maxLines: number;
  maxUnits: number;
  /** What he pays at the door now (the order's Cash on Delivery amount). */
  dueMinor: number;
}

const customerBy = (c: CustomerRef): By => ({ actorType: 'CUSTOMER', actorId: c.customerId, source: 'shop' });

async function ownOrderId(deps: OrdersDeps, c: CustomerRef, n: string): Promise<string> {
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId: c.storeId, number: n } }, select: { id: true, customerId: true, visitorId: true } });
  const his = o && ((c.customerId && o.customerId === c.customerId) || (c.visitorId && o.visitorId === c.visitorId));
  if (!o || !his) throw new OrdersError('NOT_FOUND', 'no such order', ['number']);
  return o.id;
}

const addedLines = (db: OrdersDeps['db'] | Tx, storeId: number, orderId: string) =>
  db.orderItem.findMany({ where: { storeId, orderId, isAddOn: true, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true, variantId: true, productId: true, quantity: true, lineTotalMinor: true } });

/** The customer's add-on window for his order now. */
export async function addOnState(deps: OrdersDeps, c: CustomerRef, n: string): Promise<AddOnState> {
  const id = await ownOrderId(deps, c, n);
  const [cfg, o] = await Promise.all([setting(deps, c.storeId, 'orders.addOn'), deps.db.order.findUniqueOrThrow({ where: { id }, select: { ...MACHINE_SELECT, paymentMethod: true, placedAt: true, codAmountMinor: true } })]);
  const m = machineOf(o, await factsOf(deps.db, o));
  const closed = addOnClosedWhy(cfg, { ...m, paymentMethod: o.paymentMethod, placedAt: o.placedAt }, nowOf(deps));
  return { open: closed === null, closed, lines: await addedLines(deps.db, c.storeId, id), maxLines: cfg.maxLines, maxUnits: cfg.maxUnits, dueMinor: o.codAmountMinor };
}

interface AddSpec {
  variantId: string;
  quantity: number;
  via: AddOnSource;
  /** The customer's own limits (staff are not held to them). */
  limits: { maxLines: number; maxUnits: number } | null;
}

/** The order's money and band, read under the command's lock. */
const moneyOf = (tx: Tx, id: string) => tx.order.findUniqueOrThrow({ where: { id }, select: { subtotalMinor: true, totalMinor: true, codAmountMinor: true, deliveryBand: { select: { codLimitMinor: true } } } });

/** The ERP already has this order: send it again as the next revision, with its lines as they are now. */
async function resendErp(deps: OrdersDeps, tx: Tx, o: LockedOrder, codAmountMinor: number, totalMinor: number): Promise<string | null> {
  const sent = await tx.erpPush.count({ where: { storeId: o.storeId, referenceId: o.id, documentType: 'order.create' } });
  return sent ? queueErpOrder(deps, tx, { ...o, codAmountMinor, totalMinor }, sent) : null;
}

async function addCommand(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, spec: AddSpec, opts: CommandOptions & { customerCheck?: (o: LockedOrder, f: OrderFacts) => Promise<void> }): Promise<CommandResult> {
  return execute(
    deps,
    ref,
    by,
    {
      command: 'addLine',
      input: { variantId: spec.variantId, quantity: spec.quantity, via: spec.via },
      check: async (o, f) => {
        if (o.paymentMethod !== 'COD') throw new OrdersError('NOT_COD', 'lines are added to Cash on Delivery orders only', ['paymentMethod']);
        await opts.customerCheck?.(o, f);
      },
      effect: async (tx, o) => {
        const lines = await addedLines(tx, o.storeId, o.id);
        if (lines.some((l) => l.variantId === spec.variantId)) throw new OrdersError('ADD_ON_LIMIT', 'this piece is already added', ['variantId']);
        if (spec.limits && (lines.length >= spec.limits.maxLines || spec.quantity > spec.limits.maxUnits)) throw new OrdersError('ADD_ON_LIMIT', 'no more lines can be added', ['quantity'], { maxLines: spec.limits.maxLines, maxUnits: spec.limits.maxUnits });
        const v = await tx.productVariant.findFirst({
          where: { id: spec.variantId, storeId: o.storeId, archivedAt: null, product: { status: 'PUBLISHED', archivedAt: null } },
          select: { id: true, sku: true, productId: true, product: { select: { nameEn: true } }, colour: { select: { nameEn: true } }, size: { select: { label: true } } },
        });
        // the product page's price now: nothing on the order is priced again
        const price = v ? await discountWasFor(deps, { storeId: o.storeId, variantId: v.id }) : null;
        if (!v || !price) throw new OrdersError('NOT_SELLABLE', 'this piece cannot be ordered', ['variantId']);
        const lineTotalMinor = price.discountedMinor * spec.quantity;
        const money = await moneyOf(tx, o.id);
        const codAmountMinor = money.codAmountMinor + lineTotalMinor;
        const limit = money.deliveryBand?.codLimitMinor ?? null;
        if (limit !== null && codAmountMinor > limit) throw new OrdersError('COD_LIMIT', 'the Cash on Delivery limit of this delivery band would be passed', ['codAmountMinor'], { limitMinor: limit });
        try {
          await holdOrderUnits(inventoryOf(deps), { storeId: o.storeId, orderId: o.id, variantId: v.id, quantity: spec.quantity }, { tx });
        } catch (e) {
          if (e instanceof InventoryError && e.code === 'OUT_OF_STOCK') throw new OrdersError('OUT_OF_STOCK', 'not enough pieces are free now', e.details);
          throw e;
        }
        const item = await tx.orderItem.create({
          data: {
            storeId: o.storeId,
            orderId: o.id,
            variantId: v.id,
            productId: v.productId,
            sku: v.sku,
            productName: v.product.nameEn,
            colourName: v.colour?.nameEn ?? null,
            sizeLabel: v.size?.label ?? null,
            quantity: spec.quantity,
            unitPriceMinor: price.priceMinor,
            compareAtMinor: price.wasMinor,
            discountMinor: (price.priceMinor - price.discountedMinor) * spec.quantity,
            lineTotalMinor,
            isAddOn: true,
            addedVia: spec.via,
          },
          select: { id: true },
        });
        const totalMinor = money.totalMinor + lineTotalMinor;
        const erpPushId = await resendErp(deps, tx, o, codAmountMinor, totalMinor);
        return {
          data: { subtotalMinor: money.subtotalMinor + lineTotalMinor, totalMinor, codAmountMinor },
          eventData: { itemId: item.id, variantId: v.id, sku: v.sku, quantity: spec.quantity, unitPriceMinor: price.priceMinor, lineTotalMinor, via: spec.via, erpPushId },
        };
      },
    },
    opts,
  );
}

async function removeCommand(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, lineId: string, opts: CommandOptions & { customerCheck?: (o: LockedOrder, f: OrderFacts) => Promise<void> }): Promise<CommandResult> {
  return execute(
    deps,
    ref,
    by,
    {
      command: 'removeLine',
      input: { lineId },
      check: async (o, f) => {
        if (o.paymentMethod !== 'COD') throw new OrdersError('NOT_COD', 'lines are changed on Cash on Delivery orders only', ['paymentMethod']);
        await opts.customerCheck?.(o, f);
      },
      effect: async (tx, o) => {
        const item = await tx.orderItem.findFirst({ where: { id: lineId, storeId: o.storeId, orderId: o.id, status: 'ACTIVE' }, select: { id: true, isAddOn: true, variantId: true, sku: true, quantity: true, lineTotalMinor: true } });
        if (!item) throw new OrdersError('NOT_FOUND', 'no such line on this order', ['lineId']);
        if (!item.isAddOn) throw new OrdersError('ADD_ON_ONLY', 'only a line added after the order was placed can be taken out here', ['lineId']);
        await tx.orderItem.update({ where: { id: item.id }, data: { status: 'REMOVED' } });
        if (item.variantId) await releaseOrderUnits(inventoryOf(deps), { storeId: o.storeId, orderId: o.id, variantId: item.variantId }, { tx });
        const money = await moneyOf(tx, o.id);
        const codAmountMinor = Math.max(0, money.codAmountMinor - item.lineTotalMinor);
        const totalMinor = money.totalMinor - item.lineTotalMinor;
        const erpPushId = await resendErp(deps, tx, o, codAmountMinor, totalMinor);
        return {
          data: { subtotalMinor: money.subtotalMinor - item.lineTotalMinor, totalMinor, codAmountMinor },
          eventData: { itemId: item.id, variantId: item.variantId, sku: item.sku, quantity: item.quantity, lineTotalMinor: item.lineTotalMinor, erpPushId },
        };
      },
    },
    opts,
  );
}

/** The window again under the order's lock (a confirm or a booking in the same second wins). */
const windowCheck = (deps: OrdersDeps, storeId: number) => async (o: LockedOrder, f: OrderFacts) => {
  const cfg = await setting(deps, storeId, 'orders.addOn');
  const closed = addOnClosedWhy(cfg, { ...machineOf(o, f), paymentMethod: o.paymentMethod, placedAt: o.placedAt }, nowOf(deps));
  if (closed) throw new OrdersError('ADD_ON_CLOSED', 'pieces can no longer be added to this order', ['number'], { closed });
};

/** The customer adds a piece to his own order (the thank-you page or his order page). */
export async function customerAddOn(deps: OrdersDeps, c: CustomerRef, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<CommandResult> {
  const d = parse(customerAddInput, input, 'add-on');
  const orderId = await ownOrderId(deps, c, d.number);
  const cfg = await setting(deps, c.storeId, 'orders.addOn');
  return addCommand(deps, { storeId: c.storeId, orderId }, customerBy(c), { variantId: d.variantId, quantity: d.quantity ?? 1, via: d.from ?? 'thanks', limits: { maxLines: cfg.maxLines, maxUnits: cfg.maxUnits } }, { ...opts, customerCheck: windowCheck(deps, c.storeId) });
}

/** The customer takes out a piece he added (while the window is open). */
export async function customerRemoveAddOn(deps: OrdersDeps, c: CustomerRef, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<CommandResult> {
  const d = parse(customerRemoveInput, input, 'add-on');
  const orderId = await ownOrderId(deps, c, d.number);
  return removeCommand(deps, { storeId: c.storeId, orderId }, customerBy(c), d.lineId, { ...opts, customerCheck: windowCheck(deps, c.storeId) });
}

/** Staff add a line to an order not yet with the courier (`orders.lines`). */
export async function addLine(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.lines');
  const d = parse(addLineInput, input, 'line');
  return addCommand(deps, { storeId: who.storeId, orderId }, staffBy(who.actor, who.ctx), { variantId: d.variantId, quantity: d.quantity ?? 1, via: 'admin', limits: null }, opts);
}

/** Staff take out a line that was added after the order was placed (`orders.lines`). */
export async function removeLine(deps: OrdersDeps, who: Who, orderId: string, lineId: string, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.lines');
  if (!UUID.test(lineId)) throw new OrdersError('NOT_FOUND', 'no such line on this order', ['lineId']);
  return removeCommand(deps, { storeId: who.storeId, orderId }, staffBy(who.actor, who.ctx), lineId, opts);
}
