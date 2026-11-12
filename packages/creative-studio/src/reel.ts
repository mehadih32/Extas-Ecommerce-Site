// S25 · PR 485 (Blueprint C8.1, C8.6 item 5) — reel assembly, part 1: turns a handful of already-`APPROVED` video
// clips (PR 484's review/approve step) into a `Reel` — the "15–25 second reel, stitched from 4–8 second clips, with
// music, text and the logo" Blueprint C8.1 describes — plus the set of output shapes (aspect variants) it should be
// cut for. Nothing is composited here yet: `buildReel` only gathers and validates the inputs and leaves the row
// `DRAFT`. `CLIPS_NOT_READY` refuses any clip that is not `APPROVED` — a reel can never be built from a clip nobody
// has reviewed. Actually assembling the reel (the honest-preview compositor, the same "no real encoder yet, so the
// output is a real already-existing asset, never fabricated footage" rule PR 439/482 set) is PR 486, part 2.
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { audit } from '@extas/auth';
// The video subpath only (not the package's full barrel): this file's barrel re-export reaches Client Components,
// so pulling in adapters/storage's Node-only Azure/S3 SDKs here would break the client bundle (the same reason
// video.ts imports from './video' and not '@extas/adapters').
import { VIDEO_ASPECTS, type VideoAspect } from '@extas/adapters/video';
import { StudioError } from './errors';
import type { StudioDeps, Who } from './context';

/** A technical bound on one reel's own clip count, not a business number (Blueprint C8.1's own example reel uses
 * three; a little headroom for a longer cut, never unlimited). */
export const REEL_CLIPS_MAX = 6; // hardcode-ok: a list-length guard, not CN-018 policy
export const REEL_TITLE_MAX = 120;
export const REEL_OVERLAY_TEXT_MAX = 200;

export const reelOverlaysSchema = z
  .object({
    /** The words shown on the reel, if any (Blueprint C8.1 "with music, text and the logo"). `null` = no text. */
    text: z.string().trim().min(1).max(REEL_OVERLAY_TEXT_MAX).nullable(),
    /** Whether the brand logo is drawn on the reel. */
    showLogo: z.boolean(),
  })
  .strict();
export type ReelOverlays = z.infer<typeof reelOverlaysSchema>;

export const buildReelInput = z
  .object({
    title: z.string().trim().min(1).max(REEL_TITLE_MAX),
    /** The approved clips to stitch, in the order they should play. */
    clipJobIds: z.array(z.string().uuid()).min(1).max(REEL_CLIPS_MAX),
    /** A royalty-free or generated track from the brand asset library; `null`/left out = no music track yet. */
    musicAssetId: z.string().uuid().nullish(),
    overlays: reelOverlaysSchema.nullish(),
    /** The output shapes to cut this reel for (Blueprint C8.1: 9:16 reels/stories, 1:1 and 4:5 feed, 16:9 website). */
    aspects: z.array(z.enum(VIDEO_ASPECTS)).min(1).max(VIDEO_ASPECTS.length),
  })
  .strict()
  .refine((d) => new Set(d.clipJobIds).size === d.clipJobIds.length, { message: 'the same clip cannot be chosen twice', path: ['clipJobIds'] })
  .refine((d) => new Set(d.aspects).size === d.aspects.length, { message: 'the same shape cannot be chosen twice', path: ['aspects'] });
export type BuildReelInput = z.infer<typeof buildReelInput>;

export interface ReelView {
  id: string;
  title: string;
  clipJobIds: string[];
  musicAssetId: string | null;
  overlays: ReelOverlays | null;
  aspects: VideoAspect[];
  status: string;
  outputAssetIds: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  title: string;
  clipJobIds: string[];
  musicAssetId: string | null;
  overlays: Prisma.JsonValue;
  aspects: string[];
  status: string;
  outputAssetIds: string[];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function view(r: Row): ReelView {
  return {
    id: r.id,
    title: r.title,
    clipJobIds: r.clipJobIds,
    musicAssetId: r.musicAssetId,
    overlays: (r.overlays ?? null) as ReelOverlays | null,
    aspects: r.aspects as VideoAspect[],
    status: r.status,
    outputAssetIds: r.outputAssetIds,
    archived: r.archivedAt != null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Every reel of the store, newest first (`marketing.studio.read`, checked by the caller); set aside ones are left
 * out unless `includeArchived` (the same toggle `listMotionActions` uses — nothing is ever hard-deleted). */
export async function listReels(deps: StudioDeps, storeId: number, opts: { includeArchived?: boolean } = {}): Promise<ReelView[]> {
  const rows = await deps.db.reel.findMany({ where: { storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }] });
  return rows.map(view);
}

/** Only the store's own `APPROVED` clips — the pickable list for a new reel (`marketing.studio.read`). */
export async function approvedClipsForReel(db: PrismaClient, storeId: number): Promise<{ id: string; productId: string | null; aspect: string | null }[]> {
  const rows = await db.videoJob.findMany({ where: { storeId, status: 'APPROVED' }, orderBy: { updatedAt: 'desc' }, select: { id: true, productId: true, aspect: true } });
  return rows;
}

/**
 * Builds a reel from a handful of already-`APPROVED` clips (`marketing.studio.write`, checked by the caller). Every
 * clip named must belong to this store (`NOT_FOUND`) and be `APPROVED` (`CLIPS_NOT_READY` — never built from a clip
 * nobody has reviewed yet); an optional music asset must exist, belong to this store and be an audio file
 * (`NOT_FOUND` / `SOURCE_INVALID`). Nothing is composited here — the row sits `DRAFT` with its own output shapes
 * chosen, ready for PR 486 to assemble it.
 */
export async function buildReel(deps: StudioDeps, who: Who, input: unknown): Promise<ReelView> {
  const ok = buildReelInput.safeParse(input);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'a reel needs its title, approved clips and at least one shape', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;

  const clips = await deps.db.videoJob.findMany({ where: { id: { in: d.clipJobIds }, storeId: who.storeId } });
  const byId = new Map(clips.map((c) => [c.id, c]));
  const missing = d.clipJobIds.filter((id) => !byId.has(id));
  if (missing.length) throw new StudioError('NOT_FOUND', 'a clip in this reel is not in this store', missing);
  const notApproved = d.clipJobIds.filter((id) => byId.get(id)!.status !== 'APPROVED');
  if (notApproved.length) throw new StudioError('CLIPS_NOT_READY', 'every clip must be reviewed and approved before it can go into a reel', notApproved);

  if (d.musicAssetId) {
    const music = await deps.db.mediaAsset.findFirst({ where: { id: d.musicAssetId, storeId: who.storeId, archivedAt: null } });
    if (!music) throw new StudioError('NOT_FOUND', 'no such music file', ['musicAssetId']);
    if (music.kind !== 'AUDIO') throw new StudioError('SOURCE_INVALID', 'the chosen file is not an audio track', ['musicAssetId']);
  }

  const row = await deps.db.reel.create({
    data: {
      storeId: who.storeId,
      title: d.title,
      clipJobIds: d.clipJobIds,
      musicAssetId: d.musicAssetId ?? null,
      overlays: d.overlays ? (d.overlays as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      aspects: d.aspects,
      status: 'DRAFT',
      outputAssetIds: [],
    },
  });
  await audit(
    deps.db,
    who.actor,
    { storeId: who.storeId, action: 'studio.reel.build', entityType: 'Reel', entityId: row.id, after: { title: d.title, clipJobIds: d.clipJobIds, aspects: d.aspects, hasMusic: Boolean(d.musicAssetId) } },
    who.ctx,
  );
  return view(row);
}

/** Sets a `DRAFT` reel aside, or brings it back — never a hard delete (CLAUDE.md rule 3), the same toggle shape
 * `setMotionActionArchived` uses. Only a reel still waiting to be assembled can be set aside (`WRONG_STATE`
 * otherwise); bringing one back has no such limit. */
export async function setReelArchived(deps: StudioDeps, who: Who, reelId: string, archived: boolean): Promise<ReelView> {
  const reel = await deps.db.reel.findFirst({ where: { id: reelId, storeId: who.storeId } });
  if (!reel) throw new StudioError('NOT_FOUND', 'no such reel', ['reelId']);
  if (archived && reel.status !== 'DRAFT') throw new StudioError('WRONG_STATE', 'only a reel still waiting to be assembled can be set aside', ['status']);
  const row = await deps.db.reel.update({ where: { id: reel.id }, data: { archivedAt: archived ? (deps.now?.() ?? new Date()) : null } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: archived ? 'studio.reel.archive' : 'studio.reel.restore', entityType: 'Reel', entityId: reel.id, before: { archivedAt: reel.archivedAt }, after: { archivedAt: row.archivedAt } }, who.ctx);
  return view(row);
}
