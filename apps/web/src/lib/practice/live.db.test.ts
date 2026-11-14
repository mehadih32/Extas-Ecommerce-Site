// PR 725 (CN-049, 15 Nov 2026) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the practice shop is live
// while practice mode is on and one switch hides it. Switching off takes every practice product off the shop (DRAFT) and
// on brings them back (PUBLISHED) without deleting anything, and a real product is never touched. The automatic fill
// (`ensurePractice`) fills an empty store once, does nothing the second time and when two callers run at the same moment
// the data is still made once; with the automatic switch off (after a reset) nothing is filled; with practice off nothing
// is shown. A reset needs only the owner's PIN (no typed words) and keeps the automatic fill off.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB, createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { ensurePractice, takeLease, dropLease } from './ensure';
import { practiceCounts, resetPractice } from './reset';
import { practiceVisibilityDrift, syncPracticeVisibility } from './visibility';

const NOW = new Date('2026-11-15T08:00:00Z');

describe.skipIf(!HAS_TEST_DB)('the practice shop is live and hides with one switch (PR 725)', () => {
  let t: TestDatabase;
  let S = 0;
  let resolver: SettingsResolver;
  let realProductId = '';

  const set = (key: 'practice.enabled' | 'practice.autoFill', on: boolean) => resolver.set(key, { on }, storeTarget(S), { actorId: null, reason: 'test' });
  const deps = () => ({ db: t.prisma, resolver, media: null, now: () => NOW });

  beforeAll(async () => {
    t = await createTestDatabase('practice-live');
    [S] = await seedSampleStores(t.prisma);
    const db = t.prisma;
    await syncSettings(db, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(db), registry, { checkIntervalMs: 0 });
    for (const slug of ['polos', 'tshirts', 'shirts', 'panjabi', 'trousers', 'hoodies']) {
      if (!(await db.category.findFirst({ where: { storeId: S, slug }, select: { id: true } }))) await db.category.create({ data: { storeId: S, slug, nameEn: slug } });
    }
    for (const key of ['tee', 'shirt', 'trouser']) {
      if (!(await db.garmentType.findFirst({ where: { storeId: S, key }, select: { id: true } }))) await db.garmentType.create({ data: { storeId: S, key, nameEn: key, nameBn: key, measurementFields: [] } });
    }
    realProductId = (await db.product.create({ data: { storeId: S, slug: 'my-own-shirt-live', nameEn: 'My own shirt', status: 'PUBLISHED' } })).id;
  }, 180_000);
  afterAll(async () => t?.drop());

  it('practice off: nothing is filled and nothing is shown', async () => {
    await set('practice.enabled', false);
    const r = await ensurePractice(deps(), S);
    expect(r.on).toBe(false);
    expect(r.seeded).toBeNull();
    expect(await t.prisma.product.count({ where: { storeId: S, isPractice: true } })).toBe(0);
  });

  it('practice on: the sample shop fills by itself and every practice product is PUBLISHED and orderable', async () => {
    await set('practice.enabled', true);
    const r = await ensurePractice(deps(), S);
    expect(r.seeded?.seeded).toBe(true);
    const products = await t.prisma.product.findMany({ where: { storeId: S, isPractice: true }, select: { status: true, publishedAt: true, variants: { select: { sku: true, active: true } } } });
    expect(products.length).toBeGreaterThanOrEqual(20);
    expect(products.every((p) => p.status === 'PUBLISHED' && p.publishedAt !== null)).toBe(true);
    expect(products.every((p) => p.variants.length > 0 && p.variants.every((v) => v.active))).toBe(true);
    expect(await practiceVisibilityDrift(t.prisma, S, true)).toBe(0);
  }, 120_000);

  it('a second run changes nothing (cheap when filled)', async () => {
    const before = await practiceCounts(t.prisma, S);
    const r = await ensurePractice(deps(), S);
    expect(r.seeded).toBeNull();
    expect([r.shown, r.hidden, r.photos]).toEqual([0, 0, 0]);
    expect(await practiceCounts(t.prisma, S)).toEqual(before);
  });

  it('one click off hides every practice product (kept, not deleted); on brings them back; a real product never changes', async () => {
    const count = await t.prisma.product.count({ where: { storeId: S, isPractice: true } });
    await set('practice.enabled', false);
    const off = await ensurePractice(deps(), S);
    expect(off.hidden).toBe(count);
    expect(await t.prisma.product.count({ where: { storeId: S, isPractice: true, status: 'PUBLISHED' } })).toBe(0);
    expect(await t.prisma.product.count({ where: { storeId: S, isPractice: true } })).toBe(count);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: realProductId } })).status).toBe('PUBLISHED');
    await set('practice.enabled', true);
    const on = await ensurePractice(deps(), S);
    expect(on.shown).toBe(count);
    expect(await t.prisma.product.count({ where: { storeId: S, isPractice: true, status: 'PUBLISHED' } })).toBe(count);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: realProductId } })).status).toBe('PUBLISHED');
  });

  it('a practice product the owner archived stays archived when the shop is shown again', async () => {
    const one = await t.prisma.product.findFirstOrThrow({ where: { storeId: S, isPractice: true }, select: { id: true } });
    await t.prisma.product.update({ where: { id: one.id }, data: { archivedAt: NOW, status: 'DRAFT' } });
    await syncPracticeVisibility(t.prisma, S, true, NOW);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: one.id } })).status).toBe('DRAFT');
  });

  it('a lease is held by one caller at a time and a stale lease can be taken over', async () => {
    expect(await takeLease(t.prisma, 'test', S, NOW)).toBe(true);
    expect(await takeLease(t.prisma, 'test', S, NOW)).toBe(false);
    expect(await takeLease(t.prisma, 'test', S, new Date(NOW.getTime() + 3_600_000))).toBe(true);
    await dropLease(t.prisma, 'test', S);
    expect(await takeLease(t.prisma, 'test', S, NOW)).toBe(true);
    await dropLease(t.prisma, 'test', S);
  });

  it('a reset removes the practice shop; with the automatic fill off nothing comes back by itself, and it fills again when asked', async () => {
    await resetPractice(t.prisma, S);
    await set('practice.autoFill', false);
    expect((await ensurePractice(deps(), S)).seeded).toBeNull();
    expect(await t.prisma.product.count({ where: { storeId: S, isPractice: true } })).toBe(0);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: realProductId } })).status).toBe('PUBLISHED');
    // "Turn on" / "Add sample data" ask for it again
    const again = await ensurePractice(deps(), S, { force: true });
    expect(again.seeded?.seeded).toBe(true);
  }, 180_000);

  it('two callers at the same moment on an empty store make the data once', async () => {
    await resetPractice(t.prisma, S);
    await set('practice.autoFill', true);
    await Promise.all([ensurePractice(deps(), S), ensurePractice(deps(), S)]);
    const once = await practiceCounts(t.prisma, S);
    expect(once.orders).toBeGreaterThanOrEqual(80);
    await ensurePractice(deps(), S);
    expect(await practiceCounts(t.prisma, S)).toEqual(once);
  }, 240_000);
});
