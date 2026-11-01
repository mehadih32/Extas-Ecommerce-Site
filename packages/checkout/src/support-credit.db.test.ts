// PR 429 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): an order placed from a product link sent in a
// support chat is credited to the chat once — opened, within the days, this store's, products in the chat on — with a
// line in the chat's log; an unknown, unopened, old or spent reference is ignored, and the order's money, payment and
// source never change. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { registry } from '@extas/settings';
import { placeOrder, type PlaceInput } from './place';
import { checkoutQuote } from './quote';
import { setUpCheckout, type CheckoutFixture } from './testing';

const FORM = { name: 'Test Customer', phone: '01700000429', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' };

describe.skipIf(!HAS_TEST_DB)('PR 429 · an order from a support chat’s product link (PostgreSQL)', () => {
  let f: CheckoutFixture;
  let conversationId = '';
  let productId = '';
  let picked = 0;
  const on = (extra: Record<string, unknown> = {}) => f.overrides.set('support.catalogue', { ...registry['support.catalogue'].default, enabled: true, ...extra });

  beforeAll(async () => {
    f = await setUpCheckout('support_credit');
    await f.priceBand('dhaka-city', 8_000);
    f.overrides.set('payment.cod.enabled', true);
    const db = f.t.prisma;
    const channel = await db.supportChannel.create({ data: { storeId: f.S, kind: 'messenger', externalId: 'sample-429', name: 'messenger', enabled: true } });
    const contact = await db.supportContact.create({ data: { storeId: f.S, channelKind: 'messenger', externalId: 'psid-429' } });
    conversationId = (await db.conversation.create({ data: { storeId: f.S, channelId: channel.id, contactId: contact.id, refCode: 'C-429', status: 'OPEN' } })).id;
    productId = f.products['oxford-cotton-shirt']!.id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  const share = (refCode: string, clickedAt: Date | null) => f.t.prisma.supportProductShare.create({ data: { storeId: f.S, conversationId, productId, refCode, clickedAt } });

  async function place(name: string, supportRef: string | null) {
    // a different piece each time, so the sample stock lasts
    const v = Object.values(f.products).flatMap((p) => p.variants.filter((x) => x.priceMinor != null && x.sellable > 0))[picked++]!;
    const bag = await f.bag(name, [{ variantId: v.id }]);
    const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: bag.cartId, lang: 'en', customerId: null, address: { line: FORM.address, confirmed: null }, payment: null, details: { name: FORM.name, phone: FORM.phone } });
    const input: PlaceInput = { idempotencyKey: randomUUID(), lang: 'en', form: FORM, confirmed: null, payment: null, fingerprint: q.fingerprint };
    const r = await placeOrder(f.deps(), { storeId: f.S, visitorId: bag.visitorId, customerId: null, supportRef, input });
    return f.t.prisma.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { events: true } });
  }

  it('off as it ships: an opened reference credits nothing', async () => {
    const s = await share('offref4290', f.clock.now);
    const o = await place('credit-off', s.refCode);
    expect(o.supportRefCode).toBeNull();
    expect((await f.t.prisma.supportProductShare.findUniqueOrThrow({ where: { id: s.id } })).orderId).toBeNull();
  });

  it('opened within the days: the order names the chat, the share names the order, the log says so — once', async () => {
    on();
    const s = await share('goodref4290', new Date(f.clock.now.getTime() - 2 * 86_400_000));
    const plain = await place('credit-plain', null);
    const o = await place('credit-good', s.refCode);
    expect(o.supportRefCode).toBe(s.refCode);
    // the money and the source are the same as an order placed without the link
    expect({ source: o.source, total: o.totalMinor, cod: o.codAmountMinor, method: o.paymentMethod }).toEqual({ source: plain.source, total: plain.totalMinor, cod: plain.codAmountMinor, method: plain.paymentMethod });
    expect(o.source).toBe('WEBSITE');
    expect(o.events.find((e) => e.type === 'order.placed')?.data).toMatchObject({ supportRef: s.refCode });
    expect((await f.t.prisma.supportProductShare.findUniqueOrThrow({ where: { id: s.id } })).orderId).toBe(o.id);
    const ev = await f.t.prisma.conversationEvent.findFirstOrThrow({ where: { conversationId, kind: 'PRODUCT_ORDERED' } });
    expect(ev).toMatchObject({ actorType: 'CUSTOMER' });
    expect(ev.data).toMatchObject({ ref: s.refCode, orderId: o.id, number: o.number });
    // the same link again: the share has its order; the second order is not credited
    const again = await place('credit-again', s.refCode);
    expect(again.supportRefCode).toBeNull();
    expect(await f.t.prisma.conversationEvent.count({ where: { conversationId, kind: 'PRODUCT_ORDERED' } })).toBe(1);
  });

  it('unknown, never opened, past the days or badly shaped: ignored, the order is placed as usual', async () => {
    on({ creditDays: 3 });
    const unopened = await share('unopened4290', null);
    const old = await share('oldref42900', new Date(f.clock.now.getTime() - 4 * 86_400_000));
    for (const [name, ref] of [
      ['credit-unknown', 'nosuchref429'],
      ['credit-unopened', unopened.refCode],
      ['credit-old', old.refCode],
      ['credit-shape', 'NOT A REF'],
    ] as const) {
      const o = await place(name, ref);
      expect(o.status, name).toBe('PLACED');
      expect(o.supportRefCode, name).toBeNull();
    }
  });
});
