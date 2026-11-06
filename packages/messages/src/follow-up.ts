// S13 · PR 275 — the follow-up of an unfinished checkout, at most two messages (Blueprint C6.3; SIM-F-026 acceptance).
// A customer who typed his number at checkout and left (PR 274 keeps it, `checkout.capture.enabled`) gets, while the
// owner's `orders.followUp` is on:
// 1. about `firstAfterMinutes` later, one reminder by the first way he said yes to offers on (WhatsApp, then SMS, as
//    the owner orders them), with a link that puts his exact bag back in any browser (`/api/bag/back/<code>`);
// 2. only while the offer is switched on and the owner picked a live code, one offer `afterHours` after a reminder that
//    went; then nothing more. Two messages per unfinished checkout, ever (CheckoutDraft.followUpCount, claimed under
//    its own compare-and-set), and a number that had a follow-up in `phoneGapDays` gets no new ladder.
// Never: a checkout he finished (or any order on his number since), one the team marked handled, a number with no yes
// for offers (or a stop), a checkout older than `catchUpHours` past its time. The Messages engine sends the queued row
// (engine.ts sendFollowUp) and checks it all again at that moment, within the quiet hours, logged and costed like every
// message. AI off is the only mode built: saved templates and these fixed rules. Nothing here moves money, changes a
// price or COD, or blocks anyone; the offer is the owner's own code, used only after he switched it on.
import { randomBytes } from 'node:crypto';
import { FOLLOW_UP_CEILING, FOLLOW_UP_STEPS, type FollowUpSettings, type MessageChannel } from '@extas/settings';
import { followedSince } from './cart-recovery';
import { offerConsent } from './consent';
import { setting, TX, nowOf, type MessagesDeps } from './context';
import { orderedSince } from './engine';
import { FOLLOW_UP_STEP, FOLLOW_UP_TEMPLATES, followUpTick } from './pure';

/** RecoveryMessage.kind of an unfinished checkout's follow-up (PR 276's abandoned bag is its own kind). */
export const FOLLOW_UP_KIND = 'INCOMPLETE';
/** How many unfinished checkouts one run looks at (the rest wait for the next run). */
const BATCH = 200;
/** How far he got, in the checkout's own order (details → delivery → payment); -1 for anything else. */
const rankOf = (step: string | null): number => (FOLLOW_UP_STEPS as readonly string[]).indexOf(step ?? '');
const MINUTE = 60_000;

export interface FollowUpPlan {
  /** Messages queued by this run (reminders and offers). */
  queued: number;
  reminders: number;
  offers: number;
}

/** The dedupe key of a follow-up's message: one per unfinished checkout and attempt, never twice. */
export const followUpKey = (draftId: string, attempt: number): string => `followUp:${draftId}:${attempt}`;

/** The random code of the bag's link (URL-safe, unguessable). */
export const newRestoreCode = (): string => randomBytes(12).toString('base64url');

/** Which attempt is due for a checkout now (1 the reminder, 2 the offer), or null. Pure: the dates and the settings. */
export function followUpDue(
  cfg: Pick<FollowUpSettings, 'firstAfterMinutes' | 'catchUpHours' | 'minStep' | 'offer'>,
  d: { followUpCount: number; lastStep: string | null; lastActivityAt: Date },
  firstSentAt: Date | null,
  now: Date,
): 1 | 2 | null {
  if (rankOf(d.lastStep) < 0 || rankOf(d.lastStep) < rankOf(cfg.minStep)) return null;
  if (d.followUpCount === 0) {
    const due = d.lastActivityAt.getTime() + cfg.firstAfterMinutes * MINUTE;
    return due <= now.getTime() && now.getTime() - due <= cfg.catchUpHours * 60 * MINUTE ? 1 : null;
  }
  if (d.followUpCount === 1 && FOLLOW_UP_CEILING >= 2 && cfg.offer.enabled && cfg.offer.couponCode.trim() && firstSentAt) {
    return firstSentAt.getTime() + cfg.offer.afterHours * 60 * MINUTE <= now.getTime() ? 2 : null;
  }
  return null;
}

/**
 * Queues the due follow-ups of one store (the message job, before each send run). Safe to run again at any time: an
 * attempt is claimed by moving `followUpCount` from n to n+1, and its message's dedupe key is unique.
 */
export async function planFollowUps(deps: MessagesDeps, storeId: number): Promise<FollowUpPlan> {
  const out: FollowUpPlan = { queued: 0, reminders: 0, offers: 0 };
  const cfg = await setting(deps, storeId, 'orders.followUp');
  if (!cfg.enabled) return out;
  const now = nowOf(deps);
  const oldest = new Date(now.getTime() - (cfg.firstAfterMinutes * MINUTE + cfg.catchUpHours * 60 * MINUTE + Math.max(cfg.offer.afterHours, 1) * 60 * MINUTE));
  const drafts = await deps.db.checkoutDraft.findMany({
    where: { storeId, convertedOrderId: null, handledAt: null, phone: { not: null }, followUpCount: { lt: FOLLOW_UP_CEILING }, lastActivityAt: { gte: oldest, lte: new Date(now.getTime() - cfg.firstAfterMinutes * MINUTE) } },
    orderBy: { lastActivityAt: 'desc' },
    take: BATCH,
    select: { id: true, phone: true, customerId: true, cartId: true, lastStep: true, lastActivityAt: true, followUpCount: true, restoreCode: true, createdAt: true, data: true },
  });
  if (!drafts.length) return out;
  const coupon = cfg.offer.enabled && cfg.offer.couponCode.trim() ? await deps.db.coupon.findFirst({ where: { storeId, code: { equals: cfg.offer.couponCode.trim(), mode: 'insensitive' }, enabled: true }, select: { id: true } }) : null;
  const firsts = await deps.db.recoveryMessage.findMany({ where: { storeId, kind: FOLLOW_UP_KIND, attempt: 1, checkoutDraftId: { in: drafts.map((d) => d.id) } }, select: { checkoutDraftId: true, sentAt: true, channel: true } });
  const firstOf = new Map(firsts.map((f) => [f.checkoutDraftId, f]));
  for (const d of drafts) {
    const first = firstOf.get(d.id) ?? null;
    const attempt = followUpDue(cfg, d, first?.sentAt ?? null, now);
    if (!attempt || !d.phone) continue;
    if (attempt === 2 && !coupon) continue;
    if (await orderedSince(deps, storeId, d.phone, d.createdAt)) continue;
    // PR 276: one ladder per number, whichever it was (an unfinished checkout's, or a left bag's)
    if (attempt === 1 && (await followedSince(deps.db, storeId, d.phone, new Date(now.getTime() - cfg.phoneGapDays * 1_440 * MINUTE)))) continue;
    // the offer goes the way the reminder went while he still says yes there; otherwise the first way he says yes on
    const order: MessageChannel[] = attempt === 2 && first ? [first.channel as MessageChannel, ...cfg.channels.filter((c) => c !== first.channel)] : [...cfg.channels];
    let channel: MessageChannel | null = null;
    for (const ch of order) {
      if (!(await offerConsent(deps.db, storeId, { channel: ch, phone: d.phone, customerId: d.customerId, tick: { value: followUpTick(d.data, ch), at: d.lastActivityAt } }))) {
        channel = ch;
        break;
      }
    }
    if (!channel) continue;
    const template = await deps.db.notificationTemplate.findFirst({ where: { storeId, key: attempt === 2 ? FOLLOW_UP_TEMPLATES.offer : FOLLOW_UP_TEMPLATES.reminder, channel, archivedAt: null }, select: { id: true } });
    const queued = await deps.db.$transaction(async (tx) => {
      const claimed = await tx.checkoutDraft.updateMany({ where: { id: d.id, storeId, followUpCount: attempt - 1, convertedOrderId: null }, data: { followUpCount: attempt, ...(d.restoreCode ? {} : { restoreCode: newRestoreCode() }) } });
      if (claimed.count !== 1) return false;
      const log = await tx.notificationLog.create({
        data: { storeId, customerId: d.customerId, channel, recipient: d.phone!, status: 'QUEUED', dedupeKey: followUpKey(d.id, attempt), step: FOLLOW_UP_STEP, templateId: template?.id ?? null, sendAfter: now, createdAt: now },
        select: { id: true },
      });
      await tx.recoveryMessage.create({ data: { storeId, kind: FOLLOW_UP_KIND, checkoutDraftId: d.id, cartId: d.cartId, attempt, channel, offerCouponId: attempt === 2 ? coupon!.id : null, notificationLogId: log.id, createdAt: now } });
      return true;
    }, TX);
    if (!queued) continue;
    out.queued++;
    if (attempt === 1) out.reminders++;
    else out.offers++;
  }
  return out;
}
