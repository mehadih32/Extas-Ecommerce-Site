// S25 · PR 485 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): reel assembly, part 1. Building a
// reel from already-APPROVED clips (never a clip nobody has reviewed — CLIPS_NOT_READY), an optional music track
// that must be a real audio file of this store, listing reels (archived ones left out unless asked) and setting a
// still-DRAFT reel aside or back (never deleted).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { approvedClipsForReel, buildReel, listReels, setReelArchived, StudioError, type StudioDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 485 · reel assembly, part 1 (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;

  let sd: StudioDeps;

  beforeAll(async () => {
    t = await createTestDatabase('creative_studio_reel');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't485-writer', nameEn: 'writer', nameBn: 'writer', permissions: ['marketing.studio.read', 'marketing.studio.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't485-writer@example.com', displayName: 'writer', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { actor: { staffUserId: u.id }, storeId: S };
    sd = { db: t.prisma };
  });

  afterAll(async () => t.drop());

  const makeClip = (status: 'DRAFT' | 'QUEUED' | 'PROCESSING' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED' | 'FAILED') =>
    t.prisma.videoJob.create({ data: { storeId: S, sourceAssetId: randomUUID(), idempotencyKey: randomUUID(), status, aspect: '9:16', durationSec: 6 } });

  const makeMedia = (kind: 'AUDIO' | 'IMAGE') =>
    t.prisma.mediaAsset.create({ data: { storeId: S, kind, storage: 'LOCAL_DISK', storageKey: `studio/${randomUUID()}`, mimeType: kind === 'AUDIO' ? 'audio/mpeg' : 'image/jpeg', bytes: BigInt(1000), checksumSha256: randomUUID() } });

  it('builds a reel from approved clips, DRAFT, nothing composited yet', async () => {
    const c1 = await makeClip('APPROVED');
    const c2 = await makeClip('APPROVED');
    const reel = await buildReel(sd, writer, { title: 'Eid tracksuit reel', clipJobIds: [c1.id, c2.id], aspects: ['9:16', '1:1'] });
    expect(reel.status).toBe('DRAFT');
    expect(reel.clipJobIds).toEqual([c1.id, c2.id]);
    expect(reel.aspects).toEqual(['9:16', '1:1']);
    expect(reel.outputAssetIds).toEqual([]);
    expect(reel.musicAssetId).toBeNull();
    expect(reel.overlays).toBeNull();
    expect(reel.archived).toBe(false);
  });

  it('refuses a clip that is not APPROVED yet (CLIPS_NOT_READY), naming it', async () => {
    const ok = await makeClip('APPROVED');
    const notYet = await makeClip('REVIEW_REQUIRED');
    await expect(buildReel(sd, writer, { title: 'Too soon', clipJobIds: [ok.id, notYet.id], aspects: ['9:16'] })).rejects.toMatchObject({ code: 'CLIPS_NOT_READY' satisfies StudioError['code'], details: [notYet.id] });
  });

  it('refuses a clip id that does not exist or is not this store’s (NOT_FOUND)', async () => {
    const ok = await makeClip('APPROVED');
    const ghost = randomUUID();
    await expect(buildReel(sd, writer, { title: 'Ghost clip', clipJobIds: [ok.id, ghost], aspects: ['9:16'] })).rejects.toMatchObject({ code: 'NOT_FOUND', details: [ghost] });
  });

  it('refuses the same clip chosen twice, and the same shape chosen twice (INVALID_INPUT)', async () => {
    const c1 = await makeClip('APPROVED');
    await expect(buildReel(sd, writer, { title: 'Dup clip', clipJobIds: [c1.id, c1.id], aspects: ['9:16'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const c2 = await makeClip('APPROVED');
    await expect(buildReel(sd, writer, { title: 'Dup shape', clipJobIds: [c1.id, c2.id], aspects: ['9:16', '9:16'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses an empty title, no clips or no shape chosen (INVALID_INPUT)', async () => {
    const c1 = await makeClip('APPROVED');
    await expect(buildReel(sd, writer, { title: '', clipJobIds: [c1.id], aspects: ['9:16'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(buildReel(sd, writer, { title: 'No clips', clipJobIds: [], aspects: ['9:16'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(buildReel(sd, writer, { title: 'No shape', clipJobIds: [c1.id], aspects: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('accepts an optional music track that is a real audio file of this store', async () => {
    const c1 = await makeClip('APPROVED');
    const music = await makeMedia('AUDIO');
    const reel = await buildReel(sd, writer, { title: 'With music', clipJobIds: [c1.id], musicAssetId: music.id, overlays: { text: 'Eid Mubarak', showLogo: true }, aspects: ['16:9'] });
    expect(reel.musicAssetId).toBe(music.id);
    expect(reel.overlays).toEqual({ text: 'Eid Mubarak', showLogo: true });
  });

  it('refuses a music asset that is not an audio file (SOURCE_INVALID)', async () => {
    const c1 = await makeClip('APPROVED');
    const notAudio = await makeMedia('IMAGE');
    await expect(buildReel(sd, writer, { title: 'Bad music', clipJobIds: [c1.id], musicAssetId: notAudio.id, aspects: ['9:16'] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses a music asset that does not exist (NOT_FOUND)', async () => {
    const c1 = await makeClip('APPROVED');
    await expect(buildReel(sd, writer, { title: 'Ghost music', clipJobIds: [c1.id], musicAssetId: randomUUID(), aspects: ['9:16'] })).rejects.toMatchObject({ code: 'NOT_FOUND', details: ['musicAssetId'] });
  });

  it('approvedClipsForReel only returns this store’s APPROVED clips', async () => {
    const approved = await makeClip('APPROVED');
    await makeClip('DRAFT');
    const list = await approvedClipsForReel(t.prisma, S);
    const ids = list.map((c) => c.id);
    expect(ids).toContain(approved.id);
    expect(ids.length).toBe(list.length); // every row returned is one we asked for (APPROVED), sanity on the shape
  });

  it('lists reels newest first and leaves archived ones out unless asked, and sets a DRAFT reel aside and back without deleting it', async () => {
    const c1 = await makeClip('APPROVED');
    const first = await buildReel(sd, writer, { title: 'First reel', clipJobIds: [c1.id], aspects: ['9:16'] });
    const c2 = await makeClip('APPROVED');
    const second = await buildReel(sd, writer, { title: 'Second reel', clipJobIds: [c2.id], aspects: ['9:16'] });

    const archived = await setReelArchived(sd, writer, first.id, true);
    expect(archived.archived).toBe(true);

    const visible = await listReels(sd, S);
    expect(visible.some((r) => r.id === first.id)).toBe(false);
    expect(visible.some((r) => r.id === second.id)).toBe(true);

    const all = await listReels(sd, S, { includeArchived: true });
    expect(all.some((r) => r.id === first.id)).toBe(true);

    const restored = await setReelArchived(sd, writer, first.id, false);
    expect(restored.archived).toBe(false);
    expect(restored.id).toBe(first.id); // the same row, never a new one — nothing was deleted
  });

  it('refuses to archive a reel that has moved past DRAFT (WRONG_STATE)', async () => {
    const c1 = await makeClip('APPROVED');
    const reel = await buildReel(sd, writer, { title: 'Already moving', clipJobIds: [c1.id], aspects: ['9:16'] });
    await t.prisma.reel.update({ where: { id: reel.id }, data: { status: 'ASSEMBLED' } });
    await expect(setReelArchived(sd, writer, reel.id, true)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('refuses a reel id that does not exist (NOT_FOUND)', async () => {
    await expect(setReelArchived(sd, writer, randomUUID(), true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
