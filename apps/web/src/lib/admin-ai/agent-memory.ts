// S15 · PR 582 (C10.4, "Strong agent memory") — one long-term memory store per agent: facts, decisions, the
// owner's own instructions, past campaigns/tasks and their outcomes, and lessons. `AiMemory` (tagged for this PR in
// the full S00 schema; no migration) holds every row — `storeId` optional, since most memories are about the whole
// installation, not one store.
//
// **Off by default** (`ai.memory.enabled`, CLAUDE.md rule 1): a business-wide switch, shared by every agent — one
// row, not one per agent, the same shape `ai.enabled` already uses. While it is off, `recordAgentMemory` quietly
// no-ops (the same AI-off instinct PR 305's master switch and PR 324's guard already use: a disabled AI feature
// never breaks the caller, it just does nothing) and the admin shows an honest "off" state instead of an empty list
// that looks like "nothing happened yet".
//
// **Searchable by meaning:** `AiMemory.embedding` is reserved for a real vector index once an embedding provider is
// wired (A1.3 "every integration runs on a mock until its key arrives") — until then, `searchAgentMemories` matches
// by plain case-insensitive text over the content and tags, an honest mock rather than a fabricated "semantic"
// score.
//
// **Summarised weekly:** `weeklyAgentMemoryDigest` builds the week's counts and highlights on demand, read straight
// from the rows already written — there is no cron here (none is wanted: CLAUDE.md "no new scheduled triggers" for
// this build), so the owner (or, later, a job runner) calls it when a summary is wanted, the same "preview, not a
// live schedule" honesty PR 308's own schedule preview used before any job runner read it.
//
// **Loaded at the start of every task:** `agentMemoryBrief` is the short list a task replays per the Memory
// protocol (PR 577's own header comment) — exposed here so a future job runner can call it; none exists yet, the
// same gap PR 307/308/309 shipped ahead of their own runners.
//
// **Never deleted silently; the owner can view and correct it:** `correctAgentMemory` edits a row's content/tags
// (audited, `correctedById` set) and `setAgentMemoryArchived` archives/restores one (audited) — neither ever calls
// `delete`. Backed up nightly to Google Drive needs no new code: `AiMemory` is an ordinary table in the one
// Postgres database the existing nightly backup (PR 8/395/507) already carries whole.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { PrismaClient } from '@extas/db/client';
import { INSTALLATION } from '@extas/settings';
import type { AppResolver } from '../settings';
import { isAiAgentKey } from './agents';
import { ensureAgentRows } from './control-room';
import { AiError } from './errors';

export const MEMORY_KINDS = ['fact', 'decision', 'instruction', 'campaign', 'task', 'lesson'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export function isMemoryKind(v: string): v is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(v);
}

const CONTENT_MAX = 2000;
const SOURCE_REF_MAX = 200;
const TAG_MAX = 40;
const TAGS_MAX_COUNT = 8;
const BRIEF_MAX = 10;
const LIST_MAX = 50;
const DIGEST_DAYS = 7;
const HIGHLIGHT_MAX = 5;
const HIGHLIGHT_CHARS = 160;
const TOP_TAGS_MAX = 5;

export interface AgentMemoryDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value' | 'set'>;
  now?: () => Date;
}

export interface AgentMemoryView {
  id: string;
  kind: MemoryKind;
  content: string;
  tags: string[];
  sourceRef: string | null;
  corrected: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

function cleanTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t || t.length > TAG_MAX) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= TAGS_MAX_COUNT) break;
  }
  return out;
}

function viewOf(row: { id: string; kind: string; content: string; tags: string[]; sourceRef: string | null; correctedById: string | null; archivedAt: Date | null; createdAt: Date; updatedAt: Date }): AgentMemoryView {
  return {
    id: row.id,
    kind: isMemoryKind(row.kind) ? row.kind : 'fact',
    content: row.content,
    tags: row.tags,
    sourceRef: row.sourceRef,
    corrected: row.correctedById !== null,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Is the memory feature on right now (CLAUDE.md rule 1: off until the owner turns it on)? One switch for every
 * agent, read the same way every other installation-scope flag is. */
export async function memoryEnabled(deps: Pick<AgentMemoryDeps, 'resolver'>, storeId: number): Promise<boolean> {
  return deps.resolver.value('ai.memory.enabled', { storeId });
}

/** The owner's own on/off switch for the whole memory feature (shared by every agent, so it is set once, not once
 * per agent). A no-op when it already is what was asked, so a double tap writes once — the same shape
 * `setMasterEnabled` (control-room.ts, PR 305) already uses. */
export async function setMemoryEnabled(deps: Pick<AgentMemoryDeps, 'resolver'>, who: { actor: Actor; ctx?: RequestContext }, enabled: boolean, storeId: number): Promise<void> {
  const current = await deps.resolver.value('ai.memory.enabled', { storeId });
  if (current === enabled) return;
  await deps.resolver.set('ai.memory.enabled', enabled, INSTALLATION, {
    actorId: who.actor.staffUserId ?? null,
    reason: enabled ? 'AI agent memory: turned on' : 'AI agent memory: turned off',
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `AiMemory.id` is a Postgres `uuid` column, so a malformed id (not just an absent one) is just as much "not
 * found" from the caller's side — Prisma would otherwise throw on the bad format before any row lookup happens. */
function requireMemoryId(memoryId: string): void {
  if (!UUID_RE.test(memoryId)) throw new AiError(404, 'NOT_FOUND', ['memoryId']);
}

function validateContent(content: string): string {
  const v = content.trim();
  if (!v || v.length > CONTENT_MAX) throw new AiError(422, 'INVALID_INPUT', ['content']);
  return v;
}

/**
 * The system's own write path (a future job runner calls this once an agent decides something worth remembering).
 * While the feature is off, this quietly does nothing and returns `null` — the AI-off instinct every switched-off
 * capability in this folder follows, so a caller never has to check the switch itself first.
 */
export async function recordAgentMemory(
  deps: AgentMemoryDeps,
  key: string,
  input: { kind: string; content: string; tags?: string[]; sourceRef?: string | null },
  storeId: number,
): Promise<AgentMemoryView | null> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  if (!(await memoryEnabled(deps, storeId))) return null;
  if (!isMemoryKind(input.kind)) throw new AiError(422, 'INVALID_INPUT', ['kind']);
  const content = validateContent(input.content);
  if (input.sourceRef !== undefined && input.sourceRef !== null && input.sourceRef.length > SOURCE_REF_MAX) throw new AiError(422, 'INVALID_INPUT', ['sourceRef']);

  await ensureAgentRows(deps.db);
  const agent = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!agent || agent.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
  const created = await deps.db.aiMemory.create({
    data: { agentId: agent.id, storeId, kind: input.kind, content, tags: cleanTags(input.tags), sourceRef: input.sourceRef?.trim() || null },
  });
  return viewOf(created);
}

export interface AgentMemoryListOptions {
  search?: string;
  kind?: string;
  includeArchived?: boolean;
  limit?: number;
}

/**
 * One agent's memories, newest first — "searchable by meaning" today means a plain, honest text match over the
 * content and tags (no embedding provider is wired yet; `AiMemory.embedding` stays reserved for it).
 */
export async function listAgentMemories(deps: Pick<AgentMemoryDeps, 'db'>, key: string, opts: AgentMemoryListOptions = {}): Promise<AgentMemoryView[]> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  if (opts.kind !== undefined && !isMemoryKind(opts.kind)) throw new AiError(422, 'INVALID_INPUT', ['kind']);
  await ensureAgentRows(deps.db);
  const agent = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!agent || agent.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
  const rows = await deps.db.aiMemory.findMany({
    where: { agentId: agent.id, kind: opts.kind, archivedAt: opts.includeArchived ? undefined : null },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(opts.limit ?? LIST_MAX, 1), LIST_MAX),
  });
  const needle = opts.search?.trim().toLowerCase();
  const matched = needle ? rows.filter((r) => r.content.toLowerCase().includes(needle) || r.tags.some((t) => t.toLowerCase().includes(needle))) : rows;
  return matched.map(viewOf);
}

/** Short list of an agent's most recent, still-live memories — what a task replays per the Memory protocol (PR 577)
 * before it starts. No job runner calls this yet; it is read, honestly, for the one that eventually will. */
export async function agentMemoryBrief(deps: Pick<AgentMemoryDeps, 'db'>, key: string, limit = BRIEF_MAX): Promise<AgentMemoryView[]> {
  return listAgentMemories(deps, key, { limit, includeArchived: false });
}

export interface AgentMemoryDigest {
  sinceDate: string;
  totalCount: number;
  byKind: Record<MemoryKind, number>;
  topTags: { tag: string; count: number }[];
  highlights: { id: string; kind: MemoryKind; content: string; createdAt: string }[];
}

/** The week's memories, summarised on demand (no cron — a job runner or the owner calls this when a summary is
 * wanted) — counts by kind, the most frequent tags, and a handful of highlights. Nothing invented: with no memory
 * yet, every count is honestly 0. */
export async function weeklyAgentMemoryDigest(deps: Pick<AgentMemoryDeps, 'db' | 'now'>, key: string): Promise<AgentMemoryDigest> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  await ensureAgentRows(deps.db);
  const agent = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!agent || agent.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - DIGEST_DAYS * 24 * 60 * 60 * 1000);
  const rows = await deps.db.aiMemory.findMany({ where: { agentId: agent.id, archivedAt: null, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
  return buildDigest(rows, since);
}

/** Pure digest builder (unit-tested without a database): counts by kind, the most frequent tags, and the newest
 * handful as highlights, truncated so the digest stays short to read. */
export function buildDigest(
  rows: { id: string; kind: string; content: string; tags: string[]; createdAt: Date }[],
  since: Date,
): AgentMemoryDigest {
  const byKind = Object.fromEntries(MEMORY_KINDS.map((k) => [k, 0])) as Record<MemoryKind, number>;
  const tagCounts = new Map<string, number>();
  for (const r of rows) {
    if (isMemoryKind(r.kind)) byKind[r.kind] += 1;
    for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TAGS_MAX)
    .map(([tag, count]) => ({ tag, count }));
  const highlights = rows.slice(0, HIGHLIGHT_MAX).map((r) => ({
    id: r.id,
    kind: isMemoryKind(r.kind) ? r.kind : ('fact' as MemoryKind),
    content: r.content.length > HIGHLIGHT_CHARS ? `${r.content.slice(0, HIGHLIGHT_CHARS)}…` : r.content,
    createdAt: r.createdAt.toISOString(),
  }));
  return { sinceDate: since.toISOString().slice(0, 10), totalCount: rows.length, byKind, topTags, highlights };
}

/**
 * The owner corrects a memory's own words (content and/or tags) — never a silent rewrite: `correctedById` is set
 * and the change is audited with its before/after. A no-op patch (nothing actually different) writes once.
 */
export async function correctAgentMemory(
  deps: Pick<AgentMemoryDeps, 'db'>,
  who: { actor: Actor; ctx?: RequestContext },
  key: string,
  memoryId: string,
  patch: { content?: string; tags?: string[] },
): Promise<AgentMemoryView> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  requireMemoryId(memoryId);
  const content = patch.content === undefined ? undefined : validateContent(patch.content);
  const tags = patch.tags === undefined ? undefined : cleanTags(patch.tags);

  await ensureAgentRows(deps.db);
  return deps.db.$transaction(async (tx) => {
    const agent = await tx.aiAgent.findUnique({ where: { key } });
    if (!agent || agent.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    const row = await tx.aiMemory.findUnique({ where: { id: memoryId } });
    if (!row || row.agentId !== agent.id) throw new AiError(404, 'NOT_FOUND', ['memoryId']);

    const sameContent = content === undefined || content === row.content;
    const sameTags = tags === undefined || (tags.length === row.tags.length && tags.every((t, i) => t === row.tags[i]));
    if (sameContent && sameTags) return viewOf(row);

    const before = { content: row.content, tags: row.tags };
    const after = { content: content ?? row.content, tags: tags ?? row.tags };
    const saved = await tx.aiMemory.update({
      where: { id: memoryId },
      data: { content: after.content, tags: after.tags, correctedById: who.actor.staffUserId ?? row.correctedById },
    });
    await audit(tx, who.actor, { action: 'ai.memory.correct', entityType: 'AiMemory', entityId: row.id, before, after }, who.ctx ?? {});
    return viewOf(saved);
  });
}

/** Archives or restores one memory — never a delete (CLAUDE.md rule 3). A no-op when it is already in the asked
 * state, so a double tap writes once. */
export async function setAgentMemoryArchived(deps: Pick<AgentMemoryDeps, 'db'>, who: { actor: Actor; ctx?: RequestContext }, key: string, memoryId: string, archived: boolean): Promise<AgentMemoryView> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  requireMemoryId(memoryId);
  await ensureAgentRows(deps.db);
  return deps.db.$transaction(async (tx) => {
    const agent = await tx.aiAgent.findUnique({ where: { key } });
    if (!agent || agent.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    const row = await tx.aiMemory.findUnique({ where: { id: memoryId } });
    if (!row || row.agentId !== agent.id) throw new AiError(404, 'NOT_FOUND', ['memoryId']);
    const alreadyArchived = row.archivedAt !== null;
    if (alreadyArchived === archived) return viewOf(row);
    const saved = await tx.aiMemory.update({ where: { id: memoryId }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, who.actor, { action: archived ? 'ai.memory.archive' : 'ai.memory.restore', entityType: 'AiMemory', entityId: row.id, before: { archivedAt: row.archivedAt }, after: { archivedAt: saved.archivedAt } }, who.ctx ?? {});
    return viewOf(saved);
  });
}
