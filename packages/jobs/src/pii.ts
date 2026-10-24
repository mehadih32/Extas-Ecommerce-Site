// S06 · PR 159 — the 180-day rule (Blueprint B6.4, BACKEND-ARCHITECTURE §8.7): the IP, the device id and the shared
// location an order kept for the risk checks are cleared once the owner's `risk.capture.retentionDays` have passed
// (or the day stored on the order, `piiExpiresAt`, has come — whichever is first, so a shorter rule applies to old
// orders too). Only those four fields change (and the identity graph's IP and device links of PR 519 go); the order,
// its money and its history stay exactly as they are. Every store with orders gets one `orders.pii.purge` per slot of
// `risk.capture.purgeEveryMinutes`; the slot is the run key.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import type { PrismaClient } from '@extas/db/client';
import { nowOf, type JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const PII_PURGE_JOB = 'orders.pii.purge';
export const PII_QUEUE = 'privacy';

const DAY = 86_400_000;
const MINUTE = 60_000;

/** The four fields cleared, and the orders still holding any of them. */
const CLEARED = { ip: null, deviceId: null, gpsLat: null, gpsLng: null, piiExpiresAt: null } as const;
const HOLDS_ANY = [{ ip: { not: null } }, { deviceId: { not: null } }, { gpsLat: { not: null } }, { gpsLng: { not: null } }, { piiExpiresAt: { not: null } }];

/**
 * Clears the kept facts of one store's orders past the owner's days. Safe to run twice (a cleared order matches no
 * more). PR 519: the identity graph's IP and device links go with them (the same day rule); its phone, name and
 * address links stay, as the order's own fields do.
 */
export async function purgeOrderPii(db: Pick<PrismaClient, 'order' | 'identityLink'>, storeId: number, now: Date, retentionDays: number): Promise<{ cleared: number; links: number; before: string }> {
  const before = new Date(now.getTime() - retentionDays * DAY);
  const r = await db.order.updateMany({
    where: { storeId, AND: [{ OR: [{ piiExpiresAt: { lte: now } }, { placedAt: { lt: before } }] }, { OR: HOLDS_ANY }] },
    data: CLEARED,
  });
  const links = await db.identityLink.deleteMany({ where: { storeId, kind: { in: ['IP', 'DEVICE'] }, OR: [{ expiresAt: { lte: now } }, { firstSeenAt: { lt: before } }] } });
  return { cleared: r.count, links: links.count, before: before.toISOString() };
}

/** One store's purge, with the owner's days read when it runs. */
export async function runPiiPurge(deps: JobDeps, storeId: number): Promise<{ cleared: number; links: number; before: string; retentionDays: number }> {
  const cap = await deps.settings.value('risk.capture', { storeId });
  const now = nowOf(deps);
  return { ...(await purgeOrderPii(deps.db, storeId, now, cap.retentionDays)), retentionDays: cap.retentionDays };
}

/** Each live store: one purge per slot of its `purgeEveryMinutes`. */
export const piiPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const cap = await deps.settings.value('risk.capture', { storeId: s.id });
    const payload = { storeId: s.id };
    out.push({ queue: PII_QUEUE, name: PII_PURGE_JOB, payload, key: runKey(PII_PURGE_JOB, payload, slotOf(now.getTime(), cap.purgeEveryMinutes * MINUTE)) });
  }
  return out;
};
