// S28 · PR 684 — demo products on a real PostgreSQL: off as shipped, one sample per category, shown by the switches
// (master, per category, hide by itself), turned into a draft when the owner takes one over, who may change, audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { demoToDraft, demoView, reconcileDemo, seedDemoProducts, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('demo products on PostgreSQL (PR 684)', () => {
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
  let polo = '';
  let pique = '';
  let shirt = '';

  const real = (slug: string, categoryId: string) => t.prisma.product.create({ data: { storeId: A, slug, nameEn: slug, categoryId, status: 'PUBLISHED' } });
  const statusOf = async (categoryId: string) => (await t.prisma.product.findFirst({ where: { storeId: A, categoryId, isDemo: true } }))!.status;

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_demo');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    editor = await staff('d-editor@example.com', ['catalogue.read', 'catalogue.write']);
    reader = await staff('d-reader@example.com', ['catalogue.read']);
    await t.prisma.colour.create({ data: { storeId: A, key: 'd-black', nameEn: 'Black', hex: '#000000', synonyms: [] } });
    for (const [i, key] of ['d-s', 'd-m', 'd-l'].entries()) await t.prisma.size.create({ data: { storeId: A, key, label: key, sortOrder: i + 1 } });
    polo = (await t.prisma.category.create({ data: { storeId: A, slug: 'd-polo', nameEn: 'Polo' } })).id;
    pique = (await t.prisma.category.create({ data: { storeId: A, slug: 'd-pique', nameEn: 'Pique', parentId: polo } })).id;
    shirt = (await t.prisma.category.create({ data: { storeId: A, slug: 'd-shirt', nameEn: 'Shirt' } })).id;
  }, 300_000);
  afterAll(async () => t?.drop());

  it('makes one sample per category, once, hidden until the switches show them', async () => {
    expect(await code(seedDemoProducts(deps(), as(reader)))).toBe('FORBIDDEN');
    expect(await seedDemoProducts(deps(), as(editor))).toEqual({ made: 3 });
    expect(await seedDemoProducts(deps(), as(editor))).toEqual({ made: 0 });
    const p = (await t.prisma.product.findFirst({ where: { storeId: A, categoryId: shirt, isDemo: true }, include: { variants: true } }))!;
    expect(p).toMatchObject({ status: 'UNPUBLISHED', nameEn: 'Sample Shirt', nameBn: 'নমুনা Shirt' });
    expect(p.variants).toHaveLength(3);
    expect(p.variants.every((v) => v.priceMinor === 99900)).toBe(true);
  });

  it('is off as shipped: nothing shows', async () => {
    expect(await reconcileDemo(deps(), as(editor))).toEqual({ shown: 0, hidden: 0 });
    const v = await demoView(deps(), as(reader));
    expect(v).toMatchObject({ on: false, demoTotal: 3, showingTotal: 0 });
  });

  it('shows with the master switch, hides a category and its branch, and hides by itself at enough real products', async () => {
    demo.on = true;
    expect(await reconcileDemo(deps(), as(editor))).toEqual({ shown: 3, hidden: 0 });
    expect(await statusOf(shirt)).toBe('PUBLISHED');
    demo.off = [polo];
    expect(await reconcileDemo(deps(), as(editor))).toEqual({ shown: 0, hidden: 2 });
    expect(await statusOf(pique)).toBe('UNPUBLISHED');
    expect(await statusOf(shirt)).toBe('PUBLISHED');
    demo.off = [];
    demo.autoN = 2;
    await reconcileDemo(deps(), as(editor));
    await real('r1', shirt);
    expect((await reconcileDemo(deps(), as(editor))).hidden).toBe(0);
    await real('r2', shirt);
    expect(await reconcileDemo(deps(), as(editor))).toEqual({ shown: 0, hidden: 1 });
    const v = await demoView(deps(), as(reader));
    expect(v.categories.find((c) => c.id === shirt)).toMatchObject({ demo: 1, real: 2, showing: false });
    expect(v.categories.find((c) => c.id === polo)).toMatchObject({ real: 0, showing: true });
  });

  it('turns a demo product into a draft the owner finishes, with its sample prices off', async () => {
    const d = (await t.prisma.product.findFirst({ where: { storeId: A, categoryId: polo, isDemo: true } }))!;
    expect(await code(demoToDraft(deps(), as(reader), d.id))).toBe('FORBIDDEN');
    await demoToDraft(deps(), as(editor), d.id);
    const after = (await t.prisma.product.findUnique({ where: { id: d.id }, include: { variants: true } }))!;
    expect(after).toMatchObject({ isDemo: false, status: 'DRAFT', inStock: false });
    expect(after.variants.every((v) => !v.active)).toBe(true);
    expect(await code(demoToDraft(deps(), as(editor), d.id))).toBe('NOT_FOUND');
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['demo.seed', 'demo.reconcile', 'demo.toDraft'] } } })).toBeGreaterThanOrEqual(5);
  });
});
