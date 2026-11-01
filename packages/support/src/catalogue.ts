// PR 429 — selling from the chat: the catalogue drawer (Blueprint B4.6 bullets 1–2, B4.14 item 5). The employee
// searches the shop's live products by name, SKU or colour (every word must match), picks the colour and size, and one
// press sends a card into the conversation: up to `photos` of the product's own photos (our stored copies, under the
// chat's file rules), the name, the price the shop shows and the product's link carrying an `r=` reference. The share is
// kept with the message in the same transaction (SupportProductShare), so the reference names this chat and this
// employee: the customer's first click is noted (openShare, from the shop's product page) and an order placed from that
// browser within `creditDays` is credited to the chat (the checkout, @extas/checkout place.ts).
//
// Off as it ships (`support.catalogue`). Read and send with `support.reply`. Nothing here changes a price, a discount,
// COD or an order: the link opens the shop's own page at the shop's own price.
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { sendReply, type ReplyResult } from './actions';
import { allow, nowOf, parse, setting, SupportError, type SupportDeps, type Who } from './context';
import { REF_CODE, shareBody, shareLink } from './pure';

const live = { status: 'PUBLISHED', archivedAt: null } as const;
/** At most this many words of a search are matched (each must match). */
const MAX_WORDS = 5; // hardcode-ok: a guard on the query's shape, not a business number
/** Photos looked at before the best ones are picked. */
const PHOTO_POOL = 12; // hardcode-ok: a read limit, not a business number

const variantSelect = {
  id: true,
  sku: true,
  priceMinor: true,
  inStock: true,
  sortOrder: true,
  colour: { select: { id: true, key: true, nameEn: true, nameBn: true, hex: true } },
  size: { select: { key: true, label: true, sortOrder: true } },
} satisfies Prisma.ProductVariantSelect;

const productSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameBn: true,
  variants: { where: { archivedAt: null, active: true }, select: variantSelect, orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }] },
} satisfies Prisma.ProductSelect;
type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

export interface ChatProductColour {
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
}

export interface ChatProductVariant {
  id: string;
  sku: string;
  /** The colour's key, or null for a product without colours. */
  colour: string | null;
  size: { key: string; label: string } | null;
  priceMinor: number | null;
  inStock: boolean;
}

/** One product as the drawer shows it. */
export interface ChatProduct {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  /** The lowest price of its variants on sale (what the shop's card shows), or null when none is priced. */
  priceMinor: number | null;
  colours: ChatProductColour[];
  variants: ChatProductVariant[];
}

/** The product's lowest variant price, as the shop's card shows it. */
const lowestPrice = (p: ProductRow): number | null => p.variants.reduce<number | null>((m, v) => (v.priceMinor == null ? m : m == null ? v.priceMinor : Math.min(m, v.priceMinor)), null);

function chatProduct(p: ProductRow): ChatProduct {
  const colours = new Map<string, ChatProductColour>();
  for (const v of p.variants) if (v.colour && !colours.has(v.colour.key)) colours.set(v.colour.key, { key: v.colour.key, nameEn: v.colour.nameEn, nameBn: v.colour.nameBn, hex: v.colour.hex });
  const variants = [...p.variants].sort((a, b) => (a.size?.sortOrder ?? 0) - (b.size?.sortOrder ?? 0) || a.sortOrder - b.sortOrder);
  return {
    id: p.id,
    slug: p.slug,
    nameEn: p.nameEn,
    nameBn: p.nameBn,
    priceMinor: lowestPrice(p),
    colours: [...colours.values()],
    variants: variants.map((v) => ({ id: v.id, sku: v.sku, colour: v.colour?.key ?? null, size: v.size ? { key: v.size.key, label: v.size.label } : null, priceMinor: v.priceMinor, inStock: v.inStock })),
  };
}

/** The words of a search, each to be found in the name, the address, a SKU or a colour (its name, key or synonyms). */
export function catalogueWhere(storeId: number, q: string): Prisma.ProductWhereInput {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  const one = (w: string): Prisma.ProductWhereInput => ({
    OR: [
      { nameEn: { contains: w, mode: 'insensitive' } },
      { nameBn: { contains: w, mode: 'insensitive' } },
      { slug: { contains: w, mode: 'insensitive' } },
      {
        variants: {
          some: {
            archivedAt: null,
            active: true,
            OR: [
              { sku: { contains: w, mode: 'insensitive' } },
              { colour: { OR: [{ nameEn: { contains: w, mode: 'insensitive' } }, { nameBn: { contains: w, mode: 'insensitive' } }, { key: { contains: w, mode: 'insensitive' } }, { synonyms: { has: w.toLowerCase() } }] } },
            ],
          },
        },
      },
    ],
  });
  return { storeId, ...live, ...(words.length ? { AND: words.map(one) } : {}) };
}

async function catalogueOn(deps: Pick<SupportDeps, 'settings'>, storeId: number) {
  const cat = await setting(deps, storeId, 'support.catalogue');
  if (!cat.enabled) throw new SupportError('CATALOGUE_OFF', 'products in the chat are switched off in Support settings');
  return cat;
}

export const catalogueSearchInput = z.object({ q: z.string().max(80).default('') }).strict();

/** The drawer's search (`support.reply`): live products, newest first, at most `results` of them. */
export async function chatCatalogue(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who, input: unknown): Promise<{ products: ChatProduct[] }> {
  await allow(deps, who, 'support.reply');
  const cat = await catalogueOn(deps, who.storeId);
  const d = parse(catalogueSearchInput, input, 'search');
  const rows = await deps.db.product.findMany({ where: catalogueWhere(who.storeId, d.q), select: productSelect, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: cat.results });
  return { products: rows.map(chatProduct) };
}

// ------------------------------------------------------------------------------------------------------------ share

export const shareInput = z
  .object({
    conversationId: z.uuid(),
    productId: z.uuid(),
    /** The colour and size picked (one variant); without it, the product (and `colour`, when picked) is sent. */
    variantId: z.uuid().optional(),
    colour: z.string().min(1).max(60).optional(),
    /** The language of the card's name. */
    lang: z.enum(['en', 'bn']).default('en'),
    requestKey: z.string().min(8).max(80),
    version: z.string().max(40).optional(),
  })
  .strict();

export interface ShareResult extends ReplyResult {
  refCode: string;
  link: string;
  /** How many photos went with the card. */
  photos: number;
}

/** A fresh reference: 10 random lower-case letters and digits. */
export function newRefCode(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join('');
}

/** The money the shop shows, in the store's currency and language. */
function moneyText(minor: number | null, currency: string, storeLocale: string, lang: 'en' | 'bn'): string {
  if (minor == null) return '';
  let region: string | undefined;
  try {
    region = new Intl.Locale(storeLocale).region;
  } catch {
    region = undefined;
  }
  const locale = region ? `${lang}-${region}` : lang;
  const digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  const value = minor / 10 ** digits;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: Number.isInteger(value) ? 0 : digits, maximumFractionDigits: digits }).format(value);
}

/**
 * Sends one product into the conversation (`support.reply`): photos, name, price, the tracked link — kept with its
 * share in one change. `link.origin` is the shop's own address (a setting of the store, read by the app). A second
 * press of the same Send answers the first card.
 */
export async function shareProduct(deps: SupportDeps, who: Who, input: unknown, link: { origin: string | null }): Promise<ShareResult> {
  await allow(deps, who, 'support.reply');
  const cat = await catalogueOn(deps, who.storeId);
  const d = parse(shareInput, input, 'share');
  const storeId = who.storeId;

  const prior = await deps.db.message.findUnique({ where: { conversationId_requestKey: { conversationId: d.conversationId, requestKey: d.requestKey } } });
  if (prior) {
    const share = prior.storeId === storeId ? await deps.db.supportProductShare.findUnique({ where: { messageId: prior.id } }) : null;
    if (!share || share.productId !== d.productId || (share.variantId ?? undefined) !== d.variantId) throw new SupportError('IDEMPOTENCY_MISMATCH', 'this key was used for another message', ['requestKey']);
    const body = prior.body ?? '';
    return { messageId: prior.id, delivery: prior.status as ReplyResult['delivery'], failReason: prior.failReason, replay: true, refCode: share.refCode, link: body.split('\n').pop() ?? '', photos: await deps.db.messageAttachment.count({ where: { messageId: prior.id } }) };
  }

  const p = await deps.db.product.findFirst({ where: { id: d.productId, storeId, ...live }, select: productSelect });
  if (!p) throw new SupportError('NOT_FOUND', 'no such product on sale', ['productId']);
  const variant = d.variantId ? p.variants.find((v) => v.id === d.variantId) : undefined;
  if (d.variantId && !variant) throw new SupportError('NOT_FOUND', 'no such colour and size of this product', ['variantId']);
  if (variant && !variant.inStock) throw new SupportError('OUT_OF_STOCK', 'this colour and size is sold out', ['variantId']);
  const colour = variant?.colour ?? (d.colour ? (p.variants.find((v) => v.colour?.key === d.colour)?.colour ?? null) : null);
  if (d.colour && !colour) throw new SupportError('NOT_FOUND', 'no such colour of this product', ['colour']);

  const [files, prefix, currency, storeLocale] = await Promise.all([
    setting(deps, storeId, 'support.attachments'),
    setting(deps, storeId, 'naming.productPathPrefix'),
    setting(deps, storeId, 'store.currency'),
    setting(deps, storeId, 'store.locale'),
  ]);

  // the product's own photos — the picked colour's first, then the product's — under the chat's file rules
  const room = Math.min(cat.photos, files.maxPerMessage);
  let assetIds: string[] = [];
  if (room > 0 && files.enabled && files.kinds.image) {
    const media = await deps.db.productMedia.findMany({
      where: {
        storeId,
        productId: p.id,
        archivedAt: null,
        asset: { storeId, kind: 'IMAGE', archivedAt: null, bytes: { lte: BigInt(files.maxMb * 1024 * 1024) } },
        ...(colour ? { OR: [{ colourId: colour.id }, { colourId: null }] } : {}),
      },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { assetId: true, colourId: true },
      take: PHOTO_POOL,
    });
    const ranked = colour ? [...media.filter((m) => m.colourId === colour.id), ...media.filter((m) => m.colourId !== colour.id)] : [...media.filter((m) => m.colourId === null), ...media.filter((m) => m.colourId !== null)];
    assetIds = [...new Set(ranked.map((m) => m.assetId))].slice(0, room);
  }

  const refCode = newRefCode();
  const url = shareLink({ origin: link.origin, prefix, slug: p.slug, colour: colour?.key ?? null, size: variant?.size?.key ?? null, ref: refCode });
  const name = (d.lang === 'bn' && p.nameBn) || p.nameEn;
  const colourName = colour ? (d.lang === 'bn' && colour.nameBn) || colour.nameEn : null;
  const price = moneyText(variant?.priceMinor ?? lowestPrice(p), currency, storeLocale, d.lang);
  const body = shareBody({ name, colour: colourName, size: variant?.size?.label ?? null, price, link: url });

  const sent = await sendReply(deps, who, { conversationId: d.conversationId, body, note: false, assetIds, requestKey: d.requestKey, version: d.version }, async (tx, saved) => {
    await tx.supportProductShare.create({ data: { storeId, conversationId: saved.conversationId, productId: p.id, variantId: variant?.id ?? null, refCode, sentById: who.actor.staffUserId, messageId: saved.messageId } });
    await tx.conversationEvent.create({
      data: {
        storeId,
        conversationId: saved.conversationId,
        kind: 'PRODUCT_SENT',
        actorType: 'STAFF',
        actorStaffId: who.actor.staffUserId,
        actorName: saved.actorName,
        messageId: saved.messageId,
        data: { productId: p.id, variantId: variant?.id ?? null, sku: variant?.sku ?? null, ref: refCode, photos: assetIds.length },
        createdAt: saved.now,
      },
    });
  });
  return { ...sent, refCode, link: url, photos: assetIds.length };
}

// ------------------------------------------------------------------------------------------------------------ click

/**
 * The customer opened a product link sent from a chat (the shop's product page calls this): the share's first click is
 * noted, with a line in the chat's log. Answers how many days the browser keeps the reference, or null when the
 * reference is not one of this store's (or products in the chat are off) — then nothing is kept.
 */
export async function openShare(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, storeId: number, refCode: string): Promise<{ days: number } | null> {
  if (!REF_CODE.test(refCode)) return null;
  const cat = await setting(deps, storeId, 'support.catalogue');
  if (!cat.enabled) return null;
  const share = await deps.db.supportProductShare.findUnique({ where: { storeId_refCode: { storeId, refCode } }, select: { id: true, conversationId: true, productId: true, clickedAt: true } });
  if (!share) return null;
  if (!share.clickedAt) {
    const now = nowOf(deps);
    const first = await deps.db.supportProductShare.updateMany({ where: { id: share.id, clickedAt: null }, data: { clickedAt: now } });
    if (first.count === 1) await deps.db.conversationEvent.create({ data: { storeId, conversationId: share.conversationId, kind: 'PRODUCT_OPENED', actorType: 'CUSTOMER', data: { ref: refCode, productId: share.productId }, createdAt: now } });
  }
  return { days: cat.creditDays };
}
