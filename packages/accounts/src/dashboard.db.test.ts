// S04 · PR 131 — My account on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL): only his
// own orders, as stored; the wallet from its ledger; Profile's addresses (archived, never deleted) and consent rows.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { accountSummary, checkoutPrefill, orderCards, profileView, saveBirthday, saveConsent, saveProfile, walletView } from './index';
import { setUpAccounts, type AccountsFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 131 · My account', () => {
  let f: AccountsFixture;
  let me: { id: string };
  let other: { id: string };

  beforeAll(async () => {
    f = await setUpAccounts('accounts_dashboard');
    me = await f.customer('+8801700000131', f.A, 'Rahim Uddin');
    other = await f.customer('+8801700000132');
  });
  afterAll(async () => f?.t.drop());

  it('the header and the order cards: his orders only, newest first, as stored', async () => {
    await f.order({ customerId: me.id, number: 'T-1001', placedAt: new Date('2026-10-20T06:00:00Z'), status: 'DELIVERED', times: { confirmedAt: new Date('2026-10-20T07:00:00Z'), deliveredAt: new Date('2026-10-22T06:00:00Z') } });
    await f.order({
      customerId: me.id,
      number: 'T-1002',
      placedAt: new Date('2026-10-22T06:00:00Z'),
      lines: [
        { name: 'A', amountMinor: 100_000, quantity: 2 },
        { name: 'B', amountMinor: 50_000 },
        { name: 'C', amountMinor: 50_000 },
        { name: 'D', amountMinor: 50_000 },
        { name: 'E', amountMinor: 50_000 },
        { name: 'Gone', amountMinor: 50_000, status: 'REMOVED' },
      ],
    });
    await f.order({ customerId: other.id, number: 'T-1003' });
    const s = await accountSummary(f.deps(), { storeId: f.A, customerId: me.id });
    expect(s).toMatchObject({ firstName: 'Rahim', phone: '01700-000131', orders: 2, walletMinor: null });
    const cards = await orderCards(f.deps(), { storeId: f.A, customerId: me.id });
    expect(cards.map((c) => c.number)).toEqual(['T-1002', 'T-1001']);
    expect(cards[0]).toMatchObject({ status: 'PLACED', items: 6, more: 1, track: { reached: 0 } });
    expect(cards[0]!.lines).toHaveLength(4);
    expect(cards[1]).toMatchObject({ status: 'DELIVERED', track: { reached: 4, done: true } });
    // a line whose variant is gone keeps its stored name and colour name (no picture colour)
    expect(cards[1]!.lines[0]).toMatchObject({ nameEn: 'Sample Polo', nameBn: null, colour: { key: '', nameEn: 'Navy' }, quantity: 1 });
    // another store's view of him has nothing
    expect(await accountSummary(f.deps(), { storeId: f.B, customerId: me.id })).toBeNull();
  });

  it('PR 135 (SIM-F-018): an order past its band promise in hours is flagged late on its card', async () => {
    const band = await f.t.prisma.deliveryBand.create({ data: { storeId: f.A, key: 'test-band', nameEn: 'Test band', chargeMinor: 0, hoursMin: 24, hoursMax: 72, enabled: true } });
    const placedAt = new Date('2026-10-20T06:00:00Z');
    await f.order({ customerId: me.id, number: 'T-1135', placedAt, status: 'HANDED_OVER', bandId: band.id, times: { confirmedAt: placedAt, packedAt: placedAt, handedOverAt: placedAt } });
    const four = await orderCards(f.deps(), { storeId: f.A, customerId: me.id, now: new Date('2026-10-24T06:00:00Z') });
    expect(four.find((c) => c.number === 'T-1135')).toMatchObject({ status: 'HANDED_OVER', late: true });
    const two = await orderCards(f.deps(), { storeId: f.A, customerId: me.id, now: new Date('2026-10-22T06:00:00Z') });
    expect(two.find((c) => c.number === 'T-1135')?.late).toBe(false);
    // a delivered order is never late, nor one whose band promises no hours
    expect(four.find((c) => c.number === 'T-1001')?.late).toBe(false);
    expect(four.find((c) => c.number === 'T-1002')?.late).toBe(false);
    // SIM-F-048: its district promises 120 hours (on): the same order is not late at four days, and late past five
    const district = await f.t.prisma.geoArea.create({ data: { level: 'DISTRICT', code: 'TEST-D-048', nameEn: 'Test district' } });
    const area = await f.t.prisma.geoArea.create({ data: { level: 'AREA', code: 'TEST-A-048', nameEn: 'Test area', parentId: district.id, ancestorIds: [district.id] } });
    await f.t.prisma.order.updateMany({ where: { number: 'T-1135' }, data: { areaId: area.id } });
    f.overrides.set('delivery.promise.districts', { enabled: true, rows: [{ district: 'TEST-D-048', hoursMin: 72, hoursMax: 120 }] });
    try {
      const own = await orderCards(f.deps(), { storeId: f.A, customerId: me.id, now: new Date('2026-10-24T06:00:00Z') });
      expect(own.find((c) => c.number === 'T-1135')?.late).toBe(false);
      const six = await orderCards(f.deps(), { storeId: f.A, customerId: me.id, now: new Date('2026-10-26T06:00:00Z') });
      expect(six.find((c) => c.number === 'T-1135')?.late).toBe(true);
    } finally {
      f.overrides.delete('delivery.promise.districts');
    }
    await f.t.prisma.order.updateMany({ where: { number: 'T-1135' }, data: { archivedAt: new Date() } });
  });

  it('the wallet: the balance and the ledger, newest first, with the order number', async () => {
    const w = await f.t.prisma.walletAccount.create({ data: { storeId: f.A, customerId: me.id, balanceMinor: 30_000, status: 'ACTIVE' } });
    const o = await f.t.prisma.order.findFirstOrThrow({ where: { number: 'T-1001' } });
    await f.t.prisma.walletEntry.create({ data: { storeId: f.A, walletId: w.id, direction: 'CREDIT', amountMinor: 50_000, balanceAfterMinor: 50_000, reason: 'EXCHANGE_CREDIT', idempotencyKey: 'a', createdAt: new Date('2026-10-21T06:00:00Z') } });
    await f.t.prisma.walletEntry.create({ data: { storeId: f.A, walletId: w.id, direction: 'DEBIT', amountMinor: 20_000, balanceAfterMinor: 30_000, reason: 'ORDER', orderId: o.id, idempotencyKey: 'b', createdAt: new Date('2026-10-22T06:00:00Z') } });
    const v = await walletView(f.deps(), { storeId: f.A, customerId: me.id });
    expect(v?.balanceMinor).toBe(30_000);
    expect(v?.entries.map((e) => [e.direction, e.amountMinor, e.orderNumber])).toEqual([
      ['DEBIT', 20_000, 'T-1001'],
      ['CREDIT', 50_000, null],
    ]);
    expect((await accountSummary(f.deps(), { storeId: f.A, customerId: me.id }))?.walletMinor).toBe(30_000);
    expect(await walletView(f.deps(), { storeId: f.A, customerId: other.id })).toBeNull();
  });

  it('Profile: name and addresses (the first is the default, a removed one archived), within the limits', async () => {
    const one = await saveProfile(f.deps(), { storeId: f.A, customerId: me.id, profile: { name: 'Rahim U', addresses: [{ line: 'House 4, Road 5, Dhanmondi' }, { line: 'Office 2, Gulshan Avenue' }, { line: '' }] } });
    expect(one.name).toBe('Rahim U');
    expect(one.addresses.map((a) => [a.line, a.isDefault])).toEqual([
      ['House 4, Road 5, Dhanmondi', true],
      ['Office 2, Gulshan Avenue', false],
    ]);
    const two = await saveProfile(f.deps(), { storeId: f.A, customerId: me.id, profile: { name: 'Rahim U', addresses: [{ id: one.addresses[1]!.id, line: 'Office 2, Gulshan Avenue' }] } });
    expect(two.addresses).toEqual([{ id: one.addresses[1]!.id, line: 'Office 2, Gulshan Avenue', isDefault: true }]);
    expect(await f.t.prisma.customerAddress.count({ where: { customerId: me.id, archivedAt: { not: null } } })).toBe(1);
    expect(await code(saveProfile(f.deps(), { storeId: f.A, customerId: me.id, profile: { name: 'R', addresses: [] } }))).toBe('INVALID_INPUT');
    expect(await code(saveProfile(f.deps(), { storeId: f.A, customerId: me.id, profile: { name: 'Rahim', addresses: [{ line: 'short' }] } }))).toBe('INVALID_INPUT');
    const four = Array.from({ length: 4 }, (_, i) => ({ line: `House ${i + 1}, Road 5, Dhanmondi` }));
    expect(await code(saveProfile(f.deps(), { storeId: f.A, customerId: me.id, profile: { name: 'Rahim', addresses: four } }))).toBe('FULL');
    // someone else's address id is never his: it is added as a new one, the other customer's stays as it was
    const theirs = await f.t.prisma.customerAddress.create({ data: { storeId: f.A, customerId: other.id, name: 'x', phone: 'x', addressLine: 'Their house, their road' } });
    await saveProfile(f.deps(), { storeId: f.A, customerId: me.id, profile: { name: 'Rahim', addresses: [{ id: theirs.id, line: 'My house, my road, my area' }] } });
    expect((await f.t.prisma.customerAddress.findUniqueOrThrow({ where: { id: theirs.id } })).addressLine).toBe('Their house, their road');
  });

  it('PR 137: his checkout starts with his name, number and default address (else his last order address), unless switched off', async () => {
    expect(await checkoutPrefill(f.deps(), { storeId: f.A, customerId: me.id })).toEqual({ name: 'Rahim', phone: '01700000131', address: 'My house, my road, my area' });
    // without a saved address: the address of his last order
    const solo = await f.customer('+8801700000137', f.A, 'Karim Mia');
    await f.t.prisma.order.updateMany({ where: { number: 'T-1002' }, data: { customerId: solo.id, shippingAddressText: 'Flat 3, Road 9, Mirpur' } });
    expect(await checkoutPrefill(f.deps(), { storeId: f.A, customerId: solo.id })).toEqual({ name: 'Karim Mia', phone: '01700000137', address: 'Flat 3, Road 9, Mirpur' });
    // another store's view of him has nothing; the owner's switch turns it off
    expect(await checkoutPrefill(f.deps(), { storeId: f.B, customerId: me.id })).toBeNull();
    f.overrides.set('checkout.autofill', { account: false, browserDays: 0 });
    expect(await checkoutPrefill(f.deps(), { storeId: f.A, customerId: me.id })).toBeNull();
    f.overrides.delete('checkout.autofill');
  });

  it('consent: SMS and WhatsApp apart, a row per change with where it came from', async () => {
    expect((await profileView(f.deps(), { storeId: f.A, customerId: me.id }))?.consent).toEqual({ sms: null, whatsapp: null });
    expect(await saveConsent(f.deps(), { storeId: f.A, customerId: me.id, consent: { sms: true } }, { ip: '192.0.2.1' })).toEqual({ sms: true, whatsapp: null });
    expect(await saveConsent(f.deps(), { storeId: f.A, customerId: me.id, consent: { sms: true, whatsapp: false } })).toEqual({ sms: true, whatsapp: false });
    const rows = await f.t.prisma.consentRecord.findMany({ where: { customerId: me.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.channel, r.granted, r.source])).toEqual([
      ['SMS', true, 'account'],
      ['WHATSAPP', false, 'account'],
    ]);
  });

  it('PR 301: his birthday — only while the owner\'s field is on; day and month, the year only when asked; cleared on his word', async () => {
    const save = (birthday: unknown) => saveBirthday(f.deps(), { storeId: f.A, customerId: me.id, birthday }, { ip: '192.0.2.9' });
    // off as shipped: refused, nothing stored
    expect(await code(save({ day: 5, month: 11 }))).toBe('NOT_ALLOWED');
    f.overrides.set('customers.birthday', { enabled: true, askYear: false });
    // the year is dropped while it is not asked; 29 February fits without a year
    expect(await save({ day: 29, month: 2, year: 1990 })).toEqual({ day: 29, month: 2, year: null });
    expect((await profileView(f.deps(), { storeId: f.A, customerId: me.id }))?.birthday).toEqual({ day: 29, month: 2, year: null });
    expect(await code(save({ day: 31, month: 4 }))).toBe('INVALID_INPUT');
    expect(await code(save({ day: 5, month: 13 }))).toBe('INVALID_INPUT');
    expect(await code(save({ day: '5', month: 11 }))).toBe('INVALID_INPUT');
    expect(await code(save({ day: 5, month: 11, gift: 'yes' }))).toBe('INVALID_INPUT');
    f.overrides.set('customers.birthday', { enabled: true, askYear: true });
    expect(await save({ day: 5, month: 11, year: 1990 })).toEqual({ day: 5, month: 11, year: 1990 });
    expect((await f.t.prisma.customer.findUniqueOrThrow({ where: { id: me.id } })).birthday?.toISOString().slice(0, 10)).toBe('1990-11-05');
    expect(await code(save({ day: 29, month: 2, year: 2001 }))).toBe('INVALID_INPUT');
    expect(await code(save({ day: 1, month: 1, year: 1850 }))).toBe('INVALID_INPUT');
    expect(await code(save({ day: 1, month: 1, year: 2030 }))).toBe('INVALID_INPUT');
    // another store's customer id is "no such customer"; another customer is untouched
    expect(await code(saveBirthday(f.deps(), { storeId: f.B, customerId: me.id, birthday: { day: 1, month: 1 } }))).toBe('NOT_FOUND');
    expect((await f.t.prisma.customer.findUniqueOrThrow({ where: { id: other.id } })).birthday).toBeNull();
    // cleared on his word; the audit lines never hold the date
    expect(await save({ clear: true })).toBeNull();
    expect((await profileView(f.deps(), { storeId: f.A, customerId: me.id }))?.birthday).toBeNull();
    const audit = await f.t.prisma.auditLog.findMany({ where: { action: 'customer.birthday.saved', entityId: me.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.after)).toEqual([
      { given: true, year: false },
      { given: true, year: true },
      { given: false, year: false },
    ]);
    expect(JSON.stringify(audit)).not.toContain('1990');
    f.overrides.delete('customers.birthday');
  });
});
