// PR 523 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the proposal that fills the blocklist. Off as
// shipped, and nothing is proposed until the owner sets the number. On, an order from a person with enough rejections
// (refused parcels not the shop's fault, plus the owner's counted cancels; "did not order" never counts; the same
// identity under another number counts too) proposes the number once, with what the register holds (names, addresses,
// products with dates), and marks the order — which goes on as before. A person blocks (the listing carries the facts)
// or says "Not now"; a dismissed number is proposed again only after a new rejection; a listed number is never proposed.
// Nothing is blocked by itself. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { registry, riskRulesSettings } from '@extas/settings';
import { BLOCK_PROPOSAL_EVENT, BLOCK_PROPOSED_FLAG, blockNumber, blockProposalOnOrder, blocklist, decideBlockProposal, linkIdentity, unblockNumber } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 523 · the blocklist proposal (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const set = (v: Partial<(typeof registry)['risk.blockProposal']['default']>) => f.overrides.set('risk.blockProposal', { ...registry['risk.blockProposal'].default, ...v });
  async function refused(name: string, phone: string, reasonCode: string | null = 'changed-mind', address?: string) {
    const o = await f.place(name, { phone, ...(address ? { address } : {}) });
    await db().order.update({ where: { id: o.orderId }, data: { status: 'RETURNED' } });
    await db().orderEvent.create({ data: { storeId: f.S, orderId: o.orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode, actorType: 'COURIER', source: 'courier' } });
    return o;
  }
  async function cancelled(name: string, phone: string, cancelReasonCode: string) {
    const o = await f.place(name, { phone });
    await db().order.update({ where: { id: o.orderId }, data: { status: 'CANCELLED', cancelReasonCode } });
    return o;
  }
  const row = (id: string) => db().order.findUniqueOrThrow({ where: { id }, select: { flags: true, status: true, totalMinor: true } });

  beforeAll(async () => {
    f = await setUpOrders('block_proposal');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped and nothing until the number is set', async () => {
    expect(registry['risk.blockProposal'].default).toEqual({ enabled: false, minRejections: null, cancelCodes: ['RISK_DECLINED'] });
    await refused('bp-off-1', '01700000901');
    const o = await f.place('bp-off-2', { phone: '01700000901' });
    expect(await blockProposalOnOrder(f.ordersDeps(), ref(o.orderId))).toBeNull();
    set({ enabled: true });
    expect(await blockProposalOnOrder(f.ordersDeps(), ref(o.orderId))).toBeNull();
    expect(await db().riskBlockProposal.count()).toBe(0);
  });

  it('counts refusals and the owner\'s cancels (never our fault or "did not order"); proposes once with the facts; the order goes on', async () => {
    set({ enabled: true, minRejections: 3 });
    await refused('bp-a1', '01700000911', 'changed-mind', 'House 7, Road 3, Mirpur, Dhaka');
    await refused('bp-a2', '+8801700000911', 'late'); // our fault: never counts
    await cancelled('bp-a3', '01700000911', 'NOT_ORDERED'); // someone else used the number: never counts
    await cancelled('bp-a4', '01700000911', 'RISK_DECLINED');
    const two = await f.place('bp-a5', { phone: '01700000911' });
    expect(await blockProposalOnOrder(f.ordersDeps(), ref(two.orderId))).toBeNull(); // 2 of 3
    await cancelled('bp-a6', '01700000911', 'ADVANCE_NOT_PAID');
    expect(await blockProposalOnOrder(f.ordersDeps(), ref(two.orderId))).toBeNull(); // not a counted code yet
    set({ enabled: true, minRejections: 3, cancelCodes: ['RISK_DECLINED', 'ADVANCE_NOT_PAID'] });
    const before = await row(two.orderId);
    const p = await blockProposalOnOrder(f.ordersDeps(), ref(two.orderId));
    expect(p).toMatchObject({ rejections: 3, refused: 1, declined: 2 });
    const after = await row(two.orderId);
    expect(after.flags).toContain(BLOCK_PROPOSED_FLAG);
    expect(after).toMatchObject({ status: before.status, totalMinor: before.totalMinor });
    expect(await db().orderEvent.findFirstOrThrow({ where: { orderId: two.orderId, type: BLOCK_PROPOSAL_EVENT } })).toMatchObject({ data: expect.objectContaining({ proposalId: p!.proposalId, rejections: 3 }) });
    // once per order, and one row per number
    await blockProposalOnOrder(f.ordersDeps(), ref(two.orderId));
    expect(await db().orderEvent.count({ where: { orderId: two.orderId, type: BLOCK_PROPOSAL_EVENT } })).toBe(1);
    expect(await db().riskBlockProposal.count({ where: { phone: '+8801700000911' } })).toBe(1);
    const v = await blocklist(f.ordersDeps(), f.staff);
    const prop = v.proposals.find((x) => x.id === p!.proposalId)!;
    expect(prop).toMatchObject({ phone: '+8801700000911', state: 'PROPOSED', rejections: 3, lastOrderNumber: expect.any(String) });
    expect(prop.facts.addresses).toContain('House 7, Road 3, Mirpur, Dhaka');
    expect(prop.facts.orders.length).toBeGreaterThanOrEqual(6);
    expect(prop.facts.orders[0]!.lines[0]).toMatchObject({ name: expect.any(String), qty: expect.any(Number) });
    expect(await db().riskBlock.count({ where: { phone: '+8801700000911' } })).toBe(0); // never blocked by itself
  });

  it('a person blocks (the listing carries the facts) or says "Not now"; asked again only after a new rejection', async () => {
    set({ enabled: true, minRejections: 2 });
    await refused('bp-b1', '01700000921');
    await refused('bp-b2', '01700000921');
    const o = await f.place('bp-b3', { phone: '01700000921' });
    const p = (await blockProposalOnOrder(f.ordersDeps(), ref(o.orderId)))!;
    expect(await code(decideBlockProposal(f.ordersDeps(), f.reader, p.proposalId, { decision: 'block', reason: 'refused two parcels' }))).toBe('FORBIDDEN');
    expect(await code(decideBlockProposal(f.ordersDeps(), f.staff, p.proposalId, { decision: 'block', reason: 'no' }))).toBe('INVALID_INPUT');
    const v = await decideBlockProposal(f.ordersDeps(), f.staff, p.proposalId, { decision: 'dismiss', reason: 'called him, he will pay first' });
    expect(v.decidedProposals.find((x) => x.id === p.proposalId)).toMatchObject({ state: 'DISMISSED', decisionReason: 'called him, he will pay first', decidedBy: 'Orders Staff' });
    expect(await code(decideBlockProposal(f.ordersDeps(), f.staff, p.proposalId, { decision: 'block', reason: 'refused two parcels' }))).toBe('NOTHING_CHANGED');
    // no new rejection: not asked again
    const o2 = await f.place('bp-b4', { phone: '01700000921' });
    expect(await blockProposalOnOrder(f.ordersDeps(), ref(o2.orderId))).toBeNull();
    await refused('bp-b5', '01700000921');
    const o3 = await f.place('bp-b6', { phone: '01700000921' });
    const again = (await blockProposalOnOrder(f.ordersDeps(), ref(o3.orderId)))!;
    expect(again).toMatchObject({ proposalId: p.proposalId, rejections: 3 });
    const w = await decideBlockProposal(f.ordersDeps(), f.staff, p.proposalId, { decision: 'block', reason: 'refused three parcels' });
    const listed = w.active.find((r) => r.phone === '+8801700000921')!;
    expect(listed).toMatchObject({ reason: 'refused three parcels', orderId: o3.orderId });
    expect(listed.facts!.orders.map((x) => x.number)).toContain(o3.number);
    expect(w.decidedProposals.find((x) => x.id === p.proposalId)).toMatchObject({ state: 'BLOCKED' });
    expect(await db().auditLog.count({ where: { action: { in: ['risk.blockProposal.dismiss', 'risk.blockProposal.block'] } } })).toBe(2);
    // listed: never proposed while on the list; unblocked: asked again only after a new rejection
    const o4 = await f.place('bp-b7', { phone: '01700000921' });
    expect(await blockProposalOnOrder(f.ordersDeps(), ref(o4.orderId))).toBeNull();
    await unblockNumber(f.ordersDeps(), f.staff, listed.id, { reason: 'paid in advance twice now' });
    expect(await blockProposalOnOrder(f.ordersDeps(), ref(o4.orderId))).toBeNull();
  });

  it('a number listed by hand answers its open proposal and keeps the facts; the same identity under another number counts', async () => {
    f.overrides.set('risk.identity', { ...riskRulesSettings['risk.identity'].default, enabled: true });
    set({ enabled: true, minRejections: 2 });
    const addr = 'Flat 2A, House 9, Road 4, Banani, Dhaka';
    const a = await refused('bp-c1', '01700000931', 'changed-mind', addr);
    await linkIdentity(f.ordersDeps(), ref(a.orderId));
    const b = await refused('bp-c2', '01700000932', 'changed-mind', addr);
    await linkIdentity(f.ordersDeps(), ref(b.orderId));
    const c = await f.place('bp-c3', { phone: '01700000932', address: addr });
    await linkIdentity(f.ordersDeps(), ref(c.orderId));
    const p = (await blockProposalOnOrder(f.ordersDeps(), ref(c.orderId)))!;
    expect(p).toMatchObject({ rejections: 2, refused: 2 });
    const v = await blockNumber(f.ordersDeps(), f.staff, { orderId: c.orderId, reason: 'two numbers, two refusals' });
    expect(v.active.find((r) => r.phone === '+8801700000932')!.facts!.phones).toEqual(expect.arrayContaining(['+8801700000931', '+8801700000932']));
    expect(v.decidedProposals.find((x) => x.id === p.proposalId)).toMatchObject({ state: 'BLOCKED', decisionReason: 'two numbers, two refusals' });
    // undone later: not asked again until a new rejection
    await unblockNumber(f.ordersDeps(), f.staff, v.active.find((r) => r.phone === '+8801700000932')!.id, { reason: 'paid in advance now' });
    const d = await f.place('bp-c4', { phone: '01700000932', address: addr });
    await linkIdentity(f.ordersDeps(), ref(d.orderId));
    expect(await blockProposalOnOrder(f.ordersDeps(), ref(d.orderId))).toBeNull();
    f.overrides.delete('risk.identity');
  });
});
