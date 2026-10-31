// S08 · PR 192 — courier claims and rider issues on a real PostgreSQL (throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL). SIM-F-017: a lost or damaged parcel is claimed for its declared value, followed to settled
// (what the courier paid) or rejected, once per parcel and kind. CN-018 (7): a rider overcharge is logged with proof
// against what the door asked (never typed), approved with [confirm] (the courier claim for the exact extra opens) or
// rejected; asking its refund is off by default and, when on, only a REQUESTED refund the owner still approves. Nothing
// pays out. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { askRiderRefund, decideRiderIssue, listClaims, listRiderIssues, logRiderIssue, moveClaim, PAYMENT_PERMISSIONS, raiseClaim, requestRefund, type Who } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 192 · courier claims and rider issues', () => {
  let f: PaymentsFixture;
  let desk: Who;
  let courierId: string;
  let n = 0;

  beforeAll(async () => {
    f = await setUpPayments('payments_192');
    const p = f.t.prisma;
    const role = await createRole(p, { staffUserId: null }, { key: 'test-192', nameEn: 'desk', nameBn: 'desk', permissions: [...PAYMENT_PERMISSIONS, 'delivery.read', 'delivery.claims', 'support.read', 'support.riderIssues.write', 'support.riderIssues.decide'] });
    const u = await p.staffUser.create({ data: { email: 'desk-192@example.com', displayName: 'Desk', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.A } });
    desk = { actor: { staffUserId: u.id }, storeId: f.A };
    courierId = (await f.courier('Steadfast 192')).id;
  });
  afterAll(async () => f?.t.drop());

  const parcel = async (status: 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED', o: { cod?: number; declared?: number | null; event?: 'LOST' | 'DAMAGED'; lines?: number[] } = {}) => {
    n += 1;
    const order = await f.order({ number: `C-${n}`, status: status === 'IN_TRANSIT' ? 'IN_TRANSIT' : status, lines: o.lines ?? [100_000] });
    const s = await f.shipment(order.id, { courierAccountId: courierId, consignmentId: `CN-192-${n}`, status, ...(o.cod !== undefined ? { codAmountMinor: o.cod } : {}) });
    await f.t.prisma.shipment.update({ where: { id: s.id }, data: { declaredValueMinor: o.declared === undefined ? 100_000 : o.declared } });
    if (o.event) await f.t.prisma.shipmentEvent.create({ data: { storeId: f.A, shipmentId: s.id, status: o.event, occurredAt: f.clock.now, source: 'staff' } });
    return { orderId: order.id, number: order.number, shipmentId: s.id };
  };
  const photo = async () =>
    (await f.t.prisma.mediaAsset.create({ data: { storeId: f.A, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `proof/test-${++n}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(1000), checksumSha256: String(n).padStart(64, '0') } })).id;

  it('SIM-F-017: a claim is off until switched on; a lost parcel is claimed for its declared value, once', async () => {
    const lost = await parcel('IN_TRANSIT', { event: 'LOST', declared: 250_000 });
    const ask = { shipmentId: lost.shipmentId, kind: 'LOST', note: 'no movement for nine days' };
    expect(await code(raiseClaim(f.deps(), desk, ask, { idempotencyKey: 'claim-key-0001' }))).toBe('FEATURE_OFF');
    f.overrides.set('delivery.courier.claims', { enabled: true });
    expect(await code(raiseClaim(f.deps(), f.viewer, ask, { idempotencyKey: 'claim-key-0001' }))).toBe('FORBIDDEN');
    expect(await code(raiseClaim(f.deps(), desk, ask))).toBe('INVALID_INPUT');
    // a parcel whose records do not show it damaged cannot be claimed as damaged
    expect(await code(raiseClaim(f.deps(), desk, { ...ask, kind: 'DAMAGED' }, { idempotencyKey: 'claim-key-0002' }))).toBe('NOT_CLAIMABLE');
    const c = await raiseClaim(f.deps(), desk, ask, { idempotencyKey: 'claim-key-0001' });
    expect(c).toMatchObject({ replay: false, claim: { kind: 'LOST', status: 'OPEN', claimedMinor: 250_000, orderNumber: lost.number, courier: 'Steadfast 192', consignmentId: expect.stringMatching(/^CN-192-/) } });
    expect(await raiseClaim(f.deps(), desk, ask, { idempotencyKey: 'claim-key-0001' })).toMatchObject({ replay: true, claim: { id: c.claim.id } });
    expect(await code(raiseClaim(f.deps(), desk, { ...ask, kind: 'DAMAGED' }, { idempotencyKey: 'claim-key-0001' }))).toBe('IDEMPOTENCY_MISMATCH');
    expect(await code(raiseClaim(f.deps(), desk, ask, { idempotencyKey: 'claim-key-0003' }))).toBe('ALREADY_OPEN');
    expect(await f.t.prisma.orderEvent.count({ where: { orderId: lost.orderId, type: 'claim.raised' } })).toBe(1);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'claim.raise', entityId: c.claim.id } })).toBe(1);

    // no declared value: the amount must be typed
    const damaged = await parcel('RETURNED', { event: 'DAMAGED', declared: null });
    expect(await code(raiseClaim(f.deps(), desk, { shipmentId: damaged.shipmentId, kind: 'DAMAGED', note: 'box crushed' }, { idempotencyKey: 'claim-key-0004' }))).toBe('INVALID_INPUT');
    expect((await raiseClaim(f.deps(), desk, { shipmentId: damaged.shipmentId, kind: 'DAMAGED', note: 'box crushed', amountMinor: 40_000 }, { idempotencyKey: 'claim-key-0004' })).claim.claimedMinor).toBe(40_000);
  });

  it('following a claim: sent, then settled with what the courier paid (never more than claimed) or rejected with why', async () => {
    const lost = await parcel('IN_TRANSIT', { event: 'LOST', declared: 90_000 });
    const c = (await raiseClaim(f.deps(), desk, { shipmentId: lost.shipmentId, kind: 'LOST', note: 'lost at the hub' }, { idempotencyKey: 'claim-key-0101' })).claim;
    expect(await code(moveClaim(f.deps(), desk, c.id, { to: 'SETTLED' }))).toBe('INVALID_INPUT');
    expect(await moveClaim(f.deps(), desk, c.id, { to: 'SENT', courierRef: 'SF-CLM-7' })).toMatchObject({ status: 'SENT', courierRef: 'SF-CLM-7' });
    expect(await code(moveClaim(f.deps(), desk, c.id, { to: 'SENT' }))).toBe('NOT_OPEN');
    expect(await code(moveClaim(f.deps(), desk, c.id, { to: 'SETTLED', settledMinor: 90_001 }))).toBe('INVALID_INPUT');
    const s = await moveClaim(f.deps(), desk, c.id, { to: 'SETTLED', settledMinor: 60_000, note: 'courier paid two thirds' });
    expect(s).toMatchObject({ status: 'SETTLED', settledMinor: 60_000 });
    expect(s.closedAt).not.toBeNull();
    expect(await code(moveClaim(f.deps(), desk, c.id, { to: 'REJECTED', note: 'late' }))).toBe('NOT_OPEN');
    // once closed, the same parcel may be claimed again (another kind of loss found later), never two open at once
    const again = await parcel('IN_TRANSIT', { event: 'LOST', declared: 10_000 });
    const r = (await raiseClaim(f.deps(), desk, { shipmentId: again.shipmentId, kind: 'LOST', note: 'gone' }, { idempotencyKey: 'claim-key-0102' })).claim;
    expect(await code(moveClaim(f.deps(), desk, r.id, { to: 'REJECTED' }))).toBe('INVALID_INPUT');
    expect(await moveClaim(f.deps(), desk, r.id, { to: 'REJECTED', note: 'courier says it was delivered' })).toMatchObject({ status: 'REJECTED' });
    // the list: totals, and lost or damaged parcels still to claim
    const unclaimed = await parcel('IN_TRANSIT', { event: 'DAMAGED' });
    const list = await listClaims(f.deps(), desk, { courierAccountId: courierId });
    expect(list.settled).toMatchObject({ count: 1, claimedMinor: 90_000, settledMinor: 60_000 });
    expect(list.claimable.map((x) => x.shipmentId)).toContain(unclaimed.shipmentId);
    expect(list.claimable.map((x) => x.shipmentId)).not.toContain(lost.shipmentId);
    expect(await code(listClaims(f.deps(), f.viewer))).toBe('FORBIDDEN');
  });

  it('CN-018 (7): a rider issue is off until switched on, needs proof, and its due comes from the door, never typed', async () => {
    const d = await parcel('DELIVERED', { cod: 100_000 });
    const pic = await photo();
    const ask = { orderId: d.orderId, chargedMinor: 105_000, words: 'rider asked 50 taka more for the stairs', proofMediaIds: [pic] };
    expect(await code(logRiderIssue(f.deps(), desk, ask, { idempotencyKey: 'rider-key-0001' }))).toBe('FEATURE_OFF');
    f.overrides.set('support.riderIssues', { enabled: true, proofRequired: true, maxPhotos: 2, photoMaxMb: 5, refundAsk: false });
    expect(await code(logRiderIssue(f.deps(), f.viewer, ask, { idempotencyKey: 'rider-key-0001' }))).toBe('FORBIDDEN');
    expect(await code(logRiderIssue(f.deps(), desk, { ...ask, proofMediaIds: [] }, { idempotencyKey: 'rider-key-0002' }))).toBe('PROOF_REQUIRED');
    expect(await code(logRiderIssue(f.deps(), desk, { ...ask, proofMediaIds: [pic, await photo(), await photo()] }, { idempotencyKey: 'rider-key-0003' }))).toBe('INVALID_INPUT');
    expect(await code(logRiderIssue(f.deps(), desk, { ...ask, proofMediaIds: ['0190a000-0000-7000-8000-000000000000'] }, { idempotencyKey: 'rider-key-0004' }))).toBe('NOT_FOUND');
    expect(await code(logRiderIssue(f.deps(), desk, { ...ask, chargedMinor: 100_000 }, { idempotencyKey: 'rider-key-0005' }))).toBe('NO_EXTRA');
    // the door record wins over the parcel's COD amount (a partial delivery asked less)
    await f.t.prisma.codCollection.create({ data: { storeId: f.A, orderId: d.orderId, shipmentId: d.shipmentId, outcome: 'DELIVERED', expectedMinor: 100_000, collectedMinor: 100_000, source: 'test', idempotencyKey: `door-${d.number}`, occurredAt: f.clock.now } });
    const r = await logRiderIssue(f.deps(), desk, ask, { idempotencyKey: 'rider-key-0001' });
    expect(r).toMatchObject({ replay: false, issue: { status: 'LOGGED', chargedMinor: 105_000, dueMinor: 100_000, extraMinor: 5_000, proofMediaIds: [pic], orderNumber: d.number } });
    expect(await logRiderIssue(f.deps(), desk, ask, { idempotencyKey: 'rider-key-0001' })).toMatchObject({ replay: true });
    expect(await code(logRiderIssue(f.deps(), desk, ask, { idempotencyKey: 'rider-key-0006' }))).toBe('ALREADY_OPEN');
    // a parcel still on the way has no door
    const moving = await parcel('IN_TRANSIT');
    expect(await code(logRiderIssue(f.deps(), desk, { ...ask, orderId: moving.orderId }, { idempotencyKey: 'rider-key-0007' }))).toBe('NOT_FOUND');
    expect(await f.t.prisma.orderEvent.count({ where: { orderId: d.orderId, type: 'riderIssue.logged' } })).toBe(1);
  });

  it('deciding: [confirm] to approve opens the courier claim for the exact extra; a rejection needs its note; no refund is asked by itself', async () => {
    const d = await parcel('DELIVERED', { cod: 80_000 });
    const r = (await logRiderIssue(f.deps(), desk, { orderId: d.orderId, chargedMinor: 83_000, words: 'paid 30 extra', proofMediaIds: [await photo()] }, { idempotencyKey: 'rider-key-0101' })).issue;
    expect(await code(decideRiderIssue(f.deps(), f.viewer, r.id, { decision: 'approve', note: 'photo shows it', confirm: true }))).toBe('FORBIDDEN');
    expect(await code(decideRiderIssue(f.deps(), desk, r.id, { decision: 'approve', note: 'photo shows it' }))).toBe('CONFIRM_REQUIRED');
    const a = await decideRiderIssue(f.deps(), desk, r.id, { decision: 'approve', note: 'photo shows it', confirm: true });
    expect(a).toMatchObject({ status: 'APPROVED', claimId: expect.any(String), refundId: null });
    const claim = await f.t.prisma.courierClaim.findUniqueOrThrow({ where: { id: a.claimId! } });
    expect(claim).toMatchObject({ kind: 'RIDER_OVERCHARGE', status: 'OPEN', claimedMinor: 3_000, riderIssueId: r.id, shipmentId: d.shipmentId, courierAccountId: courierId });
    expect(await code(decideRiderIssue(f.deps(), desk, r.id, { decision: 'reject', note: 'again' }))).toBe('NOT_PENDING');
    // nothing was paid or asked: no refund row
    expect(await f.t.prisma.refund.count({ where: { orderId: d.orderId } })).toBe(0);
    // asking the refund is off as shipped
    expect(await code(askRiderRefund(f.deps(), desk, r.id, {}))).toBe('FEATURE_OFF');

    const d2 = await parcel('DELIVERED', { cod: 50_000 });
    const r2 = (await logRiderIssue(f.deps(), desk, { orderId: d2.orderId, chargedMinor: 51_000, words: 'says he paid more', proofMediaIds: [await photo()] }, { idempotencyKey: 'rider-key-0102' })).issue;
    expect(await code(decideRiderIssue(f.deps(), desk, r2.id, { decision: 'reject' }))).toBe('INVALID_INPUT');
    expect(await decideRiderIssue(f.deps(), desk, r2.id, { decision: 'reject', note: 'photo is of another receipt' })).toMatchObject({ status: 'REJECTED', claimId: null });
    expect(await f.t.prisma.courierClaim.count({ where: { riderIssueId: r2.id } })).toBe(0);
    const list = await listRiderIssues(f.deps(), desk, {});
    expect(list.counts).toMatchObject({ APPROVED: 1, REJECTED: 1, LOGGED: 1 });
  });

  it("asking the refund (owner's switch on): a REQUESTED refund of the exact extra, once; the owner still approves it", async () => {
    f.overrides.set('support.riderIssues', { enabled: true, proofRequired: false, maxPhotos: 3, photoMaxMb: 5, refundAsk: true });
    const d = await parcel('DELIVERED', { cod: 100_000 });
    // the courier reported the door as usual: exactly what the parcel asked
    await f.t.prisma.codCollection.create({ data: { storeId: f.A, orderId: d.orderId, shipmentId: d.shipmentId, outcome: 'DELIVERED', expectedMinor: 100_000, collectedMinor: 100_000, source: 'test', idempotencyKey: `door-${d.number}`, occurredAt: f.clock.now } });
    const r = (await logRiderIssue(f.deps(), desk, { orderId: d.orderId, chargedMinor: 104_000, words: 'rider kept the change' }, { idempotencyKey: 'rider-key-0201' })).issue;
    // not approved yet: no refund
    expect(await code(askRiderRefund(f.deps(), desk, r.id, {}))).toBe('NOT_PENDING');
    // before the approval the door records show no extra, so a refund of it is refused too
    expect(await code(requestRefund(f.deps(), desk, d.orderId, { source: 'RIDER_OVERCHARGE', amountMinor: 4_000, note: 'too early' }, { idempotencyKey: 'refund-rq-1920' }))).toBe('OVER_REFUNDABLE');
    await decideRiderIssue(f.deps(), desk, r.id, { decision: 'approve', note: 'customer sent a photo', confirm: true });
    const asked = await askRiderRefund(f.deps(), desk, r.id, {});
    const refund = await f.t.prisma.refund.findUniqueOrThrow({ where: { id: asked.refundId } });
    expect(refund).toMatchObject({ status: 'REQUESTED', amountMinor: 4_000, source: 'RIDER_OVERCHARGE', method: 'original' });
    expect(asked.issue.refundId).toBe(refund.id);
    expect((await askRiderRefund(f.deps(), desk, r.id, {})).refundId).toBe(refund.id);
    expect(await f.t.prisma.refund.count({ where: { orderId: d.orderId } })).toBe(1);
    // never more than the extra: a second refund of the overcharge is refused
    expect(await code(requestRefund(f.deps(), desk, d.orderId, { source: 'RIDER_OVERCHARGE', amountMinor: 1, note: 'one more' }, { idempotencyKey: 'refund-rq-1921' }))).toBe('OVER_REFUNDABLE');
    // the payment did not move
    expect(await f.t.prisma.walletEntry.count({ where: { orderId: d.orderId } })).toBe(0);
  });
});
