// S28 · PR 730 (admin prototype v5, Orders › All orders › "Phone order"): a person who takes an order on the phone enters the
// caller's number, name and address and the pieces asked for, sees the price the shop's own checkout makes (offers, delivery,
// total) and presses "Create order". The order is the website's own order: the same stock hold, delivery charge, risk look and number,
// placed by `placeOrder` with the source PHONE and the person who pressed on its placed event (like "Confirm as order" on Orders ›
// Incomplete). Cash on Delivery only: when the owner's checkout layers ask an advance, or Cash on Delivery is closed for this order,
// no order is made here (the customer pays from the shop's own checkout), and the screen says so. Nothing is sent to the customer, no
// money moves, and no price, discount or charge is typed by the person: all of them come from the checkout.
// GET ?q= searches live products (name, SKU, colour); GET ?phone= tells whether the caller is a known customer. POST {action: 'quote' |
// 'create', requestKey, name, phone, address, lines: [{variantId, quantity}], fingerprint?}. Permission: `orders.confirm`, the same as
// "Confirm as order" on Orders › Incomplete (checked at the door and again in the handler).
import { audit } from '@extas/auth';
import { addItem, CartError, findBag, openBag, removeLine } from '@extas/cart';
import { checkoutQuote, CheckoutError, phoneNormalizeBD, placeOrder, type CheckoutDeps, type CheckoutQuote } from '@extas/checkout';
import { MOTHER_STORE_ID, type Prisma, type PrismaClient } from '@extas/db/client';
import { z } from 'zod';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AdPlatformsWho } from '../marketing/ad-platforms';

const S = MOTHER_STORE_ID;
/** The most products a phone order lists in a search. A read limit, not a business number. */
const SEARCH_MAX = 8; // hardcode-ok: a read limit
/** At most this many words of a search are matched. */
const WORDS_MAX = 5; // hardcode-ok: a guard on the query's shape
const TEXT_MAX = 2_000; // hardcode-ok: the checkout's own field limit

export class PhoneOrderError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface PhoneOrderDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  checkout: CheckoutDeps;
  /** The shop's after-order checks (identity, duplicates, risk score, blocklist, the advance wait …). */
  afterPlace: (storeId: number, orderId: string) => Promise<void>;
  now?: () => Date;
}

export type PhoneWho = AdPlatformsWho;

const lineSchema = z.object({ variantId: z.uuid(), quantity: z.int().min(1).max(100) }).strict();
export const phoneOrderInput = z
  .object({
    action: z.enum(['quote', 'create']),
    /** Made once by the screen and sent with every retry: one press, one order. */
    requestKey: z.uuid(),
    name: z.string().trim().min(1).max(TEXT_MAX),
    phone: z.string().trim().min(1).max(40),
    address: z.string().trim().min(1).max(TEXT_MAX),
    lines: z.array(lineSchema).min(1).max(40),
    /** The fingerprint the screen showed (the quote's): "Create order" refuses with PRICE_CHANGED when anything moved since. */
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  })
  .strict();
export type PhoneOrderInput = z.output<typeof phoneOrderInput>;

/** The bag a phone order is made from: one per press (the request key), emptied and filled again on every quote. */
export const phoneVisitorId = (requestKey: string): string => `phone-${requestKey}`;

export interface PhoneVariant {
  id: string;
  sku: string;
  colourEn: string | null;
  colourBn: string | null;
  size: string | null;
  priceMinor: number | null;
  inStock: boolean;
}
export interface PhoneProduct {
  id: string;
  nameEn: string;
  nameBn: string | null;
  variants: PhoneVariant[];
}

const live = { status: 'PUBLISHED', archivedAt: null } as const;

/** The words of a search, each found in the name, an address, a SKU or a colour name. */
export function phoneSearchWhere(q: string): Prisma.ProductWhereInput {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, WORDS_MAX);
  const one = (w: string): Prisma.ProductWhereInput => ({
    OR: [
      { nameEn: { contains: w, mode: 'insensitive' } },
      { nameBn: { contains: w, mode: 'insensitive' } },
      { slug: { contains: w, mode: 'insensitive' } },
      { variants: { some: { archivedAt: null, active: true, OR: [{ sku: { contains: w, mode: 'insensitive' } }, { colour: { OR: [{ nameEn: { contains: w, mode: 'insensitive' } }, { key: { contains: w, mode: 'insensitive' } }] } }] } } },
    ],
  });
  return { storeId: S, ...live, ...(words.length ? { AND: words.map(one) } : {}) };
}

/** Live products by name, SKU or colour, newest first, with the pieces that can be asked for. */
export async function phoneSearch(deps: Pick<PhoneOrderDeps, 'db' | 'resolver'>, q: string): Promise<{ products: PhoneProduct[]; currency: string }> {
  const currency = (await deps.resolver.value('store.currency', { storeId: S })) as string;
  const rows = await deps.db.product.findMany({
    where: phoneSearchWhere(q.slice(0, 80)),
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: SEARCH_MAX,
    select: {
      id: true,
      nameEn: true,
      nameBn: true,
      variants: {
        where: { archivedAt: null, active: true },
        orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }],
        select: { id: true, sku: true, priceMinor: true, inStock: true, colour: { select: { nameEn: true, nameBn: true } }, size: { select: { label: true } } },
      },
    },
  });
  return {
    currency,
    products: rows.map((p) => ({
      id: p.id,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, colourEn: v.colour?.nameEn ?? null, colourBn: v.colour?.nameBn ?? null, size: v.size?.label ?? null, priceMinor: v.priceMinor, inStock: v.inStock })),
    })),
  };
}

export interface PhoneCaller {
  known: boolean;
  name: string;
  address: string;
  orders: number;
  refused: number;
}

/** Whether the number is a customer already: the name and the latest address to start from, and how many orders and refusals. */
export async function phoneCaller(deps: Pick<PhoneOrderDeps, 'db'>, phone: string): Promise<PhoneCaller> {
  const p = phoneNormalizeBD(phone);
  if (!p.ok) return { known: false, name: '', address: '', orders: 0, refused: 0 };
  const c = await deps.db.customer.findFirst({ where: { storeId: S, phone: p.e164 }, select: { id: true, name: true, orderCount: true, refusedCount: true } });
  if (!c) return { known: false, name: '', address: '', orders: 0, refused: 0 };
  const last = await deps.db.order.findFirst({ where: { storeId: S, customerId: c.id }, orderBy: { placedAt: 'desc' }, select: { customerName: true, shippingAddressText: true } });
  return { known: true, name: c.name ?? last?.customerName ?? '', address: last?.shippingAddressText ?? '', orders: c.orderCount, refused: c.refusedCount };
}

/** Puts exactly the asked pieces in this press's bag (anything an earlier quote left there is taken out first). */
async function fillBag(deps: PhoneOrderDeps, requestKey: string, lines: PhoneOrderInput['lines']): Promise<string> {
  const visitorId = phoneVisitorId(requestKey);
  try {
    const { cartId } = await openBag(deps.checkout, { storeId: S, visitorId });
    const old = await checkoutQuote(deps.checkout, { storeId: S, cartId, lang: 'en', customerId: null, address: null, payment: null, useWallet: false, ip: null, gift: false, details: null });
    for (const it of old.bag.items) await removeLine(deps.checkout, { storeId: S, cartId, lineId: it.lineId });
    for (const st of old.bag.sets) await removeLine(deps.checkout, { storeId: S, cartId, lineId: st.lineId });
    for (const l of lines) await addItem(deps.checkout, { storeId: S, cartId, variantId: l.variantId, quantity: l.quantity, source: 'phone' });
    return cartId;
  } catch (e) {
    if (e instanceof CartError) throw new PhoneOrderError(e.code === 'OUT_OF_STOCK' || e.code === 'TOO_MANY' ? 'OUT_OF_STOCK' : e.code === 'NOT_FOUND' || e.code === 'NOT_FOR_SALE' ? 'NOT_FOUND' : 'INVALID_INPUT', 409);
    throw e;
  }
}

export interface PhoneQuote {
  lines: { lineId: string; nameEn: string; nameBn: string | null; colourEn: string | null; colourBn: string | null; size: string | null; quantity: number; amountMinor: number }[];
  itemsMinor: number;
  offers: { label: string; amountMinor: number }[];
  deliveryMinor: number | null;
  totalMinor: number;
  /** `cod`: an order can be made here; `advance` or `closed`: the customer has to order on the shop (no order is made from here). */
  gate: 'cod' | 'advance' | 'closed';
  fingerprint: string;
}

const gateOf = (q: Pick<CheckoutQuote, 'pay' | 'advance'>): PhoneQuote['gate'] => {
  if (q.advance && q.pay.chosen && q.pay.chosen.method !== 'cod') return 'advance';
  return q.pay.cod ? 'cod' : 'closed';
};

async function priceOf(deps: PhoneOrderDeps, d: PhoneOrderInput): Promise<{ q: CheckoutQuote; cartId: string; phone: string }> {
  const cartId = await fillBag(deps, d.requestKey, d.lines);
  const p = phoneNormalizeBD(d.phone);
  if (!p.ok) throw new PhoneOrderError('BAD_PHONE', 422, ['phone']);
  const q = await checkoutQuote(deps.checkout, {
    storeId: S,
    cartId,
    lang: 'en',
    customerId: null,
    address: { line: d.address, confirmed: null, phone: p.e164 },
    payment: { method: 'cod' },
    useWallet: false,
    ip: null,
    gift: false,
    details: { name: d.name, phone: p.e164 },
  });
  return { q, cartId, phone: p.e164 };
}

const quoteOut = (q: CheckoutQuote): PhoneQuote => ({
  lines: q.bag.items.map((i) => ({ lineId: i.lineId, nameEn: i.nameEn, nameBn: i.nameBn, colourEn: i.colour?.nameEn ?? null, colourBn: i.colour?.nameBn ?? null, size: i.size?.label ?? null, quantity: i.quantity, amountMinor: i.lineMinor })),
  itemsMinor: q.totals.itemsMinor,
  offers: q.bag.summary.offers.map((o) => ({ label: o.label.en ?? o.label.bn ?? '', amountMinor: o.amountMinor })),
  deliveryMinor: q.totals.deliveryMinor,
  totalMinor: q.totals.totalMinor,
  gate: gateOf(q),
  fingerprint: q.fingerprint,
});

/** "Check price": what the shop's own checkout charges for these pieces to this address. */
export async function quotePhoneOrder(deps: PhoneOrderDeps, input: unknown): Promise<PhoneQuote> {
  const parsed = phoneOrderInput.safeParse(input);
  if (!parsed.success) throw new PhoneOrderError('INVALID_INPUT', 400, [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'input')))]);
  const { q } = await priceOf(deps, parsed.data);
  return quoteOut(q);
}

export interface PhoneOrderResult {
  orderId: string;
  number: string;
  replay: boolean;
}

/** "Create order": places the bag as a Cash on Delivery order with the source PHONE (the website's own `placeOrder`). */
export async function createPhoneOrder(deps: PhoneOrderDeps, who: PhoneWho, input: unknown): Promise<PhoneOrderResult> {
  const parsed = phoneOrderInput.safeParse(input);
  if (!parsed.success) throw new PhoneOrderError('INVALID_INPUT', 400, [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'input')))]);
  const d = parsed.data;
  const me = who.actor.staffUserId ?? null;
  try {
    const { q, phone } = await priceOf(deps, d);
    const gate = gateOf(q);
    // an advance or a closed Cash on Delivery means money is asked: that is the customer's own checkout, never a phone click
    if (gate !== 'cod') throw new PhoneOrderError('NEEDS_PAYMENT', 409);
    if (d.fingerprint && d.fingerprint !== q.fingerprint) throw new PhoneOrderError('PRICE_CHANGED', 409);
    const placed = await placeOrder(deps.checkout, {
      storeId: S,
      visitorId: phoneVisitorId(d.requestKey),
      customerId: null,
      chat: { source: 'PHONE', conversationId: d.requestKey, channelKind: 'phone', staffUserId: me },
      input: { idempotencyKey: d.requestKey, lang: 'en', form: { name: d.name, phone, address: d.address }, confirmed: null, payment: { method: 'cod' }, fingerprint: q.fingerprint },
    });
    if (!placed.replay) await deps.afterPlace(S, placed.orderId);
    await audit(deps.db, who.actor, { storeId: S, action: 'orders.phone.create', entityType: 'Order', entityId: placed.orderId, before: {}, after: { number: placed.number, lines: d.lines.length } }, who.ctx);
    return { orderId: placed.orderId, number: placed.number, replay: placed.replay };
  } catch (e) {
    if (e instanceof CheckoutError) throw new PhoneOrderError('CHECKOUT', 422, [e.code]);
    throw e;
  }
}

/** Whether this press already placed its order (the screen can show the number again after a lost answer). */
export async function phoneBagOf(deps: PhoneOrderDeps, requestKey: string): Promise<string | null> {
  return findBag(deps.checkout, { storeId: S, visitorId: phoneVisitorId(requestKey) });
}

const answer = (e: unknown): Response => (e instanceof PhoneOrderError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/orders/phone — GET ?q= (products) or ?phone= (the caller); POST {action: 'quote' | 'create', …}. All need `orders.confirm`. */
export async function phoneOrderHandler(request: Request, deps: AdminDeps | null, make: (d: AdminDeps) => PhoneOrderDeps): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'orders.confirm', storeId: S });
  if (g instanceof Response) return g;
  const pd = make(deps!);
  try {
    if (method === 'GET') {
      const u = new URL(request.url).searchParams;
      if (u.has('phone')) return json({ ok: true, caller: await phoneCaller(pd, u.get('phone') ?? '') });
      return json({ ok: true, ...(await phoneSearch(pd, u.get('q') ?? '')) });
    }
    const b = await body(request).catch(() => ({}) as Record<string, unknown>);
    if (b.action === 'quote') return json({ ok: true, quote: await quotePhoneOrder(pd, b) });
    if (b.action === 'create') return json({ ok: true, order: await createPhoneOrder(pd, { actor: g.actor, ctx: g.ctx }, b) });
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return answer(e);
  }
}
