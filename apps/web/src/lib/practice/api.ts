// S28 · PR 706 (CN-049) — the Practice data screen's server side: the view, the practice-mode switch, "Add sample data" and
// "Reset practice data" (owner only; the owner's PIN alone since PR 725, no typed words; it removes only practice rows).
// PR 725 (15 Nov 2026): while practice mode is on the sample shop is LIVE on the storefront (products published and
// orderable) and fills by itself (ensure.ts / keeper.ts); switching it off hides every practice product and record with one
// click, switching it on shows them again; a reset removes them and keeps the automatic fill off until "Turn on" or "Add
// sample data" asks for it again.
// Practice mode (`practice.enabled`) is off as shipped. The Reset button is shown while `practice.showReset` is on (it is
// on by default; the owner turns it off himself later) and is refused by the server when it is off.
// Align with Start fresh (PR 706's one-time clearing): its run calls `resetPractice` too, so one clean-up covers both.
import { z } from 'zod';
import { audit, isOwner, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { requireOwnerPin } from '../owner-pin';
import { practiceCounts, resetPractice, type ResetResult } from './reset';
import type { MediaDeps } from '@extas/media';
import { ensurePractice } from './ensure';
import { addPracticePhotos, practicePhotoProgress } from './photos';
import { seedPractice, type SeedResult } from './seed';
import { syncPracticeVisibility } from './visibility';


export interface PracticeView {
  enabled: boolean;
  showReset: boolean;
  isOwner: boolean;
  counts: Record<string, number>;
  total: number;
  /** Products the owner uploaded himself (kept by a reset). */
  keptProducts: number;
  /** Sample-product pictures: products with their whole set (`done`) of those that get pictures (`total`). */
  photos: { done: number; total: number };
}

export async function practiceView(deps: AdminDeps, actor: Actor, storeId: number): Promise<PracticeView> {
  const [enabled, showReset, counts, owner, kept, minimum] = await Promise.all([
    deps.resolver.value('practice.enabled', { storeId }),
    deps.resolver.value('practice.showReset', { storeId }),
    practiceCounts(deps.db, storeId),
    actor.staffUserId ? isOwner(deps.db, actor.staffUserId) : Promise.resolve(false),
    deps.db.product.count({ where: { storeId, isPractice: false } }),
    deps.resolver.value('media.photos.minimum', { storeId }),
  ]);
  const photos = await practicePhotoProgress(deps.db, storeId, minimum);
  return {
    enabled: enabled.on,
    showReset: enabled.on && showReset.on,
    isOwner: owner,
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    keptProducts: kept,
    photos,
  };
}

type Out<T> = ({ ok: true } & T) | { ok: false; error: string };

async function ownerOnly(deps: AdminDeps, actor: Actor): Promise<boolean> {
  return !!actor.staffUserId && (await isOwner(deps.db, actor.staffUserId));
}

/** Practice mode on or off. Owner only; nothing is removed by switching it. */
export async function setPracticeMode(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<Out<object>> {
  const b = z.object({ on: z.boolean() }).strict().safeParse(raw);
  if (!b.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!(await ownerOnly(deps, actor))) return { ok: false, error: 'OWNER_ONLY' };
  const cur = await deps.resolver.value('practice.enabled', { storeId });
  await deps.resolver.set('practice.enabled', { on: b.data.on }, storeTarget(storeId), { actorId: actor.staffUserId, reason: 'Settings › Practice data' });
  // PR 725: on = the sample shop fills by itself and goes live; off = every practice product leaves the shop (nothing is deleted)
  if (b.data.on) await deps.resolver.set('practice.autoFill', { on: true }, storeTarget(storeId), { actorId: actor.staffUserId, reason: 'Settings › Practice data' });
  await ensurePractice({ db: deps.db, resolver: deps.resolver, now: deps.now }, storeId, { photos: false, force: b.data.on }).catch((e: unknown) => console.warn(`practice: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`)); // the server clock tries again
  await audit(
    deps.db,
    actor,
    {
      action: 'practice.mode',
      entityType: 'Setting',
      entityId: 'practice.enabled',
      before: { on: cur.on },
      after: { on: b.data.on },
      storeId,
    },
    ctx,
  );
  return { ok: true };
}

/** "Add sample data": fills the practice world. Needs practice mode on; does nothing when practice orders already exist. */
export async function addSampleData(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, media: MediaDeps | null = null, rich = false): Promise<Out<{ result: SeedResult }>> {
  if (!(await ownerOnly(deps, actor))) return { ok: false, error: 'OWNER_ONLY' };
  if (!(await deps.resolver.value('practice.enabled', { storeId })).on) return { ok: false, error: 'PRACTICE_OFF' };
  const result = await seedPractice(deps.db, storeId, deps.now ? deps.now() : new Date(), { rich });
  // PR 725: the sample products go live now; their pictures are made in small steps by the server clock (ensure.ts), never in this request;
  // the "Add practice photos" button (`addPhotosBatch`, PR 720) can still make them by hand with the same function
  await deps.resolver.set('practice.autoFill', { on: true }, storeTarget(storeId), { actorId: actor.staffUserId, reason: 'Settings › Practice data' });
  await syncPracticeVisibility(deps.db, storeId, true, deps.now ? deps.now() : new Date());
  void media;
  if (result.seeded)
    await audit(
      deps.db,
      actor,
      {
        action: 'practice.seed',
        entityType: 'Practice',
        entityId: String(storeId),
        before: null,
        after: { counts: result.counts },
        storeId,
      },
      ctx,
    );
  return { ok: true, result };
}

export interface PhotosStep {
  /** Photos made in this step. */
  added: number;
  done: number;
  total: number;
  /** True when every sample product has its whole set. */
  finished: boolean;
}

/**
 * "Add practice photos": one small step (`practice.photoBatch` products). Safe to repeat and to abandon: a step only does
 * what is still missing, so the next press continues. Needs practice mode on and sample products to exist. The pictures
 * are practice-owned (library folder "practice", placed on practice products only), so "Reset practice data" removes them.
 */
export async function addPhotosBatch(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, media: MediaDeps | null): Promise<Out<{ step: PhotosStep }>> {
  if (!(await ownerOnly(deps, actor))) return { ok: false, error: 'OWNER_ONLY' };
  if (!(await deps.resolver.value('practice.enabled', { storeId })).on) return { ok: false, error: 'PRACTICE_OFF' };
  if (!media) return { ok: false, error: 'MEDIA_UNAVAILABLE' };
  const batch = await deps.resolver.value('practice.photoBatch', { storeId });
  const before = await practicePhotoProgress(deps.db, storeId, await deps.resolver.value('media.photos.minimum', { storeId }));
  if (before.total === 0) return { ok: false, error: 'NO_SAMPLE_PRODUCTS' };
  const r = await addPracticePhotos(media, storeId, { limit: batch.count });
  const finished = r.done >= r.total;
  if (finished && r.photos > 0)
    await audit(
      deps.db,
      actor,
      {
        action: 'practice.photos',
        entityType: 'Practice',
        entityId: String(storeId),
        before: null,
        after: { products: r.total },
        storeId,
      },
      ctx,
    );
  return { ok: true, step: { added: r.photos, done: r.done, total: r.total, finished } };
}

const resetBody = z
  .object({
    pin: z.string(),
    removeDemo: z.boolean().optional(),
    refill: z.boolean().optional(),
  })
  .strict();

/** "Reset practice data" (with `refill`: "Refresh"). Removes all practice rows, keeps real and uploaded products. */
export async function resetPracticeData(
  deps: AdminDeps,
  actor: Actor,
  ctx: RequestContext,
  storeId: number,
  raw: unknown,
  media: MediaDeps | null = null,
): Promise<Out<{ result: ResetResult; seeded: SeedResult | null }>> {
  const b = resetBody.safeParse(raw);
  if (!b.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!(await ownerOnly(deps, actor))) return { ok: false, error: 'OWNER_ONLY' };
  const [enabled, show] = await Promise.all([deps.resolver.value('practice.enabled', { storeId }), deps.resolver.value('practice.showReset', { storeId })]);
  if (!show.on) return { ok: false, error: 'RESET_HIDDEN' };
  await requireOwnerPin(deps, actor, ctx, b.data.pin, 'practice.reset', storeId); // throws the PIN errors
  const result = await resetPractice(deps.db, storeId, {
    removeDemo: b.data.removeDemo === true,
  });
  // PR 725: after a reset the sample shop stays empty (the automatic fill is switched off) unless he asked to refill
  const refill = b.data.refill === true && enabled.on;
  await deps.resolver.set('practice.autoFill', { on: refill }, storeTarget(storeId), { actorId: actor.staffUserId, reason: 'Settings › Practice data' });
  const seeded = refill ? await seedPractice(deps.db, storeId, deps.now ? deps.now() : new Date()) : null;
  if (refill) await syncPracticeVisibility(deps.db, storeId, true, deps.now ? deps.now() : new Date());
  void media;

  await audit(
    deps.db,
    actor,
    {
      action: 'practice.reset',
      entityType: 'Practice',
      entityId: String(storeId),
      before: null,
      after: {
        removed: result.removed,
        removeDemo: b.data.removeDemo === true,
        refilled: !!seeded?.seeded,
      },
      storeId,
    },
    ctx,
  );
  return { ok: true, result, seeded };
}

const STATUS: Record<string, number> = {
  OWNER_ONLY: 403,
  PRACTICE_OFF: 409,
  RESET_HIDDEN: 409,
  MEDIA_UNAVAILABLE: 503,
  NO_SAMPLE_PRODUCTS: 409,
  INVALID_INPUT: 422,
};

export async function practiceRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, 'invalid-store-id');
  const [a] = path;
  const media = deps ? (await import('../media')).mediaDeps() : null;
  try {
    const g = await guardAdmin(request, deps, {
      permission: 'settings.write',
      storeId,
    });
    if (g instanceof Response) return g;
    if (!a && m === 'GET')
      return json({
        ok: true,
        ...(await practiceView(deps!, g.actor, storeId)),
      });
    if (a === 'mode' && m === 'POST') {
      const r = await setPracticeMode(deps!, g.actor, g.ctx, storeId, await body(request));
      return r.ok ? json({ ok: true, ...(await practiceView(deps!, g.actor, storeId)) }) : fail(STATUS[r.error] ?? 422, r.error);
    }
    if (a === 'fill' && m === 'POST') {
      // PR 724: `{ "rich": true }` asks for the big sample world (screenshots); seedPractice honours it on the sample store only
      const opts = z.object({ rich: z.boolean().optional() }).safeParse(await request.json().catch(() => ({})));
      const r = await addSampleData(deps!, g.actor, g.ctx, storeId, media, opts.success && opts.data.rich === true);
      return r.ok
        ? json({
            ok: true,
            seeded: r.result.seeded,

            ...(await practiceView(deps!, g.actor, storeId)),
          })
        : fail(STATUS[r.error] ?? 422, r.error);
    }
    if (a === 'photos' && m === 'POST') {
      const r = await addPhotosBatch(deps!, g.actor, g.ctx, storeId, media);
      return r.ok ? json({ ok: true, ...r.step }) : fail(STATUS[r.error] ?? 422, r.error);
    }
    if (a === 'reset' && m === 'POST') {
      const r = await resetPracticeData(deps!, g.actor, g.ctx, storeId, await body(request), media);
      return r.ok
        ? json({
            ok: true,
            removed: r.result.removed,

            removedDemoProducts: r.result.removedDemoProducts,
            seeded: r.seeded?.seeded ?? false,
            ...(await practiceView(deps!, g.actor, storeId)),
          })
        : fail(STATUS[r.error] ?? 422, r.error);
    }
    return fail(404, 'not-found');
  } catch (e) {
    return errorResponse(e);
  }
}
