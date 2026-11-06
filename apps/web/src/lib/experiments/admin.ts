// S02 · PR 83 (register "A/B test module for the storefront"; BACKEND-ARCHITECTURE REP-08 Experiments) — Reports ›
// Experiments, the server side: the module's card (`experiments.module`: the switch, how sure a winner must be, visitors
// before a result, days a visitor is kept), every test with its version B and its result, writing a test (a draft only),
// and the test's steps: start (only while the module is on, and only when no other running test changes the same part
// or word; a confirm step on the page), pause, end, keep the winner, archive and restore. Keeping B writes B's words and
// shown/hidden parts into the shop's own settings (`language.labels`, the eye-toggles' settings) — only when the result
// is as sure as the owner's number and the person may also change those (website.words.write / website.eye.write).
// Nothing is deleted: an archived test is hidden and can be restored; a test never changes a price, a discount, COD or a
// delivery charge (lib/experiments/model.ts). Every change is audited (`experiments.*`).
//   /api/admin/reports/experiments        GET list (?show=archived; ?words=<q> finds testable words) (`reports.experiments.read`)
//                                         · POST new draft · PUT module card (`reports.experiments.write`)
//   /api/admin/reports/experiments/{id}   GET one · PUT edit a draft · POST {action, version, winner?} (`…write`)
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { eyeToggle, experimentsModuleSchema, storeTarget, writeEye, type ExperimentsModule } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { dayStartAt } from '../admin-problems/days';
import type { LabelOverrides } from '../shop/dict';
import { todayIn } from '../shop/theme';
import { applyWords, defaultWord, WORD_KEYS } from '../website/words';
import { clearLive } from './live';
import { clash, keysOf, parseTest, testableWord, storedB, storedNote, storedShare, verdict, type BChanges, type Goal, type Tally, type Verdict, type Version } from './model';

const S = MOTHER_STORE_ID;
const CARD = 'module';
export const STATUSES = ['DRAFT', 'RUNNING', 'PAUSED', 'ENDED'] as const;
export type TestStatus = (typeof STATUSES)[number];
export const ACTIONS = ['start', 'pause', 'end', 'keep', 'archive', 'restore'] as const;
export type TestAction = (typeof ACTIONS)[number];

export class ExperimentError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface ExperimentDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
}

export interface ExperimentWho {
  actor: Actor;
  ctx: RequestContext;
  /** The person's permissions (keeping B also needs the Website permission of what B changes). */
  can: (perm: string) => boolean;
}

export interface ModuleCard {
  key: string;
  value: ExperimentsModule;
  version: string;
}

export interface TestRow {
  id: string;
  key: string;
  name: string;
  note: string;
  status: TestStatus;
  goal: Goal;
  shareB: number;
  b: BChanges;
  /** The last day it runs (YYYY-MM-DD in the store's time zone), or null. */
  endsOn: string | null;
  startedAt: string | null;
  endsAt: string | null;
  winner: Version | null;
  archived: boolean;
  /** Past its last day: B is no longer shown although it was not ended. */
  timeUp: boolean;
  a: Tally;
  bTally: Tally;
  verdict: Verdict;
  /** The row's version for a change (STALE when someone changed it in between). */
  version: string;
}

export interface ExperimentsView {
  card: ModuleCard;
  tests: TestRow[];
  timeZone: string;
}

const cardVersion = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

async function moduleOf(deps: ExperimentDeps): Promise<ExperimentsModule> {
  return (await deps.resolver.value('experiments.module', { storeId: S })) as ExperimentsModule;
}

async function timeZoneOf(deps: ExperimentDeps): Promise<string> {
  return (await deps.resolver.value('store.timeZone', { storeId: S })) as string;
}

export async function moduleCard(deps: ExperimentDeps): Promise<ModuleCard> {
  const value = await moduleOf(deps);
  return { key: CARD, value, version: cardVersion(value) };
}

type Row = {
  id: string;
  key: string;
  name: string;
  status: TestStatus;
  variants: Prisma.JsonValue;
  split: Prisma.JsonValue;
  goalEvent: string;
  startsAt: Date | null;
  endsAt: Date | null;
  archivedAt: Date | null;
  winner: string | null;
  updatedAt: Date;
};

const SELECT = { id: true, key: true, name: true, status: true, variants: true, split: true, goalEvent: true, startsAt: true, endsAt: true, archivedAt: true, winner: true, updatedAt: true } as const;

/**
 * Visitors per version and, of them, who reached the goal after they were first counted and before the test ended:
 * added to the bag (a bag line of his random id, not one saved for later) or placed an order (an order with his random id).
 * PR 83 follow-up (683): a bag line that grew in that time (the same item again, a raised quantity, back from "saved for
 * later": CartItem.raisedAt) counts as added too; only the line's last growth is kept, so one that grew again after the
 * test ended counts by its new line time only.
 */
async function tallies(db: PrismaClient, row: Row, now: Date): Promise<Record<Version, Tally>> {
  const until = row.status === 'ENDED' && row.endsAt ? row.endsAt : now;
  const rows =
    row.goalEvent === 'order'
      ? await db.$queryRaw<{ variant: string; n: number; c: number }[]>`
          SELECT a."variant", COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Order" o WHERE o."storeId" = a."storeId" AND o."visitorId" = a."visitorId" AND o."placedAt" >= a."createdAt" AND o."placedAt" < ${until}))::int AS c
          FROM "AbAssignment" a WHERE a."testId" = ${row.id}::uuid GROUP BY a."variant"`
      : await db.$queryRaw<{ variant: string; n: number; c: number }[]>`
          SELECT a."variant", COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "CartItem" i JOIN "Cart" c ON c."id" = i."cartId" WHERE c."storeId" = a."storeId" AND c."visitorId" = a."visitorId" AND NOT i."savedForLater" AND ((i."createdAt" >= a."createdAt" AND i."createdAt" < ${until}) OR (i."raisedAt" >= a."createdAt" AND i."raisedAt" < ${until}))))::int AS c
          FROM "AbAssignment" a WHERE a."testId" = ${row.id}::uuid GROUP BY a."variant"`;
  const out: Record<Version, Tally> = { a: { n: 0, c: 0 }, b: { n: 0, c: 0 } };
  for (const r of rows) if (r.variant === 'a' || r.variant === 'b') out[r.variant] = { n: r.n, c: r.c };
  return out;
}

const rowVersion = (r: Row) => r.updatedAt.toISOString();

async function rowOf(deps: ExperimentDeps, r: Row, mod: ExperimentsModule, timeZone: string, now: Date): Promise<TestRow> {
  const t = r.status === 'DRAFT' ? { a: { n: 0, c: 0 }, b: { n: 0, c: 0 } } : await tallies(deps.db, r, now);
  const endsOn = r.endsAt ? todayIn(timeZone, new Date(r.endsAt.getTime() - 1)) : null;
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    note: storedNote(r.variants),
    status: r.status,
    goal: r.goalEvent === 'order' ? 'order' : 'addToBag',
    shareB: storedShare(r.split),
    b: storedB(r.variants),
    endsOn,
    startedAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
    winner: r.winner === 'a' || r.winner === 'b' ? r.winner : null,
    archived: !!r.archivedAt,
    timeUp: r.status === 'RUNNING' && !!r.endsAt && r.endsAt.getTime() <= now.getTime(),
    a: t.a,
    bTally: t.b,
    verdict: verdict(t.a, t.b, mod.confidence, mod.minVisitors),
    version: rowVersion(r),
  };
}

/** The module's card and the tests (archived ones only when asked), newest first. */
export async function experimentsView(deps: ExperimentDeps, opts: { archived?: boolean } = {}): Promise<ExperimentsView> {
  const [card, timeZone, rows] = await Promise.all([
    moduleCard(deps),
    timeZoneOf(deps),
    deps.db.abTest.findMany({ where: { storeId: S, archivedAt: opts.archived ? { not: null } : null }, select: SELECT, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  const now = new Date();
  const tests = await Promise.all((rows as Row[]).map((r) => rowOf(deps, r, card.value, timeZone, now)));
  return { card, tests, timeZone };
}

async function find(deps: ExperimentDeps, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ExperimentError('NOT_FOUND', 404);
  const r = await deps.db.abTest.findFirst({ where: { id, storeId: S }, select: SELECT });
  if (!r) throw new ExperimentError('NOT_FOUND', 404);
  return r as Row;
}

/** One test with its result. */
export async function experimentOne(deps: ExperimentDeps, id: string): Promise<{ test: TestRow; card: ModuleCard; timeZone: string }> {
  const [r, card, timeZone] = await Promise.all([find(deps, id), moduleCard(deps), timeZoneOf(deps)]);
  return { test: await rowOf(deps, r, card.value, timeZone, new Date()), card, timeZone };
}

// ---- the module card ----------------------------------------------------------------------------------------------

export async function saveModule(deps: ExperimentDeps, who: ExperimentWho, input: unknown): Promise<ModuleCard> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== CARD) throw new ExperimentError('INVALID_INPUT', 400, ['key']);
  const ok = experimentsModuleSchema.safeParse(o.value);
  if (!ok.success) throw new ExperimentError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const before = await moduleOf(deps);
  if (o.version !== cardVersion(before)) throw new ExperimentError('STALE', 409);
  if (cardVersion(ok.data) !== cardVersion(before)) {
    await deps.resolver.set('experiments.module', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Experiments' });
    await audit(deps.db, who.actor, { storeId: S, action: 'experiments.module.save', entityType: 'Setting', entityId: 'experiments.module', before, after: ok.data }, who.ctx);
    clearLive();
  }
  return moduleCard(deps);
}

// ---- writing a test -----------------------------------------------------------------------------------------------

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

async function endsAtOf(deps: ExperimentDeps, endsOn: string | null): Promise<Date | null> {
  if (!endsOn) return null;
  const tz = await timeZoneOf(deps);
  const next = new Date(Date.parse(`${endsOn}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return dayStartAt(next, tz);
}

const stored = (input: ReturnType<typeof parseTest>['input']) => ({ variants: { b: input.b, note: input.note } as unknown as Prisma.InputJsonValue, split: { b: input.shareB } as Prisma.InputJsonValue });

/** A new test (a draft: nothing is shown until it is started). */
export async function createTest(deps: ExperimentDeps, who: ExperimentWho, raw: unknown): Promise<{ id: string }> {
  const { input, bad } = parseTest(raw);
  if (bad.length) throw new ExperimentError('INVALID_INPUT', 400, bad);
  const key = `${slug(input.name) || 'test'}-${Date.now().toString(36)}`;
  const t = await deps.db.abTest.create({ data: { storeId: S, key, name: input.name, goalEvent: input.goal, endsAt: await endsAtOf(deps, input.endsOn), ...stored(input) }, select: { id: true } });
  await audit(deps.db, who.actor, { storeId: S, action: 'experiments.create', entityType: 'AbTest', entityId: t.id, after: { name: input.name, goal: input.goal, shareB: input.shareB, b: input.b } }, who.ctx);
  return t;
}

/** A draft changed (a test that has started keeps what its visitors saw). */
export async function updateTest(deps: ExperimentDeps, who: ExperimentWho, id: string, raw: unknown): Promise<{ id: string }> {
  const r = await find(deps, id);
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (o.version !== rowVersion(r)) throw new ExperimentError('STALE', 409);
  if (r.status !== 'DRAFT' || r.archivedAt) throw new ExperimentError('NOT_DRAFT', 409);
  const { input, bad } = parseTest(raw);
  if (bad.length) throw new ExperimentError('INVALID_INPUT', 400, bad);
  const done = await deps.db.abTest.updateMany({ where: { id, updatedAt: r.updatedAt, status: 'DRAFT' }, data: { name: input.name, goalEvent: input.goal, endsAt: await endsAtOf(deps, input.endsOn), ...stored(input) } });
  if (!done.count) throw new ExperimentError('STALE', 409);
  await audit(deps.db, who.actor, { storeId: S, action: 'experiments.update', entityType: 'AbTest', entityId: id, before: { name: r.name, b: storedB(r.variants) }, after: { name: input.name, goal: input.goal, shareB: input.shareB, b: input.b } }, who.ctx);
  return { id };
}

// ---- the steps ----------------------------------------------------------------------------------------------------

const FROM: Record<TestAction, readonly TestStatus[]> = {
  start: ['DRAFT', 'PAUSED'],
  pause: ['RUNNING'],
  end: ['RUNNING', 'PAUSED'],
  keep: ['RUNNING', 'PAUSED', 'ENDED'],
  archive: ['DRAFT', 'ENDED'],
  restore: ['DRAFT', 'ENDED'],
};

/** B's words and shown/hidden parts written into the shop's own settings (every other value kept). */
async function applyB(deps: ExperimentDeps, who: ExperimentWho, b: BChanges): Promise<string[]> {
  const keys = keysOf(b);
  for (const key of keys) {
    if (key === 'language.labels') {
      const before = (await deps.resolver.value('language.labels', { storeId: S })) as LabelOverrides | null;
      const done = applyWords(before, b.words);
      if (done.bad.length) throw new ExperimentError('INVALID_INPUT', 400, done.bad);
      await deps.resolver.set('language.labels', done.next as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Experiments: kept B' });
      continue;
    }
    let value: unknown = await deps.resolver.value(key as never, { storeId: S });
    for (const [id, shown] of Object.entries(b.eye)) if (eyeToggle(id)!.key === key) value = writeEye(value, eyeToggle(id)!.path, shown);
    await deps.resolver.set(key as never, value as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Experiments: kept B' });
  }
  return keys;
}

/** One step of a test; answers the test as it is now. */
export async function testAction(deps: ExperimentDeps, who: ExperimentWho, id: string, raw: unknown): Promise<{ test: TestRow }> {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const action = o.action as TestAction;
  if (!(ACTIONS as readonly string[]).includes(String(o.action))) throw new ExperimentError('INVALID_INPUT', 400, ['action']);
  const r = await find(deps, id);
  if (o.version !== rowVersion(r)) throw new ExperimentError('STALE', 409);
  const archivedOk = action === 'restore' ? !!r.archivedAt : !r.archivedAt;
  if (!FROM[action].includes(r.status) || !archivedOk) throw new ExperimentError('NOT_ALLOWED', 409, [r.status]);
  const mod = await moduleOf(deps);
  const now = new Date();
  const data: Prisma.AbTestUpdateManyMutationInput = {};
  let after: Record<string, unknown> = {};
  if (action === 'start') {
    if (!mod.enabled) throw new ExperimentError('MODULE_OFF', 409);
    if (r.endsAt && r.endsAt.getTime() <= now.getTime()) throw new ExperimentError('INVALID_INPUT', 400, ['endsOn']);
    const b = storedB(r.variants);
    if (!Object.keys(b.eye).length && !Object.keys(b.words).length) throw new ExperimentError('INVALID_INPUT', 400, ['b']);
    const others = await deps.db.abTest.findMany({ where: { storeId: S, status: 'RUNNING', archivedAt: null, id: { not: id } }, select: { name: true, variants: true } });
    const hits = others.flatMap((x) => clash(b, storedB(x.variants)).map((what) => `${what} · ${x.name}`));
    if (hits.length) throw new ExperimentError('CLASH', 409, hits.slice(0, 10));
    Object.assign(data, { status: 'RUNNING', startsAt: r.startsAt ?? now });
  } else if (action === 'pause') data.status = 'PAUSED';
  else if (action === 'end') Object.assign(data, { status: 'ENDED', endsAt: r.endsAt && r.endsAt < now ? r.endsAt : now });
  else if (action === 'keep') {
    const winner = o.winner === 'a' || o.winner === 'b' ? o.winner : null;
    if (!winner || r.winner) throw new ExperimentError('INVALID_INPUT', 400, ['winner']);
    const row = await rowOf(deps, r, mod, await timeZoneOf(deps), now);
    if (row.verdict.winner !== winner) throw new ExperimentError('NOT_SURE', 409);
    if (winner === 'b') {
      const b = storedB(r.variants);
      const need = [...(Object.keys(b.eye).length ? ['website.eye.write'] : []), ...(Object.keys(b.words).length ? ['website.words.write'] : [])].filter((p) => !who.can(p));
      if (need.length) throw new ExperimentError('forbidden', 403, need);
      after.applied = await applyB(deps, who, b);
    }
    Object.assign(data, { status: 'ENDED', winner, endsAt: r.status === 'ENDED' && r.endsAt ? r.endsAt : now });
  } else if (action === 'archive') data.archivedAt = now;
  else data.archivedAt = null;
  const done = await deps.db.abTest.updateMany({ where: { id, updatedAt: r.updatedAt }, data });
  if (!done.count) throw new ExperimentError('STALE', 409);
  after = { ...after, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])) };
  await audit(deps.db, who.actor, { storeId: S, action: `experiments.${action}`, entityType: 'AbTest', entityId: id, before: { status: r.status, winner: r.winner }, after }, who.ctx);
  clearLive();
  return experimentOne(deps, id);
}

// ---- finding a word for version B -----------------------------------------------------------------------------------

/** How many words one search answers. */
export const WORD_MATCHES = 12;

/** Testable shop words whose key, English or Bengali has `q` (the editor's "Find a word"). */
export function wordMatches(q: string): { key: string; en: string; bn: string }[] {
  const n = q.trim().toLowerCase().slice(0, 60);
  if (n.length < 2) return [];
  const out: { key: string; en: string; bn: string }[] = [];
  for (const key of WORD_KEYS) {
    if (out.length >= WORD_MATCHES) break;
    const en = defaultWord('en', key);
    const bn = defaultWord('bn', key);
    if ((key.toLowerCase().includes(n) || en.toLowerCase().includes(n) || bn.includes(n)) && testableWord(key)) out.push({ key, en, bn });
  }
  return out;
}

// ---- the API ------------------------------------------------------------------------------------------------------

const answer = (e: unknown): Response => (e instanceof ExperimentError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

const READ = 'reports.experiments.read';
const WRITE = 'reports.experiments.write';

/** /api/admin/reports/experiments and /api/admin/reports/experiments/{id} (see the head of this file). */
export async function experimentsHandler(request: Request, deps: AdminDeps | null, id: string | null = null): Promise<Response> {
  const method = request.method.toUpperCase();
  const allowed = id ? ['GET', 'PUT', 'POST'] : ['GET', 'POST', 'PUT'];
  if (!allowed.includes(method)) return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? READ : WRITE, storeId: S });
  if (g instanceof Response) return g;
  const d: ExperimentDeps = { db: deps!.db, resolver: deps!.resolver };
  const who: ExperimentWho = { actor: g.actor, ctx: g.ctx, can: (p) => g.permissions?.has(p as never) ?? false };
  try {
    if (!id) {
      const sp = new URL(request.url).searchParams;
      if (method === 'GET' && sp.has('words')) return json({ ok: true, words: wordMatches(sp.get('words') ?? '') });
      if (method === 'GET') return json({ ok: true, ...(await experimentsView(d, { archived: sp.get('show') === 'archived' })) });
      if (method === 'PUT') return json({ ok: true, cards: { [CARD]: await saveModule(d, who, b) } });
      return json({ ok: true, ...(await createTest(d, who, b)) }, { status: 201 });
    }
    if (method === 'GET') return json({ ok: true, ...(await experimentOne(d, id)) });
    if (method === 'PUT') return json({ ok: true, ...(await updateTest(d, who, id, b)) });
    return json({ ok: true, ...(await testAction(d, who, id, b)) });
  } catch (e) {
    return answer(e);
  }
}
