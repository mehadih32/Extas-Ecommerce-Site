// S22 · PR 425 — the support admin API on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): login and the path table's refusals, the inbox with its views, one conversation, a file
// uploaded (checked by its contents) and read back, a reply kept as NOT_SENT while no channel is connected, a note, a
// stale press refused, take / status, the who-did-what log, a read-only person refused at the door, and the settings.
// PR 426: the channels list (add, switch, rename, put away) and the live chat switched on making its channel.
// PR 427: who is writing — the card switched on, a number typed in the site's chat links its customer and joins the
// same person's other chat; set by hand, "not this customer", "not the same person" through the identity route.
// PR 428: the thread's customer card (his orders, the one on its way), the card switched off.
// PR 429: products in the chat — off, the drawer's routes refuse; switched on, the search and one product sent with its
// tracked link, the thread's card; a reader is refused at the door; the shop's click route keeps the reference.
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
import { supportRefHandler } from './shop/support-ref';
import { SUPPORT_REF_COOKIE } from './shop/support-ref-model';

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
    // ~~no connector is built yet (PR 426)~~ PR 426: the site chat is off as it ships, so the reply is kept, never lost,
    // and says why it did not go out
    expect(sent.body).toMatchObject({ delivery: 'NOT_SENT', failReason: 'LIVE_CHAT_OFF', replay: false });
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
    expect(Object.keys(r.body.cards).sort()).toEqual(['checkout.callMe', 'support.attachments', 'support.catalogue', 'support.channels', 'support.context', 'support.identity', 'support.inbox', 'support.liveChat']);
    const version = r.body.cards['support.attachments'].version as string;
    const saved = await j('PUT', ['settings'], { body: { key: 'support.attachments', value: { ...files, maxPerMessage: 3 }, version } });
    expect(saved.status).toBe(200);
    expect(saved.body.cards['support.attachments'].value).toEqual({ ...files, maxPerMessage: 3 });
    expect((await j('PUT', ['settings'], { body: { key: 'support.attachments', value: files, version } })).body.error).toBe('STALE');
    expect((await j('PUT', ['settings'], { body: { key: 'support.attachments', value: { ...files, maxMb: 99 }, version: saved.body.cards['support.attachments'].version } })).status).toBe(400);
    // put it back for the tests after this one
    expect((await j('PUT', ['settings'], { body: { key: 'support.attachments', value: files, version: saved.body.cards['support.attachments'].version } })).status).toBe(200);
  });

  it('PR 426: the channels list — a reader sees it, an owner adds a Page (off), switches, renames, puts it away; the chat switched on makes its channel', async () => {
    const list = await j('GET', ['channels'], { cookie: reader });
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ canEdit: false, rows: [expect.objectContaining({ kind: 'livechat', externalId: 'sample-chat', conversations: 1, liveChatOn: false })] });
    expect((await api('POST', ['channels'], { cookie: reader, body: { action: 'add', kind: 'messenger', externalId: '100200300', name: 'Sample Page' } })).status).toBe(403);
    expect((await api('PUT', ['channels'])).status).toBe(405);
    expect((await j('POST', ['channels'], { body: { action: 'add', kind: 'messenger', externalId: 'not digits', name: 'Sample Page' } })).body.error).toBe('INVALID_INPUT');
    const added = await j('POST', ['channels'], { body: { action: 'add', kind: 'messenger', externalId: '100200300', name: 'Sample Page' } });
    expect(added.status).toBe(200);
    const page = added.body.rows.find((r: { id: string }) => r.id === added.body.id);
    expect(page).toMatchObject({ kind: 'messenger', enabled: false, archived: false });
    const on = await j('POST', ['channels'], { body: { action: 'switch', id: page.id, enabled: true, version: page.version } });
    expect(on.body.rows.find((r: { id: string }) => r.id === page.id)).toMatchObject({ enabled: true });
    expect((await j('POST', ['channels'], { body: { action: 'rename', id: page.id, name: 'Sample Page 2', version: page.version } })).body.error).toBe('STALE');
    expect((await j('POST', ['channels'], { body: { action: 'archive', id: page.id, archived: true } })).body.rows.find((r: { id: string }) => r.id === page.id)).toMatchObject({ archived: true, enabled: false });
    expect(await t.prisma.auditLog.count({ where: { entityType: 'SupportChannel', entityId: page.id } })).toBe(3);

    const cards = (await j('GET', ['settings'])).body.cards;
    expect(cards['support.liveChat'].value).toMatchObject({ enabled: false });
    const chat = { ...cards['support.liveChat'].value, enabled: true };
    expect((await j('PUT', ['settings'], { body: { key: 'support.liveChat', value: chat, version: cards['support.liveChat'].version } })).status).toBe(200);
    expect(await t.prisma.supportChannel.findUniqueOrThrow({ where: { storeId_kind_externalId: { storeId, kind: 'livechat', externalId: 'site' } } })).toMatchObject({ name: 'Site chat', enabled: true });
    const after = (await j('GET', ['settings'])).body.cards['support.liveChat'];
    expect((await j('PUT', ['settings'], { body: { key: 'support.liveChat', value: { ...chat, enabled: false }, version: after.version } })).status).toBe(200);
  });

  it('PR 427: who is writing — switched on, a number in the chat links its customer; by hand through the identity route', async () => {
    const cards = (await j('GET', ['settings'])).body.cards;
    expect(cards['support.identity'].value).toEqual({ enabled: false, fromText: true, autoLink: true });
    expect((await j('PUT', ['settings'], { body: { key: 'support.identity', value: { enabled: true, fromText: true, autoLink: true }, version: cards['support.identity'].version } })).status).toBe(200);
    // hardcode-ok: a made-up customer number
    const customer = await t.prisma.customer.create({ data: { storeId, phone: '+8801712000427', name: 'Sample buyer' } });
    const resolver = deps.resolver;
    const say = (contact: string, id: string, text: string) =>
      receiveMessage({ db: t.prisma, settings: resolver }, { storeId, channel: { kind: 'livechat', externalId: 'sample-chat' }, contact: { externalId: contact, name: 'Sample visitor' }, message: { externalId: id, text } });
    const first = await say('v-427a', 'm-427a', 'amar number 01712-000427');
    const second = await say('v-427b', 'm-427b', 'ami abar, ০১৭১২০০০৪২৭');
    const th = (await j('GET', ['c', second.conversationId])).body.thread;
    expect(th.customer.id).toBe(customer.id);
    expect(th.person.chats.map((c: { id: string }) => c.id)).toEqual([first.conversationId]);
    expect(th.you.identity).toBe(true);
    expect(th.events.map((e: { kind: string }) => e.kind)).toContain('IDENTITY_MERGED');

    // a reader may not; a wrong number, an unknown action and a stale press are refused
    expect((await api('POST', ['c', second.conversationId, 'identity'], { cookie: reader, body: { action: 'split' } })).status).toBe(403);
    expect((await j('POST', ['c', second.conversationId, 'identity'], { body: { action: 'phone', phone: '12345' } })).body.error).toBe('INVALID_INPUT');
    expect((await j('POST', ['c', second.conversationId, 'identity'], { body: { action: 'merge' } })).status).toBe(400);
    expect((await j('POST', ['c', second.conversationId, 'identity'], { body: { action: 'split', version: 'old' } })).body.error).toBe('STALE');
    const split = await j('POST', ['c', second.conversationId, 'identity'], { body: { action: 'split', version: th.version } });
    expect(split.status).toBe(200);
    expect((await j('GET', ['c', second.conversationId])).body.thread.person.chats).toEqual([]);
    const un = await j('POST', ['c', second.conversationId, 'identity'], { body: { action: 'unlink', version: split.body.version } });
    expect(un.body).toMatchObject({ ok: true, customerId: null });
    expect((await j('POST', ['c', second.conversationId, 'identity'], { body: { action: 'unlink' } })).body.error).toBe('NOT_LINKED');
    const phone = await j('POST', ['c', second.conversationId, 'identity'], { body: { action: 'phone', phone: '01712 000 427' } });
    expect(phone.body).toMatchObject({ ok: true, customerId: customer.id });
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'support.identity.' } } })).toBe(3);
  });

  it('PR 428: the customer beside the chat — on as it ships, his orders and the one on its way; off, the card is gone', async () => {
    const customer = await t.prisma.customer.findFirstOrThrow({ where: { storeId, phone: '+8801712000427' } });
    await t.prisma.order.create({
      data: { storeId, number: 'S428-1', source: 'WEBSITE', currency: 'BDT', status: 'CONFIRMED', placedAt: new Date('2026-10-30T06:00:00Z'), subtotalMinor: 150_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 150_000, paymentMethod: 'COD', customerId: customer.id, phone: customer.phone, idempotencyKey: 's428-1', riskScore: 12, riskBand: 'low' },
    });
    const chat = await t.prisma.conversation.findFirstOrThrow({ where: { storeId, customerId: customer.id } });
    const th = (await j('GET', ['c', chat.id])).body.thread;
    expect(th.context).toMatchObject({ matchedBy: 'customer', customer: { id: customer.id }, orders: 1, history: { orders: 1, open: 1 }, risk: { score: 12, number: 'S428-1' } });
    expect(th.context.live.map((o: { number: string }) => o.number)).toEqual(['S428-1']);
    const cards = (await j('GET', ['settings'])).body.cards;
    expect(cards['support.context'].value).toEqual({ enabled: true, recentOrders: 3 });
    expect((await j('PUT', ['settings'], { body: { key: 'support.context', value: { enabled: true, recentOrders: 11 }, version: cards['support.context'].version } })).status).toBe(400);
    expect((await j('PUT', ['settings'], { body: { key: 'support.context', value: { enabled: false, recentOrders: 3 }, version: cards['support.context'].version } })).status).toBe(200);
    expect((await j('GET', ['c', chat.id])).body.thread.context).toBeNull();
  });
  it('PR 429: products in the chat — off, refused; on, a search and one product sent with its link; the shop keeps the click', async () => {
    const live = await t.prisma.product.create({ data: { storeId, slug: 'sample-api-polo', nameEn: 'Sample API Polo', status: 'PUBLISHED', publishedAt: new Date() } });
    const v = await t.prisma.productVariant.create({ data: { storeId, productId: live.id, sku: 'SAP-1', active: true, inStock: true, priceMinor: 99_000 } });
    expect((await j('GET', ['catalogue'], { query: '?q=api' })).body.error).toBe('CATALOGUE_OFF');
    const cards = (await j('GET', ['settings'])).body.cards;
    expect(cards['support.catalogue'].value).toEqual({ enabled: false, photos: 3, results: 8, creditDays: 7 });
    const on = await j('PUT', ['settings'], { body: { key: 'support.catalogue', value: { enabled: true, photos: 0, results: 8, creditDays: 7 }, version: cards['support.catalogue'].version } });
    expect(on.status).toBe(200);
    const found = await j('GET', ['catalogue'], { query: '?q=sap-1' });
    expect(found.body.products.map((p: { id: string }) => p.id)).toEqual([live.id]);
    expect((await j('GET', ['catalogue'], { query: '?q=api', cookie: reader })).status).toBe(403);
    const th = (await j('GET', ['c', conversationId])).body.thread;
    expect(th.you.catalogue).toBe(true);
    const sent = await j('POST', ['c', conversationId, 'products'], { body: { productId: live.id, variantId: v.id, requestKey: 'api-share-429', version: th.version } });
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ ok: true, replay: false, photos: 0 });
    expect(sent.body.link).toMatch(new RegExp(`/sample-api-polo\\?r=${sent.body.refCode}$`));
    expect((await j('POST', ['c', conversationId, 'products'], { body: { productId: live.id, requestKey: 'api-share-429b' }, cookie: reader })).status).toBe(403);
    const msg = (await j('GET', ['c', conversationId])).body.thread.messages.find((m: { id: string }) => m.id === sent.body.messageId);
    expect(msg.share).toMatchObject({ productId: live.id, refCode: sent.body.refCode, openedAt: null, order: null });

    // the shop: same site only; an unknown reference keeps nothing; this one is kept for the order's credit
    const shop = (body: unknown, origin = `https://${HOST}`) => new Request(`https://${HOST}/api/shop/support-ref`, { method: 'POST', headers: { host: HOST, origin, 'content-type': 'text/plain' }, body: JSON.stringify(body) });
    const sd = { db: t.prisma, settings: deps.resolver };
    expect((await supportRefHandler(shop({ r: sent.body.refCode }, 'https://elsewhere.example'), storeId, sd)).status).toBe(403);
    const unknown = await supportRefHandler(shop({ r: 'nosuchref429' }), storeId, sd);
    expect(unknown.status).toBe(204);
    expect(unknown.headers.getSetCookie()).toEqual([]);
    const kept = await supportRefHandler(shop({ r: sent.body.refCode }), storeId, sd);
    expect(kept.status).toBe(204);
    expect(kept.headers.getSetCookie()[0]).toMatch(new RegExp(`^${SUPPORT_REF_COOKIE}=${sent.body.refCode}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$`));
    expect((await t.prisma.supportProductShare.findFirstOrThrow({ where: { refCode: sent.body.refCode } })).clickedAt).not.toBeNull();
  });
});
