// S28 · PR 712 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL; the sample catalogue's products and stock): the sets
// list shows only the combo kinds the owner counts as sets, each with its pieces, the set price against the pieces added up, and
// the stock of the weakest piece; it needs combos.read and writes nothing. Pure parts run everywhere. Made-up values only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { createCombo, setComboActive, setComboPrice } from './combos-service';
import type { CombosDeps, SettingsReader, Who } from './context';
import { listSets, setStock, slotStock } from './sets-list';

describe('PR 712 · pure stock of a set', () => {
  it('a set can be sold as often as its weakest piece allows, and names that piece', () => {
    expect(setStock([{ stock: 9, quantity: 1 }, { stock: 3, quantity: 1 }])).toMatchObject({ stock: 3, limitedBy: 1 });
    expect(setStock([{ stock: 9, quantity: 2 }, { stock: 5, quantity: 1 }])).toMatchObject({ stock: 4, limitedBy: 0 });
    expect(setStock([{ stock: 0, quantity: 1 }, { stock: 4, quantity: 1 }])).toMatchObject({ stock: 0, limitedBy: 0 });
    expect(setStock([])).toEqual({ stock: 0, limitedBy: null, allowed: [] });
  });
  it('a piece counts only the colours and sizes the set allows, or its one fixed variant', () => {
    const p = {
      variants: [
        { id: 'v1', colourId: 'red', sizeId: 'm', priceMinor: 1, sellable: 4 },
        { id: 'v2', colourId: 'red', sizeId: 'l', priceMinor: 1, sellable: 2 },
        { id: 'v3', colourId: 'blue', sizeId: 'm', priceMinor: 1, sellable: 5 },
        { id: 'v4', colourId: 'blue', sizeId: 'l', priceMinor: 1, sellable: -3 },
      ],
    } as never;
    expect(slotStock({ fixedVariantId: null, colourIds: [], sizeIds: [] }, p)).toBe(11);
    expect(slotStock({ fixedVariantId: null, colourIds: ['red'], sizeIds: [] }, p)).toBe(6);
    expect(slotStock({ fixedVariantId: null, colourIds: ['red'], sizeIds: ['l'] }, p)).toBe(2);
    expect(slotStock({ fixedVariantId: 'v3', colourIds: [], sizeIds: [] }, p)).toBe(5);
    expect(slotStock({ fixedVariantId: null, colourIds: [], sizeIds: [] }, undefined)).toBe(0);
  });
});

describe.skipIf(!HAS_TEST_DB)('sets list on PostgreSQL (PR 712)', () => {
  let t: TestDatabase;
  let S = 0;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CombosDeps => ({ db: t.prisma, settings, now: () => new Date('2026-11-10T06:00:00Z') });
  const actors: Record<string, Actor> = {};
  const as = (name: string): Who => ({ actor: actors[name]!, storeId: S });
  const ids: Record<string, string> = {};
  let top = '';
  let bottom = '';

  beforeAll(async () => {
    t = await createTestDatabase('sets_list');
    S = (await seedSample(t.prisma)).storeId;
    await syncAuth(t.prisma);
    const staff = async (name: string, perms: Parameters<typeof createRole>[2]['permissions']) => {
      const role = await createRole(t.prisma, SYSTEM, { key: `test-${name}`, nameEn: name, nameBn: name, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${name}@example.com`, displayName: name, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      actors[name] = { staffUserId: u.id };
    };
    await staff('reader', ['combos.read']);
    await staff('nobody', ['orders.read']);
    await staff('owner', ['combos.read', 'combos.write', 'combos.publish', 'combos.prices']);
    const withStock = await t.prisma.product.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, slug: true, variants: { select: { id: true } } }, orderBy: { slug: 'asc' }, take: 2 });
    top = withStock[0]!.id;
    bottom = withStock[1]!.id;
    for (const p of withStock) ids[p.slug] = p.id;
    const set = await createCombo(deps(), as('owner'), { slug: 'test-top-bottom', nameEn: 'Test top and bottom', type: 'TOP_BOTTOM', items: [{ productId: top, quantity: 1 }, { productId: bottom, quantity: 1 }], setPriceMinor: null });
    ids.set = set.id;
    await setComboPrice(deps(), as('owner'), set.id, Math.floor((set.pricing.regularMinor ?? 0) * 0.9));
    await setComboActive(deps(), as('owner'), set.id, true);
    await createCombo(deps(), as('owner'), { slug: 'test-pair', nameEn: 'Test pair', type: 'COLOUR_PAIR', items: [{ productId: top, quantity: 2 }], setPriceMinor: null });
  });
  afterAll(async () => t?.drop());

  const stockOf = async (productId: string) => {
    const lv = await t.prisma.stockLevel.findMany({ where: { variant: { productId } }, select: { available: true } });
    return lv.reduce((s, l) => s + Math.max(0, l.available), 0);
  };

  it('lists only the kinds counted as sets, with pieces, price against the pieces added up, and the weakest piece\'s stock', async () => {
    const l = await listSets(deps(), as('reader'));
    expect(l.rows.map((r) => r.slug)).toEqual(['test-top-bottom']);
    const r = l.rows[0]!;
    expect(r.state).toBe('live');
    expect(r.parts).toHaveLength(2);
    expect(r.sumPartsMinor).toBe(r.parts.reduce((s, p) => s + (p.priceMinor ?? 0), 0));
    expect(r.setPriceMinor).toBeLessThan(r.sumPartsMinor!);
    expect(r.savingMinor).toBe(r.sumPartsMinor! - r.setPriceMinor!);
    const expected = Math.min(await stockOf(top), await stockOf(bottom));
    expect(r.stock).toBe(expected);
    expect(r.parts.find((p) => p.position === r.limitedBy)!.setsAllowed).toBe(expected);
    expect(l.live).toBe(1);
  });

  it('a piece with no stock takes the whole set to 0 and is named as the limit; the owner can count other kinds as sets', async () => {
    await t.prisma.stockLevel.updateMany({ where: { variant: { productId: bottom } }, data: { available: 0, onHand: 0 } });
    const r = (await listSets(deps(), as('reader'))).rows[0]!;
    expect(r.stock).toBe(0);
    expect(r.parts.find((p) => p.position === r.limitedBy)!.productId).toBe(bottom);
    overrides.set('combos.setsTab', { types: ['TOP_BOTTOM', 'COLOUR_PAIR'], lowStockAt: 5 });
    const l = await listSets(deps(), as('reader'));
    expect(l.rows.map((x) => x.slug).sort()).toEqual(['test-pair', 'test-top-bottom']);
    expect(l.soldOut).toBe(1);
    overrides.delete('combos.setsTab');
  });

  it('needs combos.read and writes nothing', async () => {
    const code = await listSets(deps(), as('nobody')).then(() => 'ok', (e: { code?: string }) => e.code);
    expect(code).toBe('FORBIDDEN');
    const n = await t.prisma.combo.count();
    await listSets(deps(), as('reader'));
    expect(await t.prisma.combo.count()).toBe(n);
  });
});
