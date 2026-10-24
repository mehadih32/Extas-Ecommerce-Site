// PR 284 — the merge rules, and merges by a person (BACKEND-ARCHITECTURE §5.5 CUS-05; ADMIN-ARCHITECTURE "To review").
//
// Suggestions: two profiles may be one person when the owner's merge rules (`customers.merge.signals`) match — the
// same e-mail; one profile's WhatsApp number is the other's phone; the same name with the same address (a saved
// address, or an order's); the same identity in the order identity graph (S06 PR 519; it only has identities while
// `risk.identity` is on). A pair someone marked "Not the same person" is never suggested again (until that decision is
// undone); a profile already merged is not suggested. The profile that stays is the one others are merged into, else
// the one with more orders, else the older one.
//
// Seeing the suggestions, a pair side by side and the decisions made needs `customers.read` (numbers masked without
// `customers.phone`); deciding needs `customers.merge`. A merge is always a person's action, never the shop's: the
// second profile names the first as its survivor (Customer.mergedIntoId) and that is all — orders, wallets, notes,
// consent and sign-ins stay on their own profile, so the survivor's single view shows both and a split restores exactly
// what was there. Nothing is deleted; every decision is a CustomerMerge row and an audit row in the same transaction. A
// merge with an Idempotency-Key is done once (the same key again gives the first answer). No money moves, no COD rule
// changes, nobody is blocked.
import { Prisma } from '@extas/db/client';
import { audit } from '@extas/auth';
import { customerKpis } from '@extas/metrics';
import { MERGE_SIGNALS, type MergeSignal } from '@extas/settings';
import { z } from 'zod';
import { allow, KEY, nowOf, parse, setting, TX, UUID, type CustomersDeps, type Tx, type Who } from './context';
import { CustomersError } from './errors';
import { familyOf, familyRef, PROFILE_SELECT, type ProfileRow } from './family';
import { groupPairs, mergeProblem, pairKey, pickSurvivor, type ProfileFacts } from './pure';
import { cardOf, maskOf, type ProfileCard } from './view';

/** What a decision may name as its reason: the matched rules, or a person's own choice. */
export const DECISION_SIGNALS = [...MERGE_SIGNALS, 'manual'] as const;
export type DecisionSignal = (typeof DECISION_SIGNALS)[number];

const note = z.string().trim().max(500);

export const mergeInput = z
  .object({ survivorId: z.uuid(), mergedId: z.uuid(), note: note.optional(), signals: z.array(z.enum(DECISION_SIGNALS)).max(DECISION_SIGNALS.length).optional() })
  .strict();
export const notSameInput = z.object({ aId: z.uuid(), bId: z.uuid(), note: note.optional(), signals: z.array(z.enum(DECISION_SIGNALS)).max(DECISION_SIGNALS.length).optional() }).strict();
export const undoInput = z.object({ note: z.string().trim().min(3).max(500) }).strict();

export interface DecisionResult {
  id: string;
  decision: 'MERGED' | 'NOT_SAME';
  survivorId: string;
  mergedId: string;
  /** A repeat of the same request (same Idempotency-Key): nothing new was done. */
  replay: boolean;
}

async function factsOf(tx: Tx, storeId: number, ids: string[]): Promise<Map<string, ProfileFacts>> {
  // the rows are locked in id order, so two merges of the same pair at once wait for each other (never a deadlock)
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Customer" WHERE "storeId" = ${storeId} AND "id" = ANY(${ids}::uuid[]) ORDER BY "id" FOR UPDATE`;
  if (locked.length !== new Set(ids).size) throw new CustomersError('NOT_FOUND', 'no such customer', ['survivorId', 'mergedId']);
  const rows = await tx.customer.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, mergedIntoId: true, createdAt: true, erasedAt: true, archivedAt: true, orderCount: true } });
  const members = await tx.customer.groupBy({ by: ['mergedIntoId'], where: { storeId, mergedIntoId: { in: ids } }, _count: { _all: true } });
  const count = new Map(members.map((m) => [m.mergedIntoId!, m._count._all]));
  return new Map(
    rows.map((r) => [r.id, { id: r.id, mergedIntoId: r.mergedIntoId, members: count.get(r.id) ?? 0, orders: r.orderCount, createdAt: r.createdAt, erased: !!r.erasedAt, archived: !!r.archivedAt }]),
  );
}

async function replayed(tx: Tx | CustomersDeps['db'], storeId: number, key: string | undefined, same: (r: { decision: string; survivorId: string; mergedId: string }) => boolean): Promise<DecisionResult | null> {
  if (!key) return null;
  const r = await tx.customerMerge.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: key } } });
  if (!r) return null;
  if (!same(r)) throw new CustomersError('KEY_REUSED', 'this Idempotency-Key was used for another request', ['idempotencyKey']);
  return { id: r.id, decision: r.decision, survivorId: r.survivorId, mergedId: r.mergedId, replay: true };
}

const checkKey = (key: string | undefined) => {
  if (key !== undefined && !KEY.test(key)) throw new CustomersError('INVALID_INPUT', 'the Idempotency-Key is not valid', ['idempotencyKey']);
  return key;
};

/** A person merges `mergedId` into `survivorId` (see the file header). */
export async function mergeCustomers(deps: CustomersDeps, who: Who, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<DecisionResult> {
  const d = parse(mergeInput, input, 'merge');
  const key = checkKey(opts.idempotencyKey);
  await allow(deps, who, 'customers.merge');
  const rules = await setting(deps, who.storeId, 'customers.merge');
  if (rules.noteRequired && !d.note) throw new CustomersError('NOTE_REQUIRED', 'the merge rules ask for a short note', ['note']);
  const same = (r: { decision: string; survivorId: string; mergedId: string }) => r.decision === 'MERGED' && r.survivorId === d.survivorId && r.mergedId === d.mergedId;
  const early = await replayed(deps.db, who.storeId, key, same);
  if (early) return early;
  try {
    return await deps.db.$transaction(async (tx) => {
      const again = await replayed(tx, who.storeId, key, same);
      if (again) return again;
      const facts = await factsOf(tx, who.storeId, [d.survivorId, d.mergedId]);
      const s = facts.get(d.survivorId);
      const m = facts.get(d.mergedId);
      if (!s || !m) throw new CustomersError('NOT_FOUND', 'no such customer', ['survivorId', 'mergedId']);
      const problem = mergeProblem(s, m);
      if (problem) throw new CustomersError(problem.code, 'these two profiles cannot be merged this way', [], problem.data);
      const now = nowOf(deps);
      await tx.customer.update({ where: { id: m.id }, data: { mergedIntoId: s.id, mergedAt: now } });
      const row = await tx.customerMerge.create({
        data: { storeId: who.storeId, decision: 'MERGED', survivorId: s.id, mergedId: m.id, signals: d.signals?.length ? [...new Set(d.signals)] : ['manual'], note: d.note || null, decidedById: who.actor.staffUserId, idempotencyKey: key ?? null, createdAt: now },
      });
      await audit(tx, who.actor, { action: 'customer.merge', entityType: 'Customer', entityId: m.id, storeId: who.storeId, before: { mergedIntoId: null }, after: { mergedIntoId: s.id, mergeId: row.id, signals: row.signals, note: row.note } }, who.ctx);
      return { id: row.id, decision: 'MERGED' as const, survivorId: s.id, mergedId: m.id, replay: false };
    }, TX);
  } catch (e) {
    // the same key raced in a second request: its stored answer
    if (key && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const r = await replayed(deps.db, who.storeId, key, same);
      if (r) return r;
    }
    throw e;
  }
}

/** A person says two profiles are not the same person: the pair is not suggested again (undo brings it back). */
export async function notSamePerson(deps: CustomersDeps, who: Who, input: unknown): Promise<DecisionResult> {
  const d = parse(notSameInput, input, 'decision');
  await allow(deps, who, 'customers.merge');
  if (d.aId === d.bId) throw new CustomersError('SAME_PROFILE', 'a profile is always the same person as itself', ['bId']);
  const [a, b] = d.aId < d.bId ? [d.aId, d.bId] : [d.bId, d.aId];
  return deps.db.$transaction(async (tx) => {
    const n = await tx.customer.count({ where: { storeId: who.storeId, id: { in: [a, b] } } });
    if (n !== 2) throw new CustomersError('NOT_FOUND', 'no such customer', ['aId', 'bId']);
    const open = await tx.customerMerge.findFirst({ where: { storeId: who.storeId, decision: 'NOT_SAME', survivorId: a, mergedId: b, undoneAt: null } });
    if (open) return { id: open.id, decision: 'NOT_SAME' as const, survivorId: a, mergedId: b, replay: true };
    const row = await tx.customerMerge.create({ data: { storeId: who.storeId, decision: 'NOT_SAME', survivorId: a, mergedId: b, signals: d.signals?.length ? [...new Set(d.signals)] : ['manual'], note: d.note || null, decidedById: who.actor.staffUserId, createdAt: nowOf(deps) } });
    await audit(tx, who.actor, { action: 'customer.notSame', entityType: 'CustomerMerge', entityId: row.id, storeId: who.storeId, after: { a, b, signals: row.signals, note: row.note } }, who.ctx);
    return { id: row.id, decision: 'NOT_SAME' as const, survivorId: a, mergedId: b, replay: false };
  }, TX);
}

/**
 * A decision undone with a reason: a merge is split (the merged profile is its own again, exactly as before); a "not
 * the same person" is taken back (the pair may be suggested again). The row stays, with who undid it and why.
 */
export async function undoDecision(deps: CustomersDeps, who: Who, decisionId: string, input: unknown): Promise<DecisionResult> {
  const d = parse(undoInput, input, 'undo');
  await allow(deps, who, 'customers.merge');
  if (!UUID.test(decisionId)) throw new CustomersError('NOT_FOUND', 'no such decision', ['decisionId']);
  return deps.db.$transaction(async (tx) => {
    const r = await tx.customerMerge.findFirst({ where: { id: decisionId, storeId: who.storeId } });
    if (!r) throw new CustomersError('NOT_FOUND', 'no such decision', ['decisionId']);
    if (r.undoneAt) throw new CustomersError('ALREADY_UNDONE', 'this decision was undone already', [], { undoneAt: r.undoneAt.toISOString() });
    const now = nowOf(deps);
    if (r.decision === 'MERGED') {
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${r.mergedId}::uuid FOR UPDATE`;
      const m = await tx.customer.findUniqueOrThrow({ where: { id: r.mergedId }, select: { mergedIntoId: true } });
      if (m.mergedIntoId !== r.survivorId) throw new CustomersError('MOVED_ON', 'this profile is not merged by this decision any more', ['decisionId']);
      await tx.customer.update({ where: { id: r.mergedId }, data: { mergedIntoId: null, mergedAt: null } });
    }
    await tx.customerMerge.update({ where: { id: r.id }, data: { undoneAt: now, undoneById: who.actor.staffUserId, undoNote: d.note } });
    await audit(
      tx,
      who.actor,
      { action: r.decision === 'MERGED' ? 'customer.split' : 'customer.notSame.undo', entityType: r.decision === 'MERGED' ? 'Customer' : 'CustomerMerge', entityId: r.decision === 'MERGED' ? r.mergedId : r.id, storeId: who.storeId, before: r.decision === 'MERGED' ? { mergedIntoId: r.survivorId } : null, after: { decisionId: r.id, note: d.note } },
      who.ctx,
    );
    return { id: r.id, decision: r.decision, survivorId: r.survivorId, mergedId: r.mergedId, replay: false };
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------------
// Suggestions (the "To review" list) and the decisions made
// ---------------------------------------------------------------------------------------------------------------------

/** A profile as the review list shows it: its card and what it carries. */
export interface PairSide extends ProfileCard {
  /** Placed orders (Ordered value's count) and the delivered spend (Sales), all time, from @extas/metrics. */
  orders: number;
  salesMinor: number;
  lastOrderAt: Date | null;
  /** Profiles merged into this one already. */
  members: number;
}

export interface MergePair {
  key: string;
  /** The profile that stays (shown first) and the one that would join it. */
  survivor: PairSide;
  merged: PairSide;
  signals: MergeSignal[];
}

export interface MergeSuggestions {
  /** `customers.merge.suggest`: off = no suggestions (a person may still merge by hand). */
  enabled: boolean;
  signals: MergeSignal[];
  pairs: MergePair[];
  /** Pairs found in all (the list shows `perPage` of them). */
  total: number;
}

/** How many profiles of one shared value make pairs (a value shared by more is a common one, not a person). */
const GROUP_MAX = 6; // hardcode-ok: a read bound, not a business figure

type Group = { ids: string[] };

async function groupsBy(deps: CustomersDeps, storeId: number, signal: MergeSignal): Promise<Group[]> {
  const live = Prisma.sql`c."storeId" = ${storeId} AND c."mergedIntoId" IS NULL AND c."erasedAt" IS NULL AND c."archivedAt" IS NULL`;
  let rows: { ids: string[] }[] = [];
  if (signal === 'email') {
    rows = await deps.db.$queryRaw`
      SELECT array_agg(c."id"::text ORDER BY c."createdAt") AS ids FROM "Customer" c
      WHERE ${live} AND c."email" IS NOT NULL AND position('@' in c."email") > 0
      GROUP BY lower(trim(c."email")) HAVING count(*) BETWEEN 2 AND ${GROUP_MAX}`;
  } else if (signal === 'whatsapp') {
    // one profile's WhatsApp number is another's phone (compared on the national digits, however either is written)
    rows = await deps.db.$queryRaw`
      SELECT ARRAY[a."id"::text, b."id"::text] AS ids FROM "Customer" a JOIN "Customer" b ON b."storeId" = a."storeId" AND b."id" <> a."id"
        AND right(regexp_replace(b."phone", '[^0-9]', '', 'g'), 10) = right(regexp_replace(a."whatsappNumber", '[^0-9]', '', 'g'), 10)
      WHERE a."storeId" = ${storeId} AND a."mergedIntoId" IS NULL AND a."erasedAt" IS NULL AND a."archivedAt" IS NULL
        AND b."mergedIntoId" IS NULL AND b."erasedAt" IS NULL AND b."archivedAt" IS NULL
        AND length(regexp_replace(a."whatsappNumber", '[^0-9]', '', 'g')) >= 10`;
  } else if (signal === 'nameAddress') {
    // a profile's saved addresses and the addresses its own orders went to, each with the name on it
    rows = await deps.db.$queryRaw`
      WITH pa AS (
        SELECT c."id", c."createdAt", a."name" AS nm, a."addressLine" AS addr FROM "Customer" c JOIN "CustomerAddress" a ON a."customerId" = c."id" AND a."archivedAt" IS NULL WHERE ${live}
        UNION
        SELECT c."id", c."createdAt", o."customerName" AS nm, o."shippingAddressText" AS addr FROM "Customer" c JOIN "Order" o ON o."customerId" = c."id" AND o."storeId" = c."storeId" AND NOT o."isGift" AND o."status" <> 'DRAFT' WHERE ${live}
      ), k AS (
        SELECT DISTINCT "id", "createdAt",
               trim(regexp_replace(lower(normalize(nm, NFKC)), '[^[:alnum:]]+', ' ', 'g')) AS nk,
               trim(regexp_replace(lower(normalize(addr, NFKC)), '[^[:alnum:]]+', ' ', 'g')) AS ak
        FROM pa WHERE nm IS NOT NULL AND addr IS NOT NULL
      )
      SELECT array_agg(DISTINCT "id"::text) AS ids FROM k WHERE nk <> '' AND ak <> ''
      GROUP BY nk, ak HAVING count(DISTINCT "id") BETWEEN 2 AND ${GROUP_MAX}`;
  } else {
    // the order identity graph: profiles whose numbers sit in one identity (a merged identity counts as its survivor)
    rows = await deps.db.$queryRaw`
      SELECT array_agg(DISTINCT c."id"::text) AS ids
      FROM "IdentityLink" l JOIN "IdentityCluster" ic ON ic."id" = l."clusterId"
      JOIN "Customer" c ON c."storeId" = l."storeId" AND c."phone" = l."valueNorm"
      WHERE l."storeId" = ${storeId} AND l."kind" = 'PHONE' AND ic."archivedAt" IS NULL AND ${live}
      GROUP BY COALESCE(ic."mergedIntoId", ic."id") HAVING count(DISTINCT c."id") BETWEEN 2 AND ${GROUP_MAX}`;
  }
  return rows.map((r) => ({ ids: r.ids }));
}

interface Side {
  row: ProfileRow;
  members: number;
}

/** The pairs the merge rules find now, the strongest first (most rules matched, then the newest activity). */
export async function mergeSuggestions(deps: CustomersDeps, who: Who): Promise<MergeSuggestions> {
  const viewer = await allow(deps, who, 'customers.read');
  const rules = await setting(deps, who.storeId, 'customers.merge');
  const signals = [...rules.signals];
  if (!rules.suggest || !signals.length) return { enabled: rules.suggest, signals, pairs: [], total: 0 };
  const found = new Map<string, { a: string; b: string; signals: Set<MergeSignal> }>();
  for (const s of signals) {
    for (const g of await groupsBy(deps, who.storeId, s)) {
      for (const [a, b] of groupPairs(g.ids, GROUP_MAX)) {
        const k = pairKey(a, b);
        const p = found.get(k) ?? { a, b, signals: new Set<MergeSignal>() };
        p.signals.add(s);
        found.set(k, p);
      }
    }
  }
  if (!found.size) return { enabled: true, signals, pairs: [], total: 0 };
  const dismissed = await deps.db.customerMerge.findMany({ where: { storeId: who.storeId, decision: 'NOT_SAME', undoneAt: null }, select: { survivorId: true, mergedId: true } });
  for (const d of dismissed) found.delete(pairKey(d.survivorId, d.mergedId));
  const ids = [...new Set([...found.values()].flatMap((p) => [p.a, p.b]))];
  const [rows, memberCounts] = await Promise.all([
    deps.db.customer.findMany({ where: { storeId: who.storeId, id: { in: ids } }, select: PROFILE_SELECT }),
    deps.db.customer.groupBy({ by: ['mergedIntoId'], where: { storeId: who.storeId, mergedIntoId: { in: ids } }, _count: { _all: true } }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const members = new Map(memberCounts.map((m) => [m.mergedIntoId!, m._count._all]));
  const facts = (r: ProfileRow): ProfileFacts => ({ id: r.id, mergedIntoId: r.mergedIntoId, members: members.get(r.id) ?? 0, orders: r.orderCount, createdAt: r.createdAt, erased: !!r.erasedAt, archived: !!r.archivedAt });
  const ranked: { key: string; s: Side; m: Side; signals: MergeSignal[]; last: number }[] = [];
  for (const [key, p] of found) {
    const a = byId.get(p.a);
    const b = byId.get(p.b);
    if (!a || !b) continue;
    const pick = pickSurvivor(facts(a), facts(b));
    if (!pick || mergeProblem(pick.survivor, pick.merged)) continue;
    const s = pick.survivor.id === a.id ? a : b;
    const m = s === a ? b : a;
    const last = Math.max(a.lastOrderAt?.getTime() ?? 0, b.lastOrderAt?.getTime() ?? 0, a.createdAt.getTime(), b.createdAt.getTime());
    ranked.push({ key, s: { row: s, members: members.get(s.id) ?? 0 }, m: { row: m, members: 0 }, signals: signals.filter((x) => p.signals.has(x)), last });
  }
  ranked.sort((x, y) => y.signals.length - x.signals.length || y.last - x.last || (x.key < y.key ? -1 : 1));
  const page = ranked.slice(0, rules.perPage);
  const sides = await sidesOf(deps, who.storeId, page.flatMap((p) => [p.s, p.m]), viewer);
  return { enabled: true, signals, total: ranked.length, pairs: page.map((p) => ({ key: p.key, survivor: sides.get(p.s.row.id)!, merged: sides.get(p.m.row.id)!, signals: p.signals })) };
}

/** Each profile's card with its orders and delivered spend (each profile on its own, with its members' orders). */
async function sidesOf(deps: CustomersDeps, storeId: number, sides: readonly Side[], viewer: { fullPhone: boolean }): Promise<Map<string, PairSide>> {
  const mask = await maskOf(deps, storeId);
  const refs = [];
  for (const s of sides) {
    const f = await familyOf(deps.db, storeId, s.row.id);
    if (f) refs.push(familyRef({ root: s.row, members: f.redirected ? [] : f.family.members }));
  }
  const kpis = await customerKpis(deps.db, storeId, refs);
  return new Map(
    sides.map((s) => {
      const k = kpis.get(s.row.id);
      return [s.row.id, { ...cardOf(s.row, viewer, mask), orders: k?.ordered.orders ?? 0, salesMinor: k?.sales.valueMinor ?? 0, lastOrderAt: k?.lastOrderAt ?? null, members: s.members }];
    }),
  );
}

/** Two profiles side by side for a person's own merge ("Merge with…"): the same cards as a suggestion. */
export async function mergePreview(deps: CustomersDeps, who: Who, aId: string, bId: string): Promise<MergePair | null> {
  const viewer = await allow(deps, who, 'customers.read');
  if (!UUID.test(aId) || !UUID.test(bId) || aId === bId) return null;
  const rows = await deps.db.customer.findMany({ where: { storeId: who.storeId, id: { in: [aId, bId] } }, select: PROFILE_SELECT });
  if (rows.length !== 2) return null;
  const memberCounts = await deps.db.customer.groupBy({ by: ['mergedIntoId'], where: { storeId: who.storeId, mergedIntoId: { in: [aId, bId] } }, _count: { _all: true } });
  const members = new Map(memberCounts.map((m) => [m.mergedIntoId!, m._count._all]));
  const a = rows.find((r) => r.id === aId)!;
  const b = rows.find((r) => r.id === bId)!;
  const sides = await sidesOf(deps, who.storeId, [{ row: a, members: members.get(a.id) ?? 0 }, { row: b, members: members.get(b.id) ?? 0 }], viewer);
  return { key: pairKey(aId, bId), survivor: sides.get(aId)!, merged: sides.get(bId)!, signals: [] };
}

/** A safety bound on one read of the decisions (not a business number). */
const DECISIONS_MAX = 200; // hardcode-ok: a read bound, not a business figure

export interface DecisionRow {
  id: string;
  decision: 'MERGED' | 'NOT_SAME';
  survivor: { id: string; name: string | null };
  merged: { id: string; name: string | null };
  signals: string[];
  note: string | null;
  by: string | null;
  at: Date;
  undone: { at: Date; by: string | null; note: string | null } | null;
}

/** The decisions made, newest first (as many as the merge rules' `perPage` unless the caller asks for fewer or more). */
export async function mergeDecisions(deps: CustomersDeps, who: Who, opts: { limit?: number } = {}): Promise<DecisionRow[]> {
  await allow(deps, who, 'customers.read');
  const asked = opts.limit !== undefined && Number.isFinite(opts.limit) ? Math.trunc(opts.limit) : (await setting(deps, who.storeId, 'customers.merge')).perPage;
  const take = Math.min(Math.max(1, asked), DECISIONS_MAX);
  const rows = await deps.db.customerMerge.findMany({ where: { storeId: who.storeId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take });
  const cids = [...new Set(rows.flatMap((r) => [r.survivorId, r.mergedId]))];
  const sids = [...new Set(rows.flatMap((r) => [r.decidedById, r.undoneById]).filter((x): x is string => !!x))];
  const [cs, ss] = await Promise.all([
    cids.length ? deps.db.customer.findMany({ where: { storeId: who.storeId, id: { in: cids } }, select: { id: true, name: true } }) : [],
    sids.length ? deps.db.staffUser.findMany({ where: { id: { in: sids } }, select: { id: true, displayName: true } }) : [],
  ]);
  const cname = new Map(cs.map((c) => [c.id, c.name]));
  const sname = new Map(ss.map((s) => [s.id, s.displayName]));
  return rows.map((r) => ({
    id: r.id,
    decision: r.decision,
    survivor: { id: r.survivorId, name: cname.get(r.survivorId) ?? null },
    merged: { id: r.mergedId, name: cname.get(r.mergedId) ?? null },
    signals: r.signals,
    note: r.note,
    by: r.decidedById ? (sname.get(r.decidedById) ?? null) : null,
    at: r.createdAt,
    undone: r.undoneAt ? { at: r.undoneAt, by: r.undoneById ? (sname.get(r.undoneById) ?? null) : null, note: r.undoNote } : null,
  }));
}
