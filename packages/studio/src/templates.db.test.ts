// S23 · PR 438 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the studio's templates. Added with a
// version, bumped on every change, never deleted, every change audited; a `brandAssetIds` entry must name a brand
// asset this store actually has.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { BRAND_ASSET_FOLDER } from './assets';
import { saveStudioTemplate, StudioError, studioTemplates, type StudioDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 438 · studio templates (PostgreSQL)', () => {
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

  beforeAll(async () => {
    t = await createTestDatabase('studio_templates');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('studio.read' | 'studio.write')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    who = await staff('t438-writer', ['studio.read', 'studio.write']);
    reader = await staff('t438-reader', ['studio.read']);
  });

  afterAll(async () => t.drop());

  it('adds a template at version 1; update bumps the version; archive/restore never deletes it', async () => {
    const d = deps();
    const a = await saveStudioTemplate(d, who, { action: 'add', kind: 'image', name: 'Weekly poster', spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    expect(a.version).toBe(1);
    expect(a.archived).toBe(false);
    const b = await saveStudioTemplate(d, who, { action: 'update', id: a.id, name: 'Weekly poster (v2)', spec: { aspectRatio: '4:5', brandAssetIds: [] }, version: a.updatedAt });
    expect(b.version).toBe(2);
    expect(b.spec.aspectRatio).toBe('4:5');
    const archived = await saveStudioTemplate(d, who, { action: 'archive', id: a.id, archived: true, version: b.updatedAt });
    expect(archived.archived).toBe(true);
    const restored = await saveStudioTemplate(d, who, { action: 'archive', id: a.id, archived: false, version: archived.updatedAt });
    expect(restored.archived).toBe(false);
    const row = await t.prisma.studioTemplate.findUnique({ where: { id: a.id } });
    expect(row).not.toBeNull();
  });

  it('refuses a template update once it is archived, and an unknown brand asset in its spec', async () => {
    const d = deps();
    const a = await saveStudioTemplate(d, who, { action: 'add', kind: 'reel', name: 'Launch reel', spec: { aspectRatio: '9:16', durationSeconds: 15, brandAssetIds: [] } });
    const archived = await saveStudioTemplate(d, who, { action: 'archive', id: a.id, archived: true, version: a.updatedAt });
    await expect(saveStudioTemplate(d, who, { action: 'update', id: a.id, name: 'Launch reel 2', spec: { aspectRatio: '9:16', brandAssetIds: [] }, version: archived.updatedAt })).rejects.toMatchObject({ code: 'TEMPLATE_ARCHIVED' });
    const ghost = '11111111-1111-4111-8111-111111111111';
    await expect(saveStudioTemplate(d, who, { action: 'add', kind: 'short', name: 'Bad spec', spec: { aspectRatio: '9:16', brandAssetIds: [ghost] } })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('accepts a brand asset that is actually in the studio folder', async () => {
    const d = deps();
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `studio/${S}/logo.png`, mimeType: 'image/png', bytes: 100n, checksumSha256: 'x'.repeat(64), isOriginal: true, folder: BRAND_ASSET_FOLDER, tags: ['logo'] } });
    const tpl = await saveStudioTemplate(d, who, { action: 'add', kind: 'story', name: 'Story with logo', spec: { aspectRatio: '9:16', brandAssetIds: [asset.id] } });
    expect(tpl.spec.brandAssetIds).toEqual([asset.id]);
  });

  it('a reader sees the list but cannot write', async () => {
    const d = deps();
    const { rows, canWrite } = await studioTemplates(d, reader);
    expect(canWrite).toBe(false);
    expect(rows.length).toBeGreaterThan(0);
    await expect(saveStudioTemplate(d, reader, { action: 'add', kind: 'image', name: 'x', spec: { aspectRatio: '1:1', brandAssetIds: [] } })).rejects.toThrow();
  });

  it('every input is validated: bad kind, empty name, a stale save', async () => {
    const d = deps();
    await expect(saveStudioTemplate(d, who, { action: 'add', kind: 'carousel', name: 'x', spec: { aspectRatio: '1:1', brandAssetIds: [] } } as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' } as Partial<StudioError>);
    await expect(saveStudioTemplate(d, who, { action: 'add', kind: 'image', name: '', spec: { aspectRatio: '1:1', brandAssetIds: [] } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const a = await saveStudioTemplate(d, who, { action: 'add', kind: 'image', name: 'Stale test', spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    await saveStudioTemplate(d, who, { action: 'update', id: a.id, name: 'Stale test 2', spec: { aspectRatio: '1:1', brandAssetIds: [] }, version: a.updatedAt });
    await expect(saveStudioTemplate(d, who, { action: 'update', id: a.id, name: 'Stale test 3', spec: { aspectRatio: '1:1', brandAssetIds: [] }, version: a.updatedAt })).rejects.toMatchObject({ code: 'STALE' });
  });
});
