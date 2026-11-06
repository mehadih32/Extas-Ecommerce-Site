// S13 · PR 276 — abandoned-cart recovery with the offer rules (Blueprint C6.3). A signed-in customer (his number is on
// his account) who left things in his bag and never reached the checkout's number box gets, while the owner's
// `orders.cartRecovery` is on:
// 1. about `firstAfterMinutes` after the bag's last change, one reminder by the first way he said yes to offers on
//    (WhatsApp, then SMS, as the owner orders them), with a link that puts his exact bag back in any browser
//    (`/api/bag/back/<code>`, Cart.restoreCode);
// 2. only while the offer is switched on with the owner's live code and the offer rules allow it, one offer
//    `afterHours` after a reminder that went; then nothing more. Two messages per bag, ever (Cart.recoveryCount, claimed
//    under its own compare-and-set).
// The offer rules: the bag is worth `offer.minBagMinor` or more; he had no recovery offer (from either ladder) in
// `offer.oncePerDays`; and the code may be used by him now — the rules engine's own coupon check (its dates, its uses,
// his per-customer cap, who it is for, its rule live). The discount itself is the code's rule at checkout, as for any
// code; nothing here prices anything.
// Never: a bag with a checkout number while PR 275's follow-up is on (that ladder has him), a number that had any
// follow-up in `orders.followUp.phoneGapDays` (one ladder per person), one who ordered since the bag began, a bag worth
// less than `minBagMinor`, a bag older than `catchUpHours` past its time, a number with no yes for offers (or a stop).
// A bag with no account and no number cannot be messaged at all (C6.3's honest limit): it stays in his browser for his
// next visit and the ad pixel's add-to-bag events feed retargeting; Orders › Incomplete only counts those. The Messages
// engine sends the queued row (engine.ts sendCartRecovery) and checks it all again at that moment, within the quiet
// hours, logged and costed like every message. AI off is the only mode built: saved templates and these fixed rules.
import { checkCoupon } from '@extas/rules';
import { FOLLOW_UP_CEILING, type CartRecoverySettings, type MessageChannel } from '@extas/settings';
import { offerConsent } from './consent';
import { setting, TX, nowOf, type Db, type MessagesDeps } from './context';
import { newRestoreCode, type FollowUpPlan } from './follow-up';
import { bagWorthMinor, CART_RECOVERY_STEP, CART_RECOVERY_TEMPLATES, FOLLOW_UP_STEP } from './pure';

/** RecoveryMessage.kind of a left bag's recovery (PR 275's unfinished checkout is `INCOMPLETE`). */
export const CART_RECOVERY_KIND = 'CART';
/** How many left bags one run looks at (the rest wait for the next run). */
const BATCH = 200;
const MINUTE = 60_000;
const DAY = 1_440 * MINUTE;
/** The steps of both recovery ladders (one ladder per number, whichever it was). */
export const RECOVERY_STEPS = [FOLLOW_UP_STEP, CART_RECOVERY_STEP] as const;
/** A tick never given (a bag has no checkout form): only his recorded answer counts. */
const NO_TICK = { value: null, at: new Date(0) } as const;

/** The dedupe key of a left bag's message: one per bag and attempt, never twice. */
export const cartRecoveryKey = (cartId: string, attempt: number): string => `cartRecovery:${cartId}:${attempt}`;

/** Which attempt is due for a left bag now (1 the reminder, 2 the offer), or null. Pure: the dates and the settings. */
export function cartRecoveryDue(
  cfg: Pick<CartRecoverySettings, 'firstAfterMinutes' | 'catchUpHours' | 'offer'>,
  c: { recoveryCount: number; lastActivityAt: Date },
  firstSentAt: Date | null,
  now: Date,
): 1 | 2 | null {
  if (c.recoveryCount === 0) {
    const due = c.lastActivityAt.getTime() + cfg.firstAfterMinutes * MINUTE;
    return due <= now.getTime() && now.getTime() - due <= cfg.catchUpHours * 60 * MINUTE ? 1 : null;
  }
  if (c.recoveryCount === 1 && FOLLOW_UP_CEILING >= 2 && cfg.offer.enabled && cfg.offer.couponCode.trim() && firstSentAt) {
    return firstSentAt.getTime() + cfg.offer.afterHours * 60 * MINUTE <= now.getTime() ? 2 : null;
  }
  return null;
}

/** Has this person (his number or his account) ordered — any order that is not a draft — since that time? */
export async function orderedSinceBy(deps: Pick<MessagesDeps, 'db'>, storeId: number, who: { phone: string; customerId: string | null }, since: Date): Promise<boolean> {
  const or = [{ phone: who.phone }, ...(who.customerId ? [{ customerId: who.customerId }] : [])];
  return !!(await deps.db.order.findFirst({ where: { storeId, OR: or, createdAt: { gte: since }, status: { not: 'DRAFT' } }, select: { id: true } }));
}

/** Did this number get any recovery message (either ladder, sent or not) since that time? One ladder per person. */
export async function followedSince(db: Db, storeId: number, phone: string, since: Date): Promise<boolean> {
  return (await db.notificationLog.count({ where: { storeId, recipient: phone, step: { in: [...RECOVERY_STEPS] }, createdAt: { gte: since } } })) > 0;
}

/** Did this person get a recovery offer (either ladder) since that time? The offer rules' "once per customer". */
export async function offeredSince(db: Db, storeId: number, who: { phone: string; customerId: string | null }, since: Date): Promise<boolean> {
  const or = [{ recipient: who.phone }, ...(who.customerId ? [{ customerId: who.customerId }] : [])];
  const logs = await db.notificationLog.findMany({ where: { storeId, step: { in: [...RECOVERY_STEPS] }, createdAt: { gte: since }, OR: or }, select: { id: true } });
  if (!logs.length) return false;
  return (await db.recoveryMessage.count({ where: { storeId, notificationLogId: { in: logs.map((l) => l.id) }, offerCouponId: { not: null } } })) > 0;
}

/** The offer's coupon when the rules engine says he may use it now (its dates, uses, his cap, who it is for, its rule live). */
export async function usableOffer(db: Db, storeId: number, code: string, who: { phone: string; customerId: string | null }, now: Date): Promise<{ id: string; code: string } | null> {
  if (!code.trim()) return null;
  const r = await checkCoupon(db, { storeId, code: code.trim(), phone: who.phone, customerId: who.customerId, now });
  return r.ok && r.couponId ? { id: r.couponId, code: r.code } : null;
}

/** The pieces and the worth of each bag's lines still in it (not saved for later, not taken out). */
export async function bagsOf(db: Db, storeId: number, cartIds: readonly string[]): Promise<Map<string, { pieces: number; worthMinor: number }>> {
  const lines = cartIds.length ? await db.cartItem.findMany({ where: { storeId, cartId: { in: [...cartIds] }, removedAt: null, savedForLater: false }, select: { cartId: true, quantity: true, unitPriceMinor: true, comboGroupKey: true, setPriceMinor: true } }) : [];
  const by = new Map<string, typeof lines>();
  for (const l of lines) by.set(l.cartId, [...(by.get(l.cartId) ?? []), l]);
  return new Map([...by].map(([id, ls]) => [id, { pieces: ls.reduce((s, l) => s + l.quantity, 0), worthMinor: bagWorthMinor(ls) }]));
}

/**
 * Queues the due recovery messages of one store's left bags (the message job, before each send run). Safe to run again
 * at any time: an attempt is claimed by moving `recoveryCount` from n to n+1, and its message's dedupe key is unique.
 */
export async function planCartRecovery(deps: MessagesDeps, storeId: number): Promise<FollowUpPlan> {
  const out: FollowUpPlan = { queued: 0, reminders: 0, offers: 0 };
  const cfg = await setting(deps, storeId, 'orders.cartRecovery');
  if (!cfg.enabled) return out;
  const checkout = await setting(deps, storeId, 'orders.followUp');
  const now = nowOf(deps);
  const oldest = new Date(now.getTime() - (cfg.firstAfterMinutes * MINUTE + cfg.catchUpHours * 60 * MINUTE + Math.max(cfg.offer.afterHours, 1) * 60 * MINUTE));
  const carts = await deps.db.cart.findMany({
    where: { storeId, status: 'ACTIVE', convertedOrderId: null, recoveryCount: { lt: FOLLOW_UP_CEILING }, lastActivityAt: { gte: oldest, lte: new Date(now.getTime() - cfg.firstAfterMinutes * MINUTE) }, customer: { is: { phone: { not: null }, archivedAt: null, erasedAt: null } } },
    orderBy: { lastActivityAt: 'desc' },
    take: BATCH,
    select: { id: true, customerId: true, lastActivityAt: true, recoveryCount: true, restoreCode: true, createdAt: true, customer: { select: { phone: true } } },
  });
  if (!carts.length) return out;
  const ids = carts.map((c) => c.id);
  const [bags, firsts, drafts] = await Promise.all([
    bagsOf(deps.db, storeId, ids),
    deps.db.recoveryMessage.findMany({ where: { storeId, kind: CART_RECOVERY_KIND, attempt: 1, cartId: { in: ids } }, select: { cartId: true, sentAt: true, channel: true } }),
    // while the checkout follow-up is on, a bag whose checkout kept a number is that ladder's
    checkout.enabled ? deps.db.checkoutDraft.findMany({ where: { storeId, cartId: { in: ids }, phone: { not: null } }, select: { cartId: true } }) : Promise.resolve([]),
  ]);
  const firstOf = new Map(firsts.map((f) => [f.cartId, f]));
  const inCheckout = new Set(drafts.map((d) => d.cartId));
  for (const c of carts) {
    const phone = c.customer?.phone;
    if (!phone || inCheckout.has(c.id)) continue;
    const bag = bags.get(c.id);
    if (!bag || bag.pieces <= 0 || bag.worthMinor < cfg.minBagMinor) continue;
    const first = firstOf.get(c.id) ?? null;
    const attempt = cartRecoveryDue(cfg, c, first?.sentAt ?? null, now);
    if (!attempt) continue;
    const who = { phone, customerId: c.customerId };
    let coupon: { id: string } | null = null;
    if (attempt === 2) {
      // the offer rules: the bag's worth, once per customer in the days, the code usable by him now
      if (bag.worthMinor < cfg.offer.minBagMinor) continue;
      if (await offeredSince(deps.db, storeId, who, new Date(now.getTime() - cfg.offer.oncePerDays * DAY))) continue;
      coupon = await usableOffer(deps.db, storeId, cfg.offer.couponCode, who, now);
      if (!coupon) continue;
    }
    if (await orderedSinceBy(deps, storeId, who, c.createdAt)) continue;
    if (attempt === 1 && (await followedSince(deps.db, storeId, phone, new Date(now.getTime() - checkout.phoneGapDays * DAY)))) continue;
    // the offer goes the way the reminder went while he still says yes there; otherwise the first way he says yes on
    const order: MessageChannel[] = attempt === 2 && first ? [first.channel as MessageChannel, ...cfg.channels.filter((ch) => ch !== first.channel)] : [...cfg.channels];
    let channel: MessageChannel | null = null;
    for (const ch of order) {
      if (!(await offerConsent(deps.db, storeId, { channel: ch, phone, customerId: c.customerId, tick: NO_TICK }))) {
        channel = ch;
        break;
      }
    }
    if (!channel) continue;
    const template = await deps.db.notificationTemplate.findFirst({ where: { storeId, key: attempt === 2 ? CART_RECOVERY_TEMPLATES.offer : CART_RECOVERY_TEMPLATES.reminder, channel, archivedAt: null }, select: { id: true } });
    const queued = await deps.db.$transaction(async (tx) => {
      const claimed = await tx.cart.updateMany({ where: { id: c.id, storeId, status: 'ACTIVE', recoveryCount: attempt - 1 }, data: { recoveryCount: attempt, ...(c.restoreCode ? {} : { restoreCode: newRestoreCode() }) } });
      if (claimed.count !== 1) return false;
      const log = await tx.notificationLog.create({
        data: { storeId, customerId: c.customerId, channel, recipient: phone, status: 'QUEUED', dedupeKey: cartRecoveryKey(c.id, attempt), step: CART_RECOVERY_STEP, templateId: template?.id ?? null, sendAfter: now, createdAt: now },
        select: { id: true },
      });
      await tx.recoveryMessage.create({ data: { storeId, kind: CART_RECOVERY_KIND, cartId: c.id, attempt, channel, offerCouponId: coupon?.id ?? null, notificationLogId: log.id, createdAt: now } });
      return true;
    }, TX);
    if (!queued) continue;
    out.queued++;
    if (attempt === 1) out.reminders++;
    else out.offers++;
  }
  return out;
}
