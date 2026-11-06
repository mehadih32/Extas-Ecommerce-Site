// Follow-up 509 (PR 425, 431) — Support in "Needs you now" and the sidebar: customers waiting for an answer (open chats
// with a waiting time, the longest first — the Support badge) and chats whose answer timer ran out (PR 431's Late
// view); blocked people's chats, solved and waiting-for-customer chats and another store's never count. On a throwaway
// PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { badgesFrom, countQueues, QUEUES, visibleQueues, type QueueDeps } from './queues';
import type { ShellViewer } from './sections';

describe.skipIf(!HAS_TEST_DB)('follow-up 509 · Support in "Needs you now" (PostgreSQL)', () => {
  let t: TestDatabase;
  let deps: QueueDeps;
  let S = 0;
  let other = 0;
  const now = new Date('2026-11-06T10:00:00.000Z');
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  let n = 0;
  async function chat(storeId: number, status: 'OPEN' | 'WAITING' | 'SOLVED', waitingSince: Date | null, opts: { late?: boolean; blocked?: boolean } = {}) {
    n += 1;
    const channel = await t.prisma.supportChannel.upsert({ where: { storeId_kind_externalId: { storeId, kind: 'whatsapp', externalId: `q509-${storeId}` } }, update: {}, create: { storeId, kind: 'whatsapp', externalId: `q509-${storeId}`, name: 'Sample', enabled: true } });
    const contact = await t.prisma.supportContact.create({ data: { storeId, channelKind: 'whatsapp', externalId: `c509-${n}`, ...(opts.blocked ? { blockedAt: minsAgo(500) } : {}) } });
    await t.prisma.conversation.create({ data: { storeId, channelId: channel.id, contactId: contact.id, status, refCode: `Q509${n}`, tags: [], waitingSince, ...(opts.late ? { slaDueAt: minsAgo(5) } : {}) } });
  }

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_q509');
    [S, other] = await seedSampleStores(t.prisma);
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, settings: { value: (key: string, scope?: { storeId?: number | null }) => resolver.value(key as never, scope as never) }, now: () => now };
    await chat(S, 'OPEN', minsAgo(40), { late: true });
    await chat(S, 'OPEN', minsAgo(10));
    await chat(S, 'OPEN', null); // the team answered: nobody waits
    await chat(S, 'WAITING', minsAgo(90));
    await chat(S, 'SOLVED', minsAgo(120));
    await chat(S, 'OPEN', minsAgo(300), { late: true, blocked: true });
    await chat(other, 'OPEN', minsAgo(600), { late: true });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('two rows under Messages for those who may read support; only "waiting" counts in the Support badge', () => {
    expect(QUEUES.find((q) => q.id === 'supportWaiting')).toMatchObject({ perm: 'support.read', href: '/admin/support', section: 'support', tone: 'warn', badge: true, group: 'messages' });
    expect(QUEUES.find((q) => q.id === 'supportLate')).toMatchObject({ perm: 'support.read', href: '/admin/support?view=late', section: 'support', tone: 'bad', badge: false, group: 'messages' });
  });

  it('counts customers waiting (longest first) and late chats of this store only, never blocked, solved or waiting-for-customer chats', async () => {
    const counts = await countQueues(deps, S);
    expect(counts.find((c) => c.id === 'supportWaiting')).toEqual({ id: 'supportWaiting', n: 2, oldest: minsAgo(40).toISOString() });
    expect(counts.find((c) => c.id === 'supportLate')).toEqual({ id: 'supportLate', n: 1, oldest: minsAgo(40).toISOString() });
    const agent: ShellViewer = { owner: false, perms: new Set(['support.read']) };
    const packer: ShellViewer = { owner: false, perms: new Set(['orders.read']) };
    expect(visibleQueues(counts, agent).map((r) => r.id)).toEqual(['supportWaiting', 'supportLate']);
    expect(visibleQueues(counts, packer).map((r) => r.id)).not.toContain('supportWaiting');
    expect(badgesFrom(visibleQueues(counts, agent))).toEqual({ support: 2 });
    const elsewhere = await countQueues(deps, other);
    expect(elsewhere.find((c) => c.id === 'supportWaiting')?.n).toBe(1);
  });
});
