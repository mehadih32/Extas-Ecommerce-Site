// PR 148 — the message engine's job and its planner (the job itself is in catalogue.ts with the others). Every store
// with messages on gets one `messages.run` per slot of `messages.engine.everySeconds`: plan the order timeline into
// queued messages, send the due ones, run the self-confirm timer (packages/messages `runMessages`). The slot is the run
// key, so a slot planned on many ticks is one run, and the engine itself never sends a step twice.
import type { MessagesDeps } from '@extas/messages';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const MESSAGES_JOB = 'messages.run';
export const MESSAGES_QUEUE = 'messages';

/** The message engine's dependencies from the worker's (the senders come from main.ts's connection layer). */
export function messagesDeps(deps: JobDeps): MessagesDeps | null {
  if (!deps.messages) return null;
  return { db: deps.db, settings: deps.settings, sender: deps.messages.sender, now: deps.now };
}

/** Each store with messages on: one run per slot of its interval. */
export const messagesPlanner: Planner = async (deps, now) => {
  if (!deps.messages) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const [on, engine] = await Promise.all([deps.settings.value('messages.enabled', { storeId: s.id }), deps.settings.value('messages.engine', { storeId: s.id })]);
    if (!on) continue;
    const payload = { storeId: s.id };
    out.push({ queue: MESSAGES_QUEUE, name: MESSAGES_JOB, payload, key: runKey(MESSAGES_JOB, payload, slotOf(now.getTime(), engine.everySeconds * 1000)) });
  }
  return out;
};
