// S12 · PR 547 (register "Image sourcing for the blog — the owner's own product photographs first, then free-licence
// libraries … AI generation asks permission every time … Nothing is ever taken from Google image search"; Blueprint
// C11.6; BACKEND-ARCHITECTURE WEB-03 "More options: … image sourcing order") — an article's main photo:
// Website › Blog & journal › the article › Main photo.
//
// - The picker offers the shop's own pictures only, in a fixed order: (1) the photographs of the article's own products
//   (their product photos, primary first), (2) the photo library (the store's images, newest first), each at most
//   `blog.images.perSource`. Studio pictures (AI-made, MediaAsset.isAiGenerated) are offered only while
//   `blog.images.studio` is on and always carry the studio label. There is no picture from a web address, so nothing can
//   come from an image search; free-licence libraries arrive with their own keys, AI pictures stay with the AI Center.
// - Picking sets BlogPost.heroAssetId (or takes it off), audited (blog.post.photo) with what it was before; the shop
//   shows it on the article page while `blog.images.show` is on (with "Studio image" under a studio picture).
// - Seeing needs `blog.read`; picking `blog.write`; the card `blog.publish`.
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { imageSources, publicMediaWhere, type ImageSource } from '@extas/media';
import { blogImagesSchema, storeTarget, type BlogImagesSettings } from '@extas/settings';
import { body, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { JournalError, answer, versionOf, type JournalWho } from './journal';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
const KEY = 'blog.images';

/** Where a picture comes from, in the order the picker offers them. */
export const PHOTO_SOURCES = ['products', 'library'] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];

export interface PhotoPick {
  id: string;
  source: PhotoSource;
  alt: string | null;
  /** A studio (AI-made) picture: always labelled, never evidence for a claim. */
  studio: boolean;
  /** The product it shows (products source). */
  productName: string | null;
  image: ImageSource | null;
}

export interface PhotoScreen {
  post: { id: string; title: string; locale: string; heroAssetId: string | null; products: number };
  current: PhotoPick | null;
  sources: Record<PhotoSource, PhotoPick[]>;
  card: { key: typeof KEY; value: BlogImagesSettings; version: string };
}

const ASSET = { id: true, altEn: true, altBn: true, isAiGenerated: true } as const;
/** A picture with at least one rendition (one still being processed has none yet). */
const rendered = (i: ImageSource | undefined): ImageSource | null => (i && i.variants.length ? i : null);

/** The article's main photo and the pictures the picker offers, source by source (null: not this store's article). */
export async function photoScreen(db: Db, resolver: Resolver, id: string, storeId: number = S): Promise<PhotoScreen | null> {
  if (!isUuid(id)) return null;
  const [post, set] = await Promise.all([
    db.blogPost.findFirst({ where: { id, storeId }, select: { id: true, title: true, locale: true, heroAssetId: true, productIds: true } }),
    resolver.value(KEY, { storeId }),
  ]);
  if (!post) return null;
  const studioOk = set.studio ? {} : { isAiGenerated: false };
  const [own, library, hero] = await Promise.all([
    post.productIds.length
      ? db.productMedia.findMany({
          where: { storeId, productId: { in: post.productIds }, archivedAt: null, asset: { archivedAt: null, kind: 'IMAGE', ...studioOk } },
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: set.perSource * 2,
          select: { productId: true, product: { select: { nameEn: true, nameBn: true } }, asset: { select: ASSET } },
        })
      : Promise.resolve([]),
    db.mediaAsset.findMany({ where: { storeId, archivedAt: null, kind: 'IMAGE', ...studioOk, ...publicMediaWhere() }, orderBy: { createdAt: 'desc' }, take: set.perSource * 2, select: ASSET }),
    post.heroAssetId ? db.mediaAsset.findFirst({ where: { id: post.heroAssetId, storeId }, select: ASSET }) : Promise.resolve(null),
  ]);
  const bn = post.locale === 'bn';
  const alt = (a: { altEn: string | null; altBn: string | null }) => (bn ? a.altBn || a.altEn : a.altEn || a.altBn) ?? null;
  // the article's products in the article's own order, each product's photos primary first; a picture once only
  const rank = new Map(post.productIds.map((p, i) => [p, i]));
  const seen = new Set<string>();
  const products = [...own]
    .sort((a, b) => (rank.get(a.productId) ?? 0) - (rank.get(b.productId) ?? 0))
    .filter((m) => !seen.has(m.asset.id) && seen.add(m.asset.id))
    .slice(0, set.perSource);
  const lib = library.filter((a) => !seen.has(a.id)).slice(0, set.perSource);
  const pics = await imageSources({ db, settings: resolver }, storeId, [...products.map((m) => m.asset.id), ...lib.map((a) => a.id), ...(hero ? [hero.id] : [])]);
  const pick = (a: { id: string; altEn: string | null; altBn: string | null; isAiGenerated: boolean }, source: PhotoSource, productName: string | null = null): PhotoPick => ({ id: a.id, source, alt: alt(a), studio: a.isAiGenerated, productName, image: rendered(pics.get(a.id)) });
  return {
    post: { id: post.id, title: post.title, locale: post.locale, heroAssetId: post.heroAssetId, products: post.productIds.length },
    current: hero ? pick(hero, products.some((m) => m.asset.id === hero.id) ? 'products' : 'library') : null,
    sources: {
      products: products.map((m) => pick(m.asset, 'products', (bn ? m.product.nameBn || m.product.nameEn : m.product.nameEn) ?? null)),
      library: lib.map((a) => pick(a, 'library')),
    },
    card: { key: KEY, value: set, version: versionOf(set) },
  };
}

/** Pick the main photo (an image of this store, not put away; a studio picture only while allowed) or take it off. */
export async function setPhoto(db: Db, resolver: Resolver, who: JournalWho, id: string, assetId: string | null, storeId: number = S): Promise<void> {
  const post = isUuid(id) ? await db.blogPost.findFirst({ where: { id, storeId }, select: { id: true, heroAssetId: true, archivedAt: true } }) : null;
  if (!post) throw new JournalError('NOT_FOUND', 404);
  if (post.archivedAt) throw new JournalError('ARCHIVED', 409);
  if (assetId !== null) {
    const set = await resolver.value(KEY, { storeId });
    const a = isUuid(assetId) ? await db.mediaAsset.findFirst({ where: { id: assetId, storeId, archivedAt: null, kind: 'IMAGE' }, select: { isAiGenerated: true } }) : null;
    if (!a) throw new JournalError('INVALID_INPUT', 400, ['assetId']);
    if (a.isAiGenerated && !set.studio) throw new JournalError('STUDIO_OFF', 409, ['assetId']);
  }
  if (post.heroAssetId === assetId) return;
  await db.blogPost.update({ where: { id }, data: { heroAssetId: assetId } });
  await audit(db, who.actor, { storeId, action: 'blog.post.photo', entityType: 'BlogPost', entityId: id, before: { heroAssetId: post.heroAssetId }, after: { heroAssetId: assetId } }, who.ctx);
}

/** The card: the switch card's {key, on, values} (`show` is its switch) or nothing else. */
export async function savePhotoSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const o = (input ?? {}) as { key?: unknown; on?: unknown; values?: unknown };
  if (o.key !== KEY || typeof o.on !== 'boolean') throw new JournalError('INVALID_INPUT', 400, ['key']);
  const before = await resolver.value(KEY, { storeId });
  const v = o.values && typeof o.values === 'object' ? (o.values as Record<string, unknown>) : {};
  const next = { ...before, show: o.on, ...('perSource' in v ? { perSource: v.perSource } : {}), ...('studio' in v ? { studio: v.studio === true || v.studio === 'yes' } : {}) };
  const ok = blogImagesSchema.safeParse(next);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Main photo' });
  await audit(db, who.actor, { storeId, action: 'blog.images.settings', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/** The shop's read: the article's main photo while `blog.images.show` is on (rendered pictures only), else null. */
export async function articlePhoto(db: Db, resolver: Resolver, storeId: number, heroAssetId: string | null, lang: 'en' | 'bn'): Promise<{ image: ImageSource; alt: string; studio: boolean } | null> {
  if (!heroAssetId) return null;
  const set = await resolver.value(KEY, { storeId });
  if (!set.show) return null;
  const a = await db.mediaAsset.findFirst({ where: { id: heroAssetId, storeId, archivedAt: null, kind: 'IMAGE' }, select: ASSET });
  if (!a || (a.isAiGenerated && !set.studio)) return null;
  const image = rendered((await imageSources({ db, settings: resolver }, storeId, [a.id])).get(a.id));
  if (!image) return null;
  return { image, alt: (lang === 'bn' ? a.altBn || a.altEn : a.altEn || a.altBn) ?? '', studio: a.isAiGenerated };
}

/**
 * /api/admin/blog/photo — GET ?id=<article> the picker (`blog.read`); PUT {id, assetId|null} picks or takes off the
 * main photo (`blog.write`); PUT {key: 'blog.images', on, values} the card (`blog.publish`).
 */
export async function photoHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const input = method === 'PUT' ? ((await body(request)) as Record<string, unknown>) : null;
  const card = input?.key === KEY;
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : card ? 'blog.publish' : 'blog.write', storeId: S });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (card) {
      await savePhotoSettings(deps!.db, deps!.resolver, who, input);
      return json({ ok: true });
    }
    const id = method === 'GET' ? (new URL(request.url).searchParams.get('id') ?? '') : String(input?.id ?? '');
    if (input) {
      const a = input.assetId;
      if (a !== null && typeof a !== 'string') throw new JournalError('INVALID_INPUT', 400, ['assetId']);
      await setPhoto(deps!.db, deps!.resolver, who, id, a);
    }
    const screen = await photoScreen(deps!.db, deps!.resolver, id);
    return screen ? json({ ok: true, screen }) : fail(404, 'NOT_FOUND');
  } catch (e) {
    return answer(e);
  }
}
