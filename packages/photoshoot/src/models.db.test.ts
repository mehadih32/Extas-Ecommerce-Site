// S24 · PR 445 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the model library CRUD, its
// reference-photo links and its append-only consent records.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { addModelAsset, createModel, listConsents, listModelAssets, listModels, recordConsent, removeModelAsset, setModelArchived, updateModel } from './models';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 445 · photoshoot model library (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_models');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.write')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t445-writer', ['photoshoot.read', 'photoshoot.write']);
    reader = await staff('t445-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true },
    });
  }

  it('adds a model, lists it, and a reader cannot write', async () => {
    const d = deps();
    const m = await createModel(d, writer, { name: 'Rafi', kind: 'full_body', gender: 'men', heightCm: 178 });
    expect(m.name).toBe('Rafi');
    expect(m.archivedAt).toBeNull();
    const list = await listModels(d, writer);
    expect(list.map((r) => r.id)).toContain(m.id);
    await expect(createModel(d, reader, { name: 'x', kind: 'full_body' })).rejects.toThrow();
  });

  it('refuses an unknown kind', async () => {
    const d = deps();
    await expect(createModel(d, writer, { name: 'Bad kind', kind: 'robot' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('updates a model without touching unrelated fields', async () => {
    const d = deps();
    const m = await createModel(d, writer, { name: 'Before', kind: 'full_body' });
    const updated = await updateModel(d, writer, m.id, { name: 'After' });
    expect(updated.name).toBe('After');
    expect(updated.kind).toBe('full_body');
  });

  it('archives and restores a model; never deletes it', async () => {
    const d = deps();
    const m = await createModel(d, writer, { name: 'Archive me', kind: 'full_body' });
    const archived = await setModelArchived(d, writer, m.id, true);
    expect(archived.archivedAt).not.toBeNull();
    const restored = await setModelArchived(d, writer, m.id, false);
    expect(restored.archivedAt).toBeNull();
  });

  it('attaches a reference photo per angle, refuses an unknown angle and a non-original source, and lists it', async () => {
    const d = deps();
    const m = await createModel(d, writer, { name: 'Has photos', kind: 'full_body' });
    const photo = await makeOriginal();
    const linked = await addModelAsset(d, writer, { modelId: m.id, assetId: photo.id, angle: 'front' });
    expect(linked.angle).toBe('front');
    const list = await listModelAssets(d, writer, m.id);
    expect(list.map((r) => r.id)).toContain(linked.id);
    await expect(addModelAsset(d, writer, { modelId: m.id, assetId: photo.id, angle: 'sideways' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const generated = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'test/gen.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: 'b'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: photo.id } });
    await expect(addModelAsset(d, writer, { modelId: m.id, assetId: generated.id, angle: 'back' })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses a photo from another store, and unlinking removes only the link, never the file', async () => {
    const d = deps();
    const m = await createModel(d, writer, { name: 'Cross-store', kind: 'full_body' });
    const foreignPhoto = await makeOriginal(other);
    await expect(addModelAsset(d, writer, { modelId: m.id, assetId: foreignPhoto.id, angle: 'front' })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
    const ownPhoto = await makeOriginal();
    const linked = await addModelAsset(d, writer, { modelId: m.id, assetId: ownPhoto.id, angle: 'front' });
    await removeModelAsset(d, writer, linked.id);
    const list = await listModelAssets(d, writer, m.id);
    expect(list.map((r) => r.id)).not.toContain(linked.id);
    const fileStillThere = await t.prisma.mediaAsset.findUnique({ where: { id: ownPhoto.id } });
    expect(fileStillThere).not.toBeNull();
  });

  it('records consent, lists it, refuses a future grant date and an expiry before the grant', async () => {
    const d = deps();
    const m = await createModel(d, writer, { name: 'Consented', kind: 'full_body' });
    const grantedAt = new Date('2026-01-01T00:00:00Z');
    const consent = await recordConsent(d, writer, { modelId: m.id, scope: 'product_photography', grantedAt });
    expect(consent.scope).toBe('product_photography');
    expect(consent.expiresAt).toBeNull();
    const list = await listConsents(d, writer, m.id);
    expect(list.map((c) => c.id)).toContain(consent.id);
    await expect(recordConsent(d, writer, { modelId: m.id, scope: 'x', grantedAt: new Date(Date.now() + 86_400_000) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(recordConsent(d, writer, { modelId: m.id, scope: 'x', grantedAt, expiresAt: new Date('2025-01-01T00:00:00Z') })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses consent for a model that does not exist in this store', async () => {
    const d = deps();
    await expect(recordConsent(d, writer, { modelId: '00000000-0000-0000-0000-000000000000', scope: 'x', grantedAt: new Date() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a reader without photoshoot.write is refused on every mutation', async () => {
    const d = deps();
    const m = await createModel(d, writer, { name: 'Guarded', kind: 'full_body' });
    await expect(updateModel(d, reader, m.id, { name: 'nope' })).rejects.toThrow();
    await expect(setModelArchived(d, reader, m.id, true)).rejects.toThrow();
    await expect(recordConsent(d, reader, { modelId: m.id, scope: 'x', grantedAt: new Date() })).rejects.toThrow();
  });
});
