// S28 · PR 706 (admin prototype v5, GAP-MAP part 2 P2-14) — Start fresh: the one-time clearing of the test and sample
// business data on go-live day. The owner only, and only after (1) the switch `startFresh.settings` is on (off as it
// ships), (2) a full backup that reached Drive a short while ago (`backupMaxAgeMinutes`), (3) the words START FRESH and
// (4) the owner's PIN. It runs once: a try that is running, done or partly done holds the store's one place (a partial
// unique index), a try that failed and rolled back everything releases it.
//   - Kinds the site may clear itself (carts, reviews, returns) go in ONE transaction, children first; a refusal rolls
//     them all back and the try is FAILED with the server's words.
//   - Kinds that sit on tables the app may never delete from (orders with their events, customers with their wallets,
//     coupon uses, chats, analytics) are HANDED_OFF: recorded with their counts for the server's own purge (the job
//     `startFresh.purge`, run in the owner's name from the backup-checked state) — the site never deletes them.
//   - Products the owner uploaded are always kept. Demo products (Product.isDemo, PR 684) are kept unless the owner ticks
//     "also remove the demo products": then only they are archived (they come back from Archived).
//   - Customer problem records are kept for good (owner decision 16, 13 Nov 2026).
//   - The handed-off kinds are removed by the server's job `startFresh.purge` (packages/jobs, migration 0277); the run turns DONE then.
//   - The ERP's own test entries are cleared by an ERP call; it is a mock until the ERP ships (`erpStatus` says so).
// Settings, rules, policies, shop text, staff, keys and the size charts, combos and coupons themselves are never touched.
// Everything is audited; the PIN is never stored.
import { z } from 'zod';
import { audit, isOwner, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { storeTarget } from '@extas/settings';
import { backupRequests, requestBackup, BackupError, type BackupRequestView } from '@extas/jobs';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { requireOwnerPin } from './owner-pin';

type Db = PrismaClient;

/** The words typed to confirm (the prototype's own). */
export const START_FRESH_WORDS = 'START FRESH'; // hardcode-ok: the confirmation phrase the owner's decision names

export type FreshKind = 'orders' | 'customers' | 'carts' | 'returns' | 'inbox' | 'reviews' | 'coupons' | 'reports' | 'problems';
export type FreshHow = 'CLEARED' | 'HANDED_OFF' | 'KEPT';

interface KindDef {
  id: FreshKind;
  /** How many rows there are (the preview). */
  count: (db: Db, storeId: number) => Promise<number>;
  /** The site clears it itself (children first) or it is handed to the server's purge (append-only tables below it). */
  how: FreshHow;
  clear?: (tx: Db, storeId: number) => Promise<void>;
}

export const KINDS: readonly KindDef[] = [
  { id: 'orders', how: 'HANDED_OFF', count: (db, s) => db.order.count({ where: { storeId: s } }) },
  { id: 'customers', how: 'HANDED_OFF', count: (db, s) => db.customer.count({ where: { storeId: s } }) },
  {
    id: 'carts',
    how: 'CLEARED',
    count: (db, s) => db.cart.count({ where: { storeId: s } }),
    clear: async (tx, s) => {
      await tx.cartItem.deleteMany({ where: { storeId: s } });
      await tx.cart.deleteMany({ where: { storeId: s } });
    },
  },
  {
    id: 'returns',
    how: 'CLEARED',
    count: (db, s) => db.returnRecord.count({ where: { storeId: s } }),
    clear: async (tx, s) => {
      await tx.returnItem.deleteMany({ where: { storeId: s } });
      await tx.returnRecord.deleteMany({ where: { storeId: s } });
    },
  },
  { id: 'inbox', how: 'HANDED_OFF', count: (db, s) => db.conversation.count({ where: { storeId: s } }) },
  {
    id: 'reviews',
    how: 'CLEARED',
    count: (db, s) => db.review.count({ where: { storeId: s } }),
    clear: async (tx, s) => {
      await tx.reviewMedia.deleteMany({ where: { storeId: s } });
      await tx.review.deleteMany({ where: { storeId: s } });
    },
  },
  { id: 'coupons', how: 'HANDED_OFF', count: (db, s) => db.couponRedemption.count({ where: { storeId: s } }) },
  { id: 'reports', how: 'HANDED_OFF', count: (db, s) => db.analyticsEvent.count({ where: { storeId: s } }) },
  { id: 'problems', how: 'KEPT', // owner decision 13 Nov 2026 (16): customer-problem records are never deleted
     count: (db, s) => db.customerProblem.count({ where: { storeId: s } }) },
];

export interface KindResult {
  id: FreshKind;
  count: number;
  how: FreshHow;
}

/** Does `Product.isDemo` exist (PR 684, wave 4A)? Without it there are no demo products to keep or remove. */
async function hasDemoColumn(db: Pick<Db, '$queryRaw'>): Promise<boolean> {
  const r = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'isDemo'`;
  return Number(r[0]?.n ?? 0) > 0;
}

/** What the preview says: counts per kind, the total and the real products. */
export async function startFreshPreview(db: Db, storeId: number): Promise<{ kinds: KindResult[]; total: number; products: number; demoProducts: number }> {
  const kinds: KindResult[] = [];
  for (const k of KINDS) kinds.push({ id: k.id, count: await k.count(db, storeId), how: k.how });
  const products = await db.product.count({ where: { storeId, status: { not: 'ARCHIVED' } } });
  const demo = (await hasDemoColumn(db)) ? Number((await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Product" WHERE "storeId" = ${storeId} AND "isDemo" = true AND "status" <> 'ARCHIVED'`)[0]?.n ?? 0) : 0;
  return { kinds, total: kinds.reduce((n, k) => n + (k.how === 'KEPT' ? 0 : k.count), 0), products, demoProducts: demo };
}

/** The newest backup that SUCCEEDED, and whether it is fresh enough to run on. */
export function backupGate(list: readonly BackupRequestView[], now: Date, maxAgeMinutes: number): { ok: boolean; backupId: string | null; finishedAt: string | null; open: boolean } {
  const done = list.filter((b) => b.kind === 'BACKUP' && b.status === 'SUCCEEDED' && b.finishedAt).sort((a, b) => (b.finishedAt! > a.finishedAt! ? 1 : -1))[0];
  const open = list.some((b) => b.kind === 'BACKUP' && (b.status === 'QUEUED' || b.status === 'RUNNING'));
  if (!done) return { ok: false, backupId: null, finishedAt: null, open };
  const age = now.getTime() - new Date(done.finishedAt!).getTime();
  return { ok: age >= 0 && age <= maxAgeMinutes * 60_000, backupId: done.id, finishedAt: done.finishedAt, open };
}

export interface FreshView {
  enabled: boolean;
  isOwner: boolean;
  backupMaxAgeMinutes: number;
  preview: Awaited<ReturnType<typeof startFreshPreview>>;
  backup: ReturnType<typeof backupGate>;
  done: { at: string; status: string; removeProducts: boolean; kinds: KindResult[]; purgedAt: string | null; erpStatus: string } | null;
}

export async function startFreshView(deps: AdminDeps, actor: Actor, storeId: number): Promise<FreshView> {
  const now = deps.now ? deps.now() : new Date();
  const [cfg, preview, list, owner, run] = await Promise.all([
    deps.resolver.value('startFresh.settings', { storeId }),
    startFreshPreview(deps.db, storeId),
    backupRequests(deps.db, 20),
    actor.staffUserId ? isOwner(deps.db, actor.staffUserId) : Promise.resolve(false),
    deps.db.startFreshRun.findFirst({ where: { storeId, status: { in: ['DONE', 'PARTIAL', 'RUNNING'] } }, orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    enabled: cfg.enabled,
    isOwner: owner,
    backupMaxAgeMinutes: cfg.backupMaxAgeMinutes,
    preview,
    backup: backupGate(list, now, cfg.backupMaxAgeMinutes),
    done: run ? { at: (run.finishedAt ?? run.createdAt).toISOString(), status: run.status, removeProducts: run.removeProducts, kinds: (run.kinds as unknown as KindResult[]).map((k) => (k.how === 'HANDED_OFF' && run.purgedAt ? { ...k, how: 'CLEARED' as const } : k)), purgedAt: run.purgedAt ? run.purgedAt.toISOString() : null, erpStatus: run.erpStatus } : null,
  };
}

const runBody = z.object({ words: z.string(), pin: z.string(), removeProducts: z.boolean().optional() }).strict();

export type RunResult = { ok: true; status: 'DONE' | 'PARTIAL'; kinds: KindResult[] } | { ok: false; error: string };

/** The run. Every refusal is a plain code and changes nothing. */
export async function runStartFresh(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<RunResult> {
  const b = runBody.safeParse(raw);
  if (!b.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!actor.staffUserId || !(await isOwner(deps.db, actor.staffUserId))) return { ok: false, error: 'OWNER_ONLY' };
  const cfg = await deps.resolver.value('startFresh.settings', { storeId });
  if (!cfg.enabled) return { ok: false, error: 'SWITCHED_OFF' };
  if (b.data.words.trim() !== START_FRESH_WORDS) return { ok: false, error: 'WORDS_MISMATCH' };
  const now = deps.now ? deps.now() : new Date();
  const gate = backupGate(await backupRequests(deps.db, 20), now, cfg.backupMaxAgeMinutes);
  if (!gate.ok) return { ok: false, error: 'BACKUP_FIRST' };
  await requireOwnerPin(deps, actor, ctx, b.data.pin, 'startFresh.run', storeId); // throws the PIN errors
  let run;
  try {
    run = await deps.db.startFreshRun.create({ data: { storeId, backupRequestId: gate.backupId, removeProducts: b.data.removeProducts === true, requestedById: actor.staffUserId } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { ok: false, error: 'ALREADY_DONE' };
    throw e;
  }
  const counts = await startFreshPreview(deps.db, storeId);
  try {
    await deps.db.$transaction(async (tx) => {
      for (const k of KINDS) if (k.how === 'CLEARED' && k.clear) await k.clear(tx as unknown as Db, storeId);
      // only demo products, and only when the box was ticked; a product the owner uploaded is never touched
      if (b.data.removeProducts && (await hasDemoColumn(tx as unknown as Db))) await tx.$executeRaw`UPDATE "Product" SET "status" = 'ARCHIVED', "updatedAt" = now() WHERE "storeId" = ${storeId} AND "isDemo" = true AND "status" <> 'ARCHIVED'`;
    });
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e)).split('\n').filter(Boolean).slice(-1)[0] ?? 'failed';
    await deps.db.startFreshRun.update({ where: { id: run.id }, data: { status: 'FAILED', detail: detail.slice(0, 500), finishedAt: new Date() } });
    await audit(deps.db, actor, { action: 'startFresh.failed', entityType: 'StartFreshRun', entityId: run.id, before: null, after: { detail: detail.slice(0, 200) }, storeId }, ctx);
    return { ok: false, error: 'RUN_FAILED' };
  }
  const handedOff = counts.kinds.some((k) => k.how === 'HANDED_OFF' && k.count > 0);
  const status = handedOff ? 'PARTIAL' : 'DONE';
  // The ERP's side: a call that is a mock until the ERP ships (nothing is sent).
  await deps.db.startFreshRun.update({ where: { id: run.id }, data: { status, kinds: counts.kinds as unknown as object, erpStatus: 'MOCK_NOT_SENT', finishedAt: new Date() } });
  await audit(deps.db, actor, { action: 'startFresh.run', entityType: 'StartFreshRun', entityId: run.id, before: null, after: { status, kinds: counts.kinds, removeProducts: b.data.removeProducts === true, backupRequestId: gate.backupId }, storeId }, ctx);
  return { ok: true, status, kinds: counts.kinds };
}

/** "Back up now" from this screen: the same request the Backups screen makes. */
export async function requestFreshBackup(deps: AdminDeps, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requestBackup(deps.db, { kind: 'BACKUP', actorId: actor.staffUserId ?? null });
    return { ok: true };
  } catch (e) {
    if (e instanceof BackupError) return { ok: false, error: e.code };
    throw e;
  }
}

/** The switch (off as it ships): the owner turns it on with the PIN, and off again until the day. Not after it ran. */
export async function setStartFreshSwitch(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = z.object({ enabled: z.boolean(), pin: z.string() }).strict().safeParse(raw);
  if (!b.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!actor.staffUserId || !(await isOwner(deps.db, actor.staffUserId))) return { ok: false, error: 'OWNER_ONLY' };
  if (await deps.db.startFreshRun.findFirst({ where: { storeId, status: { in: ['DONE', 'PARTIAL', 'RUNNING'] } } })) return { ok: false, error: 'ALREADY_DONE' };
  await requireOwnerPin(deps, actor, ctx, b.data.pin, 'startFresh.switch', storeId);
  const cur = await deps.resolver.value('startFresh.settings', { storeId });
  await deps.resolver.set('startFresh.settings', { ...cur, enabled: b.data.enabled }, storeTarget(storeId), { actorId: actor.staffUserId, reason: 'Settings › Start fresh' });
  await audit(deps.db, actor, { action: 'startFresh.switch', entityType: 'Setting', entityId: 'startFresh.settings', before: { enabled: cur.enabled }, after: { enabled: b.data.enabled }, storeId }, ctx);
  return { ok: true };
}

const STATUS: Record<string, number> = { OWNER_ONLY: 403, SWITCHED_OFF: 409, WORDS_MISMATCH: 422, BACKUP_FIRST: 409, ALREADY_DONE: 409, RUN_FAILED: 500, INVALID_INPUT: 422 };

export async function startFreshRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, 'invalid-store-id');
  const [a] = path;
  try {
    const g = await guardAdmin(request, deps, { permission: 'settings.write', storeId });
    if (g instanceof Response) return g;
    if (!a && m === 'GET') return json({ ok: true, ...(await startFreshView(deps!, g.actor, storeId)) });
    if (!a && m === 'POST') {
      const r = await runStartFresh(deps!, g.actor, g.ctx, storeId, await body(request));
      return r.ok ? json({ ok: true, status: r.status, kinds: r.kinds }) : fail(STATUS[r.error] ?? 422, r.error);
    }
    if (a === 'backup' && path.length === 1 && m === 'POST') {
      if (!g.actor.staffUserId || !(await isOwner(deps!.db, g.actor.staffUserId))) return fail(403, 'OWNER_ONLY');
      const r = await requestFreshBackup(deps!, g.actor);
      return r.ok ? json({ ok: true }, { status: 201 }) : fail(r.error === 'BUSY' ? 409 : 422, r.error);
    }
    if (a === 'switch' && path.length === 1 && m === 'POST') {
      const r = await setStartFreshSwitch(deps!, g.actor, g.ctx, storeId, await body(request));
      return r.ok ? json({ ok: true, ...(await startFreshView(deps!, g.actor, storeId)) }) : fail(STATUS[r.error] ?? 422, r.error);
    }
    return fail(404, 'not-found');
  } catch (e) {
    return errorResponse(e);
  }
}
