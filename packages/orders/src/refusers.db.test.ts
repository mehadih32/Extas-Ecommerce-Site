// PR 163 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): repeat refusers, reversible by hand. The list
// shows nothing until the owner sets how many refusals count, and counts them as the phone history does (an our-fault
// refusal never counts). The owner (`risk.refuser.terms`) chooses terms per case with a reason; a new choice ends the old
// one, "End" keeps the row. Off as shipped: a new order is untouched. Switched on, a new order from the number (or the
// same identity under another number) is marked once and its advance proposal is the terms — a person sends it; COD,
// the status and the money never change by themselves. "Nothing" writes nothing. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import type { Key } from '@extas/settings';
import { registry, riskRulesSettings } from '@extas/settings';
import { advanceRequestView, endRefuserTerms, linkIdentity, REFUSER_EVENT, REFUSER_FLAG, refusers, refuserTermsOnOrder, saveRefusers, setRefuserTerms, type OrdersDeps } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 163 · repeat refusers (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const d = () => {
    const base = f.ordersDeps();
    return { ...base, settings: { value: base.settings.value.bind(base.settings), set: async (k: Key, v: unknown) => void f.overrides.set(k, v) } } as OrdersDeps & { settings: OrdersDeps['settings'] & { set: (k: Key, v: unknown) => Promise<void> } };
  };
  const set = (v: Partial<(typeof registry)['risk.refusers']['default']>) => f.overrides.set('risk.refusers', { ...registry['risk.refusers'].default, ...v });
  /** Test data: an earlier parcel that came back refused, for the courier's reason (an our-fault one never counts). */
  async function refused(name: string, phone: string, reasonCode: string | null = 'changed-mind', address?: string) {
    const o = await f.place(name, { phone, ...(address ? { address } : {}) });
    await db().order.update({ where: { id: o.orderId }, data: { status: 'RETURNED' } });
    await db().orderEvent.create({ data: { storeId: f.S, orderId: o.orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode, actorType: 'COURIER', source: 'courier' } });
    return o;
  }

  beforeAll(async () => {
    f = await setUpOrders('refusers');
    await refused('rf-a1', '01700000701');
    await refused('rf-a2', '+8801700000701');
    await refused('rf-a3', '01700000701', 'late');
    await refused('rf-b1', '01700000702');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the list shows nothing until the number is set; then the numbers at or above it, counted as the history counts', async () => {
    expect(registry['risk.refusers'].default).toEqual({ enabled: false, minRefused: null });
    expect((await refusers(f.ordersDeps(), f.staff)).candidates).toEqual([]);
    expect(await code(refusers(f.ordersDeps(), f.reader))).toBe('FORBIDDEN');
    set({ minRefused: 2 });
    const v = await refusers(f.ordersDeps(), f.staff);
    // three came back for 0701, but "late" is our fault: two count; 0702 has one
    expect(v.candidates).toEqual([expect.objectContaining({ phone: '+8801700000701', refused: 2, orders: 3, terms: null })]);
    set({ minRefused: 3 });
    expect((await refusers(f.ordersDeps(), f.staff)).candidates).toEqual([]);
    set({ minRefused: 1 });
    expect((await refusers(f.ordersDeps(), f.staff)).candidates.map((c) => c.phone)).toEqual(['+8801700000701', '+8801700000702']);
  });

  it('the owner chooses terms with a reason; the same again changes nothing; a new choice ends the old one; End keeps the row', async () => {
    expect(await code(setRefuserTerms(f.ordersDeps(), f.reader, { phone: '01700000701', terms: 'full', reason: 'refused two parcels' }))).toBe('FORBIDDEN');
    expect(await code(setRefuserTerms(f.ordersDeps(), f.staff, { phone: '01700000701', terms: 'cancel', reason: 'refused two parcels' }))).toBe('INVALID_INPUT');
    expect(await code(setRefuserTerms(f.ordersDeps(), f.staff, { phone: '01700000701', terms: 'full', reason: 'no' }))).toBe('INVALID_INPUT');
    const v = await setRefuserTerms(f.ordersDeps(), f.staff, { phone: '01700-000701', terms: 'delivery', reason: 'refused two parcels' });
    expect(v.active).toEqual([expect.objectContaining({ phone: '+8801700000701', terms: 'delivery', refusedAtDecision: 2, decidedBy: 'Orders Staff', endedAt: null })]);
    expect(v.candidates.find((c) => c.phone === '+8801700000701')).toMatchObject({ terms: 'delivery' });
    expect(await code(setRefuserTerms(f.ordersDeps(), f.staff, { phone: '+8801700000701', terms: 'delivery', reason: 'the same again' }))).toBe('NOTHING_CHANGED');
    const w = await setRefuserTerms(f.ordersDeps(), f.staff, { phone: '01700000701', terms: 'codOff', reason: 'refused again, no COD now' });
    expect(w.active).toEqual([expect.objectContaining({ terms: 'codOff' })]);
    expect(w.ended).toEqual([expect.objectContaining({ terms: 'delivery', endReason: 'refused again, no COD now', endedBy: 'Orders Staff' })]);
    const b = await setRefuserTerms(f.ordersDeps(), f.staff, { phone: '01700000702', terms: 'none', reason: 'a good customer otherwise' });
    const id = b.active.find((r) => r.phone === '+8801700000702')!.id;
    expect(await code(endRefuserTerms(f.ordersDeps(), f.reader, id, { reason: 'decided again' }))).toBe('FORBIDDEN');
    const e = await endRefuserTerms(f.ordersDeps(), f.staff, id, { reason: 'decided again' });
    expect(e.active.map((r) => r.phone)).toEqual(['+8801700000701']);
    expect(await code(endRefuserTerms(f.ordersDeps(), f.staff, id, { reason: 'decided again' }))).toBe('NOTHING_CHANGED');
    expect(await code(endRefuserTerms(f.ordersDeps(), f.staff, 'not-an-id', { reason: 'decided again' }))).toBe('NOT_FOUND');
    expect(await db().refuserTerm.count()).toBe(3);
    expect(await db().auditLog.count({ where: { action: 'risk.refuser.terms' } })).toBe(3);
    expect(await db().auditLog.count({ where: { action: 'risk.refuser.end' } })).toBe(1);
  });

  it('off as shipped: a new order from the number is untouched', async () => {
    set({ enabled: false, minRefused: 1 });
    const o = await f.place('rf-off', { phone: '01700000701' });
    expect(await refuserTermsOnOrder(f.ordersDeps(), ref(o.orderId))).toBeNull();
    expect((await advanceRequestView(f.ordersDeps(), f.S, o.orderId))!.proposed).toBeNull();
  });

  it('on: marked once, the terms become the proposal a person sends; status, payment method and money untouched', async () => {
    set({ enabled: true, minRefused: 1 });
    const o = await f.place('rf-on', { phone: '01700000701' });
    const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true, paymentMethod: true, totalMinor: true, deliveryChargeMinor: true } });
    expect(await refuserTermsOnOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ terms: 'codOff', via: 'phone', auto: null });
    expect(await refuserTermsOnOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ terms: 'codOff' });
    const row = await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true, paymentMethod: true, totalMinor: true, deliveryChargeMinor: true, flags: true } });
    expect({ status: row.status, paymentMethod: row.paymentMethod, totalMinor: row.totalMinor, deliveryChargeMinor: row.deliveryChargeMinor }).toEqual(before);
    expect(row.flags.filter((x) => x === REFUSER_FLAG)).toHaveLength(1);
    const ev = await db().orderEvent.findMany({ where: { orderId: o.orderId, type: REFUSER_EVENT } });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.data).toMatchObject({ terms: 'codOff', ask: 'codOff', via: 'phone', reason: 'refused again, no COD now', refused: 2 });
    expect(await advanceRequestView(f.ordersDeps(), f.S, o.orderId)).toMatchObject({ proposed: 'codOff', proposedBy: 'refuser' });
    expect(await db().payment.count({ where: { orderId: o.orderId } })).toBe(0);
    // a number with "nothing" or no terms: nothing written
    await setRefuserTerms(f.ordersDeps(), f.staff, { phone: '01700000702', terms: 'none', reason: 'a good customer otherwise' });
    const n = await f.place('rf-none', { phone: '01700000702' });
    expect(await refuserTermsOnOrder(f.ordersDeps(), ref(n.orderId))).toBeNull();
    const clean = await f.place('rf-clean', { phone: '01700000709' });
    expect(await refuserTermsOnOrder(f.ordersDeps(), ref(clean.orderId))).toBeNull();
  });

  it('the same person under another number: the terms follow the identity, even after the identities merged', async () => {
    f.overrides.set('risk.identity', { ...riskRulesSettings['risk.identity'].default, enabled: true });
    set({ enabled: true, minRefused: 1 });
    const addr = 'House 4, Road 7, Uttara 11, Dhaka';
    const a = await refused('rf-id-a', '01700000711', 'changed-mind', addr);
    await linkIdentity(f.ordersDeps(), ref(a.orderId));
    await setRefuserTerms(f.ordersDeps(), f.staff, { phone: '01700000711', terms: 'full', reason: 'refused at the door' });
    expect((await refusers(f.ordersDeps(), f.staff)).active.find((r) => r.phone === '+8801700000711')).toMatchObject({ identity: true });
    // an identity merged into another after the terms were chosen is still the same person
    const t = await db().refuserTerm.findFirstOrThrow({ where: { phone: '+8801700000711', endedAt: null } });
    const other = await db().identityCluster.create({ data: { storeId: f.S } });
    await db().identityCluster.update({ where: { id: t.clusterId! }, data: { mergedIntoId: other.id } });
    await db().identityLink.updateMany({ where: { clusterId: t.clusterId! }, data: { clusterId: other.id } });
    const b = await f.place('rf-id-b', { phone: '01700000712', address: addr });
    await linkIdentity(f.ordersDeps(), ref(b.orderId));
    expect(await refuserTermsOnOrder(f.ordersDeps(), ref(b.orderId))).toMatchObject({ terms: 'full', via: 'identity' });
  });

  it('the switch and the number are saved with risk.rules.write and an audit row; a reader cannot', async () => {
    expect(await code(saveRefusers(d(), f.reader, { value: { enabled: true, minRefused: 2 } }))).toBe('FORBIDDEN');
    expect(await code(saveRefusers(d(), f.staff, { value: { enabled: true, minRefused: 0 } }))).toBe('INVALID_INPUT');
    const v = await saveRefusers(d(), f.staff, { value: { enabled: false, minRefused: 3 } });
    expect(v.value).toEqual({ enabled: false, minRefused: 3 });
    expect(await db().auditLog.count({ where: { action: 'risk.refusers.save' } })).toBe(1);
  });
});
