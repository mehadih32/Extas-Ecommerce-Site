// PR 382 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// erasure requests are off until switched on; a request changes nothing; only the owner carries one out, with the word
// typed exactly, never while an order is on its way; then every profile of the person and his orders lose the
// personal details while the money stays, his sign-in is closed, and the request is done (once); review R3 (M1): his
// spoken addresses lose their words and recordings, the library rows archived. Made-up test values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER_ROLE_KEY } from '@extas/auth';
import { cancelErasure, carryOutErasure, listErasureRequests, requestErasure } from './erasure';
import { mergeCustomers } from './merge';
import { setUpCustomers, type CustomersFixture } from './testing';
import type { Who } from './context';

const A = '+8801700003821'; // hardcode-ok: made-up test numbers
const B = '+8801700003822'; // hardcode-ok: made-up test numbers
const OTHER = '+8801700003829'; // hardcode-ok: made-up test numbers
const WORD = 'ERASE';

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('erasure requests on PostgreSQL (PR 382)', () => {
  let f: CustomersFixture;
  let owner: Who;
  let a = '';
  let b = '';
  let n = 0;

  async function order(customerId: string | null, phone: string, status: 'DELIVERED' | 'IN_TRANSIT' = 'DELIVERED') {
    n += 1;
    const o = await f.t.prisma.order.create({
      data: { storeId: f.S, number: `E382-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: new Date(Date.UTC(2026, 8, n)), subtotalMinor: 1_500, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_500, paymentMethod: 'COD', customerId, phone, customerName: 'Rahim', email: 'rahim@example.com', shippingAddressText: 'House 1, Road 2', ip: '192.0.2.8', idempotencyKey: `e382-${n}` },
    });
    return o.id;
  }

  beforeAll(async () => {
    f = await setUpCustomers('customers-erasure');
    const p = f.t.prisma;
    const ownerRole = await p.role.findUniqueOrThrow({ where: { key: OWNER_ROLE_KEY } });
    const o = await p.staffUser.create({ data: { email: 'owner-382@example.com', displayName: 'Owner', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: o.id, roleId: ownerRole.id, storeId: null } });
    owner = { actor: { staffUserId: o.id }, storeId: f.S };
    a = await f.profile({ phone: A, name: 'Rahim', email: 'rahim@example.com' });
    b = await f.profile({ phone: B, name: 'Rahim 2' });
    await mergeCustomers(f.customersDeps(), f.manager, { survivorId: a, mergedId: b });
    await order(a, A);
    await order(b, B);
    await order(null, A);
    await p.customerAddress.create({ data: { storeId: f.S, customerId: b, name: 'Rahim', phone: B, addressLine: 'House 1, Road 2' } });
    await p.customerCredential.create({ data: { storeId: f.S, customerId: a, passwordHash: 'x' } });
    // PR 427: two Support inbox chat contacts of his — one linked to his profile, one only with his number
    await p.supportContact.create({ data: { storeId: f.S, channelKind: 'messenger', externalId: 'psid-382', displayName: 'Rahim FB', phone: A, customerId: a } });
    await p.supportContact.create({ data: { storeId: f.S, channelKind: 'livechat', externalId: 'visitor-382', displayName: 'Rahim', phone: B } });
    await p.supportContact.create({ data: { storeId: f.S, channelKind: 'livechat', externalId: 'visitor-other', displayName: 'Someone else', phone: OTHER } });
  });
  afterAll(async () => f?.t.drop());

  it('off until the owner switches it on; reading the list needs customers.privacy', async () => {
    const d = f.customersDeps();
    await expect(requestErasure(d, f.manager, { customerId: a, reason: 'asked by phone' })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    await expect(listErasureRequests(d, f.viewer, 10)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await listErasureRequests(d, f.manager, 10)).toEqual([]);
  });

  it('a request changes nothing, one waits per person, and can be cancelled', async () => {
    f.overrides.set('privacy.erasureRequests', true);
    const d = f.customersDeps();
    const r = await requestErasure(d, f.manager, { customerId: b, reason: 'asked by phone' });
    expect(r).toMatchObject({ customerId: a, status: 'REQUESTED' }); // filed on the person (the survivor)
    await expect(requestErasure(d, f.manager, { customerId: a, reason: 'again' })).rejects.toMatchObject({ code: 'ALREADY_REQUESTED' });
    expect((await f.t.prisma.customer.findUniqueOrThrow({ where: { id: a } })).name).toBe('Rahim');
    expect(await cancelErasure(d, f.manager, r.id)).toMatchObject({ status: 'CANCELLED' });
    await expect(cancelErasure(d, f.manager, r.id)).rejects.toMatchObject({ code: 'NOT_WAITING' });
  });

  it('only the owner, only with the word, never while an order is on its way', async () => {
    const d = f.customersDeps();
    const r = await requestErasure(d, f.manager, { customerId: a, reason: 'asked in the shop' });
    await expect(carryOutErasure(d, f.manager, { requestId: r.id, confirm: WORD, expected: WORD })).rejects.toMatchObject({ code: 'OWNER_ONLY' });
    await expect(carryOutErasure(d, owner, { requestId: r.id, confirm: 'erase it', expected: WORD })).rejects.toMatchObject({ code: 'CONFIRM_MISMATCH' });
    const moving = await order(a, A, 'IN_TRANSIT');
    await expect(carryOutErasure(d, owner, { requestId: r.id, confirm: WORD, expected: WORD })).rejects.toMatchObject({ code: 'OPEN_ORDERS', data: { open: 1 } });
    await f.t.prisma.order.update({ where: { id: moving }, data: { status: 'DELIVERED', visitorId: 'visitor-e382' } });
    // review R3 (M1): his spoken address on the order, and one from the same browser that never became an order
    const asset = (key: string) => f.t.prisma.mediaAsset.create({ data: { storeId: f.S, kind: 'AUDIO', storage: 'LOCAL_DISK', storageKey: key, mimeType: 'audio/webm', bytes: BigInt(10), checksumSha256: key, folder: 'voice' }, select: { id: true } });
    const [a1, a2, a3] = [await asset('voice/e382-1.webm'), await asset('voice/e382-2.webm'), await asset('voice/e382-3.webm')];
    const voice = (assetId: string, orderId: string | null, visitorId: string) => f.t.prisma.checkoutVoice.create({ data: { storeId: f.S, visitorId, orderId, assetId, transcript: 'House 1, Road 2', engine: 'BROWSER', lang: 'bn-BD' }, select: { id: true } });
    const onOrder = await voice(a1.id, moving, 'visitor-e382');
    const left = await voice(a2.id, null, 'visitor-e382');
    const someoneElse = await voice(a3.id, null, 'visitor-other');
    // PR 289: he is on an automation with a message waiting to go
    const j = await f.t.prisma.journey.create({ data: { storeId: f.S, name: 'Life', trigger: {}, steps: {}, enabled: true } });
    await f.t.prisma.journeyEnrollment.create({ data: { storeId: f.S, journeyId: j.id, customerId: b, status: 'ACTIVE', triggerRef: 'x' } });
    await f.t.prisma.notificationLog.create({ data: { storeId: f.S, customerId: a, channel: 'SMS', recipient: '+8801700003821', status: 'QUEUED', dedupeKey: 'crm:e382', step: 'crmJourney' } });

    const done = await carryOutErasure(d, owner, { requestId: r.id, confirm: ` ${WORD} `, expected: WORD });
    expect(done).toMatchObject({ profiles: 2, orders: 4, addresses: 1, voices: 2, request: { status: 'DONE' } });
    const p = f.t.prisma;
    for (const v of [onOrder, left]) expect(await p.checkoutVoice.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ transcript: null, assetId: null });
    expect(await p.checkoutVoice.findUniqueOrThrow({ where: { id: someoneElse.id } })).toMatchObject({ transcript: 'House 1, Road 2', assetId: a3.id });
    // the recordings' library rows stay, archived (never deleted)
    for (const x of [a1, a2]) expect(await p.mediaAsset.findUniqueOrThrow({ where: { id: x.id } })).toMatchObject({ archivedAt: expect.any(Date) });
    expect((await p.mediaAsset.findUniqueOrThrow({ where: { id: a3.id } })).archivedAt).toBeNull();
    for (const id of [a, b]) {
      expect(await p.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: null, phone: null, email: null, erasedAt: expect.any(Date), archivedAt: expect.any(Date) });
    }
    const orders = await p.order.findMany({ where: { number: { startsWith: 'E382-' } } });
    for (const o of orders) expect(o).toMatchObject({ phone: null, customerName: null, email: null, shippingAddressText: null, ip: null, totalMinor: 1_500 });
    expect(await p.customerAddress.findFirstOrThrow({ where: { customerId: b } })).toMatchObject({ name: '', phone: '', addressLine: '', archivedAt: expect.any(Date) });
    expect((await p.customerCredential.findUniqueOrThrow({ where: { customerId: a } })).passwordHash).toBe('!erased');
    for (const externalId of ['psid-382', 'visitor-382']) expect(await p.supportContact.findFirstOrThrow({ where: { externalId } })).toMatchObject({ phone: null, displayName: null });
    expect(await p.supportContact.findFirstOrThrow({ where: { externalId: 'visitor-other' } })).toMatchObject({ phone: OTHER, displayName: 'Someone else' });
    expect(await p.auditLog.count({ where: { action: 'customer.erasure.done' } })).toBe(1);
    expect(await p.journeyEnrollment.findFirstOrThrow({ where: { customerId: b } })).toMatchObject({ status: 'EXITED', reason: 'ERASED' });
    expect(await p.notificationLog.findFirstOrThrow({ where: { dedupeKey: 'crm:e382' } })).toMatchObject({ status: 'SKIPPED', reason: 'ERASED', recipient: '' });
    await expect(carryOutErasure(d, owner, { requestId: r.id, confirm: WORD, expected: WORD })).rejects.toMatchObject({ code: 'NOT_WAITING' });
    await expect(requestErasure(d, f.manager, { customerId: a, reason: 'again' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
