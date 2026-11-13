// S28 · PR 676-679: the pure parts of the Rules screen and Offers 360 (no database).
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { HUB_GROUPS, HUB_ROWS, POPUPS, smartGroupOf, ruleContentSchema } from '../src/pure';
import { getPath, setPath, versionOf } from '../src/hub-service';
import { offerIssues, ruleContentFor } from '../src/offers-service';

const baseOffer = {
  kind: 'PERCENT' as const,
  trigger: 'ANY' as const,
  value: { percent: 10 },
  scope: { type: 'all' as const },
  who: { audience: 'ALL' as const, firstOrderOnly: false },
  code: 'X1',
  startsAt: null,
  endsAt: null,
  limits: { minOrderMinor: null, usageLimit: null, perCustomerLimit: null, budgetMinor: null },
};

describe('the Rules catalogue', () => {
  it('every row has a unique id and a known group; every setting row names a setting of the registry unless it is optional', () => {
    const ids = HUB_ROWS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of HUB_ROWS) {
      expect(HUB_GROUPS).toContain(r.group);
      if (r.type === 'setting' && !r.optional) expect(registry as Record<string, unknown>, r.key).toHaveProperty([r.key]);
    }
    expect(smartGroupOf('discount')).toBe('discounts');
    expect(smartGroupOf('festive')).toBe('delivery');
    expect(smartGroupOf('whatever')).toBe('discounts');
  });
  it('twelve pop-ups, numbered 1 to 12, in four groups', () => {
    expect(POPUPS.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(POPUPS.map((p) => p.group))).toEqual(new Set(['shop', 'checkout', 'product', 'after']));
  });
  it('paths read and write inside a value without changing the original', () => {
    const v = { a: { b: 1 }, c: 2 };
    expect(getPath(v, 'a.b')).toBe(1);
    expect(getPath(v, '')).toBe(v);
    const w = setPath(v, 'a.b', 5) as typeof v;
    expect(w.a.b).toBe(5);
    expect(v.a.b).toBe(1);
    expect(setPath(7, '', 9)).toBe(9);
    expect(versionOf({ a: 1 })).toBe(versionOf({ a: 1 }));
    expect(versionOf({ a: 1 })).not.toBe(versionOf({ a: 2 }));
  });
});

describe('an offer, before it can go live', () => {
  it('a percent offer with a value and a code has no issues; points and wallet credit wait for their engine', () => {
    expect(offerIssues(baseOffer)).toEqual([]);
    expect(offerIssues({ ...baseOffer, value: {} })).toContain('NO_VALUE');
    expect(offerIssues({ ...baseOffer, kind: 'POINTS', value: { points: 5 } })).toContain('OFFER_ENGINE_PENDING');
    expect(offerIssues({ ...baseOffer, kind: 'WALLET_CREDIT', value: { creditMinor: 5000 } })).toContain('OFFER_ENGINE_PENDING');
  });
  it('who and the limits of use need a code to hold them; the reward for paying online takes no scope, code or window', () => {
    expect(offerIssues({ ...baseOffer, code: null, who: { audience: 'MEMBERS', firstOrderOnly: false } })).toContain('WHO_NEEDS_CODE');
    expect(offerIssues({ ...baseOffer, code: null, limits: { ...baseOffer.limits, usageLimit: 10 } })).toContain('LIMITS_NEED_CODE');
    expect(offerIssues({ ...baseOffer, trigger: 'PAY_ONLINE', code: null })).toEqual([]);
    expect(offerIssues({ ...baseOffer, trigger: 'PAY_ONLINE', code: null, endsAt: '2026-12-01T00:00:00Z' })).toContain('ONLINE_NEEDS_ALL');
    expect(offerIssues({ ...baseOffer, startsAt: '2026-12-02T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' })).toContain('BAD_WINDOW');
    expect(offerIssues({ ...baseOffer, kind: 'FREE_DELIVERY', value: {}, limits: { ...baseOffer.limits, minOrderMinor: 50000 } })).toContain('MIN_ORDER_FREE_DELIVERY_CODE');
  });
});

describe('the Smart Rule an offer makes', () => {
  const o = (kind: 'PERCENT' | 'FLAT' | 'FREE_DELIVERY', extra: Partial<Parameters<typeof ruleContentFor>[0]> = {}) => ({
    id: '0192a1b2-0000-7000-8000-000000000001',
    kind,
    nameEn: 'Test',
    value: kind === 'PERCENT' ? { percent: 10 } : kind === 'FLAT' ? { amountMinor: 20000 } : {},
    scope: { type: 'all' as const },
    code: null,
    startsAt: null,
    endsAt: null,
    limits: { minOrderMinor: null, usageLimit: null, perCustomerLimit: null, budgetMinor: null },
    ...extra,
  });
  it.each([
    ['percent with a code', o('PERCENT', { code: 'A1', limits: { minOrderMinor: 100000, usageLimit: null, perCustomerLimit: null, budgetMinor: null } })],
    ['flat with a code', o('FLAT', { code: 'A2' })],
    ['free delivery with a code', o('FREE_DELIVERY', { code: 'A3' })],
    ['free delivery for everyone from an amount', o('FREE_DELIVERY', { limits: { minOrderMinor: 150000, usageLimit: null, perCustomerLimit: null, budgetMinor: null } })],
    ['a percent in one category, no code', o('PERCENT', { scope: { type: 'category' as const, id: '0192a1b2-0000-7000-8000-000000000002' } })],
  ])('%s is a rule the engine accepts', (_n, off) => {
    const c = ruleContentFor(off, ['bag', 'checkout']);
    expect(ruleContentSchema.safeParse(c).success).toBe(true);
    expect(c.key).toBe('offer-0192a1b2');
    expect(c.status).toBe('ACTIVE');
    const asked = c.actions.some((a) => 'requiresCoupon' in a && a.requiresCoupon === true);
    expect(asked).toBe(off.code !== null);
  });
});
