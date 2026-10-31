// S08 · PR 186 on a real PostgreSQL (a throwaway database; skipped without TEST_DATABASE_ADMIN_URL): the customer's own
// POST /api/account/exchange. Off by default (refused before any photo is stored); same site only; signed in only; his
// order's state, the pieces offered for a new size with their pictures, and the request itself — a faulty piece with its
// photo (multipart, stored in the library first), a size exchange with "you sent the wrong size" and its label photo.
// Every request is REQUESTED for a person to approve: nothing is booked or paid here. Made-up sample data only.
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@extas/adapters';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma } from '@extas/db/client';
import type { MediaDeps } from '@extas/media';
import { seedSample } from '@extas/seed';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { CUSTOMER_COOKIE } from './account';
import type { AccountApiDeps } from './account-api';
import { TRY_DELIVERED_ORDER_NUMBER, trySignIn } from './account-try';
import { exchangeHandler, type ExchangeApiDeps } from './exchange-api';

const HOST = 'shop.example.test';
type Json = Record<string, any>;
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as Json });

function headers(cookie?: string, origin = `https://${HOST}`): Record<string, string> {
  const h: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.186', origin };
  if (cookie) h.cookie = cookie;
  return h;
}
const post = (body: unknown, cookie?: string, origin?: string) =>
  new Request(`https://${HOST}/api/account/exchange`, { method: 'POST', headers: { ...headers(cookie, origin), 'content-type': 'application/json' }, body: JSON.stringify(body) });
const multipart = (data: FormData, cookie: string) => new Request(`https://${HOST}/api/account/exchange`, { method: 'POST', headers: headers(cookie), body: data });

/** A sample photo: a real picture with an edge, so the library takes it. */
async function photo(name: string): Promise<File> {
  const out = await sharp({ create: { width: 800, height: 1000, channels: 3, background: { r: 20, g: 32, b: 80 } } })
    .composite([{ input: await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer(), left: 300, top: 400 }])
    .jpeg({ quality: 85 })
    .toBuffer();
  return new File([new Uint8Array(out) as Uint8Array<ArrayBuffer>], name, { type: 'image/jpeg' });
}

describe.skipIf(!HAS_TEST_DB)('PR 186 · POST /api/account/exchange (PostgreSQL)', () => {
  let t: TestDatabase;
  let resolver: SettingsResolver<typeof registry>;
  let deps: ExchangeApiDeps;
  let storeId = 0;
  let cookie = '';
  const savedUrl = process.env.DATABASE_URL; // the option pictures read the catalogue through the shared client
  const on = (v: Record<string, unknown> = {}) => resolver.set('orders.exchange.account', { enabled: true, claim: true, maxPhotos: 3, photoMaxMb: 5, ...v }, storeTarget(storeId));

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('exchange_api');
    storeId = (await seedSample(t.prisma)).storeId;
    await syncSettings(t.prisma, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    await resolver.set('media.image.avifEffort', 0, INSTALLATION); // fast AVIF in tests
    const accounts = { db: t.prisma, settings: resolver };
    const one = memoryStorage();
    const media: MediaDeps = { db: t.prisma, settings: resolver, storage: async () => one };
    const account: AccountApiDeps = { accounts, storeId, storeName: async () => 'Sample store' };
    deps = { account, media };
    // his delivered order, made by the test pages' own fill (TRY-65 is DELIVERED, just now)
    const session = await trySignIn(accounts, { storeId }, { source: 'test' });
    cookie = `${CUSTOMER_COOKIE}=${encodeURIComponent(session.token)}`;
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
  }, 300_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await disconnectPrisma();
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    await t?.drop();
  });

  it('off by default: the state says OFF, and a request with a photo is refused before the photo is stored', async () => {
    const st = await read(await exchangeHandler(post({ action: 'state', number: TRY_DELIVERED_ORDER_NUMBER }, cookie), deps));
    expect(st).toMatchObject({ status: 200, body: { ok: true, open: false, closed: 'OFF', lines: [] } });
    const data = new FormData();
    for (const [k, v] of Object.entries({ action: 'request', number: TRY_DELIVERED_ORDER_NUMBER, orderItemId: crypto.randomUUID(), reason: 'defect', newVariantId: crypto.randomUUID() })) data.set(k, v);
    data.append('photo', await photo('fault.jpg'));
    const before = await t.prisma.mediaAsset.count();
    const r = await read(await exchangeHandler(multipart(data, cookie), deps));
    expect(r).toMatchObject({ status: 422, body: { ok: false, error: 'EXCHANGE_CLOSED', why: 'OFF' } });
    expect(await t.prisma.mediaAsset.count()).toBe(before);
    expect(await t.prisma.exchange.count()).toBe(0);
  });

  it('only his own, from this site, signed in: another site, a guest and nothing at all are refused', async () => {
    await on();
    expect((await exchangeHandler(post({ action: 'state', number: TRY_DELIVERED_ORDER_NUMBER }, cookie, 'https://elsewhere.example'), deps)).status).toBe(403);
    expect(await read(await exchangeHandler(post({ action: 'state', number: TRY_DELIVERED_ORDER_NUMBER }), deps))).toMatchObject({ status: 401, body: { error: 'SIGNED_OUT' } });
    expect((await exchangeHandler(post({ action: 'state', number: 'NO-SUCH-1' }, cookie), deps)).status).toBe(404);
    expect((await exchangeHandler(new Request(`https://${HOST}/api/account/exchange`, { method: 'GET', headers: headers(cookie) }), deps)).status).toBe(405);
    expect((await exchangeHandler(post({ action: 'state', number: TRY_DELIVERED_ORDER_NUMBER }, cookie), null)).status).toBe(503);
  });

  it('on: his order\'s state, a faulty piece replaced with its photo (multipart), REQUESTED with the photo in the library', async () => {
    await on();
    const st = await read(await exchangeHandler(post({ action: 'state', number: TRY_DELIVERED_ORDER_NUMBER }, cookie), deps));
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ ok: true, open: true, closed: null, number: TRY_DELIVERED_ORDER_NUMBER, problemReason: 'defect' });
    const line = (st.body.lines as Json[]).find((l) => l.problem === null);
    expect(line, 'a piece open for a replacement').toBeTruthy();
    // the same size, from the tiers, with its picture by variant
    const ch = await read(await exchangeHandler(post({ action: 'choices', number: TRY_DELIVERED_ORDER_NUMBER, orderItemId: line!.lineId, reason: 'defect' }, cookie), deps));
    expect(ch.status).toBe(200);
    expect(ch.body.closed).toBeNull();
    const option = (ch.body.options as Json[])[0];
    expect(option, 'the same piece is offered for a replacement').toBeTruthy();
    expect(ch.body.pictures[option!.variantId]).toMatchObject({ hex: expect.any(String) });
    // without the photo the owner asks for on our mistake: refused
    const bare = await read(await exchangeHandler(post({ action: 'request', number: TRY_DELIVERED_ORDER_NUMBER, orderItemId: line!.lineId, reason: 'defect', newVariantId: option!.variantId }, cookie), deps));
    expect(bare.status).toBeGreaterThanOrEqual(400);
    expect(await t.prisma.exchange.count()).toBe(0);
    // too many photos: refused before any is stored
    await on({ maxPhotos: 1 });
    const many = new FormData();
    for (const [k, v] of Object.entries({ action: 'request', number: TRY_DELIVERED_ORDER_NUMBER, orderItemId: line!.lineId, reason: 'defect', newVariantId: option!.variantId })) many.set(k, v);
    many.append('photo', await photo('a.jpg'));
    many.append('photo', await photo('b.jpg'));
    expect(await read(await exchangeHandler(multipart(many, cookie), deps))).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT', maxPhotos: 1 } });
    await on();
    const data = new FormData();
    for (const [k, v] of Object.entries({ action: 'request', number: TRY_DELIVERED_ORDER_NUMBER, orderItemId: line!.lineId, reason: 'defect', newVariantId: option!.variantId, note: 'Seam open', key: 'k-186-1' })) data.set(k, v);
    data.append('photo', await photo('fault.jpg'));
    const r = await read(await exchangeHandler(multipart(data, cookie), deps));
    expect(r).toMatchObject({ status: 201, body: { ok: true, status: 'REQUESTED', claimState: null, replay: false } });
    const ex = await t.prisma.exchange.findUniqueOrThrow({ where: { id: r.body.exchangeId } });
    expect(ex).toMatchObject({ source: 'shop', status: 'REQUESTED', reason: 'defect', newOrderId: null, createdById: null });
    expect(await t.prisma.mediaAsset.count({ where: { folder: 'exchange-photos' } })).toBe(1);
    // the order page now lists it, and the piece is not asked for twice
    const after = await read(await exchangeHandler(post({ action: 'state', number: TRY_DELIVERED_ORDER_NUMBER }, cookie), deps));
    expect(after.body.exchanges).toHaveLength(1);
    expect(after.body.exchanges[0]).toMatchObject({ number: r.body.number, status: 'REQUESTED', reason: 'defect' });
    expect((after.body.lines as Json[]).find((l) => l.lineId === line!.lineId)).toMatchObject({ problem: 'OPEN' });
  });

  it('a size exchange with "you sent the wrong size" and its label photo: the claim waits for staff (CN-018)', async () => {
    await on();
    // a second delivered order of his, the same sample piece (made-up test data)
    const NUMBER = 'TRY-186'; // hardcode-ok: a made-up test order number
    const src = await t.prisma.order.findUniqueOrThrow({ where: { storeId_number: { storeId, number: TRY_DELIVERED_ORDER_NUMBER } }, include: { items: true } });
    const { id: _id, number: _n, idempotencyKey: _k, createdAt: _c, updatedAt: _u, items, ...order } = src;
    await t.prisma.order.create({
      data: {
        ...(order as any),
        number: NUMBER,
        idempotencyKey: 'test:186',
        items: { create: items.map(({ id: _i, orderId: _o, createdAt: _a, updatedAt: _b, ...it }) => it as any) },
      },
    });
    const st = await read(await exchangeHandler(post({ action: 'state', number: NUMBER }, cookie), deps));
    const line = (st.body.lines as Json[]).find((l) => l.size === null);
    expect(line, 'a piece open for a size exchange').toBeTruthy();
    const other = (line!.sizes as Json[]).find((s) => s.key !== line!.currentSizeKey)!;
    const ch = await read(await exchangeHandler(post({ action: 'choices', number: NUMBER, orderItemId: line!.lineId, reason: 'size', sizeKey: other.key }, cookie), deps));
    expect(ch.status).toBe(200);
    const option = (ch.body.options as Json[])[0];
    expect(option, 'a piece offered in the new size').toBeTruthy();
    // the claim's label photo is asked for (`orders.exchange.charge.claimPhoto`, on by default)
    const noPhoto = await read(await exchangeHandler(post({ action: 'request', number: NUMBER, orderItemId: line!.lineId, reason: 'size', newVariantId: option!.variantId, claimNote: 'I ordered M, the label says L' }, cookie), deps));
    expect(noPhoto.status).toBeGreaterThanOrEqual(400);
    // the owner's own second-delivery charge in this test (made up), so he has something to claim back
    await resolver.set('orders.exchange.charge', { ...registry['orders.exchange.charge'].default, fallbackMinor: 6_000 }, storeTarget(storeId));
    const data = new FormData();
    for (const [k, v] of Object.entries({ action: 'request', number: NUMBER, orderItemId: line!.lineId, reason: 'size', newVariantId: option!.variantId, claimNote: 'I ordered M, the label says L', key: 'k-186-2' })) data.set(k, v);
    data.append('claimPhoto', await photo('label.jpg'));
    const r = await read(await exchangeHandler(multipart(data, cookie), deps));
    expect(r).toMatchObject({ status: 201, body: { ok: true, status: 'REQUESTED' } });
    const ex = await t.prisma.exchange.findUniqueOrThrow({ where: { id: r.body.exchangeId } });
    expect(ex).toMatchObject({ source: 'shop', reason: 'size', newOrderId: null });
    // he pays the second delivery, so his claim waits for staff (`returns.claims.decide`)
    expect(ex.deliveryChargeMinor).toBeGreaterThan(0);
    expect(r.body.claimState).toBe('PENDING');
    expect(ex.claimState).toBe('PENDING');
  });
});
