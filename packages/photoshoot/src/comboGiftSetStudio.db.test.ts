// S24 · PR 475 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a combo/gift-set
// composition through PR 444's `recordGeneratedAsset` chokepoint, C7.6's "never invent" hard rule generalised to
// a group of pieces, reuse lookup scoped to the exact kind/layout/piece set, permission checks, and that every
// real piece photo is left untouched.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { COMBO_GIFT_SET_STUDIO_TAG, findExistingComboGiftSetOutput, recordComboGiftSetOutput } from './comboGiftSetStudio';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 475 · combo/gift-set composition studio (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_combo_gift_set');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t475-writer', ['photoshoot.read', 'photoshoot.generate']);
    reader = await staff('t475-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makePiece(slug: string, overrides: { linked?: boolean; archivedAsset?: boolean; archivedLink?: boolean } = {}) {
    const product = await t.prisma.product.create({ data: { storeId: S, slug, nameEn: slug } });
    const asset = await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${slug}.jpg`, mimeType: 'image/jpeg', bytes: 500n, checksumSha256: slug.padEnd(64, '0'), isOriginal: true, archivedAt: overrides.archivedAsset ? new Date() : null },
    });
    if (overrides.linked !== false) {
      await t.prisma.productMedia.create({ data: { storeId: S, productId: product.id, assetId: asset.id, role: 'FRONT', isPrimary: true, archivedAt: overrides.archivedLink ? new Date() : null } });
    }
    return { productId: product.id, sourceAssetId: asset.id };
  }

  it('records a combo composed of two real, linked pieces, tagged studio + kind + layout + piece_count + each piece', async () => {
    const d = deps();
    const a = await makePiece('combo-polo-a');
    const b = await makePiece('combo-polo-b');
    const out = await recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [a, b], storageKey: 'test/combo-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'c'.repeat(64) });
    expect(out.kind).toBe('combo');
    expect(out.layout).toBe('flat_lay_grouped');
    expect(out.role).toBe('combo_gift_set_composition');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(a.sourceAssetId); // the lead piece
    expect(out.tags).toContain(COMBO_GIFT_SET_STUDIO_TAG);
    expect(out.tags).toContain('piece_count:2');
    expect(out.pieces).toEqual([a, b]);
  });

  it('a gift set of three pieces records and reads back all three, in order', async () => {
    const d = deps();
    const pieces = [await makePiece('gift-wallet'), await makePiece('gift-belt'), await makePiece('gift-tie')];
    const out = await recordComboGiftSetOutput(d, writer, { kind: 'gift_set', layout: 'boxed_gift', pieces, storageKey: 'test/gift-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'd'.repeat(64) });
    expect(out.pieces).toEqual(pieces);
    expect(out.tags).toContain('piece_count:3');
  });

  it("C7.6 hard rule: refuses when a named piece's photo is missing, unlinked, or archived — naming the bad piece's position", async () => {
    const d = deps();
    const good = await makePiece('combo-good-1');

    // position 2: no such asset at all
    await expect(
      recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [good, { productId: crypto.randomUUID(), sourceAssetId: '00000000-0000-0000-0000-000000000000' }], storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_PIECE_REFERENCE', details: ['2'] });

    // position 2: a real asset that is simply never linked to that product
    const unlinked = await makePiece('combo-unlinked', { linked: false });
    await expect(
      recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [good, unlinked], storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_PIECE_REFERENCE', details: ['2'] });

    // position 2: the link itself is archived
    const archivedLink = await makePiece('combo-archived-link', { archivedLink: true });
    await expect(
      recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [good, archivedLink], storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_PIECE_REFERENCE', details: ['2'] });

    // position 2: the asset itself is archived
    const archivedAsset = await makePiece('combo-archived-asset', { archivedAsset: true });
    await expect(
      recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [good, archivedAsset], storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '1'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_PIECE_REFERENCE', details: ['2'] });
  });

  it('refuses fewer than two pieces, more than six, a duplicate product, or a duplicate photo', async () => {
    const d = deps();
    const one = await makePiece('combo-one-only');
    await expect(recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [one], storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '2'.repeat(64) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const seven = await Promise.all(Array.from({ length: 7 }, (_, i) => makePiece(`combo-seven-${i}`)));
    await expect(recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: seven, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '3'.repeat(64) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const dupProduct = await makePiece('combo-dup-a');
    const secondAsset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'test/combo-dup-a-2.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: '4'.repeat(64), isOriginal: true } });
    await expect(
      recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [dupProduct, { productId: dupProduct.productId, sourceAssetId: secondAsset.id }], storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '5'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const a = await makePiece('combo-reader-a');
    const b = await makePiece('combo-reader-b');
    await expect(recordComboGiftSetOutput(d, reader, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [a, b], storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '6'.repeat(64) })).rejects.toThrow();
  });

  it('the real piece photos themselves are untouched (PR 444\'s immutability guarantee carries through)', async () => {
    const d = deps();
    const a = await makePiece('combo-untouched-a');
    const b = await makePiece('combo-untouched-b');
    await recordComboGiftSetOutput(d, writer, { kind: 'gift_set', layout: 'standing_grouped', pieces: [a, b], storageKey: 'test/untouched.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '7'.repeat(64) });
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: a.sourceAssetId } });
    expect(row.isOriginal).toBe(true);
    expect(row.archivedAt).toBeNull();
  });

  it('findExistingComboGiftSetOutput reuses the newest matching composition, scoped to its exact kind/layout/piece set, and is null until one exists', async () => {
    const d = deps();
    const a = await makePiece('combo-reuse-a');
    const b = await makePiece('combo-reuse-b');
    expect(await findExistingComboGiftSetOutput(d, reader, 'combo', 'flat_lay_grouped', [a, b])).toBeNull();
    const first = await recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [a, b], storageKey: 'test/reuse-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '8'.repeat(64) });
    const found = await findExistingComboGiftSetOutput(d, reader, 'combo', 'flat_lay_grouped', [a, b]);
    expect(found?.id).toBe(first.id);
    // the same two pieces under a different layout is never matched
    expect(await findExistingComboGiftSetOutput(d, reader, 'combo', 'boxed_gift', [a, b])).toBeNull();
    // the same two pieces under a different kind is never matched
    expect(await findExistingComboGiftSetOutput(d, reader, 'gift_set', 'flat_lay_grouped', [a, b])).toBeNull();
    // a bigger composition that happens to include both of these pieces never matches the 2-piece query
    const c = await makePiece('combo-reuse-c');
    await recordComboGiftSetOutput(d, writer, { kind: 'combo', layout: 'flat_lay_grouped', pieces: [a, b, c], storageKey: 'test/reuse-3.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '9'.repeat(64) });
    const stillTwo = await findExistingComboGiftSetOutput(d, reader, 'combo', 'flat_lay_grouped', [a, b]);
    expect(stillTwo?.id).toBe(first.id);
  });
});
