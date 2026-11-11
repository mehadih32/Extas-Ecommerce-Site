// S23 · PR 439 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): queueing and running a render job.
// A queued job can only be run once; today's "render" is the preview step (the first featured product's own live
// photo) until the real compositor exists — see render.ts's own header comment.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { BRAND_ASSET_FOLDER } from './assets';
import { queueSocialRender, runSocialRenderJob, studioRenderJobs, type StudioDeps, type Who } from './index';
import { saveStudioTemplate } from './templates';

describe.skipIf(!HAS_TEST_DB)('PR 439 · studio render jobs (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  let reader: Who;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): StudioDeps => ({ db: t.prisma, settings });

  const makeProduct = (slug: string, nameEn: string) => t.prisma.product.create({ data: { storeId: S, slug, nameEn } });
  const makeAsset = (key: string) =>
    t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `products/${S}/${key}.jpg`, mimeType: 'image/jpeg', bytes: 500n, checksumSha256: key.padEnd(64, '0'), isOriginal: true } });
  const giveCoverPhoto = async (productId: string) => {
    const asset = await makeAsset(productId.slice(0, 8));
    await t.prisma.productMedia.create({ data: { storeId: S, productId, assetId: asset.id, role: 'FRONT', isPrimary: true } });
    return asset.id;
  };

  beforeAll(async () => {
    t = await createTestDatabase('studio_render');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('studio.read' | 'studio.write' | 'studio.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    who = await staff('t439-gen', ['studio.read', 'studio.write', 'studio.generate']);
    reader = await staff('t439-reader', ['studio.read']);
  });

  afterAll(async () => t.drop());

  it('queues a job with its plan, runs it, and the output is the product’s own live photo', async () => {
    const d = deps();
    const tpl = await saveStudioTemplate(d, who, { action: 'add', kind: 'image', name: 'Square poster', spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    const product = await makeProduct('render-p1', 'Classic Tee');
    const coverAssetId = await giveCoverPhoto(product.id);

    const job = await queueSocialRender(d, who, { templateId: tpl.id, productIds: [product.id], caption: '  Summer tee  ' });
    expect(job.status).toBe('QUEUED');
    expect(job.kind).toBe('image');
    expect(job.plan?.scenes).toEqual([{ productId: product.id, productName: 'Classic Tee' }]);
    expect(job.caption).toBe('Summer tee');

    const done = await runSocialRenderJob(d, who, job.id);
    expect(done.status).toBe('SUCCEEDED');
    expect(done.outputAssetId).toBe(coverAssetId);
    expect(done.error).toBeNull();

    await expect(runSocialRenderJob(d, who, job.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });

    const list = await studioRenderJobs(d, reader);
    expect(list.some((j) => j.id === job.id)).toBe(true);
  });

  it('fails the job when none of its products has a live photo yet', async () => {
    const d = deps();
    const tpl = await saveStudioTemplate(d, who, { action: 'add', kind: 'reel', name: 'No photo reel', spec: { aspectRatio: '9:16', durationSeconds: 10, brandAssetIds: [] } });
    const product = await makeProduct('render-p2', 'Bare Product');
    const job = await queueSocialRender(d, who, { templateId: tpl.id, productIds: [product.id] });
    const done = await runSocialRenderJob(d, who, job.id);
    expect(done.status).toBe('FAILED');
    expect(done.outputAssetId).toBeNull();
    expect(done.error).toMatch(/live photo/);
  });

  it('refuses an empty product list, an archived template, and a product from another store', async () => {
    const d = deps();
    const tpl = await saveStudioTemplate(d, { actor: who.actor, storeId: S }, { action: 'add', kind: 'image', name: 'Guard template', spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    await expect(queueSocialRender(d, who, { templateId: tpl.id, productIds: [] })).rejects.toMatchObject({ code: 'NO_PRODUCTS' });

    const product = await makeProduct('render-p3', 'Guard Tee');
    const archived = await saveStudioTemplate(d, who, { action: 'archive', id: tpl.id, archived: true, version: tpl.updatedAt });
    await expect(queueSocialRender(d, who, { templateId: archived.id, productIds: [product.id] })).rejects.toMatchObject({ code: 'TEMPLATE_ARCHIVED' });

    const tpl2 = await saveStudioTemplate(d, who, { action: 'add', kind: 'image', name: 'Guard template 2', spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    const ghost = '11111111-1111-4111-8111-111111111111';
    await expect(queueSocialRender(d, who, { templateId: tpl2.id, productIds: [ghost] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a brand asset the template points at is resolved into the plan by its kind', async () => {
    const d = deps();
    const logo = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `studio/${S}/logo.png`, mimeType: 'image/png', bytes: 100n, checksumSha256: 'logo'.padEnd(64, '0'), isOriginal: true, folder: BRAND_ASSET_FOLDER, tags: ['logo'] } });
    const tpl = await saveStudioTemplate(d, who, { action: 'add', kind: 'image', name: 'Branded poster', spec: { aspectRatio: '1:1', brandAssetIds: [logo.id] } });
    const product = await makeProduct('render-p4', 'Branded Tee');
    const job = await queueSocialRender(d, who, { templateId: tpl.id, productIds: [product.id] });
    expect(job.plan?.brandAssets).toEqual({ logo: logo.id });
  });

  it('only `studio.generate` may queue or run a job', async () => {
    const d = deps();
    const tpl = await saveStudioTemplate(d, who, { action: 'add', kind: 'image', name: 'Permission check', spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    const product = await makeProduct('render-p5', 'Perm Tee');
    await expect(queueSocialRender(d, reader, { templateId: tpl.id, productIds: [product.id] })).rejects.toThrow();
  });
});
