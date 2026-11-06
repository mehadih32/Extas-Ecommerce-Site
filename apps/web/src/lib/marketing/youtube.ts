// S13 · PR 278 (register "YouTube module — channel, videos, and the attribution back to orders"; Blueprint C4.4) —
// Marketing › YouTube. Off as it ships (`marketing.youtube`).
// - The channel: the owner adds his channel by its link (youtube.com/channel/UC…, youtube.com/@name, or the id) and a
//   name; a channel is set aside (archived), never deleted.
// - Videos: each by its link (watch, youtu.be, shorts, embed, or the 11-character id), a title, the day it went up
//   (optional), and the products it shows (their product page links or slugs, one per line). Set aside, never deleted.
// - Attribution: each product of a video gets its tracked link for the video's description — the product page with
//   `utm_source`, `utm_medium` and `utm_campaign = <campaignPrefix><video id>` (the owner's tags). The shop's own
//   attribution (PR 257 follow-up) keeps those tags on the order, so a video is credited with the orders placed through
//   its links: placed, delivered, the delivered value, and how many of them carried one of the video's products.
// Seeing needs `marketing.campaigns.read`; adding and changing need `marketing.campaigns.write`, the settings card too.
// Every change is audited. Nothing is posted to YouTube, no money moves, no price or discount changes. Reading views and
// new uploads from the channel needs the YouTube key (a later adapter; until then the counts are the shop's own).
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { campaignTagFigures, NOT_PLACED_STATUSES, type CampaignTagFigure } from '@extas/metrics';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { storeTarget, youtubeSettingsSchema, type YoutubeSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AdPlatformsWho } from './ad-platforms';

const S = MOTHER_STORE_ID;
/** The most products one video names (a guard, not a business number). */
export const VIDEO_PRODUCTS_MAX = 20; // hardcode-ok: a list-length guard
/** Videos shown on the page, newest first. */
const VIDEOS_SHOWN = 200; // hardcode-ok: a page-length guard

export class YoutubeError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface YoutubeDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** A video's 11-character id from its link (watch, youtu.be, shorts, embed, live) or the id itself; null otherwise. */
export function videoIdOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1]! : null;
}

/** A channel's id (UC + 22) or handle (@name) from its link or as typed; null otherwise. */
export function channelIdOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const id = s.match(/(?:^|\/channel\/)(UC[A-Za-z0-9_-]{22})(?:[/?#]|$)/);
  if (id) return id[1]!;
  const handle = s.match(/(?:^|youtube\.com\/)(@[A-Za-z0-9._-]{3,30})(?:[/?#]|$)/);
  return handle ? handle[1]! : null;
}

/** A product page link or slug (one line of the products box) as a slug; null when empty. */
export function slugOf(line: string): string | null {
  const s = line.trim();
  if (!s) return null;
  let path = s;
  if (/^https?:\/\//i.test(s)) {
    try {
      path = new URL(s).pathname;
    } catch {
      return null;
    }
  }
  const last = path.split('/').filter(Boolean).pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last).trim() || null;
  } catch {
    return null;
  }
}

/** The video's campaign tag (what `utm_campaign` carries and the order keeps). */
export const videoTag = (s: Pick<YoutubeSettings, 'campaignPrefix'>, videoId: string): string => `${s.campaignPrefix}${videoId}`;

/** A product's tracked link for a video: the product page with the owner's tags. */
export function trackedLink(origin: string, productPath: string, s: YoutubeSettings, videoId: string): string {
  const u = new URL(productPath, origin);
  u.searchParams.set('utm_source', s.utmSource);
  u.searchParams.set('utm_medium', s.utmMedium);
  u.searchParams.set('utm_campaign', videoTag(s, videoId));
  return u.toString();
}

export interface YoutubeChannelRow {
  id: string;
  externalId: string;
  name: string;
  archived: boolean;
  videos: number;
}

export interface YoutubeVideoRow {
  id: string;
  channelId: string;
  channelName: string;
  externalId: string;
  title: string;
  publishedAt: string | null;
  archived: boolean;
  products: { id: string; name: string; slug: string }[];
  tag: string;
  orders: number;
  delivered: number;
  deliveredValueMinor: number;
  /** Of its orders, those that carried one of its products. */
  withProducts: number;
}

export interface YoutubeOverview {
  settings: YoutubeSettings;
  card: { key: 'youtube'; value: YoutubeSettings; version: string };
  channels: YoutubeChannelRow[];
  videos: YoutubeVideoRow[];
  totals: { videos: number; orders: number; delivered: number; deliveredValueMinor: number };
}

const settingsOf = async (deps: YoutubeDeps): Promise<YoutubeSettings> => (await deps.resolver.value('marketing.youtube', { storeId: S })) as YoutubeSettings;

/** Marketing › YouTube: the settings, the channels, the videos with their products and the orders they brought. */
export async function youtubeOverview(deps: YoutubeDeps): Promise<YoutubeOverview> {
  const settings = await settingsOf(deps);
  const [channels, videos] = await Promise.all([
    deps.db.youtubeChannel.findMany({ where: { storeId: S }, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }], select: { id: true, externalId: true, name: true, archivedAt: true, _count: { select: { videos: { where: { archivedAt: null } } } } } }),
    deps.db.youtubeVideo.findMany({ where: { storeId: S }, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take: VIDEOS_SHOWN, include: { channel: { select: { name: true } } } }),
  ]);
  const productIds = [...new Set(videos.flatMap((v) => v.productIds))];
  const products = productIds.length ? await deps.db.product.findMany({ where: { storeId: S, id: { in: productIds } }, select: { id: true, nameEn: true, slug: true } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const tags = videos.map((v) => videoTag(settings, v.externalId));
  type Pair = { tag: string; product_id: string | null; order_id: string };
  // The money figures come from @extas/metrics (the one Sales rule); only the order ↔ product pairs are read here.
  const [countOf, pairs] = tags.length
    ? await Promise.all([
        campaignTagFigures(deps.db, S, settings.utmSource, tags),
        deps.db.$queryRaw<Pair[]>`SELECT DISTINCT o."utmCampaign" AS tag, i."productId"::text AS product_id, o."id"::text AS order_id FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o."id" WHERE o."storeId" = ${S} AND o."archivedAt" IS NULL AND NOT (o."status"::text = ANY(${[...NOT_PLACED_STATUSES]})) AND lower(o."utmSource") = lower(${settings.utmSource}) AND o."utmCampaign" = ANY(${tags}::text[]) AND i."productId" IS NOT NULL`,
      ])
    : [new Map<string, CampaignTagFigure>(), [] as Pair[]];
  const rows: YoutubeVideoRow[] = videos.map((v) => {
    const tag = videoTag(settings, v.externalId);
    const c = countOf.get(tag);
    const own = new Set(v.productIds);
    const withProducts = new Set(pairs.filter((p) => p.tag === tag && p.product_id && own.has(p.product_id)).map((p) => p.order_id)).size;
    return {
      id: v.id,
      channelId: v.channelId,
      channelName: v.channel.name,
      externalId: v.externalId,
      title: v.title,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      archived: v.archivedAt !== null,
      products: v.productIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({ id: p.id, name: p.nameEn, slug: p.slug })),
      tag,
      orders: c?.orders ?? 0,
      delivered: c?.delivered ?? 0,
      deliveredValueMinor: c?.deliveredValueMinor ?? 0,
      withProducts,
    };
  });
  const live = rows.filter((r) => !r.archived);
  return {
    settings,
    card: { key: 'youtube', value: settings, version: versionOf(settings) },
    channels: channels.map((c) => ({ id: c.id, externalId: c.externalId, name: c.name, archived: c.archivedAt !== null, videos: c._count.videos })),
    videos: rows,
    totals: { videos: live.length, orders: live.reduce((a, r) => a + r.orders, 0), delivered: live.reduce((a, r) => a + r.delivered, 0), deliveredValueMinor: live.reduce((a, r) => a + r.deliveredValueMinor, 0) },
  };
}

/** PUT: the settings card ({key: 'youtube', value, version}). Audited. */
export async function saveYoutubeCard(deps: YoutubeDeps, who: AdPlatformsWho, input: unknown): Promise<YoutubeOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'youtube') throw new YoutubeError('INVALID_INPUT', 400, ['key']);
  const before = await settingsOf(deps);
  if (o.version !== versionOf(before)) throw new YoutubeError('STALE', 409);
  const ok = youtubeSettingsSchema.safeParse(o.value);
  if (!ok.success) throw new YoutubeError('INVALID_INPUT', 400, ok.error.issues.map((i) => i.path.join('.') || 'value'));
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('marketing.youtube', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › YouTube' });
    await audit(deps.db, who.actor, { storeId: S, action: 'youtube.settings', entityType: 'Setting', entityId: 'marketing.youtube', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'youtube', value: ok.data, version: versionOf(ok.data) };
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The products box (links or slugs, one per line) as this store's product ids; unknown lines refuse the save. */
async function productsOf(deps: YoutubeDeps, v: unknown): Promise<string[]> {
  const lines = typeof v === 'string' ? v.split(/\r?\n/) : Array.isArray(v) ? v.map(String) : [];
  const slugs = [...new Set(lines.map(slugOf).filter((s): s is string => !!s))];
  if (slugs.length > VIDEO_PRODUCTS_MAX) throw new YoutubeError('INVALID_INPUT', 400, ['products']);
  if (!slugs.length) return [];
  const found = await deps.db.product.findMany({ where: { storeId: S, slug: { in: slugs }, archivedAt: null }, select: { id: true, slug: true } });
  const bySlug = new Map(found.map((p) => [p.slug, p.id]));
  const unknown = slugs.filter((s) => !bySlug.has(s));
  if (unknown.length) throw new YoutubeError('UNKNOWN_PRODUCTS', 400, unknown.slice(0, 5));
  return slugs.map((s) => bySlug.get(s)!);
}

/**
 * POST {action}: `channel.add` {link, name} · `channel.archive` / `channel.restore` {id} · `video.add` {channelId, link,
 * title, products, publishedOn?} · `video.update` {id, title, products} · `video.archive` / `video.restore` {id}.
 * Only while the module is on (setting aside works when off). Audited.
 */
export async function youtubeAction(deps: YoutubeDeps, who: AdPlatformsWho, b: Record<string, unknown>): Promise<{ id: string }> {
  const action = typeof b.action === 'string' ? b.action : '';
  const settings = await settingsOf(deps);
  const setsAside = action.endsWith('.archive');
  if (!settings.enabled && !setsAside) throw new YoutubeError('SWITCHED_OFF', 409, ['marketing.youtube']);
  const id = typeof b.id === 'string' && UUID_RE.test(b.id) ? b.id : null;
  const log = (entityType: string, entityId: string, after: Record<string, unknown>, before?: Record<string, unknown>) => audit(deps.db, who.actor, { storeId: S, action: `youtube.${action}`, entityType, entityId, ...(before ? { before } : {}), after }, who.ctx);

  if (action === 'channel.add') {
    const externalId = channelIdOf(b.link);
    const name = str(b.name, 100);
    const bad = [externalId ? '' : 'link', name ? '' : 'name'].filter(Boolean);
    if (bad.length) throw new YoutubeError('INVALID_INPUT', 400, bad);
    const was = await deps.db.youtubeChannel.findUnique({ where: { storeId_externalId: { storeId: S, externalId: externalId! } } });
    if (was && !was.archivedAt) throw new YoutubeError('EXISTS', 409, ['link']);
    const row = was ? await deps.db.youtubeChannel.update({ where: { id: was.id }, data: { name, archivedAt: null } }) : await deps.db.youtubeChannel.create({ data: { storeId: S, externalId: externalId!, name } });
    await log('YoutubeChannel', row.id, { externalId, name });
    return { id: row.id };
  }
  if (action === 'channel.archive' || action === 'channel.restore') {
    const row = id ? await deps.db.youtubeChannel.findFirst({ where: { id, storeId: S } }) : null;
    if (!row) throw new YoutubeError('NOT_FOUND', 404, ['id']);
    await deps.db.youtubeChannel.update({ where: { id: row.id }, data: { archivedAt: action === 'channel.archive' ? (row.archivedAt ?? new Date()) : null } });
    await log('YoutubeChannel', row.id, { archived: action === 'channel.archive' });
    return { id: row.id };
  }
  if (action === 'video.add') {
    const channelId = typeof b.channelId === 'string' && UUID_RE.test(b.channelId) ? b.channelId : null;
    const channel = channelId ? await deps.db.youtubeChannel.findFirst({ where: { id: channelId, storeId: S, archivedAt: null } }) : null;
    const externalId = videoIdOf(b.link);
    const title = str(b.title, 200);
    const day = typeof b.publishedOn === 'string' && b.publishedOn.trim() ? b.publishedOn.trim() : '';
    const publishedAt = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? new Date(`${day}T00:00:00Z`) : null;
    const bad = [channel ? '' : 'channelId', externalId ? '' : 'link', title ? '' : 'title', day && !publishedAt ? 'publishedOn' : ''].filter(Boolean);
    if (bad.length) throw new YoutubeError('INVALID_INPUT', 400, bad);
    const productIds = await productsOf(deps, b.products);
    const was = await deps.db.youtubeVideo.findUnique({ where: { channelId_externalId: { channelId: channel!.id, externalId: externalId! } } });
    if (was) throw new YoutubeError('EXISTS', 409, ['link']);
    const taken = await deps.db.youtubeVideo.findFirst({ where: { storeId: S, externalId: externalId! }, select: { id: true } });
    if (taken) throw new YoutubeError('EXISTS', 409, ['link']);
    const row = await deps.db.youtubeVideo.create({ data: { storeId: S, channelId: channel!.id, externalId: externalId!, title, productIds, publishedAt } });
    await log('YoutubeVideo', row.id, { channelId: channel!.id, externalId, title, productIds, publishedAt });
    return { id: row.id };
  }
  if (action === 'video.update') {
    const row = id ? await deps.db.youtubeVideo.findFirst({ where: { id, storeId: S } }) : null;
    if (!row) throw new YoutubeError('NOT_FOUND', 404, ['id']);
    const title = str(b.title, 200);
    if (!title) throw new YoutubeError('INVALID_INPUT', 400, ['title']);
    const productIds = await productsOf(deps, b.products);
    await deps.db.youtubeVideo.update({ where: { id: row.id }, data: { title, productIds } });
    await log('YoutubeVideo', row.id, { title, productIds }, { title: row.title, productIds: row.productIds });
    return { id: row.id };
  }
  if (action === 'video.archive' || action === 'video.restore') {
    const row = id ? await deps.db.youtubeVideo.findFirst({ where: { id, storeId: S } }) : null;
    if (!row) throw new YoutubeError('NOT_FOUND', 404, ['id']);
    await deps.db.youtubeVideo.update({ where: { id: row.id }, data: { archivedAt: action === 'video.archive' ? (row.archivedAt ?? new Date()) : null } });
    await log('YoutubeVideo', row.id, { archived: action === 'video.archive' });
    return { id: row.id };
  }
  throw new YoutubeError('INVALID_INPUT', 400, ['action']);
}

const answer = (e: unknown): Response => (e instanceof YoutubeError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? json({ ok: false, error: 'EXISTS', details: ['link'] }, { status: 409 }) : errorResponse(e));

/** /api/admin/marketing/youtube — GET the page (`marketing.campaigns.read`); PUT the card and POST an action (`marketing.campaigns.write`). */
export async function youtubeHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d: YoutubeDeps = { db: deps!.db, resolver: deps!.resolver };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await youtubeOverview(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { youtube: await saveYoutubeCard(d, who, b) } });
    return json({ ok: true, ...(await youtubeAction(d, who, b as Record<string, unknown>)) });
  } catch (e) {
    return answer(e);
  }
}
