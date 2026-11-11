// S23 · PR 438 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the studio's brand asset library —
// ordinary `MediaAsset` rows filed under the private `studio` folder, named by kind, archived/restored through the
// shared Media library, never deleted.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { mediaRuntime, PRIVATE_MEDIA_FOLDERS, publicMediaWhere, type MediaDeps } from '@extas/media';
import { registry, type Key, type Value } from '@extas/settings';
import { BRAND_ASSET_FOLDER, setBrandAssetArchived, setBrandAssetKind, studioBrandAssets, StudioError, type StudioDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 438 · studio brand asset library (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  let reader: Who;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const studio = (): StudioDeps => ({ db: t.prisma, settings });
  const media = (): MediaDeps => mediaRuntime({ db: t.prisma, settings, vault: null, defer: (task) => void task() });

  beforeAll(async () => {
    t = await createTestDatabase('studio_assets');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('studio.read' | 'studio.write' | 'media.manage')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    who = await staff('t438a-writer', ['studio.read', 'studio.write', 'media.manage']);
    reader = await staff('t438a-reader', ['studio.read']);
  });

  afterAll(async () => t.drop());

  const makeAsset = (key: string, tags: string[] = []) => t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `studio/${S}/${key}.png`, mimeType: 'image/png', bytes: 200n, checksumSha256: key.padEnd(64, '0'), isOriginal: true, folder: BRAND_ASSET_FOLDER, tags } });

  it('the `studio` folder is on the private list and left out of the public (product-picker) query', () => {
    expect(PRIVATE_MEDIA_FOLDERS).toContain(BRAND_ASSET_FOLDER);
    const where = publicMediaWhere();
    expect(JSON.stringify(where)).toContain(BRAND_ASSET_FOLDER);
  });

  it('lists brand assets by kind, and names a kind without touching the file\'s other tags', async () => {
    const asset = await makeAsset('logo-1', ['winter-2026']);
    const named = await setBrandAssetKind(studio(), who, { assetId: asset.id, kind: 'logo' });
    expect(named.kind).toBe('logo');
    expect(named.tags).toEqual(['winter-2026']);
    const list = await studioBrandAssets(studio(), who);
    const row = list.find((r) => r.id === asset.id);
    expect(row?.kind).toBe('logo');
    const cleared = await setBrandAssetKind(studio(), who, { assetId: asset.id, kind: null });
    expect(cleared.kind).toBeNull();
  });

  it('archives and restores a brand asset through the shared Media library; nothing is deleted', async () => {
    const asset = await makeAsset('overlay-1', []);
    await setBrandAssetKind(studio(), who, { assetId: asset.id, kind: 'overlay' });
    const archived = await setBrandAssetArchived(studio(), media(), who, { assetId: asset.id, archived: true, reason: 'retired for the season' });
    expect(archived.archived).toBe(true);
    const row = await t.prisma.mediaAsset.findUnique({ where: { id: asset.id } });
    expect(row).not.toBeNull();
    expect(row!.archivedAt).not.toBeNull();
    const restored = await setBrandAssetArchived(studio(), media(), who, { assetId: asset.id, archived: false });
    expect(restored.archived).toBe(false);
  });

  it('refuses a file outside the studio folder, and a reader who tries to write', async () => {
    const outside = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `products/${S}/shirt.png`, mimeType: 'image/png', bytes: 200n, checksumSha256: 'outside'.padEnd(64, '0'), isOriginal: true, folder: 'products', tags: [] } });
    await expect(setBrandAssetKind(studio(), who, { assetId: outside.id, kind: 'logo' })).rejects.toMatchObject({ code: 'NOT_FOUND' } as Partial<StudioError>);
    const asset = await makeAsset('reader-test', []);
    await expect(setBrandAssetKind(studio(), reader, { assetId: asset.id, kind: 'logo' })).rejects.toThrow();
  });
});
