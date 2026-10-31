// S11 · PR 234 — real visitors' speed on a real PostgreSQL: each reading is counted in its day's bucket (ten at once
// all count, never an address or a visitor), the public endpoint always answers 204 and counts only real readings
// while the switch is on, the report reads the 75th percentile of the span on a phone and a desktop against the
// targets, and the monthly lab file is kept once in SpeedMeasurement (judged against the targets).
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, registry, storeTarget, syncSettings } from '@extas/settings';
import { settingsResolver } from '../settings';
import { labReport, recordVital, vitalsHandler, vitalsReport } from './vitals-data';

const S = MOTHER_STORE_ID;
const SET = registry['seo.vitals'].default;
const post = (body: unknown, ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36') =>
  vitalsHandler(new Request('https://shop.example.test/api/shop/vitals', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: typeof body === 'string' ? body : JSON.stringify(body) }));

describe.skipIf(!HAS_TEST_DB)("real visitors' speed on PostgreSQL (PR 234)", () => {
  let t: TestDatabase;
  let dir: string;
  const savedUrl = process.env.DATABASE_URL;
  const rows = () => t.prisma.webVitalDay.findMany({ where: { storeId: S }, orderBy: [{ day: 'asc' }, { metric: 'asc' }, { pageKind: 'asc' }] });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    dir = await mkdtemp(join(tmpdir(), 'extas-vitals-'));
  }, 300_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await disconnectPrisma();
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    await t?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('counts each reading in its bucket; ten at once all count; the address is never kept', async () => {
    const lcp = { metric: 'LCP' as const, path: '/products/sample-shirt?ref=x', device: 'phone' as const };
    await Promise.all(Array.from({ length: 10 }, () => recordVital(t.prisma, S, { ...lcp, value: 1100 }, 'products', '2026-10-20')));
    expect(await recordVital(t.prisma, S, { ...lcp, value: 4200 }, 'products', '2026-10-20')).toBe(true);
    expect(await recordVital(t.prisma, S, { ...lcp, value: -1 }, 'products', '2026-10-20')).toBe(false);
    expect(await recordVital(t.prisma, S, { ...lcp, value: 120_000 }, 'products', '2026-10-20')).toBe(false);
    const [row, ...more] = await rows();
    expect(more).toHaveLength(0);
    expect(row).toMatchObject({ metric: 'LCP', pageKind: 'product', device: 'phone', count: 11 });
    expect(row!.buckets[8]).toBe(10); // 1000 < 1100 ≤ 1200
    expect(row!.buckets[16]).toBe(1); // 4000 < 4200 ≤ 5000
    expect(row!.buckets).toHaveLength(23);
    expect(row!.buckets.reduce((a, b) => a + b, 0)).toBe(11);
    expect(JSON.stringify(row)).not.toContain('sample-shirt');
  });

  it('the endpoint always answers 204 and counts only a real reading while the switch is on', async () => {
    await t.prisma.webVitalDay.deleteMany({ where: { storeId: S } });
    for (const body of [{ m: 'CLS', v: 0.04, p: '/', d: 'desktop' }, { m: 'INP', v: 180, p: '/bn/collections/new-in', d: 'phone' }]) expect((await post(body)).status).toBe(204);
    for (const bad of ['{not json', { m: 'XYZ', v: 1, p: '/', d: 'phone' }, { m: 'LCP', v: 900, p: 'https://elsewhere.test/', d: 'phone' }, { m: 'LCP', v: 900, p: '/', d: 'watch' }, { m: 'LCP', v: '900', p: '/', d: 'phone' }, 'x'.repeat(5000)]) {
      const res = await post(bad);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    }
    // the shop's own test browsers (smoke test, journeys, the monthly lab run) are not real visitors
    expect((await post({ m: 'CLS', v: 0.04, p: '/', d: 'desktop' }, 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0 Safari/537.36')).status).toBe(204);
    expect((await rows()).map((r) => `${r.metric}/${r.pageKind}/${r.device}/${r.count}`).sort()).toEqual(['CLS/home/desktop/1', 'INP/category/phone/1']);
    await settingsResolver()!.set('seo.vitals', { ...SET, collect: false }, storeTarget(S), { actorId: null, reason: 'test' });
    expect((await post({ m: 'LCP', v: 900, p: '/', d: 'phone' })).status).toBe(204);
    expect(await t.prisma.webVitalDay.count({ where: { storeId: S, metric: 'LCP' } })).toBe(0);
    await settingsResolver()!.set('seo.vitals', SET, storeTarget(S), { actorId: null, reason: 'test' });
  });

  it('reads the 75th percentile of the span per device and per kind of page against the targets', async () => {
    await t.prisma.webVitalDay.deleteMany({ where: { storeId: S } });
    const rec = (metric: 'LCP' | 'CLS', value: number, path: string, device: 'phone' | 'desktop', day: string) => recordVital(t.prisma, S, { metric, value, path, device }, 'products', day);
    for (let i = 0; i < 3; i += 1) await rec('LCP', 1100, '/', 'phone', '2026-10-30');
    await rec('LCP', 3200, '/collections/new-in', 'phone', '2026-10-31');
    await rec('LCP', 900, '/', 'desktop', '2026-10-31');
    await rec('CLS', 0.3, '/', 'phone', '2026-10-31');
    await rec('LCP', 9000, '/', 'phone', '2026-09-01'); // outside the 28 days
    const r = await vitalsReport(t.prisma, S, SET, '2026-10-31');
    expect(r).toMatchObject({ days: 28, from: '2026-10-04', to: '2026-10-31', total: 5 });
    expect(r.overall.LCP.phone).toEqual({ p75: 1200, over: false, count: 4, ok: true });
    expect(r.overall.LCP.desktop.count).toBe(1);
    expect(r.overall.CLS.phone).toMatchObject({ p75: 288, ok: false }); // one reading of 0.3, read inside its bucket (0.25–0.3)
    expect(r.overall.INP.phone).toEqual({ p75: null, over: false, count: 0, ok: null });
    expect(r.lcpByKind.map((k) => [k.kind, k.cell.count, k.cell.ok])).toEqual([
      ['home', 3, true],
      ['category', 1, false],
    ]);
    const short = await vitalsReport(t.prisma, S, { ...SET, days: 7 }, '2026-11-06');
    expect(short.total).toBe(2);
  });

  it('shows the newest monthly lab run, judged against the targets, and keeps it once', async () => {
    expect(await labReport(t.prisma, S, SET, null)).toBeNull();
    expect(await labReport(t.prisma, S, SET, dir)).toBeNull();
    await writeFile(join(dir, 'vitals-lab.json'), '{"broken"');
    expect(await labReport(t.prisma, S, SET, dir)).toBeNull();
    const file = {
      at: '2026-10-02T03:00:00Z',
      sha: 'abc',
      profile: 'phone, slow 4G',
      pages: [
        { path: '/', kind: 'home', lcpMs: 2100, cls: 0.02, ttfbMs: 400, kb: 800, loadMs: 3000 },
        { path: '/collections/new-in', kind: 'category', lcpMs: 2400, cls: 0.05, ttfbMs: 450, kb: 1400, loadMs: 3500 },
        { path: '/admin', kind: 'admin', lcpMs: 600, cls: 0, ttfbMs: 200, kb: 300, loadMs: 1500 },
      ],
    };
    await writeFile(join(dir, 'vitals-lab.json'), JSON.stringify(file));
    const lab = await labReport(t.prisma, S, SET, dir);
    expect(lab).toMatchObject({ at: file.at, profile: 'phone, slow 4G', ok: false });
    expect(lab!.pages.map((p) => [p.kind, p.misses])).toEqual([
      ['home', []],
      ['category', ['weight']],
      ['admin', ['admin']],
    ]);
    await labReport(t.prisma, S, SET, dir);
    const kept = await t.prisma.speedMeasurement.findMany({ where: { storeId: S, source: 'lab' }, orderBy: { url: 'asc' } });
    expect(kept.map((k) => [k.url, k.pageType, k.passed, k.pageBytes])).toEqual([
      ['/', 'home', true, 800 * 1024],
      ['/admin', 'admin', false, 300 * 1024],
      ['/collections/new-in', 'category', false, 1400 * 1024],
    ]);
    const roomy = await labReport(t.prisma, S, { ...SET, targets: { ...SET.targets, categoryKb: 2000, adminMs: 2000 } }, dir);
    expect(roomy!.ok).toBe(true);
  });
});
