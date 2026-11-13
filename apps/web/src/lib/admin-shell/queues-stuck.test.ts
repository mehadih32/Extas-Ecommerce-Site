// S28 · PR 691 — Home's Do now: "Orders stuck in this batch" (a new order that waited longer than the owner's hours or has an open
// risk alert) and "Courier entry mismatch" (packed here, no courier booking entered). Real queries over the orders and parcels.
import { describe, expect, it } from 'vitest';
import dash from '../../../messages/admin-shell.bn.json';
import dashEn from '../../../messages/admin-shell.en.json';
import { courierMismatch, QUEUES, stuckOrders } from './queues';

const now = new Date('2026-11-13T12:00:00Z');

describe('PR 691 · stuck batch and courier mismatch', () => {
  it('stuck = a PLACED order older than the hours, or with an open risk alert; the oldest is given', async () => {
    const seen: { where: unknown }[] = [];
    const db = {
      fraudAlert: { findMany: async () => [{ orderId: 'a' }, { orderId: 'a' }, { orderId: 'b' }] },
      order: {
        count: async (a: { where: unknown }) => (seen.push(a), 4),
        findFirst: async (a: { where: unknown }) => (seen.push(a), { placedAt: new Date('2026-11-10T00:00:00Z') }),
      },
    };
    expect(await stuckOrders(db as never, 7, now, 36)).toEqual({ n: 4, oldest: new Date('2026-11-10T00:00:00Z') });
    const w = seen[0]!.where as { storeId: number; status: string; archivedAt: null; OR: unknown[] };
    expect(w).toMatchObject({ storeId: 7, status: 'PLACED', archivedAt: null });
    expect(w.OR).toEqual([{ placedAt: { lt: new Date('2026-11-12T00:00:00Z') } }, { id: { in: ['a', 'b'] } }]);
  });
  it('an owner who sets 0 hours turns the age rule off; only open risk alerts count', async () => {
    const seen: { where: { OR: unknown[] } }[] = [];
    const db = { fraudAlert: { findMany: async () => [] }, order: { count: async (a: never) => (seen.push(a), 0), findFirst: async () => null } };
    expect(await stuckOrders(db as never, 7, now, 0)).toEqual({ n: 0, oldest: null });
    expect(seen).toHaveLength(0); // nothing to match: no query at all
  });
  it('mismatch = PACKED, not archived, with no parcel that has a consignment', async () => {
    const seen: unknown[] = [];
    const db = { order: { count: async (a: unknown) => (seen.push(a), 2), findFirst: async (a: unknown) => (seen.push(a), { packedAt: new Date('2026-11-12T08:00:00Z') }) } };
    expect(await courierMismatch(db as never, 7)).toEqual({ n: 2, oldest: new Date('2026-11-12T08:00:00Z') });
    expect((seen[0] as { where: unknown }).where).toEqual({ storeId: 7, archivedAt: null, status: 'PACKED', shipments: { none: { consignmentId: { not: null } } } });
  });
  it('both are lines of Home for Orders readers with words in both languages', () => {
    for (const id of ['batchStuck', 'courierMismatch']) {
      expect(QUEUES.find((q) => q.id === id), id).toMatchObject({ perm: 'orders.read', section: 'orders', badge: false });
      expect((dashEn as { dash: { queue: Record<string, string> } }).dash.queue[id], id).toBeTruthy();
      expect((dash as { dash: { queue: Record<string, string> } }).dash.queue[id], id).toBeTruthy();
    }
  });
});
