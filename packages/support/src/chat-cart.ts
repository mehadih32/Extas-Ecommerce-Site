// PR 430 — orders from the chat: the mini-cart beside a conversation and one-press order creation with the channel kept
// (Blueprint B4.6 bullets 3–5 and 7, B4.14 item 6; SIM-F-024). The employee drops products into the chat's own bag (from
// the catalogue drawer); the bag is an ordinary shop bag (@extas/cart, its visitor `support-<conversation id>`), so the
// shop's combo prices, sets and offers apply exactly as on the site. "Check" prices it with the checkout's own quote for
// the name, phone and address (filled from the customer, or what was typed); "Create order" places it with the
// checkout's own placeOrder — the same stock hold, delivery read, risk look and order number — with the chat's channel
// as the order's source (WhatsApp / Messenger / Live chat, never "website") and the employee on its placed event.
//
// The fraud gate is the owner's own Parameter for Checkout (PR 558/560), never the employee's mood: when it asks this
// checkout for an advance, Cash on Delivery is not offered, the button becomes "Take advance", the order waits for that
// advance (the order service's AWAITING_ADVANCE) and its pay link (`/pay/<token>`, PR 542) goes into the chat with the
// owner's words (`support.cart.payLinkWords`). Green: a Cash on Delivery order. COD closed for another reason: no order.
//
// Off as it ships (`support.cart`). Everything needs `support.order` (sending the pay link also `support.reply`). Nothing
// here changes a price, a discount, a charge, COD or a risk rule, or moves money: the money is what the checkout prices,
// the advance is what the owner's layer asks, and the customer pays it himself from the link.
import { createHash } from 'node:crypto';
import { addItem, CartError, findBag, openBag, removeLine, setQuantity, type BagView } from '@extas/cart';
import { checkForm, checkoutQuote, CheckoutError, fieldOrder, phoneNormalizeBD, placeOrder, type AdvanceView, type ChatOrderSource, type CheckoutDeps, type CheckoutQuote, type DeliveryCharge, type Totals } from '@extas/checkout';
import { z } from 'zod';
import { sendReply, type ReplyResult } from './actions';
import { moneyText } from './catalogue';
import type { ChannelKind } from './channels';
import { allow, nowOf, parse, setting, SupportError, TX, type SupportDeps, type Who } from './context';

/** What orders from the chat need besides the support core: the checkout's engines and the shop's after-order checks. */
export interface ChatOrderDeps extends SupportDeps {
  checkout: CheckoutDeps;
  /**
   * The checks the shop runs the moment an order lands (the app's own list: identity, duplicates, risk score, blocklist,
   * the advance wait …), exactly as after a website order. Never fails the order.
   */
  afterPlace?: (storeId: number, orderId: string) => Promise<void>;
}

/** The bag a chat's orders are made from (one per conversation; a new one after each order). */
export const chatVisitorId = (conversationId: string): string => `support-${conversationId}`;

/** The order source of each channel (a channel the order list has no name for is an order made in the admin). */
export const CHAT_SOURCE_OF: Record<ChannelKind, ChatOrderSource> = { whatsapp: 'WHATSAPP', messenger: 'MESSENGER', livechat: 'LIVE_CHAT', instagram: 'ADMIN', email: 'ADMIN' };
export const chatSourceOf = (kind: string): ChatOrderSource => CHAT_SOURCE_OF[kind as ChannelKind] ?? 'ADMIN';

const TEXT_MAX = 2_000; // hardcode-ok: the checkout's own field limit (place.ts TEXT_MAX), not a business number

type Named = { nameEn: string; nameBn: string | null };

/** One line of the chat's bag as the card shows it. */
export interface ChatBagLine {
  lineId: string;
  kind: 'item' | 'set';
  name: Named;
  colour: (Named & { hex: string }) | null;
  size: string | null;
  quantity: number;
  /** What the line costs in this bag (a set's own price). */
  amountMinor: number;
  /** A set: what it saves against its pieces' own prices. */
  savingMinor: number;
  /** An item: the most it can hold now (stock and the per-line limit); a set: 1. */
  maxQuantity: number;
  /** A set's pieces. */
  pieces: { name: Named; colour: string | null; size: string | null }[];
  /** Sold out since it went in, or no longer on sale: it cannot be ordered now. */
  blocked: boolean;
}

/** The chat's bag. */
export interface ChatBag {
  conversationId: string;
  lines: ChatBagLine[];
  count: number;
  subtotalMinor: number;
  offers: { label: { en: string | null; bn: string | null }; amountMinor: number }[];
  /** What the items cost after the offers (delivery comes with the address). */
  itemsMinor: number;
  /** The name, phone and address to start from: the chat's customer, his latest order, the chat's own number. */
  prefill: { name: string; phone: string; address: string };
  /** The order this chat last made (or was linked to). */
  order: { id: string; number: string } | null;
}

/** What "Create order" does for this checkout (the rule decides, never the employee). */
export type ChatGate = 'cod' | 'advance' | 'closed';

/** The checkout priced for the details typed. */
export interface ChatQuote {
  bag: ChatBag;
  totals: Totals;
  charge: DeliveryCharge;
  /** resolved: the band is settled; ask: the address names no place the shop knows (the order is flagged and called). */
  address: 'none' | 'resolved' | 'ask';
  /** The name / phone / address problem that stops an order, if any. */
  problem: { field: string; problem: string } | null;
  gate: ChatGate;
  /** The owner's layer asks this much ahead (gate `advance`). */
  advance: AdvanceView | null;
  /** Why Cash on Delivery is closed (gate `closed`). */
  codOff: string | null;
  /** The money's fingerprint: "Create order" refuses with PRICE_CHANGED when anything moved since. */
  fingerprint: string;
}

const formSchema = z.object({ name: z.string().max(TEXT_MAX), phone: z.string().max(TEXT_MAX), address: z.string().max(TEXT_MAX) }).strict();

export const chatBagInput = z.discriminatedUnion('action', [
  z.object({ conversationId: z.uuid(), action: z.literal('add'), variantId: z.uuid(), quantity: z.int().min(1).max(100).default(1), lang: z.enum(['en', 'bn']).default('en') }).strict(),
  z.object({ conversationId: z.uuid(), action: z.literal('quantity'), lineId: z.uuid(), quantity: z.int().min(1).max(100), lang: z.enum(['en', 'bn']).default('en') }).strict(),
  z.object({ conversationId: z.uuid(), action: z.literal('remove'), lineId: z.uuid(), lang: z.enum(['en', 'bn']).default('en') }).strict(),
]);

export const chatQuoteInput = z.object({ conversationId: z.uuid(), lang: z.enum(['en', 'bn']).default('en'), form: formSchema }).strict();

export const chatOrderInput = chatQuoteInput
  .extend({
    /** The fingerprint the card showed (ChatQuote.fingerprint). */
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    /** Made once by the card and sent with every retry: one press, one order. */
    requestKey: z.uuid(),
  })
  .strict();

async function cartOn(deps: Pick<SupportDeps, 'settings'>, storeId: number) {
  const s = await setting(deps, storeId, 'support.cart');
  if (!s.enabled) throw new SupportError('CART_OFF', 'orders from the chat are switched off in Support settings', ['support.cart']);
  return s;
}

async function chatOf(deps: Pick<SupportDeps, 'db'>, who: Who, conversationId: string) {
  if (!z.uuid().safeParse(conversationId).success) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  const c = await deps.db.conversation.findFirst({
    where: { id: conversationId, storeId: who.storeId },
    select: { id: true, customerId: true, orderId: true, channel: { select: { kind: true } }, contact: { select: { displayName: true, phone: true } } },
  });
  if (!c) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  return c;
}

/** The bag's lines as the card shows them. */
function linesOf(bag: BagView): ChatBagLine[] {
  const blocked = new Set(bag.blocked.map((b) => b.lineId));
  const items: ChatBagLine[] = bag.items.map((i) => ({
    lineId: i.lineId,
    kind: 'item',
    name: { nameEn: i.nameEn, nameBn: i.nameBn },
    colour: i.colour ? { nameEn: i.colour.nameEn, nameBn: i.colour.nameBn, hex: i.colour.hex } : null,
    size: i.size?.label ?? null,
    quantity: i.quantity,
    amountMinor: i.lineMinor,
    savingMinor: 0,
    maxQuantity: i.maxQuantity,
    pieces: [],
    blocked: blocked.has(i.lineId) || i.unavailable,
  }));
  const sets: ChatBagLine[] = bag.sets.map((s) => ({
    lineId: s.lineId,
    kind: 'set',
    name: { nameEn: s.nameEn, nameBn: s.nameBn },
    colour: null,
    size: null,
    quantity: 1,
    amountMinor: s.payMinor,
    savingMinor: s.savingMinor,
    maxQuantity: 1,
    pieces: s.pieces.map((p) => ({ name: { nameEn: p.nameEn, nameBn: p.nameBn }, colour: p.colour?.nameEn ?? null, size: p.size })),
    blocked: s.pieces.some((p) => blocked.has(p.lineId)),
  }));
  return [...items, ...sets];
}

/** Where the details start from: the chat's customer (his name, number and latest address), else the chat's own. */
async function prefillOf(deps: Pick<SupportDeps, 'db'>, storeId: number, c: Awaited<ReturnType<typeof chatOf>>): Promise<ChatBag['prefill']> {
  const customer = c.customerId ? await deps.db.customer.findFirst({ where: { id: c.customerId, storeId }, select: { name: true, phone: true } }) : null;
  const last = c.customerId ? await deps.db.order.findFirst({ where: { storeId, customerId: c.customerId }, orderBy: { placedAt: 'desc' }, select: { customerName: true, phone: true, shippingAddressText: true } }) : null;
  const phone = customer?.phone ?? last?.phone ?? c.contact.phone ?? '';
  const local = phone ? phoneNormalizeBD(phone) : null;
  return {
    name: customer?.name ?? last?.customerName ?? c.contact.displayName ?? '',
    // the number as people type it here (01…), the shop's own reading
    phone: local?.ok ? local.digits : phone,
    address: last?.shippingAddressText ?? '',
  };
}

async function quoteOf(deps: ChatOrderDeps, storeId: number, cartId: string | null, lang: 'en' | 'bn', form: z.output<typeof formSchema> | null, payment: { method: 'cod' } | null) {
  const p = form ? phoneNormalizeBD(form.phone) : null;
  return checkoutQuote(deps.checkout, {
    storeId,
    cartId,
    lang,
    customerId: null,
    address: form ? { line: form.address, confirmed: null, ...(p?.ok ? { phone: p.e164 } : {}) } : null,
    payment,
    useWallet: false,
    ip: null,
    gift: false,
    details: form ? { name: form.name, phone: p?.ok ? p.e164 : form.phone } : null,
  });
}

function bagOf(c: Awaited<ReturnType<typeof chatOf>>, q: CheckoutQuote, prefill: ChatBag['prefill'], order: ChatBag['order']): ChatBag {
  const s = q.bag.summary;
  return { conversationId: c.id, lines: linesOf(q.bag), count: s.count, subtotalMinor: s.subtotalMinor, offers: s.offers.map((o) => ({ label: o.label, amountMinor: o.amountMinor })), itemsMinor: s.totalMinor, prefill, order };
}

async function orderOf(deps: Pick<SupportDeps, 'db'>, storeId: number, orderId: string | null) {
  return orderId ? deps.db.order.findFirst({ where: { id: orderId, storeId }, select: { id: true, number: true } }) : null;
}

/** The chat's bag (`support.order`; off while `support.cart` is off). */
export async function chatBag(deps: ChatOrderDeps, who: Who, conversationId: string, lang: 'en' | 'bn' = 'en'): Promise<ChatBag> {
  await allow(deps, who, 'support.order');
  await cartOn(deps, who.storeId);
  const c = await chatOf(deps, who, conversationId);
  const cartId = await findBag(deps.checkout, { storeId: who.storeId, visitorId: chatVisitorId(c.id) });
  const [q, prefill, order] = await Promise.all([quoteOf(deps, who.storeId, cartId, lang, null, null), prefillOf(deps, who.storeId, c), orderOf(deps, who.storeId, c.orderId)]);
  return bagOf(c, q, prefill, order);
}

/** Adds a piece, sets a line's quantity or takes a line out of the chat's bag (`support.order`). */
export async function changeChatBag(deps: ChatOrderDeps, who: Who, input: unknown): Promise<ChatBag> {
  await allow(deps, who, 'support.order');
  await cartOn(deps, who.storeId);
  const d = parse(chatBagInput, input, 'chat bag');
  const c = await chatOf(deps, who, d.conversationId);
  const storeId = who.storeId;
  try {
    const { cartId } = await openBag(deps.checkout, { storeId, visitorId: chatVisitorId(c.id) });
    if (d.action === 'add') await addItem(deps.checkout, { storeId, cartId, variantId: d.variantId, quantity: d.quantity, source: 'support' });
    else if (d.action === 'quantity') await setQuantity(deps.checkout, { storeId, cartId, lineId: d.lineId, quantity: d.quantity });
    else await removeLine(deps.checkout, { storeId, cartId, lineId: d.lineId });
  } catch (e) {
    if (e instanceof CartError) throw new SupportError(e.code === 'OUT_OF_STOCK' || e.code === 'TOO_MANY' ? 'OUT_OF_STOCK' : e.code === 'NOT_FOUND' || e.code === 'NOT_FOR_SALE' ? 'NOT_FOUND' : 'INVALID_INPUT', e.message, e.details);
    throw e;
  }
  return chatBag(deps, who, c.id, d.lang);
}

/** The gate for a priced checkout: Cash on Delivery, the owner's advance, or no order (COD closed otherwise). */
export function gateOf(q: Pick<CheckoutQuote, 'pay' | 'advance'>): ChatGate {
  if (q.advance && q.pay.chosen && q.pay.chosen.method !== 'cod') return 'advance';
  return q.pay.cod ? 'cod' : 'closed';
}

/** Prices the chat's bag for the details typed, with the gate (`support.order`). */
export async function quoteChatOrder(deps: ChatOrderDeps, who: Who, input: unknown): Promise<ChatQuote> {
  await allow(deps, who, 'support.order');
  await cartOn(deps, who.storeId);
  const d = parse(chatQuoteInput, input, 'chat order');
  const c = await chatOf(deps, who, d.conversationId);
  return priced(deps, who.storeId, c, d.lang, d.form);
}

async function priced(deps: ChatOrderDeps, storeId: number, c: Awaited<ReturnType<typeof chatOf>>, lang: 'en' | 'bn', form: z.output<typeof formSchema>): Promise<ChatQuote & { payment: { method: string; option: string | null } | null }> {
  const cartId = await findBag(deps.checkout, { storeId, visitorId: chatVisitorId(c.id) });
  // Cash on Delivery first; the owner's layer may take it away (then the quote has picked a prepaid method itself)
  const q = await quoteOf(deps, storeId, cartId, lang, form, { method: 'cod' });
  const [prefill, order, nameMin, addressMin, fields] = await Promise.all([
    prefillOf(deps, storeId, c),
    orderOf(deps, storeId, c.orderId),
    deps.settings.value('checkout.form.nameMin', { storeId }),
    deps.settings.value('checkout.form.addressMin', { storeId }),
    deps.settings.value('checkout.fieldOrder', { storeId }),
  ]);
  const check = checkForm(form, { nameMin, addressMin }, fieldOrder(fields));
  const gate = gateOf(q);
  return {
    bag: bagOf(c, q, prefill, order),
    totals: q.totals,
    charge: q.charge,
    address: q.address.status,
    problem: check.ok ? null : { field: check.field, problem: check.problem },
    gate,
    advance: gate === 'advance' ? q.advance : null,
    codOff: q.pay.cod ? null : q.pay.codOff,
    fingerprint: q.fingerprint,
    payment: gate === 'cod' ? { method: 'cod', option: null } : gate === 'advance' && q.pay.chosen ? { method: q.pay.chosen.method, option: q.pay.chosen.option } : null,
  };
}

export interface ChatOrderResult {
  orderId: string;
  number: string;
  /** The same press arrived again: the first one's order. */
  replay: boolean;
  gate: ChatGate;
  advance: AdvanceView | null;
  /** The pay link sent into the chat (gate `advance`). */
  payLink: { messageId: string; delivery: ReplyResult['delivery'] } | null;
}

/** A key of its own for the pay link's message, made from the order's key (one press, one message). */
const payKeyOf = (requestKey: string) => `pay-${createHash('sha256').update(requestKey).digest('hex').slice(0, 40)}`;

/**
 * "Create order" / "Take advance" (`support.order`): places the chat's bag as an order with the chat's channel as its
 * source, runs the shop's after-order checks, links the order to the conversation with a log line, and — when the
 * owner's layer asked an advance — sends its pay link into the chat (`payLink(token, lang)` is the shop's full address
 * of `/pay/<token>`, read by the app). Refused with the checkout's own codes (FORM, PRICE_CHANGED, OUT_OF_STOCK, EMPTY
 * …) or NO_COD when Cash on Delivery is closed for this checkout and no advance is asked.
 */
export async function createChatOrder(deps: ChatOrderDeps, who: Who, input: unknown, link: { payLink: (token: string, lang: 'en' | 'bn') => string }): Promise<ChatOrderResult> {
  await allow(deps, who, 'support.order');
  const cfg = await cartOn(deps, who.storeId);
  const d = parse(chatOrderInput, input, 'chat order');
  const storeId = who.storeId;
  const c = await chatOf(deps, who, d.conversationId);
  const visitorId = chatVisitorId(c.id);

  // a second press: the order this key placed (the bag is closed by now, so the gate is read from the order)
  const prior = await deps.db.order.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: d.requestKey } }, select: { id: true, visitorId: true } });
  let gate: ChatGate;
  let advance: AdvanceView | null = null;
  let payment: { method: string; option: string | null } | null = null;
  if (prior) {
    if (prior.visitorId !== visitorId) throw new SupportError('IDEMPOTENCY_MISMATCH', 'this key placed another order', ['requestKey']);
    const pay = await deps.db.payment.findFirst({ where: { storeId, orderId: prior.id, linkToken: { not: null } }, select: { id: true } });
    gate = pay ? 'advance' : 'cod';
  } else {
    // the gate is read again here, never taken from the page
    const q = await priced(deps, storeId, c, d.lang, d.form);
    if (q.gate === 'closed') throw new SupportError('NO_COD', 'Cash on Delivery is closed for this order and no advance is asked', ['payment'], { codOff: q.codOff });
    gate = q.gate;
    advance = q.advance;
    payment = q.payment;
  }

  let placed;
  try {
    placed = await placeOrder(deps.checkout, {
      storeId,
      visitorId,
      customerId: null,
      chat: { source: chatSourceOf(c.channel.kind), conversationId: c.id, channelKind: c.channel.kind, staffUserId: who.actor.staffUserId },
      input: { idempotencyKey: d.requestKey, lang: d.lang, form: d.form, confirmed: null, payment, fingerprint: d.fingerprint },
    });
  } catch (e) {
    if (e instanceof CheckoutError) throw new SupportError('CHECKOUT', e.message, e.details, { code: e.code, ...(e.code === 'FORM' && e.data ? { field: e.data.field, problem: e.data.problem } : {}) });
    throw e;
  }
  if (!placed.replay) await deps.afterPlace?.(storeId, placed.orderId);

  // the chat names its order, once, with a line in its log
  const o = await deps.db.order.findUniqueOrThrow({ where: { id: placed.orderId }, select: { id: true, number: true, source: true, totalMinor: true, advanceRequiredMinor: true } });
  await deps.db.$transaction(async (tx) => {
    const done = await tx.conversationEvent.findFirst({ where: { storeId, conversationId: c.id, kind: 'ORDER_CREATED', data: { path: ['orderId'], equals: o.id } }, select: { id: true } });
    if (done) return;
    const name = who.actor.staffUserId ? ((await tx.staffUser.findUnique({ where: { id: who.actor.staffUserId }, select: { displayName: true } }))?.displayName ?? null) : null;
    await tx.conversation.update({ where: { id: c.id }, data: { orderId: o.id } });
    await tx.conversationEvent.create({
      data: { storeId, conversationId: c.id, kind: 'ORDER_CREATED', actorType: 'STAFF', actorStaffId: who.actor.staffUserId, actorName: name, data: { orderId: o.id, number: o.number, source: o.source, gate, totalMinor: o.totalMinor }, createdAt: nowOf(deps) },
    });
  }, TX);

  let payLink: ChatOrderResult['payLink'] = null;
  if (gate === 'advance') {
    const pay = await deps.db.payment.findFirst({ where: { storeId, orderId: o.id, linkToken: { not: null } }, orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }], select: { linkToken: true, amountMinor: true } });
    if (pay?.linkToken) {
      const [currency, storeLocale] = await Promise.all([setting(deps, storeId, 'store.currency'), setting(deps, storeId, 'store.locale')]);
      const body = cfg.payLinkWords[d.lang]
        .replaceAll('{number}', o.number)
        .replaceAll('{amount}', moneyText(pay.amountMinor, currency, storeLocale, d.lang))
        .replaceAll('{link}', link.payLink(pay.linkToken, d.lang));
      const sent = await sendReply(deps, who, { conversationId: c.id, body, note: false, assetIds: [], requestKey: payKeyOf(d.requestKey) });
      payLink = { messageId: sent.messageId, delivery: sent.delivery };
    }
  }
  return { orderId: o.id, number: o.number, replay: placed.replay, gate, advance, payLink };
}
