// PR 176 (§7.4 status polling) — reading the parcels the couriers hold. The worker's `courier.track` job (packages/jobs
// courier.ts) runs `trackParcels` per store: the parcels still with a courier (ACTIVE_STATES) that it has not read for
// the owner's `everyMinutes`, oldest read first, up to `batch`; each courier's adapter answers in its own words, and the
// events go through `applyEvents` (stored once, state worked out again, exceptions shown at once — SIM-F-017). A courier
// that cannot be reached for one parcel does not stop the others; that parcel is read again next time. Staff can read one
// parcel now (`trackParcel`). Reading never moves money.
//
// PR 184: after each read the parcel's order follows it through the order service (sync.ts `syncOrder`: in transit,
// delivered, returned …), and each run then catches up the orders still behind their parcel (`syncLagging`).
import type { CourierApi } from '@extas/adapters';
import { courierApi } from './accounts';
import { allow, nowOf, setting, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { applyEvents, type Applied } from './events';
import { ACTIVE_STATES, isException } from './pure';
import { syncLagging, syncOrder, type Synced } from './sync';

const TRACK_SELECT = { id: true, consignmentId: true, trackingCode: true, merchantRef: true, providerStatus: true, courierAccount: { select: { providerKey: true } } } as const;

interface Tracked {
  id: string;
  consignmentId: string | null;
  trackingCode: string | null;
  merchantRef: string | null;
  providerStatus: string | null;
  courierAccount: { providerKey: string };
}

/** What one read did: the parcel's events applied, then its order synced (PR 184). */
export interface Read extends Applied {
  order: Synced | null;
}

async function readOne(deps: ShippingDeps, storeId: number, api: CourierApi, s: Tracked): Promise<Read> {
  const events = await api.track({ consignmentId: s.consignmentId, trackingCode: s.trackingCode, merchantRef: s.merchantRef, lastRawStatus: s.providerStatus });
  const applied = await applyEvents(deps, { storeId, shipmentId: s.id }, events, 'poll');
  return { ...applied, order: await syncOrder(deps, { storeId, shipmentId: s.id }) };
}

export interface TrackRun {
  /** Tracking is switched off in the owner's settings: nothing was read. */
  off: boolean;
  read: number;
  changed: number;
  exceptions: number;
  failed: number;
  /** Why the first failure failed (the rest are counted). */
  firstError: string | null;
  /** PR 184: orders moved on after their parcel's read, and orders caught up that were behind their parcel. */
  ordersMoved: number;
  caughtUp: number;
}

/** One store's due parcels read from their couriers (the worker's job). */
export async function trackParcels(deps: ShippingDeps, storeId: number): Promise<TrackRun> {
  const cfg = await setting(deps, storeId, 'delivery.courier.tracking');
  const run: TrackRun = { off: !cfg.enabled, read: 0, changed: 0, exceptions: 0, failed: 0, firstError: null, ordersMoved: 0, caughtUp: 0 };
  if (!cfg.enabled) return run;
  const now = nowOf(deps);
  const due = new Date(now.getTime() - cfg.everyMinutes * 60_000);
  const rows = await deps.db.shipment.findMany({
    where: {
      storeId,
      status: { in: [...ACTIVE_STATES] },
      OR: [{ consignmentId: { not: null } }, { merchantRef: { not: null } }],
      AND: [{ OR: [{ lastTrackedAt: null }, { lastTrackedAt: { lte: due } }] }],
    },
    select: TRACK_SELECT,
    orderBy: [{ lastTrackedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    take: cfg.batch,
  });
  const apis = new Map<string, CourierApi>();
  for (const s of rows) {
    try {
      let api = apis.get(s.courierAccount.providerKey);
      if (!api) apis.set(s.courierAccount.providerKey, (api = (await courierApi(deps, storeId, s.courierAccount.providerKey)).api));
      const r = await readOne(deps, storeId, api, s);
      run.read += 1;
      if (r.changed) run.changed += 1;
      if (r.changed && isException(r.status)) run.exceptions += 1;
      if (r.order?.moved.length) run.ordersMoved += 1;
    } catch (e) {
      run.failed += 1;
      run.firstError ??= `${s.courierAccount.providerKey}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
      // read again next time, not on every tick
      await deps.db.shipment.update({ where: { id: s.id }, data: { lastTrackedAt: now } });
    }
  }
  run.caughtUp = (await syncLagging(deps, storeId, cfg.batch)).moved;
  return run;
}

/** Staff read one parcel from its courier now (its order follows, PR 184). */
export async function trackParcel(deps: ShippingDeps, who: Who, shipmentId: string): Promise<Read> {
  await allow(deps, who, 'delivery.parcels');
  const s = await deps.db.shipment.findFirst({ where: { id: shipmentId, storeId: who.storeId }, select: { ...TRACK_SELECT, status: true } });
  if (!s) throw new ShippingError('NOT_FOUND', 'no such parcel', ['shipmentId']);
  if (!(ACTIVE_STATES as readonly string[]).includes(s.status) || (!s.consignmentId && !s.merchantRef)) throw new ShippingError('NOT_ACTIVE', 'the courier does not hold this parcel now', ['shipmentId'], { status: s.status });
  const { api } = await courierApi(deps, who.storeId, s.courierAccount.providerKey);
  return readOne(deps, who.storeId, api, s);
}
