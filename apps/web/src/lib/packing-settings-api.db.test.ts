// S20 · PR 404 — Orders › Packing & print settings cards on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL):
// the print run's "what to print" ships as the stickers only and the sticker as before; a reader with `fulfilment.read`
// sees the cards but may not save; the owner saves a card whole against the version the page showed (a stale one is
// refused, a value outside the schema is refused), and each save is in the audit log and the settings change log.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { packingSettingsHandler } from './packing-settings-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.93' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/packing/settings`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

type Card = { key: string; value: Record<string, unknown>; version: string };

describe.skipIf(!HAS_TEST_DB)('Packing & print settings API on PostgreSQL (S20 · PR 404)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = async (method: string, opts: { body?: unknown; cookie?: string } = {}) => {
    const res = await packingSettingsHandler(call(method, opts), deps);
    return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; details?: string[]; cards?: Record<string, Card> } };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('packing_settings');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(new Request(`https://${HOST}/api/admin/roles`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': 'SampleBrowser/1.0', 'content-type': 'application/json', cookie: owner }, body: JSON.stringify({ nameEn: 'Packing reader', nameBn: 'প্যাকিং দেখা', permissions: ['fulfilment.read'] }) }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(new Request(`https://${HOST}/api/admin/staff`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': 'SampleBrowser/1.0', 'content-type': 'application/json', cookie: owner }, body: JSON.stringify({ email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' }) }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(new Request(`https://${HOST}/api/admin/staff/${staff.staff.id}/roles`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': 'SampleBrowser/1.0', 'content-type': 'application/json', cookie: owner }, body: JSON.stringify({ action: 'assign', roleId: role.role.id }) }), deps, staff.staff.id);
    const first = cookiesOf(await loginHandler(call('POST', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(new Request(`https://${HOST}/api/admin/auth/password`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': 'SampleBrowser/1.0', 'content-type': 'application/json', cookie: first }, body: JSON.stringify({ current: 'first password from the owner', next: 'my own words for this job' }) }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships the stickers only and the sticker as before; a reader sees the cards but may not save them', async () => {
    const g = await api('GET', { cookie: reader });
    expect(g.status).toBe(200);
    expect(g.body.cards!['fulfilment.printRun']!.value).toEqual({ what: 'sticker', invoiceLayout: 'page' });
    expect(g.body.cards!['delivery.sticker.layout']!.value).toMatchObject({ size: '100x150', dpi: 203, maxPerPdf: 100 });
    const card = g.body.cards!['fulfilment.printRun']!;
    const put = await api('PUT', { cookie: reader, body: { key: card.key, value: { what: 'both', invoiceLayout: 'page' }, version: card.version } });
    expect(put.status).toBe(403);
  });

  it('the owner saves a card whole against its version; stale, unknown and wrong values are refused; each save is audited', async () => {
    const g = await api('GET', { cookie: owner });
    const run = g.body.cards!['fulfilment.printRun']!;
    const saved = await api('PUT', { cookie: owner, body: { key: run.key, value: { what: 'both', invoiceLayout: 'roll' }, version: run.version } });
    expect(saved.status).toBe(200);
    expect(saved.body.cards!['fulfilment.printRun']!.value).toEqual({ what: 'both', invoiceLayout: 'roll' });
    expect(await deps.resolver.value('fulfilment.printRun', { storeId: MOTHER_STORE_ID })).toEqual({ what: 'both', invoiceLayout: 'roll' });
    // the version the page showed is old now
    expect((await api('PUT', { cookie: owner, body: { key: run.key, value: { what: 'invoice', invoiceLayout: 'page' }, version: run.version } })).body.error).toBe('STALE');
    const fresh = saved.body.cards!['fulfilment.printRun']!;
    expect((await api('PUT', { cookie: owner, body: { key: run.key, value: { what: 'slip', invoiceLayout: 'page' }, version: fresh.version } })).body).toMatchObject({ error: 'INVALID_INPUT', details: ['what'] });
    expect((await api('PUT', { cookie: owner, body: { key: 'store.name', value: {}, version: fresh.version } })).body).toMatchObject({ error: 'INVALID_INPUT', details: ['key'] });

    const st = g.body.cards!['delivery.sticker.layout']!;
    const a4 = await api('PUT', { cookie: owner, body: { key: st.key, value: { ...st.value, size: 'a4x4', dpi: 300 }, version: st.version } });
    expect(a4.status).toBe(200);
    expect(await deps.resolver.value('delivery.sticker.layout', { storeId: MOTHER_STORE_ID })).toMatchObject({ size: 'a4x4', dpi: 300 });
    // the smallest type may not be larger than the type (the sticker schema's own rule)
    const now = a4.body.cards!['delivery.sticker.layout']!;
    expect((await api('PUT', { cookie: owner, body: { key: now.key, value: { ...now.value, scalePercent: 80, minScalePercent: 90 }, version: now.version } })).body.error).toBe('INVALID_INPUT');

    const audits = await t.prisma.auditLog.findMany({ where: { action: { in: ['fulfilment.printRun.save', 'delivery.sticker.layout.save'] } }, orderBy: { createdAt: 'asc' }, select: { action: true, entityId: true } });
    expect(audits).toEqual([
      { action: 'fulfilment.printRun.save', entityId: 'fulfilment.printRun' },
      { action: 'delivery.sticker.layout.save', entityId: 'delivery.sticker.layout' },
    ]);
  });

  it('PR 406: the handover sheet and the handed-over history are cards too, saved whole and audited', async () => {
    const g = await api('GET', { cookie: owner });
    const sheet = g.body.cards!['delivery.handover.sheet']!;
    expect(sheet.value).toMatchObject({ paper: 'a4', lang: 'en', packOnHandover: false });
    const hist = g.body.cards!['fulfilment.handover.history']!;
    expect(hist.value).toEqual({ days: 7, perCourier: 10 });
    expect((await api('PUT', { cookie: owner, body: { key: sheet.key, value: { ...sheet.value, paper: 'a5', lang: 'bn' }, version: sheet.version } })).status).toBe(200);
    expect(await deps.resolver.value('delivery.handover.sheet', { storeId: MOTHER_STORE_ID })).toMatchObject({ paper: 'a5', lang: 'bn' });
    expect((await api('PUT', { cookie: owner, body: { key: hist.key, value: { days: 91, perCourier: 10 }, version: hist.version } })).body).toMatchObject({ error: 'INVALID_INPUT', details: ['days'] });
    const ok = await api('PUT', { cookie: owner, body: { key: hist.key, value: { days: 30, perCourier: 5 }, version: hist.version } });
    expect(ok.body.cards!['fulfilment.handover.history']!.value).toEqual({ days: 30, perCourier: 5 });
    expect((await api('PUT', { cookie: reader, body: { key: hist.key, value: { days: 3, perCourier: 5 }, version: ok.body.cards!['fulfilment.handover.history']!.version } })).status).toBe(403);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['delivery.handover.sheet.save', 'fulfilment.handover.history.save'] } } })).toBe(2);
  });

  it('refuses other methods', async () => {
    expect((await packingSettingsHandler(call('POST', { cookie: owner, body: {} }), deps)).status).toBe(405);
    expect((await packingSettingsHandler(call('GET', {}), deps)).status).toBe(401);
  });
});
