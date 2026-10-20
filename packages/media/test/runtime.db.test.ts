// PR 22 follow-up — the media service as the app builds it (mediaRuntime), with no Blob, no S3 and no media volume
// (EXTAS_MEDIA_DIR unset: a laptop, CI, a preview), so storage runs on the adapter's mock. Before the fix the mock was
// a new in-memory store per connection lookup: the upload wrote the original into one store, the size job read it
// from another (looked up by the provider it was written to), found nothing, and no size was ever made — the product
// admin showed only the colour box. Throwaway database; skipped without TEST_DATABASE_ADMIN_URL.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { syncAuth, SYSTEM } from '@extas/auth';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { imageSources, mediaRuntime, renditionFile, uploadImage, type MediaDeps } from '../src';
import { photo } from './fixtures';
import { createTestDatabase, HAS_DB, seedStores, type TestDatabase } from './pg';

describe.skipIf(!HAS_DB)('media runtime on the storage mock (no media volume)', () => {
  let t: TestDatabase;
  let store = 0;
  let settings: SettingsResolver<typeof registry>;
  const build = (): MediaDeps => mediaRuntime({ db: t.prisma, settings, vault: null, env: {} });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('runtime');
    [store] = await seedStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    settings = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    await settings.set('media.image.avifEffort', 0, INSTALLATION); // fast AVIF in tests
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('an uploaded photo gets all its sizes, and every size can be served — by this runtime and by a new one', async () => {
    const deps = build();
    const r = await uploadImage(deps, SYSTEM, { storeId: store, body: await photo(1200, 1500), fileName: 'mock-front.jpg', name: 'Mock front' });
    expect(r.processing).toBe('done');
    expect(r.asset.status).toBe('ready');
    expect(r.asset.renditions).toBe(15);
    const src = (await imageSources(deps, store, [r.asset.id])).get(r.asset.id)!;
    expect(src.variants).toHaveLength(15);
    const keys = (await t.prisma.mediaRendition.findMany({ where: { assetId: r.asset.id }, select: { storageKey: true, format: true } }));
    // another part of the app (the /media route, a page) builds its own runtime: the files are still there
    const other = build();
    for (const k of keys) {
      const f = await renditionFile(other, k.storageKey);
      expect(f?.contentType, k.storageKey).toBe(`image/${k.format}`);
      expect(f!.body.byteLength).toBeGreaterThan(0);
    }
  });
});
