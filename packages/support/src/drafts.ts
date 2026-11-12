// S22 · PR 432 (Blueprint B4.7, B4.14 item 8; SIM-F-012) — EXTAS AI's draft answer in a chat. With `support.drafts`
// on, the customer's messages since the shop's last answer are read (drafts-pure.ts decides what they are about), the
// chat's order is found (the chat's own order, else the customer's latest) with its parcel and whether the courier
// check called it late (the `shipment.late` line on its timeline, PR 148 / SIM-F-018), a size question is answered by
// the shop's own Find My Size on the product last sent in the chat (the caller passes `sizeFor`; no chart, no size
// invented), and the store's own words (`support.draftWords`; the questions told apart by `support.draftKeywords`) are filled in — in Bengali when the customer wrote
// Bengali letters, else in the `banglishReply` language. The answer is never sent here: a person presses "Use draft"
// and sends it as their own reply, so "who replied" stays the person. Some questions are marked for a person
// (`handover`); a bulk order is for the owner.
//
// This is the rule-based answer that keeps working with AI off (B4.15).
//
// S15 · PR 325 — the grounded model answer promised above: `opts.aiReply`, called only once the rule-based draft
// below is fully decided, with the same facts this file already computed as its only ground truth — the model may
// rephrase `filled` more naturally, never add, drop or invent a fact. The caller (AI 360's own job dispatcher) is
// the one place that decides whether AI 360's agent switch, schedule, spend cap and data-class routing allow a real
// call right now, and masks the customer's own words first (A5.1-A5.4); this file knows none of that and never
// calls an AI provider itself. Any failure, timeout or absence of `opts.aiReply` leaves `filled` exactly as it was
// — AI is additive here exactly as everywhere else (C1.4).
export interface SupportReplyFacts {
  intent: DraftIntent;
  complaint: DraftComplaint | null;
  /** The customer's own latest words — the caller masks e-mail/phone out of this before any AI sees it. */
  question: string;
  lang: 'en' | 'bn';
  /** The store's own rule-based answer, already correct and complete — the model's floor and its only source of
   * fact; this is what ships unchanged whenever AI is off, not ready, or fails. */
  ruleBasedBody: string;
  order: { number: string; status: string; late: boolean } | null;
  size: string | null;
  customerName: string | null;
}
// Nothing here sends a message, changes an order or touches money.
import type { DraftComplaint, DraftIntent, DraftText } from '@extas/settings';
import { allow, nowOf, setting, SupportError, type SupportDeps, type Who } from './context';
import { bodyIn, classifyMessage, draftTextKey, fillDraft, isBengaliScript } from './drafts-pure';
import { ownChat } from './privacy';

/** The order timeline line the courier check writes for a parcel past its promise (@extas/shipping LATE_EVENT). */
const LATE_LINE = 'shipment.late';
/** How many of the latest messages are read for the customer's question. */
const READ_BACK = 12;
const DAY = 86_400_000;

export interface SupportDraft {
  intent: DraftIntent;
  complaint: DraftComplaint | null;
  /** Which of the store's texts answered. */
  text: DraftText;
  lang: 'en' | 'bn';
  /** The draft, ready for the reply box. */
  body: string;
  /** Marked for a person (`handover`); `owner` for a bulk order. */
  handover: false | 'person' | 'owner';
  order: { id: string; number: string } | null;
  /** Find My Size's answer, when the question was a size and the chat's product has a chart. */
  size: string | null;
  /** True only once `opts.aiReply` actually replaced the rule-based words below with its own (PR 325) — false for
   * the rule-based text itself, whether AI never ran or it ran and the caller's own policy left it off. */
  aiUsed: boolean;
}

export interface DraftOptions {
  /** Find My Size on one product for these measures (null: no chart, or the chart cannot answer). */
  sizeFor?: (productId: string, body: { heightIn: number; weightKg: number }) => Promise<string | null>;
  /** S15 · PR 325 — EXTAS AI's own rephrasing of the rule-based draft, grounded only in `SupportReplyFacts`; `null`
   * or a thrown error both leave the rule-based `filled` text exactly as it was. Omitted entirely while the caller
   * has no AI 360 wiring to offer (e.g. a test that does not pass one). */
  aiReply?: (facts: SupportReplyFacts) => Promise<string | null>;
}

/** The draft answer to the customer's latest question, or null (switched off, or nothing waits for an answer). */
export async function supportDraft(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, conversationId: string, opts: DraftOptions = {}): Promise<SupportDraft | null> {
  const held = await allow(deps, who, 'support.reply');
  const storeId = who.storeId;
  const cfg = await setting(deps, storeId, 'support.drafts');
  if (!cfg.enabled) return null;
  await ownChat(deps, who, held, conversationId);
  const c = await deps.db.conversation.findFirst({
    where: { id: conversationId, storeId },
    select: { id: true, orderId: true, customerId: true, contact: { select: { displayName: true, customerId: true } } },
  });
  if (!c) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  const latest = await deps.db.message.findMany({
    where: { conversationId: c.id, storeId, isInternalNote: false },
    orderBy: { sentAt: 'desc' },
    take: READ_BACK,
    select: { direction: true, body: true },
  });
  const asked: string[] = [];
  for (const m of latest) {
    if (m.direction !== 'IN') break;
    if (m.body?.trim()) asked.unshift(m.body.trim());
  }
  if (!asked.length) return null;
  const question = asked.join('\n');
  const [texts, words] = await Promise.all([setting(deps, storeId, 'support.draftWords'), setting(deps, storeId, 'support.draftKeywords')]);
  const kind = classifyMessage(question, words, cfg.bulkPieces);

  // the chat's order, else the customer's latest
  const customerId = c.customerId ?? c.contact.customerId;
  const orderSelect = { id: true, number: true, status: true, placedAt: true } as const;
  const order =
    (c.orderId ? await deps.db.order.findFirst({ where: { id: c.orderId, storeId }, select: orderSelect }) : null) ??
    (customerId ? await deps.db.order.findFirst({ where: { storeId, customerId, status: { not: 'DRAFT' } }, orderBy: { placedAt: 'desc' }, select: orderSelect }) : null);
  const [parcel, lateLine, customer] = await Promise.all([
    order ? deps.db.shipment.findFirst({ where: { storeId, orderId: order.id }, orderBy: { createdAt: 'desc' }, select: { trackingCode: true, courierAccount: { select: { name: true } } } }) : null,
    order ? deps.db.orderEvent.findFirst({ where: { storeId, orderId: order.id, type: LATE_LINE }, select: { id: true } }) : null,
    customerId ? deps.db.customer.findFirst({ where: { id: customerId, storeId }, select: { name: true } }) : null,
  ]);

  // a size question: Find My Size on the product last sent in this chat
  let size: string | null = null;
  const body = kind.intent === 'size' ? bodyIn(question) : null;
  if (body && opts.sizeFor) {
    const shared = await deps.db.supportProductShare.findFirst({ where: { storeId, conversationId: c.id }, orderBy: { createdAt: 'desc' }, select: { productId: true } });
    if (shared) size = await opts.sizeFor(shared.productId, body);
  }

  const key = draftTextKey(kind, { order: order ? { status: order.status, parcel: !!parcel } : null, late: !!lateLine, size });
  const lang: 'en' | 'bn' = isBengaliScript(question) ? 'bn' : cfg.banglishReply;
  // the customer's own name only (a profile placeholder is never a name: SIM-F-012 "Hi New,")
  const name = customer?.name?.trim() || null;
  const hello = fillDraft((name ? texts.hello : texts.helloNoName)[lang], { name });
  const days = order ? String(Math.max(0, Math.floor((nowOf(deps).getTime() - order.placedAt.getTime()) / DAY))) : null;
  const filled = fillDraft(texts[key][lang], { hello, name, number: order?.number, courier: parcel?.courierAccount.name, tracking: parcel?.trackingCode, size, days });
  const handover = cfg.handover.includes(kind.intent) ? (kind.intent === 'bulk' ? 'owner' : 'person') : false;

  // S15 · PR 325 — EXTAS AI's own rephrasing, grounded only in the facts just decided above. Never thrown out of
  // this function: the rule-based `filled` text is always a complete, correct answer on its own.
  let replyBody = filled;
  let aiUsed = false;
  if (opts.aiReply) {
    try {
      const rephrased = await opts.aiReply({
        intent: kind.intent,
        complaint: kind.complaint,
        question,
        lang,
        ruleBasedBody: filled,
        order: order ? { number: order.number, status: order.status, late: !!lateLine } : null,
        size,
        customerName: name,
      });
      if (rephrased?.trim()) {
        replyBody = rephrased.trim();
        aiUsed = true;
      }
    } catch {
      // AI is additive (C1.4): any failure keeps the rule-based text exactly as it was.
    }
  }

  return { intent: kind.intent, complaint: kind.complaint, text: key, lang, body: replyBody, handover, order: order ? { id: order.id, number: order.number } : null, size, aiUsed };
}
