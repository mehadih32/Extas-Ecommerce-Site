// PR 670 (owner decision 13 Nov): the seed makes Steadfast the shop's default courier, once, and never touches an existing account.
import { describe, expect, it } from 'vitest';
import type { Prisma } from '@extas/db/client';
import { DEFAULT_COURIER_PROVIDER, ensureSteadfastCourier } from '../src/couriers';

const row = (id: string, providerKey: string, name: string) => ({ id, providerKey, name });
const fake = (existing: ReturnType<typeof row>[]) => {
  const created: unknown[] = [];
  const asked: unknown[] = [];
  const db = {
    courierAccount: {
      findMany: async (a: unknown) => (asked.push(a), existing),
      create: async (a: { data: unknown }) => (created.push(a.data), { id: 'new' }),
    },
  } as unknown as Pick<Prisma.TransactionClient, 'courierAccount'>;
  return { db, created, asked };
};

describe('ensureSteadfastCourier (seed)', () => {
  it('adds one switched-on Steadfast account when the store has none, from the store\'s own live accounts only', async () => {
    const a = fake([row('p', 'pathao', 'Pathao')]);
    expect(await ensureSteadfastCourier(a.db, 7)).toEqual({ id: 'new', created: true });
    expect(a.created).toEqual([{ storeId: 7, providerKey: DEFAULT_COURIER_PROVIDER, name: 'Steadfast', enabled: true }]);
    expect(a.asked).toEqual([{ where: { storeId: 7, archivedAt: null }, select: { id: true, providerKey: true, name: true }, orderBy: { createdAt: 'asc' } }]);
  });

  it('adds nothing when a Steadfast account is there, by adapter key or by name, in any case', async () => {
    for (const existing of [[row('s', 'steadfast', 'Main account')], [row('x', 'mockCourier', 'STEADFAST returns')], [row('p', 'pathao', 'Pathao'), row('s', 'STEADFAST', 'Steadfast')]]) {
      const a = fake(existing);
      const out = await ensureSteadfastCourier(a.db, 1);
      expect(out.created).toBe(false);
      expect(a.created).toEqual([]);
    }
  });
});
