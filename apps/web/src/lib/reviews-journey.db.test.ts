// S02 · PR 65 — SIM-F-008 as a journey, end to end on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): **review submitted → in admin → approved → on the product page → wallet credited**.
//
// It is the acceptance test the register row asks for (`docs/qa/SIMULATION-REPORT.md` SIM-F-008: "the review never
// appears there, nothing can be approved, the ৳50 photo reward promised on the page is never credited"). So it runs
// the real routes, not the services behind them: the customer's own POST /api/account/review with his photo, the
// staff's GET/POST /api/admin/reviews, and the product page's own read.
//
// It also proves the two rules the owner's standing instructions put on this (CLAUDE.md rule 6, CN-018):
//   · while `reviews.photoReward` is off — the shipped default — approving pays **nothing**;
//   · with it on and his own amount typed in, approving pays exactly once, however many times it is approved again.
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma } from '@extas/db/client';
import type { MediaDeps } from '@extas/media';
import { seedSample } from '@extas/seed';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { loginHandler } from './admin-api';
import type { AdminDeps } from './admin-auth';
import { reviewsHandler } from './reviews-api';
import { CUSTOMER_COOKIE } from './shop/account';
import type { AccountApiDeps } from './shop/account-api';
import { TRY_DELIVERED_ORDER_NUMBER, trySignIn } from './shop/account-try';
import { productReviews } from './shop/pdp-reviews-load';
import { reviewHandler, reviewStateHandler, type ReviewApiDeps } from './shop/review-api';

const HOST = 'shop.example.test';
const OWNER_PW = 'a long sentence for the tests';
const REWARD_MINOR = 5_000; // the owner's own figure in this test (৳50), never a default

type Json = Record<string, any>;
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as Json });

function headers(method: string, cookie?: string): Record<string, string> {
  const h: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.65' };
  if (method !== 'GET') h.origin = `https://${HOST}`;
  if (cookie) h.cookie = cookie;
  return h;
}
const call = (method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) => {
  const h = headers(method, opts.cookie);
  if (opts.body !== undefined) h['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers: h, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
};
const form = (path: string, cookie: string, data: FormData) => new Request(`https://${HOST}${path}`, { method: 'POST', headers: headers('POST', cookie), body: data });
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

/** A sample photo of a garment: navy with a white square, so it is a real picture with an edge. */
async function photo(): Promise<File> {
  const square = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toBuffer();
  const out = await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 20, g: 32, b: 80 } } })
    .composite([{ input: square, left: 300, top: 400 }])
    .jpeg({ quality: 85 })
    .toBuffer();
  return new File([new Uint8Array(out) as Uint8Array<ArrayBuffer>], 'IMG_0065.JPG', { type: 'image/jpeg' });
}

describe.skipIf(!HAS_TEST_DB)('SIM-F-008 · a customer review reaches the shop, is approved and only then pays (PR 65)', () => {
  let t: TestDatabase;
  let resolver: SettingsResolver<typeof registry>;
  let admin: AdminDeps;
  let shop: ReviewApiDeps;
  let storeId = 0;
  let owner = '';
  let customerCookie = '';
  let customerId = '';
  let orderItemId = '';
  let productId = '';
  const savedUrl = process.env.DATABASE_URL; // the product page's own read goes through the shared client

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('reviews_journey');
    storeId = (await seedSample(t.prisma)).storeId;
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    await resolver.set('media.image.avifEffort', 0, INSTALLATION); // fast AVIF in tests
    admin = { db: t.prisma, resolver, vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), admin));

    const accounts = { db: t.prisma, settings: resolver };
    const media: MediaDeps = { db: t.prisma, settings: resolver, storage: (() => {
      const one = memoryStorage();
      return async () => one;
    })() };
    const account: AccountApiDeps = { accounts, storeId, storeName: async () => 'Sample store' };
    shop = { account, media };
    // his delivered order, made by the test pages' own fill (PR 131 / PR 65: TRY-65 is DELIVERED)
    const session = await trySignIn(accounts, { storeId }, { source: 'test' });
    customerCookie = `${CUSTOMER_COOKIE}=${encodeURIComponent(session.token)}`;
    const order = await t.prisma.order.findUniqueOrThrow({
      where: { storeId_number: { storeId, number: TRY_DELIVERED_ORDER_NUMBER } },
      select: { customerId: true, items: { select: { id: true, productId: true } } },
    });
    customerId = order.customerId ?? '';
    orderItemId = order.items[0]?.id ?? '';
    productId = order.items[0]?.productId ?? '';
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

  const reviews = (q = '') => `/api/admin/reviews?storeId=${storeId}${q}`;
  const walletOf = () => t.prisma.walletEntry.findMany({ where: { storeId, wallet: { customerId } }, select: { direction: true, amountMinor: true, reason: true, idempotencyKey: true } });

  it('refuses a review from nobody, from a cross-site page and for a line that is not his', async () => {
    expect((await reviewHandler(call('POST', '/api/account/review', { body: { number: TRY_DELIVERED_ORDER_NUMBER, orderItemId, rating: 5 } }), shop)).status).toBe(401);
    expect((await reviewHandler(call('GET', '/api/account/review', { cookie: customerCookie }), shop)).status).toBe(405);
    expect((await reviewHandler(call('POST', '/api/account/review', { cookie: customerCookie, body: { number: TRY_DELIVERED_ORDER_NUMBER, orderItemId, rating: 9 } }), shop)).status).toBe(400);
    const otherLine = await read(
      await reviewHandler(call('POST', '/api/account/review', { cookie: customerCookie, body: { number: TRY_DELIVERED_ORDER_NUMBER, orderItemId: '00000000-0000-0000-0000-000000000000', rating: 5 } }), shop),
    );
    expect(otherLine.status).toBe(404);
    // what the order page asks before it offers the form: this line can still be reviewed
    const state = await read(await reviewStateHandler(call('POST', '/api/account/review-state', { cookie: customerCookie, body: { number: TRY_DELIVERED_ORDER_NUMBER } }), shop));
    expect(state.body).toMatchObject({ can: true, why: 'ok' });
  });

  it('submitted → waiting in the shop → approved → on the product page, and nothing is shown before that', async () => {
    const data = new FormData();
    data.set('number', TRY_DELIVERED_ORDER_NUMBER);
    data.set('orderItemId', orderItemId);
    data.set('rating', '5');
    data.set('body', 'Sample review: the size the finder gave me was right and the stitching is clean.');
    data.set('fit', 'RIGHT');
    data.set('heightCm', '175');
    data.set('weightKg', '72');
    data.set('photo', await photo());
    const sent = await read(await reviewHandler(form('/api/account/review', customerCookie, data), shop));
    expect(sent.status).toBe(201);
    // it waits, and the page says nothing about a reward while the owner has the perk off
    expect(sent.body).toMatchObject({ status: 'PENDING', rewardMinor: null });
    const id = sent.body.id as string;

    // a second review of the same line is refused (`reviews.moderation.oneReviewPerLine`)
    const again = new FormData();
    again.set('number', TRY_DELIVERED_ORDER_NUMBER);
    again.set('orderItemId', orderItemId);
    again.set('rating', '4');
    expect((await reviewHandler(form('/api/account/review', customerCookie, again), shop)).status).toBe(409);

    // the product page shows nothing of it yet
    const before = await productReviews(storeId, productId, 3);
    expect(before.rows.some((r) => r.id === id)).toBe(false);

    // it is in the shop's queue, waiting, with his photo, his fit and his body on it
    const queue = await read(await reviewsHandler(call('GET', reviews('&status=PENDING&withPhoto=1'), { cookie: owner }), admin));
    expect(queue.status).toBe(200);
    expect(queue.body.counts.PENDING).toBeGreaterThanOrEqual(1);
    const mine = (queue.body.reviews as Json[]).find((r) => r.id === id);
    expect(mine).toMatchObject({ status: 'PENDING', source: 'CUSTOMER', isVerifiedPurchase: true, fit: 'RIGHT', heightCm: 175, weightKg: 72, rating: 5 });
    expect((mine?.photos as unknown[]).length).toBe(1);

    // approved by staff, with the reward still off: it is published and **nothing is paid**
    const ok = await read(await reviewsHandler(call('POST', `/api/admin/reviews/${id}/moderate?storeId=${storeId}`, { cookie: owner, body: { action: 'approve' } }), admin, [id, 'moderate']));
    expect(ok.status).toBe(200);
    expect(ok.body.reward).toBeNull();
    expect(ok.body.review).toMatchObject({ status: 'APPROVED', reward: null });
    expect(await walletOf()).toHaveLength(0);

    // and now it is on the product page, with his photo and his "bought L" line
    const after = await productReviews(storeId, productId, 3);
    const card = after.rows.find((r) => r.id === id);
    expect(card).toMatchObject({ rating: 5, verified: true, fit: 'RIGHT', heightCm: 175, weightKg: 72 });
    expect(card?.photo).not.toBeNull();
    expect(after.total).toBeGreaterThanOrEqual(1);

    // hidden again: it leaves the page at once, and the queue still has it
    await reviewsHandler(call('POST', `/api/admin/reviews/${id}/moderate?storeId=${storeId}`, { cookie: owner, body: { action: 'hide', reason: 'checking the photo' } }), admin, [id, 'moderate']);
    expect((await productReviews(storeId, productId, 3)).rows.some((r) => r.id === id)).toBe(false);
    await reviewsHandler(call('POST', `/api/admin/reviews/${id}/moderate?storeId=${storeId}`, { cookie: owner, body: { action: 'approve' } }), admin, [id, 'moderate']);
  });

  it('with the owner’s photo reward switched on and his own amount, approving pays it once — and never twice', async () => {
    const base = registry['reviews.photoReward'].default;
    await resolver.set('reviews.photoReward', { ...base, enabled: true, amountMinor: REWARD_MINOR }, storeTarget(storeId));

    // a second line to review: the first line's review is already approved and paid nothing (the perk was off)
    const second = await t.prisma.orderItem.findFirstOrThrow({ where: { storeId, orderId: (await t.prisma.order.findUniqueOrThrow({ where: { storeId_number: { storeId, number: TRY_DELIVERED_ORDER_NUMBER } }, select: { id: true } })).id } });
    const review = await t.prisma.review.create({
      data: {
        storeId,
        productId: second.productId,
        orderId: second.orderId,
        orderItemId: null,
        customerId,
        rating: 5,
        body: 'Sample review: second piece, same good fit.',
        status: 'PENDING',
        source: 'CUSTOMER',
        isVerifiedPurchase: true,
      },
      select: { id: true },
    });
    const asset = await t.prisma.mediaAsset.findFirstOrThrow({ where: { storeId, kind: 'IMAGE' }, select: { id: true } });
    await t.prisma.reviewMedia.create({ data: { storeId, reviewId: review.id, assetId: asset.id, sortOrder: 0 } });

    const paid = await read(await reviewsHandler(call('POST', `/api/admin/reviews/${review.id}/moderate?storeId=${storeId}`, { cookie: owner, body: { action: 'approve' } }), admin, [review.id, 'moderate']));
    expect(paid.body.reward).toMatchObject({ amountMinor: REWARD_MINOR });
    expect(paid.body.review.reward).toMatchObject({ amountMinor: REWARD_MINOR });
    const entries = await walletOf();
    expect(entries).toEqual([{ direction: 'CREDIT', amountMinor: REWARD_MINOR, reason: 'REVIEW_REWARD', idempotencyKey: `review:${review.id}` }]);
    const wallet = await t.prisma.walletAccount.findFirstOrThrow({ where: { storeId, customerId }, select: { balanceMinor: true } });
    expect(wallet.balanceMinor).toBe(REWARD_MINOR);

    // approving it again (a second pair of hands, a double tap) pays nothing more
    await reviewsHandler(call('POST', `/api/admin/reviews/${review.id}/moderate?storeId=${storeId}`, { cookie: owner, body: { action: 'approve' } }), admin, [review.id, 'moderate']);
    expect(await walletOf()).toHaveLength(1);
    expect((await t.prisma.walletAccount.findFirstOrThrow({ where: { storeId, customerId }, select: { balanceMinor: true } })).balanceMinor).toBe(REWARD_MINOR);
  });
});
