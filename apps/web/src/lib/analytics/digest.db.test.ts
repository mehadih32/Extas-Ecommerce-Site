// S15 · PR 341 — the weekly/monthly digest's own record (one `ReportDigest` row per store, kind and period) and
// its Telegram/e-mail send, on a real throwaway PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordAnalyticsEvent } from '@extas/analytics';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createFunnel, type FunnelListDeps, type Who } from './funnel-list';
import { digestText, getOrCreateDigest, isDigestError, runDigestNow, sendDigest, type DigestDeps } from './digest';

const OWNER = SYSTEM;
const DAY_MS = 86_400_000;

describe.skipIf(!HAS_TEST_DB)('the weekly/monthly digest (PR 341)', () => {
  let t: TestDatabase;
  let d: DigestDeps & FunnelListDeps;
  let who: Who;
  let A = 0;
  const NOW = new Date('2026-11-12T08:00:00Z');
  // An event is recorded as the server would have seen it at `at` (the layer clamps a browser's time against its own
  // clock, so the clock the event is recorded on is moved with it: the fixed NOW above is not the real "now").
  const record = (at: Date, name: string, visitorId: string) =>
    recordAnalyticsEvent({ db: t.prisma, now: () => new Date(at.getTime() + 1000) }, { storeId: A, name, visitorId, isLoggedIn: false, occurredAt: at.toISOString() });
  const JUST_BEFORE_NOW = new Date(NOW.getTime() - 60_000); // inside the current window, which ends at NOW

  beforeAll(async () => {
    t = await createTestDatabase('web_digest_341');
    [A] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    d = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), now: () => NOW };
    who = { actor: OWNER, ctx: { ip: '127.0.0.1', userAgent: 'test' } };
  });
  afterAll(async () => t?.drop());

  it('builds the current period from stored events, with the previous period for comparison', async () => {
    await record(JUST_BEFORE_NOW, 'product_view', 'v-341-1');
    await record(JUST_BEFORE_NOW, 'product_view', 'v-341-2');
    await record(new Date(NOW.getTime() - 10 * DAY_MS), 'product_view', 'v-341-old');

    const { digest, created } = await getOrCreateDigest(d, A, 'weekly');
    expect(created).toBe(true);
    const line = digest.content.events.find((e) => e.name === 'product_view')!;
    expect(line.count).toBe(2);
    expect(line.prevCount).toBe(1); // the 10-day-old event falls in the previous 7-day window
  });

  it('is idempotent: a second call in the same period reuses the same row, never recounts', async () => {
    const first = await getOrCreateDigest(d, A, 'weekly');
    await record(JUST_BEFORE_NOW, 'product_view', 'v-341-late');
    const second = await getOrCreateDigest(d, A, 'weekly');
    expect(second.created).toBe(false);
    expect(second.digest.id).toBe(first.digest.id);
    // the late event (recorded after the digest was already made) is not in the stored row:
    expect(second.digest.content.events.find((e) => e.name === 'product_view')!.count).toBe(first.digest.content.events.find((e) => e.name === 'product_view')!.count);
  });

  it('carries each saved funnel, run over both windows', async () => {
    await createFunnel(d, who, A, {
      name: 'Shop funnel',
      steps: [
        { key: 'view', label: 'Viewed', eventName: 'product_view' },
        { key: 'bag', label: 'Added to bag', eventName: 'add_to_bag' },
      ],
    });
    const { digest } = await getOrCreateDigest(d, A, 'monthly');
    expect(digest.content.funnels).toHaveLength(1);
    expect(digest.content.funnels[0]!.name).toBe('Shop funnel');
  });

  it('with both channels off, "Run now" builds the digest but sends nothing', async () => {
    const sentTelegram: string[] = [];
    const sentEmail: { to: string; subject: string; text: string }[] = [];
    const dd: DigestDeps = { ...d, sendTelegram: async (x) => void sentTelegram.push(x), sendEmail: async (to, subject, text) => void sentEmail.push({ to, subject, text }) };
    const { sent } = await runDigestNow(dd, who, A, 'weekly');
    expect(sent).toEqual({ telegram: 'skipped', email: 'skipped' });
    expect(sentTelegram).toEqual([]);
    expect(sentEmail).toEqual([]);
  });

  it('refuses a kind outside weekly/monthly', async () => {
    await expect(runDigestNow(d, who, A, 'daily')).rejects.toSatisfy((e) => isDigestError(e) && e.code === 'INVALID_INPUT');
  });

  it('with Telegram on, sends once and marks the row sent; a second send is skipped (idempotent)', async () => {
    await d.resolver.set('reports.digest.telegramOn', true, storeTarget(A));
    const sentTelegram: string[] = [];
    const dd: DigestDeps = { ...d, sendTelegram: async (x) => void sentTelegram.push(x) };
    const { digest, sent } = await runDigestNow(dd, who, A, 'monthly');
    expect(sent.telegram).toBe('sent');
    expect(digest.sentTelegramAt).not.toBeNull();
    expect(sentTelegram).toHaveLength(1);

    const second = await sendDigest(dd, A, digest);
    expect(second.telegram).toBe('sent'); // already sent — not sent again
    expect(sentTelegram).toHaveLength(1); // the override was never called a second time
  });

  it('with the e-mail channel on but no owner address yet, the e-mail is skipped (never a BLOCKED.md question)', async () => {
    await d.resolver.set('reports.digest.emailOn', true, storeTarget(A));
    const sentEmail: unknown[] = [];
    const { digest } = await getOrCreateDigest(d, A, 'weekly');
    const dd: DigestDeps = { ...d, sendEmail: async (...a) => void sentEmail.push(a) };
    const sent = await sendDigest(dd, A, digest);
    expect(sent.email).toBe('skipped');
    expect(sentEmail).toEqual([]);
  });

  it('once an owner e-mail is set, the e-mail channel sends and marks the row', async () => {
    await d.resolver.set('reports.digest.ownerEmail', 'owner@example.com', storeTarget(A));
    const sentEmail: { to: string; subject: string }[] = [];
    const { digest } = await getOrCreateDigest(d, A, 'weekly');
    const dd: DigestDeps = { ...d, sendEmail: async (to, subject) => void sentEmail.push({ to, subject }) };
    const sent = await sendDigest(dd, A, digest);
    expect(sent.email).toBe('sent');
    expect(sentEmail).toEqual([{ to: 'owner@example.com', subject: expect.stringContaining('2026') }]);
  });

  it('digestText reads in both languages and never invents a number: a zero-event window still gives the head and foot', () => {
    const { content } = { content: { kind: 'weekly' as const, periodStart: '2026-11-05T00:00:00.000Z', periodEnd: '2026-11-12T00:00:00.000Z', previousPeriodStart: '2026-10-29T00:00:00.000Z', previousPeriodEnd: '2026-11-05T00:00:00.000Z', events: [], funnels: [] } };
    for (const lang of ['bn', 'en'] as const) {
      const text = digestText(content, lang);
      expect(text).toContain('2026-11-05');
      expect(text).toContain('2026-11-12');
    }
  });
});
