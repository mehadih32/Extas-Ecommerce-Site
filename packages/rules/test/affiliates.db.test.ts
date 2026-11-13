// S28 · PR 695 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): Influencers & affiliates. Off as shipped;
// a partner needs a free code (and, if a coupon is named, that coupon's); commission counts only DELIVERED orders that
// used the code, after the hold days (a returned parcel earns nothing); what is owed is earned less the append-only
// ledger; Pay is OFF as shipped (owner decision: not built), needs the money key, never pays more than is owed, writes a
// cost line, and a correction is a negative row, never an edit. Every name and number is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { addAffiliate, affiliateBoard, recordAffiliatePayout, reverseAffiliatePayout, setAffiliateStatus, type RulesDeps, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 695 · affiliates (PostgreSQL)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let settings: SettingsResolver<typeof registry>;
  const now = new Date('2026-11-13T06:00:00Z');
  const deps = (): RulesDeps => ({ db: t.prisma, settings, now: () => now });
  let reader: Actor;
  let writer: Actor;
  let accounts: Actor;
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let n = 0;
  const order = (couponCode: string, status: string, deliveredAt: string | null, subtotalMinor = 100000, discountMinor = 10000) =>
    t.prisma.order.create({
      data: { storeId: A, number: `AF-${++n}`, source: 'WEBSITE', currency: 'BDT', placedAt: now, paymentMethod: 'COD', subtotalMinor, discountMinor, totalMinor: subtotalMinor - discountMinor, idempotencyKey: `idem-af-${n}`, status: status as never, couponCode, deliveredAt: deliveredAt ? new Date(deliveredAt) : null },
    });
  const set = (v: Record<string, unknown>) => settings.set('marketing.affiliates', { enabled: true, commissionPct: 10, holdDays: 7, payoutsOn: false, ...v } as never, storeTarget(A), { actorId: null, reason: 'test' });

  beforeAll(async () => {
    t = await createTestDatabase('affiliates');
    [A, B] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    settings = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    const staff = async (email: string, perms: string[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms as never });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    reader = await staff('af-reader@example.com', ['rules.read']);
    writer = await staff('af-writer@example.com', ['rules.read', 'rules.write']);
    accounts = await staff('af-accounts@example.com', ['rules.read', 'payments.record']);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped: nothing is listed and nothing is added', async () => {
    expect(await affiliateBoard(deps(), as(reader))).toMatchObject({ enabled: false, payoutsOn: false, list: [] });
    expect(await code(addAffiliate(deps(), as(writer), { name: 'Sample partner', code: 'SAMPLE10' }))).toBe('AFFILIATE_OFF');
  });

  it('adds a partner with a free code; the reader cannot; a code is used once', async () => {
    await set({});
    expect(await code(addAffiliate(deps(), as(reader), { name: 'Sample partner', code: 'SAMPLE10' }))).toBe('FORBIDDEN');
    const a = await addAffiliate(deps(), as(writer), { name: 'Sample partner', handle: '@sample', platform: 'YouTube', code: 'sample-10' });
    expect(a.code).toBe('SAMPLE10');
    expect(await code(addAffiliate(deps(), as(writer), { name: 'Other', code: 'SAMPLE10' }))).toBe('CODE_TAKEN');
    expect(await code(addAffiliate(deps(), as(writer), { name: 'Other', code: 'x' }))).toBe('INVALID_INPUT');
    const coupon = await t.prisma.coupon.create({ data: { storeId: A, code: 'REAL5', kind: 'PERCENT', value: {} } });
    expect(await code(addAffiliate(deps(), as(writer), { name: 'Third', code: 'WRONG5', couponId: coupon.id }))).toBe('INVALID_INPUT');
    expect((await addAffiliate(deps(), as(writer), { name: 'Third', code: 'REAL5', couponId: coupon.id, commissionPct: 12.5 })).code).toBe('REAL5');
  });

  it('counts only delivered orders with the code, past the hold; a returned parcel earns nothing', async () => {
    await order('SAMPLE10', 'DELIVERED', '2026-11-01T06:00:00Z');
    await order('SAMPLE10', 'DELIVERED', '2026-11-11T06:00:00Z');
    await order('SAMPLE10', 'RETURNED', '2026-11-02T06:00:00Z');
    await order('SAMPLE10', 'IN_TRANSIT', null);
    await order('OTHER', 'DELIVERED', '2026-11-01T06:00:00Z');
    const b = await affiliateBoard(deps(), as(reader));
    const p = b.list.find((x) => x.codes[0]?.code === 'SAMPLE10')!;
    expect(p).toMatchObject({ earnedMinor: 18000, onHoldMinor: 9000, dueMinor: 9000, paidMinor: 0, deliveredOrders: 2, commissionPct: 10, own: false });
    expect(b.list.find((x) => x.codes[0]?.code === 'REAL5')).toMatchObject({ commissionPct: 12.5, own: true, earnedMinor: 0 });
    expect(b.totals.dueMinor).toBe(9000);
  });

  it('another shop sees nothing of it', async () => {
    const other = { ...deps() };
    await settings.set('marketing.affiliates', { enabled: true, commissionPct: 10, holdDays: 7, payoutsOn: false } as never, storeTarget(B), { actorId: null, reason: 'test' });
    const u = await t.prisma.staffUser.create({ data: { email: 'af-b@example.com', displayName: 'b', passwordHash: 'not-a-login' } });
    const role = await createRole(t.prisma, SYSTEM, { key: 'af-b', nameEn: 'b', nameBn: 'b', permissions: ['rules.read'] as never });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: B } });
    expect((await affiliateBoard(other, { actor: { staffUserId: u.id }, storeId: B })).list).toEqual([]);
  });

  it('Pay is off as shipped; on, it needs the money key, never pays more than is owed, writes a cost line and a ledger row', async () => {
    const a = (await affiliateBoard(deps(), as(reader))).list.find((x) => x.codes[0]?.code === 'SAMPLE10')!;
    expect(await code(recordAffiliatePayout(deps(), as(accounts), { affiliateId: a.id, amountMinor: 1000, method: 'bKash' }))).toBe('PAYOUTS_OFF');
    await set({ payoutsOn: true });
    expect(await code(recordAffiliatePayout(deps(), as(writer), { affiliateId: a.id, amountMinor: 1000, method: 'bKash' }))).toBe('FORBIDDEN');
    expect(await code(recordAffiliatePayout(deps(), as(accounts), { affiliateId: a.id, amountMinor: 9001, method: 'bKash' }))).toBe('TOO_MUCH');
    const p = await recordAffiliatePayout(deps(), as(accounts), { affiliateId: a.id, amountMinor: 4000, method: 'bKash' });
    const cost = await t.prisma.costEntry.findFirstOrThrow({ where: { storeId: A, service: 'AFFILIATE' } });
    expect(cost).toMatchObject({ amountMinor: 4000, refType: 'affiliate_payout' });
    expect((await affiliateBoard(deps(), as(reader))).list.find((x) => x.id === a.id)).toMatchObject({ paidMinor: 4000, dueMinor: 5000 });
    // a correction is a negative row; the first row stays as it was; it can be reversed once
    const r = await reverseAffiliatePayout(deps(), as(accounts), p.id);
    expect(await t.prisma.affiliatePayout.findMany({ where: { storeId: A }, orderBy: { createdAt: 'asc' }, select: { amountMinor: true, reversesId: true } })).toEqual([
      { amountMinor: 4000, reversesId: null },
      { amountMinor: -4000, reversesId: p.id },
    ]);
    expect(r.id).not.toBe(p.id);
    expect(await code(reverseAffiliatePayout(deps(), as(accounts), p.id))).toBe('CONFLICT');
    expect((await affiliateBoard(deps(), as(reader))).list.find((x) => x.id === a.id)).toMatchObject({ paidMinor: 0, dueMinor: 9000 });
    // a payout with nothing due
    const real = (await affiliateBoard(deps(), as(reader))).list.find((x) => x.codes[0]?.code === 'REAL5')!;
    expect(await code(recordAffiliatePayout(deps(), as(accounts), { affiliateId: real.id, amountMinor: 100, method: 'bKash' }))).toBe('NOTHING_DUE');
  });

  it('pauses and archives a partner, never deletes; the audit log has each change', async () => {
    const a = (await affiliateBoard(deps(), as(reader))).list[0]!;
    await setAffiliateStatus(deps(), as(writer), { id: a.id, status: 'PAUSED' });
    expect((await affiliateBoard(deps(), as(reader))).list.find((x) => x.id === a.id)?.status).toBe('PAUSED');
    await setAffiliateStatus(deps(), as(writer), { id: a.id, status: 'ARCHIVED' });
    expect((await affiliateBoard(deps(), as(reader))).list.find((x) => x.id === a.id)).toBeUndefined();
    expect(await t.prisma.affiliate.count({ where: { id: a.id } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { storeId: A, action: { startsWith: 'affiliate.' } } })).toBeGreaterThanOrEqual(5);
  });
});
