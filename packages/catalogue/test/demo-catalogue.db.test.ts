// S28 · PR 708 — the demo catalogue on a real PostgreSQL: the 72 styles are made as demo products with their colours,
// sizes, stock, size charts and categories; made once; a real product is never touched; hidden until the switches show.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { addDemoCatalogue, DEMO_CATALOGUE_SIZE, demoView, reconcileDemo, type CatalogueDeps, type SettingsReader, type Who } from '../src';

describe('the demo catalogue data', () => {
  it('holds the 72 styles of the approved demo in 11 categories', () => {
    expect(DEMO_CATALOGUE_SIZE).toBe(72);
  });
});

describe.skipIf(!HAS_TEST_DB)('the demo catalogue on PostgreSQL (PR 708)', () => {
  let t: TestDatabase;
  let A = 0;
  const demo: Record<string, unknown> = {};
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      if (key === 'catalogue.demo') return { ...registry['catalogue.demo'].default, ...demo } as Value<K>;
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings });
  const as = (actor: Actor): Who => ({ actor, storeId: A });
  let editor: Actor;
  let reader: Actor;

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_demo72');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, {
        key: email.split('@')[0]!,
        nameEn: email,
        nameBn: email,
        permissions: perms,
      });
      const u = await t.prisma.staffUser.create({
        data: { email, displayName: email, passwordHash: 'not-a-login' },
      });
      await t.prisma.staffRoleAssignment.create({
        data: { staffUserId: u.id, roleId: role.id, storeId: A },
      });
      return { staffUserId: u.id };
    };
    editor = await staff('c-editor@example.com', ['catalogue.read', 'catalogue.write']);
    reader = await staff('c-reader@example.com', ['catalogue.read']);
    const w = await t.prisma.warehouse.create({
      data: { code: 'DEMO72', name: 'Demo 72' },
    });
    await t.prisma.inventoryLocation.create({
      data: {
        warehouseId: w.id,
        code: 'MAIN',
        name: 'Main',
        kind: 'WAREHOUSE',
      },
    });
    // a real product that owns one of the demo addresses must be left alone
    await t.prisma.product.create({
      data: {
        storeId: A,
        slug: 'demo-essential-pique-polo',
        nameEn: 'Mine',
        status: 'PUBLISHED',
      },
    });
  }, 300_000);
  afterAll(async () => t?.drop());

  it('needs the write permission', async () => {
    await expect(addDemoCatalogue(deps(), as(reader))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('makes the 71 styles (one address was a real product), hidden, once', async () => {
    const r = await addDemoCatalogue(deps(), as(editor));
    expect(r).toMatchObject({ made: 71, skipped: 1 });
    expect(await addDemoCatalogue(deps(), as(editor))).toMatchObject({
      made: 0,
      skipped: 72,
      categoriesMade: 0,
    });
    expect(await t.prisma.product.count({ where: { storeId: A, isDemo: true } })).toBe(71);
    expect(
      await t.prisma.product.count({
        where: { storeId: A, isDemo: true, status: 'PUBLISHED' },
      }),
    ).toBe(0);
    const mine = await t.prisma.product.findFirst({
      where: { storeId: A, slug: 'demo-essential-pique-polo' },
    });
    expect(mine).toMatchObject({
      nameEn: 'Mine',
      isDemo: false,
      status: 'PUBLISHED',
    });
  });

  it('gives a style its price, colours, sizes, stock, fabric, tag, collection and size chart', async () => {
    const p = (await t.prisma.product.findFirst({
      where: { storeId: A, slug: 'demo-textured-knit-polo' },
      include: {
        variants: { include: { stockLevels: true } },
        colours: true,
        fabric: true,
      },
    }))!;
    expect(p).toMatchObject({
      isDemo: true,
      status: 'UNPUBLISHED',
      minPriceMinor: 115000,
      templateKey: 'T2',
    });
    expect(p.pdpBlocks).toMatchObject({
      fit: 'Regular fit',
      fitNote: 'Fits true to size.',
    });
    expect(p.fabric?.nameEn).toContain('textured knit');
    expect(p.colours).toHaveLength(3);
    expect(p.variants).toHaveLength(15);
    expect(p.variants.reduce((a, v) => a + v.stockLevels.reduce((b, s) => b + s.onHand, 0), 0)).toBe(3 + 5 + 4 + 2 + 0 + 2 + 3 + 3 + 2 + 1 + 1 + 4 + 2 + 2 + 0);
    expect(
      await t.prisma.sizeChartAssignment.count({
        where: { storeId: A, productId: p.id },
      }),
    ).toBe(1);
    expect(
      await t.prisma.collectionProduct.count({
        where: { storeId: A, productId: p.id },
      }),
    ).toBe(1);
    expect(
      await t.prisma.productTag.count({
        where: { storeId: A, productId: p.id },
      }),
    ).toBe(1);
    const sale = (await t.prisma.product.findFirst({
      where: { storeId: A, slug: 'demo-contrast-collar-polo' },
      include: { variants: true },
    }))!;
    expect(sale.variants.every((v) => v.priceMinor === 95000 && v.compareAtMinor === 119000)).toBe(true);
  });

  it('adds the 11 categories as the demo has them (extra ones hidden from the menus)', async () => {
    const slugs = (
      await t.prisma.category.findMany({
        where: { storeId: A, products: { some: { isDemo: true } } },
        select: { slug: true, isVisible: true },
      })
    )
      .map((c) => c.slug)
      .sort();
    expect(slugs).toEqual(['extras', 'hoodies', 'jackets', 'joggers', 'panjabi', 'polos', 'shirts', 'sweaters', 'trousers', 'tshirts', 'tracksuits'].sort());
    expect(
      (await t.prisma.category.findFirst({
        where: { storeId: A, slug: 'jackets' },
      }))!.isVisible,
    ).toBe(false);
  });

  it('is off as shipped; the master switch shows them', async () => {
    expect(await reconcileDemo(deps(), as(editor))).toEqual({
      shown: 0,
      hidden: 0,
    });
    expect((await demoView(deps(), as(reader))).showingTotal).toBe(0);
    demo.on = true;
    demo.auto = false;
    expect((await reconcileDemo(deps(), as(editor))).shown).toBe(71);
    expect(
      await t.prisma.product.count({
        where: { storeId: A, isDemo: true, status: 'PUBLISHED' },
      }),
    ).toBe(71);
  });
});
