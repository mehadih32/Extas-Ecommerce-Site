// PR 75 follow-up (go-live gate customer 360°, 1 Nov) — the contact page's "Send us a message" form (demo 71-pages.js
// pg_contact, Blueprint D3.17). A message sent from it lands in the Support inbox: a conversation on the store's own
// "Contact form" channel (kind `contactform`, made on first use, never a channel that sends anything and never listed
// with the sending channels), from his number, tagged `contact-form`. When he names an order and it is his (the same
// number), the conversation is linked to it; another person's order number stays only as words in his message. The same
// send twice (a double tap, a retry) is one message; one number sends at most `perPhonePerDay` a day; a message is at most
// `maxChars` long. Off as shipped (CONTACT_FORM_OFF). Nothing is sent to the customer and nothing changes an order.
import { lookup, messages } from '@extas/settings';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, SupportError, type SupportDeps } from './context';
import { receiveMessage } from './inbound';

/** The store's contact-form channel (one per store; not in the channel list of Support settings). */
export const CONTACT_FORM_CHANNEL = { kind: 'contactform', externalId: 'site' } as const;
export const CONTACT_FORM_TAG = 'contact-form';
/** The longest message the form can ever take (the setting picks a lower limit). */
export const CONTACT_FORM_MAX_CHARS = 2000;

const DAY = 24 * 3_600_000;

export const contactFormInput = z
  .object({
    storeId: z.int().min(1),
    /** The number in full international form (+8801…), already checked by the shop. */
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    name: z.string().trim().max(120).optional(),
    /** The order number he typed, if any (EX-1043). */
    orderNumber: z.string().trim().max(40).optional(),
    text: z.string().trim().min(1).max(CONTACT_FORM_MAX_CHARS),
    /** One id per filled-in form, made by the page: the same send twice is one message. */
    requestKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
    lang: z.enum(['en', 'bn']),
  })
  .strict();
export type ContactFormInput = z.input<typeof contactFormInput>;

export interface ContactFormResult {
  conversationId: string;
  /** The same send came in before: nothing new was written. */
  duplicate: boolean;
  /** The order he named is his and the conversation is linked to it. */
  orderLinked: boolean;
}

/** The message staff read: the order line (in his language) above his words. */
export function contactFormText(lang: 'en' | 'bn', text: string, orderNumber?: string): string {
  if (!orderNumber) return text;
  const line = (lookup(messages[lang], 'pages.contactForm.orderLine') ?? '{number}').replace(/\{number\}/g, orderNumber);
  return `${line}\n${text}`;
}

/** One message from the contact page's form. */
export async function sendContactForm(deps: SupportDeps, input: ContactFormInput): Promise<ContactFormResult> {
  const d = parse(contactFormInput, input, 'contact form');
  checkStoreId(d.storeId);
  const cfg = await setting(deps, d.storeId, 'pages.contactForm');
  if (!cfg.enabled) throw new SupportError('CONTACT_FORM_OFF', 'the contact form is switched off');
  if (d.text.length > cfg.maxChars) throw new SupportError('TOO_LONG', 'the message is longer than the shop takes', ['text'], { maxChars: cfg.maxChars });
  const now = nowOf(deps);
  const channel = await deps.db.supportChannel.upsert({
    where: { storeId_kind_externalId: { storeId: d.storeId, ...CONTACT_FORM_CHANNEL } },
    create: { storeId: d.storeId, ...CONTACT_FORM_CHANNEL, name: lookup(messages.en, 'pages.contactForm.channel') ?? CONTACT_FORM_CHANNEL.kind, enabled: false },
    update: {},
  });
  if (channel.archivedAt) throw new SupportError('CONTACT_FORM_OFF', 'the contact-form channel is put away');
  const externalId = `contact:${d.requestKey}`;
  const contact = await deps.db.supportContact.findUnique({ where: { storeId_channelKind_externalId: { storeId: d.storeId, channelKind: CONTACT_FORM_CHANNEL.kind, externalId: d.phone } }, select: { id: true } });
  if (contact) {
    const same = await deps.db.message.findFirst({ where: { storeId: d.storeId, externalMessageId: externalId, conversation: { contactId: contact.id } }, select: { conversationId: true, conversation: { select: { orderId: true } } } });
    if (same) return { conversationId: same.conversationId, duplicate: true, orderLinked: same.conversation.orderId !== null };
    const today = await deps.db.message.count({ where: { storeId: d.storeId, direction: 'IN', sentAt: { gte: new Date(now.getTime() - DAY) }, conversation: { contactId: contact.id, channelId: channel.id } } });
    if (today >= cfg.perPhonePerDay) throw new SupportError('TOO_MANY', 'this number sent its messages for today', [], { perDay: cfg.perPhonePerDay });
  }
  // (counted by when each message was sent, the clock this function is given)
  // his own order only: the number he typed and the number the order was placed with must be the same
  const order = d.orderNumber ? await deps.db.order.findFirst({ where: { storeId: d.storeId, number: d.orderNumber, phone: d.phone }, select: { id: true } }) : null;
  const r = await receiveMessage(deps, {
    storeId: d.storeId,
    channel: CONTACT_FORM_CHANNEL,
    contact: { externalId: d.phone, phone: d.phone, ...(d.name ? { name: d.name } : {}) },
    message: { externalId, text: contactFormText(d.lang, d.text, d.orderNumber), sentAt: now },
  });
  const conv = await deps.db.conversation.findUniqueOrThrow({ where: { id: r.conversationId }, select: { tags: true, orderId: true } });
  const tags = conv.tags.includes(CONTACT_FORM_TAG) ? null : [...conv.tags, CONTACT_FORM_TAG];
  const link = order && conv.orderId !== order.id ? order.id : null;
  if (tags || link) await deps.db.conversation.update({ where: { id: r.conversationId }, data: { ...(tags ? { tags } : {}), ...(link ? { orderId: link } : {}) } });
  return { conversationId: r.conversationId, duplicate: r.duplicate, orderLinked: order !== null };
}
