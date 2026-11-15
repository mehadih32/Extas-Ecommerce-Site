// PR 845 — the ERP connection's sync board: streams and the activity log are shaped from the rows the server wrote.
import { describe, expect, it } from 'vitest';
import { eventKind, pushKind, runKind, shapeSyncBoard } from './erp-sync-board';

const now = new Date('2026-11-15T12:00:00Z');
const h = (n: number) => new Date(now.getTime() - n * 3_600_000);

describe('shapeSyncBoard (PR 845)', () => {
  it('names the kind of a document, an event and a run', () => {
    expect(pushKind('order.created')).toBe('order');
    expect(pushKind('shipment.sent')).toBe('bill');
    expect(eventKind('return.approved')).toBe('return');
    expect(runKind('stock.poll')).toBe('stock');
  });
  it('counts what went today, what failed in 24 hours and the next stock run', () => {
    const b = shapeSyncBoard({
      pushes: [
        { documentType: 'order.created', status: 'SENT', sentAt: h(2), updatedAt: h(2), referenceId: 'abcdefghij', lastError: null },
        { documentType: 'order.created', status: 'FAILED', sentAt: null, updatedAt: h(1), referenceId: 'zzzzzzzzzz', lastError: 'boom' },
        { documentType: 'order.created', status: 'SENT', sentAt: h(50), updatedAt: h(50), referenceId: 'old', lastError: null },
      ],
      events: [],
      runs: [{ kind: 'stock', status: 'SUCCEEDED', itemsOk: 12, itemsFailed: 0, error: null, startedAt: h(1) }],
      states: [],
      now,
      pollMinutes: 15,
      logSize: 10,
    });
    const order = b.streams.find((s) => s.key === 'order')!;
    expect(order.items).toEqual({ what: 'sentToday', n: 1 });
    expect(order.failed24).toBe(1);
    const stock = b.streams.find((s) => s.key === 'stock')!;
    expect(stock.items.n).toBe(12);
    expect(stock.nextAt).toBe(new Date(h(1).getTime() + 15 * 60_000).toISOString());
    expect(b.streams).toHaveLength(7);
    expect(b.log[0]!.at >= b.log[1]!.at).toBe(true);
    expect(b.log.find((r) => r.status === 'FAILED')!.ok).toBe(false);
  });
  it('keeps only the newest rows asked for', () => {
    const pushes = Array.from({ length: 5 }, (_, i) => ({ documentType: 'order.created', status: 'SENT', sentAt: h(i), updatedAt: h(i), referenceId: `r${i}`, lastError: null }));
    expect(shapeSyncBoard({ pushes, events: [], runs: [], states: [], now, pollMinutes: 0, logSize: 3 }).log).toHaveLength(3);
  });
});
