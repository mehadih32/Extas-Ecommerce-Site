// S15 · PR 579 (C10, "Agent curriculum and certification") — each fixed agent's degree path (Graduate →
// Post-graduate → PhD level), read straight from the single source of truth `docs/agents/CURRICULUM.md` (never
// copied into code, the same instinct `agent-profile.ts`'s own catalogue reader follows for docs/agents/<key>.md),
// plus the "Taught so far" table's honest, already-written module/exam counts for that agent. What each level
// actually earns is kept on `AiCurriculumLevel` (tagged for this PR in the full S00 schema): notStarted by default
// for every agent, since the real exam runner (the sandbox, PR 322) is not merged yet — exactly the same honest gap
// every other PR in this stage (305/307/308/309) has shipped ahead of its own job-runner. Until PR 322 lands, a
// level can only be advanced by the owner's own hand (`ai.control`), the same manual-until-automated shape PR
// 305's "keep on" switch and PR 308's schedule preview used before anything AI-driven could actually read them.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { PrismaClient } from '@extas/db/client';
import { AI_AGENTS, isAiAgentKey, type AiAgentKey } from './agents';
import { agentDocsDir } from './agent-profile';
import { AiError } from './errors';

/* ───────────────────────── structural syllabus, read from docs/agents/CURRICULUM.md ───────────────────────── */

export const CURRICULUM_LEVELS = ['graduate', 'postGraduate', 'phd'] as const;
export type CurriculumLevelId = (typeof CURRICULUM_LEVELS)[number];

export const CURRICULUM_LEVEL_TITLES: Readonly<Record<CurriculumLevelId, string>> = {
  graduate: 'Graduate',
  postGraduate: 'Post-graduate',
  phd: 'PhD level',
};

export interface CurriculumSyllabus {
  graduate: string;
  postGraduate: string;
  phd: string;
  modulesWritten: string;
  exam: string;
  levelEarnedNote: string;
}

const EMPTY_SYLLABUS: CurriculumSyllabus = { graduate: '', postGraduate: '', phd: '', modulesWritten: '', exam: '', levelEarnedNote: '' };

/** The body under one agent's own `## … <NameEn> …` heading in CURRICULUM.md (up to the next `## `), matched by
 * its English name so the Bengali name that comes first in the heading never has to be typed twice. */
function agentSection(markdown: string, nameEn: string): string | null {
  const re = new RegExp(`^## .*\\b${nameEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.*$`, 'm');
  const m = re.exec(markdown);
  if (!m) return null;
  const rest = markdown.slice(m.index + m[0].length);
  const next = /\n## /.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

/** One `- **Label:** text` bullet's text, or '' when the body has no such bullet. */
function bullet(body: string, label: string): string {
  const re = new RegExp(`^-\\s*\\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:?\\*\\*:?\\s*(.+)$`, 'm');
  const m = re.exec(body);
  return m ? (m[1] ?? '').trim() : '';
}

/** The "Taught so far" table's row for one agent, matched by its own employee code (unique, unlike a name that
 * also appears in prose) — `[Agent, Modules written, Extra files, Exam, Level earned]`, or `null` with no row yet. */
function taughtSoFarRow(markdown: string, code: string): string[] | null {
  for (const line of markdown.split('\n')) {
    const t = line.trim();
    if (t.startsWith('|') && t.includes(code)) {
      const cells = t.split('|').map((c) => c.trim());
      return cells.slice(1, -1);
    }
  }
  return null;
}

/** Turns `docs/agents/CURRICULUM.md` into every agent's syllabus — pure, so it is unit-tested without touching the
 * file system. An agent the document does not (yet) cover — Tirondaj, added later by PR 581 — reads as the honest
 * empty syllabus, never thrown. */
export function parseCurriculumDoc(markdown: string): Record<AiAgentKey, CurriculumSyllabus> {
  const out = {} as Record<AiAgentKey, CurriculumSyllabus>;
  for (const a of AI_AGENTS) {
    const body = agentSection(markdown, a.nameEn);
    const row = taughtSoFarRow(markdown, a.code);
    out[a.key] = {
      graduate: body ? bullet(body, 'Graduate') : '',
      postGraduate: body ? bullet(body, 'Post-graduate') : '',
      phd: body ? bullet(body, 'PhD level') : '',
      modulesWritten: row?.[1] ?? '',
      exam: row?.[3] ?? '',
      levelEarnedNote: row?.[4] ?? '',
    };
  }
  return out;
}

/** Reads and parses `docs/agents/CURRICULUM.md`; a missing file or folder reads as every agent's empty syllabus,
 * never thrown — the same instinct `agent-profile.ts`'s `readAgentCatalogue` already uses. */
export function readCurriculumDoc(dir: string | null = agentDocsDir()): Record<AiAgentKey, CurriculumSyllabus> {
  const empty = Object.fromEntries(AI_AGENTS.map((a) => [a.key, EMPTY_SYLLABUS])) as Record<AiAgentKey, CurriculumSyllabus>;
  if (!dir) return empty;
  const file = join(/*turbopackIgnore: true*/ dir, 'CURRICULUM.md');
  if (!existsSync(file)) return empty;
  try {
    return parseCurriculumDoc(readFileSync(file, 'utf8'));
  } catch {
    return empty;
  }
}

/* ───────────────────────── the live record: one row per level, owner-advanced until the sandbox runs exams ───────────────────────── */

export const CURRICULUM_STATUSES = ['notStarted', 'inProgress', 'passed', 'failed'] as const;
export type CurriculumStatus = (typeof CURRICULUM_STATUSES)[number];

/** Every level sits on one shared track ('core') for now; the column exists for a future second track (e.g. a
 * specialism) without a migration, the same forward room `AiCurriculumLevel.track` was given in the full schema. */
const TRACK = 'core';
const SCORE_MIN = 0;
const SCORE_MAX = 100;

export interface CurriculumLevelView {
  level: CurriculumLevelId;
  title: string;
  description: string;
  status: CurriculumStatus;
  score: number | null;
  earnedAt: string | null;
}

export interface AgentCurriculumView {
  modulesWritten: string;
  exam: string;
  levelEarnedNote: string;
  levels: CurriculumLevelView[];
}

function isCurriculumLevel(v: string): v is CurriculumLevelId {
  return (CURRICULUM_LEVELS as readonly string[]).includes(v);
}
function isCurriculumStatus(v: string): v is CurriculumStatus {
  return (CURRICULUM_STATUSES as readonly string[]).includes(v);
}

/** One agent's curriculum: its three levels' syllabus text plus their earned status, never a fabricated score or
 * "earned" mark the sandbox has not actually produced. */
export async function agentCurriculumView(deps: { db: PrismaClient }, key: string): Promise<AgentCurriculumView> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  const row = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
  const syllabus = readCurriculumDoc()[key] ?? EMPTY_SYLLABUS;
  const rows = await deps.db.aiCurriculumLevel.findMany({ where: { agentId: row.id, track: TRACK } });
  const byLevel = new Map(rows.map((r) => [r.level, r]));
  const levels: CurriculumLevelView[] = CURRICULUM_LEVELS.map((level) => {
    const r = byLevel.get(level);
    return {
      level,
      title: CURRICULUM_LEVEL_TITLES[level],
      description: syllabus[level],
      status: r && isCurriculumStatus(r.status) ? r.status : 'notStarted',
      score: r?.score ?? null,
      earnedAt: r?.earnedAt ? r.earnedAt.toISOString() : null,
    };
  });
  return { modulesWritten: syllabus.modulesWritten, exam: syllabus.exam, levelEarnedNote: syllabus.levelEarnedNote, levels };
}

/** The owner marks one level's status by hand (`ai.control`) until the sandbox exam runner (PR 322) can do it
 * itself. A score is required to mark a level `passed` (the pass mark is each agent's own exam's business, read
 * from CURRICULUM.md, never re-checked here); `notStarted` always clears any earlier score. A no-op patch (the
 * exact same status, score and earned-state already stored) writes once, the same double-tap rule every other
 * AI 360 setter in this folder follows. */
export async function setCurriculumStatus(
  deps: { db: PrismaClient },
  who: { actor: Actor; ctx?: RequestContext },
  key: string,
  input: { level: string; status: string; score?: number | null },
): Promise<void> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  if (!isCurriculumLevel(input.level)) throw new AiError(422, 'INVALID_INPUT', ['level']);
  if (!isCurriculumStatus(input.status)) throw new AiError(422, 'INVALID_INPUT', ['status']);
  const level = input.level;
  const status = input.status;

  let score: number | null = null;
  if (input.score !== undefined && input.score !== null) {
    if (typeof input.score !== 'number' || !Number.isFinite(input.score) || input.score < SCORE_MIN || input.score > SCORE_MAX) throw new AiError(422, 'INVALID_INPUT', ['score']);
    score = input.score;
  }
  if (status === 'passed' && score === null) throw new AiError(422, 'INVALID_INPUT', ['score']);
  const nextScore = status === 'notStarted' ? null : score;
  const nextEarnedAt = status === 'passed' ? new Date() : null;

  await deps.db.$transaction(async (tx) => {
    const row = await tx.aiAgent.findUnique({ where: { key } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    const existing = await tx.aiCurriculumLevel.findUnique({ where: { agentId_track_level: { agentId: row.id, track: TRACK, level } } });

    const sameStatus = existing?.status === status;
    const sameScore = (existing?.score ?? null) === nextScore;
    const sameEarned = Boolean(existing?.earnedAt) === Boolean(nextEarnedAt);
    if (existing && sameStatus && sameScore && sameEarned) return;

    const before = existing ? { status: existing.status, score: existing.score, earnedAt: existing.earnedAt?.toISOString() ?? null } : null;
    const after = { status, score: nextScore, earnedAt: nextEarnedAt ? nextEarnedAt.toISOString() : null };
    const saved = existing
      ? await tx.aiCurriculumLevel.update({ where: { id: existing.id }, data: { status, score: nextScore, earnedAt: nextEarnedAt } })
      : await tx.aiCurriculumLevel.create({ data: { agentId: row.id, track: TRACK, level, status, score: nextScore, earnedAt: nextEarnedAt } });
    await audit(tx, who.actor, { action: 'ai.agent.curriculum', entityType: 'AiCurriculumLevel', entityId: saved.id, before, after }, who.ctx ?? {});
  });
}
