// S28 · PR 665 — "Merge" on a Merge-needed row: one open order of a customer is folded INTO another. The orders of one
// person that landed apart (a call, then the website) become one order and one parcel, per B1.12. It is different from
// "One parcel" (bundling.ts), which keeps every order as it is and only ships them together.
//
// What it does, in one transaction (every row locked in one fixed order, so two merges never wait on each other):
//   · the kept order (the one the person picks) takes the other order's lines as its own add-on lines (`addedVia` "merge"),
//     at the price each line was sold at; the person may leave lines out first (they are cancelled with the order, never lost:
//     the cancelled order still shows them); nothing is priced again;
//   · the other order is cancelled with the reason "duplicate order" and a note naming the kept order; its stock holds go
//     free in the same transaction and the kept order holds the lines it took;
//   · the kept order's subtotal, total and Cash on Delivery amount grow by exactly the lines moved; its delivery charge and
//     address stay (the other order's charge goes with the cancelled order: that is the saving);
//   · one append-only `OrderMerge` row per folded order, a timeline line on both orders and an audit row;
//   · "Merge + call" also puts a call task on the kept order, to tell the customer.
// After it the kept order is edited with the page's own commands (take a moved line out, change a size, add a piece), then
// confirmed as usual: the merge changes nothing else.
//
// What it refuses: an order with money on it (paid, wallet, a discount or an offer: those cannot be moved safely), a prepaid
// order, a gift, a pickup, an order that is Packed, picked or with a courier ("no merge after Packed"), another person's order,
// an order placed more than `lookBackDays` before the kept one, and (when the setting says ask) a different address until a
// person confirms it. Off until the owner turns `orders.mergeOrders` on; auto-merge (also off) only joins matching addresses.
import { z } from 'zod';
import { holdOrderUnits, InventoryError } from '@extas/inventory';
import type { Prisma } from '@extas/db/client';
import { allow, parse, setting, TX, UUID, type OrdersDeps, type Tx, type Who } from './context';
import { resendErp } from './addon';
import { addressKey, BUNDLEABLE } from './bundling';
import { OrdersError } from './errors';
import { phoneForms } from './phone-history';
import { plan, type OrderState } from './pure';
import { auditRow, cancelEffects, eventRow, factsOf, inventoryOf, lockOrder, MACHINE_SELECT, machineOf, staffBy, systemBy, type By, type LockedOrder } from './service';

export const MERGED_INTO_EVENT = 'order.mergedInto';
export const MERGED_FROM_EVENT = 'order.mergedFrom';
/** The cancel code a folded order carries (the existing "duplicate order"); the note names the kept order. */
export const MERGE_CANCEL_CODE = 'DUPLICATE_ORDER';
export const MERGE_CALL_REASON = 'MERGED_ORDER';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTE_MAX = 2_000;

export const mergeIntoInput = z
  .object({
    /** The order that stays. */
    mainOrderId: z.uuid(),
    /** The orders folded into it, each with the lines the person leaves out. */
    sources: z
      .array(z.object({ orderId: z.uuid(), leaveOutLineIds: z.array(z.uuid()).max(100).optional() }).strict())
      .min(1)
      .max(10),
    /** Lines to leave out, whichever folded order they are on (the page sends one list). */
    leaveOutLineIds: z.array(z.uuid()).max(200).optional(),
    /** The addresses differ and the person says go on with the kept order's address. */
    confirmAddress: z.boolean().optional(),
    /** "Merge + call": queue a call to the customer on the kept order. */
    call: z.boolean().optional(),
    note: z.string().trim().max(NOTE_MAX).optional(),
  })
  .strict();
export type MergeIntoInput = z.output<typeof mergeIntoInput>;

export interface MergeLineView {
  lineId: string;
  sku: string;
  name: string;
  colour: string | null;
  size: string | null;
  quantity: number;
  lineTotalMinor: number;
  /** A combo or offer line cannot be moved. */
  movable: boolean;
}

export interface MergeMate {
  orderId: string;
  number: string;
  status: OrderState;
  placedAt: Date;
  totalMinor: number;
  sameAddress: boolean;
  address: string | null;
  lines: MergeLineView[];
  /** Why it cannot be folded in (null: it can). */
  blocked: string | null;
}

export interface MergeView {
  enabled: boolean;
  canMerge: boolean;
  /** This order cannot be the kept one now (null: it can). */
  closed: string | null;
  lookBackDays: number;
  differentAddress: 'ask' | 'refuse';
  main: { orderId: string; number: string; address: string | null; totalMinor: number; lines: MergeLineView[] };
  mates: MergeMate[];
}

const LINE_SELECT = { id: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true, lineTotalMinor: true, comboId: true } as const;

const lineView = (l: { id: string; sku: string; productName: string; colourName: string | null; sizeLabel: string | null; quantity: number; lineTotalMinor: number; comboId: string | null }): MergeLineView => ({
  lineId: l.id,
  sku: l.sku,
  name: l.productName,
  colour: l.colourName,
  size: l.sizeLabel,
  quantity: l.quantity,
  lineTotalMinor: l.lineTotalMinor,
  movable: l.comboId === null,
});

/** The part of an order a merge reads (money, kind, address). */
const MERGE_SELECT = { subtotalMinor: true, discountMinor: true, isGift: true, archivedAt: true, deliveryBand: { select: { codLimitMinor: true } } } as const;

/** Why `o` cannot be folded into the kept order (null: it can); the reasons are codes the page words. */
export function mateBlocked(
  main: { placedAt: Date; customerId: string | null; phone: string | null },
  o: { status: string; placedAt: Date; customerId: string | null; phone: string | null; paymentMethod: string | null; paidMinor: number; walletAppliedMinor: number; discountMinor: number; isGift: boolean; fulfillmentType: string; cancelPending: boolean; hasShipment: boolean; archived: boolean; comboLines: number },
  lookBackDays: number,
): string | null {
  const same = (main.customerId && main.customerId === o.customerId) || (main.phone && phoneForms(main.phone).includes(o.phone ?? ''));
  if (!same) return 'OTHER_PERSON';
  if (o.archived) return 'CLOSED';
  if (!(BUNDLEABLE as readonly string[]).includes(o.status) || o.hasShipment || o.cancelPending) return 'PAST_OPEN';
  if (o.isGift || o.fulfillmentType !== 'DELIVERY') return 'GIFT_OR_PICKUP';
  if (o.paymentMethod !== 'COD') return 'NOT_COD';
  if (o.paidMinor > 0 || o.walletAppliedMinor > 0) return 'HAS_PAYMENT';
  if (o.discountMinor > 0 || o.comboLines > 0) return 'HAS_OFFER';
  if (Math.abs(main.placedAt.getTime() - o.placedAt.getTime()) > lookBackDays * DAY_MS) return 'TOO_OLD';
  return null;
}

/** The merge panel: this order as the kept one and the same person's other open orders with their lines and what blocks them. */
export async function mergeView(deps: OrdersDeps, who: Who, orderId: string): Promise<MergeView | null> {
  await allow(deps, who, 'orders.read');
  if (!UUID.test(orderId)) return null;
  const db = deps.db;
  const o = await db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { ...MACHINE_SELECT, ...MERGE_SELECT, number: true, customerId: true, phone: true, placedAt: true, paymentMethod: true, fulfillmentType: true, shippingAddressText: true, totalMinor: true } });
  if (!o) return null;
  const [cfg, held] = await Promise.all([setting(deps, who.storeId, 'orders.mergeOrders'), mayMerge(deps, who)]);
  const facts = await factsOf(db, o);
  const open = (BUNDLEABLE as readonly string[]).includes(o.status) && !facts.shipment && !o.cancelPending && !o.archivedAt;
  const closed = !cfg.enabled ? 'off' : !open ? 'PAST_OPEN' : o.paymentMethod !== 'COD' ? 'NOT_COD' : o.isGift || o.fulfillmentType !== 'DELIVERY' ? 'GIFT_OR_PICKUP' : null;
  const mainLines = await db.orderItem.findMany({ where: { storeId: who.storeId, orderId, status: 'ACTIVE' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: LINE_SELECT });
  const forms = phoneForms(o.phone);
  const same: Prisma.OrderWhereInput[] = [...(o.customerId ? [{ customerId: o.customerId }] : []), ...(forms.length ? [{ phone: { in: forms } }] : [])];
  const rows = same.length && closed === null
    ? await db.order.findMany({
        where: { storeId: who.storeId, id: { not: orderId }, OR: same, status: { in: [...BUNDLEABLE] }, archivedAt: null },
        orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
        take: 20,
        select: { ...MACHINE_SELECT, ...MERGE_SELECT, number: true, customerId: true, phone: true, placedAt: true, paymentMethod: true, fulfillmentType: true, shippingAddressText: true, totalMinor: true, items: { where: { status: 'ACTIVE' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: LINE_SELECT }, shipments: { where: { status: { notIn: ['BOOKING_FAILED', 'CANCELLED'] } }, select: { id: true }, take: 1 } },
      })
    : [];
  const mainKey = addressKey(o.shippingAddressText);
  return {
    enabled: cfg.enabled,
    canMerge: held && cfg.enabled && closed === null,
    closed,
    lookBackDays: cfg.lookBackDays,
    differentAddress: cfg.differentAddress,
    main: { orderId, number: o.number, address: o.shippingAddressText, totalMinor: o.totalMinor, lines: mainLines.map(lineView) },
    mates: rows.map((r) => ({
      orderId: r.id,
      number: r.number,
      status: r.status as OrderState,
      placedAt: r.placedAt,
      totalMinor: r.totalMinor,
      sameAddress: addressKey(r.shippingAddressText) === mainKey,
      address: r.shippingAddressText,
      lines: r.items.map(lineView),
      blocked: mateBlocked(o, { ...r, hasShipment: r.shipments.length > 0, archived: r.archivedAt !== null, comboLines: r.items.filter((i) => i.comboId !== null).length, cancelPending: r.cancelPending }, cfg.lookBackDays),
    })),
  };
}

async function mayMerge(deps: OrdersDeps, who: Who): Promise<boolean> {
  try {
    await allow(deps, who, 'orders.merge');
    return true;
  } catch {
    return false;
  }
}

export interface MergeDone {
  mainOrderId: string;
  mainNumber: string;
  version: number;
  folded: { orderId: string; number: string; movedLines: number; movedMinor: number; leftOutLines: number }[];
  callTaskId: string | null;
}

/** Folds the orders into the kept one (`orders.merge`, switch `orders.mergeOrders`). */
export async function mergeIntoOne(deps: OrdersDeps, who: Who, input: unknown): Promise<MergeDone> {
  await allow(deps, who, 'orders.merge');
  const d = parse(mergeIntoInput, input, 'merge');
  return foldInto(deps, who.storeId, d, staffBy(who.actor, who.ctx), false);
}

/** The core: one transaction, every order locked in id order. `auto` is the system's own merge (matching addresses only). */
export async function foldInto(deps: OrdersDeps, storeId: number, d: MergeIntoInput, by: By, auto: boolean): Promise<MergeDone> {
  const cfg = await setting(deps, storeId, 'orders.mergeOrders');
  if (!cfg.enabled) throw new OrdersError('MERGE_OFF', 'merging orders is switched off in Rules', ['enabled']);
  const sourceIds = d.sources.map((s) => s.orderId);
  if (new Set(sourceIds).size !== sourceIds.length || sourceIds.includes(d.mainOrderId)) throw new OrdersError('NOT_MERGEABLE', 'pick the kept order once and each other order once', ['sources']);
  const ids = [d.mainOrderId, ...sourceIds].sort();
  const now = deps.now ? deps.now() : new Date();
  return deps.db.$transaction(async (tx) => {
    const locked = new Map<string, LockedOrder>();
    for (const id of ids) locked.set(id, await lockOrder(tx, storeId, id));
    const main = locked.get(d.mainOrderId)!;
    const read = async (o: LockedOrder) => {
      const [x, f, comboLines] = await Promise.all([
        tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { ...MERGE_SELECT, placedAt: true, subtotalMinor: true } }),
        factsOf(tx, o),
        tx.orderItem.count({ where: { storeId, orderId: o.id, status: 'ACTIVE', comboId: { not: null } } }),
      ]);
      return { x, f, comboLines };
    };
    const mainInfo = await read(main);
    const mainOpen = (BUNDLEABLE as readonly string[]).includes(main.status) && !mainInfo.f.shipment && !main.cancelPending && !mainInfo.x.archivedAt;
    if (!mainOpen) throw new OrdersError('NOT_MERGEABLE', `order ${main.number} is packed, booked or finished`, ['mainOrderId'], { orderId: main.id, status: main.status });
    if (main.paymentMethod !== 'COD') throw new OrdersError('NOT_MERGEABLE', `order ${main.number} is prepaid: lines cannot be added to it`, ['mainOrderId'], { orderId: main.id, reason: 'NOT_COD' });
    if (mainInfo.x.isGift || main.fulfillmentType !== 'DELIVERY') throw new OrdersError('NOT_MERGEABLE', `order ${main.number} is a gift or a pickup`, ['mainOrderId'], { orderId: main.id, reason: 'GIFT_OR_PICKUP' });
    const mainKey = addressKey(main.shippingAddressText);
    let addressDiffers = false;
    const leaveAll = new Set(d.leaveOutLineIds ?? []);
    const plans: { o: LockedOrder; leaveOut: Set<string>; items: Awaited<ReturnType<typeof loadItems>> }[] = [];
    for (const s of d.sources) {
      const o = locked.get(s.orderId)!;
      const { x, f, comboLines } = await read(o);
      const why = mateBlocked(main, { ...o, discountMinor: x.discountMinor, isGift: x.isGift, hasShipment: !!f.shipment, archived: x.archivedAt !== null, comboLines, placedAt: x.placedAt }, cfg.lookBackDays);
      if (why) throw new OrdersError('NOT_MERGEABLE', `order ${o.number} cannot be folded in (${why})`, ['sources'], { orderId: o.id, reason: why });
      if (!plan('cancel', machineOf(o, f)).ok) throw new OrdersError('NOT_MERGEABLE', `order ${o.number} cannot be cancelled now`, ['sources'], { orderId: o.id, reason: 'PAST_OPEN' });
      if (addressKey(o.shippingAddressText) !== mainKey) {
        if (auto || cfg.differentAddress === 'refuse') throw new OrdersError('NOT_MERGEABLE', `order ${o.number} goes to another address`, ['sources'], { orderId: o.id, reason: 'ADDRESS' });
        addressDiffers = true;
      }
      const items = await loadItems(tx, storeId, o.id);
      const leaveOut = new Set([...(s.leaveOutLineIds ?? []), ...items.filter((i) => leaveAll.has(i.id)).map((i) => i.id)]);
      for (const id of s.leaveOutLineIds ?? []) if (!items.some((i) => i.id === id)) throw new OrdersError('NOT_FOUND', 'no such line on this order', ['leaveOutLineIds'], { orderId: o.id, lineId: id });
      plans.push({ o, leaveOut, items });
    }
    for (const id of leaveAll) if (!plans.some((p) => p.items.some((i) => i.id === id))) throw new OrdersError('NOT_FOUND', 'no such line on the orders to fold in', ['leaveOutLineIds'], { lineId: id });
    if (addressDiffers && !d.confirmAddress) {
      throw new OrdersError('ADDRESS_DIFFERS', 'the addresses differ: confirm the kept order\'s address to go on', ['confirmAddress'], { addresses: [main, ...plans.map((p) => p.o)].map((o) => ({ orderId: o.id, number: o.number, address: o.shippingAddressText })) });
    }

    // 1) the folded orders are cancelled first, so their pieces are free for the kept order to hold
    const folded: MergeDone['folded'] = [];
    let movedTotal = 0;
    for (const p of plans) {
      const kept = p.items.filter((i) => !p.leaveOut.has(i.id));
      const movedMinor = kept.reduce((n, i) => n + Math.max(0, i.lineTotalMinor), 0);
      const fx = await cancelEffects(deps, tx, p.o, by, MERGE_CANCEL_CODE, now);
      const note = `Merged into ${main.number}`;
      const after = await tx.order.update({ where: { id: p.o.id }, data: { status: 'CANCELLED', cancelledAt: now, cancelReasonCode: MERGE_CANCEL_CODE, cancelNote: note, holdFromStatus: null, onHoldSince: null, cancelRequestedAt: null, version: { increment: 1 } }, select: { version: true } });
      await eventRow(tx, by, { storeId, orderId: p.o.id, type: 'order.cancel', from: p.o.status as OrderState, to: 'CANCELLED', reasonCode: MERGE_CANCEL_CODE, message: note, data: { reason: { en: 'Merged into another order', bn: 'আরেকটা অর্ডারের সাথে মার্জ হয়েছে' }, riskSignal: false, ...fx, mergedInto: { orderId: main.id, number: main.number } } });
      await eventRow(tx, by, { storeId, orderId: p.o.id, type: MERGED_INTO_EVENT, message: d.note ?? null, data: { mainOrderId: main.id, mainNumber: main.number, movedLines: kept.length, movedMinor, leftOutLines: p.leaveOut.size, auto } });
      await auditRow(tx, by, { storeId, action: 'order.mergeInto', entityType: 'Order', entityId: p.o.id, before: { status: p.o.status, version: p.o.version }, after: { status: 'CANCELLED', version: after.version, mergedInto: main.number } });
      folded.push({ orderId: p.o.id, number: p.o.number, movedLines: kept.length, movedMinor, leftOutLines: p.leaveOut.size });
      movedTotal += movedMinor;
    }

    // 2) the kept order takes the lines, at the price they were sold at
    for (const p of plans) {
      for (const i of p.items) {
        if (p.leaveOut.has(i.id)) continue;
        if (i.variantId) {
          try {
            await holdOrderUnits(inventoryOf(deps), { storeId, orderId: main.id, variantId: i.variantId, quantity: i.quantity }, { tx });
          } catch (e) {
            if (e instanceof InventoryError && e.code === 'OUT_OF_STOCK') throw new OrdersError('OUT_OF_STOCK', 'not enough pieces are free to take this line', e.details);
            throw e;
          }
        }
        await tx.orderItem.create({
          data: {
            storeId,
            orderId: main.id,
            variantId: i.variantId,
            productId: i.productId,
            sku: i.sku,
            productName: i.productName,
            colourName: i.colourName,
            sizeLabel: i.sizeLabel,
            quantity: i.quantity,
            unitPriceMinor: i.unitPriceMinor,
            compareAtMinor: i.compareAtMinor,
            discountMinor: i.discountMinor,
            lineTotalMinor: i.lineTotalMinor,
            unitCostMinor: i.unitCostMinor,
            isAddOn: true,
            addedVia: 'merge',
          },
        });
      }
    }
    const money = await tx.order.findUniqueOrThrow({ where: { id: main.id }, select: { subtotalMinor: true, totalMinor: true, codAmountMinor: true, deliveryBand: { select: { codLimitMinor: true } } } });
    const codAmountMinor = money.codAmountMinor + movedTotal;
    const totalMinor = money.totalMinor + movedTotal;
    const limit = money.deliveryBand?.codLimitMinor ?? null;
    if (limit !== null && codAmountMinor > limit) throw new OrdersError('COD_LIMIT', 'the Cash on Delivery limit of this delivery band would be passed', ['codAmountMinor'], { limitMinor: limit });
    const erpPushId = await resendErp(deps, tx, main, codAmountMinor, totalMinor);
    const callTask = d.call
      ? await tx.callTask.create({
          data: { storeId, orderId: main.id, customerId: main.customerId, reason: MERGE_CALL_REASON, notes: `Orders ${folded.map((f) => f.number).join(', ')} were merged into ${main.number}. Tell the customer and check the order.` },
          select: { id: true },
        })
      : null;
    const after = await tx.order.update({ where: { id: main.id }, data: { subtotalMinor: money.subtotalMinor + movedTotal, totalMinor, codAmountMinor, version: { increment: 1 } }, select: { version: true } });
    await eventRow(tx, by, { storeId, orderId: main.id, type: MERGED_FROM_EVENT, message: d.note ?? null, data: { folded, movedMinor: movedTotal, totalBeforeMinor: money.totalMinor, totalAfterMinor: totalMinor, addressDiffered: addressDiffers, callTaskId: callTask?.id ?? null, erpPushId, auto } });
    await auditRow(tx, by, { storeId, action: 'order.mergeFrom', entityType: 'Order', entityId: main.id, before: { totalMinor: money.totalMinor, version: main.version }, after: { totalMinor, version: after.version, folded: folded.map((f) => f.number) } });
    for (const f of folded) {
      await tx.orderMerge.create({ data: { storeId, mainOrderId: main.id, sourceOrderId: f.orderId, movedLines: f.movedLines, movedMinor: f.movedMinor, leftOutLines: f.leftOutLines, addressDiffered: addressDiffers, callQueued: !!callTask, auto, note: d.note ?? null, mergedById: by.actorType === 'STAFF' ? by.actorId : null } });
    }
    return { mainOrderId: main.id, mainNumber: main.number, version: after.version, folded, callTaskId: callTask?.id ?? null };
  }, TX);
}

const loadItems = (tx: Tx, storeId: number, orderId: string) =>
  tx.orderItem.findMany({
    where: { storeId, orderId, status: 'ACTIVE' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, variantId: true, productId: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true, compareAtMinor: true, discountMinor: true, lineTotalMinor: true, unitCostMinor: true },
  });

/**
 * The moment an order lands (switches `orders.mergeOrders` and its auto-merge on): the new order is folded into the same
 * person's oldest open order to the same address, inside the look-back days. Matching addresses only; anything else is left
 * for a person. Never stops the order: a refusal means "leave it".
 */
export async function autoMergeOnOrder(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By = systemBy('automerge')): Promise<MergeDone | null> {
  const cfg = await setting(deps, ref.storeId, 'orders.mergeOrders');
  if (!cfg.enabled || !cfg.autoMerge) return null;
  const o = await deps.db.order.findFirst({ where: { storeId: ref.storeId, id: ref.orderId }, select: { id: true, customerId: true, phone: true, placedAt: true, shippingAddressText: true, status: true } });
  const key = addressKey(o?.shippingAddressText);
  if (!o || !key || o.status !== 'PLACED') return null;
  const forms = phoneForms(o.phone);
  const same: Prisma.OrderWhereInput[] = [...(o.customerId ? [{ customerId: o.customerId }] : []), ...(forms.length ? [{ phone: { in: forms } }] : [])];
  if (!same.length) return null;
  const mates = await deps.db.order.findMany({
    where: { storeId: ref.storeId, id: { not: o.id }, OR: same, status: { in: [...BUNDLEABLE] }, placedAt: { gte: new Date(o.placedAt.getTime() - cfg.lookBackDays * DAY_MS), lte: o.placedAt }, archivedAt: null },
    orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, shippingAddressText: true },
  });
  const mate = mates.find((m) => addressKey(m.shippingAddressText) === key);
  if (!mate) return null;
  try {
    return await foldInto(deps, ref.storeId, { mainOrderId: mate.id, sources: [{ orderId: o.id }] }, by, true);
  } catch (e) {
    if (e instanceof OrdersError && ['NOT_MERGEABLE', 'OUT_OF_STOCK', 'COD_LIMIT', 'NOT_FOUND', 'MERGE_OFF'].includes(e.code)) return null;
    throw e;
  }
}
