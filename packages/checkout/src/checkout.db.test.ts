// S04 · the checkout on a real PostgreSQL (a throwaway database with the real migrations, the sample catalogue, the
// default pack's three delivery bands and the SAMPLE gazetteer; skipped without TEST_DATABASE_ADMIN_URL). Every value
// is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { readAddress } from './address';
import { checkoutQuote } from './quote';
import { setUpCheckout, type CheckoutFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('the checkout on PostgreSQL (S04)', () => {
  let f: CheckoutFixture;

  beforeAll(async () => {
    f = await setUpCheckout('checkout');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  describe('PR 117 · the address read with the gazetteer', () => {
    it('the gazetteer covers every district and more than 140 places in Dhaka City', async () => {
      expect(await f.t.prisma.geoArea.count({ where: { level: 'DISTRICT', archivedAt: null } })).toBe(64);
      expect(await f.t.prisma.geoArea.count({ where: { cityCorporation: { in: ['DNCC', 'DSCC'] }, archivedAt: null } })).toBeGreaterThan(140);
    });

    it('the longest name wins and the district settles it: "Mirpur 1, Dhaka" is the Dhaka area, not Kushtia\'s Mirpur', async () => {
      const r = await readAddress(f.deps(), f.S, { line: 'House 4, Road 2, Mirpur 1, Dhaka' });
      expect(r.status).toBe('resolved');
      if (r.status !== 'resolved') return;
      expect(r.read.area?.nameEn).toBe('Mirpur 1');
      expect(r.read.band.key).toBe('dhaka-city');
      const bogura = await readAddress(f.deps(), f.S, { line: 'Masterpara, Gabtali, Bogura' });
      expect(bogura.status === 'resolved' && bogura.read.band.key).toBe('outside-dhaka');
    });

    it('a line that names two places in different bands is a question, never a guess; nothing yet is "none"', async () => {
      expect((await readAddress(f.deps(), f.S, { line: 'Gabtoli' })).status).toBe('ask');
      expect((await readAddress(f.deps(), f.S, { line: '   ' })).status).toBe('none');
      expect((await readAddress(f.deps(), f.S, null)).status).toBe('none');
      expect(await code(readAddress(f.deps(), f.S, { line: 'x'.repeat(301) }))).toBe('INVALID_INPUT');
      expect(await code(readAddress(f.deps(), f.S, { line: 'Mirpur', chargeMinor: 0 } as never))).toBe('INVALID_INPUT');
    });

    it('the quote carries the read: the band and the place the page shows', async () => {
      const { cartId } = await f.bag('read', [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }]);
      const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Road 5, Dhanmondi, Dhaka 1209' } });
      expect(q.delivery).toMatchObject({ state: 'found', band: { key: 'dhaka-city' } });
      const none = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en' });
      expect(none.delivery).toEqual({ state: 'none' });
    });
  });
  describe('PR 118 · ask, never guess', () => {
    it('a line in two bands asks "where is this?"; his answer is kept and the quote says it was his choice', async () => {
      const { cartId } = await f.bag('ask', [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }]);
      const asked = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Gabtoli' } });
      expect(asked.delivery.state).toBe('ask');
      if (asked.delivery.state !== 'ask') return;
      expect(asked.delivery.reason).toBe('two-places');
      expect(new Set(asked.delivery.options.map((o) => o.band.key))).toEqual(new Set(['dhaka-city', 'outside-dhaka']));
      const bogura = asked.delivery.options.find((o) => o.band.key === 'outside-dhaka')!;
      expect(bogura.places).toHaveLength(1);
      const picked = await checkoutQuote(f.deps(), {
        storeId: f.S,
        cartId,
        lang: 'en',
        address: { line: 'Gabtoli', confirmed: { bandId: bogura.band.id, areaId: bogura.places[0]!.id } },
      });
      expect(picked.delivery).toMatchObject({ state: 'found', via: 'choice', band: { key: 'outside-dhaka' }, place: { id: bogura.places[0]!.id } });
      // the order keeps the same read: the place he picked is the one charged
      expect(picked.address.status === 'resolved' && picked.address.line.area.areaId).toBe(bogura.places[0]!.id);
    });

    it('a sure read that disagrees with his earlier answer asks again ("changed"), never a silent switch', async () => {
      const { cartId } = await f.bag('changed', [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }]);
      const outside = (await f.t.prisma.deliveryBand.findFirstOrThrow({ where: { storeId: f.S, key: 'outside-dhaka' } })).id;
      const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Road 5, Dhanmondi, Dhaka 1209', confirmed: { bandId: outside } } });
      expect(q.delivery.state === 'ask' && q.delivery.reason).toBe('changed');
      if (q.delivery.state !== 'ask') return;
      expect(q.delivery.options.map((o) => o.band.key)).toEqual(['outside-dhaka', 'dhaka-city']);
      // choosing what the line says settles it from the line
      const city = q.delivery.options[1]!.band.id;
      const again = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Road 5, Dhanmondi, Dhaka 1209', confirmed: { bandId: city } } });
      expect(again.delivery).toMatchObject({ state: 'found', via: 'line', band: { key: 'dhaka-city' } });
      // a band that is not this store's is never trusted: the line is asked about as if nothing was chosen
      const stranger = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Gabtoli', confirmed: { bandId: 'not-a-band' } } });
      expect(stranger.delivery.state).toBe('ask');
    });
  });
  describe('PR 119 · the delivery charge from the zone', () => {
    const shirt = () => f.variant('oxford-cotton-shirt', 'sky', 'M');

    it('a band with no charge yet is never a made-up figure: the total waits ("+ delivery"), the charge is "not set"', async () => {
      const { cartId } = await f.bag('notset', [{ variantId: shirt().id }]);
      const before = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en' });
      expect(before.rates).toEqual([]); // every band off by default: no rates line
      expect(before.charge).toEqual({ state: 'unknown' });
      const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Masterpara, Gabtali, Bogura' } });
      expect(q.delivery).toMatchObject({ state: 'found', band: { key: 'outside-dhaka', priced: false } });
      expect(q.charge).toEqual({ state: 'not-set' });
      expect(q.totals).toMatchObject({ deliveryMinor: null, known: false, totalMinor: q.totals.itemsMinor });
    });

    it("the owner's band figure is the charge: in the total and the fingerprint; the rates line shows city and outside", async () => {
      const { cartId } = await f.bag('charged', [{ variantId: shirt().id }]);
      const plain = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Road 5, Dhanmondi, Dhaka 1209' } });
      await f.priceBand('dhaka-city', 9_000, [24, 48]);
      await f.priceBand('outside-dhaka', 13_000, [48, 72]);
      const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Road 5, Dhanmondi, Dhaka 1209' } });
      expect(q.charge).toEqual({ state: 'charge', chargeMinor: 9_000 });
      expect(q.totals).toMatchObject({ deliveryMinor: 9_000, known: true, totalMinor: q.totals.itemsMinor + 9_000 });
      expect(q.fingerprint).not.toBe(plain.fingerprint);
      expect(q.rates.map((b) => [b.key, b.chargeMinor])).toEqual([
        ['dhaka-city', 9_000],
        ['outside-dhaka', 13_000],
      ]);
      const out = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Masterpara, Gabtali, Bogura' } });
      expect(out.charge).toEqual({ state: 'charge', chargeMinor: 13_000 });
      // a sure answer to the question is charged the same way
      const asked = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Gabtoli' } });
      const city = asked.delivery.state === 'ask' ? asked.delivery.options.find((o) => o.band.key === 'dhaka-city')! : null;
      expect(city?.band.chargeMinor).toBe(9_000);
      const picked = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: { line: 'Gabtoli', confirmed: { bandId: city!.band.id, areaId: city!.places[0]?.id ?? null } } });
      expect(picked.charge).toEqual({ state: 'charge', chargeMinor: 9_000 });
    });

    it('free delivery from the live rule wins over the band figure: no figure, the reason, and the gap before it', async () => {
      await f.switchRule('delivery');
      try {
        const small = await f.bag('free-small', [{ variantId: shirt().id }]);
        const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: small.cartId, lang: 'en', address: { line: 'Road 5, Dhanmondi, Dhaka 1209' } });
        expect(q.charge).toEqual({ state: 'charge', chargeMinor: 9_000 }); // the band's figure, not the rule's copy (8000)
        expect(q.freeGapMinor).toBe(150_000 - q.totals.itemsMinor);
        const big = await f.bag('free-big', [{ variantId: shirt().id, quantity: 20 }]);
        const free = await checkoutQuote(f.deps(), { storeId: f.S, cartId: big.cartId, lang: 'en', address: { line: 'Road 5, Dhanmondi, Dhaka 1209' } });
        expect(free.charge).toEqual({ state: 'free', reason: 'FREE_OVER', freeOverMinor: 150_000 });
        expect(free.totals).toMatchObject({ deliveryMinor: 0, known: true, totalMinor: free.totals.itemsMinor });
        expect(free.freeGapMinor).toBeNull();
        // free before any address, too
        expect((await checkoutQuote(f.deps(), { storeId: f.S, cartId: big.cartId, lang: 'en' })).charge.state).toBe('free');
      } finally {
        await f.switchRule('delivery', false);
      }
    });
  });
});
