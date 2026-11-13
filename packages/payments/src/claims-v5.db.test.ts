// S28 · PR 673 — courier claims ledger v5 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the new kinds
// (short COD, return short: the amount is typed), the deadline (none while the owner's switch is off; the owner's days
// when on; late and due soon), what the ledger calls won and lost, and money won back handed to the books once, only
// while its own switch is on and never failing the settlement. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { claimOutcome, deadlineState, listClaims, moveClaim, PAYMENT_PERMISSIONS, raiseClaim, type Who } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe('PR 673 · pure ledger words', () => {
  it('open and sent stay; settled is won (lost when nothing was paid); rejected is lost', () => {
    expect(claimOutcome({ status: 'OPEN', settledMinor: null })).toBe('open');
    expect(claimOutcome({ status: 'SENT', settledMinor: null })).toBe('sent');
    expect(claimOutcome({ status: 'SETTLED', settledMinor: 500 })).toBe('won');
    expect(claimOutcome({ status: 'SETTLED', settledMinor: 0 })).toBe('lost');
    expect(claimOutcome({ status: 'REJECTED', settledMinor: null })).toBe('lost');
  });
  it('a deadline is late once past, due soon inside the warning days, and means nothing for a closed claim', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    const day = 86_400_000;
    expect(deadlineState({ status: 'OPEN', deadlineAt: new Date(now.getTime() - 1) }, now, 5)).toBe('late');
    expect(deadlineState({ status: 'SENT', deadlineAt: new Date(now.getTime() + 4 * day) }, now, 5)).toBe('soon');
    expect(deadlineState({ status: 'SENT', deadlineAt: new Date(now.getTime() + 6 * day) }, now, 5)).toBeNull();
    expect(deadlineState({ status: 'SENT', deadlineAt: new Date(now.getTime() + 4 * day) }, now, 0)).toBeNull();
    expect(deadlineState({ status: 'SETTLED', deadlineAt: new Date(now.getTime() - day) }, now, 5)).toBeNull();
    expect(deadlineState({ status: 'OPEN', deadlineAt: null }, now, 5)).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 673 · courier claims ledger v5', () => {
  let f: PaymentsFixture;
  let desk: Who;
  let courierId: string;
  let n = 0;
  const won: { claimId: string; amountMinor: number }[] = [];
  let hookFails = false;

  beforeAll(async () => {
    f = await setUpPayments('payments_673');
    const p = f.t.prisma;
    const role = await createRole(p, { staffUserId: null }, { key: 'test-673', nameEn: 'desk', nameBn: 'desk', permissions: [...PAYMENT_PERMISSIONS, 'delivery.read', 'delivery.claims'] });
    const u = await p.staffUser.create({ data: { email: 'desk-673@example.com', displayName: 'Desk', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.A } });
    desk = { actor: { staffUserId: u.id }, storeId: f.A };
    courierId = (await f.courier('Steadfast 673')).id;
    f.overrides.set('delivery.courier.claims', { enabled: true });
  });
  afterAll(async () => f?.t.drop());

  const deps = () => ({
    ...f.deps(),
    books: {
      claimRecovered: async (_w: Who, x: { claimId: string; amountMinor: number }) => {
        if (hookFails) throw new Error('books down');
        won.push({ claimId: x.claimId, amountMinor: x.amountMinor });
      },
    },
  });
  const parcel = async () => {
    n += 1;
    const order = await f.order({ number: `K-${n}`, status: 'DELIVERED', lines: [100_000] });
    const s = await f.shipment(order.id, { courierAccountId: courierId, consignmentId: `CN-673-${n}`, status: 'DELIVERED', codAmountMinor: 100_000 });
    return s.id;
  };
  const raise = async (kind: string, extra: Record<string, unknown> = {}) =>
    raiseClaim(deps(), desk, { shipmentId: await parcel(), kind, note: 'the courier handed in less', ...extra }, { idempotencyKey: `claim-673-${++n}-${kind}` });

  it('short COD and return short need a typed amount; the parcel need not show anything', async () => {
    expect(await code(raise('SHORT_COD'))).toBe('INVALID_INPUT');
    expect(await code(raise('RETURN_SHORT'))).toBe('INVALID_INPUT');
    expect((await raise('SHORT_COD', { amountMinor: 12_000 })).claim).toMatchObject({ kind: 'SHORT_COD', status: 'OPEN', claimedMinor: 12_000 });
    expect((await raise('RETURN_SHORT', { amountMinor: 3_000 })).claim).toMatchObject({ kind: 'RETURN_SHORT', claimedMinor: 3_000 });
  });

  it("no deadline while the owner has not switched it on; then the owner's days; late and due soon follow", async () => {
    expect((await raise('SHORT_COD', { amountMinor: 1_000 })).claim.deadlineAt).toBeNull();
    f.overrides.set('delivery.courier.claimTerms', { deadlineEnabled: true, days: 10, warnDays: 3, postRecovered: false });
    const c = (await raise('SHORT_COD', { amountMinor: 2_000 })).claim;
    expect(c.deadlineAt!.getTime() - f.clock.now.getTime()).toBe(10 * 86_400_000);
    f.clock.now = new Date(f.clock.now.getTime() + 8 * 86_400_000);
    let list = await listClaims(deps(), desk, { courierAccountId: courierId });
    expect(list.late.count).toBe(0);
    expect(list.terms).toEqual({ deadlineEnabled: true, warnDays: 3 });
    expect(deadlineState({ status: 'OPEN', deadlineAt: c.deadlineAt }, list.at, list.terms.warnDays)).toBe('soon');
    f.clock.now = new Date(f.clock.now.getTime() + 3 * 86_400_000);
    list = await listClaims(deps(), desk, { courierAccountId: courierId });
    expect(list.late).toMatchObject({ count: 1, claimedMinor: 2_000 });
    expect(deadlineState({ status: 'OPEN', deadlineAt: c.deadlineAt }, list.at, 3)).toBe('late');
  });

  it('money won back goes to the books once, only while its switch is on, and never fails the settlement', async () => {
    f.overrides.set('delivery.courier.claimTerms', { deadlineEnabled: false, days: 30, warnDays: 5, postRecovered: false });
    const a = (await raise('SHORT_COD', { amountMinor: 5_000 })).claim;
    await moveClaim(deps(), desk, a.id, { to: 'SETTLED', settledMinor: 5_000 });
    expect(won).toHaveLength(0);
    f.overrides.set('delivery.courier.claimTerms', { deadlineEnabled: false, days: 30, warnDays: 5, postRecovered: true });
    const b = (await raise('SHORT_COD', { amountMinor: 7_000 })).claim;
    expect(await moveClaim(deps(), desk, b.id, { to: 'SETTLED', settledMinor: 6_000 })).toMatchObject({ status: 'SETTLED' });
    expect(won).toEqual([{ claimId: b.id, amountMinor: 6_000 }]);
    const z = (await raise('SHORT_COD', { amountMinor: 900 })).claim;
    await moveClaim(deps(), desk, z.id, { to: 'SETTLED', settledMinor: 0 });
    expect(won).toHaveLength(1);
    hookFails = true;
    const h = (await raise('RETURN_SHORT', { amountMinor: 800 })).claim;
    expect(await moveClaim(deps(), desk, h.id, { to: 'SETTLED', settledMinor: 800 })).toMatchObject({ status: 'SETTLED' });
    hookFails = false;
  });
});
