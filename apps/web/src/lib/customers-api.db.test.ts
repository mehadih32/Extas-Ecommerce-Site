// S14 · PR 284, 285 — the customers admin API end to end on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL):
// login and the permissions (a reader of customers sees masked numbers, may not merge or copy a number); the single
// view by id and by phone; the merge rules' suggestions; a merge with its Idempotency-Key done once; a split with its
// reason; unknown paths, ids and methods refused. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpCustomers, type CustomersFixture } from '@extas/customers/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { automationsRoute } from './automations-api';
import { customersRoute } from './customers-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the customers tests';
const READER_PW = 'another long sentence for the customers tests';
const A = '+8801700002861'; // hardcode-ok: made-up test numbers
const B = '+8801700002862'; // hardcode-ok: made-up test numbers

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; key?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.84' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.key) headers['idempotency-key'] = opts.key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('customers admin API on PostgreSQL (PR 284)', () => {
  let f: CustomersFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let a = '';
  let b = '';
  const api = async (method: string, path: string, opts: { body?: unknown; cookie?: string; key?: string } = {}) => {
    const [p, q] = path.split('?');
    const parts = (p ?? '').split('/').filter(Boolean);
    const res = await customersRoute(call(method, `/api/admin/customers/${parts.join('/')}${q ? `?${q}` : ''}`, { ...opts, cookie: opts.cookie ?? owner }), deps, parts);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpCustomers('customers_api');
    const db = f.t.prisma;
    await syncSettings(db, { registry, messages });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'cus-owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db, resolver: new SettingsResolver(prismaBackend(db), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'cus-owner@example.com', password: OWNER_PW } }), deps));
    await db.staffUser.update({ where: { email: 'customer-reader@example.com' }, data: { passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'customer-reader@example.com', password: READER_PW } }), deps));
    a = await f.profile({ phone: A, name: 'Sample Rahim', email: 'rahim@example.com' });
    b = await f.profile({ phone: B, name: 'Sample Rahim', email: 'RAHIM@example.com' });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('the single view: full number for the owner, masked for a reader; by phone in any form; a login and the key', async () => {
    const own = await api('GET', a);
    expect(own.status).toBe(200);
    expect(own.body.customer).toMatchObject({ id: a, customer: { name: 'Sample Rahim', phone: { dial: '01700002861', masked: false } } });
    const read = await api('GET', a, { cookie: reader });
    expect(read.body.customer.customer.phone).toEqual({ text: '017•••••861', dial: null, masked: true });
    expect((await api('GET', `by-phone?phone=01700002862`, { cookie: reader })).body.match).toEqual({ id: b, matchedId: b });
    expect((await api('GET', a, { cookie: '' })).status).toBe(401);
    expect((await api('GET', '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await api('GET', 'nope')).status).toBe(404);
    expect((await api('PUT', a)).status).toBe(405);
  });

  it('copying the full number needs its key and is logged', async () => {
    expect((await api('POST', `${a}/access`, { cookie: reader, body: { action: 'phone.copy' } })).status).toBe(403);
    const r = await api('POST', `${a}/access`, { body: { action: 'phone.copy' } });
    expect(r).toMatchObject({ status: 201, body: { ok: true, logged: 'phone.copy' } });
    expect(await f.t.prisma.customerAccessLog.count({ where: { customerId: a, action: 'phone.copy' } })).toBe(1);
  });

  it('suggestions, a merge done once with its key, refused for a reader, and a split with its reason', async () => {
    const s = await api('GET', 'merge-suggestions', { cookie: reader });
    expect(s.body).toMatchObject({ ok: true, enabled: true, total: 1 });
    const input = { survivorId: a, mergedId: b, signals: ['email'] };
    expect((await api('POST', 'merge', { cookie: reader, body: input })).status).toBe(403);
    const m = await api('POST', 'merge', { body: input, key: 'cus-api-284-1' });
    expect(m).toMatchObject({ status: 201, body: { result: { decision: 'MERGED', replay: false } } });
    expect((await api('POST', 'merge', { body: input, key: 'cus-api-284-1' })).body.result).toMatchObject({ id: m.body.result.id, replay: true });
    expect((await api('POST', 'merge', { body: { survivorId: b, mergedId: a } })).body).toMatchObject({ ok: false, error: 'ALREADY_MERGED' });
    expect((await api('GET', b)).body.customer).toMatchObject({ id: a, redirectedFrom: b });
    expect((await api('GET', 'merges')).body.rows).toHaveLength(1);
    expect((await api('POST', `merges/${m.body.result.id}/undo`, { body: {} })).body).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await api('POST', `merges/${m.body.result.id}/undo`, { body: { note: 'two brothers' } })).status).toBe(200);
    expect((await api('GET', `merge-preview?a=${a}&b=${b}`)).body.pair).toMatchObject({ survivor: { id: a }, merged: { id: b } });
    expect((await api('GET', `merge-preview?a=${a}&b=${a}`)).status).toBe(404);
  });

  it('PR 285: the list, one row per person, its views counted; masked for a reader; a bad sort refused', async () => {
    const l = await api('GET', '?q=Sample%20Rahim', { cookie: reader });
    expect(l.status).toBe(200);
    expect(l.body.rows.map((r: { id: string }) => r.id).sort()).toEqual([a, b].sort());
    expect(l.body.rows[0].phone.masked).toBe(true);
    expect(l.body.counts.all).toBe(2);
    expect((await api('GET', '?sort=phone')).body).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await api('POST', '')).status).toBe(405);
  });

  it('PR 286: one customer\'s orders, exchanges and support for a reader; "Who looked" only with the audit key', async () => {
    const o = await api('GET', `${a}/orders`, { cookie: reader });
    expect(o.status).toBe(200);
    expect(o.body).toMatchObject({ ok: true, page: 1, total: 0, hasMore: false, rows: [] });
    expect((await api('GET', `${a}/orders?page=0`)).body).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await api('GET', `${a}/exchanges`, { cookie: reader })).body).toEqual({ ok: true, rows: [] });
    expect((await api('GET', `${a}/support`, { cookie: reader })).body).toEqual({ ok: true, rows: [] });
    expect((await api('GET', `${a}/looks`, { cookie: reader })).status).toBe(403);
    const looks = await api('GET', `${a}/looks`);
    expect(looks.status).toBe(200);
    expect(Array.isArray(looks.body.rows)).toBe(true);
    expect((await api('POST', `${a}/orders`)).status).toBe(405);
    expect((await api('GET', `${a}/nothing`)).status).toBe(404);
  });

  it('PR 287: segments — off until the owner turns them on (audited); a reader sees and previews, may not save; save, change, archive', async () => {
    expect((await api('GET', 'segments', { cookie: reader })).body).toMatchObject({ ok: true, screen: { enabled: false, segments: [] } });
    expect((await api('POST', 'segments/preview', { cookie: reader, body: { definition: { v: 1, all: [] } } })).body).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    expect((await api('PUT', 'segments/settings', { cookie: reader, body: { enabled: true } })).status).toBe(403);
    const on = await api('PUT', 'segments/settings', { body: { enabled: true } });
    expect(on.body).toMatchObject({ ok: true, screen: { enabled: true } });
    const pv = await api('POST', 'segments/preview', { cookie: reader, body: { definition: { v: 1, all: [{ field: 'ordersMax', value: 0 }] } } });
    expect(pv.status).toBe(200);
    expect(pv.body.preview.count).toBeGreaterThan(0);
    expect(pv.body.preview.members.every((m: { phone: { masked: boolean } | null }) => !m.phone || m.phone.masked)).toBe(true);
    expect((await api('POST', 'segments', { cookie: reader, body: { name: 'No orders', definition: { v: 1, all: [] } } })).status).toBe(403);
    const made = await api('POST', 'segments', { body: { name: 'No orders', definition: { v: 1, all: [{ field: 'ordersMax', value: 0 }] } } });
    expect(made.status).toBe(201);
    const id = made.body.segment.segment.id as string;
    expect((await api('GET', `segments/${id}`, { cookie: reader })).body.segment.segment.name).toBe('No orders');
    const changed = await api('POST', `segments/${id}`, { body: { name: 'Never ordered', definition: { v: 1, all: [{ field: 'ordersMax', value: 0 }] }, version: made.body.segment.segment.version } });
    expect(changed.body).toMatchObject({ ok: true, segment: { segment: { name: 'Never ordered' } } });
    expect((await api('POST', `segments/${id}`, { body: { name: 'Again', definition: { v: 1, all: [] }, version: made.body.segment.segment.version } })).body).toMatchObject({ ok: false, error: 'STALE' });
    expect((await api('GET', `?segment=${id}`, { cookie: reader })).body).toMatchObject({ ok: true, segment: { id, name: 'Never ordered' } });
    expect((await api('POST', `segments/${id}/archive`, { body: { archived: true } })).body).toMatchObject({ ok: true, result: { archived: true } });
    expect((await api('GET', 'segments/options', { cookie: reader })).body.options).toMatchObject({ categories: expect.any(Array), areas: expect.any(Array) });
    expect((await api('GET', 'segments/not-a-uuid')).status).toBe(404);
    expect((await api('DELETE', `segments/${id}`)).status).toBe(405);
    expect((await api('GET', `segments/${id}/x`)).status).toBe(404);
  });

  it('PR 288: the journey view off until Customer settings turns it on (customers.settings; a reader may not); then rows', async () => {
    expect((await api('GET', `${a}/journey`, { cookie: reader })).body).toMatchObject({ ok: true, journey: { enabled: false, rows: [] } });
    const s = await api('GET', 'settings', { cookie: reader });
    expect(s.body).toMatchObject({ ok: true, screen: { canWrite: false, values: { 'customers.journey': { enabled: false } } } });
    const value = { ...s.body.screen.values['customers.journey'], enabled: true };
    expect((await api('PUT', 'settings', { cookie: reader, body: { key: 'customers.journey', value } })).status).toBe(403);
    expect((await api('PUT', 'settings', { body: { key: 'customers.journey', value: { ...value, perPage: 1 } } })).body).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await api('PUT', 'settings', { body: { key: 'customers.journey', value } })).body).toMatchObject({ ok: true, screen: { canWrite: true, values: { 'customers.journey': { enabled: true } } } });
    const j = await api('GET', `${a}/journey?page=1`, { cookie: reader });
    expect(j.body.journey.enabled).toBe(true);
    expect(j.body.journey.rows.some((r: { kind: string }) => r.kind === 'profile')).toBe(true);
    expect((await api('POST', 'settings', { body: {} })).status).toBe(405);
  });

  it('PR 289: Messages › Automations — off until its settings turn it on; a journey saved off, switched on, archived', async () => {
    const auto = async (method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) => {
      const parts = path.split('/').filter(Boolean);
      const res = await automationsRoute(call(method, `/api/admin/messages/automations/${parts.join('/')}`, { ...opts, cookie: opts.cookie ?? owner }), deps, parts);
      return { status: res.status, body: (await res.json()) as Record<string, any> };
    };
    expect((await auto('GET', '', { cookie: reader })).status).toBe(403); // no messages.journey.read
    expect((await auto('GET', '')).body).toMatchObject({ ok: true, screen: { enabled: false, canWrite: true, journeys: [] } });
    await f.t.prisma.notificationTemplate.create({ data: { storeId: f.S, key: 'crm.api289', name: 'Reminder', channel: 'SMS', locale: 'en', body: 'Time for a new polo, {customerName}?' } });
    const journey = { name: 'Reminder', trigger: { type: 'delivered', days: 60, category: null }, plan: { v: 1, exitOnOrder: true, steps: [{ kind: 'send', channel: 'SMS', template: 'crm.api289' }] } };
    expect((await auto('POST', '', { body: journey })).body).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    expect((await auto('PUT', 'settings', { body: { enabled: true, perCustomerPerWeek: 0 } })).body).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await auto('PUT', 'settings', { body: { enabled: true } })).body).toMatchObject({ ok: true, screen: { enabled: true } });
    const made = await auto('POST', '', { body: journey });
    expect(made.status).toBe(201);
    const id = made.body.editor.journey.id as string;
    expect(made.body.editor.journey).toMatchObject({ enabled: false, name: 'Reminder' });
    expect((await auto('GET', id)).body.editor.templates).toContainEqual({ key: 'crm.api289', channel: 'SMS' });
    expect((await auto('POST', `${id}/switch`, { body: { enabled: true } })).body).toMatchObject({ ok: true, editor: { journey: { enabled: true } } });
    expect((await auto('POST', `${id}/archive`, { body: { archived: true } })).body).toMatchObject({ ok: true, result: { archived: true } });
    expect((await auto('GET', '')).body.screen.archived).toHaveLength(1);
    expect((await auto('GET', '00000000-0000-7000-8000-000000000000')).status).toBe(404);
    expect((await auto('DELETE', id)).status).toBe(405);
  });
});
