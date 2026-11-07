// S08 · PR 184 follow-up 450 (PR 189) — a parcel the courier says is on its way back reaches the shop. Steadfast never
// says "returned", only "returning" (cancelled at the door): its order would wait in transit for ever. A person who has
// the parcel in hand presses "Back at the shop" (`delivery.outcomes`): one staff event RETURNED on the parcel (through
// the same `applyEventsIn` as every courier word, kept once per parcel), audited, and then the order follows it like
// after a read (`syncOrder`): the order service's `returned` step opens the courier's return of PR 189 (refused at the
// door, or with the delivery charge paid when the courier reported money on it), which the hand-back desk then expects.
// Only on a parcel the courier says is returning; a parcel already back is answered as it is. Nothing here moves money,
// changes COD, receives stock or refunds anyone: the return's receipt and the ERP's check stay where they are.
import type { CourierEvent } from '@extas/adapters';
import { allow, logChange, nowOf, TX, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { applyEventsIn, lockShipment, type Applied } from './events';
import { syncOrder, type Synced } from './sync';

/** What "Back at the shop" did: the parcel's events applied, then its order synced. */
export interface BackAtShop extends Applied {
  order: Synced | null;
}

/** A person says the returning parcel is in the shop's hands (see the file header). */
export async function markBackAtShop(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, who: Who, shipmentId: string): Promise<BackAtShop> {
  await allow(deps, who, 'delivery.outcomes');
  const now = nowOf(deps);
  const applied = await deps.db.$transaction(async (tx) => {
    const s = await lockShipment(tx, who.storeId, shipmentId);
    if (s.status !== 'RETURNING') throw new ShippingError('NOT_RETURNING', 'the courier does not say this parcel is on its way back', ['shipmentId'], { status: s.status });
    // the parcel in a person's hands comes after whatever the courier last said (a courier clock ahead of ours never wins)
    const last = await tx.shipmentEvent.findFirst({ where: { shipmentId: s.id }, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } });
    const at = last && last.occurredAt.getTime() >= now.getTime() ? new Date(last.occurredAt.getTime() + 1) : now;
    const event: CourierEvent = { providerEventId: `staff:backAtShop:${s.id}`, status: 'RETURNED', rawStatus: 'staff:returned', occurredAt: at, note: null, reasonKey: null, codCollectedMinor: null, chargeMinor: null };
    const r = await applyEventsIn(tx, { storeId: who.storeId, shipmentId }, [event], 'staff', { now, actorId: who.actor.staffUserId });
    await logChange(tx, who, 'shipment.backAtShop', 'Shipment', shipmentId, { status: r.from }, { status: r.status });
    return r;
  }, TX);
  return { ...applied, order: await syncOrder(deps, { storeId: who.storeId, shipmentId }) };
}
