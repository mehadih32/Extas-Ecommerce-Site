// S15 · PR 577 (C10.4) — the 360° profile per fixed agent: role, owned stages, never-touches and current plan read
// straight from its own docs/agents/<key>.md (the single source of truth every agent replays before a task, CLAUDE.md
// "Memory protocol"), never copied into code to drift out of step; skills it has and is learning, the same way.
// The real, growing parts — its work log (AiWorkLog, tagged for this PR in the full S00 schema) and its assignments
// with due dates (AiAgentAssignment, tagged PR 577/584) — are read from the database, honestly empty until the
// owner or a later job-runner PR writes to them; "performance" (first-time-right rate, bugs found, rework, cost per
// task) stays the honest "filled from the live dashboard later" every agent file itself says, so nothing here
// invents a number no later PR has actually measured (CLAUDE.md "never invent a requirement").
//
// Owner-editable identity (`AiAgent.bio`/`photoAssetRef`/`joinedOn`/`verified`): deliberately NOT the agent's name —
// `agents.ts`'s own header comment already fixes `nameEn`/`nameBn`/`role`/`emoji`/`code`/`isChief` as structural,
// "never an owner's own text", synced by `ensureAgentRows` on every read; letting the owner rename a fixed agent
// here would quietly break that guarantee (and every other screen's hardcoded "Gyani"/"Tirondaj" references), so
// this PR widens Blueprint C10.4's "owner edits … name …" only as far as the schema already keeps as the owner's
// own field. `photoAssetRef` is a plain URL the owner pastes (the shared media library has no by-id delivery route
// wired into the admin yet, PR 22/37) — swappable later for a real upload picker without a schema change.
//
// A "reward" (C10.4's own word) is logged as an `AiWorkLog` row with `outcome: 'reward'` — the one table PR 577
// owns — rather than a second, unneeded table; `agentProfileView` splits the log back into rewards and ordinary
// work-log entries for the page.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { ensureAgentRows } from './control-room';
import { AiError } from './errors';
import { isAiAgentKey, type AiAgentKey } from './agents';

export interface AgentProfileDeps {
  db: PrismaClient;
}

/* ───────────────────────── structural catalogue, read from docs/agents/<key>.md ───────────────────────── */

export interface AgentCatalogue {
  role: string;
  owns: string;
  neverTouches: string;
  plan: string[];
  skillsHas: string[];
  skillsLearning: string[];
}

const EMPTY_CATALOGUE: AgentCatalogue = { role: '', owns: '', neverTouches: '', plan: [], skillsHas: [], skillsLearning: [] };

/** The folder that holds the agent profiles: the deployed copy first (CN-011 copies all of `docs/`), else the
 * repository's own `docs/agents` — the same two-root idea as `admin-shell/guide.ts`'s `guideDir`. */
export function agentDocsDir(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | null {
  const roots = [env.EXTAS_DOCS_DIR, cwd, join(/*turbopackIgnore: true*/ cwd, '..'), join(/*turbopackIgnore: true*/ cwd, '..', '..')].filter((x): x is string => Boolean(x));
  for (const r of roots) {
    const dir = resolve(/*turbopackIgnore: true*/ r, 'docs', 'agents');
    if (existsSync(join(/*turbopackIgnore: true*/ dir, 'gyani.md'))) return dir;
  }
  return null;
}

/** The body text under one `## Heading` (up to the next `## `), or `null` when the file has no such heading. */
function section(markdown: string, heading: string): string | null {
  const m = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'm').exec(markdown);
  if (!m) return null;
  const rest = markdown.slice(m.index + m[0].length);
  const next = /\n## /.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function bulletList(body: string | null): string[] {
  if (!body) return [];
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

/** Turns one agent's own markdown (docs/agents/<key>.md) into its structural catalogue — pure, so it is unit-tested
 * without touching the file system. */
export function parseAgentCatalogue(markdown: string): AgentCatalogue {
  return {
    role: section(markdown, 'Role') ?? '',
    owns: section(markdown, 'Owns') ?? '',
    neverTouches: section(markdown, 'Never touches') ?? '',
    plan: bulletList(section(markdown, 'Plan')),
    skillsHas: bulletList(section(markdown, 'Skills it has')),
    skillsLearning: bulletList(section(markdown, 'Skills it is learning')),
  };
}

/** Reads and parses one agent's profile markdown; a missing file or folder (a stripped-down install, a build step
 * with no docs copied yet) is read as the honest empty catalogue, never thrown — the same instinct `agents.ts`'s
 * own structural rows already use. */
export function readAgentCatalogue(key: AiAgentKey, dir: string | null = agentDocsDir()): AgentCatalogue {
  if (!dir) return EMPTY_CATALOGUE;
  const file = join(/*turbopackIgnore: true*/ dir, `${key}.md`);
  if (!existsSync(file)) return EMPTY_CATALOGUE;
  try {
    return parseAgentCatalogue(readFileSync(file, 'utf8'));
  } catch {
    return EMPTY_CATALOGUE;
  }
}

/* ───────────────────────── the live profile: identity + work log + assignments + rewards ───────────────────────── */

const REWARD_OUTCOME = 'reward';
const DONE_STATUS = 'done';

export interface AgentProfileAssignment {
  id: string;
  title: string;
  description: string | null;
  source: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AgentProfileReward {
  id: string;
  label: string;
  note: string | null;
  at: string;
}

export interface AgentProfileWorkEntry {
  id: string;
  summary: string;
  outcome: string | null;
  prRef: string | null;
  taskRef: string | null;
  createdAt: string;
}

export interface AgentProfileView {
  key: AiAgentKey;
  code: string;
  nameEn: string;
  nameBn: string;
  role: string;
  emoji: string;
  isChief: boolean;
  bio: string | null;
  photoUrl: string | null;
  joinedOn: string | null;
  verified: boolean;
  catalogue: AgentCatalogue;
  openAssignments: AgentProfileAssignment[];
  doneAssignments: AgentProfileAssignment[];
  rewards: AgentProfileReward[];
  recentWork: AgentProfileWorkEntry[];
  openCount: number;
  doneCount: number;
}

export interface AgentProfileSummary {
  key: AiAgentKey;
  code: string;
  nameEn: string;
  nameBn: string;
  role: string;
  emoji: string;
  isChief: boolean;
  photoUrl: string | null;
  verified: boolean;
  openCount: number;
  doneCount: number;
}

function assignmentOf(a: { id: string; title: string; description: string | null; source: string; status: string; dueAt: Date | null; completedAt: Date | null; createdAt: Date }): AgentProfileAssignment {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    source: a.source,
    status: a.status,
    dueAt: a.dueAt ? a.dueAt.toISOString() : null,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  };
}

/** The team page (`/admin/agents`): every fixed agent, its identity and its open/done assignment counts — never
 * the fabricated "performance" figures its own profile file is honest about not having yet. */
export async function agentProfileList(deps: AgentProfileDeps): Promise<AgentProfileSummary[]> {
  await ensureAgentRows(deps.db);
  const rows = await deps.db.aiAgent.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' } });
  const ids = rows.map((r) => r.id);
  const counts = ids.length ? await deps.db.aiAgentAssignment.groupBy({ by: ['agentId', 'status'], where: { agentId: { in: ids } }, _count: { _all: true } }) : [];
  const openByAgent = new Map<string, number>();
  const doneByAgent = new Map<string, number>();
  for (const c of counts) {
    if (c.status === DONE_STATUS) doneByAgent.set(c.agentId, c._count._all);
    else openByAgent.set(c.agentId, (openByAgent.get(c.agentId) ?? 0) + c._count._all);
  }
  return rows
    .filter((r): r is typeof r & { key: AiAgentKey } => isAiAgentKey(r.key))
    .map((r) => ({
      key: r.key,
      code: r.code,
      nameEn: r.nameEn,
      nameBn: r.nameBn ?? r.nameEn,
      role: r.role,
      emoji: r.emoji ?? '',
      isChief: r.isChief,
      photoUrl: r.photoAssetRef,
      verified: r.verified,
      openCount: openByAgent.get(r.id) ?? 0,
      doneCount: doneByAgent.get(r.id) ?? 0,
    }));
}

/** One agent's own 360° profile page. */
export async function agentProfileView(deps: AgentProfileDeps, key: string): Promise<AgentProfileView> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  await ensureAgentRows(deps.db);
  const row = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
  const [assignments, workLog] = await Promise.all([
    deps.db.aiAgentAssignment.findMany({ where: { agentId: row.id }, orderBy: { createdAt: 'desc' } }),
    deps.db.aiWorkLog.findMany({ where: { agentId: row.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  const openAssignments = assignments.filter((a) => a.status !== DONE_STATUS).map(assignmentOf);
  const doneAssignments = assignments.filter((a) => a.status === DONE_STATUS).map(assignmentOf);
  const rewards: AgentProfileReward[] = workLog
    .filter((w) => w.outcome === REWARD_OUTCOME)
    .map((w) => ({ id: w.id, label: w.summary, note: (w.tests as { note?: string } | null)?.note ?? null, at: w.createdAt.toISOString() }));
  const recentWork: AgentProfileWorkEntry[] = workLog
    .filter((w) => w.outcome !== REWARD_OUTCOME)
    .map((w) => ({ id: w.id, summary: w.summary, outcome: w.outcome, prRef: w.prRef, taskRef: w.taskRef, createdAt: w.createdAt.toISOString() }));
  return {
    key: row.key as AiAgentKey,
    code: row.code,
    nameEn: row.nameEn,
    nameBn: row.nameBn ?? row.nameEn,
    role: row.role,
    emoji: row.emoji ?? '',
    isChief: row.isChief,
    bio: row.bio,
    photoUrl: row.photoAssetRef,
    joinedOn: row.joinedOn ? row.joinedOn.toISOString().slice(0, 10) : null,
    verified: row.verified,
    catalogue: readAgentCatalogue(row.key as AiAgentKey),
    openAssignments,
    doneAssignments,
    rewards,
    recentWork,
    openCount: openAssignments.length,
    doneCount: doneAssignments.length,
  };
}

/* ───────────────────────── owner edits ───────────────────────── */

const BIO_MAX = 600;
const LABEL_MAX = 120;
/** Exported (PR 584) so a caller writing an assignment from outside this file — the Telegram webhook — cuts a
 * long command to the same limit instead of hand-copying the number. */
export const TITLE_MAX = 160;
export const DESCRIPTION_MAX = 600;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface AgentProfilePatch {
  bio?: string | null;
  photoUrl?: string | null;
  joinedOn?: string | null;
  verified?: boolean;
}

/** Edits the owner's own identity fields (bio, photo URL, joining date, the verified star) — never the agent's
 * structural name/role/code. A no-op patch (nothing actually changed) writes once, the same double-tap rule every
 * other AI 360 setter in this folder follows. */
export async function updateAgentProfile(deps: { db: PrismaClient }, who: { actor: Actor; ctx?: RequestContext }, key: string, patch: AgentProfilePatch): Promise<void> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  if (patch.bio !== undefined && patch.bio !== null && patch.bio.length > BIO_MAX) throw new AiError(422, 'INVALID_INPUT', ['bio']);
  if (patch.photoUrl !== undefined && patch.photoUrl !== null && patch.photoUrl !== '' && !isHttpUrl(patch.photoUrl)) throw new AiError(422, 'INVALID_INPUT', ['photoUrl']);
  if (patch.joinedOn !== undefined && patch.joinedOn !== null && !DATE_RE.test(patch.joinedOn)) throw new AiError(422, 'INVALID_INPUT', ['joinedOn']);

  await deps.db.$transaction(async (tx) => {
    const row = await tx.aiAgent.findUnique({ where: { key } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    const data: Prisma.AiAgentUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (patch.bio !== undefined) {
      const next = patch.bio === null || patch.bio === '' ? null : patch.bio;
      if (next !== row.bio) {
        data.bio = next;
        before.bio = row.bio;
        after.bio = next;
      }
    }
    if (patch.photoUrl !== undefined) {
      const next = patch.photoUrl === null || patch.photoUrl === '' ? null : patch.photoUrl;
      if (next !== row.photoAssetRef) {
        data.photoAssetRef = next;
        before.photoAssetRef = row.photoAssetRef;
        after.photoAssetRef = next;
      }
    }
    if (patch.joinedOn !== undefined) {
      const nextDate = patch.joinedOn === null || patch.joinedOn === '' ? null : new Date(`${patch.joinedOn}T00:00:00Z`);
      const nextIso = nextDate ? nextDate.toISOString().slice(0, 10) : null;
      const prevIso = row.joinedOn ? row.joinedOn.toISOString().slice(0, 10) : null;
      if (nextIso !== prevIso) {
        data.joinedOn = nextDate;
        before.joinedOn = prevIso;
        after.joinedOn = nextIso;
      }
    }
    if (patch.verified !== undefined && patch.verified !== row.verified) {
      data.verified = patch.verified;
      before.verified = row.verified;
      after.verified = patch.verified;
    }
    if (Object.keys(data).length === 0) return;
    await tx.aiAgent.update({ where: { key }, data });
    await audit(tx, who.actor, { action: 'ai.agent.profile', entityType: 'AiAgent', entityId: row.id, before, after }, who.ctx ?? {});
  });
}

/** A reward (C10.4) — logged as its own `AiWorkLog` row (`outcome: 'reward'`), so the work log and the reward list
 * on the profile page are two views of the one append-only table, not two things to keep in step. */
export async function giveAgentReward(deps: { db: PrismaClient }, who: { actor: Actor; ctx?: RequestContext }, key: string, input: { label: string; note?: string | null }): Promise<AgentProfileReward> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  const label = input.label.trim();
  if (!label || label.length > LABEL_MAX) throw new AiError(422, 'INVALID_INPUT', ['label']);
  const note = input.note?.trim() || null;
  const row = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
  const created = await deps.db.aiWorkLog.create({
    data: { agentId: row.id, summary: label, outcome: REWARD_OUTCOME, tests: note ? { note } : Prisma.DbNull, taskRef: null, prRef: null, files: [] },
  });
  void who; // the reward itself is the record; no separate audit row (the same self-logging shape AiDiaryEntry already uses)
  return { id: created.id, label, note, at: created.createdAt.toISOString() };
}

/** Gives an agent a new assignment, with or without a due date (C10.4, PR 577/584). `source` defaults to
 * `'dashboard'` (the manual form below); PR 584's Telegram routing passes `'telegram'` so the profile page's own
 * "from {source}" line tells the two apart honestly. */
export async function assignAgentTask(
  deps: { db: PrismaClient },
  who: { actor: Actor; ctx?: RequestContext },
  key: string,
  input: { title: string; description?: string | null; dueAt?: string | null; source?: string },
): Promise<AgentProfileAssignment> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  const title = input.title.trim();
  if (!title || title.length > TITLE_MAX) throw new AiError(422, 'INVALID_INPUT', ['title']);
  const description = input.description?.trim() || null;
  if (description && description.length > DESCRIPTION_MAX) throw new AiError(422, 'INVALID_INPUT', ['description']);
  if (input.dueAt !== undefined && input.dueAt !== null && input.dueAt !== '' && !DATE_RE.test(input.dueAt)) throw new AiError(422, 'INVALID_INPUT', ['dueAt']);
  const row = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
  const created = await deps.db.aiAgentAssignment.create({
    data: {
      agentId: row.id,
      title,
      description,
      source: input.source?.trim() || 'dashboard',
      assignedById: who.actor.staffUserId ?? null,
      status: 'todo',
      dueAt: input.dueAt ? new Date(`${input.dueAt}T00:00:00Z`) : null,
    },
  });
  return assignmentOf(created);
}

/** Marks one of an agent's assignments done. A no-op (and no error) when it is already done, so a double tap
 * writes once. */
export async function completeAgentAssignment(deps: { db: PrismaClient }, who: { actor: Actor; ctx?: RequestContext }, key: string, assignmentId: string): Promise<void> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  void who;
  await deps.db.$transaction(async (tx) => {
    const row = await tx.aiAgent.findUnique({ where: { key } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    const a = await tx.aiAgentAssignment.findUnique({ where: { id: assignmentId } });
    if (!a || a.agentId !== row.id) throw new AiError(404, 'NOT_FOUND', ['assignmentId']);
    if (a.status === DONE_STATUS) return;
    await tx.aiAgentAssignment.update({ where: { id: assignmentId }, data: { status: DONE_STATUS, completedAt: new Date() } });
  });
}
