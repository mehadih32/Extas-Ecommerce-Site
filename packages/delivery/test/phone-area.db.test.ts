// PR 555 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL), with SAMPLE customers only. A bare phone
// number prefills the area only — the default saved address's place (else the latest), with its band — and never a
// name, house, road or postcode; an unknown number answers in the same shape. Look-ups are limited per IP (the IP is
// stored, never the number). The full saved address needs proof checked on the server: a live session of that
// customer in that store, or an ADDRESS_REVEAL code just confirmed for that number.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CustomerAuth } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { PHONE_LOOKUP_EVENT, phoneArea, savedAddressesFor } from '../src';
import { codeOf, setUp, type Fixture } from './fixture';

const PHONE = '+8801712345678';
const IP = '192.0.2.55';

describe.skipIf(!HAS_TEST_DB)('phone-first recognition on PostgreSQL (PR 555)', () => {
  let f: Fixture;
  let customerId = '';
  let auth: CustomerAuth;

  beforeAll(async () => {
    f = await setUp('delivery_phone');
    const db = f.t.prisma;
    const c = await db.customer.create({ data: { storeId: f.A, phone: PHONE, name: 'Sample Customer' } });
    customerId = c.id;
    const gabtali = await f.area('bd.rajshahi.bogura.gabtali');
    const uttara = await f.area('bd.dhaka.dhaka.uttara');
    await db.customerAddress.create({ data: { storeId: f.A, customerId, name: 'Sample Customer', phone: PHONE, addressLine: 'House 9, Road 4, Sample Para', areaId: uttara, postcode: '1230' } });
    await db.customerAddress.create({ data: { storeId: f.A, customerId, name: 'Sample Customer', phone: PHONE, addressLine: 'Sample Bari, Masterpara', areaId: gabtali, isDefault: true } });
    const session = await db.customerSession.create({ data: { storeId: f.A, customerId, tokenHash: 'sample-token-hash', expiresAt: new Date(Date.now() + 86_400_000) } });
    auth = { customer: c, session } as CustomerAuth;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('prefills the area only, from the default saved address, with its band', async () => {
    const r = await phoneArea(f.deps(), f.A, { phone: '01712-345678' }, { ip: IP });
    expect(r).toMatchObject({ enabled: true, nice: '01712-345678', area: { code: 'bd.rajshahi.bogura.gabtali', parentEn: 'Bogura' }, band: { key: 'outside-dhaka', priced: false, chargeMinor: null } });
    expect(Object.keys(r).sort()).toEqual(['area', 'band', 'enabled', 'nice', 'savedAreaId']);
    const text = JSON.stringify(r);
    for (const secret of ['Sample Customer', 'House 9', 'Road 4', 'Sample Bari', 'Masterpara', '1230', customerId]) expect(text).not.toContain(secret);
  });

  it('answers an unknown number in the same shape, and refuses what is not a mobile number', async () => {
    const r = await phoneArea(f.deps(), f.A, { phone: '01812345678' }, { ip: IP });
    expect(r).toEqual({ enabled: true, nice: '01812-345678', savedAreaId: null, area: null, band: null });
    expect(await codeOf(phoneArea(f.deps(), f.A, { phone: '01212345678' }, { ip: IP }))).toBe('INVALID_INPUT');
    expect(await codeOf(phoneArea(f.deps(), f.A, { phone: PHONE, name: 'x' }, { ip: IP }))).toBe('INVALID_INPUT');
    expect(await codeOf(phoneArea(f.deps(), 99_999, { phone: PHONE }, { ip: IP }))).toBe('NOT_FOUND');
  });

  it('limits look-ups per IP and stores the IP, never the number', async () => {
    f.overrides.set('delivery.phoneFirst.rateLimit', 3);
    const ip = '198.51.100.9';
    for (let i = 0; i < 3; i++) await phoneArea(f.deps(), f.A, { phone: PHONE }, { ip });
    expect(await codeOf(phoneArea(f.deps(), f.A, { phone: PHONE }, { ip }))).toBe('RATE_LIMITED');
    expect((await phoneArea(f.deps(), f.A, { phone: PHONE }, { ip: '198.51.100.10' })).area).not.toBeNull();
    const rows = await f.t.prisma.securityEvent.findMany({ where: { kind: PHONE_LOOKUP_EVENT } });
    expect(rows.length).toBeGreaterThan(4);
    expect(JSON.stringify(rows.map((r) => r.details))).not.toMatch(/1712345678/);
    f.overrides.delete('delivery.phoneFirst.rateLimit');
  });

  it('says nothing when the shop has it switched off', async () => {
    f.overrides.set(`delivery.phoneFirst.enabled@${f.A}`, false);
    expect(await phoneArea(f.deps(), f.A, { phone: PHONE }, { ip: IP })).toEqual({ enabled: false, nice: '01712-345678', savedAreaId: null, area: null, band: null });
    f.overrides.delete(`delivery.phoneFirst.enabled@${f.A}`);
  });

  it('opens the full address only with a live session of that customer in that store', async () => {
    const rows = await savedAddressesFor(f.deps(), f.A, { kind: 'session', auth });
    expect(rows.map((r) => [r.isDefault, r.area?.code])).toEqual([
      [true, 'bd.rajshahi.bogura.gabtali'],
      [false, 'bd.dhaka.dhaka.uttara'],
    ]);
    expect(rows[1]).toMatchObject({ addressLine: 'House 9, Road 4, Sample Para', postcode: '1230' });
    expect(await codeOf(savedAddressesFor(f.deps(), f.B, { kind: 'session', auth }))).toBe('PROOF_REQUIRED');
    const forged = { ...auth, session: { ...auth.session, id: '00000000-0000-7000-8000-000000000000' } } as CustomerAuth;
    expect(await codeOf(savedAddressesFor(f.deps(), f.A, { kind: 'session', auth: forged }))).toBe('PROOF_REQUIRED');
    await f.t.prisma.customerSession.update({ where: { id: auth.session.id }, data: { revokedAt: new Date() } });
    expect(await codeOf(savedAddressesFor(f.deps(), f.A, { kind: 'session', auth }))).toBe('PROOF_REQUIRED');
  });

  it('opens it with an ADDRESS_REVEAL code just confirmed for that number, and nothing else', async () => {
    const db = f.t.prisma;
    const otp = (data: Partial<{ purpose: 'LOGIN' | 'ADDRESS_REVEAL'; phone: string; consumedAt: Date | null }>) =>
      db.otpChallenge.create({ data: { storeId: f.A, phone: PHONE, purpose: 'ADDRESS_REVEAL', codeHash: 'sample', expiresAt: new Date(Date.now() + 600_000), consumedAt: new Date(), ...data } });
    const good = await otp({});
    expect(await savedAddressesFor(f.deps(), f.A, { kind: 'otp', challengeId: good.id, phone: '01712345678' })).toHaveLength(2);
    expect(await codeOf(savedAddressesFor(f.deps(), f.A, { kind: 'otp', challengeId: good.id, phone: '01812345678' }))).toBe('PROOF_REQUIRED');
    for (const bad of [await otp({ consumedAt: null }), await otp({ purpose: 'LOGIN' }), await otp({ consumedAt: new Date(Date.now() - 3_600_000) })]) {
      expect(await codeOf(savedAddressesFor(f.deps(), f.A, { kind: 'otp', challengeId: bad.id, phone: PHONE }))).toBe('PROOF_REQUIRED');
    }
    expect(await codeOf(savedAddressesFor(f.deps(), f.A, { kind: 'otp', challengeId: 'not-an-id', phone: PHONE }))).toBe('PROOF_REQUIRED');
  });
});
