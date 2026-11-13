// S28 · PR 676, 677, 678, 679 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): the one-page Rules screen (rows, pills, saving through the setting's own schema, the owner's OK
// for money, back to the shipped value), the pop-up hub, and Offers & Discounts 360 (draft, owner's OK, the Smart Rule and
// coupon that carry it, the online-payment reward, pause, results). Every value is a made-up test value.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  approveOffer,
  bustAll,
  createOffer,
  getOffer,
  hubScreen,
  offersScreen,
  popupsScreen,
  resetHubRow,
  saveHubRow,
  savePopup,
  sendBackOffer,
  setOfferState,
  submitOffer,
  updateOffer,
  type HubDeps,
  type OfferDeps,
  type Who,
} from '../src';

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

const T0 = new Date('2026-11-13T06:00:00Z');
type Perm = 'rules.read' | 'rules.write' | 'rules.publish' | 'rules.approve';

describe.skipIf(!HAS_TEST_DB)('Rules hub, pop-ups and Offers 360 on PostgreSQL (S28 PR 676-679)', () => {
  let t: TestDatabase;
  let A = 0;
  const store = new Map<string, unknown>();
  const sets: { key: string; ownerApproved?: boolean }[] = [];
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (store.has(key) ? store.get(key) : registry[key].default) as Value<K>;
    },
    async set(key: string, value: unknown, _t: unknown, opts?: { ownerApproved?: boolean }) {
      const spec = (registry as unknown as Record<string, { schema: { parse(v: unknown): unknown } }>)[key]!;
      store.set(key, spec.schema.parse(value));
      sets.push({ key, ownerApproved: opts?.ownerApproved });
    },
  };
  const deps = (): HubDeps & OfferDeps => ({ db: t.prisma, settings: settings as never, now: () => T0 });
  let reader: Actor;
  let writer: Actor;
  let owner: Actor;
  const as = (actor: Actor): Who => ({ actor, storeId: A });

  beforeAll(async () => {
    t = await createTestDatabase('rules-hub');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: Perm[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    reader = await staff('reader@example.com', ['rules.read']);
    writer = await staff('writer@example.com', ['rules.read', 'rules.write', 'rules.publish']);
    owner = await staff('approver@example.com', ['rules.read', 'rules.write', 'rules.publish', 'rules.approve']);
  });
  afterAll(async () => {
    await t?.drop();
  });
  beforeEach(() => {
    bustAll();
    sets.length = 0;
  });

  // ---- PR 676 · the one-page Rules screen ---------------------------------------------------------------------------

  it('PR 676: the screen lists the rows whose settings exist, with a pill each; a reader may look but not save', async () => {
    const s = await hubScreen(deps(), as(reader));
    const ids = s.rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['free', 'eid', 'peak', 'dup', 'advwait', 'erpcheck', 'offers', 'popups']));
    const dup = s.rows.find((r) => r.id === 'dup')!;
    expect(dup.type === 'setting' && dup.value).toMatchObject({ lookbackDays: 5 });
    const free = s.rows.find((r) => r.id === 'free')!;
    expect(free.pill).toBe('off');
    const peak = s.rows.find((r) => r.id === 'peak')!;
    expect(peak.pill).toBe('off');
    expect(await code(saveHubRow(deps(), as(reader), { id: 'dup', version: 'x', values: { lookbackDays: 3 } }))).toBe('FORBIDDEN');
  });

  it('PR 676: a saved row goes through the setting; a stale screen, a field outside the row and a bad number are refused', async () => {
    const before = (await hubScreen(deps(), as(writer))).rows.find((r) => r.id === 'dup');
    if (before?.type !== 'setting') throw new Error('no dup row');
    const saved = await saveHubRow(deps(), as(writer), { id: 'dup', version: before.version, values: { lookbackDays: 7 } });
    expect(saved.value).toMatchObject({ lookbackDays: 7, enabled: true });
    expect(store.get('orders.duplicates')).toMatchObject({ lookbackDays: 7 });
    expect(await code(saveHubRow(deps(), as(writer), { id: 'dup', version: before.version, values: { lookbackDays: 9 } }))).toBe('STALE_DRAFT');
    expect(await code(saveHubRow(deps(), as(writer), { id: 'dup', version: saved.version, values: { reviewFrom: 'high' } }))).toBe('INVALID_INPUT');
    expect(await code(saveHubRow(deps(), as(writer), { id: 'dup', version: saved.version, values: { lookbackDays: 0 } }))).toBe('INVALID_INPUT');
    const log = await t.prisma.auditLog.findFirst({ where: { storeId: A, action: 'rules.hub.save' } });
    expect(log).toBeTruthy();
    // back to the shipped value
    const back = await resetHubRow(deps(), as(writer), { id: 'dup', version: saved.version });
    expect(back.value).toMatchObject({ lookbackDays: 5 });
  });

  it("PR 676: a rule that changes what customers pay needs the owner's OK and passes it on to the setting", async () => {
    const free = (await hubScreen(deps(), as(owner))).rows.find((r) => r.id === 'free');
    if (free?.type !== 'setting') throw new Error('no free row');
    expect(free.money).toBe(true);
    expect(await code(saveHubRow(deps(), as(writer), { id: 'free', version: free.version, values: { '': 150000 } }))).toBe('OWNER_OK_REQUIRED');
    const done = await saveHubRow(deps(), as(owner), { id: 'free', version: free.version, values: { '': 150000 } });
    expect(done.value).toBe(150000);
    expect(sets.at(-1)).toEqual({ key: 'delivery.freeOverMinor', ownerApproved: true });
    expect((await hubScreen(deps(), as(owner))).rows.find((r) => r.id === 'free')!.pill).toBe('on');
  });

  // ---- PR 678 · the pop-up hub --------------------------------------------------------------------------------------

  it("PR 678: twelve placements in four groups, off or waiting as shipped; saving one keeps the others and never touches the shop's engines", async () => {
    const s = await popupsScreen(deps(), as(reader));
    expect(s.popups).toHaveLength(12);
    expect(new Set(s.popups.map((p) => p.group)).size).toBe(4);
    expect(s.popups.find((p) => p.key === 'demo')!.state).toBe('waiting');
    expect(s.popups.find((p) => p.key === 'thanks')!.state).toBe('off');
    const entry = { on: true, textEn: 'Thank you {name}', textBn: '', from: null, to: null, n: null };
    expect(await code(savePopup(deps(), as(reader), { key: 'thanks', entry, version: s.version }))).toBe('FORBIDDEN');
    const next = await savePopup(deps(), as(writer), { key: 'thanks', entry, version: s.version });
    expect(next.popups.find((p) => p.key === 'thanks')).toMatchObject({ state: 'on', entry: { textEn: 'Thank you {name}' } });
    expect(await code(savePopup(deps(), as(writer), { key: 'thanks', entry, version: s.version }))).toBe('STALE_DRAFT');
    expect(await code(savePopup(deps(), as(writer), { key: 'demo', entry, version: next.version }))).toBe('INVALID_INPUT');
    expect(await code(savePopup(deps(), as(writer), { key: 'notice', entry, version: next.version }))).toBe('INVALID_INPUT');
    expect(await code(savePopup(deps(), as(writer), { key: 'thanks', entry: { ...entry, n: 3 }, version: next.version }))).toBe('INVALID_INPUT');
    const scheduled = await savePopup(deps(), as(writer), { key: 'lowstock', entry: { on: true, textEn: '{n} left', textBn: '', from: '2026-12-01', to: null, n: 3 }, version: next.version });
    expect(scheduled.popups.find((p) => p.key === 'lowstock')!.state).toBe('scheduled');
  });

  // ---- PR 677 · Offers & Discounts 360 ------------------------------------------------------------------------------

  const base = {
    kind: 'PERCENT' as const,
    trigger: 'ANY' as const,
    nameEn: 'Test ten percent',
    value: { percent: 10 },
    scope: { type: 'all' as const },
    who: { audience: 'ALL' as const, firstOrderOnly: false },
    code: 'TESTTEN',
    limits: { minOrderMinor: 100000, usageLimit: 50, perCustomerLimit: 1, budgetMinor: null },
  };
  let offerId = '';

  it("PR 677: a draft is checked, sent for the owner's OK, and only the owner makes it live; its Smart Rule and coupon carry it", async () => {
    const o = await createOffer(deps(), as(writer), base);
    offerId = o.id;
    expect(o.state).toBe('DRAFT');
    expect(await code(createOffer(deps(), as(reader), base))).toBe('FORBIDDEN');
    expect(await code(createOffer(deps(), as(writer), { ...base, value: { percent: 95 } }))).toBe('INVALID_INPUT');
    const noValue = await createOffer(deps(), as(writer), { ...base, nameEn: 'No value', value: {}, code: 'NOVALUE' });
    expect(noValue.issues).toContain('NO_VALUE');
    expect(await code(submitOffer(deps(), as(writer), noValue.id))).toBe('OFFER_INVALID');
    const edited = await updateOffer(deps(), as(writer), offerId, { ...base, value: { percent: 12 } });
    expect(edited.value.percent).toBe(12);
    const sent = await submitOffer(deps(), as(writer), offerId);
    expect(sent.state).toBe('AWAITING_OK');
    expect(await code(updateOffer(deps(), as(writer), offerId, base))).toBe('CONFLICT');
    expect(await code(approveOffer(deps(), as(writer), offerId))).toBe('OWNER_OK_REQUIRED');
    const back = await sendBackOffer(deps(), as(owner), offerId, { note: 'make it 10' });
    expect(back.state).toBe('DRAFT');
    await updateOffer(deps(), as(writer), offerId, base);
    await submitOffer(deps(), as(writer), offerId);
    const live = await approveOffer(deps(), as(owner), offerId);
    expect(live.state).toBe('LIVE');
    expect(live.ruleId).toBeTruthy();
    expect(live.couponId).toBeTruthy();
    const rule = await t.prisma.smartRule.findUnique({ where: { id: live.ruleId! } });
    expect(rule?.status).toBe('ACTIVE');
    const coupon = await t.prisma.coupon.findUnique({ where: { id: live.couponId! } });
    expect(coupon).toMatchObject({ code: 'TESTTEN', enabled: true, usageLimit: 50, perCustomerLimit: 1 });
    const h = await getOffer(deps(), as(reader), offerId);
    expect(h.history.map((e) => e.action)).toEqual(['CREATED', 'EDITED', 'SUBMITTED', 'SENT_BACK', 'EDITED', 'SUBMITTED', 'APPROVED']);
  });

  it('PR 677: pause, resume and end switch the rule and coupon, and the history only grows', async () => {
    expect(await code(setOfferState(deps(), as(writer), offerId, { action: 'pause' }))).toBe('OWNER_OK_REQUIRED');
    const paused = await setOfferState(deps(), as(owner), offerId, { action: 'pause' });
    expect(paused.state).toBe('PAUSED');
    expect((await t.prisma.coupon.findUnique({ where: { id: paused.couponId! } }))!.enabled).toBe(false);
    expect(await code(setOfferState(deps(), as(owner), offerId, { action: 'pause' }))).toBe('CONFLICT');
    const back = await setOfferState(deps(), as(owner), offerId, { action: 'resume' });
    expect(back.state).toBe('LIVE');
    expect((await t.prisma.coupon.findUnique({ where: { id: back.couponId! } }))!.enabled).toBe(true);
    const ended = await setOfferState(deps(), as(owner), offerId, { action: 'end' });
    expect(ended.state).toBe('ENDED');
    expect(await t.prisma.offer.findUnique({ where: { id: offerId } })).toBeTruthy();
    await expect(t.prisma.offerEvent.deleteMany({ where: { offerId } })).rejects.toBeTruthy();
  });

  it('PR 677: points and wallet credit are kept but cannot go live until their award job exists', async () => {
    const p = await createOffer(deps(), as(writer), {
      ...base,
      kind: 'POINTS',
      nameEn: 'Double points',
      value: { points: 50 },
      code: null,
      limits: { minOrderMinor: null, usageLimit: null, perCustomerLimit: null, budgetMinor: null },
    });
    expect(p.issues).toContain('OFFER_ENGINE_PENDING');
    expect(await code(submitOffer(deps(), as(writer), p.id))).toBe('OFFER_INVALID');
  });

  it('PR 677: the reward for paying online is an offer too: it writes the reward settings, only one at a time, and pausing switches it off', async () => {
    const online = {
      kind: 'PERCENT' as const,
      trigger: 'PAY_ONLINE' as const,
      nameEn: 'Pay online 5%',
      value: { percent: 5, maxMinor: 30000 },
      scope: { type: 'all' as const },
      who: { audience: 'ALL' as const, firstOrderOnly: false },
      code: null,
      limits: { minOrderMinor: null, usageLimit: null, perCustomerLimit: null, budgetMinor: null },
    };
    const o = await createOffer(deps(), as(writer), online);
    await submitOffer(deps(), as(writer), o.id);
    await approveOffer(deps(), as(owner), o.id);
    expect(store.get('checkout.prepaidReward.enabled')).toBe(true);
    expect(store.get('checkout.prepaidReward.type')).toBe('percent');
    expect(store.get('checkout.prepaidReward.percent')).toBe(5);
    expect(store.get('checkout.prepaidReward.maxMinor')).toBe(30000);
    expect(sets.every((x) => x.ownerApproved)).toBe(true);
    const second = await createOffer(deps(), as(writer), { ...online, nameEn: 'Another', kind: 'FREE_DELIVERY', value: {} });
    await submitOffer(deps(), as(writer), second.id);
    expect(await code(approveOffer(deps(), as(owner), second.id))).toBe('OFFER_INVALID');
    const withCode = await createOffer(deps(), as(writer), { ...online, nameEn: 'Coded', code: 'PAYON' });
    expect(withCode.issues).toContain('ONLINE_NEEDS_ALL');
    await setOfferState(deps(), as(owner), o.id, { action: 'pause' });
    expect(store.get('checkout.prepaidReward.enabled')).toBe(false);
  });

  it('PR 677: one list holds offers, coupons, built-in rules, points and wallet; results come from the orders that used the code', async () => {
    const band = await t.prisma.deliveryBand.create({ data: { storeId: A, key: 'dhaka-city', nameEn: 'Dhaka', chargeMinor: 8000, enabled: true, sortOrder: 0 } });
    await t.prisma.order.create({
      data: {
        storeId: A,
        number: 'S-7001',
        source: 'WEBSITE',
        currency: 'BDT',
        placedAt: T0,
        deliveryBandId: band.id,
        paymentMethod: 'COD',
        subtotalMinor: 200000,
        discountMinor: 20000,
        totalMinor: 188000,
        couponCode: 'TESTTEN',
        status: 'DELIVERED',
        idempotencyKey: 'idem-7001',
      },
    });
    await t.prisma.order.create({
      data: {
        storeId: A,
        number: 'S-7002',
        source: 'WEBSITE',
        currency: 'BDT',
        placedAt: T0,
        deliveryBandId: band.id,
        paymentMethod: 'COD',
        subtotalMinor: 100000,
        discountMinor: 10000,
        totalMinor: 98000,
        couponCode: 'TESTTEN',
        status: 'RETURNED',
        idempotencyKey: 'idem-7002',
      },
    });
    const s = await offersScreen(deps(), as(reader));
    const row = s.rows.find((r) => r.offerId === offerId)!;
    expect(row.results).toEqual({ orders: 2, salesMinor: 286000, discountMinor: 30000, deliveredMinor: 188000, returned: 1 });
    expect(s.rows.map((r) => r.source)).toEqual(expect.arrayContaining(['offer', 'points', 'wallet']));
    expect(s.discount30).toEqual({ discountMinor: 30000, orders: 2 });
    // the offer's own rule and coupon are not listed a second time
    expect(s.rows.filter((r) => r.source === 'coupon' && r.code === 'TESTTEN')).toHaveLength(0);
  });
});
