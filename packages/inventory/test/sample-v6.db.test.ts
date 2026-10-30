// CN-029 Phase 3 qa-gate I1 (PR 621) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the CI-only sample
// store on ERP contract v6, so the device gate measures the v6 books, the hold notice and the opened ERP forms (the
// sample catalogue store stays on v5). Sample data only: it runs only where the sample catalogue seed ran (its pack
// mark), never on an installation with the owner's data; it is idempotent; its dates count back from today; it never
// changes the sample catalogue store. Every amount is a made-up sample value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allAdapters, createConnections } from '@extas/adapters';
import { syncAuth } from '@extas/auth';
import { createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { SAMPLE_PACK_KEY } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { addDay, erpCheckoutPaused, erpHoldNotice, isV6, storeDate, storeErpLink, verifyCloseChain, type InventoryDeps, type SettingsReader } from '../src';
import { SampleErpV6Refused, sampleErpV6, seedSampleErpV6 } from '../src/sample-v6';

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('PR 621 · the CI sample store on ERP contract v6 (qa-gate I1)', () => {
  let t: TestDatabase;
  let mother = 0;
  const stored = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number | null }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      return (stored.has(sk) ? stored.get(sk) : registry[key].default) as Value<K>;
    },
  };
  const now = new Date('2026-10-30T06:00:00Z');
  let deps: InventoryDeps;
  const setStoreSetting = async (key: 'erp.model', value: 'v6', storeId: number) => void stored.set(`${key}@${storeId}`, value);

  beforeAll(async () => {
    t = await createTestDatabase('sample_v6');
    [mother] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const connections = createConnections({ db: t.prisma, vault: { get: async () => null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    deps = { db: t.prisma, settings, connections, now: () => now, sleep: async () => {}, random: () => 0.5 };
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('refuses an installation the sample catalogue seed never ran on (the owner`s data is never touched)', async () => {
    await expect(seedSampleErpV6(deps, { setStoreSetting })).rejects.toBeInstanceOf(SampleErpV6Refused);
    expect(await t.prisma.store.count({ where: { slug: sampleErpV6.store.slug } })).toBe(0);
  });

  it('makes one v6 store with its practice ERP link, books through yesterday, an adjustable difference and a hold', async () => {
    await t.prisma.defaultPackApplication.create({ data: { storeId: mother, packKey: SAMPLE_PACK_KEY, version: 1 } });
    const r = await seedSampleErpV6(deps, { setStoreSetting });
    expect(r.created).toBe(true);
    const store = await t.prisma.store.findUniqueOrThrow({ where: { slug: sampleErpV6.store.slug } });
    expect(r.storeId).toBe(store.id);
    expect(await isV6(deps, store.id)).toBe(true);
    // the sample catalogue store is left as it was
    expect(await isV6(deps, mother)).toBe(false);
    expect(await t.prisma.erpStoreLink.count({ where: { storeId: mother } })).toBe(0);

    const link = (await storeErpLink(t.prisma, store.id))!;
    const today = storeDate(now, store.timezone);
    expect(link.switchDate).toBe(addDay(today, -sampleErpV6.switchDaysAgo));
    expect((await t.prisma.integration.findFirstOrThrow({ where: { storeId: store.id, kind: 'ERP' } })).mode).toBe('MOCK');
    // a day close for every day from the switch through yesterday, one unbroken chain
    const closes = await t.prisma.booksDayClose.findMany({ where: { linkId: link.id }, orderBy: { date: 'asc' } });
    expect(closes.length).toBe(sampleErpV6.switchDaysAgo);
    expect(closes.at(-1)!.date.toISOString().slice(0, 10)).toBe(addDay(today, -1));
    expect(await verifyCloseChain(t.prisma, link.id)).toEqual({ ok: true, rows: closes.length });
    // the differences of one day: an order's bill a paisa off (adjustable) and the broken tie
    const diffs = (await t.prisma.booksDifference.findMany({ where: { linkId: link.id } })).sort((a, b) => a.check.localeCompare(b.check));
    expect(diffs.map((d) => [d.check, d.kind, d.status])).toEqual([
      ['ORDERS', 'AMOUNT_DIFF', 'MISMATCH'],
      ['TIES', 'TIE_BROKEN', 'MISMATCH'],
    ]);
    expect(diffs[0]!.date.toISOString().slice(0, 10)).toBe(addDay(today, -sampleErpV6.difference.daysAgo));
    // the ERP holds the account: the store's checkout is paused and the notice is on
    expect((await erpCheckoutPaused(deps, store.id)).paused).toBe(true);
    expect(await erpHoldNotice(deps, store.id)).toMatchObject({ onHold: true });
    expect((await erpCheckoutPaused(deps, mother)).paused).toBe(false);
  });

  it('runs again without a second store, link or row', async () => {
    const counts = async () => [await t.prisma.store.count(), await t.prisma.erpStoreLink.count(), await t.prisma.erpAccountEntry.count(), await t.prisma.booksDayClose.count(), await t.prisma.booksDifference.count()];
    const before = await counts();
    const r = await seedSampleErpV6(deps, { setStoreSetting });
    expect(r.created).toBe(false);
    expect(await counts()).toEqual(before);
  });
});
