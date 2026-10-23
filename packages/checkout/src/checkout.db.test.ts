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
});
