// PR 430 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — SIM-F-024, an order made from the chat: off
// as it ships, the bag and the order are refused; on, the chat's bag is priced by the shop's own engines (the same total
// as the same bag on the site), the details start from the chat's customer, and "Create order" places it with the
// chat's channel as its source (never "website"), the employee on its placed event, no marketing consent recorded, the
// conversation linked with a log line — one press, one order. The owner's layer asking an advance turns it into "Take
// advance": no Cash on Delivery order, the advance's pay link in the chat. Sold out is refused; only `support.order` may.
// Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { checkoutQuote, type AdvanceFlag } from '@extas/checkout';
import { setUpCheckout, type CheckoutFixture } from '@extas/checkout/testing';
import { registry } from '@extas/settings';
import { changeChatBag, chatBag, chatVisitorId, createChatOrder, gateOf, quoteChatOrder, supportThread, type ChatOrderDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    const x = e as { code?: string; data?: { code?: string } };
    return x.code === 'CHECKOUT' ? `CHECKOUT:${x.data?.code}` : (x.code ?? String(e));
  }
}

const FORM = { name: 'Sample Chat Buyer', phone: '01700000430', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' };
const PAY_LINK = (token: string, lang: string) => `https://shop.example.test${lang === 'bn' ? '/bn' : ''}/pay/${token}`;

describe.skipIf(!HAS_TEST_DB)('PR 430 · SIM-F-024: an order from the chat (PostgreSQL)', () => {
  let f: CheckoutFixture;
  let flag: AdvanceFlag | null = null;
  const landed: string[] = [];
  const deps = (): ChatOrderDeps => ({
    db: f.t.prisma,
    settings: f.deps().settings,
    now: () => f.clock.now,
    checkout: { ...f.deps(), advanceFlag: async () => flag },
    afterPlace: async (_s, orderId) => void landed.push(orderId),
  });
  const who: Record<'agent' | 'reader', Who> = {} as never;
  const chats: Record<'wa' | 'fb', string> = { wa: '', fb: '' };
  const on = () => f.overrides.set('support.cart', { ...registry['support.cart'].default, enabled: true });
  const piece = (n: number) => Object.values(f.products).flatMap((p) => p.variants.filter((x) => x.priceMinor != null && x.sellable > 2))[n]!;

  beforeAll(async () => {
    f = await setUpCheckout('support_chat_cart');
    await f.priceBand('dhaka-city', 8_000);
    f.overrides.set('payment.cod.enabled', true);
    const db = f.t.prisma;
    const mk = (k: string, permissions: string[]) => createRole(db, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = { agent: await mk('t-chat-agent', ['support.read', 'support.reply', 'support.order']), reader: await mk('t-chat-reader', ['support.read', 'support.reply']) };
    for (const k of ['agent', 'reader'] as const) {
      const u = await db.staffUser.create({ data: { email: `${k}-430@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await db.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: f.S } });
      who[k] = { actor: { staffUserId: u.id }, storeId: f.S };
    }
    const customer = await db.customer.create({ data: { storeId: f.S, name: 'Sample Known Buyer', phone: '+8801700000431' } });
    for (const [k, kind] of [
      ['wa', 'whatsapp'],
      ['fb', 'messenger'],
    ] as const) {
      const channel = await db.supportChannel.create({ data: { storeId: f.S, kind, externalId: `sample-430-${k}`, name: kind, enabled: true } });
      const contact = await db.supportContact.create({ data: { storeId: f.S, channelKind: kind, externalId: `ext-430-${k}`, ...(k === 'fb' ? { customerId: customer.id, phone: '+8801700000431' } : { phone: '+8801700000430' }) } });
      chats[k] = (await db.conversation.create({ data: { storeId: f.S, channelId: channel.id, contactId: contact.id, refCode: `C-430${k}`, status: 'OPEN', ...(k === 'fb' ? { customerId: customer.id } : {}) } })).id;
    }
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as it ships: the bag, the price and the order are refused; the thread offers no bag', async () => {
    expect(registry['support.cart'].default.enabled).toBe(false);
    expect(await code(chatBag(deps(), who.agent, chats.wa))).toBe('CART_OFF');
    expect(await code(changeChatBag(deps(), who.agent, { conversationId: chats.wa, action: 'add', variantId: piece(0).id }))).toBe('CART_OFF');
    expect(await code(createChatOrder(deps(), who.agent, { conversationId: chats.wa, form: FORM, fingerprint: 'a'.repeat(64), requestKey: randomUUID() }, { payLink: PAY_LINK }))).toBe('CART_OFF');
    expect((await supportThread(deps(), who.agent, chats.wa)).you.cart).toBe(false);
  });

  it('only support.order fills the bag or makes the order', async () => {
    on();
    expect((await supportThread(deps(), who.agent, chats.wa)).you.cart).toBe(true);
    expect((await supportThread(deps(), who.reader, chats.wa)).you.cart).toBe(false);
    expect(await code(chatBag(deps(), who.reader, chats.wa))).toBe('FORBIDDEN');
    expect(await code(changeChatBag(deps(), who.reader, { conversationId: chats.wa, action: 'add', variantId: piece(0).id }))).toBe('FORBIDDEN');
  });

  it('the bag is priced like the site; Create order keeps the channel, names the employee and links the chat — one press, one order', async () => {
    on();
    const a = piece(0);
    const b = piece(1);
    let bag = await changeChatBag(deps(), who.agent, { conversationId: chats.wa, action: 'add', variantId: a.id });
    bag = await changeChatBag(deps(), who.agent, { conversationId: chats.wa, action: 'add', variantId: b.id, quantity: 2 });
    expect(bag.lines).toHaveLength(2);
    const second = bag.lines.find((l) => l.quantity === 2)!;
    bag = await changeChatBag(deps(), who.agent, { conversationId: chats.wa, action: 'quantity', lineId: second.lineId, quantity: 1 });
    expect(bag.count).toBe(2);
    // the chat's number is the start of the details (no customer linked: no name or address yet)
    expect(bag.prefill).toEqual({ name: '', phone: '01700000430', address: '' });

    // the same two pieces in a website bag cost exactly the same
    const site = await f.bag('site-430', [{ variantId: a.id }, { variantId: b.id }]);
    const siteQ = await checkoutQuote(f.deps(), { storeId: f.S, cartId: site.cartId, lang: 'en', customerId: null, address: { line: FORM.address, confirmed: null }, payment: { method: 'cod' }, details: { name: FORM.name, phone: FORM.phone } });
    const q = await quoteChatOrder(deps(), who.agent, { conversationId: chats.wa, form: FORM });
    expect(q.gate).toBe('cod');
    expect(q.problem).toBeNull();
    expect(q.totals).toEqual(siteQ.totals);
    expect(gateOf(siteQ)).toBe('cod');

    const key = randomUUID();
    const r = await createChatOrder(deps(), who.agent, { conversationId: chats.wa, form: FORM, fingerprint: q.fingerprint, requestKey: key }, { payLink: PAY_LINK });
    expect(r).toMatchObject({ replay: false, gate: 'cod', payLink: null });
    expect(landed).toContain(r.orderId);
    const o = await f.t.prisma.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { events: true, items: true } });
    expect(o).toMatchObject({ source: 'WHATSAPP', paymentMethod: 'COD', totalMinor: siteQ.totals.totalMinor, codAmountMinor: siteQ.totals.dueMinor, visitorId: chatVisitorId(chats.wa), smsMarketingConsent: null, whatsappMarketingConsent: null });
    expect(o.items).toHaveLength(2);
    const placed = o.events.find((e) => e.type === 'order.placed')!;
    expect(placed).toMatchObject({ actorType: 'STAFF', actorId: who.agent.actor.staffUserId, source: 'support' });
    expect(placed.data).toMatchObject({ chat: { conversationId: chats.wa, kind: 'whatsapp' } });
    expect(await f.t.prisma.consentRecord.count({ where: { orderId: o.id } })).toBe(0);
    const th = await supportThread(deps(), who.agent, chats.wa);
    expect(th.order).toMatchObject({ id: o.id, number: o.number });
    const ev = th.events.filter((e) => e.kind === 'ORDER_CREATED');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.data).toMatchObject({ orderId: o.id, number: o.number, source: 'WHATSAPP', gate: 'cod' });

    // a second press: the same order, no second log line; the bag is empty again for the next order
    const again = await createChatOrder(deps(), who.agent, { conversationId: chats.wa, form: FORM, fingerprint: q.fingerprint, requestKey: key }, { payLink: PAY_LINK });
    expect(again).toMatchObject({ orderId: r.orderId, replay: true });
    expect(await f.t.prisma.order.count({ where: { visitorId: chatVisitorId(chats.wa) } })).toBe(1);
    expect((await supportThread(deps(), who.agent, chats.wa)).events.filter((e) => e.kind === 'ORDER_CREATED')).toHaveLength(1);
    expect((await chatBag(deps(), who.agent, chats.wa)).lines).toHaveLength(0);
  });

  it('a stale price, an empty bag, a sold-out piece and unfinished details are refused with the checkout’s own reasons', async () => {
    on();
    expect(await code(createChatOrder(deps(), who.agent, { conversationId: chats.wa, form: FORM, fingerprint: 'b'.repeat(64), requestKey: randomUUID() }, { payLink: PAY_LINK }))).toBe('CHECKOUT:EMPTY');
    const v = piece(2);
    await changeChatBag(deps(), who.agent, { conversationId: chats.wa, action: 'add', variantId: v.id });
    expect(await code(createChatOrder(deps(), who.agent, { conversationId: chats.wa, form: FORM, fingerprint: 'b'.repeat(64), requestKey: randomUUID() }, { payLink: PAY_LINK }))).toBe('CHECKOUT:PRICE_CHANGED');
    const bad = await quoteChatOrder(deps(), who.agent, { conversationId: chats.wa, form: { ...FORM, phone: '0170' } });
    expect(bad.problem).toMatchObject({ field: 'phone' });
    expect(await code(createChatOrder(deps(), who.agent, { conversationId: chats.wa, form: { ...FORM, phone: '0170' }, fingerprint: bad.fingerprint, requestKey: randomUUID() }, { payLink: PAY_LINK }))).toBe('CHECKOUT:FORM');
    const few = Object.values(f.products).flatMap((p) => p.variants.filter((x) => x.priceMinor != null && x.sellable > 0 && x.sellable < 99))[0]!;
    expect(await code(changeChatBag(deps(), who.agent, { conversationId: chats.wa, action: 'add', variantId: few.id, quantity: few.sellable + 1 }))).toBe('OUT_OF_STOCK');
    const line = (await chatBag(deps(), who.agent, chats.wa)).lines[0]!;
    expect((await changeChatBag(deps(), who.agent, { conversationId: chats.wa, action: 'remove', lineId: line.lineId })).lines).toHaveLength(0);
  });

  it('red: the owner’s layer asks an advance — no Cash on Delivery order; Take advance sends the pay link into the chat', async () => {
    on();
    const layer = await f.t.prisma.checkoutParameterLayer.create({ data: { storeId: f.S, name: 'Sample layer', position: 1, enabled: true, conditions: { minScore: null, bands: [], signals: ['newPhone'] }, requirement: 'DELIVERY_CHARGE' } });
    flag = { layerId: layer.id, layerName: 'Sample layer', requirement: 'DELIVERY_CHARGE', partPercent: null, score: 80, band: 'high' };
    try {
      await changeChatBag(deps(), who.agent, { conversationId: chats.fb, action: 'add', variantId: piece(3).id });
      const bag = await chatBag(deps(), who.agent, chats.fb);
      // the chat's customer is the start of the details
      expect(bag.prefill).toMatchObject({ name: 'Sample Known Buyer', phone: '01700000431' });
      const form = { ...FORM, phone: '01700000431' };
      const q = await quoteChatOrder(deps(), who.agent, { conversationId: chats.fb, form });
      expect(q.gate).toBe('advance');
      expect(q.codOff).toBe('ADVANCE');
      expect(q.advance).toMatchObject({ kind: 'delivery', amountMinor: 8_000 });
      const r = await createChatOrder(deps(), who.agent, { conversationId: chats.fb, lang: 'bn', form, fingerprint: q.fingerprint, requestKey: randomUUID() }, { payLink: PAY_LINK });
      expect(r.gate).toBe('advance');
      const o = await f.t.prisma.order.findUniqueOrThrow({ where: { id: r.orderId } });
      // a Cash on Delivery order only for the rest, with the delivery charge ahead (the checkout's own advance)
      expect(o).toMatchObject({ source: 'MESSENGER', advanceRequirement: 'DELIVERY_CHARGE', advanceRequiredMinor: 8_000 });
      const pay = await f.t.prisma.payment.findFirstOrThrow({ where: { orderId: o.id } });
      expect(pay).toMatchObject({ purpose: 'ADVANCE_DELIVERY_CHARGE', amountMinor: 8_000, status: 'INITIATED' });
      expect(pay.linkToken).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
      expect(pay.method).not.toBe('COD');
      const m = await f.t.prisma.message.findUniqueOrThrow({ where: { id: r.payLink!.messageId } });
      expect(m).toMatchObject({ direction: 'OUT', conversationId: chats.fb });
      expect(m.body).toContain(`https://shop.example.test/bn/pay/${pay.linkToken}`);
      expect(m.body).toContain(o.number);
      // the owner's words, never a typed amount
      expect(m.body).toContain(registry['support.cart'].default.payLinkWords.bn.split('{number}')[0]!);
    } finally {
      flag = null;
    }
  });

  it('Cash on Delivery closed for another reason and no advance asked: no order', async () => {
    on();
    f.overrides.set('payment.cod.enabled', false);
    try {
      await changeChatBag(deps(), who.agent, { conversationId: chats.wa, action: 'add', variantId: piece(4).id });
      const q = await quoteChatOrder(deps(), who.agent, { conversationId: chats.wa, form: FORM });
      expect(q.gate).toBe('closed');
      expect(await code(createChatOrder(deps(), who.agent, { conversationId: chats.wa, form: FORM, fingerprint: q.fingerprint, requestKey: randomUUID() }, { payLink: PAY_LINK }))).toBe('NO_COD');
    } finally {
      f.overrides.set('payment.cod.enabled', true);
    }
  });
});
