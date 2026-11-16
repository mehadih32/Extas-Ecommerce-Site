// S28 · PR 1037 — the add-product wizard's scheduled publish: a draft the owner scheduled ("Publish at …") goes on the shop when its time
// comes. A store with such a product due gets one `catalogue.wizard.publish` run per five minutes; each product goes through the same
// rules as "Publish now" (the readiness checklist), and a product that no longer passes stays a draft and is left for the owner.
// This module imports `./keys`, never `./scheduler`.
import { runScheduledPublish } from '@extas/catalogue';
import { SYSTEM } from '@extas/auth';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const WIZARD_PUBLISH_JOB = 'catalogue.wizard.publish';
export const WIZARD_PUBLISH_QUEUE = 'catalogue';

const SLOT_MS = 300_000;

export function runWizardPublishJob(deps: JobDeps, storeId: number): Promise<{ due: number; published: number; failed: string[] }> {
  return runScheduledPublish({ db: deps.db, settings: deps.settings, ...(deps.now ? { now: deps.now } : {}) }, { actor: SYSTEM, storeId, ctx: { source: 'job' } });
}

/** One run per store with a scheduled product that is due. */
export const wizardPublishPlanner: Planner = async (deps, now) => {
  const specs = await deps.db.productWizardSpec.findMany({ where: { scheduleAt: { lte: now } }, select: { storeId: true, productId: true }, take: 500 }); // hardcode-ok: a page of due products
  const live = specs.length ? await deps.db.product.findMany({ where: { id: { in: specs.map((x) => x.productId) }, status: 'READY_TO_PUBLISH', archivedAt: null }, select: { id: true } }) : [];
  const ids = new Set(live.map((x) => x.id));
  const due = [...new Set(specs.filter((x) => ids.has(x.productId)).map((x) => x.storeId))].map((storeId) => ({ storeId }));
  return due.map((s) => {
    const payload = { storeId: s.storeId };
    return { queue: WIZARD_PUBLISH_QUEUE, name: WIZARD_PUBLISH_JOB, payload, key: runKey(WIZARD_PUBLISH_JOB, payload, slotOf(now.getTime(), SLOT_MS)) };
  });
};
