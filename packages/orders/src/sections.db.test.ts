// PR 541 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the moment an order lands it is placed in ONE
// section with a note on its timeline (the status untouched), a section that waits for a person opens a review, and the
// CN-017 simulation findings are its acceptance tests — SIM-F-014 (an order in review is never booked, from any
// screen: the order service refuses it and every "ready to book" list leaves it out, beside a cancelled one),
// SIM-F-015 (the identity check sees more than the phone: the same name and address under a new number, the earlier
// refusal named; many pieces on a first order) and SIM-F-020 (prepaid orders are never in the call queue; a flagged
// prepaid order is still reviewed). Nothing is cancelled, blocked or held by itself. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskMoreSettings, riskSettings } from '@extas/settings';
import { assessRisk, bookWith, confirmOrder, decideReview, listOrders, placeInSection, reassessOrder, reviewQueue, systemBy, type StoredRisk } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 541 · the risk sections (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const signals = riskSettings['risk.signals'].default;
  const score = (on: boolean) => f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: on });
  /** A first order from a new number scores `newPhone` + `addressUnsure` (the test address names a place the gazetteer has twice). */
  const newPhoneWeight = (w: number) => f.overrides.set('risk.signals', { ...signals, newPhone: { enabled: true, weight: w } });
  /** What the shop does after placing (apps/web checkout-api): the score, then the section. */
  const land = async (orderId: string) => {
    await assessRisk(f.ordersDeps(), ref(orderId));
    return placeInSection(f.ordersDeps(), ref(orderId));
  };
  const row = (orderId: string) => db().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, riskSection: true, riskBand: true, riskScore: true, version: true } });
  const ids = async (view: string, extra: Record<string, unknown> = {}) => (await listOrders(f.ordersDeps(), f.staff, { view, limit: 100, ...extra })).rows.map((r) => r.id);
  const bookTest = (orderId: string) =>
    bookWith(f.ordersDeps(), ref(orderId), systemBy('test-booking'), async (tx, o) => ({
      shipmentId: (await tx.shipment.create({ data: { storeId: o.storeId, orderId: o.id, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now }, select: { id: true } })).id,
    }));

  beforeAll(async () => {
    f = await setUpOrders('sections');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the score off: a COD order is "clear", once, with its note on the timeline; the status and version only move by the command', async () => {
    score(false);
    expect(riskMoreSettings['risk.sections'].default.enabled).toBe(true);
    const o = await f.place('sec-clear', { phone: '01700000301' });
    const r = await land(o.orderId);
    expect(r).toMatchObject({ section: 'clear', review: false, alertId: null });
    expect(await row(o.orderId)).toMatchObject({ status: 'PLACED', riskSection: 'clear', riskScore: null });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.riskSection' } });
    expect(ev).toMatchObject({ reasonCode: 'clear', actorType: 'SYSTEM', toStatus: null });
    expect(ev.data).toMatchObject({ section: 'clear', previous: null, after: 'placed', review: false });
    expect(await db().auditLog.count({ where: { entityId: o.orderId, action: 'order.riskSection' } })).toBe(1);
    // a retry of the shop's request places nothing more
    expect(await placeInSection(f.ordersDeps(), ref(o.orderId))).toBeNull();
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.riskSection' } })).toBe(1);
    // switched off: nothing is placed
    f.overrides.set('risk.sections', { ...riskMoreSettings['risk.sections'].default, enabled: false });
    const off = await f.place('sec-off', { phone: '01700000302' });
    expect(await land(off.orderId)).toBeNull();
    expect((await row(off.orderId)).riskSection).toBeNull();
    f.overrides.delete('risk.sections');
  });

  it('SIM-F-020: a prepaid order nothing flagged is never in the call queue — it waits in "prepaid"; COD stays in the call queue', async () => {
    score(false);
    const cod = await f.place('sec-cod', { phone: '01700000303' });
    const paid = await f.place('sec-paid', { phone: '01700000304', payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await land(cod.orderId);
    expect(await land(paid.orderId)).toMatchObject({ section: 'prepaid', review: false });
    const toConfirm = await ids('toConfirm');
    expect(toConfirm).toContain(cod.orderId);
    expect(toConfirm).not.toContain(paid.orderId);
    expect(await ids('prepaid')).toContain(paid.orderId);
    expect(await ids('prepaid')).not.toContain(cod.orderId);
    // it is confirmed like any other order (straight to packing, no call)
    await confirmOrder(f.ordersDeps(), f.staff, paid.orderId);
    expect((await row(paid.orderId)).status).toBe('CONFIRMED');
  });

  it('SIM-F-020: a flagged prepaid order is still reviewed — high risk waits for a person, in neither the call queue nor "prepaid"', async () => {
    score(true);
    newPhoneWeight(70);
    const o = await f.place('sec-paid-high', { phone: '01700000305', payment: { method: 'mobile', option: 'bkash' }, pay: true });
    const r = await land(o.orderId);
    expect(r).toMatchObject({ section: 'high', review: true });
    expect(r!.alertId).toBeTruthy();
    expect(await row(o.orderId)).toMatchObject({ status: 'PLACED', riskSection: 'high', riskBand: 'high' });
    expect(await ids('toConfirm')).not.toContain(o.orderId);
    expect(await ids('prepaid')).not.toContain(o.orderId);
    expect(await ids('inReview')).toContain(o.orderId);
    // marking is instant, the decision never is: it cannot be confirmed until someone decides
    await expect(confirmOrder(f.ordersDeps(), f.staff, o.orderId)).rejects.toMatchObject({ code: 'IN_REVIEW' });
    const alert = await db().fraudAlert.findUniqueOrThrow({ where: { id: r!.alertId! } });
    expect(alert).toMatchObject({ status: 'OPEN', proposedAction: 'WARN', severity: 'high' });
    expect(alert.summary).toMatchObject({ kind: 'risk', section: 'high', band: 'high' });
    // the review queue holds it beside the duplicates (follow-up 194), and by its own section
    expect((await reviewQueue(f.ordersDeps(), f.staff, {})).rows.map((x) => x.alertId)).toContain(alert.id);
    expect((await reviewQueue(f.ordersDeps(), f.staff, { section: 'high' })).rows.map((x) => [x.alertId, x.section, x.risk])).toContainEqual([alert.id, 'high', true]);
    expect((await reviewQueue(f.ordersDeps(), f.staff, { section: 'duplicate' })).rows.map((x) => x.alertId)).not.toContain(alert.id);
    // approved: it goes to confirm like any order; never cancelled or held by itself
    await decideReview(f.ordersDeps(), f.staff, alert.id, { decision: 'approve' });
    expect(await db().fraudDecision.findFirstOrThrow({ where: { alertId: alert.id } })).toMatchObject({ decision: 'risk.approve' });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.risk.approved' } })).toBe(1);
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    expect((await row(o.orderId)).status).toBe('CONFIRMED');
  });

  it('a band to watch is only marked: it stays in the call queue (watch is not in the owner\'s "wait for a person")', async () => {
    score(true);
    newPhoneWeight(30);
    const o = await f.place('sec-watch', { phone: '01700000306' });
    expect(await land(o.orderId)).toMatchObject({ section: 'watch', review: false, alertId: null });
    expect(await ids('toConfirm')).toContain(o.orderId);
    expect(await ids('toConfirm', { section: 'watch' })).toEqual([o.orderId]);
  });

  it('SIM-F-014: an order in review is never booked — the order service refuses it, "ready to book" leaves it out beside a cancelled one', async () => {
    score(true);
    newPhoneWeight(10);
    const clean = await f.place('sec-b-clean', { phone: '01700000307' });
    const held = await f.place('sec-b-held', { phone: '01700000308' });
    const gone = await f.place('sec-b-gone', { phone: '01700000309' });
    for (const o of [clean, held, gone]) {
      expect(await land(o.orderId)).toMatchObject({ section: 'clear' });
      await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    }
    await db().order.update({ where: { id: gone.orderId }, data: { status: 'CANCELLED' } });
    // the team scores `held` again with stricter rules: it moves to "high risk" and waits for a person, after confirming
    newPhoneWeight(70);
    await reassessOrder(f.ordersDeps(), f.staff, held.orderId);
    expect(await row(held.orderId)).toMatchObject({ status: 'CONFIRMED', riskSection: 'high' });
    const ready = await ids('readyToBook');
    expect(ready).toContain(clean.orderId);
    expect(ready).not.toContain(held.orderId);
    expect(ready).not.toContain(gone.orderId);
    // every screen books through the one order service: refused, and nothing is written
    await expect(bookTest(held.orderId)).rejects.toMatchObject({ code: 'IN_REVIEW' });
    await expect(bookTest(gone.orderId)).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect(await db().shipment.count({ where: { orderId: { in: [held.orderId, gone.orderId] } } })).toBe(0);
    const booked = await bookTest(clean.orderId);
    expect(booked).toMatchObject({ command: 'book', status: 'CONFIRMED' });
    expect(await ids('readyToBook')).not.toContain(clean.orderId);
    await expect(bookTest(clean.orderId)).rejects.toMatchObject({ code: 'BOOKED' });
    // decided: now it can be booked
    const alert = await db().fraudAlert.findFirstOrThrow({ where: { orderId: held.orderId, status: 'OPEN' } });
    await decideReview(f.ordersDeps(), f.staff, alert.id, { decision: 'approve' });
    expect(await ids('readyToBook')).toContain(held.orderId);
    await bookTest(held.orderId);
    // a decided review is never opened again by a later score
    await reassessOrder(f.ordersDeps(), f.staff, held.orderId);
    expect(await db().fraudAlert.count({ where: { orderId: held.orderId } })).toBe(1);
  });

  it('SIM-F-015: the same person under a new number — same name, an alike address — is "new identity", and the earlier refusal is named', async () => {
    score(true);
    f.overrides.set('risk.signals', { ...signals, identityMatch: { ...signals.identityMatch, enabled: true }, orderPieces: { enabled: true, weight: 15, atLeast: 4, firstOrderOnly: true } });
    const name = 'Rahima Khatun';
    const before = await f.place('sec-id-old', { phone: '01700000310' });
    await db().order.update({ where: { id: before.orderId }, data: { customerName: name, shippingAddressText: 'Flat 3B, House 27, Road 11, Banani, Dhaka', status: 'RETURNED' } });
    await db().orderEvent.create({ data: { storeId: f.S, orderId: before.orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode: 'changed-mind', actorType: 'COURIER', source: 'courier' } });
    // someone else's order with the same name far away is not a match
    const other = await f.place('sec-id-other', { phone: '01700000311' });
    await db().order.update({ where: { id: other.orderId }, data: { customerName: name, shippingAddressText: 'Village Charpara, Kurigram Sadar, Kurigram' } });
    const now = await f.place('sec-id-new', { phone: '01700000312', lines: [{ variantId: f.v.skyM, quantity: 2 }, { variantId: f.v.teeM, quantity: 2 }] });
    await db().order.update({ where: { id: now.orderId }, data: { customerName: 'rahima khatun ', shippingAddressText: 'Flat 3-B, House 27, Road 11, Banani Dhaka' } });
    const a = await assessRisk(f.ordersDeps(), ref(now.orderId));
    const id = a!.fired.find((x) => x.key === 'identityMatch');
    expect(id?.values).toMatchObject({ count: 1, number: before.number, refused: 1, refusedNumber: before.number });
    // the ৳7,400 first order of 4 panjabis: many pieces on a first order raises its own signal
    expect(a!.fired.find((x) => x.key === 'orderPieces')?.values).toMatchObject({ pieces: 4, atLeast: 4 });
    const r = await placeInSection(f.ordersDeps(), ref(now.orderId));
    expect(r).toMatchObject({ section: 'identity', because: ['identityMatch'], review: true });
    const alert = await db().fraudAlert.findUniqueOrThrow({ where: { id: r!.alertId! } });
    expect(alert.matchedOrderIds).toEqual([before.orderId]);
    const stored = (await db().riskAssessment.findFirstOrThrow({ where: { orderId: now.orderId } })).signals as unknown as StoredRisk;
    expect(stored.fired.map((x) => x.key)).toEqual(expect.arrayContaining(['identityMatch', 'orderPieces']));
    // decided by a person: declined after the risk review (a cancel with its reason, never a block)
    await decideReview(f.ordersDeps(), f.staff, alert.id, { decision: 'decline', note: 'Same person, refused before' });
    expect(await db().order.findUniqueOrThrow({ where: { id: now.orderId }, select: { status: true, cancelReasonCode: true } })).toEqual({ status: 'CANCELLED', cancelReasonCode: 'RISK_DECLINED' });
    f.overrides.delete('risk.signals');
  });

  it('PR 159: the same device under another number, and many numbers from one connection, put an order in "new identity"', async () => {
    score(true);
    f.overrides.set('risk.signals', { ...signals, deviceMatch: { enabled: true, weight: 20, windowDays: 90 }, ipPhones: { enabled: true, weight: 15, atLeast: 2, withinHours: 24 } });
    const device = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    const ip = '198.51.100.59';
    const a1 = await f.place('sec-dev-1', { phone: '01700000330' });
    const a2 = await f.place('sec-dev-2', { phone: '01700000331' });
    await db().order.update({ where: { id: a1.orderId }, data: { deviceId: device, ip, status: 'RETURNED' } });
    await db().order.update({ where: { id: a2.orderId }, data: { ip } });
    await db().orderEvent.create({ data: { storeId: f.S, orderId: a1.orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode: 'changed-mind', actorType: 'COURIER', source: 'courier' } });
    const now = await f.place('sec-dev-3', { phone: '01700000332' });
    await db().order.update({ where: { id: now.orderId }, data: { deviceId: device, ip } });
    const a = await assessRisk(f.ordersDeps(), ref(now.orderId));
    expect(a!.fired.find((x) => x.key === 'deviceMatch')?.values).toMatchObject({ count: 1, number: a1.number, refusedNumber: a1.number });
    expect(a!.fired.find((x) => x.key === 'ipPhones')?.values).toMatchObject({ count: 2, withinHours: 24 });
    const r = await placeInSection(f.ordersDeps(), ref(now.orderId));
    expect(r).toMatchObject({ section: 'identity', review: true });
    expect(r!.because).toEqual(expect.arrayContaining(['deviceMatch', 'ipPhones']));
    // once the purge has cleared the device and the connection, nothing matches any more
    await db().order.updateMany({ where: { id: { in: [a1.orderId, a2.orderId] } }, data: { deviceId: null, ip: null } });
    const later = await f.place('sec-dev-4', { phone: '01700000333' });
    await db().order.update({ where: { id: later.orderId }, data: { deviceId: device, ip } });
    const b = await assessRisk(f.ordersDeps(), ref(later.orderId));
    // only the order still holding them (sec-dev-3) can match now
    expect(b!.fired.find((x) => x.key === 'deviceMatch')?.values).toMatchObject({ count: 1, number: now.number });
    f.overrides.delete('risk.signals');
  });

  it('a re-order while another is open is "re-order", with the other order matched; "ask" makes a call task, "hold" needs a reason', async () => {
    score(true);
    newPhoneWeight(10);
    const phone = '01700000313';
    const first = await f.place('sec-r1', { phone });
    await land(first.orderId);
    const again = await f.place('sec-r2', { phone, lines: [{ variantId: f.v.linenM }] });
    const r = await land(again.orderId);
    expect(r).toMatchObject({ section: 'reorder', because: ['recentOrder'], review: true });
    const alert = await db().fraudAlert.findUniqueOrThrow({ where: { id: r!.alertId! } });
    expect(alert.matchedOrderIds).toEqual([first.orderId]);
    await expect(decideReview(f.ordersDeps(), f.staff, alert.id, { decision: 'hold' })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    const asked = await decideReview(f.ordersDeps(), f.staff, alert.id, { decision: 'ask' });
    expect(await db().callTask.findUniqueOrThrow({ where: { id: asked.callTaskId! } })).toMatchObject({ reason: 'RISK_CHECK', status: 'OPEN' });
    expect((await row(again.orderId)).status).toBe('PLACED');
  });

  it('follow-up 295: the list shows each row\'s band, score and section, filters by band and section and sorts the highest risk first', async () => {
    const all = await listOrders(f.ordersDeps(), f.staff, { limit: 100 });
    const high = all.rows.find((x) => x.riskSection === 'high');
    expect(high).toMatchObject({ riskBand: 'high' });
    expect(typeof high!.riskScore).toBe('number');
    expect((await ids('all', { risk: 'high' })).length).toBeGreaterThan(0);
    for (const x of (await listOrders(f.ordersDeps(), f.staff, { risk: 'high', limit: 100 })).rows) expect(x.riskBand).toBe('high');
    for (const x of (await listOrders(f.ordersDeps(), f.staff, { section: 'prepaid', limit: 100 })).rows) expect(x.riskSection).toBe('prepaid');
    // the highest score first, unscored last — and page by page with nothing missed or repeated
    const sorted = (await listOrders(f.ordersDeps(), f.staff, { sort: 'risk', limit: 100 })).rows;
    const scores = sorted.map((x) => x.riskScore);
    const firstNull = scores.indexOf(null);
    expect(firstNull).toBeGreaterThan(0);
    expect(scores.slice(firstNull).every((x) => x === null)).toBe(true);
    const scored = scores.slice(0, firstNull) as number[];
    expect([...scored].sort((a, b) => b - a)).toEqual(scored);
    const paged: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const p = await listOrders(f.ordersDeps(), f.staff, { sort: 'risk', limit: 3, ...(cursor ? { cursor } : {}) });
      paged.push(...p.rows.map((x) => x.id));
      if (!p.next) break;
      cursor = p.next;
    }
    expect(paged).toEqual(sorted.map((x) => x.id));
    await expect(listOrders(f.ordersDeps(), f.staff, { section: 'nope' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
