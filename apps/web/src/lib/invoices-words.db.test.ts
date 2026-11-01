// S20 · PR 409 — the invoice's words and the design preview on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): every `account.invoice.*` word listed with the shop's own; the owner's words saved into
// `language.labels` (other words there untouched), an empty box back to the shop's word, an unknown word, a {slot} the
// word does not have and a stale list refused; a reader sees the words but may not save; the preview needs a design
// and an issued invoice. The settings' and the renderer's design lists stay the same.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { invoicesRoute } from './invoices-api';
import { INVOICE_DESIGNS } from '@extas/documents';
import { INVOICE_DESIGN_NAMES, storeTarget } from '@extas/settings';
import { invoiceWordKeys } from './admin-invoices/words';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string; query?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.93' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/invoices/${opts.path ?? ''}${opts.query ?? ''}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

type Word = { key: string; byDefault: { en: string; bn: string }; en: string; bn: string };

describe.skipIf(!HAS_TEST_DB)('Invoice words and design preview on PostgreSQL (S20 · PR 409)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const words = async (method: string, opts: { body?: unknown; cookie?: string } = {}) => {
    const res = await invoicesRoute(call(method, { ...opts, path: 'words' }), deps, ['words']);
    return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; details?: string[]; version?: string; words?: Word[] } };
  };
  const preview = (design: string, cookie = owner) => invoicesRoute(call('GET', { cookie, path: 'preview', query: `?design=${design}` }), deps, ['preview']);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('invoice_words');
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

  it('lists every word the invoice prints with the shop\'s own; a reader may read but not save', async () => {
    const g = await words('GET', { cookie: reader });
    expect(g.status).toBe(200);
    expect(g.body.words!.map((w) => w.key)).toEqual(invoiceWordKeys());
    expect(g.body.words!.length).toBeGreaterThan(20);
    const title = g.body.words!.find((w) => w.key === 'account.invoice.title')!;
    expect(title.byDefault.en).toBeTruthy();
    expect(title.byDefault.bn).toBeTruthy();
    expect([title.en, title.bn]).toEqual(['', '']);
    expect((await words('PUT', { cookie: reader, body: { words: { 'account.invoice.title': { en: 'Bill' } }, version: g.body.version } })).status).toBe(403);
  });

  it('saves the owner\'s words, keeps the other shop words, gives an emptied word back, refuses wrong ones and a stale list; audited', async () => {
    await deps.resolver.set('language.labels', { 'home.hero.title': { en: 'Sample hero' } } as never, storeTarget(MOTHER_STORE_ID), { actorId: null, reason: 'test' });
    const g = await words('GET', { cookie: owner });
    const codDue = g.body.words!.find((w) => w.key === 'account.invoice.codDue')!;
    const slot = /\{(\w+)\}/.exec(codDue.byDefault.en)?.[0] ?? '';
    const saved = await words('PUT', { cookie: owner, body: { words: { 'account.invoice.title': { en: 'Bill', bn: 'বিল' }, 'account.invoice.codDue': { en: `Pay ${slot} at the door` } }, version: g.body.version } });
    expect(saved.status).toBe(200);
    expect(saved.body.words!.find((w) => w.key === 'account.invoice.title')).toMatchObject({ en: 'Bill', bn: 'বিল' });
    const labels = (await deps.resolver.value('language.labels', { storeId: MOTHER_STORE_ID })) as Record<string, { en?: string; bn?: string }>;
    expect(labels['home.hero.title']).toEqual({ en: 'Sample hero' });
    expect(labels['account.invoice.codDue']).toEqual({ en: `Pay ${slot} at the door` });
    // the version the page showed is old now
    expect((await words('PUT', { cookie: owner, body: { words: { 'account.invoice.title': { en: 'X' } }, version: g.body.version } })).body.error).toBe('STALE');
    const v = saved.body.version;
    expect((await words('PUT', { cookie: owner, body: { words: { 'home.hero.title': { en: 'Hijack' } }, version: v } })).body).toMatchObject({ error: 'INVALID_INPUT', details: ['home.hero.title'] });
    expect((await words('PUT', { cookie: owner, body: { words: { 'account.invoice.title': { en: 'Bill {secret}' } }, version: v } })).body).toMatchObject({ error: 'INVALID_INPUT', details: ['account.invoice.title.en'] });
    const back = await words('PUT', { cookie: owner, body: { words: { 'account.invoice.title': { en: '', bn: '' } }, version: v } });
    expect(back.body.words!.find((w) => w.key === 'account.invoice.title')).toMatchObject({ en: '', bn: '' });
    const after = (await deps.resolver.value('language.labels', { storeId: MOTHER_STORE_ID })) as Record<string, unknown>;
    expect(after['account.invoice.title']).toBeUndefined();
    expect(after['home.hero.title']).toEqual({ en: 'Sample hero' });
    expect(await t.prisma.auditLog.count({ where: { action: 'orders.invoiceWords.save' } })).toBe(2);
  });

  it('the preview needs a known design and an issued invoice; a reader without orders.invoice may not see it', async () => {
    expect(INVOICE_DESIGN_NAMES).toEqual(INVOICE_DESIGNS);
    expect((await preview('neon')).status).toBe(400);
    expect((await preview('classic', reader)).status).toBe(403);
    const none = await preview('classic');
    expect(none.status).toBe(404);
    expect(((await none.json()) as { error: string }).error).toBe('NOT_FOUND');
    expect((await invoicesRoute(call('POST', { cookie: owner, path: 'preview', body: {} }), deps, ['preview'])).status).toBe(405);
  });
});
