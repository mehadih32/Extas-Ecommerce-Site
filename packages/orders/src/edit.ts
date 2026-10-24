// PR 142 — the team edits an order when the customer phones in (Blueprint B1.10; demo V12.3 "Edit items & address"):
// the customer's name, phone (SIM-F-037: a wrong number is corrected with a log) and address, the note for the parcel,
// a line changed to another size (or colour) of the same piece at the same price, a line taken out. It is a command of
// the one order service (`edit`, pure.ts), so the row lock, the version check, the timeline and the audit log are never
// skipped, and the machine refuses it once a courier is booked or while a cancel is asked (SIM-F-004: an edit after
// booking would never reach the parcel; D5 says cancel and create a replacement instead).
//
// Every edit records why (the owner's `orders.edit.reasons`), where the customer asked (`orders.edit.channels`; the
// source of the event is the admin), who and when, and each field and line before → after. B1.10: every edit re-runs
// the stock check (the new size is held on the shared pool, the old one let go) and the fraud check (the duplicate check
// again, when the phone or the lines changed).
//
// Money (CLAUDE.md rule 6): no price, discount, delivery charge or COD rule is ever changed. A size change keeps the
// line's stored money and is refused when the other size costs another price now (PRICE_DIFFERS). Taking a line out
// lowers the order's subtotal, total and amount to collect by exactly that line's total; a line in a set, or any line of
// an order that carries an order-wide offer, is never taken out (OFFER_ON_ORDER — the offer's price would change), nor
// the last line (cancel instead). On a paid order, anything paid beyond the new total becomes a refund REQUEST for the
// owner, as a cancel does (F-041); no money moves. The address is the text the parcel carries; the delivery area and its
// charge stay exactly as the checkout stored them (never re-read from the text). An order the ERP has goes again.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery/phone';
import { InventoryError, resetOrderUnits } from '@extas/inventory';
import { resendErp } from './addon';
import { OTHER_KEY } from './commands';
import { allow, parse, setting, UUID, type OrdersDeps, type Tx, type Who } from './context';
import { screenOrder } from './duplicates';
import { OrdersError } from './errors';
import { execute, inventoryOf, staffBy, type By, type CommandOptions, type CommandResult, type Effect, type LockedOrder } from './service';

/** A line change: another size (or colour) of the same piece at the same price, or the line taken out. */
export type LineChange = { lineId: string; variantId: string } | { lineId: string; remove: true };

/** What an edit may change. A field left out stays as it is. */
export interface EditChanges {
  customerName?: string;
  phone?: string;
  address?: string;
  /** The note that goes with the parcel (Order.note); an empty text clears it. */
  deliveryNote?: string;
  lines?: LineChange[];
}

const uuid = z.string().regex(UUID);
export const lineChangeSchema = z.union([z.object({ lineId: uuid, variantId: uuid }).strict(), z.object({ lineId: uuid, remove: z.literal(true) }).strict()]);

/** The fields of an edit (shared by the team's edit and the customer's own). */
export const editFields = {
  customerName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  address: z.string().trim().min(10).max(500).optional(),
  deliveryNote: z.string().trim().max(500).optional(),
  lines: z.array(lineChangeSchema).min(1).max(50).optional(),
};

export const editInput = z
  .object({ reasonKey: z.string().trim().min(1).max(60), channel: z.string().trim().min(1).max(60).optional(), note: z.string().trim().max(2_000).optional(), ...editFields })
  .strict();

export type EditField = 'customerName' | 'phone' | 'address' | 'deliveryNote';

/** One field as the timeline and the audit row keep it. */
export interface FieldChange {
  field: EditField;
  before: string | null;
  after: string | null;
}

/** One line as the timeline and the audit row keep it. */
export interface LineChangeDone {
  lineId: string;
  kind: 'size' | 'remove';
  sku: string;
  label: string;
  toSku?: string;
  toLabel?: string;
  quantity: number;
  lineTotalMinor: number;
}

export interface EditDone {
  effect: Effect;
  fields: FieldChange[];
  lines: LineChangeDone[];
}

const LINE_SELECT = { id: true, variantId: true, productId: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true, lineTotalMinor: true, comboId: true } satisfies Prisma.OrderItemSelect;

const labelOf = (l: { productName: string; colourName: string | null; sizeLabel: string | null }) => [l.productName, l.colourName, l.sizeLabel].filter(Boolean).join(' · ');

/** Why a line may not be taken out (null: it may). */
export function removeRefusal(line: { comboId: string | null }, order: { discountMinor: number }, activeLines: number): 'OFFER_ON_ORDER' | 'LAST_LINE' | null {
  if (line.comboId || order.discountMinor > 0) return 'OFFER_ON_ORDER';
  return activeLines <= 1 ? 'LAST_LINE' : null;
}

/**
 * The edit itself, inside a command's transaction under the order's lock (the machine already said `edit` is open).
 * Throws NOTHING_CHANGED when every field is as stored. Used by the team's edit, the customer's own and the two-size answer.
 */
export async function applyEdit(deps: OrdersDeps, tx: Tx, o: LockedOrder, c: EditChanges, meta: { reason: string; by: By }): Promise<EditDone> {
  const data: Prisma.OrderUncheckedUpdateInput = {};
  const fields: FieldChange[] = [];
  const set = (field: EditField, before: string | null, after: string | null) => {
    if ((before ?? '') === (after ?? '')) return false;
    fields.push({ field, before, after });
    return true;
  };
  if (c.customerName !== undefined && set('customerName', o.customerName, c.customerName)) data.customerName = c.customerName;
  if (c.phone !== undefined) {
    const p = phoneNormalizeBD(c.phone);
    if (!p.ok) throw new OrdersError('BAD_PHONE', 'not a Bangladeshi mobile number', ['phone'], { reason: p.reason });
    if (set('phone', o.phone, p.e164)) data.phone = p.e164;
  }
  if (c.address !== undefined && set('address', o.shippingAddressText, c.address)) {
    data.shippingAddressText = c.address;
    // the full address attached for packing (PR 561) was the old one's
    data.backfilledAddress = null;
  }
  if (c.deliveryNote !== undefined && set('deliveryNote', o.note, c.deliveryNote || null)) data.note = c.deliveryNote || null;

  const lines: LineChangeDone[] = [];
  let removedMinor = 0;
  if (c.lines?.length) {
    const ids = c.lines.map((l) => l.lineId);
    if (new Set(ids).size !== ids.length) throw new OrdersError('INVALID_INPUT', 'each line once', ['lines']);
    const [items, order] = await Promise.all([
      tx.orderItem.findMany({ where: { storeId: o.storeId, orderId: o.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: LINE_SELECT }),
      tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { discountMinor: true } }),
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));
    /** Pieces of each variant the order's lines hold after the edit. */
    const qty = new Map<string, number>();
    for (const i of items) if (i.variantId) qty.set(i.variantId, (qty.get(i.variantId) ?? 0) + i.quantity);
    const touched = new Set<string>();
    const move = (variantId: string | null, by: number) => {
      if (!variantId) return;
      qty.set(variantId, (qty.get(variantId) ?? 0) + by);
      touched.add(variantId);
    };
    let active = items.length;
    for (const ch of c.lines) {
      const i = byId.get(ch.lineId);
      if (!i) throw new OrdersError('NOT_FOUND', 'no such line on this order', ['lines']);
      if ('remove' in ch) {
        const no = removeRefusal(i, order, active);
        if (no === 'OFFER_ON_ORDER') throw new OrdersError('OFFER_ON_ORDER', 'this piece carries an offer or a set price; taking it out would change a price', ['lines']);
        if (no === 'LAST_LINE') throw new OrdersError('LAST_LINE', 'the last piece is not taken out; cancel the order instead', ['lines']);
        active -= 1;
        await tx.orderItem.update({ where: { id: i.id }, data: { status: 'REMOVED' } });
        move(i.variantId, -i.quantity);
        removedMinor += i.lineTotalMinor;
        lines.push({ lineId: i.id, kind: 'remove', sku: i.sku, label: labelOf(i), quantity: i.quantity, lineTotalMinor: i.lineTotalMinor });
        continue;
      }
      if (ch.variantId === i.variantId) continue;
      const v = await tx.productVariant.findFirst({
        where: { id: ch.variantId, storeId: o.storeId, archivedAt: null, product: { status: 'PUBLISHED', archivedAt: null } },
        select: { id: true, sku: true, productId: true, priceMinor: true, colour: { select: { nameEn: true } }, size: { select: { label: true } } },
      });
      if (!v || !i.productId || v.productId !== i.productId) throw new OrdersError('NOT_SAME_PIECE', 'a line changes only to another size or colour of the same piece', ['lines']);
      if (v.priceMinor !== i.unitPriceMinor) throw new OrdersError('PRICE_DIFFERS', 'that size costs another price now; an edit never changes a price', ['lines'], { priceMinor: v.priceMinor, linePriceMinor: i.unitPriceMinor });
      const to = { productName: i.productName, colourName: v.colour?.nameEn ?? null, sizeLabel: v.size?.label ?? null };
      // the line keeps its id (reviews, Find My Size answers and exchanges link to it) and its stored money
      await tx.orderItem.update({ where: { id: i.id }, data: { variantId: v.id, sku: v.sku, colourName: to.colourName, sizeLabel: to.sizeLabel } });
      move(i.variantId, -i.quantity);
      move(v.id, i.quantity);
      lines.push({ lineId: i.id, kind: 'size', sku: i.sku, label: labelOf(i), toSku: v.sku, toLabel: labelOf(to), quantity: i.quantity, lineTotalMinor: i.lineTotalMinor });
    }
    // the stock check again: the order holds exactly what its lines say now (freed sizes first)
    for (const variantId of [...touched].sort((a, b) => (qty.get(a) ?? 0) - (qty.get(b) ?? 0))) {
      try {
        await resetOrderUnits(inventoryOf(deps), { storeId: o.storeId, orderId: o.id, variantId, quantity: Math.max(0, qty.get(variantId) ?? 0) }, { tx });
      } catch (e) {
        if (e instanceof InventoryError && e.code === 'OUT_OF_STOCK') throw new OrdersError('OUT_OF_STOCK', 'not enough pieces are free now', e.details);
        throw e;
      }
    }
  }
  if (!fields.length && !lines.length) throw new OrdersError('NOTHING_CHANGED', 'every field is as stored', []);

  const m = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { subtotalMinor: true, totalMinor: true, codAmountMinor: true, walletAppliedMinor: true, paidMinor: true } });
  const totalMinor = m.totalMinor - removedMinor;
  const codAmountMinor = Math.max(0, m.codAmountMinor - removedMinor);
  if (removedMinor) Object.assign(data, { subtotalMinor: m.subtotalMinor - removedMinor, totalMinor, codAmountMinor });
  // a paid order: what is now paid beyond its total is owed back — a REQUEST for the owner, never a payout
  const inMinor = m.paidMinor + m.walletAppliedMinor;
  const owedMinor = Math.max(0, inMinor - totalMinor) - Math.max(0, inMinor - m.totalMinor);
  const refundRequestIds: string[] = [];
  if (owedMinor > 0) {
    const r = await tx.refund.create({
      data: { storeId: o.storeId, orderId: o.id, amountMinor: owedMinor, method: m.paidMinor > 0 ? 'original' : 'wallet', reason: meta.reason, status: 'REQUESTED', source: 'EDIT', idempotencyKey: `edit:${o.id}:${o.version}`, requestedById: meta.by.actorType === 'STAFF' ? meta.by.actorId : null },
      select: { id: true },
    });
    refundRequestIds.push(r.id);
  }
  const now = (k: keyof LockedOrder) => (k in data ? (data as Record<string, unknown>)[k] : o[k]) as never;
  const erpPushId = await resendErp(deps, tx, { ...o, customerName: now('customerName'), phone: now('phone'), shippingAddressText: now('shippingAddressText'), backfilledAddress: now('backfilledAddress'), note: now('note') }, codAmountMinor, totalMinor);
  const money = removedMinor ? { totalMinor: m.totalMinor, codAmountMinor: m.codAmountMinor } : {};
  const moneyAfter = removedMinor ? { totalMinor, codAmountMinor } : {};
  return {
    fields,
    lines,
    effect: {
      data,
      reasonCode: meta.reason,
      eventData: { fields, lines, removedMinor, refundRequestIds, erpPushId },
      refundRequestIds,
      audit: {
        before: { ...Object.fromEntries(fields.map((f) => [f.field, f.before])), ...money, ...(lines.length ? { lines: lines.map((l) => ({ lineId: l.lineId, sku: l.sku })) } : {}) },
        after: { ...Object.fromEntries(fields.map((f) => [f.field, f.after])), ...moneyAfter, ...(lines.length ? { lines: lines.map((l) => ({ lineId: l.lineId, sku: l.kind === 'remove' ? null : l.toSku })) } : {}) },
      },
    },
  };
}

/** B1.10: the fraud check again after the phone or the lines changed. It never undoes the edit; a failure waits for the next one. */
export async function rescreenAfterEdit(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, c: EditChanges): Promise<void> {
  if (c.phone === undefined && !c.lines?.length) return;
  try {
    await screenOrder(deps, ref, { again: { by } });
  } catch {
    // the order is edited; the review queue simply has no new row this time
  }
}

/** The team's edit (`orders.edit`): a reason from the owner's list (a note with "other"), and where the customer asked. */
export async function editOrder(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.edit');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(editInput, input, 'edit');
  const [reasons, channels] = await Promise.all([setting(deps, who.storeId, 'orders.edit.reasons'), setting(deps, who.storeId, 'orders.edit.channels')]);
  const reason = reasons.find((r) => r.key === d.reasonKey);
  if (!reason) throw new OrdersError('REASON_REQUIRED', 'pick an edit reason from the list', ['reasonKey']);
  if (reason.key === OTHER_KEY && !d.note) throw new OrdersError('REASON_REQUIRED', 'this reason needs a note', ['note']);
  const channel = d.channel ? channels.find((x) => x.key === d.channel) : null;
  if (d.channel && !channel) throw new OrdersError('INVALID_INPUT', 'pick where the customer asked from the list', ['channel']);
  const { reasonKey: _r, channel: _c, note, ...changes } = d;
  const by = staffBy(who.actor, who.ctx);
  const ref = { storeId: who.storeId, orderId };
  const r = await execute(
    deps,
    ref,
    by,
    {
      command: 'edit',
      input: d,
      effect: async (tx, o) => {
        const done = await applyEdit(deps, tx, o, changes, { reason: reason.key, by });
        return { ...done.effect, message: note ?? null, eventData: { ...done.effect.eventData, reason: { en: reason.en, bn: reason.bn }, channel: channel ?? null } };
      },
    },
    opts,
  );
  await rescreenAfterEdit(deps, ref, by, changes);
  return r;
}

/** What the edit dialog offers for each line now: the other sizes (and colours) of the same piece at the same price, and whether it may be taken out. */
export interface EditChoice {
  lineId: string;
  /** null: it may be taken out. */
  removeRefusal: 'OFFER_ON_ORDER' | 'LAST_LINE' | null;
  swaps: { variantId: string; colour: string | null; size: string | null }[];
}

export async function editChoices(deps: OrdersDeps, who: Who, orderId: string): Promise<EditChoice[]> {
  await allow(deps, who, 'orders.read');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { id: true, discountMinor: true } });
  if (!o) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const items = await deps.db.orderItem.findMany({ where: { storeId: who.storeId, orderId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: LINE_SELECT });
  const productIds = [...new Set(items.flatMap((i) => (i.productId ? [i.productId] : [])))];
  const variants = productIds.length
    ? await deps.db.productVariant.findMany({
        where: { storeId: who.storeId, productId: { in: productIds }, archivedAt: null, product: { status: 'PUBLISHED', archivedAt: null } },
        orderBy: [{ colour: { nameEn: 'asc' } }, { size: { sortOrder: 'asc' } }],
        select: { id: true, productId: true, priceMinor: true, colour: { select: { nameEn: true } }, size: { select: { label: true } } },
      })
    : [];
  return items.map((i) => ({
    lineId: i.id,
    removeRefusal: removeRefusal(i, o, items.length),
    swaps: variants.filter((v) => v.productId === i.productId && v.id !== i.variantId && v.priceMinor === i.unitPriceMinor).map((v) => ({ variantId: v.id, colour: v.colour?.nameEn ?? null, size: v.size?.label ?? null })),
  }));
}
