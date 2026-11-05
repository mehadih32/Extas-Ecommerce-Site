// PR 623 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the customer's own privacy request is off until both switches are on; it files into PR 382's list and changes
// nothing; a second tap is the same request; a copy is downloadable only after staff approve it and only for the
// owner's days; a copy request is never carried out as an erasure; staff and customer requests of one kind share the
// one waiting slot. Made-up test values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER_ROLE_KEY } from '@extas/auth';
import { carryOutErasure, listErasureRequests, requestErasure } from './erasure';
import { approveCopy, customerDataCopy, customerPrivacyState, requestFromCustomer } from './privacy-requests';
import { setUpCustomers, type CustomersFixture } from './testing';
import type { Who } from './context';

const A = '+8801700006231'; // hardcode-ok: made-up test numbers
const B = '+8801700006232'; // hardcode-ok: made-up test numbers
const DAY = 86_400_000;

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)("the customer's own privacy request on PostgreSQL (PR 623)", () => {
  let f: CustomersFixture;
  let owner: Who;
  let a = '';
  let b = '';
  const on = (extra: Record<string, unknown> = {}) => {
    f.overrides.set('privacy.erasureRequests', true);
    f.overrides.set('privacy.customerRequests', { ...base(), enabled: true, ...extra });
  };
  const base = () => ({
    enabled: false,
    kinds: ['COPY', 'ERASURE'],
    copyDays: 7,
    words: Object.fromEntries(['title', 'notice', 'copy', 'erasure'].map((k) => [k, { en: k, bn: k }])),
  });
  const ask = (customerId: string, request: unknown) => requestFromCustomer(f.customersDeps(), { storeId: f.S, customerId, request }, { ip: '192.0.2.9' });

  beforeAll(async () => {
    f = await setUpCustomers('customers-privacy-623');
    const p = f.t.prisma;
    const ownerRole = await p.role.findUniqueOrThrow({ where: { key: OWNER_ROLE_KEY } });
    const o = await p.staffUser.create({ data: { email: 'owner-623@example.com', displayName: 'Owner', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: o.id, roleId: ownerRole.id, storeId: null } });
    owner = { actor: { staffUserId: o.id }, storeId: f.S };
    a = await f.profile({ phone: A, name: 'Rahim', email: 'rahim@example.com' });
    b = await f.profile({ phone: B, name: 'Karim' });
    await p.order.create({
      data: { storeId: f.S, number: 'P623-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date(Date.UTC(2026, 9, 1)), subtotalMinor: 1_500, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_500, paymentMethod: 'COD', customerId: a, phone: A, customerName: 'Rahim', idempotencyKey: 'p623-1' },
    });
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped, and off while erasure requests are off: no card, a request is refused', async () => {
    expect(await customerPrivacyState(f.customersDeps(), { storeId: f.S, customerId: a })).toBeNull();
    await expect(ask(a, { kind: 'COPY' })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    f.overrides.set('privacy.customerRequests', { ...base(), enabled: true });
    f.overrides.set('privacy.erasureRequests', false);
    expect(await customerPrivacyState(f.customersDeps(), { storeId: f.S, customerId: a })).toBeNull();
    await expect(ask(a, { kind: 'ERASURE' })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    expect(await f.t.prisma.customerErasureRequest.count()).toBe(0);
  });

  it('files into the staff list and changes nothing; the same tap twice is one request; a kind not offered is refused', async () => {
    on({ kinds: ['ERASURE'] });
    await expect(ask(a, { kind: 'COPY' })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    await expect(ask(a, { kind: 'ERASURE', note: 'x'.repeat(501) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const first = await ask(a, { kind: 'ERASURE', note: 'Please remove me' });
    expect(first).toMatchObject({ again: false, request: { kind: 'ERASURE', status: 'REQUESTED' } });
    const second = await ask(a, { kind: 'ERASURE' });
    expect(second).toMatchObject({ again: true, request: { id: first.request.id } });
    const listed = await listErasureRequests(f.customersDeps(), f.manager, 50);
    expect(listed).toEqual([expect.objectContaining({ id: first.request.id, customerId: a, kind: 'ERASURE', source: 'CUSTOMER', reason: 'Please remove me', requestedById: null })]);
    const c = await f.t.prisma.customer.findUniqueOrThrow({ where: { id: a } });
    expect(c).toMatchObject({ name: 'Rahim', phone: A, erasedAt: null });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'customer.privacy.request', actorType: 'CUSTOMER', actorId: a } })).toBe(1);
    // staff filing the same kind for him find his request waiting
    await expect(requestErasure(f.customersDeps(), f.manager, { customerId: a, reason: 'phoned' })).rejects.toMatchObject({ code: 'ALREADY_REQUESTED' });
    // someone else's profile is never touched by his tap; an unknown or erased profile cannot ask
    await expect(ask('00000000-0000-7000-8000-000000000000', { kind: 'ERASURE' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const state = await customerPrivacyState(f.customersDeps(), { storeId: f.S, customerId: a });
    expect(state?.latest.ERASURE).toMatchObject({ status: 'REQUESTED' });
    expect(await customerPrivacyState(f.customersDeps(), { storeId: f.S, customerId: b })).toMatchObject({ latest: {} });
  });

  it('a copy: nothing to download until staff approve it, then only for the owner\'s days; never carried out as an erasure', async () => {
    on();
    const { request } = await ask(a, { kind: 'COPY' });
    await expect(customerDataCopy(f.customersDeps(), { storeId: f.S, customerId: a })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(carryOutErasure(f.customersDeps(), owner, { requestId: request.id, confirm: 'ERASE', expected: 'ERASE' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(approveCopy(f.customersDeps(), f.viewer, request.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await approveCopy(f.customersDeps(), f.manager, request.id);
    await expect(approveCopy(f.customersDeps(), f.manager, request.id)).rejects.toMatchObject({ code: 'NOT_WAITING' });
    const ready = await customerPrivacyState(f.customersDeps(), { storeId: f.S, customerId: a });
    expect(ready?.latest.COPY).toMatchObject({ status: 'READY' });
    expect(ready?.latest.COPY?.readyUntil?.getTime()).toBe(f.clock.now.getTime() + 7 * DAY);
    // Karim cannot download Rahim's copy
    await expect(customerDataCopy(f.customersDeps(), { storeId: f.S, customerId: b })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const copy = await customerDataCopy(f.customersDeps(), { storeId: f.S, customerId: a });
    expect(copy).toMatchObject({ profiles: [expect.objectContaining({ name: 'Rahim', phone: A, email: 'rahim@example.com' })], orders: [expect.objectContaining({ number: 'P623-1', totalMinor: 1_500 })] });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'customer.privacy.copy.download', actorId: a } })).toBe(1);
    // past the days: expired, nothing to download, he may ask again
    const was = f.clock.now;
    f.clock.now = new Date(was.getTime() + 8 * DAY);
    try {
      expect((await customerPrivacyState(f.customersDeps(), { storeId: f.S, customerId: a }))?.latest.COPY).toMatchObject({ status: 'EXPIRED', readyUntil: null });
      await expect(customerDataCopy(f.customersDeps(), { storeId: f.S, customerId: a })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await ask(a, { kind: 'COPY' })).toMatchObject({ again: false, request: { status: 'REQUESTED' } });
    } finally {
      f.clock.now = was;
    }
  });
});
