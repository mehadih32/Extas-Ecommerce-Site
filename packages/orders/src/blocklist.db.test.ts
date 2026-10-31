// PR 162 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the blocklist with reasons and an undo. A
// person lists a number (typed, or from an order) with a reason; a number is listed once; "Undo" keeps the row with who,
// when and why. Off as shipped: a listed number's new order is not touched. Switched on, it is marked once (flag and
// timeline), and with "hold" also held with the owner's reason; the same person under another number (the identity
// graph) is recognised. Never cancelled. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import type { Key } from '@extas/settings';
import { registry, riskRulesSettings } from '@extas/settings';
import { blocklist, BLOCKLIST_EVENT, BLOCKLIST_FLAG, blocklistOnOrder, blockNumber, linkIdentity, saveBlocklist, unblockNumber, type OrdersDeps } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 162 · the blocklist (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const d = () => {
    const base = f.ordersDeps();
    return { ...base, settings: { value: base.settings.value.bind(base.settings), set: async (k: Key, v: unknown) => void f.overrides.set(k, v) } } as OrdersDeps & { settings: OrdersDeps['settings'] & { set: (k: Key, v: unknown) => Promise<void> } };
  };
  const on = (v: Partial<(typeof registry)['risk.blocklist']['default']> = {}) => f.overrides.set('risk.blocklist', { ...registry['risk.blocklist'].default, enabled: true, ...v });

  beforeAll(async () => {
    f = await setUpOrders('blocklist');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('lists a number once with a reason and who; a short reason, a bad number or a reader is refused; Undo keeps the row', async () => {
    expect(registry['risk.blocklist'].default).toEqual({ enabled: false, onOrder: 'mark', holdReasonKey: 'risk-check' });
    expect(await code(blockNumber(f.ordersDeps(), f.reader, { phone: '01700000501', reason: 'refused three parcels' }))).toBe('FORBIDDEN');
    expect(await code(blockNumber(f.ordersDeps(), f.staff, { phone: '01700000501', reason: 'no' }))).toBe('INVALID_INPUT');
    expect(await code(blockNumber(f.ordersDeps(), f.staff, { phone: '12345', reason: 'refused three parcels' }))).toBe('INVALID_INPUT');
    const v = await blockNumber(f.ordersDeps(), f.staff, { phone: '01700-000501', reason: 'refused three parcels' });
    expect(v.active).toEqual([expect.objectContaining({ phone: '+8801700000501', reason: 'refused three parcels', blockedBy: 'Orders Staff', undoneAt: null })]);
    expect(await code(blockNumber(f.ordersDeps(), f.staff, { phone: '+8801700000501', reason: 'again, another reason' }))).toBe('ALREADY_LISTED');
    expect(await db().auditLog.count({ where: { action: 'risk.block' } })).toBe(1);
    const id = v.active[0]!.id;
    expect(await code(unblockNumber(f.ordersDeps(), f.reader, id, { reason: 'paid in advance now' }))).toBe('FORBIDDEN');
    const u = await unblockNumber(f.ordersDeps(), f.staff, id, { reason: 'paid in advance now' });
    expect(u.active).toEqual([]);
    expect(u.undone[0]).toMatchObject({ id, undoReason: 'paid in advance now', undoneBy: 'Orders Staff', reason: 'refused three parcels' });
    expect(await code(unblockNumber(f.ordersDeps(), f.staff, id, { reason: 'paid in advance now' }))).toBe('NOTHING_CHANGED');
    expect(await db().riskBlock.count()).toBe(1);
    // listed again after an undo: a new row, the old one kept
    await blockNumber(f.ordersDeps(), f.staff, { phone: '01700000501', reason: 'refused again after the undo' });
    expect(await db().riskBlock.count({ where: { phone: '+8801700000501' } })).toBe(2);
    expect((await blocklist(f.ordersDeps(), f.staff)).active).toHaveLength(1);
    // the list carries customers' numbers: a person with only "see orders" cannot read it
    expect(await code(blocklist(f.ordersDeps(), f.reader))).toBe('FORBIDDEN');
  });

  it('off as shipped: a listed number orders and nothing happens to the order', async () => {
    f.overrides.set('risk.blocklist', registry['risk.blocklist'].default);
    const o = await f.place('bl-off', { phone: '01700000501' });
    expect(await blocklistOnOrder(f.ordersDeps(), ref(o.orderId))).toBeNull();
    expect(await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true, flags: true } })).toEqual({ status: 'PLACED', flags: expect.not.arrayContaining([BLOCKLIST_FLAG]) });
  });

  it('on, "mark": the order is marked once with the listing, its status kept; an unlisted number is untouched', async () => {
    on();
    const o = await f.place('bl-mark', { phone: '01700000501' });
    expect(await blocklistOnOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ via: 'phone', hold: null });
    expect(await blocklistOnOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ via: 'phone' });
    const row = await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true, flags: true } });
    expect(row.status).toBe('PLACED');
    expect(row.flags.filter((x) => x === BLOCKLIST_FLAG)).toHaveLength(1);
    const ev = await db().orderEvent.findMany({ where: { orderId: o.orderId, type: BLOCKLIST_EVENT } });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.data).toMatchObject({ via: 'phone', reason: 'refused again after the undo', hold: null });
    const clean = await f.place('bl-clean', { phone: '01700000502' });
    expect(await blocklistOnOrder(f.ordersDeps(), ref(clean.orderId))).toBeNull();
  });

  it('on, "hold": held with the owner reason for a person, never cancelled; a missing reason only marks', async () => {
    on({ onOrder: 'hold' });
    const o = await f.place('bl-hold', { phone: '01700000501' });
    expect(await blocklistOnOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ hold: 'held' });
    expect(await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true, holdReasonCode: true } })).toEqual({ status: 'ON_HOLD', holdReasonCode: 'risk-check' });
    on({ onOrder: 'hold', holdReasonKey: 'not-on-the-list' });
    const p = await f.place('bl-noreason', { phone: '01700000501' });
    expect(await blocklistOnOrder(f.ordersDeps(), ref(p.orderId))).toMatchObject({ hold: 'NO_REASON' });
    expect((await db().order.findUniqueOrThrow({ where: { id: p.orderId }, select: { status: true } })).status).toBe('PLACED');
    expect(await db().order.count({ where: { status: 'CANCELLED' } })).toBe(0);
  });

  it('the same person under another number: listed from an order, the identity is recognised', async () => {
    f.overrides.set('risk.identity', { ...riskRulesSettings['risk.identity'].default, enabled: true });
    on();
    const a = await f.place('bl-id-a', { phone: '01700000511', address: 'House 9, Road 2, Mirpur 10, Dhaka' });
    await linkIdentity(f.ordersDeps(), ref(a.orderId));
    const v = await blockNumber(f.ordersDeps(), f.staff, { orderId: a.orderId, reason: 'a fake order, said the rider' });
    expect(v.active.find((r) => r.orderId === a.orderId)).toMatchObject({ phone: '+8801700000511', identity: true, orderNumber: a.number });
    const b = await f.place('bl-id-b', { phone: '01700000512', address: 'House 9, Road 2, Mirpur 10, Dhaka' });
    await linkIdentity(f.ordersDeps(), ref(b.orderId));
    expect(await blocklistOnOrder(f.ordersDeps(), ref(b.orderId))).toMatchObject({ via: 'identity' });
  });

  it('the switch is saved with risk.rules.write and an audit row; a reader cannot', async () => {
    expect(await code(saveBlocklist(d(), f.reader, { value: { enabled: true, onOrder: 'mark', holdReasonKey: 'risk-check' } }))).toBe('FORBIDDEN');
    expect(await code(saveBlocklist(d(), f.staff, { value: { enabled: true, onOrder: 'cancel', holdReasonKey: 'risk-check' } }))).toBe('INVALID_INPUT');
    const v = await saveBlocklist(d(), f.staff, { value: { enabled: false, onOrder: 'hold', holdReasonKey: 'risk-check' } });
    expect(v.value).toEqual({ enabled: false, onOrder: 'hold', holdReasonKey: 'risk-check' });
    expect(await db().auditLog.count({ where: { action: 'risk.blocklist.save' } })).toBe(1);
  });
});
