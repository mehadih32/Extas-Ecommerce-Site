// S28 · PR 664 and 687 wired to staff limits and approvals, on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the
// owner is never held; a desk role with nothing set waits; a limit set in the settings lets small entries through; the
// waiting entry becomes an approval row (kind price or cash) that remembers which entry it is for, is asked on Telegram
// only when both the gate and the Telegram kind say so, and its answer can be read back. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { approvalAnswer, askApprover, cashGate, priceAdjustGate } from './approval-gates';

describe.skipIf(!HAS_TEST_DB)('approval gates on PostgreSQL (PR 664, 687 with 702, 703)', () => {
  let t: TestDatabase;
  let A = 0;
  let owner = '';
  let desk = '';
  let resolver: SettingsResolver;
  const deps = () => ({ db: t.prisma, resolver });
  const sent: string[] = [];
  const link = { use: async () => ({ mode: 'LIVE', api: { send: async () => ({ ok: true }), sendWithButtons: async (text: string) => (sent.push(text), { ok: true, messageId: 7 }) } }) } as never;

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('gates');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: 'a long sentence for the tests', passwordChosenByOwner: true });
    owner = (await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } })).id;
    const role = await t.prisma.role.create({ data: { key: 'desk', nameEn: 'Desk', nameBn: 'ডেস্ক', isSystem: false } });
    const u = await t.prisma.staffUser.create({ data: { email: 'desk@example.com', displayName: 'Desk', passwordHash: 'x', status: 'ACTIVE' } });
    desk = u.id;
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: desk, roleId: role.id } });
  }, 120_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships ON: the owner goes through, a desk role with nothing set waits', async () => {
    expect(await priceAdjustGate(deps(), owner, A, { discountMinor: 50_000, baseMinor: 100_000 })).toEqual({ apply: true });
    expect(await priceAdjustGate(deps(), desk, A, { discountMinor: 100, baseMinor: 100_000 })).toMatchObject({ apply: false, reason: 'NO_LIMIT_SET' });
    expect(await cashGate(deps(), owner, A, { amountMinor: 9_999_999 })).toEqual({ apply: true });
    expect(await cashGate(deps(), desk, A, { amountMinor: 100 })).toMatchObject({ apply: false, reason: 'NO_LIMIT_SET' });
    expect(await priceAdjustGate(deps(), null, A, { discountMinor: 100, baseMinor: 100_000 })).toMatchObject({ apply: false });
  });

  it('a limit set in the settings lets small entries through and holds big ones', async () => {
    await resolver.set('staff.controls', { limits: { desk: { maxDiscountMinor: 5000, maxDiscountPct: null, hideContact: false } }, handover: { enabled: false, time: '21:30' } }, storeTarget(A), { actorId: owner, reason: 'test' });
    const g = await resolver.value('approvals.gates', { storeId: A });
    await resolver.set('approvals.gates', { ...g, cash: { ...g.cash, limits: { desk: 20_000 } } }, storeTarget(A), { actorId: owner, reason: 'test' });
    expect(await priceAdjustGate(deps(), desk, A, { discountMinor: 5000, baseMinor: 100_000 })).toEqual({ apply: true });
    expect(await priceAdjustGate(deps(), desk, A, { discountMinor: 5001, baseMinor: 100_000 })).toEqual({ apply: false, reason: 'OVER_AMOUNT', limit: 5000 });
    expect(await cashGate(deps(), desk, A, { amountMinor: 20_000 })).toEqual({ apply: true });
    expect(await cashGate(deps(), desk, A, { amountMinor: 20_001 })).toEqual({ apply: false, reason: 'OVER_CASH', limit: 20_000 });
  });

  it('a waiting entry becomes an approval row, asked on Telegram once both switches say so, and its answer is read back', async () => {
    const full = { ...deps(), vault: { get: async () => null } as never };
    // Telegram off: a row, no message
    let r = await askApprover(full, A, 'price', { source: 'orders.priceAdjust', title: 'Price change on SF-1', amountMinor: 7000, refType: 'OrderPriceAdjustment', refId: 'line-1' }, link);
    expect(r).toMatchObject({ ok: true, sent: false });
    expect(sent).toHaveLength(0);
    // Telegram on for price and cash
    await resolver.set('telegram.approvals', { ...(await resolver.value('telegram.approvals', { storeId: A })), enabled: true }, storeTarget(A), { actorId: owner, reason: 'test' });
    r = await askApprover(full, A, 'price', { source: 'orders.priceAdjust', title: 'Price change on SF-2', amountMinor: 7000, refType: 'OrderPriceAdjustment', refId: 'line-2' }, link);
    expect(r).toMatchObject({ ok: true, sent: true });
    const cash = await askApprover(full, A, 'cash', { source: 'money.cash', title: 'Cash out', amountMinor: 30_000, refType: 'CashEntry', refId: 'entry-1' }, link);
    expect(cash).toMatchObject({ ok: true, sent: true });
    expect(sent).toHaveLength(2);
    // the gate's own switch can keep a kind off Telegram
    const g = await resolver.value('approvals.gates', { storeId: A });
    await resolver.set('approvals.gates', { ...g, cash: { ...g.cash, askTelegram: false } }, storeTarget(A), { actorId: owner, reason: 'test' });
    expect(await askApprover(full, A, 'cash', { source: 'money.cash', title: 'Cash out', amountMinor: 1, refType: 'CashEntry', refId: 'entry-2' }, link)).toMatchObject({ ok: true, sent: false });
    expect(sent).toHaveLength(2);
    // the answer
    expect(await approvalAnswer(t.prisma, A, 'CashEntry', 'entry-1')).toBe('PENDING');
    await t.prisma.approvalRequest.updateMany({ where: { refId: 'entry-1' }, data: { status: 'APPROVED' } });
    expect(await approvalAnswer(t.prisma, A, 'CashEntry', 'entry-1')).toBe('APPROVED');
    expect(await approvalAnswer(t.prisma, A, 'CashEntry', 'nothing')).toBeNull();
  });
});
