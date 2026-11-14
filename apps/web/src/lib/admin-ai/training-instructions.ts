// S28 · PR 713 (CN-048, admin prototype v5, AI Center › Training) — the owner's written instructions per agent, the topics no agent
// may bring up, the version history and "Restore this version". It reuses the S15 storage for exactly this (`AiTrainingExample`, PR 323:
// "a correction, instruction, document or forbidden topic"; no migration): an instruction is a row of kind `instruction` and a forbidden
// topic a row of kind `forbidden`, for one agent or for `all`. A row is never edited or deleted: "remove" archives it (`archivedAt`), and
// a version is read from the rows' own times — the set on the screen at any moment is the rows created by then and not yet archived —
// so every add, remove or restore (one batch, one moment) is a version, and "restore" brings an old set back as NEW rows and archives the
// ones that are not in it. Nothing is overwritten, the owner's rule "the ERP reverses, it never deletes history" applied to instructions.
// The corrections PR 323 records (kind `correction`) are untouched.
//
// Honest about the gap every S15 module notes: no job runner reads these into an agent's prompt yet, and no agent runs until
// `ai.enabled` is on (the page says so). Nothing here ever reaches a buyer, and an instruction cannot lift a standing rule (buyer replies
// stay on Ask, deletes stay approvals, permissions never move): those are enforced in the AI tool layer, not by this text.
// Every write needs `ai.control` (checked by the route); seeing needs `ai.read`. A write made on an older screen is refused (STALE).
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { PrismaClient } from '@extas/db/client';
import { TRAINING_ALL, TRAINING_FORBIDDEN_MAX, TRAINING_FORBIDDEN_TEXT_MAX, TRAINING_PER_AGENT_MAX, TRAINING_TEXT_MAX } from '@extas/settings';
import { isAiAgentKey } from './agents';
import { AiError } from './errors';

export const INSTRUCTION_KIND = 'instruction';
export const FORBIDDEN_KIND = 'forbidden';
const KINDS = [INSTRUCTION_KIND, FORBIDDEN_KIND];
const TYPE = 'AiTrainingExample';

export interface InstructionDeps {
  db: PrismaClient;
}
export interface InstructionWho {
  actor: Actor;
  ctx?: RequestContext;
}

interface Row {
  id: string;
  agentKey: string;
  kind: string;
  input: string;
  createdById: string | null;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface InstructionState {
  /** `all` first, then the agents in the order they were first taught. */
  agents: Array<{ key: string; lines: string[] }>;
  forbidden: string[];
  /** What the next write must quote (an older screen is refused with STALE). */
  version: string;
}

const sameWord = (kind: string, agentKey: string, text: string) => `${kind}\u0000${agentKey}\u0000${text}`;

async function allRows(db: Pick<PrismaClient, 'aiTrainingExample'>): Promise<Row[]> {
  return db.aiTrainingExample.findMany({
    where: { kind: { in: KINDS } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, agentKey: true, kind: true, input: true, createdById: true, createdAt: true, archivedAt: true },
  });
}

/** The rows in force at a moment (`null` = now): created by then and not archived yet. */
export function activeAt(rows: readonly Row[], at: Date | null): Row[] {
  return rows.filter((r) => (at === null ? r.archivedAt === null : r.createdAt <= at && (r.archivedAt === null || r.archivedAt > at)));
}

export function stateOf(active: readonly Row[]): InstructionState {
  const byAgent = new Map<string, string[]>();
  for (const r of active.filter((x) => x.kind === INSTRUCTION_KIND)) byAgent.set(r.agentKey, [...(byAgent.get(r.agentKey) ?? []), r.input]);
  const keys = [...byAgent.keys()].sort((a, b) => (a === TRAINING_ALL ? -1 : b === TRAINING_ALL ? 1 : 0));
  return {
    agents: keys.map((key) => ({ key, lines: byAgent.get(key) ?? [] })),
    forbidden: active.filter((x) => x.kind === FORBIDDEN_KIND).map((x) => x.input),
    version: createHash('sha256').update(active.map((r) => r.id).sort().join(',')).digest('hex').slice(0, 16),
  };
}

export async function instructionState(deps: InstructionDeps): Promise<InstructionState> {
  return stateOf(activeAt(await allRows(deps.db), null));
}

export type InstructionOp = { op: 'add' | 'remove'; scope: string; text: string };

const bad = (...details: string[]) => new AiError(400, 'INVALID_INPUT', details);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validScope(key: unknown): key is string {
  return typeof key === 'string' && (key === TRAINING_ALL || isAiAgentKey(key));
}

/**
 * One write against the version the screen showed: `add` / `remove` an instruction of `all` or one agent, `addForbidden` /
 * `removeForbidden` a topic, or `restore` the set that was in force at an earlier version (`versionId`, its moment as an ISO time),
 * saved as a NEW version.
 */
export async function changeInstructions(deps: InstructionDeps, who: InstructionWho, input: unknown): Promise<InstructionState> {
  if (!isObj(input)) throw bad('body');
  const text = typeof input.text === 'string' ? input.text.trim().replace(/\s+/g, ' ') : '';
  const action = input.action;
  const ctx = who.ctx ?? {};
  const by = who.actor.staffUserId ?? null;
  return deps.db.$transaction(async (tx) => {
    const rows = await allRows(tx);
    const active = activeAt(rows, null);
    const state = stateOf(active);
    if (input.base !== state.version) throw new AiError(409, 'STALE');
    const at = new Date();
    const create = async (kind: string, agentKey: string, t: string) => {
      const row = await tx.aiTrainingExample.create({ data: { agentKey, kind, input: t, sourceRef: 'training', createdById: by, createdAt: at } });
      await audit(tx, who.actor, { action: 'ai.training.add', entityType: TYPE, entityId: row.id, after: { agentKey, kind, text: t } }, ctx);
    };
    const archive = async (r: Row) => {
      await tx.aiTrainingExample.update({ where: { id: r.id }, data: { archivedAt: at } });
      await audit(tx, who.actor, { action: 'ai.training.archive', entityType: TYPE, entityId: r.id, before: { agentKey: r.agentKey, kind: r.kind, text: r.input }, after: { archivedAt: at.toISOString() } }, ctx);
    };

    switch (action) {
      case 'add': {
        if (!validScope(input.agent)) throw bad('agent');
        if (!text || text.length > TRAINING_TEXT_MAX) throw bad('text');
        const mine = active.filter((r) => r.kind === INSTRUCTION_KIND && r.agentKey === input.agent);
        if (mine.some((r) => r.input === text)) throw new AiError(409, 'DUPLICATE');
        if (mine.length >= TRAINING_PER_AGENT_MAX) throw new AiError(409, 'FULL');
        await create(INSTRUCTION_KIND, input.agent, text);
        break;
      }
      case 'remove': {
        if (!validScope(input.agent)) throw bad('agent');
        const row = active.find((r) => r.kind === INSTRUCTION_KIND && r.agentKey === input.agent && r.input === text);
        if (!row) throw new AiError(404, 'NOT_FOUND');
        await archive(row);
        break;
      }
      case 'addForbidden': {
        if (!text || text.length > TRAINING_FORBIDDEN_TEXT_MAX) throw bad('text');
        const mine = active.filter((r) => r.kind === FORBIDDEN_KIND);
        if (mine.some((r) => r.input === text)) throw new AiError(409, 'DUPLICATE');
        if (mine.length >= TRAINING_FORBIDDEN_MAX) throw new AiError(409, 'FULL');
        await create(FORBIDDEN_KIND, TRAINING_ALL, text);
        break;
      }
      case 'removeForbidden': {
        const row = active.find((r) => r.kind === FORBIDDEN_KIND && r.input === text);
        if (!row) throw new AiError(404, 'NOT_FOUND');
        await archive(row);
        break;
      }
      case 'restore': {
        const at0 = typeof input.versionId === 'string' ? new Date(input.versionId) : null;
        if (!at0 || Number.isNaN(at0.getTime())) throw bad('versionId');
        const versions = versionTimes(rows);
        const no = versions.findIndex((v) => v.getTime() === at0.getTime()) + 1;
        if (no === 0) throw new AiError(404, 'NOT_FOUND');
        const target = activeAt(rows, at0);
        const want = new Map(target.map((r) => [sameWord(r.kind, r.agentKey, r.input), r]));
        const have = new Map(active.map((r) => [sameWord(r.kind, r.agentKey, r.input), r]));
        const toAdd = [...want.entries()].filter(([k]) => !have.has(k)).map(([, r]) => r);
        const toArchive = [...have.entries()].filter(([k]) => !want.has(k)).map(([, r]) => r);
        if (!toAdd.length && !toArchive.length) throw new AiError(409, 'NO_CHANGE');
        for (const r of toArchive) await archive(r);
        for (const r of toAdd) await create(r.kind, r.agentKey, r.input);
        await audit(tx, who.actor, { action: 'ai.training.restore', entityType: 'AiTrainingVersion', entityId: at.toISOString(), after: { restoredFrom: no, added: toAdd.length, removed: toArchive.length } }, ctx);
        break;
      }
      default:
        throw bad('action');
    }
    return stateOf(activeAt(await allRows(tx), null));
  });
}

/** Every moment the set changed (a row made or archived), oldest first: version 1 is the first. */
export function versionTimes(rows: readonly Row[]): Date[] {
  const seen = new Map<number, Date>();
  for (const r of rows) {
    seen.set(r.createdAt.getTime(), r.createdAt);
    if (r.archivedAt) seen.set(r.archivedAt.getTime(), r.archivedAt);
  }
  return [...seen.values()].sort((a, b) => a.getTime() - b.getTime());
}

export interface InstructionVersion {
  /** The moment of the change as an ISO time; what "restore" is given. */
  id: string;
  /** 1 is the first change ever; the newest is the one in use. */
  no: number;
  at: Date;
  by: string | null;
  /** Set when this version was made by restoring an older one. */
  restoredFrom: number | null;
  ops: InstructionOp[];
  current: boolean;
}

/** The newest `limit` versions (every row is kept, so every version can be read) and how many there are in all. */
export async function instructionVersions(deps: InstructionDeps, limit: number): Promise<{ total: number; rows: InstructionVersion[] }> {
  const rows = await allRows(deps.db);
  const times = versionTimes(rows);
  const total = times.length;
  const shown = times.slice(-limit).reverse();
  if (!shown.length) return { total, rows: [] };
  const ids = rows.map((r) => r.id);
  const [logs, restores] = await Promise.all([
    deps.db.auditLog.findMany({ where: { entityType: TYPE, entityId: { in: ids }, action: { in: ['ai.training.add', 'ai.training.archive'] } }, select: { entityId: true, action: true, actorId: true } }),
    deps.db.auditLog.findMany({ where: { entityType: 'AiTrainingVersion', entityId: { in: shown.map((d) => d.toISOString()) }, action: 'ai.training.restore' }, select: { entityId: true, after: true } }),
  ]);
  const actorOf = new Map(logs.map((l) => [`${l.action}:${l.entityId}`, l.actorId]));
  const staffIds = [...new Set([...logs.map((l) => l.actorId)].filter((x): x is string => !!x))];
  const staff = await deps.db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } });
  const names = new Map(staff.map((s) => [s.id, s.displayName]));
  const restoredOf = new Map(restores.map((r) => [r.entityId, isObj(r.after) && typeof r.after.restoredFrom === 'number' ? r.after.restoredFrom : null]));
  const out: InstructionVersion[] = shown.map((at) => {
    const t = at.getTime();
    const made = rows.filter((r) => r.createdAt.getTime() === t);
    const gone = rows.filter((r) => r.archivedAt?.getTime() === t);
    const op = (kind: 'add' | 'remove', r: Row): InstructionOp => ({ op: kind, scope: r.kind === FORBIDDEN_KIND ? 'forbidden' : r.agentKey, text: r.input });
    const who = made[0] ? (actorOf.get(`ai.training.add:${made[0].id}`) ?? made[0].createdById) : gone[0] ? actorOf.get(`ai.training.archive:${gone[0].id}`) : null;
    return {
      id: at.toISOString(),
      no: times.findIndex((v) => v.getTime() === t) + 1,
      at,
      by: who ? (names.get(who) ?? null) : null,
      restoredFrom: restoredOf.get(at.toISOString()) ?? null,
      ops: [...gone.map((r) => op('remove', r)), ...made.map((r) => op('add', r))],
      current: t === times[times.length - 1]!.getTime(),
    };
  });
  return { total, rows: out };
}
