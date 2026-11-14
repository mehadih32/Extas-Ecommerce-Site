// S28 · PR 711 — Couriers › Claims & payouts on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): every claim of every
// courier in one list, the figures counted once, filters by courier / state / date, practice claims only while practice mode is on,
// the money side only for someone who may see payments, and nothing written. Pure parts run everywhere. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { ageInDays, claimFigures, claimsOverview, OVERVIEW_STATUS, statusWhere, type ClaimLite, type Who } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const NOW = new Date('2026-11-10T00:00:00Z');
const DAY = 86_400_000;
const lite = (o: Partial<ClaimLite> & Pick<ClaimLite, 'status'>): ClaimLite => ({ courierAccountId: 'c1', claimedMinor: 1_000, settledMinor: null, deadlineAt: null, ...o });

describe('PR 711 · pure figures', () => {
  it('counts each claim once: open, sent, won, lost, late and due soon, per courier', () => {
    const f = claimFigures(
      [
        lite({ status: 'OPEN', claimedMinor: 1_000, deadlineAt: new Date(NOW.getTime() - DAY) }),
        lite({ status: 'SENT', claimedMinor: 2_000, deadlineAt: new Date(NOW.getTime() + 2 * DAY) }),
        lite({ status: 'SETTLED', claimedMinor: 3_000, settledMinor: 2_500, courierAccountId: 'c2' }),
        lite({ status: 'SETTLED', claimedMinor: 400, settledMinor: 0, courierAccountId: 'c2' }),
        lite({ status: 'REJECTED', claimedMinor: 500, courierAccountId: 'c2' }),
      ],
      NOW,
      5,
    );
    expect(f.open).toEqual({ count: 1, claimedMinor: 1_000 });
    expect(f.sent).toEqual({ count: 1, claimedMinor: 2_000 });
    expect(f.won).toEqual({ count: 1, claimedMinor: 3_000, paidMinor: 2_500 });
    expect(f.lost).toEqual({ count: 2, claimedMinor: 900 });
    expect(f.late).toEqual({ count: 1, claimedMinor: 1_000 });
    expect(f.soon).toEqual({ count: 1, claimedMinor: 2_000 });
    const total = f.open.count + f.sent.count + f.won.count + f.lost.count;
    expect(total).toBe(5);
    expect(f.byCourier.map((c) => [c.courierAccountId, c.claims, c.open.claimedMinor, c.paidMinor])).toEqual([['c1', 2, 3_000, 0], ['c2', 3, 0, 2_500]]);
  });
  it('age is whole days and never negative; every state filter has a where', () => {
    expect(ageInDays(new Date(NOW.getTime() - 3.9 * DAY), NOW)).toBe(3);
    expect(ageInDays(new Date(NOW.getTime() + DAY), NOW)).toBe(0);
    for (const s of OVERVIEW_STATUS) expect(statusWhere(s)).toBeTypeOf('object');
    expect(statusWhere('all')).toEqual({});
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 711 · claims overview', () => {
  let f: PaymentsFixture;
  let desk: Who;
  let viewer: Who;
  let a: string;
  let b: string;
  let n = 0;
  const claim = async (courier: string, over: Record<string, unknown>) => {
    n += 1;
    const order = await f.order({ number: `O-711-${n}`, status: 'DELIVERED', lines: [100_000] });
    const s = await f.shipment(order.id, { courierAccountId: courier, consignmentId: `CN-711-${n}`, status: 'DELIVERED', codAmountMinor: 100_000 });
    return f.t.prisma.courierClaim.create({ data: { storeId: f.A, courierAccountId: courier, orderId: order.id, shipmentId: s.id, kind: 'LOST', claimedMinor: 10_000, idempotencyKey: `k-711-${n}`, ...over } as never });
  };

  beforeAll(async () => {
    f = await setUpPayments('payments_711');
    const p = f.t.prisma;
    const mk = async (key: string, permissions: string[]) => {
      const role = await createRole(p, { staffUserId: null }, { key, nameEn: key, nameBn: key, permissions: permissions as never });
      const u = await p.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.A } });
      return { actor: { staffUserId: u.id }, storeId: f.A } as Who;
    };
    desk = await mk('desk-711', ['delivery.read', 'payments.view']);
    viewer = await mk('view-711', ['delivery.read']);
    a = (await f.courier('Steadfast 711')).id;
    b = (await f.courier('Pathao 711')).id;
    await claim(a, { status: 'OPEN', createdAt: new Date('2026-11-01T00:00:00Z') });
    await claim(a, { status: 'SENT', claimedMinor: 20_000, createdAt: new Date('2026-11-03T00:00:00Z') });
    await claim(b, { status: 'SETTLED', claimedMinor: 30_000, settledMinor: 25_000, closedAt: new Date('2026-11-08T00:00:00Z'), createdAt: new Date('2026-11-02T00:00:00Z') });
    await claim(b, { status: 'REJECTED', claimedMinor: 5_000, kind: 'DAMAGED' });
    await claim(b, { status: 'OPEN', claimedMinor: 7_000, isPractice: true });
    await p.courierSettlement.create({ data: { storeId: f.A, courierAccountId: a, reference: 'S-711', totalCodMinor: 90_000, chargesMinor: 10_000, netMinor: 80_000, receivedAt: new Date('2026-11-05T00:00:00Z'), status: 'IMPORTED' } });
    f.clock.now = new Date('2026-11-10T00:00:00Z');
  });
  afterAll(async () => f?.t.drop());

  it('lists every courier\'s claims with their figures; practice claims stay out while practice mode is off', async () => {
    const o = await claimsOverview(f.deps(), desk);
    expect(o.rows).toHaveLength(4);
    expect(o.rows.some((r) => r.practice)).toBe(false);
    expect(o.figures.open).toEqual({ count: 1, claimedMinor: 10_000 });
    expect(o.figures.sent).toEqual({ count: 1, claimedMinor: 20_000 });
    expect(o.figures.won).toEqual({ count: 1, claimedMinor: 30_000, paidMinor: 25_000 });
    expect(o.figures.lost.count).toBe(1);
    expect(o.rows.find((r) => r.outcome === 'won')).toMatchObject({ courier: 'Pathao 711', ageDays: 6 });
    expect(o.rows.find((r) => r.status === 'OPEN')).toMatchObject({ courier: 'Steadfast 711', ageDays: 9 });
  });

  it('practice claims count once practice mode is on, marked as practice', async () => {
    f.overrides.set('practice.enabled', { on: true });
    const o = await claimsOverview(f.deps(), desk);
    expect(o.rows).toHaveLength(5);
    expect(o.rows.filter((r) => r.practice)).toHaveLength(1);
    expect(o.figures.open.count).toBe(2);
    f.overrides.delete('practice.enabled');
  });

  it('filters by courier, state, kind and the day raised; the figures ignore the state filter', async () => {
    expect((await claimsOverview(f.deps(), desk, { courierAccountId: a })).rows).toHaveLength(2);
    const won = await claimsOverview(f.deps(), desk, { status: 'won' });
    expect(won.rows.map((r) => r.status)).toEqual(['SETTLED']);
    expect(won.figures.open.count).toBe(1);
    expect((await claimsOverview(f.deps(), desk, { status: 'lost' })).total).toBe(1);
    expect((await claimsOverview(f.deps(), desk, { kind: 'DAMAGED' })).total).toBe(1);
    const range = await claimsOverview(f.deps(), desk, { from: new Date('2026-11-02T00:00:00Z'), to: new Date('2026-11-04T00:00:00Z') });
    expect(range.rows).toHaveLength(2);
  });

  it('pages by the owner\'s size', async () => {
    f.overrides.set('delivery.courier.claimsPage', { claimRows: 5, payoutRows: 12 });
    const o = await claimsOverview(f.deps(), desk, { page: 9 });
    expect(o).toMatchObject({ page: 1, pages: 1, pageSize: 5 });
    f.overrides.delete('delivery.courier.claimsPage');
  });

  it('the money side: what each courier holds, was paid, and owes; only with payments.view', async () => {
    const o = await claimsOverview(f.deps(), desk);
    const steadfast = o.money!.couriers.find((c) => c.courier === 'Steadfast 711')!;
    expect(steadfast).toMatchObject({ paidMinor: 80_000, claimsMinor: 30_000 });
    expect(steadfast.owedMinor).toBe(steadfast.holdsMinor + 30_000);
    expect(o.money!.totals.claimsMinor).toBe(30_000);
    expect((await claimsOverview(f.deps(), viewer)).money).toBeNull();
  });

  it('writes nothing', async () => {
    const before = await f.t.prisma.courierClaim.count();
    await claimsOverview(f.deps(), desk);
    expect(await f.t.prisma.courierClaim.count()).toBe(before);
  });
});
