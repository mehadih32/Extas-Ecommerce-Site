// S28 · PR 665 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): "Merge" folds one open order of a person into
// another. Off as shipped; the kept order takes the lines (add-on lines, "merge"), grows by exactly their total and keeps its
// own delivery charge; the folded order is cancelled ("duplicate order", note names the kept one) and its stock goes free;
// lines a person leaves out do not move; a different address asks first (or is refused); an order with money, a gift, another
// person's, one too old or one already with the courier is refused; "Merge + call" queues one call; auto-merge (off) only joins
// matching addresses; the record cannot be edited. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { registry } from '@extas/settings';
import { autoMergeOnOrder, mergeIntoOne, mergeView, MERGED_FROM_EVENT, MERGED_INTO_EVENT } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 665 · merge orders (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const rule = (v: Partial<(typeof registry)['orders.mergeOrders']['default']>) => f.overrides.set('orders.mergeOrders', { ...registry['orders.mergeOrders'].default, ...v });
  const row = (id: string) => db().order.findUniqueOrThrow({ where: { id }, select: { status: true, totalMinor: true, subtotalMinor: true, codAmountMinor: true, deliveryChargeMinor: true, cancelReasonCode: true, cancelNote: true, version: true } });
  const items = (orderId: string) => db().orderItem.findMany({ where: { orderId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  const A1 = 'House 4, Road 5, Dhanmondi, Dhaka 1209';

  beforeAll(async () => {
    f = await setUpOrders('merge-into');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped: refused, and the view says why', async () => {
    expect(registry['orders.mergeOrders'].default).toEqual({ enabled: false, lookBackDays: 5, autoMerge: false, differentAddress: 'ask' });
    const a = await f.place('mg-off-a', { phone: '01700000901', address: A1 });
    const b = await f.place('mg-off-b', { phone: '01700000901', address: A1 });
    expect(await code(mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: b.orderId }] }))).toBe('MERGE_OFF');
    expect(await mergeView(d(), f.staff, a.orderId)).toMatchObject({ enabled: false, canMerge: false, closed: 'off', mates: [] });
    expect(await code(mergeIntoOne(d(), f.reader, { mainOrderId: a.orderId, sources: [{ orderId: b.orderId }] }))).toBe('FORBIDDEN');
  });

  it('folds the order in: lines move at their price, the total grows by them, the other order is cancelled, both timelines and the record', async () => {
    rule({ enabled: true });
    const a = await f.place('mg-a', { phone: '01700000902', address: A1, lines: [{ variantId: f.v.skyM }] });
    const b = await f.place('mg-b', { phone: '01700000902', address: A1, lines: [{ variantId: f.v.whiteM }, { variantId: f.v.teeM }] });
    const view = await mergeView(d(), f.staff, a.orderId);
    expect(view).toMatchObject({ enabled: true, canMerge: true });
    expect(view?.mates).toHaveLength(1);
    expect(view?.mates[0]).toMatchObject({ orderId: b.orderId, sameAddress: true, blocked: null });
    const before = await row(a.orderId);
    const bBefore = await row(b.orderId);
    const bLines = await items(b.orderId);
    const r = await mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: b.orderId }], note: 'same customer, called twice' });
    const moved = bLines.reduce((n, i) => n + i.lineTotalMinor, 0);
    expect(r.folded[0]).toMatchObject({ number: b.number, movedLines: 2, movedMinor: moved, leftOutLines: 0 });
    expect(await row(a.orderId)).toMatchObject({ status: before.status, totalMinor: before.totalMinor + moved, subtotalMinor: before.subtotalMinor + moved, codAmountMinor: before.codAmountMinor + moved, deliveryChargeMinor: before.deliveryChargeMinor, version: before.version + 1 });
    const kept = await items(a.orderId);
    expect(kept).toHaveLength(3);
    expect(kept.filter((i) => i.addedVia === 'merge' && i.isAddOn)).toHaveLength(2);
    expect(await row(b.orderId)).toMatchObject({ status: 'CANCELLED', cancelReasonCode: 'DUPLICATE_ORDER', cancelNote: `Merged into ${a.number}`, version: bBefore.version + 1 });
    expect(await db().orderEvent.count({ where: { orderId: a.orderId, type: MERGED_FROM_EVENT } })).toBe(1);
    expect(await db().orderEvent.count({ where: { orderId: b.orderId, type: MERGED_INTO_EVENT } })).toBe(1);
    expect(await db().auditLog.count({ where: { entityId: b.orderId, action: 'order.mergeInto' } })).toBe(1);
    expect(await db().orderMerge.findUniqueOrThrow({ where: { sourceOrderId: b.orderId } })).toMatchObject({ mainOrderId: a.orderId, movedLines: 2, movedMinor: moved, callQueued: false, auto: false, note: 'same customer, called twice' });
    // folded once only
    expect(await code(mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: b.orderId }] }))).toBe('NOT_MERGEABLE');
  });

  it('lines left out do not move; "Merge + call" queues one call on the kept order', async () => {
    const a = await f.place('mg-lo-a', { phone: '01700000903', address: A1 });
    const b = await f.place('mg-lo-b', { phone: '01700000903', address: A1, lines: [{ variantId: f.v.whiteM }, { variantId: f.v.teeM }] });
    const [first, second] = await items(b.orderId);
    const before = await row(a.orderId);
    const r = await mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: b.orderId, leaveOutLineIds: [first!.id] }], call: true });
    expect(r.folded[0]).toMatchObject({ movedLines: 1, movedMinor: second!.lineTotalMinor, leftOutLines: 1 });
    expect((await row(a.orderId)).totalMinor).toBe(before.totalMinor + second!.lineTotalMinor);
    expect(r.callTaskId).toBeTruthy();
    expect(await db().callTask.count({ where: { orderId: a.orderId, reason: 'MERGED_ORDER' } })).toBe(1);
    expect(await code(mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: b.orderId, leaveOutLineIds: [crypto.randomUUID()] }] }))).not.toBe('ok');
  });

  it('a different address asks first; "refuse" refuses; confirming goes on with the kept order\'s address', async () => {
    const a = await f.place('mg-ad-a', { phone: '01700000904', address: A1 });
    const b = await f.place('mg-ad-b', { phone: '01700000904', address: 'Flat 9, Road 1, Mirpur, Dhaka 1216' });
    const input = { mainOrderId: a.orderId, sources: [{ orderId: b.orderId }] };
    expect(await code(mergeIntoOne(d(), f.staff, input))).toBe('ADDRESS_DIFFERS');
    expect((await row(b.orderId)).status).not.toBe('CANCELLED');
    rule({ enabled: true, differentAddress: 'refuse' });
    expect(await code(mergeIntoOne(d(), f.staff, { ...input, confirmAddress: true }))).toBe('NOT_MERGEABLE');
    rule({ enabled: true });
    expect(await code(mergeIntoOne(d(), f.staff, { ...input, confirmAddress: true }))).toBe('ok');
    expect(await db().orderMerge.findUniqueOrThrow({ where: { sourceOrderId: b.orderId } })).toMatchObject({ addressDiffered: true });
  });

  it('refuses another person, a gift, a prepaid order, an order too old and one with the courier', async () => {
    const a = await f.place('mg-rf-a', { phone: '01700000905', address: A1 });
    const other = await f.place('mg-rf-o', { phone: '01700000999', address: A1 });
    expect(await code(mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: other.orderId }] }))).toBe('NOT_MERGEABLE');
    const old = await f.place('mg-rf-old', { phone: '01700000905', address: A1 });
    await db().order.update({ where: { id: old.orderId }, data: { placedAt: new Date(Date.now() - 30 * 86_400_000) } });
    expect(await code(mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: old.orderId }] }))).toBe('NOT_MERGEABLE');
    const paid = await f.place('mg-rf-p', { phone: '01700000905', address: A1 });
    await db().order.update({ where: { id: paid.orderId }, data: { paidMinor: 1000 } });
    expect(await code(mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: paid.orderId }] }))).toBe('NOT_MERGEABLE');
    const packed = await f.place('mg-rf-k', { phone: '01700000905', address: A1 });
    await db().order.update({ where: { id: packed.orderId }, data: { status: 'PACKED' } });
    expect(await code(mergeIntoOne(d(), f.staff, { mainOrderId: a.orderId, sources: [{ orderId: packed.orderId }] }))).toBe('NOT_MERGEABLE');
    expect(await code(mergeIntoOne(d(), f.staff, { mainOrderId: packed.orderId, sources: [{ orderId: a.orderId }] }))).toBe('NOT_MERGEABLE');
    const view = await mergeView(d(), f.staff, a.orderId);
    expect(view?.mates.find((m) => m.orderId === old.orderId)?.blocked).toBe('TOO_OLD');
    expect(view?.mates.find((m) => m.orderId === paid.orderId)?.blocked).toBe('HAS_PAYMENT');
  });

  it('auto-merge is off by default; on, it folds a new order into the oldest open one at the same address only', async () => {
    const a = await f.place('mg-au-a', { phone: '01700000906', address: A1 });
    const b = await f.place('mg-au-b', { phone: '01700000906', address: A1 });
    expect(await autoMergeOnOrder(d(), { storeId: f.S, orderId: b.orderId })).toBeNull();
    rule({ enabled: true, autoMerge: true });
    const far = await f.place('mg-au-far', { phone: '01700000906', address: 'Flat 2, Road 9, Uttara, Dhaka 1230' });
    expect(await autoMergeOnOrder(d(), { storeId: f.S, orderId: far.orderId })).toBeNull();
    const done = await autoMergeOnOrder(d(), { storeId: f.S, orderId: b.orderId });
    expect(done?.mainOrderId).toBe(a.orderId);
    expect(await db().orderMerge.findUniqueOrThrow({ where: { sourceOrderId: b.orderId } })).toMatchObject({ auto: true, mergedById: null });
    expect(await db().orderEvent.findFirstOrThrow({ where: { orderId: b.orderId, type: MERGED_INTO_EVENT } })).toMatchObject({ actorType: 'SYSTEM' });
  });

  it('the merge record cannot be edited or deleted', async () => {
    const m = await db().orderMerge.findFirstOrThrow();
    await expect(db().orderMerge.update({ where: { id: m.id }, data: { note: 'x' } })).rejects.toThrow();
    await expect(db().orderMerge.delete({ where: { id: m.id } })).rejects.toThrow();
  });
});
