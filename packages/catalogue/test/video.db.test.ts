// S28 · PR 681 — product video on a real PostgreSQL: off as shipped, link or clip, one active video per product (the
// old is archived, never deleted), who may change it, store isolation, audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { getProductVideo, removeProductVideo, setFileVideo, setLinkVideo, updateProductVideo, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('product video on PostgreSQL (PR 681)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let on = false;
  const override: Record<string, unknown> = {};
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      if (key === 'catalogue.video') return { ...registry['catalogue.video'].default, on, ...override } as Value<K>;
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings });
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let editor: Actor;
  let reader: Actor;
  let product = '';
  let clip = '';
  let poster = '';

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_video');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    editor = await staff('v-editor@example.com', ['catalogue.read', 'catalogue.write']);
    reader = await staff('v-reader@example.com', ['catalogue.read']);
    product = (await t.prisma.product.create({ data: { storeId: A, slug: 'v-polo', nameEn: 'Sample polo' }, select: { id: true } })).id;
    const mk = (kind: 'VIDEO' | 'IMAGE', key: string, bytes: number) =>
      t.prisma.mediaAsset.create({
        data: {
          storeId: A,
          kind,
          storage: 'LOCAL_DISK',
          storageKey: key,
          mimeType: kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
          bytes: BigInt(bytes),
          checksumSha256: key,
          isOriginal: true,
          tags: [],
        },
        select: { id: true },
      });
    clip = (await mk('VIDEO', 'clip-1', 2_000_000)).id;
    poster = (await mk('IMAGE', 'poster-1', 1000)).id;
  }, 300_000);
  afterAll(async () => t?.drop());

  it('is off as shipped: nothing can be added until the switch is on', async () => {
    expect(await code(setLinkVideo(deps(), as(editor), product, { url: 'https://youtu.be/abcDEF12345' }))).toBe('CONFLICT');
    expect(await getProductVideo(deps(), as(reader), product)).toBeNull();
  });

  it('takes a YouTube link, refuses other links and providers that are switched off, and needs catalogue.write', async () => {
    on = true;
    expect(await code(setLinkVideo(deps(), as(reader), product, { url: 'https://youtu.be/abcDEF12345' }))).toBe('FORBIDDEN');
    expect(await code(setLinkVideo(deps(), as(editor), product, { url: 'https://example.com/x.mp4' }))).toBe('INVALID_INPUT');
    override.providers = ['VIMEO'];
    expect(await code(setLinkVideo(deps(), as(editor), product, { url: 'https://youtu.be/abcDEF12345' }))).toBe('INVALID_INPUT');
    delete override.providers;
    const v = await setLinkVideo(deps(), as(editor), product, { url: 'https://youtu.be/abcDEF12345', durationSec: 15, posterAssetId: poster });
    expect(v).toMatchObject({ source: 'LINK', provider: 'YOUTUBE', embedId: 'abcDEF12345', durationSec: 15, posterAssetId: poster });
    expect((await getProductVideo(deps(), as(reader), product))?.id).toBe(v.id);
  });

  it('a new video archives the old one; the clip must be a video of this store within the size limit', async () => {
    expect(await code(setFileVideo(deps(), as(editor), product, { assetId: poster }))).toBe('INVALID_INPUT');
    override.maxUploadMb = 1;
    expect(await code(setFileVideo(deps(), as(editor), product, { assetId: clip }))).toBe('INVALID_INPUT');
    delete override.maxUploadMb;
    override.allowUpload = false;
    expect(await code(setFileVideo(deps(), as(editor), product, { assetId: clip }))).toBe('CONFLICT');
    delete override.allowUpload;
    const v = await setFileVideo(deps(), as(editor), product, { assetId: clip, durationSec: 20 });
    expect(v).toMatchObject({ source: 'FILE', provider: 'FILE', fileAssetId: clip });
    const rows = await t.prisma.productVideo.findMany({ where: { productId: product }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.archivedAt !== null)).toEqual([true, false]);
    expect((await getProductVideo(deps(), as(reader), product))?.id).toBe(v.id);
  });

  it('updates length and title, removes by archiving, and never shows another store its rows', async () => {
    const v = await updateProductVideo(deps(), as(editor), product, { durationSec: 25, titleEn: 'On model' });
    expect([v.durationSec, v.titleEn]).toEqual([25, 'On model']);
    expect(await code(getProductVideo(deps(), as(reader, B), product))).toBe('FORBIDDEN');
    await removeProductVideo(deps(), as(editor), product);
    expect(await getProductVideo(deps(), as(reader), product)).toBeNull();
    expect(await t.prisma.productVideo.count({ where: { productId: product } })).toBe(2); // nothing deleted
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'video.' } } })).toBeGreaterThanOrEqual(4);
    expect(await code(removeProductVideo(deps(), as(editor), product))).toBe('NOT_FOUND');
  });
});
