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
// PR 430: orders from the chat — off, the bag's route refuses; switched on, a piece into the chat's bag, priced with the
// gate, and "Create order" placed with the chat's channel as its source, linked to the conversation; a reader is refused.
// PR 431: tickets — switched on, a late chat is in the Late view, on the chat's ticket and in the owner's notifications
// (not a reader's); the answer takes it out of the bell.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { MediaDeps } from '@extas/media';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { receiveMessage } from '@extas/support';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { notificationsHandler } from './admin-shell/api';
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
    expect(Object.keys(r.body.cards).sort()).toEqual(['checkout.callMe', 'support.app', 'support.attachments', 'support.blockList', 'support.cart', 'support.catalogue', 'support.channels', 'support.context', 'support.draftKeywords', 'support.draftWords', 'support.drafts', 'support.followUp', 'support.followUpWords', 'support.identity', 'support.inbox', 'support.liveChat', 'support.privacy', 'support.tickets', 'support.deskHours', 'support.escalation', 'support.linkSafety'].sort());
    // PR 538: a desk that closes before it opens is refused; a real one is kept (and put back)
    const desk = r.body.cards['support.deskHours'];
    expect((await j('PUT', ['settings'], { body: { key: 'support.deskHours', value: { ...desk.value, opens: '22:00', closes: '10:00' }, version: desk.version } })).status).toBe(400);
    const deskSaved = await j('PUT', ['settings'], { body: { key: 'support.deskHours', value: { ...desk.value, enabled: true, closes: '21:30' }, version: desk.version } });
    expect(deskSaved.body.cards['support.deskHours'].value).toMatchObject({ enabled: true, opens: '10:00', closes: '21:30' });
    expect((await j('PUT', ['settings'], { body: { key: 'support.deskHours', value: desk.value, version: deskSaved.body.cards['support.deskHours'].version } })).status).toBe(200);
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

  it('PR 430: orders from the chat — off, refused; on, the bag priced with its gate and the order kept on its channel', async () => {
    const p = await t.prisma.product.create({ data: { storeId, slug: 'sample-api-tee', nameEn: 'Sample API Tee', status: 'PUBLISHED', publishedAt: new Date() } });
    const v = await t.prisma.productVariant.create({ data: { storeId, productId: p.id, sku: 'SAT-1', active: true, inStock: true, priceMinor: 55_000 } });
    const wh = await t.prisma.warehouse.create({ data: { code: 'WH-430', name: 'Sample warehouse' } });
    const loc = await t.prisma.inventoryLocation.create({ data: { warehouseId: wh.id, code: 'main', name: 'Main', kind: 'WAREHOUSE' } });
    await t.prisma.stockLevel.create({ data: { variantId: v.id, locationId: loc.id, onHand: 5, available: 5, erpUpdatedAt: new Date() } });
    // the owner's own Cash on Delivery switch (owner data, empty on a new installation)
    await deps.resolver.set('payment.cod.enabled', true, storeTarget(storeId), { ownerApproved: true, reason: 'test: the owner switched Cash on Delivery on' });
    expect((await j('GET', ['c', conversationId, 'cart'])).body.error).toBe('CART_OFF');
    const cards = (await j('GET', ['settings'])).body.cards;
    expect(cards['support.cart'].value.enabled).toBe(false);
    expect((await j('PUT', ['settings'], { body: { key: 'support.cart', value: { ...cards['support.cart'].value, enabled: true }, version: cards['support.cart'].version } })).status).toBe(200);
    expect((await j('GET', ['c', conversationId])).body.thread.you.cart).toBe(true);
    expect((await j('GET', ['c', conversationId, 'cart'], { cookie: reader })).status).toBe(403);
    const added = await j('POST', ['c', conversationId, 'cart'], { body: { action: 'add', variantId: v.id } });
    expect(added.status).toBe(200);
    expect(added.body.bag.lines).toMatchObject([{ kind: 'item', name: { nameEn: 'Sample API Tee' }, quantity: 1, amountMinor: 55_000 }]);
    const form = { name: 'Sample Chat Buyer', phone: '01700000432', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' };
    const q = await j('POST', ['c', conversationId, 'cart'], { body: { action: 'quote', form } });
    expect(q.status).toBe(200);
    expect(q.body.quote).toMatchObject({ gate: 'cod', problem: null });
    const key = crypto.randomUUID();
    const made = await j('POST', ['c', conversationId, 'cart'], { body: { action: 'order', form, fingerprint: q.body.quote.fingerprint, requestKey: key } });
    expect(made.status).toBe(200);
    expect(made.body.order).toMatchObject({ gate: 'cod', replay: false, payLink: null });
    const o = await t.prisma.order.findUniqueOrThrow({ where: { id: made.body.order.orderId } });
    expect(o).toMatchObject({ source: 'LIVE_CHAT', paymentMethod: 'COD' });
    expect((await j('GET', ['c', conversationId])).body.thread.order).toMatchObject({ id: o.id, number: o.number });
    // a stale fingerprint is the checkout's own refusal, with its code
    await j('POST', ['c', conversationId, 'cart'], { body: { action: 'add', variantId: v.id } });
    const stale = await j('POST', ['c', conversationId, 'cart'], { body: { action: 'order', form, fingerprint: 'c'.repeat(64), requestKey: crypto.randomUUID() } });
    expect(stale.body).toMatchObject({ ok: false, error: 'CHECKOUT', data: { code: 'PRICE_CHANGED' } });
  });

  it('PR 431: tickets — off, no ticket; on, a late chat is in the Late view, on the chat and in the owner\'s notifications', async () => {
    const cards = (await j('GET', ['settings'])).body.cards;
    expect(cards['support.tickets'].value).toEqual({ enabled: false, firstResponseMinutes: 5, resolutionHours: 24, notify: true });
    expect((await j('PUT', ['settings'], { body: { key: 'support.tickets', value: { ...cards['support.tickets'].value, enabled: true, firstResponseMinutes: 15 }, version: cards['support.tickets'].version } })).status).toBe(200);
    // a customer wrote an hour ago and nobody answered: the first answer is late
    const got = await receiveMessage(
      { db: t.prisma, settings: deps.resolver },
      { storeId, channel: { kind: 'livechat', externalId: 'sample-chat' }, contact: { externalId: 'v-431', name: 'Sample late visitor' }, message: { externalId: 'm-431', text: 'Sample: anyone there?', sentAt: new Date(Date.now() - 3_600_000) } },
    );
    const late = (await j('GET', [], { query: '?view=late' })).body;
    expect(late.rows.map((r: { id: string }) => r.id)).toContain(got.conversationId);
    expect(late.rows.find((r: { id: string }) => r.id === got.conversationId).clock).toMatchObject({ stage: 'first', late: true });
    const th = (await j('GET', ['c', got.conversationId])).body.thread;
    expect(th.ticket).toMatchObject({ status: 'OPEN', clock: { stage: 'first', late: true }, firstResponseAt: null });
    const n = (await (await notificationsHandler(call('GET', '/api/admin/notifications', { cookie: owner }), deps)).json()) as { items: { href: string; body: string }[]; source: string };
    expect(n.source).toBe('mixed');
    const note = n.items.find((i) => i.href === `/admin/support/c/${got.conversationId}`);
    expect(note?.body).toContain('Sample late visitor');
    // a reader (support.read only) sees no one else's late chat; the owner's answer takes it out of the bell
    const r = (await (await notificationsHandler(call('GET', '/api/admin/notifications', { cookie: reader }), deps)).json()) as { items: unknown[] };
    expect(r.items).toEqual([]);
    expect((await j('POST', ['c', got.conversationId, 'messages'], { body: { body: 'Sample: yes, here!', requestKey: 'sample-press-0431', version: th.version } })).status).toBe(200);
    const after = (await (await notificationsHandler(call('GET', '/api/admin/notifications', { cookie: owner }), deps)).json()) as { items: { href: string }[] };
    expect(after.items.some((i) => i.href === `/admin/support/c/${got.conversationId}`)).toBe(false);
    expect((await j('GET', ['c', got.conversationId])).body.thread.ticket).toMatchObject({ firstLate: true });
  });

  it('PR 433: follow-ups — off, refused and no view; on, a quiet chat with a product sent is in the Follow-ups view; skipped through the route', async () => {
    const cards = (await j('GET', ['settings'])).body.cards;
    expect(cards['support.followUp'].value).toMatchObject({ enabled: false, offerCode: '' });
    const got = await receiveMessage(
      { db: t.prisma, settings: deps.resolver },
      { storeId, channel: { kind: 'livechat', externalId: 'sample-chat' }, contact: { externalId: 'v-433', name: 'Sample quiet visitor' }, message: { externalId: 'm-433', text: 'Sample: price?', sentAt: new Date(Date.now() - 6 * 3_600_000) } },
    );
    await t.prisma.supportProductShare.create({ data: { storeId, conversationId: got.conversationId, productId: got.conversationId, refCode: 'samplefu4330' } });
    await t.prisma.conversation.update({ where: { id: got.conversationId }, data: { status: 'WAITING', lastDirection: 'OUT', lastMessageAt: new Date(Date.now() - 5 * 3_600_000) } });
    const off = await j('POST', ['c', got.conversationId, 'followup'], { body: { action: 'send', followUpId: got.conversationId, body: 'x', requestKey: 'sample-press-0433', version: 'v' } });
    expect([off.status, off.body.error]).toEqual([422, 'FOLLOW_UP_OFF']);
    expect((await j('GET', [])).body.followUps).toBe(false);
    expect((await j('PUT', ['settings'], { body: { key: 'support.followUp', value: { ...cards['support.followUp'].value, enabled: true }, version: cards['support.followUp'].version } })).status).toBe(200);
    const box = (await j('GET', [], { query: '?view=followup' })).body;
    expect(box.followUps).toBe(true);
    expect(box.rows.map((r: { id: string }) => r.id)).toContain(got.conversationId);
    const f = await t.prisma.supportFollowUp.findFirstOrThrow({ where: { conversationId: got.conversationId, outcome: null } });
    expect(f.ruleKey).toBe('products');
    expect((await j('POST', ['c', got.conversationId, 'followup'], { body: { action: 'nope' } })).status).toBe(400);
    expect((await j('POST', ['c', got.conversationId, 'followup'], { cookie: reader, body: { action: 'skip', followUpId: f.id } })).status).toBe(403);
    expect((await j('POST', ['c', got.conversationId, 'followup'], { body: { action: 'skip', followUpId: f.id } })).body).toEqual({ ok: true, skipped: true });
    expect((await j('POST', ['c', got.conversationId, 'followup'], { body: { action: 'skip', followUpId: f.id } })).body.error).toBe('FOLLOW_UP_GONE');
    expect((await j('GET', [], { query: '?view=followup' })).body.rows.map((r: { id: string }) => r.id)).not.toContain(got.conversationId);
    // put it back for the tests after this one
    const now = (await j('GET', ['settings'])).body.cards['support.followUp'];
    expect((await j('PUT', ['settings'], { body: { key: 'support.followUp', value: { ...now.value, enabled: false }, version: now.version } })).status).toBe(200);
  });

  it('PR 434: the block list — off, refused; on, the owner blocks a chat\'s person (in Blocked, no reply) and takes them off; a reader may not', async () => {
    const got = await receiveMessage(
      { db: t.prisma, settings: deps.resolver },
      { storeId, channel: { kind: 'livechat', externalId: 'sample-chat' }, contact: { externalId: 'v-434', name: 'Sample rude visitor' }, message: { externalId: 'm-434', text: 'Sample: rude words' } },
    );
    const off = await j('POST', ['c', got.conversationId, 'block'], { body: { action: 'block', reason: 'Sample abuse' } });
    expect([off.status, off.body.error]).toEqual([422, 'BLOCK_OFF']);
    const cards = (await j('GET', ['settings'])).body.cards;
    expect(cards['support.blockList'].value).toEqual({ enabled: false });
    expect(cards['support.privacy'].value).toEqual({ ownChatsOnly: false, maskNumbersInText: false });
    expect((await j('PUT', ['settings'], { body: { key: 'support.blockList', value: { enabled: true }, version: cards['support.blockList'].version } })).status).toBe(200);
    expect((await j('POST', ['c', got.conversationId, 'block'], { cookie: reader, body: { action: 'block', reason: 'Sample' } })).status).toBe(403);
    expect((await j('POST', ['c', got.conversationId, 'block'], { body: { action: 'nope' } })).status).toBe(400);
    expect((await j('POST', ['c', got.conversationId, 'block'], { body: { action: 'block', reason: 'Sample abuse' } })).body).toEqual({ ok: true, blocked: true, contacts: 1 });
    const box = (await j('GET', [], { query: '?view=blocked' })).body;
    expect([box.blockList, box.rows.map((r: { id: string }) => r.id)]).toEqual([true, [got.conversationId]]);
    const th = (await j('GET', ['c', got.conversationId])).body.thread;
    expect(th.blocked).toMatchObject({ reason: 'Sample abuse' });
    expect((await j('POST', ['c', got.conversationId, 'messages'], { body: { body: 'Sample', requestKey: 'sample-press-0434', version: th.version } })).body.error).toBe('BLOCKED');
    expect((await j('POST', ['c', got.conversationId, 'block'], { body: { action: 'unblock' } })).body).toEqual({ ok: true, blocked: false, contacts: 1 });
    expect((await j('GET', [], { query: '?view=blocked' })).body.rows).toEqual([]);
    const now = (await j('GET', ['settings'])).body.cards['support.blockList'];
    expect((await j('PUT', ['settings'], { body: { key: 'support.blockList', value: { enabled: false }, version: now.version } })).status).toBe(200);
  });

  it('PR 435: the support app — off as shipped (no device); on, a device is switched on and off, a test runs on the push mock (nothing leaves)', async () => {
    const off = (await j('GET', ['app'])).body;
    expect(off).toEqual({ ok: true, app: { enabled: false, push: false, practice: true, publicKey: null, devices: [] } });
    const device = { endpoint: 'https://push.example.com/send/sample-435', keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' }, label: 'Sample phone' };
    const refused = await j('POST', ['app'], { body: { action: 'on', ...device } });
    expect([refused.status, refused.body.error]).toEqual([422, 'PUSH_OFF']);
    const card = (await j('GET', ['settings'])).body.cards['support.app'];
    expect(card.value).toEqual({ enabled: false, appName: '', push: false, events: ['message', 'assigned'], preview: 'name', ttlMinutes: 60 });
    expect((await j('PUT', ['settings'], { body: { key: 'support.app', value: { ...card.value, enabled: true, push: true }, version: card.version } })).status).toBe(200);
    expect((await j('POST', ['app'], { body: { action: 'nope' } })).status).toBe(400);
    const on = (await j('POST', ['app'], { body: { action: 'on', ...device } })).body;
    expect(on.app).toMatchObject({ enabled: true, push: true, practice: true, publicKey: null, devices: [expect.objectContaining({ label: 'Sample phone', failCount: 0 })] });
    expect((await j('POST', ['app'], { body: { action: 'test' } })).body).toEqual({ ok: true, devices: 1, sent: 1, failed: 0, gone: 0, practice: true });
    // a reader may set up their own device too, but sees none of the others'
    expect((await j('GET', ['app'], { cookie: reader })).body.app.devices).toEqual([]);
    expect((await j('POST', ['app'], { body: { action: 'off', endpoint: device.endpoint } })).body.app.devices).toEqual([]);
    const now = (await j('GET', ['settings'])).body.cards['support.app'];
    expect((await j('PUT', ['settings'], { body: { key: 'support.app', value: { ...now.value, enabled: false, push: false }, version: now.version } })).status).toBe(200);
  });

  it('PR 436: support analytics — the owner sees the team and every channel; a reader only their own row; a bad period refused', async () => {
    const r = (await j('GET', ['analytics'], { query: '?days=7' })).body;
    expect(r).toMatchObject({ ok: true, analytics: { scope: 'team', days: 7 } });
    expect(r.analytics.total.chats).toBeGreaterThan(0);
    expect(r.analytics.byChannel.length).toBeGreaterThan(0);
    const own = (await j('GET', ['analytics'], { cookie: reader })).body.analytics;
    expect([own.scope, own.days, own.byChannel, own.byPerson.length]).toEqual(['own', 30, [], 1]);
    const bad = await j('GET', ['analytics'], { query: '?from=2026-10-31&to=2026-10-01' });
    expect([bad.status, bad.body.error]).toEqual([400, 'INVALID_INPUT']);
    expect((await j('GET', ['analytics'], { query: '?days=12' })).status).toBe(400);
    expect((await j('POST', ['analytics'], { body: {} })).status).toBe(405);
  });
});
