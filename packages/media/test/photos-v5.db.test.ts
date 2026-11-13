// S28 · PR 680 — easy photo handling on a real PostgreSQL: reorder (the first becomes main), tag a colour, the quality
// notes (off until the switch is on) and the one-click fix (a corrected copy takes the place; the old file stays).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { memoryStorage } from '@extas/adapters';
import { syncAuth, SYSTEM } from '@extas/auth';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import {
  attachToProduct,
  fixProductPhoto,
  MediaError,
  productGallery,
  productPhotoQuality,
  reorderProductPhotos,
  tagProductPhotoColour,
  uploadImage,
  type MediaDeps,
} from '../src';
import { createTestDatabase, HAS_DB, seedStores, type TestDatabase } from './pg';

describe.skipIf(!HAS_DB)('photo handling (PR 680) on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: MediaDeps;
  let settings: SettingsResolver<typeof registry>;
  let store: number;
  const ids: string[] = [];
  let product: string;
  let colour: string;

  const wide = async () =>
    new Uint8Array(
      await sharp({
        create: {
          width: 1300,
          height: 1300,
          channels: 3,
          background: { r: 240, g: 240, b: 240 },
        },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 500,
                height: 500,
                channels: 3,
                background: { r: 90, g: 60, b: 40 },
              },
            })
              .png()
              .toBuffer(),
            left: 400,
            top: 400,
          },
        ])
        .jpeg()
        .toBuffer(),
    );

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('photosv5');
    store = (await seedStores(t.prisma))[0];
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    const storage = memoryStorage();
    settings = new SettingsResolver(prismaBackend(t.prisma), registry, {
      checkIntervalMs: 0,
    });
    await settings.set('media.image.avifEffort', 0, INSTALLATION);
    deps = { db: t.prisma, settings, storage: async () => storage };
    product = (
      await t.prisma.product.create({
        data: { storeId: store, slug: 'p5', nameEn: 'P5' },
      })
    ).id;
    colour = (
      await t.prisma.colour.create({
        data: { storeId: store, key: 'navy', nameEn: 'Navy', hex: '#142050' },
      })
    ).id;
    for (let i = 0; i < 3; i++) {
      const body = new Uint8Array(
        await sharp({
          create: {
            width: 1300 + i * 10,
            height: 1625,
            channels: 3,
            background: { r: 200 + i, g: 200, b: 200 },
          },
        })
          .jpeg()
          .toBuffer(),
      );
      ids.push(
        (
          await uploadImage(deps, SYSTEM, {
            storeId: store,
            body,
            name: `shot ${i}`,
          })
        ).asset.id,
      );
    }
    await attachToProduct(deps, SYSTEM, {
      storeId: store,
      productId: product,
      assetId: ids[0]!,
      role: 'FRONT',
      isPrimary: true,
    });
    await attachToProduct(deps, SYSTEM, {
      storeId: store,
      productId: product,
      assetId: ids[1]!,
      role: 'BACK',
    });
    await attachToProduct(deps, SYSTEM, {
      storeId: store,
      productId: product,
      assetId: ids[2]!,
      role: 'DETAIL',
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('reorders: the first in the list becomes the main photo, the rest keep their order', async () => {
    const g0 = await productGallery(deps, SYSTEM, {
      storeId: store,
      productId: product,
    });
    const [a, b, c] = g0.photos.map((p) => p.id);
    const g = await reorderProductPhotos(deps, SYSTEM, {
      storeId: store,
      productId: product,
      orderedIds: [c!, a!],
    });
    expect(g.photos.map((p) => p.id)).toEqual([c, a, b]);
    expect(g.photos.map((p) => p.isPrimary)).toEqual([true, false, false]);
    await expect(
      reorderProductPhotos(deps, SYSTEM, {
        storeId: store,
        productId: product,
        orderedIds: ['00000000-0000-7000-8000-000000000000'],
      }),
    ).rejects.toBeInstanceOf(MediaError);
  });

  it('tags a photo with a colour and puts it last there, never main', async () => {
    const g0 = await productGallery(deps, SYSTEM, {
      storeId: store,
      productId: product,
    });
    const id = g0.photos[0]!.id;
    const g = await tagProductPhotoColour(deps, SYSTEM, {
      storeId: store,
      productId: product,
      productMediaId: id,
      colourId: colour,
    });
    const moved = g.photos.find((p) => p.id === id)!;
    expect([moved.colourId, moved.isPrimary, moved.sortOrder]).toEqual([colour, false, 0]);
    await expect(
      tagProductPhotoColour(deps, SYSTEM, {
        storeId: store,
        productId: product,
        productMediaId: id,
        colourId: '00000000-0000-7000-8000-000000000000',
      }),
    ).rejects.toBeInstanceOf(MediaError);
  });

  it('quality notes stay off until the switch is on; then a wrong-shape photo is noted and fixed in one click', async () => {
    const off = await productPhotoQuality(deps, SYSTEM, {
      storeId: store,
      productId: product,
    });
    expect(off.on).toBe(false);
    expect(off.photos.every((p) => p.report === null)).toBe(true);
    const sq = (
      await uploadImage(deps, SYSTEM, {
        storeId: store,
        body: await wide(),
        name: 'square shot',
      })
    ).asset.id;
    await attachToProduct(deps, SYSTEM, {
      storeId: store,
      productId: product,
      assetId: sq,
      role: 'OTHER',
    });
    await settings.set('media.quality', { ...registry['media.quality'].default, on: true, minSide: 500 }, storeTarget(store));
    const q = await productPhotoQuality(deps, SYSTEM, {
      storeId: store,
      productId: product,
    });
    const bad = q.photos.find((p) => p.assetId === sq)!;
    expect(bad.report!.issues).toContain('ratio');
    const g = await fixProductPhoto(deps, SYSTEM, {
      storeId: store,
      productId: product,
      productMediaId: bad.productMediaId,
    });
    const after = g.photos.find((p) => p.id === bad.productMediaId)!;
    expect(after.assetId).not.toBe(sq);
    const fixed = await t.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: after.assetId },
    });
    expect(fixed.width! / fixed.height!).toBeCloseTo(0.8, 2);
    expect((await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: sq } })).archivedAt).toBeNull(); // the old file stays
    const again = await productPhotoQuality(deps, SYSTEM, {
      storeId: store,
      productId: product,
    });
    expect(again.photos.find((p) => p.productMediaId === bad.productMediaId)!.report!.issues).not.toContain('ratio');
    await expect(
      fixProductPhoto(deps, SYSTEM, {
        storeId: store,
        productId: product,
        productMediaId: bad.productMediaId,
      }),
    ).rejects.toBeInstanceOf(MediaError);
  });
});
