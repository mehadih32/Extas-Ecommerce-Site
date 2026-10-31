// S06 · PR 544 — the risk rules admin API end to end on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL):
// login, the same-site check and the permissions (a reader of orders may not see or switch the rules); the list of every
// rule as the settings ship it; a switch saved through the real settings resolver (its change log), the version refusing
// a stale screen, an unknown rule refused with nothing written. PR 161: the levels read and saved whole (off as they ship;
// a stale screen, a band that does not exist, a hold reason not on the list and a partial ask without its percent refused
// with nothing written). PR 162: the blocklist listed, undone and switched through the API, each with its permission
// and its audit row; the switch never offers a cancel. PR 163: the repeat refusers read, their terms chosen and ended
// (`risk.refuser.terms`) and the switch saved, each audited. PR 164: the fraud report read (`risk.report`) with its card,
// the card saved (`settings.write`, audited), a stale or out-of-range card refused. PR 522: the one-parcel card off as
// shipped, saved (an emptied hours box is "not set"), stale refused; "One parcel" groups one person's orders
// (`orders.merge`), audited. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { riskRoute } from './risk-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the risk tests';
const READER_PW = 'another long sentence for the risk tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('risk rules admin API on PostgreSQL (PR 544)', () => {
  let f: OrdersFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; origin?: string } = {}) => {
    const res = await riskRoute(call(method, `/api/admin/risk/${path.join('/')}`, { body: opts.body, cookie: opts.cookie ?? owner, origin: opts.origin }), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('risk_api');
    const db = f.t.prisma;
    await syncSettings(db, { registry, messages });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'risk-owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db, resolver: new SettingsResolver(prismaBackend(db), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'risk-owner@example.com', password: OWNER_PW } }), deps));
    await db.staffUser.update({ where: { email: 'reader@example.com' }, data: { passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: READER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('the list: every rule as the settings ship it; a login and the permission; unknown paths and methods refused', async () => {
    const got = await api('GET', ['rules']);
    expect(got.status).toBe(200);
    expect(got.body.rules.find((r: { key: string }) => r.key === 'risk.duplicateRules')).toMatchObject({ enabled: false, active: false, byDefault: false, label: { en: expect.any(String), bn: expect.any(String) } });
    expect(got.body.rules.find((r: { key: string }) => r.key === 'orders.duplicates')).toMatchObject({ enabled: true, active: true });
    expect((await api('GET', ['rules'], { cookie: '' })).status).toBe(401);
    expect((await api('GET', ['rules'], { cookie: reader })).status).toBe(403);
    expect((await api('PUT', ['rules'], { cookie: reader, body: { switches: { 'risk.score': true } } })).status).toBe(403);
    expect((await api('PUT', ['rules'], { origin: 'https://evil.example.test', body: { switches: { 'risk.score': true } } })).status).toBe(403);
    expect((await api('GET', ['matrix'])).status).toBe(404);
    expect((await api('GET', ['rules', 'x'])).status).toBe(404);
    expect((await api('POST', ['rules'], { body: {} })).status).toBe(405);
  });

  it('a switch is saved through the settings (their change log); a stale screen and an unknown rule are refused', async () => {
    const list = await api('GET', ['rules']);
    const put = await api('PUT', ['rules'], { body: { version: list.body.version, switches: { 'risk.duplicateRules': true, 'risk.duplicateRules.D': true } } });
    expect(put.status).toBe(200);
    expect(put.body.rules.find((r: { key: string }) => r.key === 'risk.duplicateRules.D')).toMatchObject({ enabled: true, active: true, byDefault: false });
    const saved = await deps.resolver.value('risk.duplicateRules', { storeId: f.S });
    expect(saved).toMatchObject({ enabled: true, rules: { D: { enabled: true, windowMinutes: registry['risk.duplicateRules'].default.rules.D.windowMinutes } } });
    expect(await f.t.prisma.settingChange.count({ where: { key: 'risk.duplicateRules' } })).toBeGreaterThanOrEqual(1);
    const stale = await api('PUT', ['rules'], { body: { version: list.body.version, switches: { 'risk.score': true } } });
    expect(stale).toMatchObject({ status: 409, body: { ok: false, error: 'STALE' } });
    const bad = await api('PUT', ['rules'], { body: { switches: { 'risk.score': true, 'nope.rule': false } } });
    expect(bad).toMatchObject({ status: 404, body: { error: 'NOT_FOUND', details: ['nope.rule'] } });
    expect((await deps.resolver.value('risk.score', { storeId: f.S })).enabled).toBe(false);
  });

  it('PR 161: the levels ship off; saved whole through the settings; a stale screen, an unknown band, a reason not on the list and a partial ask without its percent are refused', async () => {
    const got = await api('GET', ['levels']);
    expect(got.status).toBe(200);
    expect(got.body.value).toMatchObject({ enabled: false, partialPercent: null, holdReasonKey: 'risk-check' });
    expect(got.body.bands.map((b: { key: string }) => b.key)).toEqual(['low', 'medium', 'high']);
    expect((await api('GET', ['levels'], { cookie: reader })).status).toBe(403);
    expect((await api('PUT', ['levels'], { cookie: reader, body: { value: got.body.value } })).status).toBe(403);
    expect((await api('POST', ['levels'], { body: {} })).status).toBe(405);
    const value = { ...got.body.value, enabled: true, levels: { ...got.body.value.levels, high: { watch: true, hold: true, call: true, ask: 'full' } } };
    const put = await api('PUT', ['levels'], { body: { version: got.body.version, value } });
    expect(put.status).toBe(200);
    expect(put.body.value.levels.high).toEqual({ watch: true, hold: true, call: true, ask: 'full' });
    expect(put.body.version).not.toBe(got.body.version);
    expect(await deps.resolver.value('risk.levels', { storeId: f.S })).toMatchObject({ enabled: true, levels: { high: { hold: true } } });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'risk.levels.save' } })).toBe(1);
    expect(await api('PUT', ['levels'], { body: { version: got.body.version, value } })).toMatchObject({ status: 409, body: { error: 'STALE' } });
    expect((await api('PUT', ['levels'], { body: { value: { ...value, levels: { ...value.levels, extreme: value.levels.high } } } })).body).toMatchObject({ error: 'INVALID_INPUT', details: ['levels.extreme'] });
    expect((await api('PUT', ['levels'], { body: { value: { ...value, holdReasonKey: 'no-such-reason' } } })).body).toMatchObject({ error: 'REASON_REQUIRED' });
    expect((await api('PUT', ['levels'], { body: { value: { ...value, levels: { ...value.levels, medium: { watch: false, hold: false, call: false, ask: 'partial' } } } } })).body).toMatchObject({ error: 'INVALID_INPUT' });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'risk.levels.save' } })).toBe(1);
  });

  it('PR 542: the advance request card ships with auto off; saved whole with its audit row; a stale screen and a bad value are refused', async () => {
    const got = await api('GET', ['advance']);
    expect(got.status).toBe(200);
    expect(got.body.value).toEqual({ auto: false, channels: { SMS: true, WHATSAPP: false, CALL: true }, provider: 'bkash', template: 'order.advanceRequest' });
    expect(got.body.providers).toContain('nagad');
    expect((await api('GET', ['advance'], { cookie: reader })).status).toBe(403);
    expect((await api('PUT', ['advance'], { cookie: reader, body: { value: got.body.value } })).status).toBe(403);
    expect((await api('DELETE', ['advance'])).status).toBe(405);
    const value = { ...got.body.value, auto: true, provider: 'nagad', channels: { SMS: false, WHATSAPP: true, CALL: true } };
    const put = await api('PUT', ['advance'], { body: { version: got.body.version, value } });
    expect(put).toMatchObject({ status: 200, body: { value } });
    expect(await deps.resolver.value('orders.advanceRequest', { storeId: f.S })).toEqual(value);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'orders.advanceRequest.save' } })).toBe(1);
    expect(await api('PUT', ['advance'], { body: { version: got.body.version, value: got.body.value } })).toMatchObject({ status: 409, body: { error: 'STALE' } });
    expect((await api('PUT', ['advance'], { body: { value: { ...value, provider: 'paypal' } } })).body).toMatchObject({ error: 'INVALID_INPUT' });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'orders.advanceRequest.save' } })).toBe(1);
  });

  it('PR 162: the blocklist listed and undone with a reason, its switch saved (off as shipped, never a cancel); a reader is refused', async () => {
    const got = await api('GET', ['blocklist']);
    expect(got).toMatchObject({ status: 200, body: { value: { enabled: false, onOrder: 'mark' }, active: [], undone: [] } });
    expect((await api('GET', ['blocklist'], { cookie: reader })).status).toBe(403);
    expect((await api('POST', ['blocklist'], { cookie: reader, body: { phone: '01700000601', reason: 'refused three parcels' } })).status).toBe(403);
    expect((await api('POST', ['blocklist'], { origin: 'https://evil.example.test', body: { phone: '01700000601', reason: 'refused three parcels' } })).status).toBe(403);
    expect((await api('POST', ['blocklist'], { body: { phone: '01700000601', reason: 'no' } })).body).toMatchObject({ error: 'INVALID_INPUT' });
    const listed = await api('POST', ['blocklist'], { body: { phone: '01700000601', reason: 'refused three parcels' } });
    expect(listed).toMatchObject({ status: 200, body: { active: [{ phone: '+8801700000601', reason: 'refused three parcels', blockedBy: 'Sample owner' }] } });
    expect(await api('POST', ['blocklist'], { body: { phone: '+8801700000601', reason: 'listed twice by mistake' } })).toMatchObject({ status: 409, body: { error: 'ALREADY_LISTED' } });
    const id = listed.body.active[0].id as string;
    expect((await api('POST', ['blocklist', id, 'unblock'], { cookie: reader, body: { reason: 'paid in advance now' } })).status).toBe(403);
    const undone = await api('POST', ['blocklist', id, 'unblock'], { body: { reason: 'paid in advance now' } });
    expect(undone).toMatchObject({ status: 200, body: { active: [], undone: [{ id, undoReason: 'paid in advance now', undoneBy: 'Sample owner' }] } });
    expect((await api('POST', ['blocklist', 'not-an-id', 'unblock'], { body: { reason: 'paid in advance now' } })).status).toBe(404);
    expect((await api('GET', ['blocklist', id])).status).toBe(404);
    expect((await api('DELETE', ['blocklist'])).status).toBe(405);
    expect((await api('PUT', ['blocklist'], { body: { value: { ...got.body.value, enabled: true, onOrder: 'cancel' } } })).body).toMatchObject({ error: 'INVALID_INPUT' });
    expect((await api('PUT', ['blocklist'], { cookie: reader, body: { value: got.body.value } })).status).toBe(403);
    const put = await api('PUT', ['blocklist'], { body: { value: { ...got.body.value, enabled: true, onOrder: 'hold' } } });
    expect(put).toMatchObject({ status: 200, body: { value: { enabled: true, onOrder: 'hold' } } });
    expect(await deps.resolver.value('risk.blocklist', { storeId: f.S })).toMatchObject({ enabled: true, onOrder: 'hold' });
    for (const action of ['risk.block', 'risk.unblock', 'risk.blocklist.save']) expect(await f.t.prisma.auditLog.count({ where: { action } }), action).toBe(1);
    expect(await f.t.prisma.riskBlock.count()).toBe(1);
  });

  it('PR 163: repeat refusers ship off with no number; terms chosen and ended with a reason; a reader is refused', async () => {
    const got = await api('GET', ['refusers']);
    expect(got).toMatchObject({ status: 200, body: { value: { enabled: false, minRefused: null }, candidates: [], active: [], ended: [] } });
    expect((await api('GET', ['refusers'], { cookie: reader })).status).toBe(403);
    expect((await api('POST', ['refusers', 'terms'], { cookie: reader, body: { phone: '01700000801', terms: 'full', reason: 'refused two parcels' } })).status).toBe(403);
    expect((await api('POST', ['refusers', 'terms'], { body: { phone: '01700000801', terms: 'cancel', reason: 'refused two parcels' } })).body).toMatchObject({ error: 'INVALID_INPUT' });
    const chose = await api('POST', ['refusers', 'terms'], { body: { phone: '01700000801', terms: 'full', reason: 'refused two parcels' } });
    expect(chose).toMatchObject({ status: 200, body: { active: [{ phone: '+8801700000801', terms: 'full', decidedBy: 'Sample owner' }] } });
    expect(await api('POST', ['refusers', 'terms'], { body: { phone: '+8801700000801', terms: 'full', reason: 'the same again' } })).toMatchObject({ status: 409, body: { error: 'NOTHING_CHANGED' } });
    const id = chose.body.active[0].id as string;
    expect((await api('POST', ['refusers', 'terms', id, 'end'], { cookie: reader, body: { reason: 'paid in advance now' } })).status).toBe(403);
    expect(await api('POST', ['refusers', 'terms', id, 'end'], { body: { reason: 'paid in advance now' } })).toMatchObject({ status: 200, body: { active: [], ended: [{ id, endReason: 'paid in advance now' }] } });
    expect((await api('GET', ['refusers', 'terms'])).status).toBe(405);
    expect((await api('GET', ['refusers', 'x'])).status).toBe(404);
    expect((await api('PUT', ['refusers'], { cookie: reader, body: { value: got.body.value } })).status).toBe(403);
    expect(await api('PUT', ['refusers'], { body: { value: { enabled: true, minRefused: 2 } } })).toMatchObject({ status: 200, body: { value: { enabled: true, minRefused: 2 } } });
    expect(await deps.resolver.value('risk.refusers', { storeId: f.S })).toEqual({ enabled: true, minRefused: 2 });
    for (const action of ['risk.refuser.terms', 'risk.refuser.end', 'risk.refusers.save']) expect(await f.t.prisma.auditLog.count({ where: { action } }), action).toBe(1);
  });

  it('PR 164: the fraud report and its card; the card saved with settings.write, a stale or out-of-range card refused', async () => {
    const got = await api('GET', ['report'], { body: undefined });
    expect(got.status).toBe(200);
    expect(got.body.report).toMatchObject({ caught: { any: { orders: expect.any(Number) } }, rto: { real: { parcels: 0, knownMinor: 0 } }, cut: { orders: false, parcels: false } });
    const card = got.body.cards.report as { key: string; value: Record<string, number>; version: string };
    expect(card).toMatchObject({ key: 'report', value: { days: 30, maxRows: 5_000 } });
    expect((await api('GET', ['report'], { cookie: reader })).status).toBe(403);
    expect((await api('GET', ['report', 'x'])).status).toBe(404);
    expect((await api('POST', ['report'], { body: {} })).status).toBe(405);
    expect(await api('PUT', ['report'], { body: { key: 'report', value: { days: 0, maxRows: 5_000 }, version: card.version } })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT', details: ['days'] } });
    expect((await api('PUT', ['report'], { cookie: reader, body: { key: 'report', value: card.value, version: card.version } })).status).toBe(403);
    const put = await api('PUT', ['report'], { body: { key: 'report', value: { days: 7, maxRows: 1_000 }, version: card.version } });
    expect(put).toMatchObject({ status: 200, body: { cards: { report: { value: { days: 7, maxRows: 1_000 } } } } });
    expect(await deps.resolver.value('risk.report', { storeId: f.S })).toEqual({ days: 7, maxRows: 1_000 });
    expect(await api('PUT', ['report'], { body: { key: 'report', value: { days: 9, maxRows: 1_000 }, version: card.version } })).toMatchObject({ status: 409, body: { error: 'STALE' } });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'risk.report.save' } })).toBe(1);
  });

  it('PR 522: one parcel — the card off as shipped and saved; "One parcel" groups one person\'s orders; a reader is refused', async () => {
    const got = await api('GET', ['bundling']);
    const card = got.body.cards.bundling as { key: string; value: Record<string, unknown>; version: string };
    expect(card).toMatchObject({ key: 'bundling', value: { enabled: false, windowHours: null, action: 'propose', maxOrders: 5 } });
    expect((await api('GET', ['bundling'], { cookie: reader })).status).toBe(403);
    expect((await api('GET', ['bundling', 'x'])).status).toBe(404);
    expect((await api('POST', ['bundling'], { body: {} })).status).toBe(405);
    expect((await api('PUT', ['bundling'], { cookie: reader, body: { key: 'bundling', value: card.value, version: card.version } })).status).toBe(403);
    expect(await api('PUT', ['bundling'], { body: { key: 'bundling', value: { ...card.value, maxOrders: 1 }, version: card.version } })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT', details: ['maxOrders'] } });
    expect(await api('PUT', ['bundling'], { body: { key: 'bundling', value: { ...card.value, enabled: true, windowHours: '' }, version: card.version } })).toMatchObject({ status: 200, body: { cards: { bundling: { value: { enabled: true, windowHours: null } } } } });
    expect(await api('PUT', ['bundling'], { body: { key: 'bundling', value: card.value, version: card.version } })).toMatchObject({ status: 409, body: { error: 'STALE' } });
    // nothing to group until the window is set
    const a = await f.place('api-bn-a', { phone: '01700000851' });
    const b = await f.place('api-bn-b', { phone: '01700000851' });
    expect(await api('POST', ['bundle'], { body: { orderId: b.orderId } })).toMatchObject({ status: 422, body: { error: 'NOT_MERGEABLE' } });
    const now = (await api('GET', ['bundling'])).body.cards.bundling as typeof card;
    expect((await api('PUT', ['bundling'], { body: { key: 'bundling', value: { ...now.value, windowHours: 24 }, version: now.version } })).status).toBe(200);
    expect(await deps.resolver.value('risk.bundling', { storeId: f.S })).toEqual({ enabled: true, windowHours: 24, action: 'propose', maxOrders: 5 });
    expect((await api('POST', ['bundle'], { cookie: reader, body: { orderId: b.orderId } })).status).toBe(403);
    expect((await api('GET', ['bundle'])).status).toBe(405);
    const done = await api('POST', ['bundle'], { body: { orderId: b.orderId, note: 'pack together' } });
    expect(done.status).toBe(200);
    const ids = await f.t.prisma.order.findMany({ where: { id: { in: [a.orderId, b.orderId] } }, select: { orderGroupId: true } });
    expect(new Set(ids.map((r) => r.orderGroupId)).size).toBe(1);
    expect(ids[0]!.orderGroupId).toBe(done.body.groupId);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'risk.bundling.save' } })).toBe(2);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'order.bundle' } })).toBe(2);
  });
});
