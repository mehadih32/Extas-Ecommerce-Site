// S24 · PR 467 (Blueprint C7.11, C7.22 item 24 "download-watermark pipeline") on a real PostgreSQL (skipped
// without TEST_DATABASE_ADMIN_URL) — not a new production module, a confirmation.
//
// What investigating item 24 found: the watermark mechanism C7.11 describes (a clean storefront, a watermarked
// copy stamped only at download time, `media.watermark.*` settings) was already built end to end under S01 ·
// PR 23, long before this stage existed — `packages/media/src/watermark.ts` + `serve.ts`'s own `downloadCopy`.
// `downloadCopy`'s query is generic: any `MediaAsset` with `kind: 'IMAGE'` on an active `ProductMedia` row gets
// watermarked on download, whether or not `isAiGenerated` is set. So a Studio render needs ZERO new watermark
// code once it reaches a product's gallery — and this file is the proof, not an assertion in a PR description.
// It is also, as it turns out, the first test `downloadCopy` has ever had in this repository, Studio or not.
//
// The chain this test drives, every link a real chokepoint, nothing fabricated:
//   1. `recordGeneratedAsset` (PR 444) — this package's own guarantee that a Studio render is a new `MediaAsset`
//      row, `isAiGenerated: true`, traced back to a real original, never a mutation of one.
//   2. `createOrReuseJob` / `transitionJob` (PR 451/452) and `recordScoredOutputs` (PR 453) — the job reaches
//      `REVIEW_REQUIRED` with exactly one `PENDING` output, same as a real runner would leave it.
//   3. `decideOutputReview` (PR 458) — the owner's own approval, `APPROVED`.
//   4. `@extas/media`'s own `attachToProduct` — the existing, generic "put this photo on the product" admin
//      action every ordinary upload already goes through. This is the one real way an approved Studio image
//      reaches `ProductMedia` today (the job's own `APPROVED -> PUBLISHED` transition and `photoshoot.publish`
//      permission exist in `jobs.ts` but nothing calls them yet — a genuine, separate gap, filed in
//      PROGRESS.md's Follow-ups table rather than guessed at here, since closing it is a product decision — which
//      admin screen, which gallery role — not a watermark question).
//   5. `downloadCopy` (PR 23) — imported from `@extas/media` completely unchanged. Every assertion below is the
//      same shape PR 23's own behaviour takes for a plain uploaded photo; nothing here special-cases
//      `isAiGenerated`, because `downloadCopy` itself never does.
//
// `@extas/photoshoot`'s production code still never imports `@extas/media` (the package keeps its own single
// owner, CLAUDE.md rule 10) — both are devDependencies, used only by this test.
//
// Honest scope: no video. C7.11's own "same for video" is S25's job, once S24 has an approved still to hand it
// (C7.14) — see PROGRESS.md's Follow-ups table; it is explicitly not attempted here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { memoryStorage } from '@extas/adapters';
import { createRole, syncAuth, SYSTEM, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { attachToProduct, downloadCopy, renderAsset, sha256, type MediaDeps } from '@extas/media';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { recordGeneratedAsset } from './assets';
import type { PhotoshootDeps, Who } from './context';
import { createOrReuseJob, transitionJob } from './jobs';
import { decideOutputReview, recordScoredOutputs } from './outputs';

const PERFECT = { garmentShapeIntegrity: 1, printLegibility: 1, colourDifference: 1, handFingerArtefacts: 1, edgeQuality: 1, seamContinuity: 1 };

/** A real, decodable JPEG — standing in for the provider's own render (no runner calls a real provider yet;
 * the same honest gap every other S24 piece leaves for its own unbuilt neighbour). Large enough to clear
 * `uploadImage`'s own minimum, so `renderAsset` has real pixels to standardise. */
async function garmentPhoto(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: 1200, height: 1500, channels: 3, background: { r: 20, g: 32, b: 80 } } })
      .jpeg({ quality: 90 })
      .toBuffer(),
  );
}

describe.skipIf(!HAS_TEST_DB)('PR 467 · a Studio render is watermarked on download exactly like any other product photo (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let generator: Who;
  let approver: Who;
  let settings: SettingsResolver<typeof registry>;
  let mediaDeps: MediaDeps;
  let photoshootDeps: PhotoshootDeps;

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_watermark');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    settings = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    await settings.set('media.image.avifEffort', 0, storeTarget(S)); // fast AVIF in tests
    const storage = memoryStorage();
    mediaDeps = { db: t.prisma, settings, storage: async () => storage };
    photoshootDeps = { db: t.prisma, settings };

    const staff = async (key: string, perms: PermissionKey[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    // `media.upload` alongside the photoshoot permissions: `attachToProduct`'s own real permission check, a
    // separate grant from `photoshoot.approve` — defense in depth, the same shape `@extas/studio`'s own assets
    // module already documents for its calls into this same `attachToProduct`.
    generator = await staff('t467-generator', ['photoshoot.read', 'photoshoot.write', 'photoshoot.generate', 'media.upload']);
    approver = await staff('t467-approver', ['photoshoot.read', 'photoshoot.approve']);
  });

  afterAll(async () => t.drop());

  it('an APPROVED Studio output, once attached to the product gallery, downloads watermarked — no Studio-specific code anywhere in @extas/media', async () => {
    const reference = await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/ref-${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1n, checksumSha256: 'a'.repeat(64), isOriginal: true },
    });

    // Step 1: this package's own real chokepoint records the Studio's generated image.
    const generatedKey = `test/generated-${crypto.randomUUID()}.jpg`;
    const generated = await recordGeneratedAsset(photoshootDeps, generator, {
      sourceAssetId: reference.id,
      role: 'primary_garment',
      storageKey: generatedKey,
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 50_000,
      checksumSha256: 'b'.repeat(64),
    });
    expect(generated.isAiGenerated).toBe(true);
    expect(generated.sourceAssetId).toBe(reference.id);

    // The pixels a real render would have produced, then @extas/media's own standardisation renders it —
    // exactly the rendition set any plain upload gets, through the same `renderAsset`.
    const storage = await mediaDeps.storage(S);
    await storage.put(generatedKey, await garmentPhoto(), 'image/jpeg');
    expect((await renderAsset(mediaDeps, generated.id)).status).toBe('rendered');

    // Step 2–3: through the real job/review chokepoints to an APPROVED output.
    const product = await t.prisma.product.create({ data: { storeId: S, slug: `test-467-${crypto.randomUUID()}`, nameEn: 'Test product' } });
    const { job } = await createOrReuseJob(photoshootDeps, generator, { productId: product.id, angle: 'front', tier: 'baseline', inputAssetIds: [reference.id] });
    await transitionJob(photoshootDeps, generator, job.id, 'PROCESSING');
    const scored = await recordScoredOutputs(photoshootDeps, generator, job.id, { candidates: [{ assetId: generated.id, scores: PERFECT }] });
    expect(scored.job.status).toBe('REVIEW_REQUIRED');
    const decided = await decideOutputReview(photoshootDeps, approver, scored.outputs[0]!.id, { decision: 'approve' });
    expect(decided.output.reviewStatus).toBe('APPROVED');
    expect(decided.job.status).toBe('APPROVED');

    // Before it is on any product gallery, @extas/media's own `downloadCopy` already refuses it — the exact
    // same refusal ANY photo gets while it is not yet on an active `ProductMedia` row (see its own query).
    // Approval alone does not make a photo downloadable; being on the gallery does.
    await expect(downloadCopy(mediaDeps, generated.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Step 4: the one real, already-built way an approved Studio image reaches the gallery today — the same
    // generic admin action every ordinary upload goes through. `attachToProduct` has no idea this asset ever
    // touched `@extas/photoshoot`.
    await attachToProduct(mediaDeps, generator.actor, { storeId: S, productId: product.id, assetId: generated.id, role: 'ON_MODEL', isPrimary: true });

    // Step 5: the download-watermark pipeline (C7.11) — the exact assertions a plain uploaded photo's own
    // watermark test makes, run here against a Studio render instead, through the unchanged `downloadCopy`.
    const clean = await t.prisma.mediaRendition.findUniqueOrThrow({ where: { assetId_preset_format: { assetId: generated.id, preset: 'main', format: 'jpeg' } } });
    const cleanBefore = sha256((await storage.get(clean.storageKey))!.body);

    const stamped = await downloadCopy(mediaDeps, generated.id);
    expect(stamped.watermarked).toBe(true);
    expect(stamped.contentType).toBe('image/jpeg');
    expect(sha256(stamped.body)).not.toBe(cleanBefore); // the copy really was stamped, not just labelled so

    // made once, then kept — calling again returns the same cached copy
    const again = await downloadCopy(mediaDeps, generated.id);
    expect(sha256(again.body)).toBe(sha256(stamped.body));

    // the toggle still reaches a Studio render exactly as it reaches any other photo
    await settings.set('media.watermark.enabled', false, storeTarget(S));
    const off = await downloadCopy(mediaDeps, generated.id);
    expect(off.watermarked).toBe(false);
    expect(sha256(off.body)).toBe(cleanBefore); // the rendition itself was never touched — only a download copy was ever stamped
    await settings.reset('media.watermark.enabled', storeTarget(S));

    // and the shop's own clean rendition is still exactly what it was before any of this ran
    expect(sha256((await storage.get(clean.storageKey))!.body)).toBe(cleanBefore);
  });
});
