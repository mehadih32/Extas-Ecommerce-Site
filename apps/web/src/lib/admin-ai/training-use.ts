// PR 820 (prototype v5 m-ai.js Training: the "Use" switch beside each correction and each extra document) — the owner can stop using a
// training correction or a reference document without removing it. The row stays exactly as it is (rows are never edited or deleted);
// the ids that are switched off live in the one setting `ai.trainingOff`, written through the settings history with who and why.
// "Try it" leaves a switched-off document out of what the agent is shown. Every write needs `ai.control` (checked by the route).
import type { Actor, RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { INSTALLATION, TRAINING_OFF_MAX } from '@extas/settings';
import type { AppResolver } from '../settings';
import { AiError } from './errors';
import { CORRECTION_KIND } from './training';

const DOCUMENT_KIND = 'document'; // same word as training-extras.ts (kept here so this file needs nothing from it)

export interface UseDeps {
  db: Pick<PrismaClient, 'aiTrainingExample'>;
  resolver: Pick<AppResolver, 'value' | 'set'>;
}

/** The ids the owner switched off (empty when nothing is). */
export async function trainingOffIds(resolver: Pick<AppResolver, 'value'>): Promise<Set<string>> {
  const v = await resolver.value('ai.trainingOff', { storeId: MOTHER_STORE_ID });
  return new Set(v.ids);
}

/** The new list of switched-off ids after turning one row on or off; the same array when nothing changed. */
export function nextOff(ids: readonly string[], id: string, on: boolean): string[] {
  const has = ids.includes(id);
  if (on && !has) return [...ids];
  if (!on && has) return [...ids];
  return on ? ids.filter((x) => x !== id) : [...ids, id];
}

export async function setTrainingUse(deps: UseDeps, who: { actor: Actor; ctx?: RequestContext }, input: unknown): Promise<void> {
  const b = typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  if (typeof b.id !== 'string' || !b.id) throw new AiError(400, 'INVALID_INPUT', ['id']);
  if (typeof b.on !== 'boolean') throw new AiError(400, 'INVALID_INPUT', ['on']);
  const row = await deps.db.aiTrainingExample.findFirst({ where: { id: b.id, archivedAt: null, kind: { in: [CORRECTION_KIND, DOCUMENT_KIND] } }, select: { id: true, kind: true } });
  if (!row) throw new AiError(404, 'NOT_FOUND', ['id']);
  const cur = await deps.resolver.value('ai.trainingOff', { storeId: MOTHER_STORE_ID });
  const ids = nextOff(cur.ids, row.id, b.on);
  if (ids.length === cur.ids.length && ids.every((x) => cur.ids.includes(x))) return;
  if (ids.length > TRAINING_OFF_MAX) throw new AiError(409, 'FULL');
  await deps.resolver.set('ai.trainingOff', { ids }, INSTALLATION, {
    actorId: who.actor.staffUserId ?? null,
    reason: `AI › Training: ${row.kind === DOCUMENT_KIND ? 'document' : 'correction'} ${b.on ? 'used again' : 'switched off'}`,
  });
}
