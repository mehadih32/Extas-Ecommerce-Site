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
  describe('PR 120 · payment methods and the prepaid reward (SIM-F-042)', () => {
    const shirt = () => f.variant('oxford-cotton-shirt', 'sky', 'M');
    const DHANMONDI = { line: 'Road 5, Dhanmondi, Dhaka 1209' };
    const set = (values: Record<string, unknown>) => Object.entries(values).forEach(([k, v]) => f.overrides.set(k, v));
    const unset = (...keys: string[]) => keys.forEach((k) => f.overrides.delete(k));
    const REWARD = ['checkout.prepaidReward.enabled', 'checkout.prepaidReward.type', 'checkout.prepaidReward.fallback', 'checkout.prepaidReward.amountMinor', 'checkout.prepaidReward.percent', 'checkout.prepaidReward.maxMinor'];

    it("Cash on Delivery is the owner's: off until he switches it on; then it is the first choice, and a closed choice falls back", async () => {
      const { cartId } = await f.bag('pay', [{ variantId: shirt().id }]);
      const fresh = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: DHANMONDI });
      expect(fresh.pay).toMatchObject({ cod: false, codOff: 'OFF', mobile: ['bkash', 'nagad', 'rocket'], card: ['visa', 'mastercard', 'amex', 'bank'], online: true, reward: null });
      expect(fresh.pay.chosen).toEqual({ method: 'mobile', option: 'bkash' });
      expect((await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', payment: { method: 'cod' } })).pay.chosen?.method).toBe('mobile');
      set({ 'payment.cod.enabled': true });
      try {
        expect((await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en' })).pay).toMatchObject({ cod: true, codOff: null, chosen: { method: 'cod', option: null } });
        expect((await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', payment: { method: 'card', option: 'amex' } })).pay.chosen).toEqual({ method: 'card', option: 'amex' });
        expect((await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', payment: { method: 'mobile', option: 'upay' } })).pay.chosen).toEqual({ method: 'mobile', option: 'bkash' });
        set({ 'checkout.pay.mobile.enabled': false, 'checkout.pay.online.enabled': false });
        const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', payment: { method: 'mobile', option: 'nagad' } });
        expect(q.pay).toMatchObject({ mobile: [], online: false, chosen: { method: 'cod' } });
        // the band's own COD limit (S06): over it, Cash on Delivery is not offered on this order
        await f.t.prisma.deliveryBand.update({ where: { storeId_key: { storeId: f.S, key: 'dhaka-city' } }, data: { codLimitMinor: 100 } });
        const over = await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: DHANMONDI, payment: { method: 'cod' } });
        expect(over.pay).toMatchObject({ cod: false, codOff: 'BAND_LIMIT', chosen: { method: 'card', option: 'visa' } });
        await f.t.prisma.deliveryBand.update({ where: { storeId_key: { storeId: f.S, key: 'dhaka-city' } }, data: { codLimitMinor: null } });
        unset('checkout.pay.card.enabled');
        set({ 'checkout.pay.card.enabled': false, 'payment.cod.enabled': null });
        expect((await checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en' })).pay.chosen).toBeNull(); // nothing open: the order cannot be placed
        expect(await code(checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', payment: { method: 'cheque' } as never }))).toBe('INVALID_INPUT');
      } finally {
        unset('payment.cod.enabled', 'checkout.pay.mobile.enabled', 'checkout.pay.online.enabled', 'checkout.pay.card.enabled');
      }
    });

    it('the reward: off and unset by default; each type for every prepaid method; Cash on Delivery takes it back', async () => {
      set({ 'payment.cod.enabled': true });
      try {
        const { cartId } = await f.bag('reward', [{ variantId: shirt().id }]);
        const q = (payment: { method: 'cod' | 'mobile' | 'card' | 'online'; option?: string }) => checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: DHANMONDI, payment });
        expect((await q({ method: 'card' })).pay.reward).toBeNull();
        set({ 'checkout.prepaidReward.enabled': true, 'checkout.prepaidReward.type': 'amount' });
        expect((await q({ method: 'card' })).pay.reward).toBeNull(); // switched on with no amount: nothing is invented
        set({ 'checkout.prepaidReward.type': 'freeDelivery' });
        for (const p of [{ method: 'mobile', option: 'bkash' }, { method: 'mobile', option: 'nagad' }, { method: 'card', option: 'visa' }, { method: 'online' }] as const) {
          const r = await q(p);
          expect(r.pay.reward, p.method).toEqual({ kind: 'freeDelivery', amountMinor: 9_000 });
          expect(r.charge, p.method).toEqual({ state: 'free', reason: 'PREPAID', freeOverMinor: null });
          expect(r.totals, p.method).toMatchObject({ deliveryMinor: 0, totalMinor: r.totals.itemsMinor, youSaveMinor: 9_000 });
        }
        const cod = await q({ method: 'cod' });
        expect(cod.pay.reward).toEqual({ kind: 'freeDelivery', amountMinor: 9_000 }); // still offered next to the prepaid options
        expect(cod.charge).toEqual({ state: 'charge', chargeMinor: 9_000 });
        expect(cod.totals).toMatchObject({ deliveryMinor: 9_000, rewardMinor: 0, totalMinor: cod.totals.itemsMinor + 9_000 });
        set({ 'checkout.prepaidReward.type': 'amount', 'checkout.prepaidReward.amountMinor': 5_000 });
        const amt = await q({ method: 'mobile', option: 'nagad' });
        expect(amt.totals).toMatchObject({ rewardMinor: 5_000, deliveryMinor: 9_000, totalMinor: amt.totals.itemsMinor + 9_000 - 5_000 });
        expect(amt.fingerprint).not.toBe((await q({ method: 'cod' })).fingerprint);
        set({ 'checkout.prepaidReward.type': 'percent', 'checkout.prepaidReward.percent': 10 });
        const pct = await q({ method: 'online' });
        expect(pct.totals.rewardMinor).toBe(Math.floor(pct.totals.itemsMinor / 10));
        set({ 'checkout.prepaidReward.maxMinor': 1_000 });
        expect((await q({ method: 'online' })).totals.rewardMinor).toBe(1_000);
      } finally {
        unset('payment.cod.enabled', ...REWARD);
      }
    });

    it('delivery already free: a free-delivery reward falls back to the amount or the percentage, never "free delivery" twice', async () => {
      set({ 'checkout.prepaidReward.enabled': true, 'checkout.prepaidReward.type': 'freeDelivery', 'checkout.prepaidReward.amountMinor': 5_000, 'checkout.prepaidReward.percent': 5 });
      await f.switchRule('delivery');
      try {
        const { cartId } = await f.bag('reward-free', [{ variantId: shirt().id, quantity: 20 }]);
        const q = () => checkoutQuote(f.deps(), { storeId: f.S, cartId, lang: 'en', address: DHANMONDI, payment: { method: 'card' } });
        expect((await q()).pay.reward).toBeNull(); // no fallback chosen yet
        set({ 'checkout.prepaidReward.fallback': 'amount' });
        const a = await q();
        expect(a.charge).toMatchObject({ state: 'free', reason: 'FREE_OVER' });
        expect(a.pay.reward).toEqual({ kind: 'amount', amountMinor: 5_000 });
        expect(a.totals).toMatchObject({ deliveryMinor: 0, rewardMinor: 5_000, totalMinor: a.totals.itemsMinor - 5_000 });
        set({ 'checkout.prepaidReward.fallback': 'percent' });
        const p = await q();
        expect(p.pay.reward).toEqual({ kind: 'percent', amountMinor: Math.floor(p.totals.itemsMinor * 0.05) });
      } finally {
        await f.switchRule('delivery', false);
        unset(...REWARD);
      }
    });
  });
});
