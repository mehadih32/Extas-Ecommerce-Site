// PR 196 — the leader's planner for ERP webhooks: on every tick, the stored events still waiting (RECEIVED, at most
// `erp.webhook.batchSize`, received within `erp.webhook.dedupeHours`) go on the inventory queue, one job per event.
// The job id is the event, so planning one event on many ticks adds it once; the run-level idempotency (runs.ts) and
// the event's own status keep it to one application. An event older than the window that never got handled is left
// to the stock poll, which covers every missed webhook anyway.
import { ERP_WEBHOOK_JOB, INVENTORY_QUEUE, waitingErpWebhooks } from '@extas/inventory';
import type { Planner } from './worker';

export const webhookRunKey = (eventId: string): string => `${ERP_WEBHOOK_JOB}/-/${eventId}`;

export const webhookPlanner: Planner = async (deps, now) => {
  const ids = await waitingErpWebhooks({ db: deps.db, settings: deps.settings, now: () => now });
  return ids.map((eventId) => ({ queue: INVENTORY_QUEUE, name: ERP_WEBHOOK_JOB, payload: { eventId }, key: webhookRunKey(eventId) }));
};
