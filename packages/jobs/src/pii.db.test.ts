// S06 · PR 159 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): the purge clears the IP, the device id and the shared point of the orders past the owner's
// days (or past the day stored on the order), and nothing else — the order, its money and its other fields stay; a
// second run clears nothing more; a shorter rule reaches older orders too; the job runs through the catalogue. Review
// R3 (M1): voice-address recordings past their days are wiped for abandoned checkouts and finished orders only, the
// library row archived (never deleted), the order and its audit kept, each wipe audited. PR 302: the IP kept by a
// customer's sign-ins, one-time codes, bulk enquiries and consent answers goes by the same days; the rows and the
// customer stay. Every value is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { InventoryDeps, SettingsReader } from '@extas/inventory';
import { registry, type Key, type Value } from '@extas/settings';
import { jobDefinition } from './catalogue';
import type { JobDeps } from './context';
import { PII_PURGE_JOB, piiPlanner, purgeCustomerIps, purgeOrderPii, purgeVoice } from './pii';

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

  it('review R3 (M1): wipes old recordings of abandoned checkouts and finished orders only; archives, never deletes', async () => {
    const asset = () =>
      t.prisma.mediaAsset.create({ data: { storeId, kind: 'AUDIO', storage: 'LOCAL_DISK', storageKey: `voice/${randomUUID()}.webm`, mimeType: 'audio/webm', bytes: BigInt(100), checksumSha256: randomUUID(), folder: 'voice' }, select: { id: true, storageKey: true } });
    const voice = async (agoDays: number, orderId: string | null) => {
      const a = await asset();
      const v = await t.prisma.checkoutVoice.create({ data: { storeId, visitorId: randomUUID(), orderId, assetId: a.id, transcript: 'House 1, Road 2, Mirpur', engine: 'BROWSER', lang: 'bn-BD', createdAt: new Date(NOW.getTime() - agoDays * D) }, select: { id: true } });
      return { v, a };
    };
    const delivered = await order(40, null);
    await t.prisma.order.update({ where: { id: delivered.id }, data: { status: 'DELIVERED', ip: null, deviceId: null, gpsLat: null, gpsLng: null, piiExpiresAt: null } });
    const open = await order(40, null);
    await t.prisma.order.update({ where: { id: open.id }, data: { status: 'IN_TRANSIT', ip: null, deviceId: null, gpsLat: null, gpsLng: null, piiExpiresAt: null } });
    const abandoned = await voice(31, null);
    const finished = await voice(31, delivered.id);
    const stillOpen = await voice(31, open.id);
    const fresh = await voice(5, null);
    const wiped: string[] = [];
    const r = await purgeVoice({ db: t.prisma, voice: { wipe: async (_s, f) => void wiped.push(f.storageKey) } }, storeId, NOW, 30);
    expect(r).toMatchObject({ wiped: 2, files: 2 });
    expect(wiped.sort()).toEqual([abandoned.a.storageKey, finished.a.storageKey].sort());
    const v = (id: string) => t.prisma.checkoutVoice.findUniqueOrThrow({ where: { id }, select: { assetId: true, transcript: true, orderId: true } });
    expect(await v(abandoned.v.id)).toEqual({ assetId: null, transcript: null, orderId: null });
    expect(await v(finished.v.id)).toEqual({ assetId: null, transcript: 'House 1, Road 2, Mirpur', orderId: delivered.id });
    expect((await v(stillOpen.v.id)).assetId).toBe(stillOpen.a.id);
    expect((await v(fresh.v.id)).assetId).toBe(fresh.a.id);
    // the library rows stay, archived; the order stays; each wipe is audited
    expect(await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: finished.a.id } })).toMatchObject({ archivedAt: NOW });
    expect(await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: fresh.a.id } })).toMatchObject({ archivedAt: null });
    expect(await t.prisma.order.count({ where: { id: delivered.id } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'checkout.voice.purge', entityId: { in: [abandoned.v.id, finished.v.id] } } })).toBe(2);
    // a second run wipes nothing more
    expect((await purgeVoice({ db: t.prisma }, storeId, NOW, 30)).wiped).toBe(0);
  });

  it("PR 302: the IP of a customer's sign-ins, codes, bulk enquiries and consent answers goes by the same days; nothing is removed", async () => {
    const IP = '198.51.100.9';
    const ago = (days: number) => new Date(NOW.getTime() - days * D);
    const phone = '+8801700000302'; // hardcode-ok: a made-up test number
    const c = await t.prisma.customer.create({ data: { storeId, phone, name: 'Test Customer' }, select: { id: true } });
    const session = (days: number) => t.prisma.customerSession.create({ data: { storeId, customerId: c.id, tokenHash: randomUUID(), ip: IP, expiresAt: new Date(NOW.getTime() + D), createdAt: ago(days) }, select: { id: true } });
    const code = (days: number) => t.prisma.otpChallenge.create({ data: { storeId, phone, purpose: 'LOGIN', codeHash: randomUUID(), ip: IP, expiresAt: ago(days - 1), createdAt: ago(days) }, select: { id: true } });
    let ref = 302_000;
    const enquiry = (days: number) => t.prisma.bulkEnquiry.create({ data: { storeId, refNo: ++ref, name: 'Test Buyer', phone, quantity: 20, source: 'page', lang: 'en', ip: IP, createdAt: ago(days) }, select: { id: true } });
    const consent = (days: number) => t.prisma.consentRecord.create({ data: { storeId, customerId: c.id, phone, channel: 'SMS', granted: true, source: 'checkout', ip: IP, createdAt: ago(days) }, select: { id: true } });
    const old = { s: await session(200), o: await code(200), e: await enquiry(200), c: await consent(200) };
    const fresh = { s: await session(10), o: await code(10), e: await enquiry(10), c: await consent(10) };
    const r = await purgeCustomerIps(t.prisma, storeId, NOW, 180);
    expect(r).toEqual({ sessions: 1, codes: 1, enquiries: 1, consents: 1 });
    const ips = async (x: typeof old) => [
      (await t.prisma.customerSession.findUniqueOrThrow({ where: { id: x.s.id } })).ip,
      (await t.prisma.otpChallenge.findUniqueOrThrow({ where: { id: x.o.id } })).ip,
      (await t.prisma.bulkEnquiry.findUniqueOrThrow({ where: { id: x.e.id } })).ip,
      (await t.prisma.consentRecord.findUniqueOrThrow({ where: { id: x.c.id } })).ip,
    ];
    expect(await ips(old)).toEqual([null, null, null, null]);
    expect(await ips(fresh)).toEqual([IP, IP, IP, IP]);
    // the consent answer itself stays as the record; the customer is never removed
    expect(await t.prisma.consentRecord.findUniqueOrThrow({ where: { id: old.c.id } })).toMatchObject({ granted: true, channel: 'SMS', source: 'checkout' });
    expect(await t.prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ phone, name: 'Test Customer', erasedAt: null, archivedAt: null });
    expect(await purgeCustomerIps(t.prisma, storeId, NOW, 180)).toEqual({ sessions: 0, codes: 0, enquiries: 0, consents: 0 });
    // the job does it too, with the owner's days
    days = 7;
    const out = await jobDefinition(PII_PURGE_JOB)!.run(deps(), { storeId });
    expect(out).toMatchObject({ ok: true, stats: { customers: { sessions: 1, codes: 1, enquiries: 1, consents: 1 } } });
    expect(await ips(fresh)).toEqual([null, null, null, null]);
    expect(await t.prisma.customer.count({ where: { id: c.id } })).toBe(1);
    days = 180;
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
