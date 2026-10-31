// CN-020 (3) · checkout follow-up (SIM-F-046) — "Call me": a customer who struggles at checkout (refused tries on one
// box, or a long pause; the shop decides when to offer it, `checkout.callMe`) taps once and a call-back lands in the
// Support inbox: a conversation on the store's own "Call-back" channel (kind `callback`, made on first use, never a
// channel that sends anything), from his number, with one line in his language saying where he got stuck, tagged
// `callback`. The same tap twice within the hour is one message; one number leaves at most `perPhonePerDay` a day.
// Off as shipped (CALLBACK_OFF). Nothing is sent to the customer and nothing changes an order.
import { lookup, messages } from '@extas/settings';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, SupportError, type SupportDeps } from './context';
import { receiveMessage } from './inbound';

/** The store's call-back channel (one per store; not in the channel list of Support settings). */
export const CALLBACK_CHANNEL = { kind: 'callback', externalId: 'checkout' } as const;
export const CALLBACK_TAG = 'callback';
export const CALLBACK_FIELDS = ['name', 'phone', 'address', 'other'] as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const callBackInput = z
  .object({
    storeId: z.int().min(1),
    /** The number in full international form (+8801…), already checked by the shop. */
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    name: z.string().trim().max(120).optional(),
    /** Why it was offered: refused tries on a box, or a long pause. */
    reason: z.enum(['tries', 'idle']),
    field: z.enum(CALLBACK_FIELDS).optional(),
    /** The visitor (the bag cookie): the same tap twice is one call-back. */
    visitorId: z.string().min(8).max(100),
    lang: z.enum(['en', 'bn']),
  })
  .strict();
export type CallBackInput = z.input<typeof callBackInput>;

export interface CallBackResult {
  conversationId: string;
  /** The same tap came in before (within the hour): nothing new was written. */
  duplicate: boolean;
}

/** The line staff read in the inbox, in the customer's language. */
export function callBackText(lang: 'en' | 'bn', reason: 'tries' | 'idle', field: (typeof CALLBACK_FIELDS)[number] = 'other'): string {
  const m = messages[lang];
  const text = lookup(m, `checkout.callMe.text.${reason}`) ?? '';
  return text.replace(/\{field\}/g, lookup(m, `checkout.callMe.text.fields.${field}`) ?? field);
}

/** One "Call me" tap from the checkout. */
export async function requestCallBack(deps: SupportDeps, input: CallBackInput): Promise<CallBackResult> {
  const d = parse(callBackInput, input, 'call-back');
  checkStoreId(d.storeId);
  const cfg = await setting(deps, d.storeId, 'checkout.callMe');
  if (!cfg.enabled) throw new SupportError('CALLBACK_OFF', 'call-backs from the checkout are switched off');
  const now = nowOf(deps);
  const channel = await deps.db.supportChannel.upsert({
    where: { storeId_kind_externalId: { storeId: d.storeId, ...CALLBACK_CHANNEL } },
    create: { storeId: d.storeId, ...CALLBACK_CHANNEL, name: lookup(messages.en, 'checkout.callMe.channel') ?? CALLBACK_CHANNEL.kind, enabled: false },
    update: {},
  });
  if (channel.archivedAt) throw new SupportError('CALLBACK_OFF', 'the call-back channel is put away');
  const externalId = `callme:${d.visitorId}:${Math.floor(now.getTime() / HOUR)}`;
  const contact = await deps.db.supportContact.findUnique({ where: { storeId_channelKind_externalId: { storeId: d.storeId, channelKind: CALLBACK_CHANNEL.kind, externalId: d.phone } }, select: { id: true } });
  if (contact) {
    const same = await deps.db.message.findFirst({ where: { storeId: d.storeId, externalMessageId: externalId, conversation: { contactId: contact.id } }, select: { conversationId: true } });
    if (same) return { conversationId: same.conversationId, duplicate: true };
    const today = await deps.db.message.count({ where: { storeId: d.storeId, direction: 'IN', createdAt: { gte: new Date(now.getTime() - DAY) }, conversation: { contactId: contact.id, channelId: channel.id } } });
    if (today >= cfg.perPhonePerDay) throw new SupportError('TOO_MANY', 'this number asked for a call already today', [], { perDay: cfg.perPhonePerDay });
  }
  const r = await receiveMessage(deps, {
    storeId: d.storeId,
    channel: CALLBACK_CHANNEL,
    contact: { externalId: d.phone, phone: d.phone, ...(d.name ? { name: d.name } : {}) },
    message: { externalId, text: callBackText(d.lang, d.reason, d.field), sentAt: now },
  });
  const conv = await deps.db.conversation.findUniqueOrThrow({ where: { id: r.conversationId }, select: { tags: true } });
  if (!conv.tags.includes(CALLBACK_TAG)) await deps.db.conversation.update({ where: { id: r.conversationId }, data: { tags: [...conv.tags, CALLBACK_TAG] } });
  return { conversationId: r.conversationId, duplicate: r.duplicate };
}
