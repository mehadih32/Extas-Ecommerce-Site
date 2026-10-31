// Review R1 (M2) — "Set delivery area": the team settles the delivery band (and, when known, the place) of an order the
// checkout could not settle — an address nothing read ("address unclear") or a band with no charge yet ("charge not
// set", PR 563) — after the confirmation call found where the house is. Never automatic: a person with the edit key
// picks the band from the store's switched-on list, gives a reason from the owner's edit reasons, and it is a command of
// the one order service (row lock, version check, timeline, audit log; refused once a courier is booked or while a
// cancel is asked, like every edit).
//
// Money (CLAUDE.md rule 6): nothing is priced by hand. The charge is the band's own charge as the owner set it in
// Delivery, or nothing when the order's lines get free delivery there (the same Smart Rules the checkout reads: no
// figure is typed here). The total and the amount to collect take that charge; the area, band and charge are then
// fixed on the order like a checkout-settled one, the address flags are cleared, the address call is closed, and an
// order the ERP has goes again. An order whose charge the checkout already fixed only gets its place (for a courier that
// needs zone ids); its band and charge are never changed (the lesson "shown = stored").
//
// Review R2 (M2): "free delivery there" is judged with the order's own facts, the way the checkout judged them — the
// Smart Rules' payment method, the customer, the source, the code this order redeemed (unlocked, not checked again) and
// the prepaid reward "free delivery". And one figure for the door: an order paid ahead (not Cash on Delivery) that is
// past PLACED is refused (PAYMENT_DUE) when the band would make money due — the courier would collect it while the door
// record and the ERP say nothing is due. Before confirming, the confirm itself waits for that money (PAYMENT_DUE).
import { z } from 'zod';
import { codToCollect } from '@extas/payments';
import { quoteCart } from '@extas/rules';
import { resendErp } from './addon';
import { OTHER_KEY } from './commands';
import { allow, nowOf, parse, setting, UUID, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { execute, staffBy, type CommandOptions, type CommandResult } from './service';

/** Methods that are not "paid ahead": Cash on Delivery, the shop's own wallet (all of it covered), cash at the counter. */
const NOT_PAID_AHEAD: readonly string[] = ['COD', 'WALLET', 'CASH'];

/** The value the Smart Rules' `payment.method` condition saw at checkout (@extas/checkout `rulesPaymentMethod`). */
export function rulesMethodOf(method: string | null): string | null {
  switch (method) {
    case 'COD':
      return 'cod';
    case 'BKASH':
    case 'NAGAD':
    case 'ROCKET':
    case 'UPAY':
      return method.toLowerCase();
    case 'CARD':
    case 'BANK_TRANSFER':
      return 'card';
    case 'ONLINE':
      return 'online';
    default:
      return null;
  }
}

/** The flags and call reasons the checkout set for an address it could not settle (@extas/checkout place.ts). */
const AREA_FLAGS = ['ADDRESS_UNCLEAR', 'CHARGE_NOT_SET'] as const;

export const deliveryAreaInput = z
  .object({
    /** The band the team settled with the customer (one of the store's switched-on bands). */
    bandId: z.uuid().optional(),
    /** The place, when the team knows it (a courier with zone ids books by it). */
    areaId: z.uuid().nullable().optional(),
    reasonKey: z.string().trim().min(1).max(60),
    channel: z.string().trim().min(1).max(60).optional(),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .refine((v) => v.bandId !== undefined || (v.areaId ?? null) !== null, { message: 'give the band or the place', path: ['bandId'] });

/** Sets the delivery band (and its own charge) or the place of an order the checkout could not settle. */
export async function setDeliveryArea(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.edit');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(deliveryAreaInput, input, 'delivery area');
  const [reasons, channels] = await Promise.all([setting(deps, who.storeId, 'orders.edit.reasons'), setting(deps, who.storeId, 'orders.edit.channels')]);
  const reason = reasons.find((r) => r.key === d.reasonKey);
  if (!reason) throw new OrdersError('REASON_REQUIRED', 'pick an edit reason from the list', ['reasonKey']);
  if (reason.key === OTHER_KEY && !d.note) throw new OrdersError('REASON_REQUIRED', 'this reason needs a note', ['note']);
  const channel = d.channel ? channels.find((x) => x.key === d.channel) : null;
  if (d.channel && !channel) throw new OrdersError('INVALID_INPUT', 'pick where the customer asked from the list', ['channel']);
  const by = staffBy(who.actor, who.ctx);
  return execute(
    deps,
    { storeId: who.storeId, orderId },
    by,
    {
      command: 'edit',
      input: d,
      effect: async (tx, o) => {
        const m = await tx.order.findUniqueOrThrow({
          where: { id: o.id },
          select: {
            areaId: true,
            deliveryBandId: true,
            chargeFixed: true,
            deliveryChargeMinor: true,
            totalMinor: true,
            codAmountMinor: true,
            flags: true,
            addressUnclear: true,
            paymentMethod: true,
            walletAppliedMinor: true,
            paidMinor: true,
            status: true,
            customerId: true,
            source: true,
            items: { where: { status: 'ACTIVE' }, select: { variantId: true, quantity: true, comboGroupKey: true } },
          },
        });
        const area = d.areaId ? await tx.geoArea.findFirst({ where: { id: d.areaId }, select: { id: true } }) : null;
        if (d.areaId && !area) throw new OrdersError('INVALID_INPUT', 'no such place', ['areaId']);
        const data: Record<string, unknown> = {};
        const before: Record<string, unknown> = { areaId: m.areaId, deliveryBandId: m.deliveryBandId, deliveryChargeMinor: m.deliveryChargeMinor, totalMinor: m.totalMinor, codAmountMinor: m.codAmountMinor, chargeFixed: m.chargeFixed };
        if (area) data.areaId = area.id;
        let totalMinor = m.totalMinor;
        let codAmountMinor = m.codAmountMinor;
        if (d.bandId !== undefined) {
          // the checkout's charge is the contract: a fixed charge is never changed here
          if (m.chargeFixed) throw new OrdersError('CHARGE_FIXED', 'the checkout already fixed this order’s delivery charge', ['bandId']);
          const band = await tx.deliveryBand.findFirst({ where: { id: d.bandId, storeId: o.storeId, enabled: true, archivedAt: null }, select: { id: true, key: true, chargeMinor: true } });
          if (!band) throw new OrdersError('INVALID_INPUT', 'pick one of the store’s switched-on delivery bands', ['bandId']);
          // free delivery there? the same Smart Rules the checkout reads, on the order's lines, for this band — and with
          // the order's own facts, as the checkout saw them (review R2 M2): how he pays, who he is, where he ordered,
          // and the code this order redeemed (unlocked, not checked again: its own use would refuse it)
          const lines = m.items.flatMap((i, n) => (i.variantId ? [{ id: `line-${n}`, variantId: i.variantId, quantity: i.quantity, comboId: i.comboGroupKey }] : []));
          const [paidBy, redemption, rewardOn, rewardType] = await Promise.all([
            tx.payment.findFirst({ where: { storeId: o.storeId, orderId: o.id, method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'asc' }, select: { method: true } }),
            tx.couponRedemption.findFirst({ where: { orderId: o.id }, select: { coupon: { select: { id: true, code: true, ruleId: true } } } }),
            setting(deps, o.storeId, 'checkout.prepaidReward.enabled'),
            setting(deps, o.storeId, 'checkout.prepaidReward.type'),
          ]);
          const q = await quoteCart(
            { db: deps.db, settings: deps.settings, now: deps.now },
            {
              storeId: o.storeId,
              lines,
              bandKey: band.key,
              paymentMethod: rulesMethodOf(paidBy?.method ?? m.paymentMethod),
              customerId: m.customerId,
              source: m.source.toLowerCase(),
              redeemedCoupon: redemption ? { couponId: redemption.coupon.id, code: redemption.coupon.code, ruleId: redemption.coupon.ruleId } : null,
            },
          );
          // the prepaid reward "free delivery" (PR 120): an order paid ahead in full gets it, as the checkout gives it
          const prepaid = m.paymentMethod !== null && !NOT_PAID_AHEAD.includes(m.paymentMethod);
          const rewardFree = prepaid && rewardOn === true && rewardType === 'freeDelivery';
          const chargeMinor = q.delivery.free || rewardFree ? 0 : band.chargeMinor;
          totalMinor = m.totalMinor - m.deliveryChargeMinor + chargeMinor;
          codAmountMinor = codToCollect({ paymentMethod: m.paymentMethod ?? 'COD', totalMinor, walletAppliedMinor: m.walletAppliedMinor, paidMinor: m.paidMinor });
          // One figure for the door (review R2 M2): an order paid ahead and already confirmed never gets money due from
          // here — the rider would collect what the door record and the ERP call paid. Before confirming, the confirm
          // itself waits for the payment (PAYMENT_DUE), so the money due is asked for the normal way.
          const dueOf = (total: number) => Math.max(0, total - m.walletAppliedMinor - m.paidMinor);
          // (Not Cash on Delivery, as the order machine reads it: a wallet-covered order counts too.)
          const notCod = m.paymentMethod !== null && m.paymentMethod !== 'COD';
          if (notCod && m.status !== 'PLACED' && dueOf(totalMinor) > dueOf(m.totalMinor)) {
            throw new OrdersError('PAYMENT_DUE', 'the band’s charge would be money due on an order paid ahead and already confirmed', ['bandId']);
          }
          Object.assign(data, { deliveryBandId: band.id, deliveryChargeMinor: chargeMinor, chargeFixed: true, addressUnclear: false, totalMinor, codAmountMinor, flags: m.flags.filter((f) => !(AREA_FLAGS as readonly string[]).includes(f)) });
        } else if (m.areaId === area?.id) {
          throw new OrdersError('NOTHING_CHANGED', 'the order already has this place', ['areaId']);
        }
        // the address call is answered by this: closed with its outcome
        const closed = d.bandId !== undefined ? (await tx.callTask.updateMany({ where: { storeId: o.storeId, orderId: o.id, reason: { in: [...AREA_FLAGS] }, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'DONE', outcome: 'AREA_SET', closedAt: nowOf(deps) } })).count : 0;
        const erpPushId = d.bandId !== undefined ? await resendErp(deps, tx, o, codAmountMinor, totalMinor) : null;
        const after = { ...before, ...data };
        delete (after as { flags?: unknown }).flags;
        delete (after as { addressUnclear?: unknown }).addressUnclear;
        return {
          data,
          reasonCode: reason.key,
          message: d.note ?? null,
          eventData: { deliveryArea: { before, after }, reason: { en: reason.en, bn: reason.bn }, channel: channel ?? null, callTasksClosed: closed, erpPushId },
          audit: { before, after },
        };
      },
    },
    opts,
  );
}

/** No delivery charge owed. */
const NONE = 0;

/**
 * CN-018 (4) · follow-up 330 (the payments door hook `keptChargeMinor`): the delivery charge a free-delivery order
 * owes when only some of its lines stay with the customer — its band's own charge when the whole order gets free
 * delivery there by the same Smart Rules the checkout reads and the kept lines alone do not; else 0. Read only: the
 * door record keeps it as the rider's expected amount, which a person approves (nothing is charged here).
 */
export async function keptDeliveryCharge(deps: Pick<OrdersDeps, 'db' | 'settings' | 'now'>, storeId: number, orderId: string, keptItemIds: readonly string[]): Promise<number> {
  const o = await deps.db.order.findFirst({
    where: { id: orderId, storeId },
    select: { deliveryChargeMinor: true, deliveryBand: { select: { key: true, chargeMinor: true } }, items: { where: { status: 'ACTIVE' }, select: { id: true, variantId: true, quantity: true, comboGroupKey: true } } },
  });
  if (!o || o.deliveryChargeMinor !== 0 || !o.deliveryBand?.chargeMinor) return 0;
  const linesOf = (items: typeof o.items) => items.flatMap((i, n) => (i.variantId ? [{ id: `line-${n}`, variantId: i.variantId, quantity: i.quantity, comboId: i.comboGroupKey }] : []));
  const kept = o.items.filter((i) => keptItemIds.includes(i.id));
  if (!kept.length) return 0;
  const d = { db: deps.db, settings: deps.settings, now: deps.now };
  const [all, part] = await Promise.all([quoteCart(d, { storeId, lines: linesOf(o.items), bandKey: o.deliveryBand.key, source: 'admin' }), quoteCart(d, { storeId, lines: linesOf(kept), bandKey: o.deliveryBand.key, source: 'admin' })]);
  const owes = all.delivery.free && !part.delivery.free;
  return owes ? o.deliveryBand.chargeMinor : NONE;
}
