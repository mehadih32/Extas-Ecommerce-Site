// PR 670 (owner decision 13 Nov): Steadfast is the default courier while the setting is empty.
import { describe, expect, it } from 'vitest';
import { DEFAULT_COURIER_PROVIDER, defaultCourierIdOf, ensureSteadfastCourier } from './accounts';
import type { Db } from './context';

const row = (id: string, providerKey: string, name: string, archivedAt: Date | null = null) => ({ id, providerKey, name, archivedAt });

describe('default courier', () => {
  const rows = [row('p', 'pathao', 'Pathao main'), row('s', 'steadfast', 'Main account'), row('r', 'redx', 'RedX')];
  it('empty setting: Steadfast, by key or by name, any case', () => {
    expect(defaultCourierIdOf(rows, '')).toBe('s');
    expect(defaultCourierIdOf([row('p', 'pathao', 'Pathao'), row('x', 'mockCourier', 'STEADFAST returns')], '')).toBe('x');
  });
  it('the setting wins while that courier is there and not archived; a stale one falls back to Steadfast', () => {
    expect(defaultCourierIdOf(rows, 'p')).toBe('p');
    expect(defaultCourierIdOf([row('p', 'pathao', 'Pathao', new Date()), ...rows.slice(1)], 'p')).toBe('s');
    expect(defaultCourierIdOf(rows, 'gone')).toBe('s');
  });
  it('no Steadfast: the first live courier; none: empty; an archived Steadfast is ignored', () => {
    expect(defaultCourierIdOf([row('p', 'pathao', 'Pathao'), row('r', 'redx', 'RedX')], '')).toBe('p');
    expect(defaultCourierIdOf([row('s', 'steadfast', 'S', new Date()), row('p', 'pathao', 'Pathao')], '')).toBe('p');
    expect(defaultCourierIdOf([], '')).toBe('');
  });
});

describe('ensureSteadfastCourier', () => {
  const fake = (existing: ReturnType<typeof row>[]) => {
    const created: unknown[] = [];
    const db = { courierAccount: { findMany: async () => existing, create: async (a: { data: unknown }) => (created.push(a.data), { id: 'new' }) } } as unknown as Db;
    return { db, created };
  };
  it('creates one when missing, none when a Steadfast account exists', async () => {
    const a = fake([row('p', 'pathao', 'Pathao')]);
    expect(await ensureSteadfastCourier(a.db, 1)).toEqual({ id: 'new', created: true });
    expect(a.created).toEqual([{ storeId: 1, providerKey: DEFAULT_COURIER_PROVIDER, name: 'Steadfast', enabled: true }]);
    const b = fake([row('s', 'steadfast', 'Steadfast')]);
    expect(await ensureSteadfastCourier(b.db, 1)).toEqual({ id: 's', created: false });
    expect(b.created).toEqual([]);
  });
});
