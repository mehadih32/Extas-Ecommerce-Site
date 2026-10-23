// PR 128 on a real PostgreSQL (a throwaway database with the real migrations, the sample catalogue and the sample
// combos; skipped without TEST_DATABASE_ADMIN_URL): "Complete your look" suggests only what a running combo of the
// shop pairs with the order's products — never a paused or ended combo, an archived or unpublished piece, or the
// order's own product.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import type { CombosDeps, SettingsReader } from './context';
import { seedSampleCombos } from './sample';
import { lookFor } from './look';

describe.skipIf(!HAS_TEST_DB)('complete your look on PostgreSQL (S04 · PR 128)', () => {
  let t: TestDatabase;
  let S = 0;
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CombosDeps => ({ db: t.prisma, settings });
  const id = async (slug: string) => (await t.prisma.product.findFirstOrThrow({ where: { storeId: S, slug }, select: { id: true } })).id;

  beforeAll(async () => {
    t = await createTestDatabase('combolook');
    S = (await seedSample(t.prisma)).storeId;
    await seedSampleCombos(deps());
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('the other pieces of a running combo, never the ordered product; nothing without a combo', async () => {
    const polo = await id('essential-pique-polo');
    const chino = await id('slim-chino-trousers');
    const got = await lookFor(deps(), { storeId: S, productIds: [polo], max: 3 });
    expect(got).toContain(chino);
    expect(got).not.toContain(polo);
    expect(await lookFor(deps(), { storeId: S, productIds: [chino], max: 3 })).toContain(polo);
    // a pack of one product (the crew-tee trio) suggests nothing else; a paused combo (shirt + belt) suggests nothing
    expect(await lookFor(deps(), { storeId: S, productIds: [await id('everyday-crew-tee')], max: 3 })).toEqual([]);
    expect(await lookFor(deps(), { storeId: S, productIds: [await id('oxford-cotton-shirt')], max: 3 })).not.toContain(await id('leather-look-belt'));
    expect(await lookFor(deps(), { storeId: S, productIds: [], max: 3 })).toEqual([]);
    expect(await lookFor(deps(), { storeId: S, productIds: [polo], max: 0 })).toEqual([]);
    // another store sees nothing of this one
    expect(await lookFor(deps(), { storeId: S + 999, productIds: [polo], max: 3 })).toEqual([]);
  });

  it('an ended combo or an unpublished / archived piece is never suggested', async () => {
    const polo = await id('essential-pique-polo');
    const chino = await id('slim-chino-trousers');
    const later = () => new Date(Date.now() + 3_600_000);
    await t.prisma.combo.updateMany({ where: { storeId: S, slug: 'sample-polo-chino-set' }, data: { endsAt: new Date(Date.now() + 60_000) } });
    expect(await lookFor(deps(), { storeId: S, productIds: [polo], max: 3 })).toContain(chino);
    expect(await lookFor({ ...deps(), now: later }, { storeId: S, productIds: [polo], max: 3 })).not.toContain(chino);
    await t.prisma.combo.updateMany({ where: { storeId: S, slug: 'sample-polo-chino-set' }, data: { endsAt: null } });
    await t.prisma.product.update({ where: { id: chino }, data: { status: 'DRAFT' } });
    expect(await lookFor(deps(), { storeId: S, productIds: [polo], max: 3 })).not.toContain(chino);
    await t.prisma.product.update({ where: { id: chino }, data: { status: 'PUBLISHED', archivedAt: new Date() } });
    expect(await lookFor(deps(), { storeId: S, productIds: [polo], max: 3 })).not.toContain(chino);
    await t.prisma.product.update({ where: { id: chino }, data: { archivedAt: null } });
    expect(await lookFor(deps(), { storeId: S, productIds: [polo], max: 3 })).toContain(chino);
  });
});
