// S15 · PR 585 (register "Continuous learning engine — Tirondaj (ads) and Doot (SEO/marketing) are the two power
// agents… learn without stopping from: official docs … practitioner blogs … Reddit … YouTube tutorials … LinkedIn
// and Facebook posts of known specialists … case studies. When stuck: research all sources → solve → the solution
// becomes a skill in its basket. Quality gate (no shortcut learning): a tip becomes a skill only after it is
// checked against the official docs or two independent good sources, tested in a sandbox or small live test, and
// written with its source, date and confidence; tips that fail are recorded as 'doesn't work for us'. Practice
// tasks with deadlines … graded in their appraisals. Paid data tools … proposed with cost and reason — the owner
// approves and pays.") — AI › Learning engine at `/admin/ai/learning`.
//
// `AiLearningSource`/`AiLearningTip`/`AiPracticeTask` were already in the full S00 schema skeleton, tagged for this
// exact PR, unused until now — no migration.
//
// Honest about what this codebase does not have yet (the same honest gap every other S15 module already notes):
// no crawler reads a blog, a subreddit, a YouTube transcript or a LinkedIn/Facebook post, and no sandbox runs a
// real ad campaign or a real page-indexing check. "Research" here is the owner (or, once a job runner exists, the
// agent itself) writing down what was actually found at a source already on file, and "tested" is a real, signed
// note of what was tried and what happened — never a fabricated percentage. What IS fully real: the quality gate's
// own arithmetic (official-docs-or-N-independent-sources, never a shortcut), that a verified tip can only ever
// become a skill in the exact same `AiSkill`/`AiSkillVersion`/`ai.skill` approval-request shape
// `../admin-health/fixes.ts`'s own `proposeSkill` writes — `promoteTipToSkill` below writes it directly, the same
// reason `../admin-ai/skills.ts`'s own `importSkill` does rather than calling `proposeSkill` itself: that
// function's permission (`health.fixes.propose`) and gate (`health.fixGate.proposals`) belong to the health-audit
// runner, not this engine — so `fixes.decideProposal` stays the one place any of them is ever approved or
// rejected, never a second decision path — and that a failed tip is kept, not thrown away, with the literal
// reason the gate refused it.
//
// The master switch (`ai.learningEngine.on`, off as it ships) gates every write below except curating a source
// (`addLearningSource`/`setLearningSourceEnabled`/`archiveLearningSource`): the owner may stock the reading list
// before ever switching the engine on, the same way the ads-guardrails ceilings (PR 581) are visible and editable
// while that page's own `on` is off.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { type Prisma, type PrismaClient } from '@extas/db/client';
import { INSTALLATION, type HealthFixGateSettings, type LearningEngineSettings } from '@extas/settings';
import type { AppResolver } from '../settings';
import { SKILL_CONTENT_MAX, SKILL_KIND } from '../admin-health/fixes';
import { requestApproval } from './approvals';
import { AI_AGENTS } from './agents';

const DAY = 86_400_000;

/** The register row's own two "power agents" — the only agents this whole module ever acts for. A structural fact
 * (like `AI_AGENTS` itself), never the owner's own choice, so it is a closed list, not a setting. */
export const POWER_AGENT_KEYS = ['doot', 'tirondaj'] as const;
export type PowerAgentKey = (typeof POWER_AGENT_KEYS)[number];
export function isPowerAgentKey(v: string): v is PowerAgentKey {
  return (POWER_AGENT_KEYS as readonly string[]).includes(v);
}
export const POWER_AGENT_OPTIONS: readonly { key: PowerAgentKey; nameEn: string; nameBn: string; emoji: string }[] = AI_AGENTS.filter((a) => isPowerAgentKey(a.key)).map((a) => ({
  key: a.key as PowerAgentKey,
  nameEn: a.nameEn,
  nameBn: a.nameBn,
  emoji: a.emoji,
}));

/** The register row's own six kinds of source, in the order it lists them. */
export const LEARNING_SOURCE_KINDS = ['official_docs', 'practitioner_blog', 'reddit', 'youtube_transcript', 'specialist_social', 'case_study'] as const;
export type LearningSourceKind = (typeof LEARNING_SOURCE_KINDS)[number];
export function isLearningSourceKind(v: string): v is LearningSourceKind {
  return (LEARNING_SOURCE_KINDS as readonly string[]).includes(v);
}

export const TIP_STATUSES = ['candidate', 'verified', 'failed', 'promoted'] as const;
export type TipStatus = (typeof TIP_STATUSES)[number];
export function isTipStatus(v: string): v is TipStatus {
  return (TIP_STATUSES as readonly string[]).includes(v);
}

export const PRACTICE_TASK_STATUSES = ['open', 'done', 'missed'] as const;
export type PracticeTaskStatus = (typeof PRACTICE_TASK_STATUSES)[number];
export function isPracticeTaskStatus(v: string): v is PracticeTaskStatus {
  return (PRACTICE_TASK_STATUSES as readonly string[]).includes(v);
}

export const PRACTICE_GRADES = ['pass', 'partial', 'fail'] as const;
export type PracticeGrade = (typeof PRACTICE_GRADES)[number];
export function isPracticeGrade(v: string): v is PracticeGrade {
  return (PRACTICE_GRADES as readonly string[]).includes(v);
}

/** The register row's own exact phrase for a tip that failed the quality gate — a fixed system string (like
 * `AiSkill.status`'s own values), written into `AiLearningTip.verification.note` in English and shown through the
 * page's own Bengali/English message keys, never invented per failure. */
export const DOESNT_WORK_NOTE = "doesn't work for us";

/** Text-length guards (not business numbers — CLAUDE.md rule 1). */
export const URL_MAX = 2_000; // hardcode-ok: a text-length guard
export const TIP_MAX = SKILL_CONTENT_MAX; // a tip becomes a skill's content; never a tighter guard than that
export const REASON_MAX = 500; // hardcode-ok: a text-length guard, matches fixes.ts's own REASON_MAX
const NAME_MAX = 120; // hardcode-ok: matches fixes.ts's own skill name guard
const TITLE_MAX = 200; // hardcode-ok: a text-length guard
const TOOL_NAME_MAX = 120; // hardcode-ok: a text-length guard
/** The highest single paid-tool cost figure the form takes, in whole store currency — a technical bound on the
 * input box, not a spending ceiling (the owner decides case by case when approving). */
export const PAID_TOOL_COST_MAX = 10_000_000; // hardcode-ok: technical bound, matches GUARDRAILS_MONEY_MAX

export class LearningEngineError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'ENGINE_OFF' | 'NOT_FOUND' | 'NOT_POWER_AGENT' | 'NOT_CANDIDATE' | 'NOT_VERIFIED' | 'ALREADY_PROMOTED' | 'BUSY',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isLearningEngineError = (e: unknown): e is LearningEngineError => e instanceof LearningEngineError;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const text = (v: unknown, field: string, max: number, required: boolean): string | null => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new LearningEngineError('INVALID_INPUT', 400, [field]);
    return null;
  }
  if (typeof v !== 'string') throw new LearningEngineError('INVALID_INPUT', 400, [field]);
  const t = v.trim();
  if ((required && !t) || t.length > max) throw new LearningEngineError('INVALID_INPUT', 400, [field]);
  return t || null;
};
const powerAgentOf = (v: unknown): PowerAgentKey => {
  if (typeof v !== 'string' || !isPowerAgentKey(v)) throw new LearningEngineError('NOT_POWER_AGENT', 422, ['agentKey']);
  return v;
};
const ymd = (d: Date): string => d.toISOString().slice(0, 10);

export interface LearningEngineDeps {
  db: PrismaClient;
  // The full resolver: `saveLearningEngineCard` calls `resolver.set`, and `promoteTipToSkill` reads
  // `health.fixGate`'s own `expireDays` the same way `../admin-ai/skills.ts`'s `importSkill` already does.
  resolver: AppResolver;
  now?: () => Date;
}
export interface LearningEngineWho {
  actor: Actor;
  ctx?: RequestContext;
}

async function engineSettings(deps: Pick<LearningEngineDeps, 'resolver'>): Promise<LearningEngineSettings> {
  return (await deps.resolver.value('ai.learningEngine')) as LearningEngineSettings;
}

/** Every write below except curating a source checks this first — `ENGINE_OFF` otherwise. */
async function requireOn(deps: Pick<LearningEngineDeps, 'resolver'>): Promise<LearningEngineSettings> {
  const s = await engineSettings(deps);
  if (!s.on) throw new LearningEngineError('ENGINE_OFF', 409);
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Learning sources — where a power agent may read from.
// ---------------------------------------------------------------------------------------------------------------

export interface LearningSourceRow {
  id: string;
  agentKey: PowerAgentKey;
  kind: LearningSourceKind;
  url: string;
  enabled: boolean;
  lastReadAt: Date | null;
  tipCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Adds a source to one power agent's reading list (`ai.control`, checked by the caller). Never gated by the
 * master switch — curating where to read from is prep work, not the engine running. Starts disabled: the owner
 * turns it on once it is worth reading, the same two-step "added, then switched on" shape the skill library
 * already uses for an approved skill. */
export async function addLearningSource(deps: Pick<LearningEngineDeps, 'db'>, who: LearningEngineWho, input: unknown): Promise<LearningSourceRow> {
  if (!isObj(input)) throw new LearningEngineError('INVALID_INPUT', 400, ['agentKey']);
  const agentKey = powerAgentOf(input.agentKey);
  const kindRaw = text(input.kind, 'kind', 40, true)!;
  if (!isLearningSourceKind(kindRaw)) throw new LearningEngineError('INVALID_INPUT', 400, ['kind']);
  const url = text(input.url, 'url', URL_MAX, true)!;
  if (!/^https?:\/\//i.test(url)) throw new LearningEngineError('INVALID_INPUT', 400, ['url']);
  const row = await deps.db.aiLearningSource.create({ data: { agentKey, kind: kindRaw, url, enabled: false } });
  await audit(deps.db, who.actor, { action: 'ai.learningSource.add', entityType: 'AiLearningSource', entityId: row.id, after: { agentKey, kind: kindRaw, url } }, who.ctx ?? {});
  return rowOfSource(row, 0);
}

function rowOfSource(s: { id: string; agentKey: string; kind: string; url: string; enabled: boolean; lastReadAt: Date | null; createdAt: Date; updatedAt: Date }, tipCount: number): LearningSourceRow {
  return {
    id: s.id,
    agentKey: isPowerAgentKey(s.agentKey) ? s.agentKey : 'doot',
    kind: isLearningSourceKind(s.kind) ? s.kind : 'case_study',
    url: s.url,
    enabled: s.enabled,
    lastReadAt: s.lastReadAt,
    tipCount,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** Every un-archived source, newest first, with how many tips cite it (`ai.read`). */
export async function learningSourcesView(deps: Pick<LearningEngineDeps, 'db'>, agentKey?: string): Promise<LearningSourceRow[]> {
  const where: Prisma.AiLearningSourceWhereInput = { archivedAt: null, ...(agentKey && isPowerAgentKey(agentKey) ? { agentKey } : {}) };
  const rows = await deps.db.aiLearningSource.findMany({ where, orderBy: { createdAt: 'desc' } });
  if (!rows.length) return [];
  const counts = await deps.db.aiLearningTip.groupBy({ by: ['sourceId'], where: { sourceId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
  const byId = new Map(counts.map((c) => [c.sourceId, c._count._all]));
  return rows.map((r) => rowOfSource(r, byId.get(r.id) ?? 0));
}

/** On/off for one source (`ai.control`). A double tap with the same value is a no-op. */
export async function setLearningSourceEnabled(deps: Pick<LearningEngineDeps, 'db'>, who: LearningEngineWho, id: string, enabled: boolean): Promise<void> {
  if (!isId(id)) throw new LearningEngineError('NOT_FOUND', 404, ['id']);
  const row = await deps.db.aiLearningSource.findUnique({ where: { id } });
  if (!row || row.archivedAt) throw new LearningEngineError('NOT_FOUND', 404, ['id']);
  if (row.enabled === enabled) return;
  await deps.db.aiLearningSource.update({ where: { id }, data: { enabled } });
  await audit(deps.db, who.actor, { action: enabled ? 'ai.learningSource.enable' : 'ai.learningSource.disable', entityType: 'AiLearningSource', entityId: id, before: { enabled: row.enabled }, after: { enabled } }, who.ctx ?? {});
}

/** Never deleted (CLAUDE.md rule 3) — only archived, so a tip that already cited it keeps its own history. */
export async function archiveLearningSource(deps: Pick<LearningEngineDeps, 'db'>, who: LearningEngineWho, id: string): Promise<void> {
  if (!isId(id)) throw new LearningEngineError('NOT_FOUND', 404, ['id']);
  const row = await deps.db.aiLearningSource.findUnique({ where: { id } });
  if (!row || row.archivedAt) throw new LearningEngineError('NOT_FOUND', 404, ['id']);
  const now = new Date();
  await deps.db.aiLearningSource.update({ where: { id }, data: { archivedAt: now, enabled: false } });
  await audit(deps.db, who.actor, { action: 'ai.learningSource.archive', entityType: 'AiLearningSource', entityId: id, before: { archivedAt: null }, after: { archivedAt: now } }, who.ctx ?? {});
}

// ---------------------------------------------------------------------------------------------------------------
// Learning tips — research → the quality gate → the skill basket, or "doesn't work for us".
// ---------------------------------------------------------------------------------------------------------------

export interface TipVerification {
  method: 'official_doc' | 'two_sources' | null;
  citedSourceIds: string[];
  testNote: string | null;
  checkedAt: string;
  note?: string;
}

export interface LearningTipRow {
  id: string;
  agentKey: PowerAgentKey;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceKind: LearningSourceKind | null;
  tip: string;
  status: TipStatus;
  confidence: string | null;
  skillKey: string | null;
  verification: TipVerification | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowOfTip(
  t: { id: string; agentKey: string; sourceId: string | null; tip: string; status: string; confidence: string | null; skillKey: string | null; verification: Prisma.JsonValue; createdAt: Date; updatedAt: Date },
  source: { url: string; kind: string } | null,
): LearningTipRow {
  return {
    id: t.id,
    agentKey: isPowerAgentKey(t.agentKey) ? t.agentKey : 'doot',
    sourceId: t.sourceId,
    sourceUrl: source?.url ?? null,
    sourceKind: source && isLearningSourceKind(source.kind) ? source.kind : null,
    tip: t.tip,
    status: isTipStatus(t.status) ? t.status : 'candidate',
    confidence: t.confidence,
    skillKey: t.skillKey,
    verification: (t.verification as unknown as TipVerification | null) ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** "When stuck: research all sources → solve": a candidate tip from what was actually found at (optionally) one
 * already-on-file source, for one power agent. Needs the engine `on`. */
export async function proposeLearningTip(deps: LearningEngineDeps, who: LearningEngineWho, input: unknown): Promise<LearningTipRow> {
  await requireOn(deps);
  if (!isObj(input)) throw new LearningEngineError('INVALID_INPUT', 400, ['agentKey']);
  const agentKey = powerAgentOf(input.agentKey);
  const tip = text(input.tip, 'tip', TIP_MAX, true)!;
  let sourceId: string | null = null;
  if (input.sourceId !== undefined && input.sourceId !== null) {
    if (!isId(input.sourceId)) throw new LearningEngineError('INVALID_INPUT', 400, ['sourceId']);
    const s = await deps.db.aiLearningSource.findUnique({ where: { id: input.sourceId } });
    if (!s || s.archivedAt || s.agentKey !== agentKey) throw new LearningEngineError('INVALID_INPUT', 400, ['sourceId']);
    sourceId = s.id;
  }
  const row = await deps.db.aiLearningTip.create({ data: { agentKey, sourceId, tip, status: 'candidate' } });
  await audit(deps.db, who.actor, { action: 'ai.learningTip.propose', entityType: 'AiLearningTip', entityId: row.id, after: { agentKey, sourceId } }, who.ctx ?? {});
  const source = sourceId ? await deps.db.aiLearningSource.findUnique({ where: { id: sourceId }, select: { url: true, kind: true } }) : null;
  return rowOfTip(row, source);
}

/**
 * The quality gate itself (`ai.control`, checked by the caller; engine `on` required): a tip passes only when (a)
 * its own source, or any `supportingSourceIds` the caller cites, includes an `official_docs` one, OR at least
 * `ai.learningEngine.minIndependentSources` *distinct* sources are cited across the two — AND (b) `testNote` is a
 * real, non-empty account of what was tried in a sandbox or a small live test and what happened. Both hold →
 * `verified`, with `confidence` recorded; either fails → `failed`, with the register row's own exact phrase
 * ("doesn't work for us") and which half of the gate it failed, never silently and never guessed. Only a
 * `candidate` tip may be checked — checking one twice re-runs the gate on the same tip, it never creates a second.
 */
export async function verifyLearningTip(deps: LearningEngineDeps, who: LearningEngineWho, input: unknown): Promise<LearningTipRow> {
  const settings = await requireOn(deps);
  if (!isObj(input) || !isId(input.tipId)) throw new LearningEngineError('INVALID_INPUT', 400, ['tipId']);
  const tipRow = await deps.db.aiLearningTip.findUnique({ where: { id: input.tipId } });
  if (!tipRow) throw new LearningEngineError('NOT_FOUND', 404, ['tipId']);
  if (tipRow.status !== 'candidate') throw new LearningEngineError('NOT_CANDIDATE', 409, ['tipId']);
  const testNote = text(input.testNote, 'testNote', REASON_MAX, true)!;
  const confidence = text(input.confidence, 'confidence', 20, false) ?? 'medium';
  const supportingRaw = Array.isArray(input.supportingSourceIds) ? input.supportingSourceIds : [];
  const supportingIds = [...new Set(supportingRaw.filter(isId))].slice(0, 5); // hardcode-ok: a sane cap on how many ids one check cites
  const citedIds = [...new Set([...(tipRow.sourceId ? [tipRow.sourceId] : []), ...supportingIds])];
  const cited = citedIds.length ? await deps.db.aiLearningSource.findMany({ where: { id: { in: citedIds }, agentKey: tipRow.agentKey } }) : [];
  const hasOfficialDoc = cited.some((s) => s.kind === 'official_docs');
  const distinctCount = cited.length;
  const method: TipVerification['method'] = hasOfficialDoc ? 'official_doc' : distinctCount >= settings.minIndependentSources ? 'two_sources' : null;
  const now = deps.now?.() ?? new Date();
  const passed = method !== null;
  const verification: TipVerification = { method, citedSourceIds: cited.map((s) => s.id), testNote, checkedAt: now.toISOString(), ...(passed ? {} : { note: DOESNT_WORK_NOTE }) };
  const status: TipStatus = passed ? 'verified' : 'failed';
  const updated = await deps.db.aiLearningTip.update({ where: { id: tipRow.id }, data: { status, confidence: passed ? confidence : null, verification: verification as unknown as Prisma.InputJsonValue } });
  await audit(deps.db, who.actor, { action: 'ai.learningTip.verify', entityType: 'AiLearningTip', entityId: tipRow.id, before: { status: tipRow.status }, after: { status, method, citedSourceIds: verification.citedSourceIds } }, who.ctx ?? {});
  const source = updated.sourceId ? await deps.db.aiLearningSource.findUnique({ where: { id: updated.sourceId }, select: { url: true, kind: true } }) : null;
  return rowOfTip(updated, source);
}

/**
 * A verified tip becomes a skill in the agent's basket (`ai.skills.write`, checked by the caller; engine `on`
 * required) — written straight into the exact same `AiSkill`/`AiSkillVersion`/`ai.skill` approval request shape
 * `fixes.ts`'s own `proposeSkill` writes, so `fixes.decideProposal` stays the one place a skill is ever approved
 * or rejected (never a second decision path). This writes directly (the same reason `skills.ts`'s own
 * `importSkill` does, rather than calling `proposeSkill` itself): that function's own gate is
 * `health.fixes.propose` + `health.fixGate.proposals` — the audit runner's/an agent's health-finding gate, not
 * this engine's own `ai.learningEngine`/`ai.skills.write`. Reading `health.fixGate` here only for its own
 * `expireDays`, matching `importSkill`'s own choice. The written content carries the tip, its source, the day it
 * was checked and its confidence — the register row's own "written with its source, date and confidence", never
 * only the bare tip text. Only a `verified` tip may be promoted, and only once (the key is unique per tip, so a
 * repeat attempt collides and is refused rather than silently creating a second skill for the same tip).
 */
export async function promoteTipToSkill(deps: LearningEngineDeps, who: LearningEngineWho, input: unknown): Promise<{ tip: LearningTipRow; skillApprovalRequestId: string; skillVersion: number }> {
  await requireOn(deps);
  if (!isObj(input) || !isId(input.tipId)) throw new LearningEngineError('INVALID_INPUT', 400, ['tipId']);
  const name = text(input.name, 'name', NAME_MAX, true)!;
  const purpose = text(input.purpose, 'purpose', REASON_MAX, false);
  const tipRow = await deps.db.aiLearningTip.findUnique({ where: { id: input.tipId } });
  if (!tipRow) throw new LearningEngineError('NOT_FOUND', 404, ['tipId']);
  if (tipRow.status === 'promoted') throw new LearningEngineError('ALREADY_PROMOTED', 409, ['tipId']);
  if (tipRow.status !== 'verified') throw new LearningEngineError('NOT_VERIFIED', 409, ['tipId']);
  const verification = tipRow.verification as unknown as TipVerification | null;
  const source = tipRow.sourceId ? await deps.db.aiLearningSource.findUnique({ where: { id: tipRow.sourceId } }) : null;
  const sourceLine = source ? `Source: ${source.url} (${source.kind})` : 'Source: not on file';
  const dateLine = `Checked: ${verification ? ymd(new Date(verification.checkedAt)) : ymd(deps.now?.() ?? new Date())}`;
  const confidenceLine = `Confidence: ${tipRow.confidence ?? 'medium'}`;
  const content = [tipRow.tip, sourceLine, dateLine, confidenceLine].join('\n');
  const key = `learned-${tipRow.agentKey}-${tipRow.id.slice(0, 8)}`;
  const now = deps.now?.() ?? new Date();
  const gate = (await deps.resolver.value('health.fixGate')) as HealthFixGateSettings;
  const expiresAt = gate.expireDays > 0 ? new Date(now.getTime() + gate.expireDays * DAY) : null;
  let out: { skillId: string; approvalRequestId: string };
  try {
    out = await deps.db.$transaction(async (tx) => {
      const skill = await tx.aiSkill.create({ data: { key, name, purpose, status: 'proposed', source: 'agent', sourceRef: tipRow.agentKey, enabled: false } });
      await tx.aiSkillVersion.create({ data: { skillId: skill.id, version: 1, content } });
      const req = await tx.aiApprovalRequest.create({
        data: {
          storeId: null,
          agentKey: tipRow.agentKey,
          kind: SKILL_KIND,
          title: name,
          summary: purpose,
          payload: { skillId: skill.id, key, version: 1, name, purpose, changeNote: null, isNew: true, proposedById: who.actor.staffUserId ?? null } as Prisma.InputJsonValue,
          refType: 'AiSkill',
          refId: skill.id,
          channel: 'admin',
          expiresAt,
        },
      });
      return { skillId: skill.id, approvalRequestId: req.id };
    });
  } catch (e) {
    if (isObj(e) && e.code === 'P2002') throw new LearningEngineError('ALREADY_PROMOTED', 409, ['tipId']);
    throw e;
  }
  const updated = await deps.db.aiLearningTip.update({ where: { id: tipRow.id }, data: { skillKey: key, status: 'promoted' } });
  await audit(deps.db, who.actor, { action: 'ai.learningTip.promote', entityType: 'AiLearningTip', entityId: tipRow.id, after: { skillKey: key, approvalRequestId: out.approvalRequestId } }, who.ctx ?? {});
  const refreshedSource = updated.sourceId ? await deps.db.aiLearningSource.findUnique({ where: { id: updated.sourceId }, select: { url: true, kind: true } }) : null;
  return { tip: rowOfTip(updated, refreshedSource), skillApprovalRequestId: out.approvalRequestId, skillVersion: 1 };
}

/** Every tip, newest first (`ai.read`). */
export async function learningTipsView(deps: Pick<LearningEngineDeps, 'db'>, agentKey?: string): Promise<LearningTipRow[]> {
  const where: Prisma.AiLearningTipWhereInput = agentKey && isPowerAgentKey(agentKey) ? { agentKey } : {};
  const rows = await deps.db.aiLearningTip.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 /* hardcode-ok: a display row cap, not a retention policy */ });
  if (!rows.length) return [];
  const sourceIds = [...new Set(rows.map((r) => r.sourceId).filter((x): x is string => !!x))];
  const sources = sourceIds.length ? await deps.db.aiLearningSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, url: true, kind: true } }) : [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  return rows.map((r) => rowOfTip(r, r.sourceId ? byId.get(r.sourceId) ?? null : null));
}

// ---------------------------------------------------------------------------------------------------------------
// Practice tasks — "a page indexed within 3 days, a keyword into the top 10, a test campaign under the CPA cap".
// ---------------------------------------------------------------------------------------------------------------

export interface PracticeTaskRow {
  id: string;
  agentKey: PowerAgentKey;
  title: string;
  goal: string;
  deadline: Date | null;
  status: PracticeTaskStatus;
  grade: PracticeGrade | null;
  createdAt: Date;
  updatedAt: Date;
}
function rowOfTask(t: { id: string; agentKey: string; title: string; goal: string; deadline: Date | null; status: string; grade: string | null; createdAt: Date; updatedAt: Date }): PracticeTaskRow {
  return {
    id: t.id,
    agentKey: isPowerAgentKey(t.agentKey) ? t.agentKey : 'doot',
    title: t.title,
    goal: t.goal,
    deadline: t.deadline,
    status: isPracticeTaskStatus(t.status) ? t.status : 'open',
    grade: t.grade && isPracticeGrade(t.grade) ? t.grade : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** A practice task with its own deadline (`ai.control`; engine `on` required). */
export async function createPracticeTask(deps: LearningEngineDeps, who: LearningEngineWho, input: unknown): Promise<PracticeTaskRow> {
  await requireOn(deps);
  if (!isObj(input)) throw new LearningEngineError('INVALID_INPUT', 400, ['agentKey']);
  const agentKey = powerAgentOf(input.agentKey);
  const title = text(input.title, 'title', TITLE_MAX, true)!;
  const goal = text(input.goal, 'goal', REASON_MAX, true)!;
  let deadline: Date | null = null;
  if (input.deadline !== undefined && input.deadline !== null && input.deadline !== '') {
    const d = text(input.deadline, 'deadline', 20, true)!;
    const parsed = new Date(`${d}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) throw new LearningEngineError('INVALID_INPUT', 400, ['deadline']);
    deadline = parsed;
  }
  const row = await deps.db.aiPracticeTask.create({ data: { agentKey, title, goal, deadline, status: 'open' } });
  await audit(deps.db, who.actor, { action: 'ai.practiceTask.create', entityType: 'AiPracticeTask', entityId: row.id, after: { agentKey, title, deadline: deadline?.toISOString() ?? null } }, who.ctx ?? {});
  return rowOfTask(row);
}

/** Every practice task, soonest deadline first, open ones before graded ones (`ai.read`). */
export async function practiceTasksView(deps: Pick<LearningEngineDeps, 'db'>, agentKey?: string): Promise<PracticeTaskRow[]> {
  const where: Prisma.AiPracticeTaskWhereInput = agentKey && isPowerAgentKey(agentKey) ? { agentKey } : {};
  const rows = await deps.db.aiPracticeTask.findMany({ where, orderBy: [{ status: 'asc' }, { deadline: 'asc' }, { createdAt: 'desc' }] });
  return rows.map(rowOfTask);
}

/** Marks a task done or missed and grades it (`ai.control`; engine `on` required) — feeds straight into
 * `../admin-ai/appraisal.ts`'s own KPIs for the window it lands in, next time an appraisal is generated. Only an
 * `open` task may be graded. */
export async function gradePracticeTask(deps: LearningEngineDeps, who: LearningEngineWho, input: unknown): Promise<PracticeTaskRow> {
  await requireOn(deps);
  if (!isObj(input) || !isId(input.id)) throw new LearningEngineError('INVALID_INPUT', 400, ['id']);
  if (input.status !== 'done' && input.status !== 'missed') throw new LearningEngineError('INVALID_INPUT', 400, ['status']);
  const gradeRaw = text(input.grade, 'grade', 20, false);
  if (gradeRaw && !isPracticeGrade(gradeRaw)) throw new LearningEngineError('INVALID_INPUT', 400, ['grade']);
  const row = await deps.db.aiPracticeTask.findUnique({ where: { id: input.id } });
  if (!row) throw new LearningEngineError('NOT_FOUND', 404, ['id']);
  if (row.status !== 'open') throw new LearningEngineError('BUSY', 409, ['id']);
  const updated = await deps.db.aiPracticeTask.update({ where: { id: row.id }, data: { status: input.status, grade: gradeRaw } });
  await audit(deps.db, who.actor, { action: 'ai.practiceTask.grade', entityType: 'AiPracticeTask', entityId: row.id, before: { status: row.status }, after: { status: input.status, grade: gradeRaw } }, who.ctx ?? {});
  return rowOfTask(updated);
}

// ---------------------------------------------------------------------------------------------------------------
// Paid data tools — "proposed with cost and reason — the owner approves and pays".
// ---------------------------------------------------------------------------------------------------------------

export const PAID_TOOL_KIND = 'ai.paidTool';

/** A paid-tool proposal (`ai.control`; engine `on` required) — the register row's own "cost and reason", through
 * `./approvals.ts`'s own single generic queue (never a second approval mechanism): the owner decides it from
 * `AI › Approvals` exactly like any other non-`GATE_KINDS` request, and nothing here ever charges a card — only
 * the owner's own decision, and whatever they do with it outside this system, moves money. */
export async function proposePaidTool(deps: LearningEngineDeps, who: LearningEngineWho, input: unknown): Promise<{ id: string; created: boolean }> {
  await requireOn(deps);
  if (!isObj(input)) throw new LearningEngineError('INVALID_INPUT', 400, ['agentKey']);
  const agentKey = powerAgentOf(input.agentKey);
  const toolName = text(input.toolName, 'toolName', TOOL_NAME_MAX, true)!;
  const reason = text(input.reason, 'reason', REASON_MAX, true)!;
  const costCurrency = text(input.costCurrency, 'costCurrency', 10, false) ?? 'BDT';
  if (typeof input.costAmount !== 'number' || !Number.isFinite(input.costAmount) || input.costAmount <= 0 || input.costAmount > PAID_TOOL_COST_MAX) {
    throw new LearningEngineError('INVALID_INPUT', 400, ['costAmount']);
  }
  const req = await requestApproval(deps, {
    agentKey,
    kind: PAID_TOOL_KIND,
    title: toolName,
    summary: reason,
    payload: { agentKey, toolName, costAmount: input.costAmount, costCurrency, reason, proposedById: who.actor.staffUserId ?? null },
    channel: 'admin',
  });
  await audit(deps.db, who.actor, { action: 'ai.paidTool.propose', entityType: 'AiApprovalRequest', entityId: req.id, after: { agentKey, toolName, costAmount: input.costAmount, costCurrency } }, who.ctx ?? {});
  return req;
}

// ---------------------------------------------------------------------------------------------------------------
// The master-switch / quality-gate-number card (same shape as `fixes.ts`'s own `fixGate` card).
// ---------------------------------------------------------------------------------------------------------------

export interface LearningEngineCard {
  key: 'learningEngine';
  value: LearningEngineSettings;
  version: string;
}
const versionOf = (v: unknown): string => JSON.stringify(v);
export function learningEngineCard(s: LearningEngineSettings): LearningEngineCard {
  const value = { on: s.on, minIndependentSources: s.minIndependentSources };
  return { key: 'learningEngine', value, version: versionOf(value) };
}

/** Saves the master switch and the quality-gate's own source count (`ai.control`, checked by the caller; a stale
 * version is refused, the same optimistic-concurrency shape `fixes.ts`'s own `saveFixGateCard` already uses). */
export async function saveLearningEngineCard(deps: LearningEngineDeps, who: LearningEngineWho, input: unknown): Promise<LearningEngineCard> {
  if (!isObj(input) || input.key !== 'learningEngine') throw new LearningEngineError('INVALID_INPUT', 400, ['key']);
  const before = await engineSettings(deps);
  if (input.version !== learningEngineCard(before).version) throw new LearningEngineError('BUSY', 409, ['version']);
  if (!isObj(input.value) || typeof input.value.on !== 'boolean' || typeof input.value.minIndependentSources !== 'number') {
    throw new LearningEngineError('INVALID_INPUT', 400, ['value']);
  }
  const minIndependentSources = Math.trunc(input.value.minIndependentSources);
  if (minIndependentSources < 1 || minIndependentSources > 5) throw new LearningEngineError('INVALID_INPUT', 400, ['minIndependentSources']);
  const next: LearningEngineSettings = { on: input.value.on, minIndependentSources };
  if (next.on !== before.on || next.minIndependentSources !== before.minIndependentSources) {
    await deps.resolver.set('ai.learningEngine', next, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'AI › Learning engine' });
    await audit(deps.db, who.actor, { action: 'ai.learningEngine.save', entityType: 'Setting', entityId: 'ai.learningEngine', before, after: next }, who.ctx ?? {});
  }
  return learningEngineCard(next);
}
