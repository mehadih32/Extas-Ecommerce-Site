// S22 · PR 425 — the support admin API on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): login and the path table's refusals, the inbox with its views, one conversation, a file
// uploaded (checked by its contents) and read back, a reply kept as NOT_SENT while no channel is connected, a note, a
// stale press refused, take / status, the who-did-what log, a read-only person refused at the door, and the settings.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { MediaDeps } from '@extas/media';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { receiveMessage } from '@extas/support';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { supportRoute } from './support-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const READER_PW = 'another long sentence for tests';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; form?: FormData } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const body = opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  return new Request(`https://${HOST}${path}`, { method, headers, body });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
const read = async (res: Response) => (await res.json()) as Record<string, any>;

describe.skipIf(!HAS_TEST_DB)('Support admin API on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let media: MediaDeps;
  let owner = '';
  let reader = '';
  let storeId = 0;
  let conversationId = '';
  const api = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; form?: FormData; query?: string } = {}) => {
    const url = `/api/admin/support${path.length ? `/${path.join('/')}` : ''}${opts.query ?? ''}`;
    const res = await supportRoute(call(method, url, { body: opts.body, form: opts.form, cookie: opts.cookie ?? owner }), deps, path, media);
    return res;
  };
  const j = async (method: string, path: string[], opts: Parameters<typeof api>[2] = {}) => {
    const res = await api(method, path, opts);
    return { status: res.status, body: await read(res) };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('support_api');
    [storeId] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, resolver, vault: null };
    const storage = memoryStorage();
    media = { db: t.prisma, settings: resolver, storage: async () => storage };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));

    // a person who may only read the inbox
    const role = await read(await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Inbox reader', nameBn: 'ইনবক্স দেখা', permissions: ['support.read'] } }), deps));
    const staff = await read(await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: READER_PW } }), deps));
    const staffId = (staff.staff as { id: string }).id;
    await staffRolesHandler(call('POST', `/api/admin/staff/${staffId}/roles`, { cookie: owner, body: { action: 'assign', roleId: (role.role as { id: string }).id, storeId } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: READER_PW } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: READER_PW, next: 'my own words for this job' } }), deps));

    await t.prisma.supportChannel.create({ data: { storeId, kind: 'livechat', externalId: 'sample-chat', name: 'Sample chat', enabled: true } });
    const got = await receiveMessage(
      { db: t.prisma, settings: resolver },
      { storeId, channel: { kind: 'livechat', externalId: 'sample-chat' }, contact: { externalId: 'v-1', name: 'Sample visitor' }, message: { externalId: 'm-1', text: 'Sample: is the polo in size M?' } },
    );
    conversationId = got.conversationId;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login; unknown paths and methods are refused', async () => {
    expect((await api('GET', [], { cookie: '' })).status).toBe(401);
    expect((await api('GET', ['nope'])).status).toBe(404);
    expect((await api('GET', ['c', 'not-a-uuid'])).status).toBe(404);
    expect((await api('POST', [])).status).toBe(405);
    expect((await api('GET', ['c', conversationId, 'messages'])).status).toBe(405);
    expect((await api('DELETE', ['settings'])).status).toBe(405);
    expect((await api('GET', [], { query: '?storeId=x' })).status).toBe(400);
  });

  it('the inbox: the open view with its counts, a search, and one conversation', async () => {
    const r = await j('GET', [], { query: '?view=open' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ view: 'open', counts: { open: 1, all: 1, solved: 0 }, page: 1 });
    expect(r.body.rows[0]).toMatchObject({ id: conversationId, status: 'OPEN', contact: { name: 'Sample visitor' }, lastDirection: 'IN' });
    expect((await j('GET', [], { query: '?view=all&q=nobody-at-all' })).body.rows).toEqual([]);
    const c = await j('GET', ['c', conversationId]);
    expect(c.body.thread).toMatchObject({ id: conversationId, status: 'OPEN', you: { reply: true, assign: true } });
    expect(c.body.thread.messages.map((m: { direction: string }) => m.direction)).toEqual(['IN']);
    expect((await j('GET', ['c', '0192f0e0-0000-7000-8000-000000000425'])).body.error).toBe('NOT_FOUND');
  });

  it('a file is checked by its contents, stored, and read back as it was', async () => {
    const text = new FormData();
    text.set('file', new File([new TextEncoder().encode('just words')], 'photo.jpg', { type: 'image/jpeg' }));
    expect((await j('POST', ['files'], { form: text })).body.error).toBe('FILE_NOT_ALLOWED');
    const form = new FormData();
    form.set('file', new File([PNG], 'sample photo.png', { type: 'image/png' }));
    const up = await j('POST', ['files'], { form });
    expect(up.status).toBe(201);
    expect(up.body.file).toMatchObject({ kind: 'IMAGE', contentType: 'image/png', fileName: 'sample photo.png', sizeBytes: PNG.byteLength });

    const sent = await j('POST', ['c', conversationId, 'messages'], { body: { body: 'Sample: yes, here it is.', assetIds: [up.body.file.id], requestKey: 'sample-press-0001' } });
    expect(sent.status).toBe(200);
    // no connector is built yet (PR 426): the reply is kept, never lost, and says why it did not go out
    expect(sent.body).toMatchObject({ delivery: 'NOT_SENT', failReason: 'CHANNEL_NOT_CONNECTED', replay: false });
    const again = await j('POST', ['c', conversationId, 'messages'], { body: { body: 'Sample: yes, here it is.', assetIds: [up.body.file.id], requestKey: 'sample-press-0001' } });
    expect(again.body).toMatchObject({ messageId: sent.body.messageId, replay: true });

    const thread = (await j('GET', ['c', conversationId])).body.thread;
    expect(thread.status).toBe('WAITING');
    const file = thread.messages[1].files[0];
    expect(file).toMatchObject({ kind: 'IMAGE', ready: true, status: 'STORED' });
    const res = await api('GET', ['files', file.id]);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it('a note stays inside; a stale press is refused; take it and mark it solved; the log says who did what', async () => {
    const before = (await j('GET', ['c', conversationId])).body.thread;
    const note = await j('POST', ['c', conversationId, 'messages'], { body: { body: 'Sample note: likes navy.', note: true, requestKey: 'sample-press-0002', version: before.version } });
    expect(note.body).toMatchObject({ delivery: null });
    expect((await j('POST', ['c', conversationId, 'status'], { body: { status: 'SOLVED', version: before.version } })).body.error).toBe('STALE');

    const me = (await j('GET', ['staff'])).body.staff.find((s: { name: string }) => s.name === 'Sample owner');
    expect(me).toBeTruthy();
    expect((await j('POST', ['c', conversationId, 'assign'], { body: { staffId: me.id } })).body).toMatchObject({ changed: true });
    expect((await j('POST', ['c', conversationId, 'status'], { body: { status: 'SOLVED' } })).body).toMatchObject({ changed: true, status: 'SOLVED' });

    const thread = (await j('GET', ['c', conversationId])).body.thread;
    expect(thread).toMatchObject({ status: 'SOLVED', assignedTo: { id: me.id, name: 'Sample owner' } });
    expect(thread.events.map((e: { kind: string }) => e.kind)).toEqual(expect.arrayContaining(['RECEIVED', 'REPLIED', 'NOTED', 'ASSIGNED', 'STATUS']));
    const replied = thread.events.find((e: { kind: string }) => e.kind === 'REPLIED');
    expect(replied.actor).toMatchObject({ type: 'STAFF', name: 'Sample owner' });
    expect((await j('GET', [], { query: '?view=solved' })).body.rows.map((r: { id: string }) => r.id)).toEqual([conversationId]);
  });

  it('a person who may only read sees the inbox but cannot reply, upload or change settings', async () => {
    expect((await j('GET', [], { cookie: reader })).status).toBe(200);
    expect((await j('GET', ['c', conversationId], { cookie: reader })).body.thread.you).toMatchObject({ reply: false, assign: false });
    expect((await api('POST', ['c', conversationId, 'messages'], { cookie: reader, body: { body: 'x', requestKey: 'sample-press-0003' } })).status).toBe(403);
    expect((await api('POST', ['files'], { cookie: reader, form: new FormData() })).status).toBe(403);
    expect((await api('PUT', ['settings'], { cookie: reader, body: {} })).status).toBe(403);
    expect((await j('GET', ['settings'], { cookie: reader })).status).toBe(200);
  });

  it('the settings: read with their versions, a card saved whole, a stale save refused', async () => {
    const r = await j('GET', ['settings']);
    const files = { enabled: true, maxPerMessage: 4, maxMb: 10, kinds: { image: true, video: true, pdf: true } };
    expect(r.body.cards['support.attachments'].value).toEqual(files);
    expect(Object.keys(r.body.cards).sort()).toEqual(['support.attachments', 'support.inbox']);
    const version = r.body.cards['support.attachments'].version as string;
    const saved = await j('PUT', ['settings'], { body: { key: 'support.attachments', value: { ...files, maxPerMessage: 3 }, version } });
    expect(saved.status).toBe(200);
    expect(saved.body.cards['support.attachments'].value).toEqual({ ...files, maxPerMessage: 3 });
    expect((await j('PUT', ['settings'], { body: { key: 'support.attachments', value: files, version } })).body.error).toBe('STALE');
    expect((await j('PUT', ['settings'], { body: { key: 'support.attachments', value: { ...files, maxMb: 99 }, version: saved.body.cards['support.attachments'].version } })).status).toBe(400);
    // put it back for the tests after this one
    expect((await j('PUT', ['settings'], { body: { key: 'support.attachments', value: files, version: saved.body.cards['support.attachments'].version } })).status).toBe(200);
  });
});
