// PR 65 follow-up 232 — the shop's older reviews from a file, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): reviews.write only, each row checked, a dry run saves nothing, every imported review lands
// PENDING (never published, never verified) with source IMPORT and its written day, a file sent twice adds nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { importReviews, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('review import on PostgreSQL (follow-up 232)', () => {
  let t: TestDatabase;
  let A = 0;
  const clock = new Date('2026-11-07T06:00:00Z');
  const settings: SettingsReader = { value: async <K extends Key>(key: K): Promise<Value<K>> => registry[key].default as Value<K> };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const as = (actor: Actor): Who => ({ actor, storeId: A });
  let viewer: Actor;
  let writer: Actor;
  let product = '';

  const FILE = [
    'product,rating,name,title,body,written,size,colour,extra',
    'imp-polo,5,Rafi,Great,"Fits well, soft cotton.",2025-03-01,M,Navy,x',
    'IMP-POLO-L,4,Sami,,Good value.,2025-04-02,L,,',
    'imp-polo,6,Bad,,Six stars?,,,,',
    'unknown-product,5,Nobody,,Hello.,,,,',
    'imp-polo,3,Late,,From the future.,2027-01-01,,,',
    'imp-polo,4,Quiet,,,,,,',
    'imp-polo,5,Rafi,Great,"Fits well, soft cotton.",2025-03-01,M,Navy,x',
  ].join('\n');

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_review_import');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    viewer = await staff('imp-viewer@example.com', ['reviews.read']);
    writer = await staff('imp-writer@example.com', ['reviews.read', 'reviews.write']);
    const cat = await t.prisma.category.create({ data: { storeId: A, slug: 'imp-polos', nameEn: 'Polos', nameBn: 'পোলো' }, select: { id: true } });
    product = (await t.prisma.product.create({ data: { storeId: A, slug: 'imp-polo', nameEn: 'Sample polo', status: 'PUBLISHED', categoryId: cat.id }, select: { id: true } })).id;
    const colour = await t.prisma.colour.findFirstOrThrow({ where: { storeId: A }, select: { id: true } }).catch(async () => t.prisma.colour.create({ data: { storeId: A, key: 'navy', nameEn: 'Navy', nameBn: 'নেভি', hex: '#1f2a44' }, select: { id: true } }));
    const size = await t.prisma.size.findFirst({ where: { storeId: A }, select: { id: true } });
    await t.prisma.productVariant.create({ data: { storeId: A, productId: product, colourId: colour.id, ...(size ? { sizeId: size.id } : {}), sku: 'IMP-POLO-L', priceMinor: 85_000 } as never });
  }, 300_000);

  afterAll(async () => t?.drop());

  it('needs reviews.write', async () => {
    expect(await code(importReviews(deps(), as(viewer), { csv: FILE }))).toBe('FORBIDDEN');
    expect(await code(importReviews(deps(), as(writer), { csv: 'name,body\nx,y' }))).toBe('CSV_INVALID');
  });

  it('a dry run checks every row and saves nothing', async () => {
    const r = await importReviews(deps(), as(writer), { csv: FILE, dryRun: true });
    expect(r.ignoredColumns).toEqual(['extra']);
    const byLine = Object.fromEntries(r.rows.map((x) => [x.line, x.problems]));
    expect(byLine[2]).toEqual([]);
    expect(byLine[3]).toEqual([]); // found by one of its SKUs
    expect(byLine[4]).toEqual(['RATING']);
    expect(byLine[5]).toEqual(['PRODUCT_UNKNOWN']);
    expect(byLine[6]).toEqual(['DATE']);
    expect(byLine[7]).toEqual(['NO_WORDS']);
    expect(byLine[8]).toEqual(['DUPLICATE']);
    expect(r.created).toBe(0);
    expect(await t.prisma.review.count({ where: { storeId: A } })).toBe(0);
  });

  it('imports the good rows PENDING, never verified, with their day; a second send adds nothing', async () => {
    const r = await importReviews(deps(), as(writer), { csv: FILE, dryRun: false });
    expect(r.created).toBe(r.ready);
    const rows = await t.prisma.review.findMany({ where: { storeId: A }, orderBy: { createdAt: 'asc' } });
    expect(rows.length).toBe(r.ready);
    for (const x of rows) expect(x).toMatchObject({ status: 'PENDING', source: 'IMPORT', isVerifiedPurchase: false, publishedAt: null, productId: product });
    expect(rows[0]).toMatchObject({ displayName: 'Rafi', rating: 5, body: 'Fits well, soft cotton.', sizeLabel: 'M', colourName: 'Navy' });
    expect(rows[0]!.createdAt.toISOString().slice(0, 10)).toBe('2025-03-01');
    expect(await t.prisma.auditLog.count({ where: { action: 'reviews.import' } })).toBe(r.ready);
    const again = await importReviews(deps(), as(writer), { csv: FILE, dryRun: false });
    expect(again.created).toBe(0);
    expect(await t.prisma.review.count({ where: { storeId: A } })).toBe(r.ready);
  });
});
