// PR 183 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout,
// booked with Steadfast on its practice world; skipped without TEST_DATABASE_ADMIN_URL): a defective or missing piece
// at packing raises a card and holds the order (from confirmed or from picking) in one step; the card is decided by a
// person — the piece found, another size, the rest sent (a paid order's refund only a request), the order cancelled —
// each through the order service, and the packing hold is released when no card is left; nothing is ever cancelled by
// itself; SIM-F-006: a balance below zero raises a shortage card that stops packing and the booking. Every value is a
// made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { evaluateShortages } from '@extas/inventory';
import { confirmOrder } from '@extas/orders';
import { bookOrders, callAboutIssue, checkPiece, markPacked, packingOrder, packingQueue, reportIssue, resolveIssue, startPicking } from './index';
import { setUpShipping, type ShippingFixture } from './testing';
import type { Who } from './context';

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 183 · defective or out of stock at packing (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  let packer: Who;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  const d = () => f.shippingDeps();
  let n = 0;
  const phone = () => `0170000${String(1830 + ++n).padStart(4, '0')}`;
  const confirmed = async (name: string, opts: Parameters<ShippingFixture['place']>[1] = {}) => {
    const o = await f.place(name, { phone: phone(), ...opts });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    return o;
  };
  const order = (orderId: string) => db().order.findUniqueOrThrow({ where: { id: orderId } });
  const lineOf = (orderId: string, variantId?: string) => db().orderItem.findFirstOrThrow({ where: { orderId, status: 'ACTIVE', ...(variantId ? { variantId } : {}) } });

  beforeAll(async () => {
    f = await setUpShipping('shipping_packing_issues');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
    const p = f.t.prisma;
    const role = await createRole(p, SYSTEM, { key: 'test-packer', nameEn: 'packer', nameBn: 'packer', permissions: ['fulfilment.read', 'fulfilment.pack'] });
    const u = await p.staffUser.create({ data: { email: 'packer@example.com', displayName: 'Packer', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    packer = { actor: { staffUserId: u.id }, storeId: f.S };
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('a damaged piece raises a card and holds the order from picking in one step; "found it" closes it and the hold is released', async () => {
    const o = await confirmed('pi-damaged');
    await startPicking(d(), packer, o.orderId);
    const line = await lineOf(o.orderId);
    const v = await reportIssue(d(), packer, o.orderId, { lineId: line.id, kind: 'DAMAGED', note: 'Torn seam' });
    expect(v).toMatchObject({ status: 'ON_HOLD', step: 'pack', openIssues: [expect.objectContaining({ kind: 'DAMAGED', orderItemId: line.id, overdue: false })] });
    expect(await order(o.orderId)).toMatchObject({ status: 'ON_HOLD', holdFromStatus: 'PROCESSING', holdReasonCode: 'defective-item' });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.hold' } });
    expect(ev.data).toMatchObject({ packingIssue: { kind: 'DAMAGED', lineId: line.id } });
    // one open card per line; the held order stays on its step, with the card
    expect(await refusal(reportIssue(d(), packer, o.orderId, { lineId: line.id, kind: 'NOT_FOUND' }))).toBe('ISSUE_OPEN');
    expect((await packingQueue(d(), packer, { step: 'pack' })).rows.find((r) => r.orderId === o.orderId)).toMatchObject({ status: 'ON_HOLD', openIssues: 1 });
    expect(await refusal(markPacked(d(), packer, o.orderId))).toBe('ILLEGAL_TRANSITION');
    expect(await refusal(reportIssue(d(), f.looker, o.orderId, { lineId: line.id, kind: 'DAMAGED' }))).toBe('FORBIDDEN');

    // answer 41: nothing happens by itself — two days later the card is only marked late
    f.clock.now = new Date(f.clock.now.getTime() + 49 * 3_600_000);
    expect((await packingOrder(d(), packer, o.orderId)).openIssues[0]).toMatchObject({ overdue: true });
    expect(await order(o.orderId)).toMatchObject({ status: 'ON_HOLD' });

    const issue = await db().packingIssue.findFirstOrThrow({ where: { orderId: o.orderId } });
    const call = await callAboutIssue(d(), packer, o.orderId, issue.id, { note: 'Ask about the seam' });
    expect(call.created).toBe(true);
    expect(await callAboutIssue(d(), packer, o.orderId, issue.id)).toEqual({ callTaskId: call.callTaskId, created: false });
    expect(await db().callTask.findUniqueOrThrow({ where: { id: call.callTaskId } })).toMatchObject({ reason: 'PACKING_ISSUE', status: 'OPEN' });

    const r = await resolveIssue(d(), packer, o.orderId, issue.id, { decision: 'STOCK_FOUND', note: 'Another piece on the shelf' });
    expect(r).toMatchObject({ decision: 'STOCK_FOUND', result: null, released: true, refundRequestIds: [] });
    expect(await order(o.orderId)).toMatchObject({ status: 'PROCESSING', holdFromStatus: null });
    expect(await db().packingIssue.findUniqueOrThrow({ where: { id: issue.id } })).toMatchObject({ resolution: 'STOCK_FOUND', resolvedById: packer.actor.staffUserId });
    expect(await refusal(resolveIssue(d(), packer, o.orderId, issue.id, { decision: 'STOCK_FOUND' }))).toBe('ISSUE_DECIDED');
    expect(await db().auditLog.count({ where: { action: { in: ['packing.issue.report', 'packing.issue.resolve', 'packing.issue.call'] }, entityId: issue.id } })).toBe(3);
  });

  it('another size through the order\'s edit: the old scans no longer count, the card closes and the hold is released', async () => {
    const o = await confirmed('pi-swap', { lines: [{ variantId: f.v.skyM }] });
    const line = await lineOf(o.orderId);
    await checkPiece(d(), packer, o.orderId, { code: line.sku });
    await reportIssue(d(), packer, o.orderId, { lineId: line.id, kind: 'NOT_FOUND' });
    expect(await order(o.orderId)).toMatchObject({ status: 'ON_HOLD', holdFromStatus: 'CONFIRMED', holdReasonCode: 'waiting-stock' });
    const issue = await db().packingIssue.findFirstOrThrow({ where: { orderId: o.orderId } });
    // the swap is the order's edit: a packer without `orders.edit` cannot, and nothing changed
    expect(await refusal(resolveIssue(d(), packer, o.orderId, issue.id, { decision: 'SWAP_SIZE', variantId: f.v.skyL }))).toBe('FORBIDDEN');
    expect(await refusal(resolveIssue(d(), f.shipper, o.orderId, issue.id, { decision: 'SWAP_SIZE' }))).toBe('INVALID_INPUT');
    const r = await resolveIssue(d(), f.shipper, o.orderId, issue.id, { decision: 'SWAP_SIZE', variantId: f.v.skyL });
    expect(r).toMatchObject({ decision: 'SWAP_SIZE', released: true, result: { command: 'edit' } });
    const after = await lineOf(o.orderId);
    expect(after).toMatchObject({ id: line.id, variantId: f.v.skyL });
    expect(r.order).toMatchObject({ status: 'CONFIRMED', allChecked: false, openIssues: [] });
    expect(r.order!.lines[0]).toMatchObject({ sku: after.sku, checked: 0 });
  });

  it('the rest is sent (a paid order\'s refund only a request), or the whole order cancelled; never by itself', async () => {
    const o = await confirmed('pi-rest', { lines: [{ variantId: f.v.skyM }, { variantId: f.v.teeM }] });
    // paid in full (made up): taking a piece off owes money back
    await db().order.update({ where: { id: o.orderId }, data: { paidMinor: (await order(o.orderId)).totalMinor } });
    await startPicking(d(), packer, o.orderId);
    const tee = await lineOf(o.orderId, f.v.teeM);
    // the owner's switch off: a card without a hold
    f.overrides.set('fulfilment.packing.issues', { holdOrder: false, damagedReasonKey: 'defective-item', missingReasonKey: 'waiting-stock', decideWithinHours: 48, editReasonKey: 'customer-asked' });
    try {
      await reportIssue(d(), packer, o.orderId, { lineId: tee.id, kind: 'NOT_FOUND' });
      expect(await order(o.orderId)).toMatchObject({ status: 'PROCESSING' });
    } finally {
      f.overrides.delete('fulfilment.packing.issues');
    }
    const issue = await db().packingIssue.findFirstOrThrow({ where: { orderId: o.orderId } });
    // an order picked already is held for the edit and comes back to picking after it
    const r = await resolveIssue(d(), f.shipper, o.orderId, issue.id, { decision: 'SHIP_REST' });
    expect(r).toMatchObject({ decision: 'SHIP_REST', released: true });
    expect(await order(o.orderId)).toMatchObject({ status: 'PROCESSING' });
    expect(await db().orderItem.findUniqueOrThrow({ where: { id: tee.id } })).toMatchObject({ status: 'REMOVED' });
    // the paid piece taken off: a refund REQUEST only (PR 172's flow, the owner approves); no money moved
    const refunds = await db().refund.findMany({ where: { orderId: o.orderId } });
    expect(refunds.length).toBeGreaterThanOrEqual(1);
    expect(refunds.every((x) => x.status === 'REQUESTED' && !x.completedAt)).toBe(true);

    const c = await confirmed('pi-cancel');
    const cl = await lineOf(c.orderId);
    await reportIssue(d(), packer, c.orderId, { lineId: cl.id, kind: 'DAMAGED' });
    const ci = await db().packingIssue.findFirstOrThrow({ where: { orderId: c.orderId } });
    expect(await refusal(resolveIssue(d(), packer, c.orderId, ci.id, { decision: 'CANCEL_ORDER' }))).toBe('FORBIDDEN');
    expect(await order(c.orderId)).toMatchObject({ status: 'ON_HOLD' });
    const x = await resolveIssue(d(), f.shipper, c.orderId, ci.id, { decision: 'CANCEL_ORDER', note: 'Last piece torn' });
    expect(x).toMatchObject({ decision: 'CANCEL_ORDER', released: false, result: { status: 'CANCELLED' } });
    expect(await order(c.orderId)).toMatchObject({ status: 'CANCELLED', cancelReasonCode: 'OUT_OF_STOCK' });
  });

  it('SIM-F-006: a balance below zero raises a shortage card that stops packing and the booking until a person decides', async () => {
    const o = await confirmed('pi-short', { lines: [{ variantId: f.v.teeM }] });
    const line = await lineOf(o.orderId);
    await db().stockLevel.updateMany({ where: { variantId: f.v.teeM }, data: { available: 0 } });
    const run = await evaluateShortages({ db: db(), settings: f.deps().settings, connections: { use: async () => { throw new Error('no ERP in this test'); } } }, { skus: [line.sku] });
    expect(run.raised).toBeGreaterThanOrEqual(1);
    const v = await checkPiece(d(), packer, o.orderId, { code: line.sku });
    expect(v).toMatchObject({ allChecked: true, blocked: 'PACKING_ISSUE_OPEN', openIssues: [expect.objectContaining({ kind: 'SHORTAGE', orderItemId: line.id })] });
    expect(await refusal(markPacked(d(), packer, o.orderId))).toBe('PACKING_ISSUE_OPEN');
    const booked = await bookOrders(d(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    expect(booked.results[0]).toMatchObject({ outcome: 'skipped', code: 'SHORTAGE_OPEN' });
    // "the stock was there" on a shortage card is a stock difference: the stock count permission decides it
    const card = await db().packingIssue.findFirstOrThrow({ where: { orderId: o.orderId, kind: 'SHORTAGE' } });
    expect(await refusal(resolveIssue(d(), packer, o.orderId, card.id, { decision: 'STOCK_FOUND' }))).toBe('FORBIDDEN');
    expect(await order(o.orderId)).toMatchObject({ status: 'CONFIRMED' });
  });
});
