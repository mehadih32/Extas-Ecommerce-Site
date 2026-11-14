// PR 718 — Website › Policies (admin prototype v5; GAP-MAP "Policies: 5 new pages … section cards, history; placed under
// Website"): the server side. Nine policy pages (model.ts), each with its words in both languages, a state (live, live with
// a draft waiting, or draft only) and a history of versions kept in `ContentRevision` (entityType `policy`, the page's
// slug as entityId). Nothing is deleted: a save edits the one open draft, a publish makes the draft the live version and
// marks the old one superseded, a restore makes an older version's words a NEW draft (an open draft it replaces is marked
// discarded, never removed). The five pages the shop already had read their words from the setting `pages.text`
// (Settings › Policies & texts): their live version is that text — kept as version 1 the first time this page opens, and a
// later change made in Settings is adopted as a new version — and publishing here writes the words back to it through that
// screen's own save (same checks, same audit). The four new pages' live words are read by the shop straight from the
// history (lib/website-policies/shop.ts). Wording is always the owner's: nothing is written for him; a page with no words
// is an empty draft. Seeing needs `website.read`; every change `settings.write` (checked here again). The audit row names
// the page and version, never the words. Adopting Settings' text into version 1 is bookkeeping only (no actor, no change).
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { hasStandIn, pageWordsSchema } from '@extas/settings';
import type { AppResolver } from '../settings';
import { isPoliciesError, policiesView, savePolicyPage, WORD_FIELDS as SETTINGS_FIELDS, type PoliciesDeps } from '../admin-policies/service';
import {
  EMPTY_WORDS,
  hasWords,
  isExistingPolicy,
  isPolicySlug,
  policyPath,
  POLICY_SLUGS,
  REVISION_TYPE,
  sameWords,
  sourceOfPayload,
  stateOf,
  WORD_FIELDS,
  wordsOfPayload,
  type ExistingPolicySlug,
  type Pair,
  type PolicySlug,
  type PolicyState,
  type PolicyWords,
  type VersionSource,
} from './model';

const S = MOTHER_STORE_ID;
/** The newest versions of a page the screen carries (every version stays stored). */
export const HISTORY_SHOWN = 30;

export type PolicyErrorCode = 'INVALID_INPUT' | 'STALE' | 'PLACEHOLDER' | 'UNKNOWN_TOKEN' | 'NO_DRAFT' | 'NOT_FOUND';
export class PolicyTabError extends Error {
  constructor(
    readonly code: PolicyErrorCode,
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export const isPolicyTabError = (e: unknown): e is PolicyTabError => e instanceof PolicyTabError;

export interface PolicyTabDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
  paymentMode?: PoliciesDeps['paymentMode'];
}
export interface PolicyTabWho {
  actor: Actor;
  ctx: RequestContext;
}

type RevisionStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'DISCARDED';

export interface PolicyVersion {
  version: number;
  status: RevisionStatus;
  source: VersionSource;
  /** ISO time the version was last written (published versions: when it went live). */
  at: string;
  by: string | null;
  /** For a restore: the version whose words it brought back. */
  restoredFrom: number | null;
  words: PolicyWords;
}

export interface PolicyRow {
  slug: PolicySlug;
  state: PolicyState;
  /** Whether the shop already had the page before this tab (its words are shared with Settings › Policies & texts). */
  existing: boolean;
  path: string;
  live: PolicyVersion | null;
  draft: PolicyVersion | null;
  /** The newest version number (0: nothing written yet); a save sends it back so two people never overwrite each other. */
  latest: number;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  /** Newest first, at most `HISTORY_SHOWN`. */
  versions: PolicyVersion[];
}

export interface PolicyTabView {
  rows: PolicyRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

interface RevRow {
  id: string;
  version: number;
  status: RevisionStatus;
  payload: unknown;
  authorId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const revisionsOf = (db: PrismaClient, slug: string): Promise<RevRow[]> =>
  db.contentRevision.findMany({ where: { storeId: S, entityType: REVISION_TYPE, entityId: slug }, orderBy: { version: 'desc' } }) as unknown as Promise<RevRow[]>;

// ---- the words the five existing pages hold in `pages.text` ----

async function settingsWords(deps: PolicyTabDeps, slug: ExistingPolicySlug): Promise<PolicyWords> {
  const text = await deps.resolver.value('pages.text', { storeId: S });
  const w = text?.pages?.[slug];
  return w ? { title: w.title ?? null, lede: w.lede ?? null, body: w.body ?? null } : EMPTY_WORDS;
}

/**
 * Keeps the five existing pages' history true to Settings › Policies & texts: no version yet and words there → they
 * become version 1 (live, source "settings"); the live version differs from what Settings holds now → the Settings text is
 * adopted as the next live version (the old one is marked superseded). Nothing is lost, nothing is deleted.
 */
async function reconcile(deps: PolicyTabDeps, slug: ExistingPolicySlug, revs: RevRow[]): Promise<boolean> {
  const current = await settingsWords(deps, slug);
  const live = revs.find((r) => r.status === 'PUBLISHED') ?? null;
  const liveWords = live ? wordsOfPayload(live.payload) : EMPTY_WORDS;
  if (live ? sameWords(current, liveWords) : !hasWords(current)) return false;
  const now = deps.now?.() ?? new Date();
  const next = (revs[0]?.version ?? 0) + 1;
  try {
    await deps.db.$transaction([
      ...(live ? [deps.db.contentRevision.update({ where: { id: live.id }, data: { status: 'SUPERSEDED' } })] : []),
      deps.db.contentRevision.create({
        data: { storeId: S, entityType: REVISION_TYPE, entityId: slug, version: next, status: 'PUBLISHED', payload: json({ words: current, source: 'settings' }), publishedAt: now },
      }),
    ]);
    return true;
  } catch (e) {
    if (isUnique(e)) return false; // someone else adopted it at the same moment
    throw e;
  }
}

async function names(db: PrismaClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await db.staffUser.findMany({ where: { id: { in: want } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

function versionOf(r: RevRow, who: Map<string, string>): PolicyVersion {
  const rf = isObj(r.payload) && typeof r.payload.restoredFrom === 'number' ? r.payload.restoredFrom : null;
  const at = r.status === 'PUBLISHED' || r.status === 'SUPERSEDED' ? (r.publishedAt ?? r.updatedAt) : r.updatedAt;
  return { version: r.version, status: r.status, source: sourceOfPayload(r.payload), at: at.toISOString(), by: r.authorId ? (who.get(r.authorId) ?? null) : null, restoredFrom: rf, words: wordsOfPayload(r.payload) };
}

function rowOf(slug: PolicySlug, revs: RevRow[], who: Map<string, string>): PolicyRow {
  const live = revs.find((r) => r.status === 'PUBLISHED') ?? null;
  const draft = revs.find((r) => r.status === 'DRAFT') ?? null;
  const newest = revs.find((r) => r.status !== 'DISCARDED') ?? null;
  const last = newest ? versionOf(newest, who) : null;
  return {
    slug,
    state: stateOf(!!live, !!draft),
    existing: isExistingPolicy(slug),
    path: policyPath(slug),
    live: live ? versionOf(live, who) : null,
    draft: draft ? versionOf(draft, who) : null,
    latest: revs[0]?.version ?? 0,
    lastEditedAt: last?.at ?? null,
    lastEditedBy: last?.by ?? null,
    versions: revs.slice(0, HISTORY_SHOWN).map((r) => versionOf(r, who)),
  };
}

async function view(deps: PolicyTabDeps): Promise<PolicyTabView> {
  const all = await Promise.all(
    POLICY_SLUGS.map(async (slug) => {
      let revs = await revisionsOf(deps.db, slug);
      if (isExistingPolicy(slug) && (await reconcile(deps, slug, revs))) revs = await revisionsOf(deps.db, slug);
      return [slug, revs] as const;
    }),
  );
  const who = await names(deps.db, all.flatMap(([, r]) => r.slice(0, HISTORY_SHOWN).map((x) => x.authorId)));
  return { rows: all.map(([slug, revs]) => rowOf(slug, revs, who)) };
}

/** The tab's data (`website.read`). */
export async function policyTabView(deps: PolicyTabDeps, who: PolicyTabWho): Promise<PolicyTabView> {
  await requirePermission(deps.db, who.actor, 'website.read', { storeId: S });
  return view(deps);
}

// ---- checking the owner's words ----

function pairIn(v: unknown, field: string): Pair | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || typeof v.en !== 'string' || typeof v.bn !== 'string') throw new PolicyTabError('INVALID_INPUT', 400, [field]);
  const p = { en: v.en.replace(/\r\n?/g, '\n').trim(), bn: v.bn.replace(/\r\n?/g, '\n').trim() };
  if (!p.en && !p.bn) return null;
  if (!p.en || !p.bn) throw new PolicyTabError('INVALID_INPUT', 400, [field]);
  return p;
}

/** The words as sent: both languages or neither for each field, inside the setting's own lengths, no stand-in text. */
export function wordsIn(v: unknown): PolicyWords {
  if (!isObj(v)) throw new PolicyTabError('INVALID_INPUT', 400, ['words']);
  const w: PolicyWords = { title: pairIn(v.title, 'title'), lede: pairIn(v.lede, 'lede'), body: pairIn(v.body, 'body') };
  const ok = pageWordsSchema.safeParse(w);
  if (!ok.success) throw new PolicyTabError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'words')))]);
  const stand = WORD_FIELDS.filter((f) => w[f] && (hasStandIn(w[f].en) || hasStandIn(w[f].bn)));
  if (stand.length) throw new PolicyTabError('PLACEHOLDER', 400, stand);
  return w;
}

const slugIn = (v: unknown): PolicySlug => {
  if (!isPolicySlug(v)) throw new PolicyTabError('INVALID_INPUT', 400, ['page']);
  return v;
};

async function mustWrite(deps: PolicyTabDeps, who: PolicyTabWho) {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
}

const auditOf = (deps: PolicyTabDeps, who: PolicyTabWho, action: string, slug: string, version: number) =>
  audit(deps.db, who.actor, { storeId: S, action, entityType: 'Policy', entityId: slug, after: { page: slug, version } }, who.ctx);

function staleCheck(sent: unknown, latest: number) {
  if (sent !== undefined && sent !== latest) throw new PolicyTabError('STALE', 409, ['version'], { version: latest });
}

// ---- save a draft, publish, restore ----

/** Saves the words as the page's one open draft (a new version when none is open). Same words as the live page: no change. */
export async function savePolicyDraft(deps: PolicyTabDeps, who: PolicyTabWho, input: unknown): Promise<PolicyTabView> {
  await mustWrite(deps, who);
  if (!isObj(input)) throw new PolicyTabError('INVALID_INPUT', 400, ['page']);
  const slug = slugIn(input.page);
  const words = wordsIn(input.words);
  await view(deps); // brings an existing page's history up to Settings first
  const revs = await revisionsOf(deps.db, slug);
  staleCheck(input.version, revs[0]?.version ?? 0);
  const draft = revs.find((r) => r.status === 'DRAFT') ?? null;
  const live = revs.find((r) => r.status === 'PUBLISHED') ?? null;
  const payload = json({ words, source: 'edit' });
  if (draft) {
    if (sameWords(words, wordsOfPayload(draft.payload))) return view(deps);
    await deps.db.contentRevision.update({ where: { id: draft.id }, data: { payload, authorId: who.actor.staffUserId } });
    await auditOf(deps, who, 'website.policy.draft', slug, draft.version);
  } else {
    if (live ? sameWords(words, wordsOfPayload(live.payload)) : !hasWords(words)) return view(deps);
    const next = (revs[0]?.version ?? 0) + 1;
    try {
      await deps.db.contentRevision.create({ data: { storeId: S, entityType: REVISION_TYPE, entityId: slug, version: next, status: 'DRAFT', payload, authorId: who.actor.staffUserId } });
    } catch (e) {
      if (isUnique(e)) throw new PolicyTabError('STALE', 409, ['version'], { version: next });
      throw e;
    }
    await auditOf(deps, who, 'website.policy.draft', slug, next);
  }
  return view(deps);
}

/** Makes the page's open draft its live version. A page the shop already had also gets the words in Settings (same checks). */
export async function publishPolicy(deps: PolicyTabDeps, who: PolicyTabWho, input: unknown, lang: string): Promise<PolicyTabView> {
  await mustWrite(deps, who);
  if (!isObj(input)) throw new PolicyTabError('INVALID_INPUT', 400, ['page']);
  const slug = slugIn(input.page);
  await view(deps);
  const revs = await revisionsOf(deps.db, slug);
  staleCheck(input.version, revs[0]?.version ?? 0);
  const draft = revs.find((r) => r.status === 'DRAFT');
  if (!draft) throw new PolicyTabError('NO_DRAFT', 409);
  const words = wordsOfPayload(draft.payload);
  // a page the shop already had keeps its own title when none is written; a new page needs its title and its text
  const missing = [...(words.body ? [] : ['body']), ...(isExistingPolicy(slug) || words.title ? [] : ['title'])];
  if (missing.length) throw new PolicyTabError('INVALID_INPUT', 400, missing);
  if (isExistingPolicy(slug)) {
    // the shop reads these words from Settings: save them there first, with that screen's own checks and audit
    const dep: PoliciesDeps = { db: deps.db, resolver: deps.resolver, now: deps.now, paymentMode: deps.paymentMode };
    const sw = { actor: who.actor, ctx: who.ctx };
    const card = (await policiesView(dep, sw, lang)).cards[slug];
    try {
      await savePolicyPage(dep, sw, { key: slug, value: { ...card.value, ...Object.fromEntries(SETTINGS_FIELDS.map((f) => [f, words[f]])) } }, lang);
    } catch (e) {
      if (isPoliciesError(e)) throw new PolicyTabError(e.code, e.status, e.details, e.data);
      throw e;
    }
  }
  const now = deps.now?.() ?? new Date();
  const live = revs.find((r) => r.status === 'PUBLISHED');
  await deps.db.$transaction([
    ...(live ? [deps.db.contentRevision.update({ where: { id: live.id }, data: { status: 'SUPERSEDED' } })] : []),
    deps.db.contentRevision.update({ where: { id: draft.id }, data: { status: 'PUBLISHED', publishedAt: now, authorId: who.actor.staffUserId ?? draft.authorId } }),
  ]);
  await auditOf(deps, who, 'website.policy.publish', slug, draft.version);
  return view(deps);
}

/** Brings an older version's words back as a NEW draft (an open draft is marked discarded, never removed). */
export async function restorePolicy(deps: PolicyTabDeps, who: PolicyTabWho, input: unknown): Promise<PolicyTabView> {
  await mustWrite(deps, who);
  if (!isObj(input)) throw new PolicyTabError('INVALID_INPUT', 400, ['page']);
  const slug = slugIn(input.page);
  if (typeof input.restore !== 'number' || !Number.isInteger(input.restore)) throw new PolicyTabError('INVALID_INPUT', 400, ['restore']);
  await view(deps);
  const revs = await revisionsOf(deps.db, slug);
  staleCheck(input.version, revs[0]?.version ?? 0);
  const from = revs.find((r) => r.version === input.restore);
  if (!from) throw new PolicyTabError('NOT_FOUND', 404, ['restore']);
  const open = revs.find((r) => r.status === 'DRAFT');
  const next = (revs[0]?.version ?? 0) + 1;
  try {
    await deps.db.$transaction([
      ...(open ? [deps.db.contentRevision.update({ where: { id: open.id }, data: { status: 'DISCARDED' } })] : []),
      deps.db.contentRevision.create({
        data: { storeId: S, entityType: REVISION_TYPE, entityId: slug, version: next, status: 'DRAFT', payload: json({ words: wordsOfPayload(from.payload), source: 'restore', restoredFrom: from.version }), authorId: who.actor.staffUserId },
      }),
    ]);
  } catch (e) {
    if (isUnique(e)) throw new PolicyTabError('STALE', 409, ['version'], { version: next });
    throw e;
  }
  await auditOf(deps, who, 'website.policy.restore', slug, next);
  return view(deps);
}
