// S28 · PR 691 — "Exchanges waiting" in Home's Do now: exchanges asked for and not yet answered, oldest first, for people who may open Orders.
import { describe, expect, it } from 'vitest';
import dash from '../../../messages/admin-shell.bn.json';
import dashEn from '../../../messages/admin-shell.en.json';
import { exchangesWaiting, QUEUES, visibleQueues } from './queues';
import type { ShellViewer } from './sections';

describe('PR 691 · exchange requests waiting', () => {
  it('counts only REQUESTED exchanges of the store and gives the oldest', async () => {
    const seen: unknown[] = [];
    const db = {
      exchange: {
        count: async (a: unknown) => (seen.push(a), 3),
        findFirst: async (a: unknown) => (seen.push(a), { createdAt: new Date('2026-11-10T04:00:00Z') }),
      },
    };
    expect(await exchangesWaiting(db as never, 7)).toEqual({ n: 3, oldest: new Date('2026-11-10T04:00:00Z') });
    expect(seen[0]).toEqual({ where: { storeId: 7, status: 'REQUESTED' } });
    expect(await exchangesWaiting({ exchange: { count: async () => 0, findFirst: async () => null } } as never, 7)).toEqual({ n: 0, oldest: null });
  });
  it('is a line in Do now under Orders, no badge, for those who may read orders; it has its words in both languages', () => {
    expect(QUEUES.find((q) => q.id === 'exchangesRequested')).toMatchObject({ perm: 'orders.read', href: '/admin/orders/returns', section: 'orders', badge: false, group: 'orders' });
    const counts = [{ id: 'exchangesRequested' as const, n: 2, oldest: null }];
    const reader: ShellViewer = { perms: new Set(['orders.read']), owner: false, hidden: new Set() };
    expect(visibleQueues(counts, reader).map((r) => r.id)).toEqual(['exchangesRequested']);
    expect(visibleQueues(counts, { perms: new Set(), owner: false, hidden: new Set() })).toEqual([]);
    expect((dashEn as { dash: { queue: Record<string, string> } }).dash.queue.exchangesRequested).toBeTruthy();
    expect((dash as { dash: { queue: Record<string, string> } }).dash.queue.exchangesRequested).toBeTruthy();
  });
});
