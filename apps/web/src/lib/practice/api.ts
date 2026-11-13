// S28 · PR 706 (CN-049) — the Practice data screen's server side: the view, the practice-mode switch, "Add sample data" and
// "Reset practice data" (owner only; the owner's PIN and the typed words RESET PRACTICE; it removes only practice rows).
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
import { seedPractice, type SeedResult } from './seed';

/** The words typed to confirm a reset. */
export const RESET_WORDS = 'RESET PRACTICE'; // hardcode-ok: the confirmation phrase the owner's decision names

export interface PracticeView {
  enabled: boolean;
  showReset: boolean;
  isOwner: boolean;
  counts: Record<string, number>;
  total: number;
  /** Products the owner uploaded himself (kept by a reset). */
  keptProducts: number;
}

export async function practiceView(deps: AdminDeps, actor: Actor, storeId: number): Promise<PracticeView> {
  const [enabled, showReset, counts, owner, kept] = await Promise.all([
    deps.resolver.value('practice.enabled', { storeId }),
    deps.resolver.value('practice.showReset', { storeId }),
    practiceCounts(deps.db, storeId),
    actor.staffUserId ? isOwner(deps.db, actor.staffUserId) : Promise.resolve(false),
    deps.db.product.count({ where: { storeId, isPractice: false } }),
  ]);
  return {
    enabled: enabled.on,
    showReset: enabled.on && showReset.on,
    isOwner: owner,
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    keptProducts: kept,
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
export async function addSampleData(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number): Promise<Out<{ result: SeedResult }>> {
  if (!(await ownerOnly(deps, actor))) return { ok: false, error: 'OWNER_ONLY' };
  if (!(await deps.resolver.value('practice.enabled', { storeId })).on) return { ok: false, error: 'PRACTICE_OFF' };
  const result = await seedPractice(deps.db, storeId, deps.now ? deps.now() : new Date());
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

const resetBody = z
  .object({
    words: z.string(),
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
): Promise<Out<{ result: ResetResult; seeded: SeedResult | null }>> {
  const b = resetBody.safeParse(raw);
  if (!b.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!(await ownerOnly(deps, actor))) return { ok: false, error: 'OWNER_ONLY' };
  const [enabled, show] = await Promise.all([deps.resolver.value('practice.enabled', { storeId }), deps.resolver.value('practice.showReset', { storeId })]);
  if (!show.on) return { ok: false, error: 'RESET_HIDDEN' };
  if (b.data.words.trim() !== RESET_WORDS) return { ok: false, error: 'WORDS_MISMATCH' };
  await requireOwnerPin(deps, actor, ctx, b.data.pin, 'practice.reset', storeId); // throws the PIN errors
  const result = await resetPractice(deps.db, storeId, {
    removeDemo: b.data.removeDemo === true,
  });
  const seeded = b.data.refill && enabled.on ? await seedPractice(deps.db, storeId, deps.now ? deps.now() : new Date()) : null;
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
  WORDS_MISMATCH: 422,
  INVALID_INPUT: 422,
};

export async function practiceRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, 'invalid-store-id');
  const [a] = path;
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
      const r = await addSampleData(deps!, g.actor, g.ctx, storeId);
      return r.ok
        ? json({
            ok: true,
            seeded: r.result.seeded,

            ...(await practiceView(deps!, g.actor, storeId)),
          })
        : fail(STATUS[r.error] ?? 422, r.error);
    }
    if (a === 'reset' && m === 'POST') {
      const r = await resetPracticeData(deps!, g.actor, g.ctx, storeId, await body(request));
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
