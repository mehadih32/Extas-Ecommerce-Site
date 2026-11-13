// S15 · PR 321 (Blueprint C1.7 "Skill library" + "Import a skill from outside"; the demo's own AIC-04 "Skills ›
// Library" screen, `syn: "skills library import version roll back"`) — AI › Skills at `/admin/ai/skills`: every
// `AiSkill` (already in the full S00 schema, `@stage S15 · PR 321, 322`) as a card — name, purpose, which agent
// uses it, its current version, and an on/off switch — plus the owner's own way to add one.
//
// `AiSkill`/`AiSkillVersion` already have a real producer: S21 · PR 420 (`../admin-health/fixes.ts`'s
// `proposeSkill`/`decideProposal`) writes them when an agent proposes a new skill (or a new version of one) after
// a site-health finding, and the owner decides it from Reports › Site health › Fixes to approve
// (`health.fixes.approve`) — the *single* decision path for every `AiSkill` proposal, agent-written or
// owner-written alike (the same restraint `approvals.ts` already states of itself for `GATE_KINDS`: "never a
// second way to decide ... a skill"). `importSkill` below is the *other* producer that same file's own header
// comment already named ("switching skills on is the skill library's, PR 321-323"): the owner's own direct import
// from this screen, gated by its own permission (`ai.skills.write`, not `health.fixes.propose` — that one is the
// audit runner's/an agent's) but landing in the exact same `ai.skill` approval queue, so `fixes.decideProposal`
// stays the one place a skill is ever turned from "waiting" into "approved". `rollbackSkill` and
// `setSkillEnabled` are this PR's own new primitives — `fixes.ts` only ever proposes and approves/rejects; it
// never rolls a skill back or switches one on.
//
// Matching the demo exactly (CLAUDE.md rule 5): the import dialog asks only a skill name and an agent — never the
// actual document, link or instruction set Blueprint C1.7's "Import a skill from outside" describes pasting ("the
// owner pastes a document, a link or an instruction set and says 'learn this'. The AI converts it into a skill and
// shows what it understood"). That richer capture needs a real reading/understanding step no agent runner does
// yet — the same honest gap PR 320's own bug box left for the Blueprint's separate "investigate" flow. `content`
// stays an optional parameter here for that future caller (PR 323's training loop, or a later "learn this"
// command) and defaults to a clearly labelled stand-in so today's two-field import still writes a real, valid
// version rather than an empty one.
//
// Status reuses `fixes.ts`'s own real, already-shipped vocabulary (`proposed`/`approved`/`rejected`/`expired` —
// never the demo mock's own `waiting`/`active`/`archived`, which lives only in the demo's throwaway JS and would
// otherwise fork one database column's meaning in two). `enabled` is the Blueprint's own on/off card attribute:
// approving a skill only ever makes its version current (`fixes.ts`'s own comment is explicit that a new skill
// "stays switched off"), so a freshly approved skill needs this file's own switch before it is really live.
//
// As honest as every other S15 write path about the one thing that has not changed: no job dispatcher or agent
// runner exists yet, so nothing in the real codebase reads an `enabled` skill to act on it today. The import,
// version and rollback mechanics are fully real and fully tested, ready for the first agent that reads this table.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { type Prisma, type PrismaClient } from '@extas/db/client';
import type { HealthFixGateSettings } from '@extas/settings';
import type { AppResolver } from '../settings';
import { REASON_MAX, SKILL_CONTENT_MAX, SKILL_KIND } from '../admin-health/fixes';
import { AI_AGENTS, isAiAgentKey, type AiAgentKey } from './agents';
import { ensureAgentRows } from './control-room';
import { AiError } from './errors';

const DAY = 86_400_000;
const NAME_MAX = 120; // hardcode-ok: a text-length guard, the same ceiling fixes.ts's own skill `name` uses
const KEY_MAX = 80; // hardcode-ok: matches fixes.ts's own skill `key` column guard
/** A display row cap for one screenful, not a business limit — every skill stays in the database either way. */
export const LIBRARY_MAX_ROWS = 200; // hardcode-ok: a display row count, not a business number
/** How many times `importSkill` retries a generated key that collides with an existing one. */
const KEY_RETRY_ATTEMPTS = 5; // hardcode-ok: a retry ceiling, not a business number

/** `AiSkill.status`'s own real values, as `fixes.ts`'s `proposeSkill`/`decideProposal` already write them —
 * mirrored here, not re-exported from `fixes.ts`, so this file reads the same column the same way without a
 * second source of truth for what the strings mean. */
export const SKILL_STATUSES = ['proposed', 'approved', 'rejected', 'expired'] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export function isSkillStatus(v: string): v is SkillStatus {
  return (SKILL_STATUSES as readonly string[]).includes(v);
}

type Db = PrismaClient;

export interface SkillsDeps {
  db: Db;
  resolver: Pick<AppResolver, 'value'>;
  now?: () => Date;
}

function slugKey(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, KEY_MAX);
  return base || 'skill';
}

/** The demo's own two-field import (AIC-04) leaves the real document/link/instruction unset; a later caller with
 * the real pasted text (PR 323, or a future "learn this" command) passes its own `content` instead of this. */
const placeholderContent = (name: string): string =>
  `Imported "${name}" from AI 360 › Skills with its name and agent only — the full instructions were not pasted in this step.`;

const isUniqueKeyError = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2002';

export interface ImportSkillInput {
  /** A real agent key — the demo's own select always has one chosen, never "no agent". */
  agentKey: string;
  name: string;
  purpose?: string | null;
  /** Optional: see the file header. Defaults to a clearly labelled placeholder when left out. */
  content?: string | null;
}

export interface ImportSkillResult {
  id: string;
  key: string;
  version: number;
  approvalRequestId: string;
}

/**
 * The owner's own "Import a skill" (`ai.skills.write`, checked by the caller): writes a brand-new `AiSkill` at
 * version 1, `status: 'proposed'`, and raises the *same* `ai.skill` approval request `fixes.proposeSkill` raises
 * for an agent's own proposal — so `fixes.decideProposal` is the one place that ever approves or rejects it,
 * never a second decision path for this table. The key is generated from the name (`fixes.ts`'s own regex, lower
 * case, hyphenated) and retried on a collision, the same belt-and-braces its `proposeSkill` already uses for its
 * own unique key.
 */
export async function importSkill(deps: SkillsDeps, who: { actor: Actor; ctx?: RequestContext }, input: ImportSkillInput): Promise<ImportSkillResult> {
  if (!isAiAgentKey(input.agentKey)) throw new AiError(422, 'UNKNOWN_AGENT', ['agentKey']);
  const name = input.name.trim();
  if (!name || name.length > NAME_MAX) throw new AiError(422, 'INVALID_INPUT', ['name']);
  const purpose = input.purpose?.trim() || null;
  if (purpose && purpose.length > REASON_MAX) throw new AiError(422, 'INVALID_INPUT', ['purpose']);
  const content = input.content?.trim() || placeholderContent(name);
  if (content.length > SKILL_CONTENT_MAX) throw new AiError(422, 'INVALID_INPUT', ['content']);
  await ensureAgentRows(deps.db);
  const agent = await deps.db.aiAgent.findUnique({ where: { key: input.agentKey } });
  if (!agent) throw new AiError(422, 'UNKNOWN_AGENT', ['agentKey']);
  const now = deps.now?.() ?? new Date();
  const gate = (await deps.resolver.value('health.fixGate')) as HealthFixGateSettings;
  const expiresAt = gate.expireDays > 0 ? new Date(now.getTime() + gate.expireDays * DAY) : null;
  const base = slugKey(name);

  let lastErr: unknown;
  for (let attempt = 0; attempt < KEY_RETRY_ATTEMPTS; attempt++) {
    const key = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      const out = await deps.db.$transaction(async (tx) => {
        const skill = await tx.aiSkill.create({
          data: { key, name, purpose, status: 'proposed', source: 'owner_import', sourceRef: input.agentKey, agentId: agent.id, enabled: false },
        });
        await tx.aiSkillVersion.create({ data: { skillId: skill.id, version: 1, content } });
        const req = await tx.aiApprovalRequest.create({
          data: {
            storeId: null,
            agentKey: input.agentKey,
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
        return { skillId: skill.id, key, approvalRequestId: req.id };
      });
      await audit(
        deps.db,
        who.actor,
        { action: 'ai.skill.import', entityType: 'AiSkill', entityId: out.skillId, after: { key: out.key, version: 1, agentKey: input.agentKey, approvalRequestId: out.approvalRequestId } },
        who.ctx ?? {},
      );
      return { id: out.skillId, key: out.key, version: 1, approvalRequestId: out.approvalRequestId };
    } catch (e) {
      if (!isUniqueKeyError(e)) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new AiError(409, 'BUSY', ['key']);
}

export interface SkillRow {
  id: string;
  key: string;
  name: string;
  purpose: string | null;
  /** The agent this skill is for — `sourceRef` the way both producers (this file and `fixes.ts`) write it; null
   * only for a row written before either set it. */
  agentKey: string | null;
  status: SkillStatus;
  enabled: boolean;
  /** 0 while `status` is `proposed`/`rejected`/`expired` with nothing approved yet — no version is live. */
  currentVersion: number;
  currentContent: string | null;
  /** How many earlier *approved* versions this skill could still roll back through (never every version — an
   * unapproved draft that was rejected is not a rollback target). */
  olderApprovedVersions: number;
  /** The version one click of "roll back" would land on, or null when there is nowhere to roll back to. */
  rollbackTo: number | null;
  updatedAt: Date;
}

/** The owner's own screen (`ai.read`, checked by the caller): every skill, most recently changed first, with its
 * current version's content (when it has a live one) and how far back it could still be rolled back. */
export async function skillLibraryView(deps: Pick<SkillsDeps, 'db'>): Promise<SkillRow[]> {
  const skills = await deps.db.aiSkill.findMany({ where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: LIBRARY_MAX_ROWS });
  if (!skills.length) return [];
  const ids = skills.map((s) => s.id);
  const versions = await deps.db.aiSkillVersion.findMany({ where: { skillId: { in: ids } }, orderBy: { version: 'asc' } });
  const byId = new Map<string, typeof versions>();
  for (const v of versions) {
    const list = byId.get(v.skillId);
    if (list) list.push(v);
    else byId.set(v.skillId, [v]);
  }
  return skills.map((s) => {
    const own = byId.get(s.id) ?? [];
    const current = own.find((v) => v.version === s.currentVersion) ?? null;
    const olderApproved = own.filter((v) => v.version < s.currentVersion && v.approvedById);
    const rollbackTo = olderApproved.length ? olderApproved[olderApproved.length - 1]!.version : null;
    return {
      id: s.id,
      key: s.key,
      name: s.name,
      purpose: s.purpose,
      agentKey: s.sourceRef && isAiAgentKey(s.sourceRef) ? s.sourceRef : null,
      status: isSkillStatus(s.status) ? s.status : 'proposed',
      enabled: s.enabled,
      currentVersion: s.currentVersion,
      currentContent: current?.content ?? null,
      olderApprovedVersions: olderApproved.length,
      rollbackTo,
      updatedAt: s.updatedAt,
    };
  });
}

export interface RollbackResult {
  id: string;
  fromVersion: number;
  toVersion: number;
}

/**
 * One-click rollback (`ai.skills.write`, checked by the caller): moves the skill's own `currentVersion` pointer
 * back to the most recent *earlier approved* version. Never deletes a version row (CLAUDE.md rule 3 — nothing is
 * deleted), so rolling back again later is still possible as long as an even earlier approved version exists.
 * Only an `approved` skill with such a version can be rolled back — there is nothing to roll an unapproved,
 * rejected or already-oldest skill back to.
 */
export async function rollbackSkill(deps: Pick<SkillsDeps, 'db'>, who: { actor: Actor; ctx?: RequestContext }, skillId: string): Promise<RollbackResult> {
  const skill = await deps.db.aiSkill.findUnique({ where: { id: skillId } });
  if (!skill) throw new AiError(404, 'NOT_FOUND', ['id']);
  if (skill.status !== 'approved') throw new AiError(409, 'NOT_APPROVED', ['id']);
  const target = await deps.db.aiSkillVersion.findFirst({
    where: { skillId, version: { lt: skill.currentVersion }, approvedById: { not: null } },
    orderBy: { version: 'desc' },
  });
  if (!target) throw new AiError(409, 'NO_HISTORY', ['id']);
  const fromVersion = skill.currentVersion;
  await deps.db.aiSkill.update({ where: { id: skillId }, data: { currentVersion: target.version } });
  await audit(
    deps.db,
    who.actor,
    { action: 'ai.skill.rollback', entityType: 'AiSkill', entityId: skillId, before: { currentVersion: fromVersion }, after: { currentVersion: target.version } },
    who.ctx ?? {},
  );
  return { id: skillId, fromVersion, toVersion: target.version };
}

export interface EnableResult {
  id: string;
  enabled: boolean;
}

/**
 * The Blueprint's own on/off per skill card (C1.7) — the gap `fixes.ts`'s own header comment leaves for this PR:
 * approving a skill only ever makes its version current, never switches it on. Only an `approved` skill may be
 * switched (`ai.skills.write`, checked by the caller); a second tap with the same value writes nothing twice.
 */
export async function setSkillEnabled(deps: Pick<SkillsDeps, 'db'>, who: { actor: Actor; ctx?: RequestContext }, skillId: string, enabled: boolean): Promise<EnableResult> {
  const skill = await deps.db.aiSkill.findUnique({ where: { id: skillId } });
  if (!skill) throw new AiError(404, 'NOT_FOUND', ['id']);
  if (skill.status !== 'approved') throw new AiError(409, 'NOT_APPROVED', ['id']);
  if (skill.enabled === enabled) return { id: skillId, enabled };
  await deps.db.aiSkill.update({ where: { id: skillId }, data: { enabled } });
  await audit(
    deps.db,
    who.actor,
    { action: enabled ? 'ai.skill.enable' : 'ai.skill.disable', entityType: 'AiSkill', entityId: skillId, before: { enabled: skill.enabled }, after: { enabled } },
    who.ctx ?? {},
  );
  return { id: skillId, enabled };
}

/** The agent select's own options, in the Blueprint's fixed roster order (AI_AGENTS), for the import dialog. */
export const SKILL_AGENT_OPTIONS: readonly { key: AiAgentKey; nameEn: string; nameBn: string; emoji: string }[] = AI_AGENTS.map((a) => ({
  key: a.key,
  nameEn: a.nameEn,
  nameBn: a.nameBn,
  emoji: a.emoji,
}));
