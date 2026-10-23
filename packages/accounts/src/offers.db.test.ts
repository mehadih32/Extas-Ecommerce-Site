// S04 · PR 132 — the offer banner on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL):
// off by default; on, it shows only the real wallet balance and the owner's offers whose coupon really works for him;
// with nothing true to say, no banner. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { liveOffers, offerBanner } from './index';
import { setUpAccounts, type AccountsFixture } from './testing';

const text = (en: string) => ({ en, bn: en });

describe.skipIf(!HAS_TEST_DB)('PR 132 · the offer banner', () => {
  let f: AccountsFixture;
  let me: { id: string };

  beforeAll(async () => {
    f = await setUpAccounts('accounts_offers');
    me = await f.customer('+8801700000232', f.A, 'Rahim Uddin');
  });
  afterAll(async () => f?.t.drop());

  it('is off by default, and on with nothing true to say it is not there (never empty, never made up)', async () => {
    expect(await offerBanner(f.deps(), { storeId: f.A, customerId: me.id })).toBeNull();
    f.overrides.set('account.offerBanner', { enabled: true, offers: [] });
    expect(await offerBanner(f.deps(), { storeId: f.A, customerId: me.id })).toBeNull();
    // a wallet at zero is not a reason to show it either
    const w = await f.t.prisma.walletAccount.create({ data: { storeId: f.A, customerId: me.id, balanceMinor: 0, status: 'ACTIVE' } });
    expect(await offerBanner(f.deps(), { storeId: f.A, customerId: me.id })).toBeNull();
    await f.t.prisma.walletAccount.update({ where: { id: w.id }, data: { balanceMinor: 25_000 } });
    expect(await offerBanner(f.deps(), { storeId: f.A, customerId: me.id })).toEqual({ walletMinor: 25_000, offers: [] });
  });

  it("an offer with a code shows only while its coupon really works for him; one without a code is the owner's standing offer", async () => {
    const now = f.clock.now.getTime();
    const day = 86_400_000;
    const coupon = (code: string, data: Record<string, unknown> = {}) => f.t.prisma.coupon.create({ data: { storeId: f.A, code, kind: 'PERCENT', value: { percent: 10 }, enabled: true, ...data } });
    await coupon('LIVE');
    await coupon('OFF', { enabled: false });
    await coupon('GUEST', { audience: 'GUESTS' });
    await coupon('OVER', { endsAt: new Date(now - day) });
    await coupon('SOON', { startsAt: new Date(now + day) });
    await coupon('FULL', { usageLimit: 3, usedCount: 3 });
    const once = await coupon('ONCE', { perCustomerLimit: 1 });
    await coupon('THEIRS', { storeId: f.B });
    const offers = ['LIVE', 'OFF', 'GUEST', 'OVER', 'SOON', 'FULL', 'ONCE', 'NOSUCH', 'THEIRS'].map((code) => ({ id: code.toLowerCase(), code: code.toLowerCase(), title: text(`${code} offer`), note: null }));
    f.overrides.set('account.offerBanner', { enabled: true, offers: [...offers, { id: 'member', code: null, title: text('Free alterations for members'), note: text('Ask in the shop') }] });
    expect((await liveOffers(f.deps(), { storeId: f.A, customerId: me.id })).map((o) => o.code)).toEqual(['LIVE', 'ONCE', null]);
    // once he has used ONCE, it is gone for him
    const order = await f.order({ customerId: me.id, number: 'T-2320' });
    await f.t.prisma.couponRedemption.create({ data: { storeId: f.A, couponId: once.id, orderId: order.id, customerId: me.id, discountMinor: 1_000 } });
    const b = await offerBanner(f.deps(), { storeId: f.A, customerId: me.id });
    expect(b?.offers.map((o) => o.id)).toEqual(['live', 'member']);
    expect(b?.walletMinor).toBe(25_000);
  });
});
