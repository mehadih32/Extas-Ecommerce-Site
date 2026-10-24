// PR 98, 100 on a real PostgreSQL (a throwaway database with the real migrations and the sample catalogue; skipped
// without TEST_DATABASE_ADMIN_URL): the builder page's groups from a Smart Rules set tier rule, the builder's switch
// and filters, "Add set to Bag" (one tap one add, no oversell, the bag's rules engine charging exactly the builder's
// set price), and the admin's view with its permissions. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { contentColumns, quoteCart, ruleContentSchema } from '@extas/rules';
import { addBuiltSetToBag, builderAdmin, setBuilder, setBuilderOptions } from './builder';
import type { CombosDeps, SettingsReader, Who } from './context';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

async function details(p: Promise<unknown>): Promise<string[] | 'ok'> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { details?: string[] }).details ?? [String(e)];
  }
}

const T0 = new Date('2026-10-24T06:00:00Z');
const OPEN = { on: true, rules: [], categories: [], maxStyles: 24, perItem: true, entries: true };

describe.skipIf(!HAS_TEST_DB)('the set builder on PostgreSQL (S03 · PR 98, 100)', () => {
  let t: TestDatabase;
  let S = 0;
  const overrides = new Map<string, unknown>([['rules.public.cacheSeconds', 0]]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
    async set(key, value) {
      registry[key].schema.parse(value);
      overrides.set(key, value);
    },
  };
  const deps = (): CombosDeps => ({ db: t.prisma, settings, now: () => T0 });
  const actors: Record<string, Actor> = {};
  const as = (name: string): Who => ({ actor: actors[name]!, storeId: S });
  let ruleId = '';
  let polos: string[] = [];

  const variantOf = async (slug: string) => {
    const p = await t.prisma.product.findFirstOrThrow({ where: { storeId: S, slug }, select: { id: true } });
    const f = (await setBuilder(deps(), { storeId: S })).groups[0]!.products.find((x) => x.id === p.id)!;
    return f.variants.find((v) => v.sellable > 3 && v.priceMinor !== null)!;
  };

  beforeAll(async () => {
    t = await createTestDatabase('builder');
    S = (await seedSample(t.prisma)).storeId;
    await syncAuth(t.prisma);
    const staff = async (name: string, perms: PermissionKey[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: `test-${name}`, nameEn: name, nameBn: name, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${name}@example.com`, displayName: name, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      actors[name] = { staffUserId: u.id };
    };
    await staff('reader', ['combos.read']);
    await staff('writer', ['combos.read', 'combos.write']);
    await staff('publisher', ['combos.read', 'combos.write', 'combos.publish']);
    const cat = await t.prisma.category.findFirstOrThrow({ where: { storeId: S, slug: 'polos' }, select: { id: true } });
    const content = ruleContentSchema.parse({
      key: 'test-any-polos',
      kind: 'setTier',
      nameEn: 'Test any polos',
      text: {},
      params: [
        { key: 'tier2', type: 'money', value: 150000, labelEn: 'Any 2' },
        { key: 'tier3', type: 'money', value: 210000, labelEn: 'Any 3' },
      ],
      scope: { include: [{ type: 'category', id: cat.id }], exclude: [] },
      conditions: { all: [] },
      actions: [{ type: 'setTier', tiers: [{ quantity: 2, param: 'tier2' }, { quantity: 3, param: 'tier3' }] }],
      placements: [],
      priority: 0,
      stackable: false,
      status: 'DRAFT',
      startsAt: null,
      endsAt: null,
    });
    ruleId = (await t.prisma.smartRule.create({ data: { storeId: S, ...contentColumns(content) }, select: { id: true } })).id;
    polos = (await t.prisma.product.findMany({ where: { storeId: S, status: 'PUBLISHED', OR: [{ categoryId: cat.id }, { category: { parentId: cat.id } }] }, select: { id: true } })).map((p) => p.id);
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('is off by default; a test server`s preview shows the draft rule; on, only the live rule with its priced tiers', async () => {
    expect(await setBuilder(deps(), { storeId: S })).toMatchObject({ on: false, groups: [] });
    const preview = await setBuilder(deps(), { storeId: S, preview: true });
    expect(preview).toMatchObject({ on: true, preview: true, groups: [{ key: 'test-any-polos', draft: true, tiers: [{ quantity: 2, priceMinor: 150000 }, { quantity: 3, priceMinor: 210000 }] }] });
    overrides.set('combos.builder', OPEN);
    expect((await setBuilder(deps(), { storeId: S })).groups).toEqual([]);
    await t.prisma.smartRule.update({ where: { id: ruleId }, data: { status: 'ACTIVE' } });
    const live = await setBuilder(deps(), { storeId: S });
    expect(live.groups).toHaveLength(1);
    const g = live.groups[0]!;
    expect(g).toMatchObject({ ruleId, draft: false });
    // only the polos (and the sub-category's), published, each with its colours, sizes and every variant's own price
    expect(g.products.length).toBeGreaterThan(1);
    expect(g.products.every((p) => polos.includes(p.id))).toBe(true);
    expect(g.products[0]!.variants.some((v) => v.priceMinor !== null && v.sellable > 0)).toBe(true);
  });

  it('narrows to the chosen rules, categories and styles', async () => {
    overrides.set('combos.builder', { ...OPEN, rules: ['another-rule'] });
    expect((await setBuilder(deps(), { storeId: S })).groups).toEqual([]);
    const tees = await t.prisma.category.findFirstOrThrow({ where: { storeId: S, slug: 'tshirts' }, select: { id: true } });
    overrides.set('combos.builder', { ...OPEN, categories: [tees.id] });
    expect((await setBuilder(deps(), { storeId: S })).groups).toEqual([]);
    overrides.set('combos.builder', { ...OPEN, maxStyles: 1 });
    expect((await setBuilder(deps(), { storeId: S })).groups[0]!.products).toHaveLength(1);
    overrides.set('combos.builder', OPEN);
  });

  it('puts the set into the bag as lines the rules engine prices at exactly the builder`s set price; one tap is one add', async () => {
    const cartId = (await t.prisma.cart.create({ data: { storeId: S, visitorId: 'test-visitor-98' }, select: { id: true } })).id;
    const a = await variantOf('essential-pique-polo');
    const others = (await setBuilder(deps(), { storeId: S })).groups[0]!.products.filter((p) => !p.variants.some((v) => v.id === a.id));
    const b = others[0]!.variants.find((v) => v.sellable > 3 && v.priceMinor !== null)!;
    const picks = [a.id, b.id, a.id];
    const r = await addBuiltSetToBag(deps(), { storeId: S, cartId, ruleId, picks, addKey: 'tap-0000001' });
    expect(r).toMatchObject({ added: true, pieces: 3, regularMinor: a.priceMinor! * 2 + b.priceMinor!, payMinor: Math.min(210000, a.priceMinor! * 2 + b.priceMinor!) });
    const lines = await t.prisma.cartItem.findMany({ where: { cartId, removedAt: null }, select: { id: true, variantId: true, quantity: true, comboGroupKey: true, source: true } });
    expect(lines.sort((x, y) => y.quantity - x.quantity).map((l) => [l.variantId, l.quantity, l.comboGroupKey, l.source])).toEqual([
      [a.id, 2, null, 'set'],
      [b.id, 1, null, 'set'],
    ]);
    // the bag's engine: the same set price, from the same rule
    const q = await quoteCart(deps(), { storeId: S, lines: lines.map((l) => ({ id: l.id, variantId: l.variantId, quantity: l.quantity })) });
    const setTier = q.applied.find((x) => x.effect === 'setTier');
    expect(setTier?.amountMinor ?? 0).toBe(r.regularMinor - r.payMinor);
    // the same tap again (a double tap, a resent request) is the same add
    expect(await addBuiltSetToBag(deps(), { storeId: S, cartId, ruleId, picks, addKey: 'tap-0000001' })).toMatchObject({ added: false, pieces: 3 });
    expect(await t.prisma.cartItem.aggregate({ where: { cartId, removedAt: null }, _sum: { quantity: true } })).toMatchObject({ _sum: { quantity: 3 } });
    expect(await t.prisma.setBuilderAdd.count({ where: { cartId } })).toBe(1);
  });

  it('refuses a set that is too small, too big, outside the group, more than can be sold, or while the builder is off', async () => {
    const cartId = (await t.prisma.cart.create({ data: { storeId: S, visitorId: 'test-visitor-98b' }, select: { id: true } })).id;
    const a = await variantOf('essential-pique-polo');
    const add = (picks: string[], key: string) => addBuiltSetToBag(deps(), { storeId: S, cartId, ruleId, picks, addKey: key });
    expect(await code(add([a.id], 'tap-small1'))).toBe('SET_INVALID');
    expect(await code(add([a.id, a.id, a.id, a.id], 'tap-big0001'))).toBe('SET_INVALID');
    const shirt = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: S, product: { slug: 'oxford-cotton-shirt' }, priceMinor: { not: null } }, select: { id: true } });
    expect(await details(add([a.id, shirt.id], 'tap-group01'))).toEqual(['NOT_IN_GROUP@1']);
    // no oversell: the stock left of one variant, counting what the bag holds
    const b = (await setBuilder(deps(), { storeId: S })).groups[0]!.products.find((p) => !p.variants.some((v) => v.id === a.id))!.variants.find((v) => v.sellable > 0 && v.priceMinor !== null)!;
    const held = await t.prisma.cartItem.create({ data: { storeId: S, cartId, variantId: a.id, quantity: a.sellable, unitPriceMinor: a.priceMinor! } });
    expect(await details(add([a.id, b.id], 'tap-stock01'))).toEqual(['NOT_ENOUGH@0']);
    await t.prisma.cartItem.update({ where: { id: held.id }, data: { removedAt: T0 } });
    overrides.set('combos.builder', { ...OPEN, on: false });
    expect(await details(add([a.id, a.id], 'tap-off0001'))).toEqual(['NOT_ON']);
    overrides.set('combos.builder', OPEN);
    expect(await t.prisma.cartItem.count({ where: { cartId, removedAt: null } })).toBe(0);
  });

  it('the admin view: the switches, the rules it offers and what customers built; changing them needs combos.publish', async () => {
    const v = await builderAdmin(deps(), as('reader'));
    expect(v.settings).toEqual(OPEN);
    expect(v.rules).toEqual([expect.objectContaining({ key: 'test-any-polos', offered: true, state: 'live' })]);
    expect(v.report).toEqual([{ ruleKey: 'test-any-polos', adds: 1, pieces: 3, regularMinor: expect.any(Number), payMinor: expect.any(Number) }]);
    expect(await code(setBuilderOptions(deps(), as('writer'), { on: false }))).not.toBe('ok');
    expect(await code(setBuilderOptions(deps(), as('publisher'), { maxStyles: 0 }))).toBe('INVALID_INPUT');
    expect(await setBuilderOptions(deps(), as('publisher'), { rules: ['test-any-polos'], on: false })).toEqual({ ...OPEN, rules: ['test-any-polos'], on: false });
    expect((await builderAdmin(deps(), as('reader'))).rules[0]!.offered).toBe(false);
    expect(await code(builderAdmin(deps(), as('reader'), { days: 0 }))).toBe('INVALID_INPUT');
  });
});
