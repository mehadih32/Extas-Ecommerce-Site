// PR 132 — the offer banner on My account (demo 52-thanks.js ty_offerBanner, r12-acct.css note 51): his real wallet
// balance and the owner's own member offers, never an empty or a made-up one. The banner is off until the owner turns
// it on (`account.offerBanner.enabled`); the offers are the owner's words (`account.offerBanner.offers`). An offer with a
// coupon code shows only while that coupon really works for this customer: switched on, inside its dates, not for
// guests only, not used up, and not used up by him. With nothing true to say, there is no banner.
import { checkStoreId, nowOf, setting, type AccountsDeps } from './context';

export interface AccountOffer {
  id: string;
  /** The coupon code to type at checkout, or null for an offer that needs none. */
  code: string | null;
  title: { en: string; bn: string };
  note: { en: string; bn: string } | null;
}

export interface OfferBanner {
  /** The wallet's balance when there is credit in it; else null. */
  walletMinor: number | null;
  offers: AccountOffer[];
}

/** Who a coupon is for (Coupon.audience, PR 112): a members' banner never shows a guests-only code. */
const GUESTS_ONLY = 'GUESTS';

/** The owner's offers that are true for this customer right now (For you lists them too). */
export async function liveOffers(deps: AccountsDeps, input: { storeId: number; customerId: string }): Promise<AccountOffer[]> {
  checkStoreId(input.storeId);
  const cfg = await setting(deps, input.storeId, 'account.offerBanner');
  if (!cfg.offers.length) return [];
  const codes = [...new Set(cfg.offers.flatMap((o) => (o.code ? [o.code.toUpperCase()] : [])))];
  const now = nowOf(deps);
  const coupons = codes.length
    ? await deps.db.coupon.findMany({
        where: {
          storeId: input.storeId,
          code: { in: codes, mode: 'insensitive' },
          enabled: true,
          archivedAt: null,
          audience: { not: GUESTS_ONLY },
          AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
        select: { id: true, code: true, usageLimit: true, usedCount: true, perCustomerLimit: true },
      })
    : [];
  const mine = coupons.some((c) => c.perCustomerLimit !== null)
    ? await deps.db.couponRedemption.groupBy({ by: ['couponId'], where: { storeId: input.storeId, customerId: input.customerId, couponId: { in: coupons.map((c) => c.id) } }, _count: { _all: true } })
    : [];
  const used = new Map(mine.map((r) => [r.couponId, r._count._all]));
  const works = new Set(
    coupons.filter((c) => (c.usageLimit === null || c.usedCount < c.usageLimit) && (c.perCustomerLimit === null || (used.get(c.id) ?? 0) < c.perCustomerLimit)).map((c) => c.code.toUpperCase()),
  );
  return cfg.offers.filter((o) => !o.code || works.has(o.code.toUpperCase())).map((o) => ({ id: o.id, code: o.code ? o.code.toUpperCase() : null, title: o.title, note: o.note ?? null }));
}

/** The banner, or null when it is off or has nothing true to show. */
export async function offerBanner(deps: AccountsDeps, input: { storeId: number; customerId: string }): Promise<OfferBanner | null> {
  checkStoreId(input.storeId);
  const cfg = await setting(deps, input.storeId, 'account.offerBanner');
  if (!cfg.enabled) return null;
  const [offers, wallet] = await Promise.all([
    liveOffers(deps, input),
    deps.db.walletAccount.findFirst({ where: { storeId: input.storeId, customerId: input.customerId, status: 'ACTIVE' }, select: { balanceMinor: true } }),
  ]);
  const walletMinor = wallet && wallet.balanceMinor > 0 ? wallet.balanceMinor : null;
  if (!offers.length && walletMinor === null) return null;
  return { walletMinor, offers };
}
