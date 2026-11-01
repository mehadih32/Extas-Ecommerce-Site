// PR 414 follow-up (live run 2, 1 Nov 2026) — the go-live gate's hold on the owner's cash-on-delivery switch, on a real
// PostgreSQL (a throwaway database with the sample catalogue; skipped without TEST_DATABASE_ADMIN_URL). The gate's
// shared helpers (tools/gate-orders/lib/test-shop.ts) run through the shop's own settings resolver, as on the server:
// - a run with the owner's `allow_cod` switches it on and every close puts back the exact earlier value (no row, or the
//   earlier row), says so in the report's words, and keeps those words on the grant for any later close;
// - a run that died at any moment is put back by the next run's start check: from its grant row, from a grant row
//   written before the switch (`pending`), or from its own setting-change line when no open grant is left;
// - a value someone changed during the run is left as they set it; a run without `allow_cod` never touches it;
// - the GATE TEST products sit in their own shown category (search, category lists and the wishlist need one), archived
//   with them at the end.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { SYSTEM } from '@extas/auth';
import { disconnectPrisma } from '@extas/db/client';
import { seedSample } from '@extas/seed';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';

// The gate's helpers live in tools/ and are type-checked from inside the workspace (ci.yml, "Type-check the go-live
// gate's server code"); loaded here by path so the web type-check does not follow them out of the app.
type Kit = { db: TestDatabase['prisma']; storeId: number; settings: SettingsResolver<typeof registry>; who: unknown; source: string };
type GateShop = {
  GATE_RUN_SCOPE: string;
  openRun(k: Kit, a: { runId: string; tokenHash: string; host: string; minutes: number; allowCod: boolean }): Promise<unknown>;
  closeRuns(k: Kit, a: { runId?: string; except?: string }): Promise<{ runs: { run: string; cod: string }[] }>;
  runState(k: Kit, runId: string): Promise<{ grant: string; cod: string }>;
  strayCod(k: Kit): Promise<{ restored: boolean; note: string | null }>;
  setUpProducts(k: Kit, d: unknown, prefix: string): Promise<{ products: { id: string }[] }>;
  archiveProducts(k: Kit, d: unknown, prefix: string): Promise<unknown>;
};
const SHOP = fileURLToPath(new URL('../../../../../tools/gate-orders/lib/test-shop.ts', import.meta.url));
const COD = 'payment.cod.enabled';
const HASH = 'a'.repeat(64);
const data = JSON.parse(readFileSync(new URL('../../../../../tools/gate-orders/data/test-data.json', import.meta.url), 'utf8')) as { category: { slug: string } };

describe.skipIf(!HAS_TEST_DB)('the go-live gate puts cash on delivery back, whatever ends the run (PR 414, live run 2)', () => {
  let t: TestDatabase;
  let kit: Kit;
  let g: GateShop;
  let S = 0;
  let n = 0;
  const run = () => `t${Date.now().toString(36)}${(n += 1)}`;
  const row = () => t.prisma.storeSettingValue.findUnique({ where: { storeId_key: { storeId: S, key: COD } }, select: { value: true, version: true } });
  const open = (runId: string, allowCod = true) => g.openRun(kit, { runId, tokenHash: HASH, host: 'preview.example.test', minutes: 30, allowCod });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    g = (await import(/* @vite-ignore */ SHOP)) as GateShop;
    t = await createTestDatabase('gate_cod');
    S = (await seedSample(t.prisma)).storeId;
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    const settings = new SettingsResolver(prismaBackend(t.prisma), registry);
    kit = { db: t.prisma, storeId: S, settings, who: { actor: SYSTEM, storeId: S, ctx: { source: 'gate-orders', userAgent: 'test' } }, source: 'gate-orders' };
    await t.prisma.storeSettingValue.deleteMany({ where: { storeId: S, key: COD } });
  }, 180_000);

  afterAll(async () => {
    await disconnectPrisma();
    await t?.drop();
  });

  it('no store value before: switched on for the run, put back to no value, said and kept on the grant', async () => {
    const id = run();
    const opened = await open(id);
    expect(opened).toMatchObject({ open: true, cod: { on: true, changed: true } });
    expect((await row())?.value).toBe(true);
    const c = await g.closeRuns(kit, { runId: id });
    expect(c).toMatchObject({ ok: true, closed: 1, codRestored: 1 });
    expect(c.runs[0]?.cod).toBe('put back to no store value (the installation value answers)');
    expect(await row()).toBeNull();
    // a later close (the shell's trap after the safety net closed it) still says what happened
    expect(await g.closeRuns(kit, { runId: id })).toMatchObject({ closed: 0 });
    expect(await g.runState(kit, id)).toEqual({ grant: 'closed', cod: 'put back to no store value (the installation value answers)' });
  });

  it('an explicit false before: put back to false, the exact earlier value', async () => {
    await kit.settings.set(COD, false, storeTarget(S), { ownerApproved: true, actorId: null, reason: 'owner' });
    const id = run();
    await open(id);
    await g.closeRuns(kit, { runId: id });
    expect((await row())?.value).toBe(false);
    expect((await g.runState(kit, id)).cod).toBe('put back to false');
    await kit.settings.reset(COD, storeTarget(S), { ownerApproved: true, actorId: null, reason: 'owner' });
  });

  it('without allow_cod the run never touches it, and says so', async () => {
    const id = run();
    expect(await open(id, false)).toMatchObject({ open: true, cod: { on: false, changed: false } });
    expect(await row()).toBeNull();
    await g.closeRuns(kit, { runId: id });
    expect(await g.runState(kit, id)).toEqual({ grant: 'closed', cod: 'not touched' });
    expect(await g.runState(kit, 'never-opened')).toEqual({ grant: 'none', cod: 'not touched' });
  });

  it('a run that died with its grant open is put back by the next run\'s start check', async () => {
    const dead = run();
    await open(dead);
    expect((await row())?.value).toBe(true);
    const next = await g.closeRuns(kit, { except: run() });
    expect(next).toMatchObject({ ok: true, closed: 1, codRestored: 1 });
    expect(next.runs).toEqual([{ run: dead, cod: 'put back to no store value (the installation value answers)' }]);
    expect(await row()).toBeNull();
  });

  it('a run that died right after the switch, before its grant said so (pending), is put back too', async () => {
    const dead = run();
    // what openRun writes first, then the switch itself — and nothing after (the process died)
    await t.prisma.idempotencyKey.create({ data: { scope: g.GATE_RUN_SCOPE, key: dead, requestHash: HASH, responseBody: { host: 'preview.example.test', source: 'gate-orders', cod: { changed: true, hadRow: false, previous: null, version: 0, pending: true } }, expiresAt: new Date(Date.now() + 60_000) } });
    await kit.settings.set(COD, true, storeTarget(S), { ownerApproved: true, actorId: null, reason: `go-live gate run ${dead}: cash on delivery on for the run only (allow_cod, the owner's OK); put back at the end` });
    const c = await g.closeRuns(kit, { except: run() });
    expect(c.runs).toEqual([{ run: dead, cod: 'put back to no store value (the installation value answers)' }]);
    expect(await row()).toBeNull();
    // and one that died before the switch: nothing to put back, and nothing is changed
    const early = run();
    await t.prisma.idempotencyKey.create({ data: { scope: g.GATE_RUN_SCOPE, key: early, requestHash: HASH, responseBody: { host: 'preview.example.test', source: 'gate-orders', cod: { changed: true, hadRow: false, previous: null, version: 0, pending: true } }, expiresAt: new Date(Date.now() + 60_000) } });
    expect((await g.closeRuns(kit, { except: run() })).runs).toEqual([{ run: early, cod: 'not touched (the run stopped before it switched cash on delivery on)' }]);
    expect(await row()).toBeNull();
  });

  it('a switch-on whose grant is gone is found by its own setting-change line and put back once', async () => {
    const lost = run();
    await kit.settings.set(COD, true, storeTarget(S), { ownerApproved: true, actorId: null, reason: `go-live gate run ${lost}: cash on delivery on for the run only (allow_cod, the owner's OK); put back at the end` });
    const s = await g.strayCod(kit);
    expect(s.restored).toBe(true);
    expect(s.note).toContain(`run ${lost}`);
    expect(await row()).toBeNull();
    expect(await g.strayCod(kit)).toEqual({ restored: false, note: null });
    // the owner's own later change is never undone
    await kit.settings.set(COD, true, storeTarget(S), { ownerApproved: true, actorId: null, reason: 'the owner switched it on' });
    expect(await g.strayCod(kit)).toEqual({ restored: false, note: null });
    expect((await row())?.value).toBe(true);
    await kit.settings.reset(COD, storeTarget(S), { ownerApproved: true, actorId: null, reason: 'owner' });
  });

  it('a value someone changed during the run is left as they set it', async () => {
    const id = run();
    await open(id);
    const r = await row();
    await kit.settings.set(COD, false, storeTarget(S), { ownerApproved: true, actorId: null, reason: 'the owner, mid-run', expectedVersion: r!.version });
    const c = await g.closeRuns(kit, { runId: id });
    expect(c.runs[0]?.cod).toBe('changed by someone during the run: left as they set it');
    expect((await row())?.value).toBe(false);
  });

  it('the GATE TEST products sit in their own shown category, archived with them at the end', async () => {
    const made = await g.setUpProducts(kit, data, 'cat1');
    const cat = await t.prisma.category.findUniqueOrThrow({ where: { storeId_slug: { storeId: S, slug: data.category.slug } }, select: { id: true, isVisible: true, archivedAt: true } });
    expect(cat).toMatchObject({ isVisible: true, archivedAt: null });
    const prods = await t.prisma.product.findMany({ where: { id: { in: made.products.map((p) => p.id) } }, select: { categoryId: true, listings: { select: { isVisible: true } } } });
    expect(prods.every((p) => p.categoryId === cat.id && p.listings.length === 1 && p.listings[0]!.isVisible)).toBe(true);
    await g.archiveProducts(kit, data, 'cat1');
    expect(await t.prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { isVisible: true } })).toEqual({ isVisible: false });
    expect(await t.prisma.category.count({ where: { id: cat.id, archivedAt: { not: null } } })).toBe(1);
  });
});
