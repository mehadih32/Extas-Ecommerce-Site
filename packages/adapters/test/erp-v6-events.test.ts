// PR 608 (CN-028): reading the v6 events — by webhook body, by `X-Extas-Delivery`, and as the pulls return them —
// and which of them move money (the contract's permanent filter). The practice ERP's own events read back whole.
import { describe, expect, it } from 'vitest';
import { ERP_V6_EVENT_TYPES, isErpV6EventType, mockErp, movesMoney, parseErpV6Event } from '../src';

const T0 = new Date('2026-10-23T04:00:00Z');

describe('PR 608 · v6 events', () => {
  it('names every v6 event type and leaves stock and variant events to the PR 196 path', () => {
    expect(ERP_V6_EVENT_TYPES).toHaveLength(14);
    expect(isErpV6EventType('return.piece.decided')).toBe(true);
    expect(parseErpV6Event({ id: 'e1', type: 'stock.changed', data: {} })).toEqual({ ok: false, reason: 'NOT_V6', type: 'stock.changed' });
    expect(parseErpV6Event('not an object')).toEqual({ ok: false, reason: 'NOT_V6', type: null });
  });

  it('reads the event id from the body (eventId or id) or from X-Extas-Delivery, and the business date and reverses', () => {
    const a = parseErpV6Event({ eventId: 'evt-1', type: 'payment.recorded', occurredAt: T0.toISOString(), date: '2026-10-23', data: { amount: '5000.00' } });
    expect(a).toEqual({ ok: true, event: { eventId: 'evt-1', type: 'payment.recorded', occurredAt: T0, date: '2026-10-23', reverses: null, data: { amount: '5000.00' } } });
    const b = parseErpV6Event({ id: 'evt-2', type: 'account.released', data: {} });
    expect(b.ok && b.event.eventId).toBe('evt-2');
    const c = parseErpV6Event({ type: 'account.released', data: {} }, 'evt-3');
    expect(c.ok && c.event.eventId).toBe('evt-3');
    expect(parseErpV6Event({ type: 'account.released', data: {} })).toMatchObject({ ok: false, reason: 'BAD_PAYLOAD', detail: 'eventId: missing' });
    const r = parseErpV6Event({ eventId: 'evt-4', type: 'return.piece.decided', reverses: 'evt-0', data: { externalOrderId: 'SAMPLE-1', lineId: 'L1', decision: 'DECLINED', reason: 'B_GRADE', credit: 0 } });
    expect(r.ok && [r.event.reverses, r.event.data.credit]).toEqual(['evt-0', '0']);
  });

  it('a broken event is named, never thrown', () => {
    const bad = parseErpV6Event({ eventId: 'evt-5', type: 'return.piece.decided', data: { externalOrderId: 'SAMPLE-1', lineId: 'L1', decision: 'MAYBE' } });
    expect(bad).toMatchObject({ ok: false, reason: 'BAD_PAYLOAD', eventId: 'evt-5', type: 'return.piece.decided' });
    expect(parseErpV6Event({ eventId: 'evt-6', type: 'exchange.settled', data: { exchangeId: 'X1', amount: '50', kind: 'SOMETIMES' } })).toMatchObject({ ok: false, reason: 'BAD_PAYLOAD' });
    expect(parseErpV6Event({ eventId: 'evt-7', type: 'summary.missing', data: { dates: [] } })).toMatchObject({ ok: false, reason: 'BAD_PAYLOAD' });
  });

  it('marks the events the books must never lose: approved pieces, corrections, payments and every exchange event', () => {
    const ev = (type: string, data: Record<string, unknown> = {}, reverses: string | null = null) => ({ type, data, reverses });
    expect(movesMoney(ev('return.piece.decided', { decision: 'APPROVED' }))).toBe(true);
    expect(movesMoney(ev('return.piece.decided', { decision: 'APPROVED_AT_PACKING' }))).toBe(true);
    expect(movesMoney(ev('return.piece.decided', { decision: 'DECLINED' }))).toBe(false);
    expect(movesMoney(ev('return.piece.decided', { decision: 'DECLINED' }, 'evt-0'))).toBe(true);
    expect(movesMoney(ev('payment.recorded'))).toBe(true);
    for (const t of ['exchange.billed', 'exchange.settled', 'exchange.credited', 'exchange.cancelled']) expect(movesMoney(ev(t)), t).toBe(true);
    expect(movesMoney(ev('delivery.identified'))).toBe(false);
    expect(movesMoney(ev('account.hold'))).toBe(false);
  });

  it('reads back every event the practice ERP sends, by webhook body and as signed with its delivery header', () => {
    const world = mockErp();
    world.reset();
    world.now = () => T0;
    const v6 = world.v6();
    v6.hold('PRACTICE');
    v6.release();
    v6.recordPayment(1000);
    const hooks = world.v6Webhooks('sample-secret');
    expect(hooks.map((h) => h.type)).toEqual(['account.hold', 'account.released', 'payment.recorded']);
    for (const h of hooks) {
      expect(h.headers['x-extas-delivery']).toBe(h.id);
      const p = parseErpV6Event(JSON.parse(h.body), h.headers['x-extas-delivery']);
      expect(p.ok && p.event.eventId, h.type).toBe(h.id);
      expect(p.ok && p.event.date).toBe('2026-10-23');
    }
  });
});
