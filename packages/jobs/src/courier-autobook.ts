// PR 1010 (Settings › Couriers › Auto-booking) — when the owner has switched auto-booking on (`delivery.courier.autoBook`, off as shipped),
// the packed orders that wait for a courier are booked with the default courier, the same as pressing "Book all". The booking runs in
// the name of the person who switched it on, so their permission (`delivery.book`) is checked on every run: a person who lost it stops
// the booking (the run says so; nothing is booked). A courier that is switched off is never used. Planned once per slot of
// `everyMinutes` for a store with it on; the slot is the run key, so a slot planned twice is one run. Nothing is booked twice: a
// booked order leaves the "ready to book" list (packages/shipping booking.ts).
import { defaultCourierIdOf, bookOrders, isShippingError } from '@extas/shipping';
import type { JobDeps } from './context';
import { courierDeps } from './courier';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const COURIER_AUTOBOOK_JOB = 'courier.autobook';
const COURIER_QUEUE_NAME = 'courier';
const MINUTE = 60_000;

/** Each live store with auto-booking on: one run per slot of its interval. */
export const courierAutoBookPlanner: Planner = async (deps, now) => {
  if (!deps.couriers) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const cfg = await deps.settings.value('delivery.courier.autoBook', { storeId: s.id });
    if (!cfg.enabled || !cfg.byStaffId) continue;
    const payload = { storeId: s.id };
    out.push({ queue: COURIER_QUEUE_NAME, name: COURIER_AUTOBOOK_JOB, payload, key: runKey(COURIER_AUTOBOOK_JOB, payload, slotOf(now.getTime(), cfg.everyMinutes * MINUTE)) });
  }
  return out;
};

/** One store's run: the default courier takes every packed order that waits (up to the booking card's own "per run" limit). */
export async function runCourierAutoBook(deps: JobDeps, storeId: number): Promise<{ ok: true; stats: Record<string, unknown> }> {
  const sd = courierDeps(deps);
  if (!sd) return { ok: true, stats: { skipped: 'no couriers' } };
  const cfg = await deps.settings.value('delivery.courier.autoBook', { storeId });
  if (!cfg.enabled || !cfg.byStaffId) return { ok: true, stats: { skipped: 'off' } };
  const [rows, setup] = await Promise.all([
    deps.db.courierAccount.findMany({ where: { storeId, archivedAt: null }, select: { id: true, providerKey: true, name: true, enabled: true, archivedAt: true } }),
    deps.settings.value('delivery.couriers', { storeId }),
  ]);
  const id = defaultCourierIdOf(rows, setup.defaultCourierId);
  const courier = rows.find((r) => r.id === id);
  if (!courier || !courier.enabled) return { ok: true, stats: { skipped: 'default courier is off' } };
  try {
    const run = await bookOrders(sd, { actor: { staffUserId: cfg.byStaffId }, storeId }, { courierAccountId: courier.id, all: true });
    return { ok: true, stats: { ...run.counts, left: run.left } };
  } catch (e) {
    // a person who lost the permission, or a store that is gone: nothing is booked, and the run says why
    if (isShippingError(e)) return { ok: true, stats: { skipped: e.code } };
    throw e;
  }
}
