// S15 · PR 339 — running a saved funnel against real stored events (`AnalyticsEvent`, PR 338's own
// `recordAnalyticsEvent`), on a real throwaway PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { recordAnalyticsEvent } from '@extas/analytics';
import { createFunnel, isFunnelError, type FunnelListDeps, type Who } from './funnel-list';
import { defaultFunnelWindow, runFunnel, type FunnelRunDeps } from './funnel-run';

const OWNER = SYSTEM;
const DAY_MS = 86_400_000;

describe.skipIf(!HAS_TEST_DB)('running a saved funnel against stored events (PR 339)', () => {
  let t: TestDatabase;
  let d: FunnelRunDeps & FunnelListDeps;
  let who: Who;
  let A = 0;

  beforeAll(async () => {
    t = await createTestDatabase('web_funnel_run_339');
    [A] = await seedSampleStores(t.prisma);
    d = { db: t.prisma };
    who = { actor: OWNER, ctx: { ip: '127.0.0.1', userAgent: 'test' } };
  });
  afterAll(async () => t?.drop());

  it('counts distinct visitors per step, carrying only those who also reached the step before', async () => {
    const funnel = await createFunnel(d, who, A, {
      name: 'Product → bag',
      steps: [
        { key: 'view', label: 'Viewed the product', eventName: 'product_view' },
        { key: 'bag', label: 'Added to bag', eventName: 'add_to_bag' },
      ],
    });
    const now = new Date();
    const at = new Date(now.getTime() - 60_000).toISOString(); // inside the window, which ends at `now`
    await recordAnalyticsEvent({ db: t.prisma }, { storeId: A, name: 'product_view', visitorId: 'v-339-1', isLoggedIn: false, occurredAt: at });
    await recordAnalyticsEvent({ db: t.prisma }, { storeId: A, name: 'add_to_bag', visitorId: 'v-339-1', isLoggedIn: false, occurredAt: at });
    await recordAnalyticsEvent({ db: t.prisma }, { storeId: A, name: 'product_view', visitorId: 'v-339-2', isLoggedIn: false, occurredAt: at });
    // never viewed, so step 2's own event does not carry this visitor into the funnel at all:
    await recordAnalyticsEvent({ db: t.prisma }, { storeId: A, name: 'add_to_bag', visitorId: 'v-339-3', isLoggedIn: false, occurredAt: at });

    const window = defaultFunnelWindow(now, null, null);
    const result = await runFunnel(d, A, funnel.id, window);
    expect(result.funnel.name).toBe('Product → bag');
    expect(result.steps[0]!.visitors).toBe(2); // v-339-1, v-339-2
    expect(result.steps[1]!.visitors).toBe(1); // v-339-1 only
    expect(result.steps[1]!.conversionFromPrevious).toBe(0.5);
  });

  it('only counts events inside the given window', async () => {
    const funnel = await createFunnel(d, who, A, {
      name: 'Windowed',
      steps: [
        { key: 'search', label: 'Searched', eventName: 'search' },
        { key: 'view', label: 'Viewed', eventName: 'product_view' },
      ],
    });
    const now = new Date();
    const old = new Date(now.getTime() - 10 * DAY_MS);
    // recorded as the server saw it 10 days ago (the layer clamps a browser's time against its own clock); a step no
    // other test here records, so only the window decides what is counted
    await recordAnalyticsEvent({ db: t.prisma, now: () => new Date(old.getTime() + 1000) }, { storeId: A, name: 'search', visitorId: 'v-339-old', isLoggedIn: false, occurredAt: old.toISOString() });
    const result = await runFunnel(d, A, funnel.id, { from: new Date(now.getTime() - DAY_MS), to: now });
    expect(result.steps[0]!.visitors).toBe(0); // the old event falls outside the 1-day window
  });

  it('refuses a window where `from` is not before `to`', async () => {
    const funnel = await createFunnel(d, who, A, {
      name: 'Bad window',
      steps: [
        { key: 'a', label: 'A', eventName: 'product_view' },
        { key: 'b', label: 'B', eventName: 'search' },
      ],
    });
    const now = new Date();
    await expect(runFunnel(d, A, funnel.id, { from: now, to: now })).rejects.toSatisfy((e) => isFunnelError(e) && e.code === 'INVALID_INPUT');
  });

  it('404s on an unknown funnel id', async () => {
    const now = new Date();
    await expect(runFunnel(d, A, '00000000-0000-7000-8000-000000000000', defaultFunnelWindow(now, null, null))).rejects.toSatisfy((e) => isFunnelError(e) && e.code === 'NOT_FOUND');
  });
});
