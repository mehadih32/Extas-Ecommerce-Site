// Follow-up 372 — the couriers' own status calls read into the same events a poll gives: Steadfast's bearer token and
// Pathao's signature header, their words through the same status tables (an unknown word kept raw), the same call
// giving the same key (stored once), calls that are not a parcel's step ignored, Pathao's set-up check. Made-up values.
import { describe, expect, it } from 'vitest';
import { COURIER_WEBHOOKS, courierWebhookOf, pathaoWebhook, steadfastWebhook } from '../src';

const NOW = new Date('2026-11-07T06:00:00Z');
const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe('follow-up 372 · courier webhooks (pure)', () => {
  it('knows Steadfast and Pathao only', () => {
    expect(Object.keys(COURIER_WEBHOOKS).sort()).toEqual(['pathao', 'steadfast']);
    expect(courierWebhookOf('mockCourier')).toBeNull();
    expect(courierWebhookOf('__proto__')).toBeNull();
  });

  it("Steadfast: the bearer token; a delivery_status in its read's words, money recorded only on a door outcome", () => {
    expect(steadfastWebhook.credential(headers({ authorization: 'Bearer tok-123' }))).toBe('tok-123');
    expect(steadfastWebhook.credential(headers({ authorization: 'Basic tok-123' }))).toBeNull();
    expect(steadfastWebhook.credential(headers({}))).toBeNull();
    const body = { notification_type: 'delivery_status', consignment_id: 1234567, invoice: 'EX-1001-1', cod_amount: 1450, status: 'Delivered', delivery_charge: 70, tracking_message: 'Handed to the customer', updated_at: '2026-11-07 12:01:02' };
    const w = steadfastWebhook.parse(body, NOW);
    expect(w).toMatchObject({ kind: 'event', consignmentId: '1234567', merchantRef: 'EX-1001-1', key: '1234567:delivered:2026-11-07 12:01:02' });
    if (w.kind !== 'event') throw new Error('event');
    expect(w.event).toMatchObject({ status: 'DELIVERED', rawStatus: 'delivered', codCollectedMinor: 145000, chargeMinor: 7000, note: 'Handed to the customer' });
    // a local time with no zone is never guessed: the time it arrived
    expect(w.event.occurredAt).toEqual(NOW);
    // the same call twice: the same key and event id
    const again = steadfastWebhook.parse(body, new Date(NOW.getTime() + 60_000));
    expect(again.kind === 'event' && again.key === w.key && again.event.providerEventId === w.event.providerEventId).toBe(true);
    const moving = steadfastWebhook.parse({ ...body, status: 'pending' }, NOW);
    expect(moving.kind === 'event' && moving.event).toMatchObject({ status: 'IN_TRANSIT', codCollectedMinor: null });
    const hold = steadfastWebhook.parse({ ...body, status: 'hold' }, NOW);
    expect(hold.kind === 'event' && hold.event).toMatchObject({ status: 'ATTEMPT_FAILED', reasonKey: 'receiverAskedLater' });
    const odd = steadfastWebhook.parse({ ...body, status: 'Something New' }, NOW);
    expect(odd.kind === 'event' && odd.event).toMatchObject({ status: null, rawStatus: 'something_new' });
  });

  it('Steadfast: a tracking message is ignored; a call with no status or no parcel is bad', () => {
    expect(steadfastWebhook.parse({ notification_type: 'tracking_update', consignment_id: 1, tracking_message: 'At the hub', updated_at: 'x' }, NOW)).toMatchObject({ kind: 'ignored', type: 'tracking_update' });
    expect(steadfastWebhook.parse({ notification_type: 'delivery_status', consignment_id: 1 }, NOW)).toMatchObject({ kind: 'bad' });
    expect(steadfastWebhook.parse({ notification_type: 'delivery_status', status: 'delivered' }, NOW)).toMatchObject({ kind: 'bad' });
    expect(steadfastWebhook.parse([1, 2], NOW)).toMatchObject({ kind: 'bad' });
    expect(steadfastWebhook.okStatus).toBe(200);
  });

  it("Pathao: the signature header; order.<step> in its read's words, the ISO timestamp kept, the set-up check", () => {
    expect(pathaoWebhook.credential(headers({ 'x-pathao-signature': 'sec-9' }))).toBe('sec-9');
    expect(pathaoWebhook.credential(headers({}))).toBeNull();
    expect(pathaoWebhook.parse({ event: 'webhook_integration' }, NOW)).toEqual({ kind: 'handshake' });
    const body = { consignment_id: 'DL071126ABC', merchant_order_id: 'EX-1002-1', updated_at: '2026-11-07 12:05:00', timestamp: '2026-11-07T06:05:00+00:00', store_id: 1, event: 'order.partial-delivery', delivery_fee: 83.46, collected_amount: 900, reason: 'Kept one shirt' };
    const w = pathaoWebhook.parse(body, NOW);
    expect(w).toMatchObject({ kind: 'event', consignmentId: 'DL071126ABC', merchantRef: 'EX-1002-1', key: 'DL071126ABC:order.partial-delivery:2026-11-07 12:05:00' });
    if (w.kind !== 'event') throw new Error('event');
    expect(w.event).toMatchObject({ status: 'PARTIALLY_DELIVERED', rawStatus: 'partial_delivery', codCollectedMinor: 90000, chargeMinor: 8346, note: 'Kept one shirt' });
    expect(w.event.occurredAt.toISOString()).toBe('2026-11-07T06:05:00.000Z');
    const steps: Record<string, string> = {
      'order.picked': 'PICKED_UP',
      'order.in-transit': 'IN_TRANSIT',
      'order.at-the-sorting-hub': 'IN_TRANSIT',
      'order.assigned-for-delivery': 'OUT_FOR_DELIVERY',
      'order.delivered': 'DELIVERED',
      'order.delivery-failed': 'ATTEMPT_FAILED',
      'order.on-hold': 'ATTEMPT_FAILED',
      'order.returned': 'RETURNING',
      'order.paid-return': 'RETURNED',
      'order.pickup-cancelled': 'CANCELLED',
    };
    for (const [event, status] of Object.entries(steps)) {
      const r = pathaoWebhook.parse({ ...body, event }, NOW);
      expect(r.kind === 'event' && r.event.status, event).toBe(status);
    }
    expect(pathaoWebhook.okStatus).toBe(202);
  });

  it('Pathao: created / updated / paid are not steps; a call with no event or no parcel is bad', () => {
    for (const event of ['order.created', 'order.updated', 'order.paid', 'order.exchanged', 'store.created']) expect(pathaoWebhook.parse({ event, consignment_id: 'X' }, NOW).kind, event).toBe('ignored');
    expect(pathaoWebhook.parse({ consignment_id: 'X' }, NOW)).toMatchObject({ kind: 'bad' });
    expect(pathaoWebhook.parse({ event: 'order.delivered' }, NOW)).toMatchObject({ kind: 'bad' });
    const odd = pathaoWebhook.parse({ event: 'order.lost-in-space', consignment_id: 'X' }, NOW);
    expect(odd.kind === 'event' && odd.event).toMatchObject({ status: null, rawStatus: 'lost_in_space' });
  });
});
