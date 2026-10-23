// S04 · PR 129 — the account made with the first order, on a real PostgreSQL (a throwaway database with the real
// migrations and two sample stores; skipped without TEST_DATABASE_ADMIN_URL). SIM-F-039 (CN-017): the new account has
// no credential and no session. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { linkOrderAccount, type LinkOrderInput } from './identity';

const PHONE = '+8801700000129';
const AT = new Date('2026-10-23T06:00:00Z');

describe.skipIf(!HAS_TEST_DB)('PR 129 · the account an order belongs to', () => {
  let t: TestDatabase;
  let A: number;
  let B: number;
  const input = (over: Partial<LinkOrderInput> = {}): LinkOrderInput => ({ storeId: A, phone: PHONE, name: 'Test Customer', placedAt: AT, signedInCustomerId: null, autoCreate: true, ...over });
  const link = (over: Partial<LinkOrderInput> = {}) => t.prisma.$transaction((tx) => linkOrderAccount(tx, input(over)));

  beforeAll(async () => {
    t = await createTestDatabase('accounts_identity');
    [A, B] = await seedSampleStores(t.prisma);
  });
  afterAll(async () => t?.drop());

  it('the first order makes the account with no credential and no session (SIM-F-039)', async () => {
    const a = await link();
    expect(a?.kind).toBe('created');
    const c = await t.prisma.customer.findUniqueOrThrow({ where: { id: a!.customerId }, include: { credential: true, sessions: true } });
    expect(c).toMatchObject({ storeId: A, phone: PHONE, name: 'Test Customer', firstSource: 'WEBSITE', orderCount: 1 });
    expect(c.credential).toBeNull();
    expect(c.sessions).toEqual([]);
  });

  it('the same number joins the same account and keeps its name; another store has its own', async () => {
    const a = await link({ name: 'Someone Else' });
    expect(a?.kind).toBe('existing');
    const c = await t.prisma.customer.findUniqueOrThrow({ where: { id: a!.customerId } });
    expect(c).toMatchObject({ name: 'Test Customer', orderCount: 2 });
    const b = await link({ storeId: B });
    expect(b?.kind).toBe('created');
    expect(b?.customerId).not.toBe(a?.customerId);
  });

  it('a signed-in customer takes the order; a stranger id from another store does not', async () => {
    const mine = await t.prisma.customer.create({ data: { storeId: A, phone: '+8801700000130' } });
    const a = await link({ signedInCustomerId: mine.id });
    expect(a).toEqual({ customerId: mine.id, kind: 'signedIn' });
    const other = await t.prisma.customer.create({ data: { storeId: B, phone: '+8801700000131' } });
    const b = await link({ signedInCustomerId: other.id });
    expect(b?.kind).toBe('existing');
  });

  it('with the automatic account switched off a guest order has none', async () => {
    expect(await link({ phone: '+8801700000132', autoCreate: false })).toBeNull();
    expect(await t.prisma.customer.count({ where: { phone: '+8801700000132' } })).toBe(0);
  });
});
