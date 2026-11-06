// S02 · PR 78 — Website › Words & language on a real PostgreSQL: the list reads the shop's words with the owner's own
// (`language.labels`); a row save and a CSV import change only their words (the invoice's words untouched), back to the
// shop's word removes the owner's; the shop reads them (`shopT`); refused: a word the shop lacks, a {slot} its word lacks,
// a save after another save (also one from Orders › Invoices); seeing needs `website.read`, saving `website.words.write`;
// audited once per save that changes something; the CSV export is every word.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { shopT } from '../shop/dict';
import { WORD_KEYS } from './words';
import { dictionaryHandler, type WordsView } from './words-admin';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.78', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/website/dictionary'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Website › Words & language on PostgreSQL (PR 78)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = WordsView & { ok: boolean; error?: string; details?: (string | number)[]; changed?: string[]; saved?: Record<string, { en?: string; bn?: string }> };
  const api = async (method: string, o: { body?: unknown; cookie?: string; q?: string } = {}) => {
    const res = await dictionaryHandler(req(method, { body: o.body, cookie: o.cookie ?? owner, path: `/api/admin/website/dictionary${o.q ? `?${o.q}` : ''}` }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const labels = async () => (await resolver.value('language.labels', { storeId: S })) as Record<string, { en?: string; bn?: string }> | null;
  const KEY = 'checkout.title';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_shop_words');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Site desk', nameBn: 'সাইট ডেস্ক', permissions: ['website.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('lists the shop words; seeing needs website.read, saving website.words.write', async () => {
    const all = await api('GET', { cookie: desk });
    expect(all.status).toBe(200);
    expect(all.a).toMatchObject({ ok: true, total: WORD_KEYS.length, p: 1, changed: 0 });
    expect(all.a.rows[0]).toMatchObject({ own: { en: '', bn: '' }, changed: false });
    const found = await api('GET', { q: `q=${encodeURIComponent(KEY)}&where=checkout` });
    expect(found.a.rows.map((r) => r.key)).toContain(KEY);
    expect((await api('PUT', { cookie: desk, body: { version: all.a.version, words: { [KEY]: { en: 'Sample' } } } })).status).toBe(403);
    expect((await dictionaryHandler(req('DELETE'), admin)).status).toBe(405);
  });

  it('saves one word, keeps the invoice words, the shop shows it, back to the shop\'s word; audited once', async () => {
    await resolver.set('language.labels', { 'account.invoice.title': { en: 'Sample invoice' } } as never, storeTarget(S), { actorId: null, reason: 'test' });
    const v = (await api('GET')).a.version;
    const put = await api('PUT', { body: { version: v, words: { [KEY]: { en: 'Sample pay', bn: 'নমুনা পেমেন্ট' } } } });
    expect(put.a).toMatchObject({ ok: true, changed: [KEY], saved: { [KEY]: { en: 'Sample pay', bn: 'নমুনা পেমেন্ট' } } });
    expect(await labels()).toEqual({ 'account.invoice.title': { en: 'Sample invoice' }, [KEY]: { en: 'Sample pay', bn: 'নমুনা পেমেন্ট' } });
    expect(shopT('bn', await labels())(KEY)).toBe('নমুনা পেমেন্ট');
    const again = await api('PUT', { body: { version: put.a.version, words: { [KEY]: { en: 'Sample pay' } } } });
    expect(again.a).toMatchObject({ ok: true, changed: [] });
    expect(await t.prisma.auditLog.count({ where: { action: 'website.words.save' } })).toBe(1);
    const changed = await api('GET', { q: 'show=changed' });
    expect(changed.a.rows.map((r) => r.key).sort()).toEqual(['account.invoice.title', KEY].sort());
    const back = await api('PUT', { body: { version: again.a.version, words: { [KEY]: { en: '', bn: '' } } } });
    expect(back.a.ok).toBe(true);
    expect(await labels()).toEqual({ 'account.invoice.title': { en: 'Sample invoice' } });
    const log = await t.prisma.auditLog.findMany({ where: { action: 'website.words.save' }, orderBy: { createdAt: 'asc' } });
    expect(log).toHaveLength(2);
    expect(log[1]!.before).toEqual({ [KEY]: { en: 'Sample pay', bn: 'নমুনা পেমেন্ট' } });
    expect(log[1]!.after).toEqual({ [KEY]: null });
  });

  it('refuses an unknown word, a {slot} the shop\'s word lacks, a stale version and a bad body', async () => {
    const v = (await api('GET')).a.version;
    expect((await api('PUT', { body: { version: v, words: { 'nowhere.word': { en: 'x' } } } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['nowhere.word'] });
    expect((await api('PUT', { body: { version: v, words: { [KEY]: { en: 'Pay {secret}' } } } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: [`${KEY}.en`] });
    expect((await api('PUT', { body: { version: 'old', words: { [KEY]: { en: 'x' } } } })).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await api('PUT', { body: { words: {} } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['version'] });
    expect((await api('PUT', { body: { version: v } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['words'] });
    expect(await labels()).toEqual({ 'account.invoice.title': { en: 'Sample invoice' } });
  });

  it('exports every word as CSV and imports an edited file; a bad file changes nothing', async () => {
    const res = await dictionaryHandler(req('GET', { cookie: desk, path: '/api/admin/website/dictionary?format=csv' }), admin);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const file = await res.text();
    expect(file.split('\r\n').filter(Boolean)).toHaveLength(WORD_KEYS.length + 1);
    expect(file).toContain('Sample invoice');
    const v = (await api('GET')).a.version;
    expect((await api('PUT', { body: { version: v, csv: file } })).a).toMatchObject({ ok: true, changed: [] });
    expect((await api('PUT', { body: { version: v, csv: 'word,text\r\n' } })).a).toMatchObject({ ok: false, error: 'CSV_COLUMNS' });
    expect((await api('PUT', { body: { version: v, csv: `key,english\r\nnowhere.word,x\r\n` } })).a).toMatchObject({ ok: false, error: 'CSV_KEYS', details: [2] });
    expect((await api('PUT', { body: { version: v, csv: `key,english\r\n${KEY},"open` } })).a).toMatchObject({ ok: false, error: 'CSV_SYNTAX' });
    const put = await api('PUT', { body: { version: v, csv: `key,bengali\r\n${KEY},নমুনা চেকআউট\r\naccount.status.ON_HOLD,নমুনা অপেক্ষা\r\n` } });
    expect(put.a).toMatchObject({ ok: true, changed: [KEY, 'account.status.ON_HOLD'] });
    expect(await labels()).toEqual({ 'account.invoice.title': { en: 'Sample invoice' }, [KEY]: { bn: 'নমুনা চেকআউট' }, 'account.status.ON_HOLD': { bn: 'নমুনা অপেক্ষা' } });
    expect((await api('PUT', { cookie: desk, body: { version: put.a.version, csv: file } })).status).toBe(403);
  });
});
