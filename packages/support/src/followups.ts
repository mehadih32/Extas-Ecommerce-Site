// S22 · PR 433 (Blueprint B4.7 bullet 3, B4.14 item 9) — follow-ups on chats that did not become an order: a proper,
// rule-capped system, never ad-hoc, and never sent by itself.
//
// With `support.followUp` on, the sweep (sweepFollowUps; run when the inbox or a chat is opened, at most once a minute
// per store, under a lock so two screens never put up the same one twice) looks at the quiet chats — the shop answered
// last, the chat is not solved, the customer has been quiet `afterHours` and the channel's reply window stays open long
// enough — and puts up one follow-up (a SupportFollowUp row) for a chat whose bag was left, whose products were sent and
// not ordered, or (win-back, off as it ships) whose order was cancelled lately. The caps: `maxPerChat` sent in all, one
// per quiet stretch (a skipped one does not come back until the chat moves), one per person (customer, every chat and
// channel) in `gapDays`, and `perDay` put up per store in a day. A follow-up that is no longer due (the customer wrote,
// an order came, the chat was solved, the window is closing) is CLOSED; one that was sent and then brought an order
// from the chat (within `support.catalogue.creditDays`) is ORDERED, for support analytics (PR 436).
//
// A person sees it on the chat (chatFollowUp) in the store's own words (`support.followUpWords`), may change them, and
// presses Send (sendFollowUp: an ordinary reply from that person, so "who replied" stays the person) or Skip
// (skipFollowUp). Each is a line in the who-did-what log. The owner's coupon is only mentioned when he named one in
// `offerCode` and it is live, switched on, open to everyone and not used up: nothing here makes, changes or widens a
// discount, changes a price or COD, moves money or blocks anyone.
import type { Prisma } from '@extas/db/client';
import type { FollowUpRule } from '@extas/settings';
import { z } from 'zod';
import { sendReply, type ReplyResult } from './actions';
import { chatVisitorId } from './chat-cart';
import { allow, nowOf, parse, setting, SupportError, TX, type Db, type SupportDeps, type Who } from './context';
import { fillDraft } from './drafts-pure';
import { followUpBody, followUpLang, followUpOpen, followUpRuleOf, personKeysOf, type FollowUpFacts } from './followups-pure';

const DAY = 86_400_000;
/** How many quiet chats one sweep looks at (the warmest first). */
const SWEEP_CHATS = 100;
/** How many waiting follow-ups the inbox's view lists at most. */
const VIEW_MAX = 1000;
/** A screen sweeps a store at most this often (the sweep itself runs whenever it is called). */
const SWEEP_EVERY_MS = 60_000;
/** The advisory lock's first key: follow-up sweeps (the second is the store). */
const LOCK_KEY = 433;

type Tx = Prisma.TransactionClient;

// ------------------------------------------------------------------------------------------------------------ facts

const chatSelect = {
  id: true,
  status: true,
  lastDirection: true,
  lastMessageAt: true,
  windowExpiresAt: true,
  orderId: true,
  customerId: true,
  contact: { select: { id: true, mergedIntoId: true, customerId: true, displayName: true } },
} as const satisfies Prisma.ConversationSelect;
type ChatRow = Prisma.ConversationGetPayload<{ select: typeof chatSelect }>;

/** What the chat holds that did not become an order: its bag, its products sent, its order cancelled. */
async function factsOf(db: Db, storeId: number, c: ChatRow): Promise<FollowUpFacts> {
  const order = c.orderId ? await db.order.findFirst({ where: { id: c.orderId, storeId }, select: { status: true, placedAt: true, cancelledAt: true, updatedAt: true } }) : null;
  const [bag, openShares] = await Promise.all([
    db.cartItem.aggregate({ where: { storeId, removedAt: null, savedForLater: false, cart: { storeId, visitorId: chatVisitorId(c.id), status: 'ACTIVE' } }, _sum: { quantity: true } }),
    // products sent after the chat's own order (an earlier order is not what they were sent for) that no order came from
    db.supportProductShare.count({ where: { storeId, conversationId: c.id, orderId: null, ...(order ? { createdAt: { gt: order.placedAt } } : {}) } }),
  ]);
  return {
    bagLines: bag._sum.quantity ?? 0,
    openShares,
    cancelledAt: order?.status === 'CANCELLED' ? (order.cancelledAt ?? order.updatedAt) : null,
  };
}

const customerOf = (c: ChatRow): string | null => c.customerId ?? c.contact.customerId;

/** Whether the person was sent a follow-up within `gapDays` (on any of their chats). */
async function personSent(db: Db, storeId: number, c: ChatRow, gapDays: number, now: Date): Promise<boolean> {
  return (await db.supportFollowUp.count({ where: { storeId, personKey: { in: personKeysOf(customerOf(c), c.contact) }, sentAt: { gte: new Date(now.getTime() - gapDays * DAY) } } })) > 0;
}

/** Whether the person already had a follow-up within `gapDays` (sent), or has another one waiting. */
async function personTaken(db: Db, storeId: number, c: ChatRow, gapDays: number, now: Date, exceptId?: string): Promise<boolean> {
  const keys = personKeysOf(customerOf(c), c.contact);
  const n = await db.supportFollowUp.count({
    where: { storeId, personKey: { in: keys }, ...(exceptId ? { id: { not: exceptId } } : {}), OR: [{ sentAt: { gte: new Date(now.getTime() - gapDays * DAY) } }, { outcome: null }] },
  });
  return n > 0;
}

// ------------------------------------------------------------------------------------------------------------ sweep

export interface FollowUpSweep {
  made: number;
  closed: number;
  ordered: number;
}

/** Put up the follow-ups that are due, close the ones no longer due, mark the sent ones that brought an order. */
export async function sweepFollowUps(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<FollowUpSweep> {
  const out: FollowUpSweep = { made: 0, closed: 0, ordered: 0 };
  const cfg = await setting(deps, storeId, 'support.followUp');
  if (!cfg.enabled) return out;
  const { creditDays } = await setting(deps, storeId, 'support.catalogue');
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    // one sweep of a store at a time; a second screen meanwhile simply reads what the first one put up
    const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}::int, ${storeId}::int) AS ok`;
    if (!lock?.ok) return;

    // 1. the waiting ones that are no longer due
    const waiting = await tx.supportFollowUp.findMany({ where: { storeId, outcome: null }, select: { id: true, conversationId: true }, take: VIEW_MAX });
    const chats = new Map((await tx.conversation.findMany({ where: { storeId, id: { in: waiting.map((w) => w.conversationId) } }, select: chatSelect })).map((c) => [c.id, c]));
    for (const w of waiting) {
      const c = chats.get(w.conversationId);
      if (c && followUpOpen(c, cfg, now) && !(await personSent(tx, storeId, c, cfg.gapDays, now)) && followUpRuleOf(await factsOf(tx, storeId, c), cfg, now)) continue;
      await tx.supportFollowUp.update({ where: { id: w.id }, data: { outcome: 'CLOSED' } });
      out.closed++;
    }

    // 2. the sent ones that brought an order from the chat (the chat's own order, or one from its products)
    const sent = await tx.supportFollowUp.findMany({ where: { storeId, outcome: 'SENT', sentAt: { gte: new Date(now.getTime() - creditDays * DAY) } }, select: { id: true, conversationId: true, sentAt: true } });
    for (const s of sent) {
      const [conv, shares] = await Promise.all([
        tx.conversation.findFirst({ where: { id: s.conversationId, storeId }, select: { orderId: true } }),
        tx.supportProductShare.findMany({ where: { storeId, conversationId: s.conversationId, orderId: { not: null } }, select: { orderId: true } }),
      ]);
      const ids = [conv?.orderId, ...shares.map((x) => x.orderId)].filter((x): x is string => !!x);
      const order = ids.length ? await tx.order.findFirst({ where: { storeId, id: { in: ids }, placedAt: { gt: s.sentAt! } }, orderBy: { placedAt: 'asc' }, select: { id: true, number: true } }) : null;
      if (!order) continue;
      await tx.supportFollowUp.update({ where: { id: s.id }, data: { outcome: 'ORDERED' } });
      await tx.conversationEvent.create({ data: { storeId, conversationId: s.conversationId, kind: 'FOLLOWUP_ORDERED', actorType: 'SYSTEM', data: { followUpId: s.id, orderId: order.id, number: order.number }, createdAt: now } });
      out.ordered++;
    }

    // 3. the new ones, within the store's day
    let room = cfg.perDay - (await tx.supportFollowUp.count({ where: { storeId, createdAt: { gt: new Date(now.getTime() - DAY) }, OR: [{ outcome: null }, { outcome: { not: 'CLOSED' } }] } }));
    if (room <= 0) return;
    const stillWaiting = (await tx.supportFollowUp.findMany({ where: { storeId, outcome: null }, select: { conversationId: true }, take: VIEW_MAX })).map((w) => w.conversationId);
    const quietSince = new Date(now.getTime() - cfg.afterHours * 3_600_000);
    const candidates = await tx.conversation.findMany({
      where: {
        storeId,
        status: { not: 'SOLVED' },
        lastDirection: 'OUT',
        lastMessageAt: { lte: quietSince, gte: new Date(now.getTime() - cfg.gapDays * DAY) },
        ...(stillWaiting.length ? { id: { notIn: stillWaiting } } : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: SWEEP_CHATS,
      select: chatSelect,
    });
    for (const c of candidates) {
      if (room <= 0) break;
      if (!followUpOpen(c, cfg, now)) continue;
      const [given, thisStretch] = await Promise.all([
        tx.supportFollowUp.count({ where: { storeId, conversationId: c.id, outcome: { in: ['SENT', 'ORDERED'] } } }),
        // one per quiet stretch: a skipped or closed one does not come back until the chat moves
        tx.supportFollowUp.count({ where: { storeId, conversationId: c.id, createdAt: { gte: c.lastMessageAt! } } }),
      ]);
      if (given >= cfg.maxPerChat || thisStretch > 0) continue;
      if (await personTaken(tx, storeId, c, cfg.gapDays, now)) continue;
      const rule = followUpRuleOf(await factsOf(tx, storeId, c), cfg, now);
      if (!rule) continue;
      await tx.supportFollowUp.create({ data: { storeId, conversationId: c.id, ruleKey: rule, personKey: personKeysOf(customerOf(c), c.contact)[0]!, scheduledAt: new Date(c.lastMessageAt!.getTime() + cfg.afterHours * 3_600_000), createdAt: now } });
      out.made++;
      room--;
    }
  }, TX);
  return out;
}

const lastSweep = new Map<number, number>();

/** The sweep as a screen runs it: at most once a minute per store (by the app's clock). */
export async function sweepFollowUpsSoon(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<void> {
  const at = nowOf(deps).getTime();
  const before = lastSweep.get(storeId);
  if (before !== undefined && at >= before && at - before < SWEEP_EVERY_MS) return;
  lastSweep.set(storeId, at);
  await sweepFollowUps(deps, storeId);
}

/** The chats with a follow-up waiting for a person (the inbox's "Follow-ups" view). */
export async function waitingFollowUpChats(db: Db, storeId: number): Promise<string[]> {
  const rows = await db.supportFollowUp.findMany({ where: { storeId, outcome: null }, orderBy: { scheduledAt: 'asc' }, select: { conversationId: true }, take: VIEW_MAX });
  return [...new Set(rows.map((r) => r.conversationId))];
}

// ------------------------------------------------------------------------------------------------------------ one chat

/** The owner's coupon a follow-up may mention: named in `offerCode`, switched on, in its dates, open to all, not used up. */
async function liveOffer(db: Db, storeId: number, code: string, now: Date): Promise<{ id: string; code: string } | null> {
  if (!code) return null;
  const c = await db.coupon.findFirst({
    where: { storeId, code: { equals: code, mode: 'insensitive' }, enabled: true, archivedAt: null, audience: 'ALL', AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
    select: { id: true, code: true, usageLimit: true, usedCount: true },
  });
  if (!c || (c.usageLimit !== null && c.usedCount >= c.usageLimit)) return null;
  return { id: c.id, code: c.code };
}

export interface ChatFollowUp {
  id: string;
  rule: FollowUpRule;
  /** When it became due. */
  dueAt: Date;
  /** When the channel stops taking the shop's answers (null: no window, the site's chat). */
  windowEndsAt: Date | null;
  lang: 'bn' | 'en';
  /** The words, ready to read and change. */
  body: string;
  /** The owner's live coupon it mentions. */
  offer: { code: string } | null;
}

/** The follow-up waiting on this chat, in the store's words, or null (switched off, or none is due). */
export async function chatFollowUp(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, conversationId: string): Promise<ChatFollowUp | null> {
  await allow(deps, who, 'support.reply');
  const storeId = who.storeId;
  const cfg = await setting(deps, storeId, 'support.followUp');
  if (!cfg.enabled) return null;
  if (!z.uuid().safeParse(conversationId).success) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  await sweepFollowUpsSoon(deps, storeId);
  const now = nowOf(deps);
  const [row, c] = await Promise.all([
    deps.db.supportFollowUp.findFirst({ where: { storeId, conversationId, outcome: null }, orderBy: { createdAt: 'desc' }, select: { id: true, ruleKey: true, scheduledAt: true } }),
    deps.db.conversation.findFirst({ where: { id: conversationId, storeId }, select: chatSelect }),
  ]);
  if (!c) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  // a screen may be ahead of the sweep: what is no longer due is not offered
  if (!row || !followUpOpen(c, cfg, now) || (await personSent(deps.db, storeId, c, cfg.gapDays, now))) return null;
  const rule = row.ruleKey as FollowUpRule;
  const customerId = customerOf(c);
  const [words, draftWords, lastIn, customer, share, offer] = await Promise.all([
    setting(deps, storeId, 'support.followUpWords'),
    setting(deps, storeId, 'support.draftWords'),
    deps.db.message.findFirst({ where: { storeId, conversationId, direction: 'IN' }, orderBy: { sentAt: 'desc' }, select: { body: true } }),
    customerId ? deps.db.customer.findFirst({ where: { id: customerId, storeId }, select: { name: true } }) : null,
    deps.db.supportProductShare.findFirst({ where: { storeId, conversationId, orderId: null }, orderBy: { createdAt: 'desc' }, select: { productId: true } }),
    liveOffer(deps.db, storeId, cfg.offerCode, now),
  ]);
  const lang = followUpLang(lastIn?.body ?? null, cfg.banglishReply);
  const product = share ? await deps.db.product.findFirst({ where: { id: share.productId, storeId }, select: { nameEn: true, nameBn: true } }) : null;
  // the customer's own name only (a profile placeholder is never a name: SIM-F-012)
  const name = customer?.name?.trim() || null;
  const hello = fillDraft((name ? draftWords.hello : draftWords.helloNoName)[lang], { name });
  const body = followUpBody(words, rule, lang, { hello, name, product: product ? (lang === 'bn' ? product.nameBn?.trim() || product.nameEn : product.nameEn) : null, code: offer?.code ?? null });
  return { id: row.id, rule, dueAt: row.scheduledAt, windowEndsAt: c.windowExpiresAt, lang, body, offer: offer ? { code: offer.code } : null };
}

// ------------------------------------------------------------------------------------------------------------ send, skip

export const sendFollowUpInput = z
  .object({
    conversationId: z.uuid(),
    followUpId: z.uuid(),
    body: z.string().max(10_000),
    requestKey: z.string().min(8).max(80),
    version: z.string().max(40),
  })
  .strict();

export const skipFollowUpInput = z.object({ conversationId: z.uuid(), followUpId: z.uuid(), version: z.string().max(40).optional() }).strict();

/** The waiting follow-up, locked for this change; one that was sent, skipped or closed meanwhile is refused. */
async function lockWaiting(tx: Tx, storeId: number, conversationId: string, followUpId: string) {
  const rows = await tx.$queryRaw<{ id: string; outcome: string | null; ruleKey: string | null }[]>`
    SELECT "id", "outcome", "ruleKey" FROM "SupportFollowUp" WHERE "id" = ${followUpId}::uuid AND "storeId" = ${storeId} AND "conversationId" = ${conversationId}::uuid FOR UPDATE`;
  const f = rows[0];
  if (!f) throw new SupportError('NOT_FOUND', 'no such follow-up', ['followUpId']);
  if (f.outcome !== null) throw new SupportError('FOLLOW_UP_GONE', 'this follow-up was already sent, skipped or closed', ['followUpId'], { outcome: f.outcome });
  return f;
}

/** Send the follow-up as the person's own reply (`support.reply`), with the words they may have changed. */
export async function sendFollowUp(deps: SupportDeps, who: Who, input: unknown): Promise<ReplyResult> {
  await allow(deps, who, 'support.reply');
  const d = parse(sendFollowUpInput, input, 'follow-up');
  const storeId = who.storeId;
  const cfg = await setting(deps, storeId, 'support.followUp');
  if (!cfg.enabled) throw new SupportError('FOLLOW_UP_OFF', 'follow-ups are switched off in Support settings', ['support.followUp']);
  // the same press again: the first one's message
  const prior = await deps.db.message.findUnique({ where: { conversationId_requestKey: { conversationId: d.conversationId, requestKey: d.requestKey } }, select: { id: true } });
  if (!prior) {
    const c = await deps.db.conversation.findFirst({ where: { id: d.conversationId, storeId }, select: chatSelect });
    if (!c) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
    if (!followUpOpen(c, cfg, nowOf(deps))) throw new SupportError('FOLLOW_UP_GONE', 'the chat moved or its reply window is closing', ['followUpId']);
  }
  const offer = await liveOffer(deps.db, storeId, cfg.offerCode, nowOf(deps));
  return sendReply(deps, who, { conversationId: d.conversationId, body: d.body, requestKey: d.requestKey, version: d.version }, async (tx, saved) => {
    const f = await lockWaiting(tx, storeId, d.conversationId, d.followUpId);
    const quoted = offer && d.body.toLowerCase().includes(offer.code.toLowerCase()) ? offer : null;
    await tx.supportFollowUp.update({ where: { id: f.id }, data: { outcome: 'SENT', sentAt: saved.now, messageId: saved.messageId, decidedById: who.actor.staffUserId, offerCouponId: quoted?.id ?? null } });
    await tx.conversationEvent.create({
      data: { storeId, conversationId: saved.conversationId, kind: 'FOLLOWUP_SENT', actorType: 'STAFF', actorStaffId: who.actor.staffUserId, actorName: saved.actorName, messageId: saved.messageId, data: { followUpId: f.id, rule: f.ruleKey, offer: !!quoted }, createdAt: saved.now },
    });
  });
}

/** Skip the follow-up (`support.reply`): it does not come back until the chat moves. */
export async function skipFollowUp(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, input: unknown): Promise<{ skipped: true }> {
  await allow(deps, who, 'support.reply');
  const d = parse(skipFollowUpInput, input, 'follow-up');
  const storeId = who.storeId;
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const f = await lockWaiting(tx, storeId, d.conversationId, d.followUpId);
    const name = who.actor.staffUserId ? ((await tx.staffUser.findUnique({ where: { id: who.actor.staffUserId }, select: { displayName: true } }))?.displayName ?? null) : null;
    await tx.supportFollowUp.update({ where: { id: f.id }, data: { outcome: 'SKIPPED', decidedById: who.actor.staffUserId } });
    await tx.conversationEvent.create({ data: { storeId, conversationId: d.conversationId, kind: 'FOLLOWUP_SKIPPED', actorType: 'STAFF', actorStaffId: who.actor.staffUserId, actorName: name, data: { followUpId: f.id, rule: f.ruleKey }, createdAt: now } });
    // the chat's version moves so another screen reads it again
    await tx.conversation.update({ where: { id: d.conversationId }, data: { updatedAt: now } });
  }, TX);
  return { skipped: true };
}
