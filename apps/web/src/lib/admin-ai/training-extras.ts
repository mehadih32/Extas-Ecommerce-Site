// S28 · PR 713 (CN-048, AI Center › Training) — the four parts of the prototype's Training tab that the instructions page left out:
// (1) "Try it", a sandbox that shows what an agent would answer with the current instructions, (2) a correction saved as a training
// example (the owner's better answer next to the sample), (3) extra reference documents and (4) "describe a problem" notes. All of them
// are rows of `AiTrainingExample` (S15 · PR 323, no migration): kind `correction` (input = the sample message, expected = the answer the
// owner wanted, sourceRef `sandbox`), kind `document` (expected = title, input = text, sourceRef `doc:<version>`), kind `note` (input =
// the owner's words). A row is never edited or deleted: a changed document is a NEW row with the next version number and the old one is
// archived; "remove" archives. Nothing here is sent to anyone. "Try it" never calls a model while AI is off (it answers `off` first), and
// with AI on it goes through the existing guide-answer job of the AI call layer (master switch, agent on/off, routed model, monthly cap,
// usage ledger, diary), under the AI service account; the answer is shown to the owner only, so "anything that reaches a buyer stays Ask"
// is untouched. Every write needs `ai.control` (checked by the route). Words: messages/admin-training.*.json (`aiTraining.*`).
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { TRAINING_ALL, TRAINING_ANSWER_MAX, TRAINING_DOCS_MAX, TRAINING_DOC_TEXT_MAX, TRAINING_DOC_TITLE_MAX, TRAINING_NOTE_MAX, TRAINING_SAMPLE_MAX } from '@extas/settings';
import type { Vault } from '@extas/vault';
import type { AppResolver } from '../settings';
import { AiError } from './errors';
import { guideQaAnswer } from './guide-qa-dispatch';
import { validScope, instructionState } from './training-instructions';
import { CORRECTION_KIND } from './training';

export const DOCUMENT_KIND = 'document';
export const NOTE_KIND = 'note';
export const SANDBOX_REF = 'sandbox';
const TYPE = 'AiTrainingExample';
/** How many saved examples / notes the page lists (a display count, every row stays). */
export const EXTRAS_LIST_MAX = 20; // hardcode-ok: a display row count

export interface ExtrasDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}
export interface ExtrasWho {
  actor: Actor;
  ctx?: RequestContext;
}

const bad = (...d: string[]) => new AiError(400, 'INVALID_INPUT', d);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Trim, keep the owner's line breaks, cap nothing: the caller checks the length. */
export const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\r/g, '').trim() : '');

/** The version number kept in a document row's `sourceRef` (`doc:3` is version 3); 1 when it is not readable. */
export function docVersionOf(sourceRef: string | null): number {
  const m = /^doc:(\d+)$/.exec(sourceRef ?? '');
  return m ? Number(m[1]) : 1;
}

/** The text an agent is given as its instructions in the sandbox: "every agent" lines, the agent's own lines, the forbidden topics and the reference documents. */
export function sandboxFacts(p: { agentName: string; lines: readonly string[]; forbidden: readonly string[]; docs: ReadonlyArray<{ title: string; text: string }> }): string {
  const out: string[] = [`Agent: ${p.agentName}`];
  if (p.lines.length) out.push('Instructions:', ...p.lines.map((l) => `- ${l}`));
  if (p.forbidden.length) out.push('Never bring up these topics:', ...p.forbidden.map((f) => `- ${f}`));
  for (const d of p.docs) out.push(`Reference note "${d.title}":`, d.text);
  return out.join('\n');
}

export interface ExtrasState {
  examples: Array<{ id: string; agentKey: string; input: string; expected: string; at: Date }>;
  docs: Array<{ id: string; agentKey: string; title: string; text: string; version: number; at: Date }>;
  notes: Array<{ id: string; agentKey: string; text: string; at: Date }>;
}

export async function extrasState(db: Pick<PrismaClient, 'aiTrainingExample'>): Promise<ExtrasState> {
  const rows = await db.aiTrainingExample.findMany({
    where: { archivedAt: null, OR: [{ kind: DOCUMENT_KIND }, { kind: NOTE_KIND }, { kind: CORRECTION_KIND, sourceRef: SANDBOX_REF }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200, // hardcode-ok: a fetch cap
    select: { id: true, agentKey: true, kind: true, input: true, expected: true, sourceRef: true, createdAt: true },
  });
  const pick = (kind: string) => rows.filter((r) => r.kind === kind);
  return {
    examples: pick(CORRECTION_KIND).slice(0, EXTRAS_LIST_MAX).map((r) => ({ id: r.id, agentKey: r.agentKey, input: r.input, expected: r.expected ?? '', at: r.createdAt })),
    docs: pick(DOCUMENT_KIND).map((r) => ({ id: r.id, agentKey: r.agentKey, title: r.expected ?? '', text: r.input, version: docVersionOf(r.sourceRef), at: r.createdAt })),
    notes: pick(NOTE_KIND).slice(0, EXTRAS_LIST_MAX).map((r) => ({ id: r.id, agentKey: r.agentKey, text: r.input, at: r.createdAt })),
  };
}

export type TryItResult = { status: 'off' } | { status: 'unavailable' } | { status: 'ok'; answer: string };

/**
 * "Try it": what `agent` would answer to `sample` with the instructions in force now. AI off: `off`, and no model is called (the
 * switch is read first). Otherwise the existing guide-answer job answers from the instruction text only (the call layer returns
 * nothing when the agent is paused, no connection is ready or the monthly cap would be passed: `unavailable`). Nothing is saved or sent.
 */
export async function tryIt(deps: ExtrasDeps, input: unknown, agentName: (key: string) => string, locale: 'en' | 'bn'): Promise<TryItResult> {
  if (!isObj(input)) throw bad('body');
  if (!validScope(input.agent)) throw bad('agent');
  const sample = clean(input.sample);
  if (!sample || sample.length > TRAINING_SAMPLE_MAX) throw bad('sample');
  if (!(await deps.resolver.value('ai.enabled', { storeId: MOTHER_STORE_ID }))) return { status: 'off' };
  const [state, extras] = await Promise.all([instructionState({ db: deps.db }), extrasState(deps.db)]);
  const agent = String(input.agent);
  const lines = state.agents.filter((a) => a.key === TRAINING_ALL || a.key === agent).flatMap((a) => a.lines);
  const docs = extras.docs.filter((d) => d.agentKey === TRAINING_ALL || d.agentKey === agent);
  const facts = sandboxFacts({ agentName: agentName(agent), lines, forbidden: state.forbidden, docs });
  const answer = await guideQaAnswer(deps, MOTHER_STORE_ID, `training:${agent}`, locale, sample, { title: agentName(agent), blocks: [{ t: 'p', c: [{ t: 'text', v: facts }] }] });
  return answer ? { status: 'ok', answer } : { status: 'unavailable' };
}

async function write(deps: Pick<ExtrasDeps, 'db'>, fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<void>): Promise<void> {
  await deps.db.$transaction(async (tx) => fn(tx));
}

/** One change: `saveExample`, `addDoc`, `editDoc`, `removeDoc`, `addNote`. */
export async function changeExtras(deps: Pick<ExtrasDeps, 'db'>, who: ExtrasWho, input: unknown): Promise<void> {
  if (!isObj(input)) throw bad('body');
  const ctx = who.ctx ?? {};
  const by = who.actor.staffUserId ?? null;
  await write(deps, async (tx) => {
    const log = (action: string, id: string, after: Record<string, unknown>) => audit(tx, who.actor, { action, entityType: TYPE, entityId: id, after }, ctx);
    switch (input.action) {
      case 'saveExample': {
        if (!validScope(input.agent) || input.agent === TRAINING_ALL) throw bad('agent');
        const sample = clean(input.sample);
        const better = clean(input.better);
        if (!sample || sample.length > TRAINING_SAMPLE_MAX) throw bad('sample');
        if (!better || better.length > TRAINING_ANSWER_MAX) throw bad('better');
        const row = await tx.aiTrainingExample.create({ data: { agentKey: input.agent, kind: CORRECTION_KIND, input: sample, expected: better, sourceRef: SANDBOX_REF, createdById: by } });
        await log('ai.training.correction', row.id, { agentKey: input.agent, sourceRef: SANDBOX_REF });
        return;
      }
      case 'addDoc': {
        if (!validScope(input.agent)) throw bad('agent');
        const title = clean(input.title).replace(/\s+/g, ' ');
        const text = clean(input.text);
        if (!title || title.length > TRAINING_DOC_TITLE_MAX) throw bad('title');
        if (!text || text.length > TRAINING_DOC_TEXT_MAX) throw bad('text');
        const active = await tx.aiTrainingExample.findMany({ where: { kind: DOCUMENT_KIND, archivedAt: null }, select: { agentKey: true, expected: true } });
        if (active.length >= TRAINING_DOCS_MAX) throw new AiError(409, 'FULL');
        if (active.some((d) => d.agentKey === input.agent && d.expected === title)) throw new AiError(409, 'DUPLICATE');
        const row = await tx.aiTrainingExample.create({ data: { agentKey: input.agent, kind: DOCUMENT_KIND, input: text, expected: title, sourceRef: 'doc:1', createdById: by } });
        await log('ai.training.add', row.id, { agentKey: input.agent, kind: DOCUMENT_KIND, title, version: 1 });
        return;
      }
      case 'editDoc': {
        const text = clean(input.text);
        if (typeof input.id !== 'string') throw bad('id');
        if (!text || text.length > TRAINING_DOC_TEXT_MAX) throw bad('text');
        const old = await tx.aiTrainingExample.findFirst({ where: { id: input.id, kind: DOCUMENT_KIND, archivedAt: null } });
        if (!old) throw new AiError(404, 'NOT_FOUND');
        if (old.input === text) throw new AiError(409, 'NO_CHANGE');
        const at = new Date();
        const version = docVersionOf(old.sourceRef) + 1;
        await tx.aiTrainingExample.update({ where: { id: old.id }, data: { archivedAt: at } });
        const row = await tx.aiTrainingExample.create({ data: { agentKey: old.agentKey, kind: DOCUMENT_KIND, input: text, expected: old.expected, sourceRef: `doc:${version}`, createdById: by, createdAt: at } });
        await audit(tx, who.actor, { action: 'ai.training.archive', entityType: TYPE, entityId: old.id, before: { title: old.expected }, after: { archivedAt: at.toISOString() } }, ctx);
        await log('ai.training.add', row.id, { agentKey: old.agentKey, kind: DOCUMENT_KIND, title: old.expected, version });
        return;
      }
      case 'removeDoc': {
        if (typeof input.id !== 'string') throw bad('id');
        const old = await tx.aiTrainingExample.findFirst({ where: { id: input.id, kind: DOCUMENT_KIND, archivedAt: null } });
        if (!old) throw new AiError(404, 'NOT_FOUND');
        const at = new Date();
        await tx.aiTrainingExample.update({ where: { id: old.id }, data: { archivedAt: at } });
        await audit(tx, who.actor, { action: 'ai.training.archive', entityType: TYPE, entityId: old.id, before: { title: old.expected }, after: { archivedAt: at.toISOString() } }, ctx);
        return;
      }
      case 'addNote': {
        if (!validScope(input.agent)) throw bad('agent');
        const text = clean(input.text);
        if (!text || text.length > TRAINING_NOTE_MAX) throw bad('text');
        const row = await tx.aiTrainingExample.create({ data: { agentKey: input.agent, kind: NOTE_KIND, input: text, sourceRef: 'problem', createdById: by } });
        await log('ai.training.add', row.id, { agentKey: input.agent, kind: NOTE_KIND });
        return;
      }
      default:
        throw bad('action');
    }
  });
}
