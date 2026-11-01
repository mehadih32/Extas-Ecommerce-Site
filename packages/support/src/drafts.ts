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
// This is the rule-based answer that keeps working with AI off (B4.15); the grounded model answer from the knowledge
// base comes with AI 360 (S15). Nothing here sends a message, changes an order or touches money.
import type { DraftComplaint, DraftIntent, DraftText } from '@extas/settings';
import { allow, nowOf, setting, SupportError, type SupportDeps, type Who } from './context';
import { bodyIn, classifyMessage, draftTextKey, fillDraft, isBengaliScript } from './drafts-pure';

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
}

export interface DraftOptions {
  /** Find My Size on one product for these measures (null: no chart, or the chart cannot answer). */
  sizeFor?: (productId: string, body: { heightIn: number; weightKg: number }) => Promise<string | null>;
}

/** The draft answer to the customer's latest question, or null (switched off, or nothing waits for an answer). */
export async function supportDraft(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, conversationId: string, opts: DraftOptions = {}): Promise<SupportDraft | null> {
  await allow(deps, who, 'support.reply');
  const storeId = who.storeId;
  const cfg = await setting(deps, storeId, 'support.drafts');
  if (!cfg.enabled) return null;
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
  return { intent: kind.intent, complaint: kind.complaint, text: key, lang, body: filled, handover, order: order ? { id: order.id, number: order.number } : null, size };
}
