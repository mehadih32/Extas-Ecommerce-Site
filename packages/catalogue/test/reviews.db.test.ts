// PR 65 — product reviews on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): who may write one, who may
// read and approve one, the four rules that refuse a review (reviews off, not delivered, too late, one per line), and
// the money rules the owner's standing instructions put on the photo perk (CLAUDE.md rule 6, CN-018):
//   · off with no amount — the shipped default — approving credits **nothing**;
//   · on with his own figure — one CREDIT in the wallet ledger, at approval, once per review and once per order;
//   · a review below his star floor, or one with no photo, earns nothing at all.
// It also covers what PR 59's size learning reads from here (`approvedFitSignals`: approved reviews only).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  addStaffReview,
  approvedFitSignals,
  getReview,
  listReviews,
  moderateReview,
  reviewChance,
  setReviewVerified,
  submitCustomerReview,
  type CatalogueDeps,
  type ReviewPublicDeps,
  type SettingsReader,
  type Who,
} from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('product reviews on PostgreSQL (PR 65)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const clock = new Date('2026-10-24T06:00:00Z');
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const set = <K extends Key>(key: K, value: Value<K>) => overrides.set(key, value);
  const SUBMIT = registry['reviews.submit'].default;
  const REWARD = registry['reviews.photoReward'].default;
  const AMOUNT = 5_000; // the owner's own figure in this test (৳50): never a default, never shipped

  const deps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const pub = (): ReviewPublicDeps => ({ db: t.prisma, settings, now: () => clock });
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let viewer: Actor;
  let writer: Actor;
  let moderator: Actor;
  let nobody: Actor;

  const ids = {} as Record<string, string>;
  let assets = 0;
  const image = async (): Promise<string> =>
    (
      await t.prisma.mediaAsset.create({
        data: { storeId: A, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `media/s${A}/o/review-${++assets}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(2_000), checksumSha256: `review-${assets}` },
        select: { id: true },
      })
    ).id;

  /** One sample customer with his own delivered (or not) order of one line per size given. */
  async function buyer(input: { key: string; phone: string; number: string; delivered: Date | null; sizes: string[] }): Promise<void> {
    const c = await t.prisma.customer.create({ data: { storeId: A, phone: input.phone, name: `Sample buyer ${input.key}` }, select: { id: true } });
    ids[`cust_${input.key}`] = c.id;
    const o = await t.prisma.order.create({
      data: {
        storeId: A,
        number: input.number,
        status: input.delivered ? 'DELIVERED' : 'CONFIRMED',
        source: 'WEBSITE',
        currency: 'BDT',
        customerId: c.id,
        placedAt: new Date(clock.getTime() - 10 * 86_400_000),
        ...(input.delivered ? { deliveredAt: input.delivered } : {}),
        subtotalMinor: 85_000 * input.sizes.length,
        totalMinor: 85_000 * input.sizes.length,
        idempotencyKey: `test:${input.number}`,
        items: {
          create: input.sizes.map((size) => ({
            storeId: A,
            productId: ids.product!,
            sku: `POLO-${size}`,
            productName: 'Sample polo',
            colourName: 'Navy',
            sizeLabel: size,
            quantity: 1,
            unitPriceMinor: 85_000,
            lineTotalMinor: 85_000,
          })),
        },
      },
      select: { id: true, items: { select: { id: true, sizeLabel: true }, orderBy: { createdAt: 'asc' } } },
    });
    ids[`order_${input.key}`] = o.id;
    for (const i of o.items) ids[`line_${input.key}_${i.sizeLabel}`] = i.id;
  }

  const walletOf = (key: string) =>
    t.prisma.walletEntry.findMany({
      where: { storeId: A, wallet: { customerId: ids[`cust_${key}`]! } },
      select: { direction: true, amountMinor: true, balanceAfterMinor: true, reason: true, idempotencyKey: true },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_reviews');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    viewer = await staff('rev-viewer@example.com', ['reviews.read']);
    writer = await staff('rev-writer@example.com', ['reviews.read', 'reviews.write']);
    moderator = await staff('rev-moderator@example.com', ['reviews.read', 'reviews.write', 'reviews.moderate']);
    nobody = await staff('rev-nobody@example.com', ['catalogue.read']);

    const cat = await t.prisma.category.create({ data: { storeId: A, slug: 'rev-polos', nameEn: 'Polos', nameBn: 'পোলো' }, select: { id: true } });
    ids.product = (await t.prisma.product.create({ data: { storeId: A, slug: 'rev-polo', nameEn: 'Sample polo', status: 'PUBLISHED', categoryId: cat.id }, select: { id: true } })).id;
    await buyer({ key: 'rahim', phone: '+8801000000651', number: 'TEST-651', delivered: new Date(clock.getTime() - 3 * 86_400_000), sizes: ['M', 'L'] });
    await buyer({ key: 'shuvo', phone: '+8801000000652', number: 'TEST-652', delivered: null, sizes: ['M'] });
    await buyer({ key: 'nabil', phone: '+8801000000653', number: 'TEST-653', delivered: new Date(clock.getTime() - 400 * 86_400_000), sizes: ['M'] });
    await buyer({ key: 'karim', phone: '+8801000000654', number: 'TEST-654', delivered: new Date(clock.getTime() - 2 * 86_400_000), sizes: ['M'] });
  }, 300_000);

  afterAll(async () => t?.drop());

  it('every staff action checks its own permission, in the acting store only', async () => {
    expect(await code(listReviews(deps(), as(viewer)))).toBe('ok');
    expect(await code(listReviews(deps(), as(viewer, B)))).toBe('FORBIDDEN');
    expect(await code(listReviews(deps(), as(nobody)))).toBe('FORBIDDEN');
    expect(await code(addStaffReview(deps(), as(viewer), { productId: ids.product, rating: 5 }))).toBe('FORBIDDEN');
    expect(await code(moderateReview(deps(), as(writer), ids.product!, { action: 'approve' }))).toBe('FORBIDDEN');
    expect(await code(setReviewVerified(deps(), as(writer), ids.product!, true))).toBe('FORBIDDEN');
    expect(await code(getReview(deps(), as(nobody), ids.product!))).toBe('FORBIDDEN');
  });

  it('only a buyer of his own delivered order, in time, writes one review per line', async () => {
    const his = { storeId: A, customerId: ids.cust_rahim! };
    // not his order
    expect(await code(submitCustomerReview(pub(), { storeId: A, customerId: ids.cust_shuvo! }, { orderNumber: 'TEST-651', orderItemId: ids.line_rahim_M, rating: 5, body: 'Sample.' }))).toBe('NOT_FOUND');
    // not a line of that order
    expect(await code(submitCustomerReview(pub(), his, { orderNumber: 'TEST-651', orderItemId: ids.line_shuvo_M, rating: 5, body: 'Sample.' }))).toBe('NOT_FOUND');
    // not delivered yet
    expect(await code(submitCustomerReview(pub(), { storeId: A, customerId: ids.cust_shuvo! }, { orderNumber: 'TEST-652', orderItemId: ids.line_shuvo_M, rating: 5, body: 'Sample.' }))).toBe('NOT_DELIVERED');
    // delivered too long ago (`reviews.submit.withinDays`)
    expect(await code(submitCustomerReview(pub(), { storeId: A, customerId: ids.cust_nabil! }, { orderNumber: 'TEST-653', orderItemId: ids.line_nabil_M, rating: 5, body: 'Sample.' }))).toBe('TOO_LATE');
    // and nothing at all while the owner has reviews switched off
    set('reviews.submit', { ...SUBMIT, enabled: false });
    expect(await code(submitCustomerReview(pub(), his, { orderNumber: 'TEST-651', orderItemId: ids.line_rahim_M, rating: 5, body: 'Sample.' }))).toBe('REVIEWS_OFF');
    expect(await reviewChance(pub(), { ...his, orderNumber: 'TEST-651' })).toMatchObject({ can: false, why: 'off' });
    overrides.delete('reviews.submit');

    const first = await submitCustomerReview(pub(), his, {
      orderNumber: 'TEST-651',
      orderItemId: ids.line_rahim_M,
      rating: 5,
      body: 'Sample review: the M was right for me.',
      fit: 'RIGHT',
      heightCm: 175,
      weightKg: 72,
    });
    expect(first).toMatchObject({ status: 'PENDING', rewardMinor: null });
    ids.review_m = first.id;
    // the same line again is refused; his other line is still open
    expect(await code(submitCustomerReview(pub(), his, { orderNumber: 'TEST-651', orderItemId: ids.line_rahim_M, rating: 4 }))).toBe('CONFLICT');
    const chance = await reviewChance(pub(), { ...his, orderNumber: 'TEST-651' });
    expect(chance).toMatchObject({ can: true, why: 'ok' });
    expect(chance.lines).toEqual([
      { orderItemId: ids.line_rahim_M, reviewed: 'PENDING' },
      { orderItemId: ids.line_rahim_L, reviewed: null },
    ]);
    // an order nobody can find says so instead of throwing
    expect(await reviewChance(pub(), { ...his, orderNumber: 'TEST-999' })).toMatchObject({ can: false, why: 'not-found', lines: [] });
  });

  it('the review carries what the line says it was, and nothing it was not told', async () => {
    const r = await getReview(deps(), as(viewer), ids.review_m!);
    expect(r).toMatchObject({
      status: 'PENDING',
      source: 'CUSTOMER',
      isVerifiedPurchase: true, // from the order itself (`reviews.moderation.verifyFromOrder`)
      rating: 5,
      fit: 'RIGHT',
      heightCm: 175,
      weightKg: 72,
      sizeLabel: 'M',
      colourName: 'Navy',
      publishedAt: null,
      reward: null,
    });
    expect(r.productId).toBe(ids.product);
    expect(r.photos).toEqual([]);
    // the shop can set the verified mark by hand too
    expect((await setReviewVerified(deps(), as(moderator), r.id, false)).isVerifiedPurchase).toBe(false);
    expect((await setReviewVerified(deps(), as(moderator), r.id, true)).isVerifiedPurchase).toBe(true);
  });

  it('a waiting review teaches PR 59 nothing; an approved one does, and only once approved', async () => {
    const from = new Date(clock.getTime() - 30 * 86_400_000);
    expect(await approvedFitSignals(deps(), A, from, clock)).toEqual([]);
    await moderateReview(deps(), as(moderator), ids.review_m!, { action: 'approve' });
    const after = await approvedFitSignals(deps(), A, from, clock);
    expect(after).toEqual([{ productId: ids.product, orderItemId: ids.line_rahim_M, fit: 'RIGHT', heightCm: 175, weightKg: 72, sizeLabel: 'M' }]);
    // hidden again, it teaches nothing again
    await moderateReview(deps(), as(moderator), ids.review_m!, { action: 'hide', reason: 'Sample: checking with the buyer.' });
    expect(await approvedFitSignals(deps(), A, from, clock)).toEqual([]);
    const hidden = await getReview(deps(), as(viewer), ids.review_m!);
    expect(hidden).toMatchObject({ status: 'HIDDEN', publishedAt: null, hiddenReason: 'Sample: checking with the buyer.' });
    await moderateReview(deps(), as(moderator), ids.review_m!, { action: 'approve' });
  });

  it('with the perk off — the shipped default — approving a photo review pays nothing', async () => {
    expect(REWARD.enabled).toBe(false);
    expect(REWARD.amountMinor).toBeNull();
    const photo = await image();
    const sent = await submitCustomerReview(pub(), { storeId: A, customerId: ids.cust_rahim! }, {
      orderNumber: 'TEST-651',
      orderItemId: ids.line_rahim_L,
      rating: 5,
      body: 'Sample review: here is the L on me.',
      photoAssetIds: [photo],
    });
    expect(sent.rewardMinor).toBeNull();
    ids.review_l = sent.id;
    const done = await moderateReview(deps(), as(moderator), sent.id, { action: 'approve' });
    expect(done.reward).toBeNull();
    expect(done.review.reward).toBeNull();
    expect(await walletOf('rahim')).toEqual([]);
    // and switched on with no amount typed in, still nothing
    set('reviews.photoReward', { ...REWARD, enabled: true });
    expect((await moderateReview(deps(), as(moderator), sent.id, { action: 'approve' })).reward).toBeNull();
    expect(await walletOf('rahim')).toEqual([]);
    overrides.delete('reviews.photoReward');
  });

  it('with the perk on and his own figure, one approval credits the wallet once — never twice, never for a second line of the same order', async () => {
    set('reviews.photoReward', { ...REWARD, enabled: true, amountMinor: AMOUNT });
    // the form may now say what an approved photo review is worth, because the owner typed a figure
    const promised = await submitCustomerReview(pub(), { storeId: A, customerId: ids.cust_karim! }, { orderNumber: 'TEST-654', orderItemId: ids.line_karim_M, rating: 5, body: 'Sample review: my own photo.', photoAssetIds: [await image()] });
    expect(promised.rewardMinor).toBe(AMOUNT);

    // his photo review of the L line (approved above while the perk was off) earns it on the next approval
    await moderateReview(deps(), as(moderator), ids.review_l!, { action: 'hide' });
    const paid = await moderateReview(deps(), as(moderator), ids.review_l!, { action: 'approve' });
    expect(paid.reward).toMatchObject({ amountMinor: AMOUNT });
    expect(paid.review.reward).toMatchObject({ amountMinor: AMOUNT });
    expect(await walletOf('rahim')).toEqual([
      { direction: 'CREDIT', amountMinor: AMOUNT, balanceAfterMinor: AMOUNT, reason: 'REVIEW_REWARD', idempotencyKey: `review:${ids.review_l}` },
    ]);
    // approved again: the ledger does not move
    expect((await moderateReview(deps(), as(moderator), ids.review_l!, { action: 'approve' })).reward).toBeNull();
    expect(await walletOf('rahim')).toHaveLength(1);

    // his other line of the **same order**, photo and all, earns nothing more while `onePerOrder` is on
    await t.prisma.reviewMedia.create({ data: { storeId: A, reviewId: ids.review_m!, assetId: await image(), sortOrder: 0 } });
    await moderateReview(deps(), as(moderator), ids.review_m!, { action: 'hide' });
    expect((await moderateReview(deps(), as(moderator), ids.review_m!, { action: 'approve' })).reward).toBeNull();
    expect(await walletOf('rahim')).toHaveLength(1);

    // another buyer's own order is another reward: his own wallet, his own entry
    const his = await moderateReview(deps(), as(moderator), promised.id, { action: 'approve' });
    expect(his.reward).toMatchObject({ amountMinor: AMOUNT });
    expect(await walletOf('karim')).toEqual([
      { direction: 'CREDIT', amountMinor: AMOUNT, balanceAfterMinor: AMOUNT, reason: 'REVIEW_REWARD', idempotencyKey: `review:${promised.id}` },
    ]);
    overrides.delete('reviews.photoReward');
  });

  it('a review under the owner’s star floor, or with no photo, earns nothing even with the perk on', async () => {
    set('reviews.photoReward', { ...REWARD, enabled: true, amountMinor: AMOUNT, minRating: 4, onePerOrder: false });
    const low = await addStaffReview(deps(), as(moderator), { productId: ids.product, rating: 2, body: 'Sample: two stars.', photoAssetIds: [await image()] });
    expect((await moderateReview(deps(), as(moderator), low.id, { action: 'approve' })).reward).toBeNull();
    // a staff review has no customer behind it, so there is no wallet to credit either
    const high = await addStaffReview(deps(), as(moderator), { productId: ids.product, rating: 5, body: 'Sample: five stars.', photoAssetIds: [await image()] });
    expect((await moderateReview(deps(), as(moderator), high.id, { action: 'approve' })).reward).toBeNull();
    overrides.delete('reviews.photoReward');
  });

  it('the shop’s own review counts like any other, and publishing it straight away needs the check permission', async () => {
    expect(await code(addStaffReview(deps(), as(writer), { rating: 5, body: 'Sample: no product.' }))).toBe('INVALID_INPUT');
    expect(await code(addStaffReview(deps(), as(writer), { productId: ids.product, rating: 5, publish: true }))).toBe('FORBIDDEN');
    expect(await code(addStaffReview(deps(), as(writer), { productId: ids.product, rating: 9 }))).toBe('INVALID_INPUT');
    const waiting = await addStaffReview(deps(), as(writer), { productId: ids.product, rating: 4, body: 'Sample: he told me on WhatsApp.', displayName: 'Sample buyer (WhatsApp)', isVerifiedPurchase: true });
    expect(waiting).toMatchObject({ status: 'PENDING', source: 'STAFF', isVerifiedPurchase: true, publishedAt: null });
    const live = await addStaffReview(deps(), as(moderator), { productId: ids.product, rating: 5, body: 'Sample: he showed me the order.', publish: true, sizeLabel: 'L', colourName: 'Navy' });
    expect(live.status).toBe('APPROVED');
    expect(live.publishedAt).not.toBeNull();
  });

  it('the queue reads newest first, with the counters and the filters the shop needs', async () => {
    const all = await listReviews(deps(), as(viewer));
    expect(all.reviews.length).toBeGreaterThan(3);
    expect(all.counts.PENDING + all.counts.APPROVED + all.counts.HIDDEN + all.counts.REJECTED).toBe(all.reviews.length);
    const withPhoto = await listReviews(deps(), as(viewer), { withPhoto: true });
    expect(withPhoto.reviews.length).toBeGreaterThan(0);
    expect(withPhoto.reviews.every((r) => r.photos.length > 0)).toBe(true);
    const pending = await listReviews(deps(), as(viewer), { status: 'PENDING' });
    expect(pending.reviews.every((r) => r.status === 'PENDING')).toBe(true);
    const rewarded = await listReviews(deps(), as(viewer), { rewarded: true });
    expect(rewarded.reviews.map((r) => r.id).sort()).toContain(ids.review_l);
    expect(rewarded.reviews.every((r) => r.reward !== null)).toBe(true);
    // the archived review is out of the list unless it is asked for, and it is never deleted (hard rule 3)
    const dead = await addStaffReview(deps(), as(moderator), { productId: ids.product, rating: 3, body: 'Sample: entered twice by mistake.' });
    await t.prisma.review.update({ where: { id: dead.id }, data: { archivedAt: clock } });
    const archived = await listReviews(deps(), as(viewer), { archived: 'only' });
    expect(archived.reviews.map((r) => r.id)).toEqual([dead.id]);
    expect(await code(moderateReview(deps(), as(moderator), dead.id, { action: 'approve' }))).toBe('CONFLICT');
    // one page at a time
    const page = await listReviews(deps(), as(viewer), { limit: 2 });
    expect(page.reviews).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    const next = await listReviews(deps(), as(viewer), { limit: 2, cursor: page.nextCursor! });
    expect(next.reviews.map((r) => r.id)).not.toContain(page.reviews[0]!.id);
    // a made-up query is refused rather than quietly ignored
    expect(await code(listReviews(deps(), as(viewer), { status: 'LIVE' }))).toBe('INVALID_INPUT');
  });
});
