// PR 284 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the merge rules find two profiles of one person (the same e-mail, a WhatsApp number that is another's phone, the same
// name with the same address); only a person with `customers.merge` merges; a merge moves nothing and is audited; the
// same Idempotency-Key is one merge; one level only; "not the same person" hides a pair until it is undone; a split
// gives the profile back exactly as it was. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mergeCustomers, mergeDecisions, mergePreview, mergeSuggestions, notSamePerson, undoDecision } from './merge';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700002841', b: '+8801700002842', c: '+8801700002843', d: '+8801700002844', e: '+8801700002845', f: '+8801700002846' };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('customer merges on PostgreSQL (PR 284)', () => {
  let f: CustomersFixture;
  const ids: Record<string, string> = {};
  let n = 0;

  async function order(customerId: string | null, phone: string, o: { status?: 'PLACED' | 'DELIVERED'; total?: number; name?: string; address?: string } = {}) {
    n += 1;
    const total = o.total ?? 10_000;
    await f.t.prisma.order.create({
      data: {
        storeId: f.S,
        number: `M284-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status ?? 'DELIVERED',
        placedAt: new Date(Date.UTC(2026, 9, 1 + n)),
        deliveredAt: (o.status ?? 'DELIVERED') === 'DELIVERED' ? new Date(Date.UTC(2026, 9, 2 + n)) : null,
        subtotalMinor: total,
        discountMinor: 0,
        deliveryChargeMinor: 0,
        totalMinor: total,
        paymentMethod: 'COD',
        customerId,
        phone,
        customerName: o.name ?? null,
        shippingAddressText: o.address ?? null,
        idempotencyKey: `m284-${n}`,
      },
    });
    if (customerId) await f.t.prisma.customer.update({ where: { id: customerId }, data: { orderCount: { increment: 1 } } });
  }

  beforeAll(async () => {
    f = await setUpCustomers('customers-merge');
    // the same e-mail (a has more orders, so it stays)
    ids.a = await f.profile({ phone: N.a, name: 'Rahim', email: 'Rahim@Example.com' });
    ids.b = await f.profile({ phone: N.b, name: 'Rahim U', email: 'rahim@example.com ' });
    await order(ids.a, N.a);
    await order(ids.a, N.a, { status: 'PLACED' });
    await order(ids.b, N.b, { total: 5_000 });
    // c's WhatsApp number is d's phone, written the local way
    ids.c = await f.profile({ phone: N.c, name: 'Karim', whatsappNumber: '01700002844' });
    ids.d = await f.profile({ phone: N.d, name: 'K. Hasan' });
    // the same name with the same address, from their own orders
    ids.e = await f.profile({ phone: N.e, name: 'Sumon' });
    ids.f = await f.profile({ phone: N.f, name: 'Sumon' });
    await order(ids.e, N.e, { name: 'Sumon Das', address: 'House 4, Road 5, Dhanmondi' });
    await order(ids.f, N.f, { name: 'sumon  das', address: 'House 4 Road 5 Dhanmondi' });
  });
  afterAll(async () => f?.t.drop());

  it('suggests each pair by the rules it matched, the profile that stays first; a reader sees the numbers masked', async () => {
    const d = f.customersDeps();
    await expect(mergeSuggestions(d, { actor: { staffUserId: f.staffId }, storeId: f.S })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await mergeSuggestions(d, f.viewer)).pairs.every((p) => p.survivor.phone?.masked && p.merged.phone?.masked)).toBe(true);
    const s = await mergeSuggestions(d, f.manager);
    expect(s.enabled).toBe(true);
    expect(s.total).toBe(3);
    const by = (x: string) => s.pairs.find((p) => p.survivor.id === x || p.merged.id === x)!;
    expect(by(ids.a!)).toMatchObject({ survivor: { id: ids.a, orders: 2, salesMinor: 10_000 }, merged: { id: ids.b, orders: 1 }, signals: ['email'] });
    expect(by(ids.c!).signals).toEqual(['whatsapp']);
    expect(by(ids.e!).signals).toEqual(['nameAddress']);
    // the manager holds the full-number key: the full number; a profile with a different WhatsApp shows it too
    expect(by(ids.a!).survivor.phone).toMatchObject({ masked: false, dial: '01700002841' });
    expect(by(ids.c!).survivor.whatsapp ?? by(ids.c!).merged.whatsapp).toMatchObject({ dial: '01700002844' });
  });

  it('the owner can switch suggestions off, or keep only some rules', async () => {
    const d = f.customersDeps();
    f.overrides.set('customers.merge', { suggest: false, signals: ['email', 'whatsapp', 'nameAddress', 'identity'], perPage: 20, noteRequired: false });
    expect(await mergeSuggestions(d, f.manager)).toMatchObject({ enabled: false, pairs: [], total: 0 });
    f.overrides.set('customers.merge', { suggest: true, signals: ['email'], perPage: 20, noteRequired: false });
    expect((await mergeSuggestions(d, f.manager)).total).toBe(1);
    f.overrides.delete('customers.merge');
  });

  it('only a person with customers.merge merges; nothing moves; the same key is one merge', async () => {
    const d = f.customersDeps();
    const input = { survivorId: ids.a, mergedId: ids.b, signals: ['email'], note: 'same e-mail, same man' };
    await expect(mergeCustomers(d, f.viewer, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const r = await mergeCustomers(d, f.manager, input, { idempotencyKey: 'merge-284-ab' });
    expect(r).toMatchObject({ decision: 'MERGED', survivorId: ids.a, mergedId: ids.b, replay: false });
    expect(await mergeCustomers(d, f.manager, input, { idempotencyKey: 'merge-284-ab' })).toMatchObject({ id: r.id, replay: true });
    await expect(mergeCustomers(d, f.manager, { survivorId: ids.c, mergedId: ids.d }, { idempotencyKey: 'merge-284-ab' })).rejects.toMatchObject({ code: 'KEY_REUSED' });
    const b = await f.t.prisma.customer.findUniqueOrThrow({ where: { id: ids.b! } });
    expect(b.mergedIntoId).toBe(ids.a);
    // b's own order stays on b
    expect(await f.t.prisma.order.count({ where: { customerId: ids.b! } })).toBe(1);
    const log = await f.t.prisma.auditLog.findFirstOrThrow({ where: { action: 'customer.merge', entityId: ids.b! } });
    expect(log.after).toMatchObject({ mergedIntoId: ids.a, mergeId: r.id });
    // the pair is no longer suggested
    expect((await mergeSuggestions(d, f.manager)).pairs.some((p) => p.merged.id === ids.b)).toBe(false);
  });

  it('one level only: never into a merged profile, never a profile others joined, never itself', async () => {
    const d = f.customersDeps();
    await expect(mergeCustomers(d, f.manager, { survivorId: ids.b, mergedId: ids.c })).rejects.toMatchObject({ code: 'ALREADY_MERGED', data: { survivorId: ids.a } });
    await expect(mergeCustomers(d, f.manager, { survivorId: ids.c, mergedId: ids.a })).rejects.toMatchObject({ code: 'HAS_MERGED' });
    await expect(mergeCustomers(d, f.manager, { survivorId: ids.c, mergedId: ids.c })).rejects.toMatchObject({ code: 'SAME_PROFILE' });
    await expect(mergeCustomers(d, f.manager, { survivorId: ids.c, mergedId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    f.overrides.set('customers.merge', { suggest: true, signals: ['email'], perPage: 20, noteRequired: true });
    await expect(mergeCustomers(d, f.manager, { survivorId: ids.d, mergedId: ids.c })).rejects.toMatchObject({ code: 'NOTE_REQUIRED' });
    f.overrides.delete('customers.merge');
  });

  it('"not the same person" hides a pair until it is undone', async () => {
    const d = f.customersDeps();
    const r = await notSamePerson(d, f.manager, { aId: ids.f, bId: ids.e, signals: ['nameAddress'] });
    expect(r.replay).toBe(false);
    expect((await notSamePerson(d, f.manager, { aId: ids.e, bId: ids.f })).replay).toBe(true);
    expect((await mergeSuggestions(d, f.manager)).pairs.some((p) => p.survivor.id === ids.e || p.merged.id === ids.e)).toBe(false);
    await expect(undoDecision(d, f.manager, r.id, { note: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await undoDecision(d, f.manager, r.id, { note: 'they are brothers after all? check again' });
    expect((await mergeSuggestions(d, f.manager)).pairs.some((p) => p.survivor.id === ids.e || p.merged.id === ids.e)).toBe(true);
  });

  it('a split gives the profile back exactly as it was, once, and the decisions list shows who and why', async () => {
    const d = f.customersDeps();
    const merged = (await f.t.prisma.customerMerge.findFirstOrThrow({ where: { decision: 'MERGED', mergedId: ids.b! } })).id;
    await expect(undoDecision(d, f.viewer, merged, { note: 'wrong person' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await undoDecision(d, f.manager, merged, { note: 'wrong person' })).toMatchObject({ decision: 'MERGED', mergedId: ids.b });
    await expect(undoDecision(d, f.manager, merged, { note: 'wrong person' })).rejects.toMatchObject({ code: 'ALREADY_UNDONE' });
    expect(await f.t.prisma.customer.findUniqueOrThrow({ where: { id: ids.b! }, select: { mergedIntoId: true, mergedAt: true } })).toEqual({ mergedIntoId: null, mergedAt: null });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'customer.split', entityId: ids.b! } })).toBe(1);
    const rows = await mergeDecisions(d, f.manager);
    const row = rows.find((x) => x.id === merged)!;
    expect(row).toMatchObject({ survivor: { id: ids.a, name: 'Rahim' }, merged: { id: ids.b }, note: 'same e-mail, same man', by: 'Customers Staff', undone: { by: 'Customers Staff', note: 'wrong person' } });
  });

  it('a hand merge preview shows the two side by side, masked for a person without the full-number key', async () => {
    const d = f.customersDeps();
    const p = await mergePreview(d, f.manager, ids.c!, ids.d!);
    expect(p).toMatchObject({ survivor: { id: ids.c }, merged: { id: ids.d }, signals: [] });
    expect(await mergePreview(d, f.manager, ids.c!, ids.c!)).toBeNull();
    // a role with merge but not the full number: masked
    const { createRole, SYSTEM } = await import('@extas/auth');
    const role = await createRole(f.t.prisma, SYSTEM, { key: 'test-merge-only', nameEn: 'merge', nameBn: 'merge', permissions: ['customers.read', 'customers.merge'] });
    const u = await f.t.prisma.staffUser.create({ data: { email: 'merger@example.com', displayName: 'Merger', passwordHash: 'not-a-login' } });
    await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    const q = await mergePreview(d, { actor: { staffUserId: u.id }, storeId: f.S }, ids.c!, ids.d!);
    expect(q!.survivor.phone).toEqual({ text: '017•••••843', dial: null, masked: true });
  });
});
