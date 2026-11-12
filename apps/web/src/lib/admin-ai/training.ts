// S15 · PR 323 (Blueprint C1.8 "every correction the owner makes becomes a training example"; C3.3 repeats the
// same standing requirement "for every agent in the table above"; the demo's own agent-profile screen,
// `89b-admin-agents.js`, shows the result as each agent's own "Lessons (owner corrections)" list —
// "মালিকের প্রতিটা সংশোধন একটা নিয়ম হয়ে যায় — কাজের আগে প্রতিবার পড়ে") — `AiTrainingExample` (already in the full
// S00 schema, `@stage S15 · PR 323`, written for the first time here): the real plumbing behind that standing
// requirement, triggered from the one genuine "correction" moment the codebase has today — the owner rejecting an
// `ai.skill` proposal with a reason, through the one approval queue (PR 317) `fixes.decideProposal` (S21 · PR 420)
// already decides every skill through. `approvals-api.ts`'s own POST handler (this PR's only edit to an existing
// file) calls `recordSkillCorrection` below right after such a rejection: the rejected version's own content
// becomes `input` ("what the agent proposed"), the owner's own reason becomes `expected` ("what the owner actually
// wanted instead"), and the row is tagged with the skill's own agent — so the agent that made the mistake is the
// one credited with the lesson, exactly as the demo's own per-agent list implies. Never a second decision path:
// this file only ever *records* what `decideProposal` already decided, never decides anything itself.
//
// Honest about what has not changed: the demo's own screen that would *read* this table — the agent-profile page's
// "Lessons (owner corrections)" list — is PR 577's own (not yet built: C10.4's "each of the fixed agents ... has an
// employee-style profile ... skills it has and skills it is learning (linked to the Skill Library, PR 321–323)"),
// and no training/fine-tuning pipeline consumes these rows yet either (the same gap PR 321/322 already note for
// the skill-execution engine itself). What ships here is real and fully tested either way, so nothing an owner
// corrects today is lost before either of those later steps exists. `trainingExamplesView` is this PR's own read
// side, exposed today through a small `GET /api/admin/ai/training` (`ai.read`) rather than a dashboard page —
// there is nowhere in the demo to put one before PR 577 exists — so the data is already real and queryable the day
// that page is built. A later owner-typed "teach this" entry point (not tied to a rejection) is left to that same
// future PR; `kind` stays a plain string column precisely so it can grow a second value then without a migration.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { type PrismaClient } from '@extas/db/client';
import { REASON_MAX, SKILL_CONTENT_MAX } from '../admin-health/fixes';
import { isAiAgentKey, type AiAgentKey } from './agents';

/** `AiTrainingExample.kind` — today only ever written automatically, from a skill rejection. */
export const CORRECTION_KIND = 'correction';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export interface TrainingDeps {
  db: PrismaClient;
}

export interface SkillCorrectionInput {
  /** The rejected `AiSkill`'s own id (`AiApprovalRequest.refId`). */
  skillId: string;
  /** The approval request's own `agentKey` column, when it has one — checked first, falling back to the skill's
   * own `sourceRef` (the same fallback `skill-sandbox.ts` already uses for the same reason). */
  agentKey: string | null;
  /** The approval request's own `payload` (carries the rejected version number). */
  payload: unknown;
  /** The owner's own, already-trimmed decision note — the caller only calls this once it is non-empty. */
  reason: string;
}

export interface SkillCorrectionResult {
  id: string;
}

/**
 * Writes one `AiTrainingExample` from a skill rejection (no permission check of its own: `approvals-api.ts` has
 * already checked `health.fixes.approve` and already rejected the proposal through `fixes.decideProposal` before
 * calling this). Honest, not best-effort-fabricated: returns `null`, writing nothing, when there is nothing real to
 * record — no version content to show (the request's own payload named no real version, or that version is gone),
 * or no real agent to credit — rather than guessing either one.
 */
export async function recordSkillCorrection(deps: TrainingDeps, who: { actor: Actor; ctx?: RequestContext }, input: SkillCorrectionInput): Promise<SkillCorrectionResult | null> {
  const reason = input.reason.trim();
  if (!reason) return null;
  const skill = await deps.db.aiSkill.findUnique({ where: { id: input.skillId }, select: { key: true, sourceRef: true } });
  if (!skill) return null;
  const p = isObj(input.payload) ? input.payload : {};
  const version = typeof p.version === 'number' ? p.version : null;
  const content = version !== null ? ((await deps.db.aiSkillVersion.findFirst({ where: { skillId: input.skillId, version } }))?.content ?? null) : null;
  if (!content) return null;
  const agentKey: AiAgentKey | null = (input.agentKey && isAiAgentKey(input.agentKey) ? input.agentKey : null) ?? (skill.sourceRef && isAiAgentKey(skill.sourceRef) ? skill.sourceRef : null);
  if (!agentKey) return null;

  const row = await deps.db.aiTrainingExample.create({
    data: {
      agentKey,
      skillKey: skill.key,
      kind: CORRECTION_KIND,
      input: content.slice(0, SKILL_CONTENT_MAX),
      expected: reason.slice(0, REASON_MAX),
      sourceRef: input.skillId,
      createdById: who.actor.staffUserId ?? null,
    },
  });
  await audit(
    deps.db,
    who.actor,
    { action: 'ai.training.correction', entityType: 'AiTrainingExample', entityId: row.id, after: { agentKey, skillKey: skill.key, sourceRef: input.skillId } },
    who.ctx ?? {},
  );
  return { id: row.id };
}

export interface TrainingExampleRow {
  id: string;
  agentKey: string;
  skillKey: string | null;
  kind: string;
  input: string;
  expected: string | null;
  sourceRef: string | null;
  createdAt: Date;
}

/** A display/row-fetch cap, not a business number — every row stays in the database either way. */
export const TRAINING_MAX_ROWS = 100; // hardcode-ok: a display row count, not a business number

export interface TrainingExamplesQuery {
  agentKey?: string | null;
  skillKey?: string | null;
}

/**
 * Newest-first, never-archived training examples (`ai.read`, checked by the caller) — optionally narrowed to one
 * agent and/or one skill. An unrecognised agent key is an honest empty list, never a guess at what was meant.
 * Nothing here is ever deleted (CLAUDE.md rule 3); a row this PR has no "remove" path for yet stays visible until a
 * later PR adds one.
 */
export async function trainingExamplesView(deps: TrainingDeps, query: TrainingExamplesQuery = {}): Promise<TrainingExampleRow[]> {
  if (query.agentKey && !isAiAgentKey(query.agentKey)) return [];
  return deps.db.aiTrainingExample.findMany({
    where: { archivedAt: null, ...(query.agentKey ? { agentKey: query.agentKey } : {}), ...(query.skillKey ? { skillKey: query.skillKey } : {}) },
    orderBy: { createdAt: 'desc' },
    take: TRAINING_MAX_ROWS,
    select: { id: true, agentKey: true, skillKey: true, kind: true, input: true, expected: true, sourceRef: true, createdAt: true },
  });
}
