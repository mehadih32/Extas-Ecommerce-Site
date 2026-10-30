// CN-028 · PR 612 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the hand-back desk on ERP contract v6.
// The courier hands back the returned parcels; the desk scans each consignment, counts the pieces, writes a short note
// and closes the list; it goes to the store's own (practice) ERP as `POST /return-lists`. The owner's rules: the shop
// never decides whether a piece can be sold again (no shop QC in v6); a count that differs from the ERP's starts the
// courier claim at once; a showroom return is courier HAND; a refused parcel goes again on a new list; nothing is lost
// while the ERP is down; store A's key and rows never reach store B. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { sendReturnList } from '@extas/inventory';
import { closeHandbackList, fixHandbackParcel, handbackDesk, handbackList, openHandbackList, resendRefusedParcels, scanHandbackParcel, sendHandbackList, sendWaitingHandbackLists, systemBy } from './index';
import { setUpErpOrders, type ErpFixture, type ShippedOrder } from './test/erp-v6-fixture';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 612 · the hand-back desk and the return list (PostgreSQL, ERP contract v6)', () => {
  let f: ErpFixture;
  const db = () => f.t.prisma;
  const d = () => f.erpDeps();
  const day = '2026-10-24';
  /** A billed piece the books (PR 615) would have made, on its way back. */
  const piece = async (o: ShippedOrder, lineId: string, state: 'RETURNING' | 'BILLED' = 'RETURNING') =>
    db().erpPipelinePiece.create({ data: { storeId: f.S, linkId: await f.linkId(), orderId: o.orderId, externalOrderId: o.ext, lineId, sku: 'SAMPLE', buyingPriceMinor: 90_000, state, billedOn: new Date('2026-10-23T00:00:00Z'), stateDate: new Date('2026-10-23T00:00:00Z') } });

  beforeAll(async () => {
    f = await setUpErpOrders('handback');
  });
  afterAll(async () => {
    f?.restore();
    await f?.t.drop();
  });

  it('a store still on v5 keeps the old flow: the desk is not used there', async () => {
    expect(await code(openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: day }))).toBe('ERP_MODEL');
    const desk = await handbackDesk(d(), f.staff);
    expect(desk.model).toBe('v5');
    expect(desk.couriers).toEqual(['PATHAO', 'HAND']);
  });

  it('a returned parcel: scanned, counted and sent — the ERP takes it into Return stock, the record closes, the piece waits for the owner', async () => {
    f.v6();
    const o = await f.shipped('hb-one');
    await f.returned(o);
    const pc = await piece(o, o.lineIds[0]!);
    const ret = await db().returnRecord.findFirstOrThrow({ where: { orderId: o.orderId } });
    expect(ret.status).toBe('EXPECTED');

    expect(await code(openHandbackList(d(), f.reader, { courier: 'pathao', handedBackAt: day }))).toBe('FORBIDDEN');
    const list = await openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: day });
    expect(list.status).toBe('OPEN');
    expect(list.courier).toBe('PATHAO');
    expect(list.returnListId).toBe('RL-20261024-1');

    const scanned = await scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1 });
    expect(scanned.parcels).toHaveLength(1);
    expect(scanned.parcels[0]).toMatchObject({ externalOrderId: o.ext, consignmentId: o.consignmentId, expectedCount: 1, receivedCount: 1, result: null });
    expect((await db().returnRecord.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe('RECEIVED');
    // the same parcel twice is refused (on this list or another one)
    expect(await code(scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1 }))).toBe('NOT_EXPECTED');

    const sent = await closeHandbackList(d(), f.staff, list.id);
    expect(sent.status).toBe('ACCEPTED');
    expect(sent.parcels[0]).toMatchObject({ result: 'IN_RETURN_STOCK', expectedCount: 1, countDiffers: false, claimStartedAt: null });
    expect(sent.parcels[0]!.pieces).toEqual([{ lineId: o.lineIds[0], sku: expect.any(String) }]);
    expect(sent.moved).toBe(1);
    // the ERP saw the shop's count and note under the list's own id
    expect(f.world.v6().returnLists.has('RL-20261024-1')).toBe(true);
    // the shop's part is done; the owner decides in the ERP (no QC here)
    expect((await db().returnRecord.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe('CLOSED');
    const moved = await db().erpPipelinePiece.findUniqueOrThrow({ where: { id: pc.id } });
    expect(moved.state).toBe('WAITING_CHECK');
    expect(moved.stateDate.toISOString().slice(0, 10)).toBe(day);
    expect(await db().erpPipelineMove.count({ where: { pieceId: pc.id, cause: { startsWith: 'handback:' } } })).toBe(1);
    // sending again changes nothing (the same key; an answered list is never sent again)
    expect(await code(sendHandbackList(d(), f.staff, list.id))).toBe('HANDBACK_STATE');
    expect((await sendReturnList(f.inv(), f.S, list.id)).moved).toBe(0);
    const events = await db().orderEvent.findMany({ where: { orderId: o.orderId, type: { in: ['return.handedBack', 'return.erpAnswered'] } } });
    expect(events.map((e) => e.type).sort()).toEqual(['return.erpAnswered', 'return.handedBack']);
  });

  it('a count that differs needs a note and starts the courier claim at once', async () => {
    const o = await f.shipped('hb-short', [{ variantId: f.v.skyM, quantity: 2 }]);
    await f.returned(o);
    const list = await openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: day });
    expect(list.returnListId).toBe('RL-20261024-2');
    expect(await code(scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1 }))).toBe('REASON_REQUIRED');
    await scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1, note: 'bag torn, one piece' });
    const sent = await closeHandbackList(d(), f.staff, list.id);
    expect(sent.parcels[0]).toMatchObject({ result: 'IN_RETURN_STOCK', expectedCount: 2, receivedCount: 1, countDiffers: true, note: 'bag torn, one piece' });
    expect(sent.parcels[0]!.claimStartedAt).toBe(f.clock.now.toISOString());
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'return.claimStarted' } })).toBe(1);
  });

  it('a photo of the sealed bag when the owner asks for one; counts are corrected while the list is open', async () => {
    const o = await f.shipped('hb-photo');
    await f.returned(o);
    const list = await openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: day });
    f.perStore.set(`returns.handback.photo@${f.S}`, true);
    expect(await code(scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1 }))).toBe('PHOTO_REQUIRED');
    const scanned = await scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1, photoAssetId: randomUUID() });
    f.perStore.delete(`returns.handback.photo@${f.S}`);
    expect(scanned.parcels[0]!.photoAssetId).toBeTruthy();
    const p = scanned.parcels[0]!;
    expect(await code(fixHandbackParcel(d(), f.staff, list.id, p.id, { receivedCount: 0 }))).toBe('REASON_REQUIRED');
    expect((await fixHandbackParcel(d(), f.staff, list.id, p.id, { receivedCount: 0, note: 'empty bag' })).parcels[0]).toMatchObject({ receivedCount: 0, note: 'empty bag' });
    expect((await fixHandbackParcel(d(), f.staff, list.id, p.id, { receivedCount: 1, note: 'found it' })).parcels[0]!.receivedCount).toBe(1);
    expect((await closeHandbackList(d(), f.staff, list.id)).status).toBe('ACCEPTED');
    expect(await code(fixHandbackParcel(d(), f.staff, list.id, p.id, { receivedCount: 1 }))).toBe('HANDBACK_STATE');
    expect(await code(closeHandbackList(d(), f.staff, list.id))).toBe('HANDBACK_STATE');
  });

  it('a showroom return is courier HAND, found by the order number, with no consignment', async () => {
    const o = await f.shipped('hb-hand');
    await f.returned(o);
    const list = await openHandbackList(d(), f.staff, { courier: 'hand', handedBackAt: day });
    expect(list.courier).toBe('HAND');
    const scanned = await scanHandbackParcel(d(), f.staff, list.id, { code: o.number.toLowerCase(), receivedCount: 1 });
    expect(scanned.parcels[0]).toMatchObject({ externalOrderId: o.ext, consignmentId: null });
    expect((await closeHandbackList(d(), f.staff, list.id)).parcels[0]!.result).toBe('IN_RETURN_STOCK');
  });

  it('a parcel the shop does not expect is taken only with a note; the ERP refuses it and it is sent again on a new list', async () => {
    const o = await f.shipped('hb-unexpected');
    await f.delivered(o);
    const list = await openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: day });
    expect(await code(scanHandbackParcel(d(), f.staff, list.id, { code: 'NO-SUCH-CODE', receivedCount: 1 }))).toBe('NOT_EXPECTED');
    expect(await code(scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1 }))).toBe('NOT_EXPECTED');
    expect(await code(scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1, unexpected: true }))).toBe('REASON_REQUIRED');
    await scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1, unexpected: true, note: 'courier brought it back' });
    const sent = await closeHandbackList(d(), f.staff, list.id);
    expect(sent.status).toBe('REFUSED');
    expect(sent.parcels[0]).toMatchObject({ result: 'REFUSED', reason: 'NOT_RETURNED', unexpected: true });
    expect(sent.refusedOpen).toBe(1);

    const again = await resendRefusedParcels(d(), f.staff, list.id);
    expect(again.status).toBe('OPEN');
    expect(again.resendOfId).toBe(list.id);
    expect(again.returnListId).not.toBe(list.returnListId);
    expect(again.parcels[0]).toMatchObject({ externalOrderId: o.ext, result: null, note: 'courier brought it back' });
    const old = (await handbackList(d(), f.staff, list.id))!;
    expect(old.parcels[0]!.resentInListId).toBe(again.id);
    expect(old.refusedOpen).toBe(0);
    expect(await code(resendRefusedParcels(d(), f.staff, list.id))).toBe('HANDBACK_STATE');
  });

  it('nothing is lost while the ERP is down: the list waits as SENT and goes once it is back', async () => {
    const o = await f.shipped('hb-down');
    await f.returned(o);
    const list = await openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: day });
    await scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1 });
    // every try of this send drops the connection (`erp.sync.maxAttempts` tries)
    f.world.failNext({ path: '/return-lists', network: true, times: 4 });
    const held = await closeHandbackList(d(), f.staff, list.id);
    expect(held.status).toBe('SENT');
    expect(held.error).toBeTruthy();
    expect(held.parcels[0]!.result).toBeNull();
    expect((await db().returnRecord.findFirstOrThrow({ where: { orderId: o.orderId } })).status).toBe('RECEIVED');
    const r = await sendWaitingHandbackLists(d(), f.S, systemBy('test'));
    expect(r).toEqual({ sent: 1, waiting: 0, refused: 0 });
    const done = (await handbackList(d(), f.staff, list.id))!;
    expect(done.status).toBe('ACCEPTED');
    expect(done.error).toBeNull();
    expect((await db().returnRecord.findFirstOrThrow({ where: { orderId: o.orderId } })).status).toBe('CLOSED');
  });

  it('qa-gate: the same list sent twice at once goes to the ERP once — one answer, one timeline row per parcel', async () => {
    const o = await f.shipped('hb-twice');
    await f.returned(o);
    const list = await openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: day });
    await scanHandbackParcel(d(), f.staff, list.id, { code: o.consignmentId, receivedCount: 1 });
    f.world.failNext({ path: '/return-lists', network: true, times: 4 });
    expect((await closeHandbackList(d(), f.staff, list.id)).status).toBe('SENT');
    const posts = () => f.world.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/return-lists')).length;
    const before = posts();
    // the desk's "send again" and the hourly job at the same moment
    const [a, b] = await Promise.all([sendHandbackList(d(), f.staff, list.id), sendWaitingHandbackLists(d(), f.S, systemBy('test'))]);
    expect(posts() - before).toBe(1);
    expect(a.status).toBe('ACCEPTED');
    expect(b.sent + b.waiting + b.refused).toBeLessThanOrEqual(1);
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'return.erpAnswered' } })).toBe(1);
  });

  it('CN-029 §16: store B never sees or sends store A`s parcels, and B`s own ERP does not know A`s orders', async () => {
    const o = await f.shipped('hb-iso');
    await f.returned(o);
    const listA = await openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: day });
    f.v6(f.B);
    expect(await handbackList(d(), f.staffB, listA.id)).toBeNull();
    expect(await code(scanHandbackParcel(d(), f.staffB, listA.id, { code: o.consignmentId, receivedCount: 1 }))).toBe('NOT_FOUND');
    const listB = await openHandbackList(d(), f.staffB, { courier: 'pathao', handedBackAt: day });
    expect(await code(scanHandbackParcel(d(), f.staffB, listB.id, { code: o.consignmentId, receivedCount: 1, unexpected: true, note: 'x' }))).toBe('NOT_EXPECTED');
    expect((await handbackDesk(d(), f.staffB)).open.map((l) => l.id)).toEqual([listB.id]);
    // even a row naming A's order, sent with B's own key, reaches only B's ERP company — which refuses it
    const linkB = (await db().erpReturnList.findUniqueOrThrow({ where: { id: listB.id } })).linkId;
    expect(linkB).not.toBe(await f.linkId());
    await db().erpReturnListParcel.create({ data: { storeId: f.B, returnListId: listB.id, externalOrderId: o.ext, consignmentId: o.consignmentId, receivedCount: 1 } });
    await db().erpReturnList.update({ where: { id: listB.id }, data: { status: 'SENT' } });
    const r = await sendReturnList(f.inv(), f.B, listB.id);
    expect(r.status).toBe('REFUSED');
    expect(r.parcels[0]).toMatchObject({ result: 'REFUSED', reason: 'NOT_OUR_ORDER' });
  });
});
