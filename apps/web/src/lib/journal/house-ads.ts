// S12 · PR 592 (register "Blog as a complete, standard section of the shop, with our own ad placements"; Blueprint
// C11.5 "House ads and popup rules") — the journal's house ads on the database.
//
// - Website › Blog & journal › House ads (`blog.read` to see; `blog.publish` to change): every ad (our banner, product,
//   combo or category; never an outside network) with its words in both languages, dates (whole shop days), weight and
//   on/off; each ad's places (where, for which pages, after which paragraph or card, a popup's trigger and cap); the
//   clicks and the orders credited to them per ad and place — Ordered value and Sales (`reports.read`) through
//   @extas/metrics `kpiByHouseAdPlace`, never added up here — and the card `blog.houseAds`. A new ad and a new place
//   start switched off. An ad or a place taken away is set aside (switched off, kept), never deleted. PR 597's looks
//   save and restore which ads and places are switched on (HouseAd.enabled, HouseAdPlacement.enabled).
// - The shop (`blog.houseAds.on`, off as shipped): `pageAds` gives a journal page its ads (house-ads-model.ts
//   `pickForPage`); a click goes through /api/shop/house-ad, which counts it once per place and shop day, keeps the
//   click cookie for `creditDays` and sends the reader on to the ad's page. When an order lands (checkout-api.ts)
//   `creditAdOrder` writes HouseAdOrderClick for the last click in the window. Neither ever fails the page or the order.
// - PR 592 follow-up: while `countViews` is on (off as shipped) the pages also count how often each place is seen
//   (HouseAdViews → /api/shop/house-ad/seen, `recordViews`: once per place and page view, into the same day row as the
//   clicks); the House ads page shows the views and the click rate (clicks ÷ views) beside the clicks.
// - Never money: an ad points at what the shop sells at its own price; nothing here changes a price, an offer or COD.
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { imageSources, publicMediaWhere, type ImageSource } from '@extas/media';
import { kpiByHouseAdPlace, lastDays, NO_ORDERS } from '@extas/metrics';
import { ymdIn } from '@extas/metrics/pure';
import { houseAdsSchema, storeTarget, type HouseAdsSettings } from '@extas/settings';
import { bagCookie } from '../shop/bag-model';
import { productPath } from '../shop/home-model';
import { hrefIn } from '../shop/lang';
import { ROUTES } from '../shop/routes';
import { body as readBody, fail, guardAdmin, isUuid, json, readCookie, type AdminDeps } from '../admin-auth';
import { JournalError, LIST_MAX, answer, versionOf, type JournalWho } from './journal';
import {
  AD_CLICK_COOKIE,
  adInputSchema,
  adState,
  creditedClick,
  datesOf,
  daysOf,
  isRunning,
  parseClick,
  pickForPage,
  placeInputSchema,
  popupOf,
  readPopup,
  serializeClick,
  type Candidate,
  type HouseAdKind,
  type HouseAdSlot,
  type PageFacts,
  type PlaceScope,
  type PopupCap,
  type PopupRule,
} from './house-ads-model';
import { issuesOf } from './model';
import type { Reader } from './performance';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
const KEY = 'blog.houseAds';
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/** How many ids one press may change. */
const IDS_MAX = 200; // hardcode-ok: a list length, not a business number
/** How many choices each picker of the ad form lists. */
const OPTIONS_MAX = 300; // hardcode-ok: a list length, not a business number
/** The report's periods (the card's own 30 days unless asked). */
export const AD_REPORT_DAYS = [7, 30, 90] as const; // hardcode-ok: the period buttons, like the other reports

// ---------------------------------------------------------------- the shop

/** One ad as a journal page draws it (the click goes through the shop's own counter). */
export interface ShopAd {
  placeId: string;
  slot: HouseAdSlot;
  after: number | null;
  headline: string;
  text: string | null;
  cta: string | null;
  href: string;
  image: ImageSource | null;
  alt: string;
  popup: { trigger: PopupRule; cap: PopupCap } | null;
}

/** What a page needs beside the database: the live product cards by id (the shop's catalogue). */
export interface PageAdDeps {
  cards?: (ids: string[]) => Promise<{ id: string; nameEn: string; nameBn: string | null; photos: Record<string, ImageSource> }[]>;
  rnd?: () => number;
}

const words = (lang: 'en' | 'bn', en: string | null, bn: string | null) => (lang === 'bn' && bn ? bn : en);

/** The click address of a place (the counter sends the reader on in his language). */
export const adClickHref = (placeId: string, lang: 'en' | 'bn') => `/api/shop/house-ad?p=${placeId}${lang === 'bn' ? '&l=bn' : ''}`;

/** A journal page's house ads (none while `blog.houseAds` is off). Never fails the page: anything wrong is no ads. */
export async function pageAds(db: Db, settings: Resolver, input: { storeId: number; lang: 'en' | 'bn'; page: PageFacts; slots: readonly HouseAdSlot[]; now: Date }, deps: PageAdDeps = {}): Promise<{ ads: ShopAd[]; set: HouseAdsSettings | null }> {
  try {
    const set = await settings.value(KEY, { storeId: input.storeId });
    if (!set.on) return { ads: [], set: null };
    const places = await db.houseAdPlacement.findMany({
      where: { storeId: input.storeId, enabled: true, archivedAt: null, slot: { in: [...input.slots] }, ad: { enabled: true, archivedAt: null } },
      select: { id: true, slot: true, postId: true, blogCategoryId: true, afterParagraph: true, trigger: true, frequencyCap: true, ad: true },
      take: LIST_MAX,
    });
    const running = places.filter((p) => isRunning(p.ad, input.now));
    const cands: Candidate[] = running.map((p) => ({ placeId: p.id, adId: p.ad.id, slot: p.slot as HouseAdSlot, kind: p.ad.kind as HouseAdKind, target: p.ad.targetRef, weight: p.ad.weight, postId: p.postId, blogCategoryId: p.blogCategoryId, after: p.afterParagraph }));
    const chosen = pickForPage(cands, input.page, input.slots, set, deps.rnd);
    if (!chosen.length) return { ads: [], set };
    const byPlace = new Map(running.map((p) => [p.id, p]));
    const assetIds = [...new Set(chosen.map((c) => byPlace.get(c.placeId)!.ad.creativeAssetId).filter((x): x is string => !!x))];
    const productIds = chosen.filter((c) => c.kind === 'product' && c.target).map((c) => c.target!);
    const [assets, pics, cards] = await Promise.all([
      assetIds.length ? db.mediaAsset.findMany({ where: { id: { in: assetIds }, storeId: input.storeId, archivedAt: null, kind: 'IMAGE' }, select: { id: true, altEn: true, altBn: true } }) : Promise.resolve([]),
      assetIds.length ? imageSources({ db, settings }, input.storeId, assetIds) : Promise.resolve(new Map<string, ImageSource>()),
      productIds.length && deps.cards ? deps.cards(productIds) : Promise.resolve([]),
    ]);
    const assetOf = new Map(assets.map((a) => [a.id, a]));
    const cardOf = new Map(cards.map((c) => [c.id, c]));
    const ads: ShopAd[] = [];
    for (const c of chosen) {
      const p = byPlace.get(c.placeId)!;
      const ad = p.ad;
      // a product ad shows only while its product is live (a card exists); a banner only with its picture
      const card = c.kind === 'product' ? cardOf.get(c.target ?? '') : undefined;
      if (c.kind === 'product' && !card) continue;
      const asset = ad.creativeAssetId ? assetOf.get(ad.creativeAssetId) : undefined;
      const own = asset ? pics.get(asset.id) : undefined;
      const photo = own && own.variants.length ? own : card ? (card.photos['*'] ?? Object.values(card.photos)[0] ?? null) : null;
      if (c.kind === 'banner' && !(own && own.variants.length)) continue;
      ads.push({
        placeId: c.placeId,
        slot: c.slot,
        after: c.after,
        headline: words(input.lang, ad.headlineEn, ad.headlineBn) ?? ad.name,
        text: words(input.lang, ad.textEn, ad.textBn),
        cta: words(input.lang, ad.ctaEn, ad.ctaBn),
        href: adClickHref(c.placeId, input.lang),
        image: photo && photo.variants.length ? photo : null,
        alt: (asset ? (input.lang === 'bn' ? asset.altBn || asset.altEn : asset.altEn || asset.altBn) : card ? (input.lang === 'bn' && card.nameBn) || card.nameEn : null) ?? '',
        popup: c.slot === 'popup' ? readPopup(p.trigger, p.frequencyCap, set) : null,
      });
    }
    return { ads, set };
  } catch (e) {
    console.warn(`house ads: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    return { ads: [], set: null };
  }
}

/** Where an ad sends the reader (null: its product, combo or category is no longer live — the journal instead). */
export async function adTarget(db: Db, settings: Reader, storeId: number, ad: { kind: string; targetRef: string | null }): Promise<string | null> {
  const t = ad.targetRef ?? '';
  if (ad.kind === 'banner') return t.startsWith('/') && !t.startsWith('//') ? t : null;
  if (!isUuid(t)) return null;
  if (ad.kind === 'product') {
    const p = await db.product.findFirst({ where: { id: t, storeId, status: 'PUBLISHED', archivedAt: null }, select: { slug: true } });
    return p ? productPath(await settings.value('naming.productPathPrefix', { storeId }), p.slug) : null;
  }
  if (ad.kind === 'combo') {
    const c = await db.combo.findFirst({ where: { id: t, storeId, status: 'RUNNING', archivedAt: null }, select: { slug: true } });
    return c ? ROUTES.combo(c.slug) : null;
  }
  const k = await db.category.findFirst({ where: { id: t, storeId, isVisible: true, archivedAt: null }, select: { slug: true } });
  return k ? ROUTES.category(k.slug) : null;
}

/** One click on a running ad's place: counted once per place a shop day; returns the click cookie to keep. */
export async function recordClick(db: Db, settings: Reader, input: { storeId: number; placeId: string; now: Date }): Promise<{ target: string | null; cookie: string | null }> {
  const set = await settings.value(KEY, { storeId: input.storeId });
  if (!set.on) return { target: null, cookie: null };
  const p = await db.houseAdPlacement.findFirst({ where: { id: input.placeId, storeId: input.storeId, enabled: true, archivedAt: null }, select: { id: true, slot: true, ad: true } });
  if (!p || !isRunning(p.ad, input.now)) return { target: null, cookie: null };
  const target = await adTarget(db, settings, input.storeId, p.ad);
  const timeZone = await settings.value('store.timeZone', { storeId: input.storeId });
  const day = new Date(`${ymdIn(input.now, timeZone)}T00:00:00Z`);
  const where = { placementId_day: { placementId: p.id, day } };
  try {
    await db.houseAdDailyStat.upsert({ where, create: { storeId: input.storeId, placementId: p.id, adId: p.ad.id, slot: p.slot, day, clicks: 1 }, update: { clicks: { increment: 1 } } });
  } catch (e) {
    // two first clicks of the day at once: the other one made the row
    if (!isUnique(e)) throw e;
    await db.houseAdDailyStat.update({ where, data: { clicks: { increment: 1 } } });
  }
  return { target, cookie: bagCookie(AD_CLICK_COOKIE, serializeClick(p.id, input.now.getTime()), set.creditDays) };
}

/** How many places one page view may report seen. */
export const VIEWS_MAX = 12; // hardcode-ok: a list length (an article shows a handful of places at most)

/**
 * PR 592 follow-up — the places a page view saw: each running place counted once as a view for the shop day, only while
 * `blog.houseAds.on` and `countViews`. Returns how many were counted.
 */
export async function recordViews(db: Db, settings: Reader, input: { storeId: number; placeIds: readonly string[]; now: Date }): Promise<number> {
  const ids = [...new Set(input.placeIds.filter((x) => isUuid(x)))].slice(0, VIEWS_MAX);
  if (!ids.length) return 0;
  const set = await settings.value(KEY, { storeId: input.storeId });
  if (!set.on || !set.countViews) return 0;
  const places = await db.houseAdPlacement.findMany({ where: { id: { in: ids }, storeId: input.storeId, enabled: true, archivedAt: null }, select: { id: true, slot: true, ad: true } });
  const running = places.filter((p) => isRunning(p.ad, input.now));
  if (!running.length) return 0;
  const timeZone = await settings.value('store.timeZone', { storeId: input.storeId });
  const day = new Date(`${ymdIn(input.now, timeZone)}T00:00:00Z`);
  for (const p of running) {
    const where = { placementId_day: { placementId: p.id, day } };
    try {
      await db.houseAdDailyStat.upsert({ where, create: { storeId: input.storeId, placementId: p.id, adId: p.ad.id, slot: p.slot, day, views: 1 }, update: { views: { increment: 1 } } });
    } catch (e) {
      // two first counts of the day at once: the other one made the row
      if (!isUnique(e)) throw e;
      await db.houseAdDailyStat.update({ where, data: { views: { increment: 1 } } });
    }
  }
  return running.length;
}

/** POST /api/shop/house-ad/seen {p: [place ids]} — count the views; only from the shop's own pages; always 204. */
export async function viewsHandler(request: Request, deps: { db: Db; settings: Reader; storeId: number; now?: () => Date } | null): Promise<Response> {
  const done = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return done();
    } catch {
      return done();
    }
  }
  if (!deps) return done();
  try {
    const raw = (await request.text()).slice(0, 4096); // hardcode-ok: a dozen ids fit many times over
    const o = JSON.parse(raw) as { p?: unknown };
    const ids = Array.isArray(o.p) ? o.p.filter((x): x is string => typeof x === 'string') : [];
    await recordViews(deps.db, deps.settings, { storeId: deps.storeId, placeIds: ids, now: deps.now?.() ?? new Date() });
  } catch (e) {
    if (!(e instanceof SyntaxError)) console.warn(`house ad views: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
  return done();
}

/** GET /api/shop/house-ad?p=<place>&l=bn — count the click and send the reader on (always somewhere in the shop). */
export async function clickHandler(request: Request, deps: { db: Db; settings: Reader; storeId: number; now?: () => Date } | null): Promise<Response> {
  const url = new URL(request.url);
  const lang = url.searchParams.get('l') === 'bn' ? 'bn' : 'en';
  const placeId = url.searchParams.get('p') ?? '';
  const go = (to: string, cookie: string | null) => new Response(null, { status: 302, headers: { location: hrefIn(lang, to), 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...(cookie ? { 'set-cookie': cookie } : {}) } });
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  if (!deps || !isUuid(placeId)) return go(ROUTES.journal, null);
  try {
    const r = await recordClick(deps.db, deps.settings, { storeId: deps.storeId, placeId, now: deps.now?.() ?? new Date() });
    return go(r.target ?? ROUTES.journal, r.cookie);
  } catch (e) {
    console.warn(`house ad click: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    return go(ROUTES.journal, null);
  }
}

/** The order credits the browser's last house ad click in the window (written once; never fails the order). */
export async function creditAdOrder(db: Db, settings: Reader, input: { storeId: number; orderId: string; cookie: string | null }): Promise<number> {
  try {
    const set = await settings.value(KEY, { storeId: input.storeId });
    if (!set.on) return 0;
    const click = parseClick(input.cookie);
    if (!click) return 0;
    const order = await db.order.findFirst({ where: { id: input.orderId, storeId: input.storeId }, select: { placedAt: true } });
    if (!order) return 0;
    const ok = creditedClick(click, order.placedAt, set.creditDays);
    if (!ok) return 0;
    const p = await db.houseAdPlacement.findFirst({ where: { id: ok.placeId, storeId: input.storeId }, select: { id: true, adId: true, slot: true } });
    if (!p) return 0;
    const r = await db.houseAdOrderClick.createMany({ data: [{ storeId: input.storeId, orderId: input.orderId, adId: p.adId, placementId: p.id, slot: p.slot, clickedAt: new Date(ok.at) }], skipDuplicates: true });
    return r.count;
  } catch (e) {
    console.warn(`house ad credit: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    return 0;
  }
}

/** The browser's click cookie (for the checkout). */
export const clickCookieOf = (request: Request) => readCookie(request, AD_CLICK_COOKIE);

// ---------------------------------------------------------------- the admin

export interface Figure {
  orders: number;
  valueMinor: number;
}

export interface PlaceRow {
  id: string;
  adId: string;
  slot: HouseAdSlot;
  scope: PlaceScope;
  postId: string | null;
  post: { title: string; locale: string } | null;
  blogCategoryId: string | null;
  category: string | null;
  after: number | null;
  popup: { trigger: PopupRule; cap: PopupCap } | null;
  enabled: boolean;
  aside: boolean;
  clicks: number;
  /** PR 592 follow-up: views (0 while they are not counted). */
  views: number;
  ordered: Figure;
  sales: Figure;
}

export interface AdRow {
  id: string;
  name: string;
  kind: HouseAdKind;
  target: string | null;
  targetName: string | null;
  state: ReturnType<typeof adState>;
  enabled: boolean;
  weight: number;
  startsOn: string | null;
  endsOn: string | null;
  headlineEn: string | null;
  headlineBn: string | null;
  textEn: string | null;
  textBn: string | null;
  ctaEn: string | null;
  ctaBn: string | null;
  creativeAssetId: string | null;
  places: PlaceRow[];
  clicks: number;
  views: number;
  ordered: Figure;
  sales: Figure;
}

export interface AdsScreen {
  timeZone: string;
  from: string;
  to: string;
  days: number;
  ads: AdRow[];
  totals: { running: number; placesOn: number; clicks: number; views: number; orders: number };
  card: { key: string; value: HouseAdsSettings; version: string };
}

const fig = (f: { orders: number; valueMinor: number } | undefined): Figure => ({ orders: f?.orders ?? 0, valueMinor: f?.valueMinor ?? 0 });
const add = (a: Figure, b: Figure): Figure => ({ orders: a.orders + b.orders, valueMinor: a.valueMinor + b.valueMinor });

/** The names of what ads point at (products, combos, categories). */
async function targetNames(db: Db, storeId: number, ads: { kind: string; targetRef: string | null }[]): Promise<Map<string, string>> {
  const ids = (k: string) => [...new Set(ads.filter((a) => a.kind === k && a.targetRef && isUuid(a.targetRef)).map((a) => a.targetRef!))];
  const [p, c, k] = await Promise.all([
    ids('product').length ? db.product.findMany({ where: { id: { in: ids('product') }, storeId }, select: { id: true, nameEn: true } }) : Promise.resolve([]),
    ids('combo').length ? db.combo.findMany({ where: { id: { in: ids('combo') }, storeId }, select: { id: true, nameEn: true } }) : Promise.resolve([]),
    ids('category').length ? db.category.findMany({ where: { id: { in: ids('category') }, storeId }, select: { id: true, nameEn: true } }) : Promise.resolve([]),
  ]);
  return new Map([...p, ...c, ...k].map((x) => [x.id, x.nameEn]));
}

/** The House ads page: every ad with its places and their clicks and credited orders over the last `days` shop days. */
export async function adsScreen(db: Db, resolver: Resolver, now: Date, opts: { days?: number | null } = {}, storeId: number = S): Promise<AdsScreen> {
  const [value, timeZone] = await Promise.all([resolver.value(KEY, { storeId }), resolver.value('store.timeZone', { storeId })]);
  const days = opts.days && (AD_REPORT_DAYS as readonly number[]).includes(opts.days) ? opts.days : 30; // hardcode-ok: the report's default period
  const { from, to, period } = lastDays(days, now, timeZone);
  const [ads, clicks, kpis] = await Promise.all([
    db.houseAd.findMany({ where: { storeId }, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], take: LIST_MAX, include: { placements: { orderBy: { createdAt: 'asc' } } } }),
    db.houseAdDailyStat.groupBy({ by: ['placementId'], where: { storeId, day: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, _sum: { clicks: true, views: true } }),
    kpiByHouseAdPlace(db, storeId, period),
  ]);
  const clickOf = new Map(clicks.map((c) => [c.placementId, c._sum.clicks ?? 0]));
  const viewOf = new Map(clicks.map((c) => [c.placementId, c._sum.views ?? 0]));
  const kpiOf = new Map(kpis.map((k) => [k.key, k]));
  const places = ads.flatMap((a) => a.placements);
  const postIds = [...new Set(places.map((p) => p.postId).filter((x): x is string => !!x))];
  const catIds = [...new Set(places.map((p) => p.blogCategoryId).filter((x): x is string => !!x))];
  const [posts, cats, names] = await Promise.all([
    postIds.length ? db.blogPost.findMany({ where: { id: { in: postIds }, storeId }, select: { id: true, title: true, locale: true } }) : Promise.resolve([]),
    catIds.length ? db.blogCategory.findMany({ where: { id: { in: catIds }, storeId }, select: { id: true, nameEn: true } }) : Promise.resolve([]),
    targetNames(db, storeId, ads),
  ]);
  const postOf = new Map(posts.map((p) => [p.id, p]));
  const catOf = new Map(cats.map((c) => [c.id, c.nameEn]));
  const totals = { running: 0, placesOn: 0, clicks: 0, views: 0, orders: 0 };
  const rows: AdRow[] = ads.map((a) => {
    const state = adState(a, now);
    if (state === 'running') totals.running += 1;
    const pr: PlaceRow[] = a.placements.map((p) => {
      const k = kpiOf.get(p.id);
      const n = clickOf.get(p.id) ?? 0;
      totals.clicks += n;
      const seen = viewOf.get(p.id) ?? 0;
      totals.views += seen;
      totals.orders += k?.ordered.orders ?? 0;
      if (p.enabled && !p.archivedAt && !a.archivedAt) totals.placesOn += 1;
      const post = p.postId ? postOf.get(p.postId) : undefined;
      return {
        id: p.id,
        adId: a.id,
        slot: p.slot as HouseAdSlot,
        scope: p.postId ? 'post' : p.blogCategoryId ? 'category' : 'all',
        postId: p.postId,
        post: post ? { title: post.title, locale: post.locale } : null,
        blogCategoryId: p.blogCategoryId,
        category: p.blogCategoryId ? (catOf.get(p.blogCategoryId) ?? null) : null,
        after: p.afterParagraph,
        popup: p.slot === 'popup' ? readPopup(p.trigger, p.frequencyCap, value) : null,
        enabled: p.enabled,
        aside: !!p.archivedAt,
        clicks: n,
        views: seen,
        ordered: fig(k?.ordered ?? NO_ORDERS),
        sales: fig(k?.sales ?? NO_ORDERS),
      };
    });
    const d = daysOf(a.startsAt, a.endsAt, timeZone);
    return {
      id: a.id,
      name: a.name,
      kind: a.kind as HouseAdKind,
      target: a.targetRef,
      targetName: a.kind === 'banner' ? a.targetRef : (names.get(a.targetRef ?? '') ?? null),
      state,
      enabled: a.enabled,
      weight: a.weight,
      ...d,
      headlineEn: a.headlineEn,
      headlineBn: a.headlineBn,
      textEn: a.textEn,
      textBn: a.textBn,
      ctaEn: a.ctaEn,
      ctaBn: a.ctaBn,
      creativeAssetId: a.creativeAssetId,
      places: pr,
      clicks: pr.reduce((n, p) => n + p.clicks, 0),
      views: pr.reduce((n, p) => n + p.views, 0),
      ordered: pr.reduce((f, p) => add(f, p.ordered), { orders: 0, valueMinor: 0 }),
      sales: pr.reduce((f, p) => add(f, p.sales), { orders: 0, valueMinor: 0 }),
    };
  });
  return { timeZone, from, to, days, ads: rows, totals, card: { key: KEY, value, version: versionOf(value) } };
}

export interface AdOptions {
  products: { id: string; name: string }[];
  combos: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  topics: { id: string; name: string }[];
  posts: { id: string; name: string; locale: string }[];
  pictures: { id: string; name: string }[];
}

/** The pickers of the ad form: live products, running combos, shown categories, journal topics, articles, pictures. */
export async function adOptions(db: Db, storeId: number = S): Promise<AdOptions> {
  const [products, combos, categories, topics, posts, pictures] = await Promise.all([
    db.product.findMany({ where: { storeId, status: 'PUBLISHED', archivedAt: null }, orderBy: { nameEn: 'asc' }, take: OPTIONS_MAX, select: { id: true, nameEn: true } }),
    db.combo.findMany({ where: { storeId, status: 'RUNNING', archivedAt: null }, orderBy: { nameEn: 'asc' }, take: OPTIONS_MAX, select: { id: true, nameEn: true } }),
    db.category.findMany({ where: { storeId, isVisible: true, archivedAt: null }, orderBy: { nameEn: 'asc' }, take: OPTIONS_MAX, select: { id: true, nameEn: true } }),
    db.blogCategory.findMany({ where: { storeId, archivedAt: null }, orderBy: { nameEn: 'asc' }, take: OPTIONS_MAX, select: { id: true, nameEn: true } }),
    db.blogPost.findMany({ where: { storeId, archivedAt: null, status: { in: ['PUBLISHED', 'SCHEDULED'] } }, orderBy: { updatedAt: 'desc' }, take: OPTIONS_MAX, select: { id: true, title: true, locale: true } }),
    db.mediaAsset.findMany({ where: { storeId, archivedAt: null, kind: 'IMAGE', ...publicMediaWhere() }, orderBy: { createdAt: 'desc' }, take: OPTIONS_MAX, select: { id: true, altEn: true, originalFileName: true } }),
  ]);
  const n = (x: { id: string; nameEn: string }) => ({ id: x.id, name: x.nameEn });
  return {
    products: products.map(n),
    combos: combos.map(n),
    categories: categories.map(n),
    topics: topics.map(n),
    posts: posts.map((p) => ({ id: p.id, name: p.title, locale: p.locale })),
    pictures: pictures.map((p) => ({ id: p.id, name: p.altEn || p.originalFileName || p.id.slice(0, 8) })),
  };
}

const AD_SELECT = { id: true, name: true, kind: true, targetRef: true, creativeAssetId: true, weight: true, enabled: true, startsAt: true, endsAt: true, archivedAt: true, headlineEn: true, headlineBn: true, textEn: true, textBn: true, ctaEn: true, ctaBn: true } as const;

/** Save an ad (new: switched off, with no place yet). Returns its id. */
export async function saveAd(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<string> {
  const o = (input ?? {}) as { id?: unknown; ad?: unknown };
  const ok = adInputSchema.safeParse(o.ad);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const v = ok.data;
  const timeZone = await resolver.value('store.timeZone', { storeId });
  if (v.creativeAssetId && !(await db.mediaAsset.findFirst({ where: { id: v.creativeAssetId, storeId, archivedAt: null, kind: 'IMAGE' }, select: { id: true } }))) throw new JournalError('INVALID_INPUT', 400, ['creativeAssetId']);
  const data = {
    name: v.name,
    kind: v.kind,
    targetRef: v.target,
    creativeAssetId: v.creativeAssetId,
    weight: v.weight,
    ...datesOf(v.startsOn, v.endsOn, timeZone),
    headlineEn: v.headlineEn,
    headlineBn: v.headlineBn,
    textEn: v.textEn,
    textBn: v.textBn,
    ctaEn: v.ctaEn,
    ctaBn: v.ctaBn,
  };
  if (o.id === undefined || o.id === null) {
    const row = await db.houseAd.create({ data: { storeId, ...data, enabled: false }, select: AD_SELECT });
    await audit(db, who.actor, { storeId, action: 'blog.houseAd.create', entityType: 'HouseAd', entityId: row.id, after: { ...row } }, who.ctx);
    return row.id;
  }
  if (typeof o.id !== 'string' || !isUuid(o.id)) throw new JournalError('INVALID_INPUT', 400, ['id']);
  const before = await db.houseAd.findFirst({ where: { id: o.id, storeId }, select: AD_SELECT });
  if (!before) throw new JournalError('NOT_FOUND', 404);
  const after = await db.houseAd.update({ where: { id: before.id }, data, select: AD_SELECT });
  await audit(db, who.actor, { storeId, action: 'blog.houseAd.update', entityType: 'HouseAd', entityId: before.id, before: { ...before }, after: { ...after } }, who.ctx);
  return before.id;
}

const idsOf = (v: unknown): string[] => {
  const ids = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && isUuid(x)))] : [];
  if (!ids.length || ids.length > IDS_MAX || (Array.isArray(v) && ids.length !== v.length)) throw new JournalError('INVALID_INPUT', 400, ['ids']);
  return ids;
};

/** Switch ads or places on or off, or set them aside / bring them back (`what`: ad | place). Returns how many changed. */
export async function switchRows(db: Db, who: JournalWho, input: unknown, now: Date = new Date(), storeId: number = S): Promise<number> {
  const o = (input ?? {}) as { ids?: unknown; what?: unknown; on?: unknown; aside?: unknown };
  const ids = idsOf(o.ids);
  if (o.what !== 'ad' && o.what !== 'place') throw new JournalError('INVALID_INPUT', 400, ['what']);
  if (typeof o.on !== 'boolean' && typeof o.aside !== 'boolean') throw new JournalError('INVALID_INPUT', 400, ['on']);
  const ad = o.what === 'ad';
  const rows = ad
    ? await db.houseAd.findMany({ where: { id: { in: ids }, storeId }, select: { id: true, enabled: true, archivedAt: true } })
    : await db.houseAdPlacement.findMany({ where: { id: { in: ids }, storeId }, select: { id: true, enabled: true, archivedAt: true } });
  if (rows.length !== ids.length) throw new JournalError('NOT_FOUND', 404);
  let changed = 0;
  for (const r of rows) {
    let data: { enabled?: boolean; archivedAt?: Date | null } = {};
    if (typeof o.on === 'boolean') {
      // an ad or place set aside stays off until it is brought back
      if (r.archivedAt || r.enabled === o.on) continue;
      data = { enabled: o.on };
    } else {
      if (!!r.archivedAt === o.aside) continue;
      data = o.aside ? { archivedAt: now, enabled: false } : { archivedAt: null };
    }
    if (ad) await db.houseAd.update({ where: { id: r.id }, data });
    else await db.houseAdPlacement.update({ where: { id: r.id }, data });
    changed += 1;
    const verb = typeof o.on === 'boolean' ? (o.on ? 'on' : 'off') : o.aside ? 'aside' : 'back';
    await audit(db, who.actor, { storeId, action: `blog.houseAd${ad ? '' : '.place'}.${verb}`, entityType: ad ? 'HouseAd' : 'HouseAdPlacement', entityId: r.id, before: { enabled: r.enabled, archived: !!r.archivedAt }, after: { enabled: data.enabled ?? r.enabled, archived: data.archivedAt === undefined ? !!r.archivedAt : !!data.archivedAt } }, who.ctx);
  }
  return changed;
}

/** Save a place of an ad (new: switched off). Returns its id. */
export async function savePlace(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<string> {
  const o = (input ?? {}) as { id?: unknown; adId?: unknown; place?: unknown };
  if (typeof o.adId !== 'string' || !isUuid(o.adId)) throw new JournalError('INVALID_INPUT', 400, ['adId']);
  const ok = placeInputSchema.safeParse(o.place);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const v = ok.data;
  const ad = await db.houseAd.findFirst({ where: { id: o.adId, storeId }, select: { id: true } });
  if (!ad) throw new JournalError('NOT_FOUND', 404);
  if (v.scope === 'category' && !(await db.blogCategory.findFirst({ where: { id: v.blogCategoryId!, storeId }, select: { id: true } }))) throw new JournalError('INVALID_INPUT', 400, ['blogCategoryId']);
  if (v.scope === 'post' && !(await db.blogPost.findFirst({ where: { id: v.postId!, storeId }, select: { id: true } }))) throw new JournalError('INVALID_INPUT', 400, ['postId']);
  const set = await resolver.value(KEY, { storeId });
  const pop = popupOf(v, set);
  const data = {
    slot: v.slot,
    postId: v.scope === 'post' ? v.postId : null,
    blogCategoryId: v.scope === 'category' ? v.blogCategoryId : null,
    afterParagraph: ['inline', 'listBetween'].includes(v.slot) ? v.after : null,
    trigger: pop ? (pop.trigger as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    frequencyCap: pop ? (pop.cap as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
  const SEL = { id: true, slot: true, postId: true, blogCategoryId: true, afterParagraph: true, trigger: true, frequencyCap: true, enabled: true } as const;
  if (o.id === undefined || o.id === null) {
    const row = await db.houseAdPlacement.create({ data: { storeId, adId: ad.id, ...data, enabled: false }, select: SEL });
    await audit(db, who.actor, { storeId, action: 'blog.houseAd.place.create', entityType: 'HouseAdPlacement', entityId: row.id, after: { ...row, adId: ad.id } }, who.ctx);
    return row.id;
  }
  if (typeof o.id !== 'string' || !isUuid(o.id)) throw new JournalError('INVALID_INPUT', 400, ['id']);
  const before = await db.houseAdPlacement.findFirst({ where: { id: o.id, storeId, adId: ad.id }, select: SEL });
  if (!before) throw new JournalError('NOT_FOUND', 404);
  const after = await db.houseAdPlacement.update({ where: { id: before.id }, data, select: SEL });
  await audit(db, who.actor, { storeId, action: 'blog.houseAd.place.update', entityType: 'HouseAdPlacement', entityId: before.id, before: { ...before }, after: { ...after } }, who.ctx);
  return before.id;
}

/** The card (`blog.publish`): the switch card's {key, on, values} or the whole value with its version. */
export async function saveAdSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const before = await resolver.value(KEY, { storeId });
  const o = (input ?? {}) as { key?: unknown; on?: unknown; values?: unknown; value?: unknown; version?: unknown };
  let next: unknown;
  if (o.key === KEY && typeof o.on === 'boolean') {
    const values = { ...((o.values && typeof o.values === 'object' ? o.values : {}) as Record<string, unknown>) };
    // the card's choice "never / allowed" for the search guard arrives as its option's value
    if (values.searchGuard === 'on' || values.searchGuard === 'off') values.searchGuard = values.searchGuard === 'on';
    // PR 592 follow-up: "count views" arrives the same way
    if (values.countViews === 'on' || values.countViews === 'off') values.countViews = values.countViews === 'on';
    next = { ...before, ...values, on: o.on };
  }
  else {
    if (typeof o.version !== 'string' || o.version !== versionOf(before)) throw new JournalError('STALE', 409);
    next = o.value;
  }
  const ok = houseAdsSchema.safeParse(next);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › House ads' });
  await audit(db, who.actor, { storeId, action: 'blog.houseAds.settings', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/**
 * /api/admin/blog/ads — GET the page (`blog.read`, ?days=7|30|90); POST {op: 'ad', id?, ad} · {op: 'place', adId, id?,
 * place} · {op: 'switch', what: ad|place, ids, on | aside} (`blog.publish`); PUT the card (`blog.publish`). Every answer
 * carries the page (and `id` of what was saved).
 */
export async function adsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!['GET', 'POST', 'PUT'].includes(method)) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.publish', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const now = deps!.now?.() ?? new Date();
  try {
    const who = { actor: g.actor, ctx: g.ctx };
    let id: string | undefined;
    let changed: number | undefined;
    if (method === 'POST') {
      const b = (await readBody(request)) as Record<string, unknown>;
      if (b.op === 'ad') id = await saveAd(db, deps!.resolver, who, b);
      else if (b.op === 'place') id = await savePlace(db, deps!.resolver, who, b);
      else if (b.op === 'switch') changed = await switchRows(db, who, b, now);
      else throw new JournalError('INVALID_INPUT', 400, ['op']);
    }
    if (method === 'PUT') await saveAdSettings(db, deps!.resolver, who, await readBody(request));
    const days = Number(new URL(request.url).searchParams.get('days')) || null;
    const screen = await adsScreen(db, deps!.resolver, now, { days });
    return json({ ok: true, ...(id ? { id } : {}), ...(changed === undefined ? {} : { changed }), screen });
  } catch (e) {
    return answer(e);
  }
}

