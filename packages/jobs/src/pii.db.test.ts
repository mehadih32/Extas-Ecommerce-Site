// S06 · PR 159 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): the purge clears the IP, the device id and the shared point of the orders past the owner's
// days (or past the day stored on the order), and nothing else — the order, its money and its other fields stay; a
// second run clears nothing more; a shorter rule reaches older orders too; the job runs through the catalogue. Every
// value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { InventoryDeps, SettingsReader } from '@extas/inventory';
import { registry, type Key, type Value } from '@extas/settings';
import { jobDefinition } from './catalogue';
import type { JobDeps } from './context';
import { PII_PURGE_JOB, piiPlanner, purgeOrderPii } from './pii';

const D = 86_400_000;
const NOW = new Date('2026-10-24T06:00:00Z');

describe.skipIf(!HAS_TEST_DB)('PR 159 · the 180-day purge on PostgreSQL', () => {
  let t: TestDatabase;
  let storeId = 0;
  let days = 180;
  const settings: SettingsReader = { value: async <K extends Key>(k: K) => (k === 'risk.capture' ? { ...registry['risk.capture'].default, retentionDays: days } : registry[k].default) as Value<K> };
  const deps = (): JobDeps => ({ db: t.prisma, settings, inventory: {} as InventoryDeps, now: () => NOW });
  let n = 0;
  const order = (placedAgoDays: number, expiresInDays: number | null) =>
    t.prisma.order.create({
      data: {
        storeId,
        number: `PII-${++n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        subtotalMinor: 100_000,
        totalMinor: 100_000,
        idempotencyKey: randomUUID(),
        placedAt: new Date(NOW.getTime() - placedAgoDays * D),
        customerName: 'Test Customer',
        ip: '203.0.113.7',
        deviceId: randomUUID(),
        gpsLat: '23.781',
        gpsLng: '90.400',
        piiExpiresAt: expiresInDays === null ? null : new Date(NOW.getTime() + expiresInDays * D),
      },
      select: { id: true },
    });
  const row = (id: string) => t.prisma.order.findUniqueOrThrow({ where: { id }, select: { ip: true, deviceId: true, gpsLat: true, gpsLng: true, piiExpiresAt: true, customerName: true, totalMinor: true, number: true } });

  beforeAll(async () => {
    t = await createTestDatabase('jobs_pii');
    [storeId] = await seedSampleStores(t.prisma);
  }, 120_000);
  afterAll(async () => {
    await t?.drop();
  });

  it('clears only the kept facts of orders past the days (or their own day), once; the order itself stays', async () => {
    const fresh = await order(10, 170);
    const old = await order(200, -20);
    const dueByDay = await order(30, -1); // its own day has come (an earlier, shorter rule)
    const unstamped = await order(400, null); // kept before the day was stored
    const r = await purgeOrderPii(t.prisma, storeId, NOW, 180);
    expect(r.cleared).toBe(3);
    for (const id of [old.id, dueByDay.id, unstamped.id]) expect(await row(id)).toMatchObject({ ip: null, deviceId: null, gpsLat: null, gpsLng: null, piiExpiresAt: null, customerName: 'Test Customer', totalMinor: 100_000 });
    const kept = await row(fresh.id);
    expect(kept.ip).toBe('203.0.113.7');
    expect(kept.deviceId).not.toBeNull();
    expect(Number(kept.gpsLat)).toBeCloseTo(23.781);
    // a second run clears nothing more
    expect((await purgeOrderPii(t.prisma, storeId, NOW, 180)).cleared).toBe(0);
    // the owner shortens the rule: older orders follow at once
    expect((await purgeOrderPii(t.prisma, storeId, NOW, 7)).cleared).toBe(1);
    expect((await row(fresh.id)).ip).toBeNull();
  });

  it("PR 519: the identity graph's IP and device links go by the same day rule; its phone, name and address links stay", async () => {
    const c = await t.prisma.identityCluster.create({ data: { storeId }, select: { id: true } });
    const o = await order(200, -20);
    const link = (kind: 'IP' | 'DEVICE' | 'PHONE' | 'NAME', valueNorm: string, firstSeenAgoDays: number, expiresInDays: number | null) =>
      t.prisma.identityLink.create({
        data: { storeId, clusterId: c.id, kind, valueNorm, orderId: o.id, firstSeenAt: new Date(NOW.getTime() - firstSeenAgoDays * D), expiresAt: expiresInDays === null ? null : new Date(NOW.getTime() + expiresInDays * D) },
        select: { id: true },
      });
    const oldIp = await link('IP', '203.0.113.7', 200, null);
    const dueDevice = await link('DEVICE', 'dev-1', 10, -1);
    const freshDevice = await link('DEVICE', 'dev-2', 10, 170);
    const phone = await link('PHONE', '+8801700000519', 200, null); // hardcode-ok: a made-up test number
    const name = await link('NAME', 'test customer', 200, null);
    const r = await purgeOrderPii(t.prisma, storeId, NOW, 180);
    expect(r.links).toBe(2);
    const left = new Set((await t.prisma.identityLink.findMany({ where: { clusterId: c.id }, select: { id: true } })).map((x) => x.id));
    expect(left.has(oldIp.id) || left.has(dueDevice.id)).toBe(false);
    for (const x of [freshDevice, phone, name]) expect(left.has(x.id)).toBe(true);
    expect((await purgeOrderPii(t.prisma, storeId, NOW, 180)).links).toBe(0);
  });

  it('runs as a job from the catalogue with the owner\'s days, and the planner plans one run per store and slot', async () => {
    days = 5;
    const o = await order(6, 100);
    const job = jobDefinition(PII_PURGE_JOB)!;
    expect(job.queue).toBe('privacy');
    expect(() => job.parse({})).toThrow(/positive integer/);
    const out = await job.run(deps(), job.parse({ storeId }));
    expect(out).toMatchObject({ ok: true, stats: { cleared: 1, retentionDays: 5 } });
    expect((await row(o.id)).deviceId).toBeNull();
    const planned = (await piiPlanner(deps(), NOW)).filter((p) => (p.payload as { storeId: number }).storeId === storeId);
    expect(planned).toHaveLength(1);
    expect(planned[0]!.key).toBe(`${PII_PURGE_JOB}/${storeId}/${Math.floor(NOW.getTime() / (registry['risk.capture'].default.purgeEveryMinutes * 60_000))}`);
  });
});
