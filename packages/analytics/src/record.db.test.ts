// S15 · PR 338 — the DB-integration half: recordAnalyticsEvent against a real throwaway PostgreSQL (the real
// migrations; skipped without TEST_DATABASE_ADMIN_URL). Every value here is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { recordAnalyticsEvent } from './record';

describe.skipIf(!HAS_TEST_DB)('recordAnalyticsEvent (PR 338)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;

  beforeAll(async () => {
    t = await createTestDatabase('analytics_338');
    [A, B] = await seedSampleStores(t.prisma);
  });
  afterAll(async () => t?.drop());

  it('stores a minimal valid event, store-scoped, with every optional field null', async () => {
    const out = await recordAnalyticsEvent({ db: t.prisma }, { storeId: A, name: 'page_view', visitorId: 'v-pr338-1', isLoggedIn: false });
    expect(out).toMatchObject({ name: 'page_view' });
    const row = await t.prisma.analyticsEvent.findUniqueOrThrow({ where: { id: out!.id } });
    expect(row).toMatchObject({ storeId: A, name: 'page_view', visitorId: 'v-pr338-1', isLoggedIn: false, sessionId: null, customerId: null, pageType: null, productId: null, categoryId: null, comboId: null, sourceButton: null, props: null });
  });

  it('keeps the richer fields: pageType, productId, sourceButton, props, a logged-in customer', async () => {
    const out = await recordAnalyticsEvent(
      { db: t.prisma },
      {
        storeId: A,
        name: 'add_to_bag',
        visitorId: 'v-pr338-2',
        sessionId: 's-pr338-2',
        customerId: null,
        isLoggedIn: true,
        pageType: 'product',
        productId: 'df9e9b10-aaaa-7000-8000-0000000000aa',
        sourceButton: 'pdp_bar',
        props: { qty: 2, size: 'M', colour: 'navy' },
      },
    );
    const row = await t.prisma.analyticsEvent.findUniqueOrThrow({ where: { id: out!.id } });
    expect(row).toMatchObject({ storeId: A, name: 'add_to_bag', isLoggedIn: true, pageType: 'product', productId: 'df9e9b10-aaaa-7000-8000-0000000000aa', sourceButton: 'pdp_bar', props: { qty: 2, size: 'M', colour: 'navy' } });
  });

  it('refuses an event name outside the catalogue — nothing written, never invented', async () => {
    const before = await t.prisma.analyticsEvent.count({ where: { storeId: A } });
    const out = await recordAnalyticsEvent({ db: t.prisma }, { storeId: A, name: 'made_up_event', visitorId: 'v-pr338-3', isLoggedIn: false });
    expect(out).toBeNull();
    expect(await t.prisma.analyticsEvent.count({ where: { storeId: A } })).toBe(before);
  });

  it('is store-scoped: an event recorded for A never shows up when reading B', async () => {
    const out = await recordAnalyticsEvent({ db: t.prisma }, { storeId: B, name: 'search', visitorId: 'v-pr338-4', isLoggedIn: false, props: { term: 'polo' } });
    const seenByA = await t.prisma.analyticsEvent.findFirst({ where: { storeId: A, id: out!.id } });
    expect(seenByA).toBeNull();
    const seenByB = await t.prisma.analyticsEvent.findFirst({ where: { storeId: B, id: out!.id } });
    expect(seenByB).toMatchObject({ name: 'search', props: { term: 'polo' } });
  });

  it('clamps a far-future occurredAt to the given clock, never trusting the browser past that', async () => {
    const now = new Date('2026-11-12T10:00:00.000Z');
    const out = await recordAnalyticsEvent({ db: t.prisma, now: () => now }, { storeId: A, name: 'page_view', visitorId: 'v-pr338-5', isLoggedIn: false, occurredAt: '2030-01-01T00:00:00.000Z' });
    const row = await t.prisma.analyticsEvent.findUniqueOrThrow({ where: { id: out!.id } });
    expect(row.occurredAt).toEqual(now);
  });
});
