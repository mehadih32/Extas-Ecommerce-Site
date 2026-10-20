// The media library on a real PostgreSQL (throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL), on the storage contract of PR 18 through the memory and the local-disk adapters:
// upload → archived original → 15 renditions → reuse → search → product gallery and the photo minimum → orphans
// (archive only, logged, restorable, nothing removed from storage) → the watermarked download → permissions and
// store isolation.
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localDiskStorage, memoryStorage, type Storage } from '@extas/adapters';
import { syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import {
  archiveMedia,
  archiveOrphans,
  attachToProduct,
  detachFromProduct,
  downloadCopy,
  findOrphans,
  getMedia,
  imageSources,
  isRenditionKey,
  MediaError,
  pendingAssets,
  photoSetStatus,
  productGallery,
  regenerateAll,
  renderAsset,
  renditionFile,
  requirePhotoSet,
  restoreMedia,
  searchMedia,
  sha256,
  storeGeneratedFile,
  updateMedia,
  uploadImage,
  type MediaDeps,
} from '../src';
import { photo } from './fixtures';
import { createTestDatabase, HAS_DB, seedStores, type TestDatabase } from './pg';

const DAY = 24 * 3600 * 1000;

/** A storage that counts what it is asked to do (the interface has no delete: nothing can be removed). */
function counting(inner: Storage) {
  const calls = { put: 0, get: 0 };
  const s: Storage = {
    provider: inner.provider,
    put: (...a) => (calls.put++, inner.put(...a)),
    get: (...a) => (calls.get++, inner.get(...a)),
    head: (...a) => inner.head(...a),
  };
  return { storage: s, calls };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    if (e instanceof MediaError) return e.code;
    if (e instanceof Error && 'code' in e) return String((e as { code: unknown }).code);
    throw e;
  }
}

function suite(name: string, makeStorage: () => Promise<{ storage: Storage; cleanup?: () => Promise<void> }>, full: boolean) {
  describe.skipIf(!HAS_DB)(`media library on PostgreSQL · ${name} storage`, () => {
    let t: TestDatabase;
    let deps: MediaDeps;
    let settings: SettingsResolver<typeof registry>;
    let stores: [number, number];
    let calls: { put: number; get: number };
    let storage: Storage;
    let cleanup: (() => Promise<void>) | undefined;
    let now = new Date('2026-10-20T06:00:00Z');
    const actor: Actor = SYSTEM;
    let nobody: Actor;

    beforeAll(async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      t = await createTestDatabase(name.replace(/\W/g, ''));
      stores = await seedStores(t.prisma);
      await syncSettings(t.prisma, { registry, messages });
      await syncAuth(t.prisma);
      const made = await makeStorage();
      cleanup = made.cleanup;
      const c = counting(made.storage);
      storage = c.storage;
      calls = c.calls;
      settings = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
      await settings.set('media.image.avifEffort', 0, INSTALLATION); // fast AVIF in tests
      deps = { db: t.prisma, settings, storage: async () => storage, now: () => now };
      const staff = await t.prisma.staffUser.create({ data: { email: 'helper@example.com', displayName: 'Sample helper', passwordHash: 'x' } });
      nobody = { staffUserId: staff.id };
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      await t?.drop();
      await cleanup?.();
    });

    let front: string;

    it('uploads: the original is archived as it came, 5 sizes × 3 formats at 4:5 are made and recorded, all logged', async () => {
      const body = await photo(1600, 2000);
      const r = await uploadImage(deps, actor, { storeId: stores[0], body, fileName: 'IMG_0001.JPG', name: 'Pique polo navy front', altEn: 'Navy pique polo, front', tags: ['Polo', 'navy'] });
      expect(r.reused).toBe(false);
      expect(r.processing).toBe('done');
      expect(r.asset.status).toBe('ready');
      expect(r.asset.renditions).toBe(15);
      expect(r.asset.tags).toEqual(['polo', 'navy']);
      front = r.asset.id;
      const a = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: front }, include: { renditions: true } });
      expect(a.storageKey).toMatch(/^media\/s\d+\/o\/2026\/10\/[0-9a-f]{16}-pique-polo-navy-front\.jpg$/);
      expect(a.storage).toBe(storage.provider);
      expect(a.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
      expect([a.width, a.height, a.mimeType]).toEqual([1600, 2000, 'image/jpeg']);
      const original = await storage.get(a.storageKey);
      expect(original && sha256(original.body)).toBe(sha256(body)); // kept byte for byte
      for (const rn of a.renditions) {
        expect(isRenditionKey(rn.storageKey), rn.storageKey).toBe(true);
        expect(rn.height).toBe(Math.round((rn.width * 5) / 4));
        const f = await storage.get(rn.storageKey);
        expect(f?.contentType).toBe(`image/${rn.format}`);
        expect(f?.body.byteLength).toBe(rn.bytes);
      }
      expect(a.renditions.map((x) => `${x.preset}:${x.width}`).filter((x, i, all) => all.indexOf(x) === i).sort()).toEqual(['card2x:800', 'card:400', 'main:1200', 'thumb:160', 'zoom:1600']);
      const log = await t.prisma.auditLog.findMany({ where: { entityId: front }, orderBy: { createdAt: 'asc' } });
      expect(log.map((l) => l.action)).toEqual(['media.upload', 'media.render']);
    });

    it('serves renditions by their key, never the original; the picture data carries sizes, colour and addresses', async () => {
      const a = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: front }, include: { renditions: true } });
      const card = a.renditions.find((r) => r.preset === 'card' && r.format === 'avif')!;
      const file = await renditionFile(deps, card.storageKey);
      expect(file?.contentType).toBe('image/avif');
      expect(await renditionFile(deps, a.storageKey)).toBeNull();
      const src = (await imageSources(deps, stores[0], [front])).get(front)!;
      expect(src.variants).toHaveLength(15);
      expect(src.dominantColor).toBe(a.dominantColor);
      expect(src.variants[0]!.url.startsWith('/media/media/s')).toBe(true);
      await settings.set('media.publicBaseUrl', 'https://cdn.example.com', storeTarget(stores[0]));
      expect((await imageSources(deps, stores[0], [front])).get(front)!.variants[0]!.url.startsWith('https://cdn.example.com/media/s')).toBe(true);
      await settings.reset('media.publicBaseUrl', storeTarget(stores[0]));
    });

    it('reuse: the same photo uploaded again is the same file, not a second copy', async () => {
      const before = await t.prisma.mediaAsset.count();
      const again = await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1600, 2000), fileName: 'copy.jpg' });
      expect(again.reused).toBe(true);
      expect(again.asset.id).toBe(front);
      expect(await t.prisma.mediaAsset.count()).toBe(before);
      expect((await renderAsset(deps, front)).status).toBe('unchanged');
    });

    it('refuses what is not a usable photo, with a code for each reason', async () => {
      const s = stores[0];
      expect(await code(uploadImage(deps, actor, { storeId: s, body: await photo(800, 1000) }))).toBe('TOO_SMALL');
      expect(await code(uploadImage(deps, actor, { storeId: s, body: new TextEncoder().encode('just text') }))).toBe('NOT_AN_IMAGE');
      expect(await code(uploadImage(deps, actor, { storeId: s, body: new Uint8Array() }))).toBe('INVALID_INPUT');
      await settings.set('media.upload.acceptedTypes', ['image/jpeg'], INSTALLATION);
      expect(await code(uploadImage(deps, actor, { storeId: s, body: await photo(1200, 1500, 'png') }))).toBe('TYPE_NOT_ALLOWED');
      await settings.reset('media.upload.acceptedTypes', INSTALLATION);
      await settings.set('media.upload.maxBytes', 1024 * 1024, INSTALLATION);
      const noise = await sharp(randomBytes(1200 * 1500 * 3), { raw: { width: 1200, height: 1500, channels: 3 } }).png().toBuffer();
      expect(noise.byteLength).toBeGreaterThan(1024 * 1024);
      expect(await code(uploadImage(deps, actor, { storeId: s, body: new Uint8Array(noise) }))).toBe('TOO_LARGE');
      await settings.reset('media.upload.maxBytes', INSTALLATION);
    });

    if (full) {
      let back: string, detail: string, model: string, spare: string, logo: string;
      let product: string, other: string, colour: string;

      it('a quality change remakes every size under new names; the old files stay in storage and the change is logged', async () => {
        const old = await t.prisma.mediaRendition.findMany({ where: { assetId: front } });
        await settings.set('media.image.quality', 75, storeTarget(stores[0]));
        expect(await regenerateAll(deps, actor, { storeId: stores[0] })).toBe('done');
        const fresh = await t.prisma.mediaRendition.findMany({ where: { assetId: front } });
        expect(fresh).toHaveLength(15);
        expect(fresh.every((r) => r.quality === 75 && !old.some((o) => o.storageKey === r.storageKey))).toBe(true);
        for (const o of old) expect(await storage.head(o.storageKey), o.storageKey).not.toBeNull();
        const log = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: front, action: 'media.render' }, orderBy: { createdAt: 'desc' } });
        expect((log.before as { replacedFiles: string[] }).replacedFiles).toHaveLength(15);
        await settings.reset('media.image.quality', storeTarget(stores[0]));
      });

      it('search: words in the name, alt text or tags; kind, usage and archive filters; pages', async () => {
        back = (await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1200, 1500), name: 'polo navy back', tags: ['polo'] })).asset.id;
        detail = (await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1300, 1625), name: 'polo collar detail', altBn: 'কলারের কাছ থেকে তোলা ছবি' })).asset.id;
        model = (await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1400, 1750), name: 'model wearing polo' })).asset.id;
        spare = (await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1500, 1875), name: 'spare shot' })).asset.id;
        logo = (await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1250, 1250), name: 'shop logo' })).asset.id;
        const ids = async (q: Parameters<typeof searchMedia>[2]) => (await searchMedia(deps, actor, q)).items.map((i) => i.id);
        expect(await ids({ storeId: stores[0], q: 'pique' })).toEqual([front]);
        expect((await ids({ storeId: stores[0], q: 'polo' })).sort()).toEqual([front, back, detail, model].sort());
        expect(await ids({ storeId: stores[0], q: 'কলারের' })).toEqual([detail]);
        expect((await ids({ storeId: stores[0], tag: 'polo' })).sort()).toEqual([front, back].sort());
        expect(await ids({ storeId: stores[1] })).toEqual([]); // store isolation
        const p1 = await searchMedia(deps, actor, { storeId: stores[0], take: 2 });
        const p2 = await searchMedia(deps, actor, { storeId: stores[0], take: 2, cursor: p1.nextCursor });
        expect(p1.items).toHaveLength(2);
        expect(p2.items.map((i) => i.id).some((id) => p1.items.some((x) => x.id === id))).toBe(false);
        const upd = await updateMedia(deps, actor, { storeId: stores[0], id: spare }, { altEn: 'Spare', folder: 'shoots/oct' });
        expect([upd.altEn, upd.folder]).toEqual(['Spare', 'shoots/oct']);
        expect(await ids({ storeId: stores[0], folder: 'shoots/oct' })).toEqual([spare]);
      });

      it('the photo minimum: four photos (front, back, detail, on-model) before a product may go live', async () => {
        product = (await t.prisma.product.create({ data: { storeId: stores[0], slug: 'sample-polo', nameEn: 'Sample polo' } })).id;
        other = (await t.prisma.product.create({ data: { storeId: stores[0], slug: 'sample-polo-2', nameEn: 'Sample polo two' } })).id;
        colour = (await t.prisma.colour.create({ data: { storeId: stores[0], key: 'navy', nameEn: 'Navy', hex: '#142050' } })).id;
        const s = { storeId: stores[0], productId: product };
        expect((await photoSetStatus(deps, s)).missing).toEqual(['FRONT', 'BACK', 'DETAIL', 'ON_MODEL']);
        await attachToProduct(deps, actor, { ...s, assetId: front, role: 'FRONT', colourId: colour, isPrimary: true });
        await attachToProduct(deps, actor, { ...s, assetId: back, role: 'BACK' });
        const three = await attachToProduct(deps, actor, { ...s, assetId: detail, role: 'DETAIL' });
        expect(three.status).toMatchObject({ ok: false, count: 3, minimum: 4, missing: ['ON_MODEL'] });
        expect(await code(requirePhotoSet(deps, s))).toBe('PHOTOS_MISSING');
        const four = await attachToProduct(deps, actor, { ...s, assetId: model, role: 'ON_MODEL' });
        expect(four.status).toMatchObject({ ok: true, count: 4, missing: [] });
        expect(four.photos.map((p) => p.role)).toEqual(['FRONT', 'BACK', 'DETAIL', 'ON_MODEL']); // per-colour photos first, then the shared ones
        // idempotent: the same photo in the same place is one link
        expect((await attachToProduct(deps, actor, { ...s, assetId: model, role: 'ON_MODEL' })).photos).toHaveLength(4);
        // per-colour fronts when the store asks for them
        await t.prisma.productColour.create({ data: { storeId: stores[0], productId: product, colourId: colour } });
        await settings.set('media.photos.frontPerColour', true, storeTarget(stores[0]));
        expect((await photoSetStatus(deps, s)).ok).toBe(true);
        const white = (await t.prisma.colour.create({ data: { storeId: stores[0], key: 'white', nameEn: 'White', hex: '#ffffff' } })).id;
        await t.prisma.productColour.create({ data: { storeId: stores[0], productId: product, colourId: white } });
        expect((await photoSetStatus(deps, s)).missing).toEqual([`FRONT:${white}`]);
        await settings.reset('media.photos.frontPerColour', storeTarget(stores[0]));
        // reuse across products, and taking a photo off keeps the file and the history
        await attachToProduct(deps, actor, { storeId: stores[0], productId: other, assetId: front, role: 'FRONT' });
        const g = await productGallery(deps, actor, { storeId: stores[0], productId: other });
        const off = await detachFromProduct(deps, actor, { storeId: stores[0], productId: other, productMediaId: g.photos[0]!.id });
        expect(off.photos).toHaveLength(0);
        expect(await t.prisma.productMedia.count({ where: { productId: other } })).toBe(1);
        expect(await code(attachToProduct(deps, actor, { storeId: stores[1], productId: product, assetId: front, role: 'BACK' }))).toBe('NOT_FOUND');
        expect(await code(attachToProduct(deps, actor, { ...s, assetId: front, role: 'VIDEO' }))).toBe('INVALID_INPUT');
      });

      it('orphans: only files used nowhere and past the wait; clean-up archives (logged, restorable), never removes', async () => {
        // the logo is used by a setting, the spare by nothing; a category image counts as a use too
        await t.prisma.installationSettingValue.create({ data: { key: 'brand.logo', value: logo } });
        const fresh = (await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1210, 1512), name: 'too new' })).asset.id;
        expect((await findOrphans(deps, actor, { storeId: stores[0] })).items).toEqual([]); // nothing is old enough yet
        now = new Date(now.getTime() + 31 * DAY);
        const later = (await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1220, 1525), name: 'brand new' })).asset.id;
        const list = (await findOrphans(deps, actor, { storeId: stores[0] })).items.map((i) => i.id);
        expect(list.sort()).toEqual([spare, fresh].sort());
        await t.prisma.category.create({ data: { storeId: stores[0], slug: 'polos', nameEn: 'Polos', imageAssetId: fresh } });
        const before = await storage.head((await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: spare } })).storageKey);
        const r = await archiveOrphans(deps, actor, { storeId: stores[0], assetIds: [spare, fresh, later, front, logo], reason: 'monthly clean-up' });
        expect(r.archived).toEqual([spare]);
        expect(Object.fromEntries(r.skipped.map((x) => [x.id, x.why]))).toEqual({ [fresh]: 'IN_USE', [later]: 'TOO_NEW', [front]: 'IN_USE', [logo]: 'IN_USE' });
        const a = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: spare }, include: { renditions: true } });
        expect(a.archivedAt).not.toBeNull();
        expect(await storage.head(a.storageKey)).toEqual(before); // the original is still there
        for (const rn of a.renditions) expect(await storage.head(rn.storageKey)).not.toBeNull();
        expect(await renditionFile(deps, a.renditions[0]!.storageKey)).toBeNull(); // but no longer served
        const log = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: spare, action: 'media.orphan.archive' } });
        expect(log.after).toMatchObject({ reason: 'monthly clean-up', graceDays: 30 });
        expect((await searchMedia(deps, actor, { storeId: stores[0], archived: 'only' })).items.map((i) => i.id)).toEqual([spare]);
        expect(await code(archiveOrphans(deps, actor, { storeId: stores[0], assetIds: [spare], reason: '' }))).toBe('INVALID_INPUT');
        const back2 = await restoreMedia(deps, actor, { storeId: stores[0], id: spare });
        expect(back2.archivedAt).toBeNull();
        expect(back2.status).toBe('ready');
        // archiving a file in use is refused and says where it is used
        const e = await archiveMedia(deps, actor, { storeId: stores[0], id: front }, 'not needed').catch((x) => x as MediaError);
        expect(e).toBeInstanceOf(MediaError);
        expect((e as MediaError).code).toBe('STILL_IN_USE');
        expect((e as MediaError).details).toContain('ProductMedia.assetId');
        expect((await getMedia(deps, actor, { storeId: stores[0], id: logo })).uses).toEqual([{ where: 'setting:brand.logo', count: 1 }]);
      });

      it('download: a watermarked copy of the main JPEG, made once and kept; the shop image stays clean', async () => {
        const clean = await t.prisma.mediaRendition.findUniqueOrThrow({ where: { assetId_preset_format: { assetId: front, preset: 'main', format: 'jpeg' } } });
        const cleanBefore = sha256((await storage.get(clean.storageKey))!.body);
        const d = await downloadCopy(deps, front);
        expect(d.watermarked).toBe(true);
        expect(d.fileName).toBe('pique-polo-navy-front.jpg');
        expect(sha256(d.body)).not.toBe(cleanBefore);
        expect((await sharp(d.body).metadata()).width).toBe(1200);
        expect(sha256((await storage.get(clean.storageKey))!.body)).toBe(cleanBefore);
        const puts = calls.put;
        const again = await downloadCopy(deps, front);
        expect(calls.put).toBe(puts); // the stamped copy is reused
        expect(sha256(again.body)).toBe(sha256(d.body));
        // another text → another copy; switched off → the clean file
        await settings.set('media.watermark.text', 'Sample mark', storeTarget(stores[0]));
        expect(sha256((await downloadCopy(deps, front)).body)).not.toBe(sha256(d.body));
        await settings.set('media.watermark.enabled', false, storeTarget(stores[0]));
        const off = await downloadCopy(deps, front);
        expect([off.watermarked, sha256(off.body)]).toEqual([false, cleanBefore]);
        await settings.reset('media.watermark.enabled', storeTarget(stores[0]));
        await settings.reset('media.watermark.text', storeTarget(stores[0]));
        // only photos on a product gallery can be downloaded this way
        expect(await code(downloadCopy(deps, spare))).toBe('NOT_FOUND');
      });

      it('permissions: a staff member without a media role can do nothing; generated files go in the library too', async () => {
        const s = stores[0];
        expect(await code(uploadImage(deps, nobody, { storeId: s, body: await photo(1200, 1500) }))).toBe('FORBIDDEN');
        expect(await code(searchMedia(deps, nobody, { storeId: s }))).toBe('FORBIDDEN');
        expect(await code(findOrphans(deps, nobody, { storeId: s }))).toBe('FORBIDDEN');
        expect(await code(archiveOrphans(deps, nobody, { storeId: s, assetIds: [spare], reason: 'x' }))).toBe('FORBIDDEN');
        expect(await code(attachToProduct(deps, nobody, { storeId: s, productId: product, assetId: front, role: 'BACK' }))).toBe('FORBIDDEN');
        const pdf = await storeGeneratedFile(deps, { storeId: s, kind: 'PDF', body: new TextEncoder().encode('%PDF-1.7 sample'), contentType: 'application/pdf', name: 'invoice sample 1001', extension: 'pdf', folder: 'invoices' });
        expect([pdf.kind, pdf.status, pdf.folder]).toEqual(['PDF', 'stored', 'invoices']);
        expect(await pendingAssets(deps, { storeId: s, take: 50 })).toEqual([]);
      });
    }

    it('the job is safe to run again and a file whose original vanished is reported, not half-made', async () => {
      const id = (await uploadImage(deps, actor, { storeId: stores[0], body: await photo(1230, 1537), name: 'job check' })).asset.id;
      expect((await renderAsset(deps, id)).status).toBe('unchanged');
      expect((await renderAsset(deps, id, { force: true })).status).toBe('rendered');
      expect(await t.prisma.mediaRendition.count({ where: { assetId: id } })).toBe(15);
      const lost = await t.prisma.mediaAsset.create({
        data: { storeId: stores[0], kind: 'IMAGE', storage: storage.provider, storageKey: 'media/s1/o/2026/10/0000000000000000-lost.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: '0'.repeat(64) },
      });
      expect(await code(renderAsset(deps, lost.id))).toBe('NOT_FOUND');
      expect(await t.prisma.mediaRendition.count({ where: { assetId: lost.id } })).toBe(0);
    });
  });
}

suite('memory', async () => ({ storage: memoryStorage('LOCAL_DISK') }), true);
suite('local-disk', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'media-test-'));
  return { storage: localDiskStorage(root), cleanup: () => rm(root, { recursive: true, force: true }) };
}, false);
