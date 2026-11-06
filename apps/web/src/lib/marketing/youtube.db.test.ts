// S13 · PR 278 — Marketing › YouTube on a real PostgreSQL: off as shipped (nothing added while off); the channel by its
// link, a video by its link with the products it shows (product links or slugs; an unknown one refuses the save); each
// product's tracked link carries the owner's tags; the orders whose campaign tags name the video are credited to it
// (placed, delivered, delivered value, with its products); set aside, never deleted; seeing needs
// `marketing.campaigns.read`, changing `marketing.campaigns.write`; audited. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { channelIdOf, slugOf, trackedLink, videoIdOf, youtubeHandler, type YoutubeOverview } from './youtube';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
// hardcode-ok: sample YouTube ids
const VID = 'aqz-KE-bpKQ';
const CH = 'UCabcdefghijklmnopqrstuv';

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.47', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/youtube'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe('YouTube links (pure)', () => {
  it('reads a video id and a channel id or handle from the usual links; a product slug from its link', () => {
    for (const v of [VID, `https://www.youtube.com/watch?v=${VID}&t=3`, `https://youtu.be/${VID}`, `https://youtube.com/shorts/${VID}`, `https://www.youtube.com/embed/${VID}`]) expect(videoIdOf(v)).toBe(VID);
    for (const v of ['', 'https://example.com/x', 'short', `https://youtu.be/${VID}x`]) expect(videoIdOf(v)).toBeNull();
    expect(channelIdOf(`https://www.youtube.com/channel/${CH}`)).toBe(CH);
    expect(channelIdOf('https://www.youtube.com/@extasbd/videos')).toBe('@extasbd');
    expect(channelIdOf('@extasbd')).toBe('@extasbd');
    expect(channelIdOf('extas')).toBeNull();
    expect(slugOf('https://new.example.test/p/textured-knit-polo?x=1')).toBe('textured-knit-polo');
    expect(slugOf(' textured-knit-polo ')).toBe('textured-knit-polo');
    expect(slugOf('  ')).toBeNull();
    expect(trackedLink('https://shop.example.test', '/p/polo', { enabled: true, utmSource: 'youtube', utmMedium: 'video', campaignPrefix: 'yt-' }, VID)).toBe(`https://shop.example.test/p/polo?utm_source=youtube&utm_medium=video&utm_campaign=yt-${VID}`);
  });
});

describe.skipIf(!HAS_TEST_DB)('Marketing › YouTube on PostgreSQL (PR 278)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  const ids: Record<string, string> = {};
  type Answer = YoutubeOverview & { ok: boolean; error?: string; details?: string[]; id?: string; cards?: { youtube: YoutubeOverview['card'] } };
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const res = await youtubeHandler(req(method, { body, cookie }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    t = await createTestDatabase('web_yt');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Video desk', nameBn: 'ভিডিও ডেস্ক', permissions: ['marketing.campaigns.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
    ids.polo = (await t.prisma.product.create({ data: { storeId: S, slug: 's278-polo', nameEn: 'Sample polo', nameBn: 'নমুনা পোলো' } })).id;
    ids.shirt = (await t.prisma.product.create({ data: { storeId: S, slug: 's278-shirt', nameEn: 'Sample shirt', nameBn: 'নমুনা শার্ট' } })).id;
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped: the page reads, nothing is added; seeing needs the read key, changing the write key', async () => {
    const g = await api('GET', undefined, desk);
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ settings: { enabled: false, utmSource: 'youtube', utmMedium: 'video', campaignPrefix: 'yt-' }, channels: [], videos: [], totals: { videos: 0, orders: 0 } });
    expect((await api('POST', { action: 'channel.add', link: CH, name: 'EXTAS' })).a).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    expect((await api('PUT', { key: 'youtube', value: { ...g.a.settings, enabled: true }, version: g.a.card.version }, desk)).status).toBe(403);
    expect((await api('PUT', { key: 'youtube', value: { ...g.a.settings, enabled: true, utmSource: 'you tube' }, version: g.a.card.version })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['utmSource'] });
    expect((await api('PUT', { key: 'youtube', value: { ...g.a.settings, enabled: true }, version: 'old' })).a).toMatchObject({ ok: false, error: 'STALE' });
    const on = await api('PUT', { key: 'youtube', value: { ...g.a.settings, enabled: true }, version: g.a.card.version });
    expect(on.a.cards!.youtube.value.enabled).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'youtube.settings' } })).toBe(1);
  });

  it('the channel and a video with its products; unknown products, a bad link or a second copy are refused; audited', async () => {
    expect((await api('POST', { action: 'channel.add', link: 'extas', name: '' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['link', 'name'] });
    expect((await api('POST', { action: 'channel.add', link: `https://www.youtube.com/channel/${CH}`, name: 'EXTAS' }, desk)).status).toBe(403);
    const ch = await api('POST', { action: 'channel.add', link: `https://www.youtube.com/channel/${CH}`, name: 'EXTAS' });
    ids.ch = ch.a.id!;
    expect((await api('POST', { action: 'channel.add', link: CH, name: 'Again' })).a).toMatchObject({ ok: false, error: 'EXISTS' });
    const video = { action: 'video.add', channelId: ids.ch, link: `https://youtu.be/${VID}`, title: 'Polo on the model', publishedOn: '2026-11-01', products: 'https://shop.example.test/p/s278-polo\nnope-not-here' };
    expect((await api('POST', video)).a).toMatchObject({ ok: false, error: 'UNKNOWN_PRODUCTS', details: ['nope-not-here'] });
    expect((await api('POST', { ...video, link: 'nope', products: '' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['link'] });
    const v = await api('POST', { ...video, products: 'https://shop.example.test/p/s278-polo' });
    expect(v.a.ok).toBe(true);
    ids.v = v.a.id!;
    expect((await api('POST', { ...video, products: '' })).a).toMatchObject({ ok: false, error: 'EXISTS' });
    const g = await api('GET');
    expect(g.a.channels).toEqual([{ id: ids.ch, externalId: CH, name: 'EXTAS', archived: false, videos: 1 }]);
    expect(g.a.videos[0]).toMatchObject({ externalId: VID, title: 'Polo on the model', publishedAt: '2026-11-01T00:00:00.000Z', tag: `yt-${VID}`, products: [{ id: ids.polo, slug: 's278-polo', name: 'Sample polo' }], orders: 0 });
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['youtube.channel.add', 'youtube.video.add'] } } })).toBe(2);
  });

  it('credits the orders whose tags name the video: placed, delivered, delivered value, with its products', async () => {
    let n = 0;
    const order = async (status: 'PLACED' | 'DELIVERED', productId: string, tags: { utmSource: string; utmCampaign: string }) => {
      const o = await t.prisma.order.create({ data: { storeId: S, number: `Y278-${++n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: new Date(), paymentMethod: 'COD', subtotalMinor: 150_000, totalMinor: 150_000, idempotencyKey: `y278-${n}`, ...tags } });
      await t.prisma.orderItem.create({ data: { storeId: S, orderId: o.id, productId, sku: `SKU-${n}`, productName: 'Sample', quantity: 1, unitPriceMinor: 150_000, lineTotalMinor: 150_000 } });
    };
    await order('DELIVERED', ids.polo!, { utmSource: 'YouTube', utmCampaign: `yt-${VID}` });
    await order('PLACED', ids.shirt!, { utmSource: 'youtube', utmCampaign: `yt-${VID}` });
    await order('DELIVERED', ids.polo!, { utmSource: 'facebook', utmCampaign: `yt-${VID}` }); // another source: not the video's
    await order('DELIVERED', ids.polo!, { utmSource: 'youtube', utmCampaign: 'yt-other' });
    const g = await api('GET', undefined, desk);
    expect(g.a.videos[0]).toMatchObject({ orders: 2, delivered: 1, deliveredValueMinor: 150_000, withProducts: 1 });
    expect(g.a.totals).toEqual({ videos: 1, orders: 2, delivered: 1, deliveredValueMinor: 150_000 });
    // its products changed: the shirt order now counts as carrying them
    await api('POST', { action: 'video.update', id: ids.v, title: 'Polo and shirt', products: 's278-polo\ns278-shirt' });
    expect((await api('GET')).a.videos[0]).toMatchObject({ title: 'Polo and shirt', withProducts: 2 });
  });

  it('set aside, never deleted; brought back; setting aside works while the module is off', async () => {
    await api('POST', { action: 'video.archive', id: ids.v });
    let g = await api('GET');
    expect(g.a.videos[0]).toMatchObject({ archived: true });
    expect(g.a.totals.videos).toBe(0);
    expect(g.a.channels[0]!.videos).toBe(0);
    await api('POST', { action: 'video.restore', id: ids.v });
    const card = (await api('GET')).a.card;
    await api('PUT', { key: 'youtube', value: { ...card.value, enabled: false }, version: card.version });
    expect((await api('POST', { action: 'channel.archive', id: ids.ch })).a.ok).toBe(true);
    expect((await api('POST', { action: 'channel.restore', id: ids.ch })).a).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    g = await api('GET');
    expect(g.a.channels[0]).toMatchObject({ archived: true });
    expect(await t.prisma.youtubeVideo.count()).toBe(1);
    expect(await t.prisma.youtubeChannel.count()).toBe(1);
  });
});
