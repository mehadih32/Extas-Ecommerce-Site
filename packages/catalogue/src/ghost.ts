// PR 36 — the ghost archive: a product that has been on the shop keeps its page when it sells out, is taken off the
// shop or archived (Blueprint B7.4 "an unpublish that keeps the page alive as out-of-stock"; App. answers #8: "never
// 404 a page that has earned rankings"). The page then says so, shows similar products that can be bought, and takes
// "tell me when it is back" requests (BackInStockRequest).
//
// - productPageState(): what the storefront page (S02) shows for a link: `live`, or `ghost` with the reason. A product
//   that was never on the shop has no page (null). Public: no staff permission; it shows nothing that is not on the
//   page anyway.
// - registerInterest(): the public form. Channels, the country calling code and the per-contact daily limit are
//   settings; an open request for the same product, size and contact is not made twice. A size that is sold out on a
//   live product can be asked for too. The contact is the owner's data (PR 509 register): it never goes into the
//   audit log or an answer.
// - The admin: counts per product (catalogue.read), the list with contacts (catalogue.interest), and marking requests
//   as told / archived / restored. Nothing is deleted. Sending the message itself comes with messaging (PR 71 and the
//   message templates); until then the list is worked by hand.
import { z } from 'zod';
import { requirePermission, SYSTEM } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import type { InterestChannel } from '@extas/settings';
import { allow, found, logChange, parse, type CatalogueDeps, type Who } from './context';
import { CatalogueError } from './errors';
import { productPath } from './text';

export type GhostReason = 'soldOut' | 'unpublished' | 'archived';

export interface PageStateInput {
  status: string;
  inStock: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

/** live = on the shop and in stock; ghost = was on the shop, now sold out, taken off or archived; null = never was. */
export function ghostState(p: PageStateInput): { state: 'live' | 'ghost'; reason: GhostReason | null } | null {
  if (!p.publishedAt && p.status !== 'PUBLISHED') return null;
  if (p.archivedAt) return { state: 'ghost', reason: 'archived' };
  if (p.status !== 'PUBLISHED') return { state: 'ghost', reason: 'unpublished' };
  if (!p.inStock) return { state: 'ghost', reason: 'soldOut' };
  return { state: 'live', reason: null };
}

const settingOf = <K extends Parameters<CatalogueDeps['settings']['value']>[0]>(deps: CatalogueDeps, storeId: number, key: K) => deps.settings.value(key, { storeId });

export interface PageVariant {
  id: string;
  colour: { id: string; nameEn: string; nameBn: string | null } | null;
  size: { id: string; label: string } | null;
  inStock: boolean;
}

export interface ProductPageState {
  productId: string;
  slug: string;
  path: string;
  nameEn: string;
  nameBn: string | null;
  state: 'live' | 'ghost';
  reason: GhostReason | null;
  variants: PageVariant[];
  /** The "tell me when it is back" form: shown when switched on and something is sold out. */
  interest: { open: boolean; channels: InterestChannel[] };
  /** Products from the same category that can be bought now (a ghost page only). */
  alternatives: { id: string; slug: string; path: string; nameEn: string; nameBn: string | null }[];
}

/** What a product's page shows (public). Null when the store has no product at that link or it was never on the shop. */
export async function productPageState(deps: CatalogueDeps, storeId: number, slug: string): Promise<ProductPageState | null> {
  const p = await deps.db.product.findFirst({
    where: { storeId, slug },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameBn: true,
      status: true,
      inStock: true,
      publishedAt: true,
      archivedAt: true,
      categoryId: true,
      variants: {
        where: { archivedAt: null, active: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, inStock: true, colour: { select: { id: true, nameEn: true, nameBn: true } }, size: { select: { id: true, label: true } } },
      },
    },
  });
  if (!p) return null;
  const s = ghostState(p);
  if (!s) return null;
  const [on, channels, howMany, prefix] = await Promise.all([
    settingOf(deps, storeId, 'catalogue.ghost.interest.enabled'),
    settingOf(deps, storeId, 'catalogue.ghost.interest.channels'),
    settingOf(deps, storeId, 'catalogue.ghost.alternatives'),
    settingOf(deps, storeId, 'naming.productPathPrefix'),
  ]);
  const somethingSoldOut = s.state === 'ghost' || p.variants.some((v) => !v.inStock);
  const alternatives =
    s.state === 'ghost' && howMany > 0 && p.categoryId
      ? await deps.db.product.findMany({
          where: { storeId, categoryId: p.categoryId, status: 'PUBLISHED', inStock: true, archivedAt: null, id: { not: p.id } },
          orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
          take: howMany,
          select: { id: true, slug: true, nameEn: true, nameBn: true },
        })
      : [];
  return {
    productId: p.id,
    slug: p.slug,
    path: productPath(prefix, p.slug),
    nameEn: p.nameEn,
    nameBn: p.nameBn,
    state: s.state,
    reason: s.reason,
    variants: p.variants.map((v) => ({ id: v.id, colour: v.colour, size: v.size, inStock: v.inStock })),
    interest: { open: on && somethingSoldOut, channels: on ? channels : [] },
    alternatives: alternatives.map((a) => ({ ...a, path: productPath(prefix, a.slug) })),
  };
}

// --- the public form -----------------------------------------------------------------------------------------

/** A phone number as typed ("01711-000000", "+880 1711 000000", "008801711000000") in +country form, or null. */
export function normalizePhone(raw: string, callingCode: string): string | null {
  let s = raw.trim().replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (!s.startsWith('+')) s = s.startsWith(callingCode) ? `+${s}` : `+${callingCode}${s.replace(/^0+/, '')}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export const interestInput = z
  .object({
    productId: z.uuid(),
    variantId: z.uuid().nullable().optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    customerId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine((d) => !!d.phone !== !!d.email, { message: 'a phone number or an e-mail, one of them', path: ['contact'] });
export type InterestInput = z.input<typeof interestInput>;

export interface InterestResult {
  id: string;
  /** False when the same open request was there already (nothing new was made). */
  created: boolean;
}

/** "Tell me when it is back" (public). The answer never repeats the contact. */
/** Whether any of these sizes can be bought now: flagged in stock and, when the app tells it, with sellable pieces. */
async function canBuyNow(deps: CatalogueDeps, variants: readonly { id: string; inStock: boolean }[]): Promise<boolean> {
  const open = variants.filter((v) => v.inStock);
  if (!open.length || !deps.sellable) return open.length > 0;
  const units = await deps.sellable(open.map((v) => v.id));
  return open.some((v) => (units.get(v.id) ?? 0) > 0);
}

export async function registerInterest(deps: CatalogueDeps, storeId: number, input: InterestInput): Promise<InterestResult> {
  const d = parse(interestInput, input, 'request');
  const [on, channels, callingCode, perDay] = await Promise.all([
    settingOf(deps, storeId, 'catalogue.ghost.interest.enabled'),
    settingOf(deps, storeId, 'catalogue.ghost.interest.channels'),
    settingOf(deps, storeId, 'catalogue.ghost.interest.callingCode'),
    settingOf(deps, storeId, 'catalogue.ghost.interest.maxPerContactPerDay'),
  ]);
  const channel: InterestChannel = d.phone ? 'phone' : 'email';
  if (!on || !channels.includes(channel)) throw new CatalogueError('INTEREST_OFF', 'this request is not taken', [`channel:${channel}`]);
  const phone = d.phone ? normalizePhone(d.phone, callingCode) : null;
  if (d.phone && !phone) throw new CatalogueError('INVALID_INPUT', 'not a phone number', ['phone']);
  const email = d.email ? d.email.toLowerCase() : null;
  if (email && !z.email().safeParse(email).success) throw new CatalogueError('INVALID_INPUT', 'not an e-mail address', ['email']);

  const p = await deps.db.product.findFirst({
    where: { storeId, id: d.productId },
    select: { id: true, status: true, inStock: true, publishedAt: true, archivedAt: true, variants: { where: { archivedAt: null, active: true }, select: { id: true, inStock: true } } },
  });
  const s = p ? ghostState(p) : null;
  if (!p || !s) throw new CatalogueError('NOT_FOUND', 'no such product');
  const variant = d.variantId ? p.variants.find((v) => v.id === d.variantId) : null;
  if (d.variantId && !variant) throw new CatalogueError('NOT_FOUND', 'no such size', ['variantId']);
  // PR 71 (follow-up 63): a live product takes a request for a size the page shows as sold out — the sellable stock when
  // the app passes it (the flag can still say "in stock" while the bags hold the last pieces), else the flag.
  // ~~if (s.state === 'live' && (!variant || variant.inStock)) throw NOT_OUT_OF_STOCK~~
  if (s.state === 'live' && (await canBuyNow(deps, variant ? [variant] : p.variants))) throw new CatalogueError('NOT_OUT_OF_STOCK', 'this can be bought now');

  const now = deps.now?.() ?? new Date();
  const contact: Prisma.BackInStockRequestWhereInput = phone ? { phone } : { email };
  return deps.db.$transaction(async (tx) => {
    const same = await tx.backInStockRequest.findFirst({ where: { storeId, productId: p.id, variantId: variant?.id ?? null, notifiedAt: null, archivedAt: null, ...contact }, select: { id: true } });
    if (same) return { id: same.id, created: false };
    const today = await tx.backInStockRequest.count({ where: { storeId, createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) }, ...contact } });
    if (today >= perDay) throw new CatalogueError('TOO_MANY_REQUESTS', 'too many requests today', [`max:${perDay}`]);
    const row = await tx.backInStockRequest.create({ data: { storeId, productId: p.id, variantId: variant?.id ?? null, customerId: d.customerId ?? null, phone, email } });
    // The log says what was asked for and how, never who (the contact is the owner's data).
    await logChange(tx, { actor: SYSTEM, storeId, ctx: { source: 'storefront' } }, 'backInStock.request', 'BackInStockRequest', row.id, null, { productId: p.id, variantId: row.variantId, channel, reason: s.reason ?? 'sizeSoldOut' });
    return { id: row.id, created: true };
  });
}

// --- the admin -----------------------------------------------------------------------------------------------

export interface InterestSummaryItem {
  productId: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  state: 'live' | 'ghost' | null;
  reason: GhostReason | null;
  /** Can be bought again now: the people waiting can be told. */
  backInStock: boolean;
  waiting: number;
  since: string;
}

export interface InterestSummary {
  items: InterestSummaryItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: { waiting: number; told: number; archived: number; products: number };
}

/** Waiting requests per product, products that are back first. Needs `catalogue.read` (counts only, no contacts). */
export async function backInStockSummary(deps: CatalogueDeps, who: Who, query: { page?: number } = {}): Promise<InterestSummary> {
  await allow(deps, who, 'catalogue.read');
  const page = parse(z.object({ page: z.int().min(1).optional() }).strict(), query, 'page').page ?? 1;
  const pageSize = await settingOf(deps, who.storeId, 'catalogue.admin.pageSize');
  const open = { storeId: who.storeId, notifiedAt: null, archivedAt: null };
  const groups = await deps.db.backInStockRequest.groupBy({ by: ['productId'], where: open, _count: { _all: true }, _min: { createdAt: true } });
  const [told, archived] = await Promise.all([
    deps.db.backInStockRequest.count({ where: { storeId: who.storeId, notifiedAt: { not: null }, archivedAt: null } }),
    deps.db.backInStockRequest.count({ where: { storeId: who.storeId, archivedAt: { not: null } } }),
  ]);
  const products = new Map(
    (
      await deps.db.product.findMany({
        where: { storeId: who.storeId, id: { in: groups.map((g) => g.productId) } },
        select: { id: true, nameEn: true, nameBn: true, status: true, inStock: true, publishedAt: true, archivedAt: true },
      })
    ).map((p) => [p.id, p]),
  );
  const all: InterestSummaryItem[] = [];
  for (const g of groups) {
    const p = products.get(g.productId);
    if (!p) continue;
    const s = ghostState(p);
    all.push({
      productId: p.id,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      status: p.status,
      state: s?.state ?? null,
      reason: s?.reason ?? null,
      backInStock: s?.state === 'live',
      waiting: g._count._all,
      since: (g._min.createdAt ?? new Date(0)).toISOString(),
    });
  }
  all.sort((a, b) => Number(b.backInStock) - Number(a.backInStock) || b.waiting - a.waiting || a.since.localeCompare(b.since));
  return {
    items: all.slice((page - 1) * pageSize, page * pageSize),
    total: all.length,
    page,
    pageSize,
    counts: { waiting: groups.reduce((n, g) => n + g._count._all, 0), told, archived, products: all.length },
  };
}

export const INTEREST_STATES = ['waiting', 'told', 'archived'] as const;
export type InterestState = (typeof INTEREST_STATES)[number];
export const interestQuery = z.object({ productId: z.uuid().optional(), state: z.enum(INTEREST_STATES).optional(), page: z.int().min(1).optional() }).strict();
export type InterestQuery = z.input<typeof interestQuery>;

export interface InterestRequestView {
  id: string;
  productId: string;
  productName: string;
  variant: { id: string; sku: string; colour: string | null; size: string | null } | null;
  phone: string | null;
  email: string | null;
  customerId: string | null;
  createdAt: string;
  notifiedAt: string | null;
  archivedAt: string | null;
}

async function allowContacts(deps: CatalogueDeps, who: Who): Promise<void> {
  await allow(deps, who, 'catalogue.read');
  await requirePermission(deps.db, who.actor, 'catalogue.interest', { storeId: who.storeId });
}

const stateWhere = (s: InterestState): Prisma.BackInStockRequestWhereInput =>
  s === 'waiting' ? { notifiedAt: null, archivedAt: null } : s === 'told' ? { notifiedAt: { not: null }, archivedAt: null } : { archivedAt: { not: null } };

/** The requests with their contacts, oldest first. Needs `catalogue.interest` (the contacts are the owner's data). */
export async function backInStockRequests(deps: CatalogueDeps, who: Who, query: InterestQuery = {}): Promise<{ items: InterestRequestView[]; total: number; page: number; pageSize: number }> {
  await allowContacts(deps, who);
  const q = parse(interestQuery, query, 'request list');
  const page = q.page ?? 1;
  const pageSize = await settingOf(deps, who.storeId, 'catalogue.admin.pageSize');
  const where: Prisma.BackInStockRequestWhereInput = { storeId: who.storeId, ...(q.productId ? { productId: q.productId } : {}), ...stateWhere(q.state ?? 'waiting') };
  const [rows, total] = await Promise.all([
    deps.db.backInStockRequest.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    deps.db.backInStockRequest.count({ where }),
  ]);
  const [products, variants] = await Promise.all([
    deps.db.product.findMany({ where: { storeId: who.storeId, id: { in: [...new Set(rows.map((r) => r.productId))] } }, select: { id: true, nameEn: true } }),
    deps.db.productVariant.findMany({
      where: { storeId: who.storeId, id: { in: rows.map((r) => r.variantId).filter((v): v is string => !!v) } },
      select: { id: true, sku: true, colour: { select: { nameEn: true } }, size: { select: { label: true } } },
    }),
  ]);
  const pName = new Map(products.map((p) => [p.id, p.nameEn]));
  const vOf = new Map(variants.map((v) => [v.id, { id: v.id, sku: v.sku, colour: v.colour?.nameEn ?? null, size: v.size?.label ?? null }]));
  return {
    items: rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: pName.get(r.productId) ?? '',
      variant: r.variantId ? (vOf.get(r.variantId) ?? null) : null,
      phone: r.phone,
      email: r.email,
      customerId: r.customerId,
      createdAt: r.createdAt.toISOString(),
      notifiedAt: r.notifiedAt?.toISOString() ?? null,
      archivedAt: r.archivedAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

export const INTEREST_ACTIONS = ['told', 'archive', 'restore'] as const;
export type InterestAction = (typeof INTEREST_ACTIONS)[number];
export const interestUpdate = z
  .object({ action: z.enum(INTEREST_ACTIONS), ids: z.array(z.uuid()).min(1).max(1000).refine((l) => new Set(l).size === l.length, { message: 'each request once' }) })
  .strict();
export type InterestUpdate = z.input<typeof interestUpdate>;

/**
 * Marks requests: `told` (the person has been told it is back), `archive` (taken off the list), `restore` (back on
 * it). Needs `catalogue.interest`. Nothing is deleted; the log has the ids and the action, never a contact.
 */
export async function updateInterest(deps: CatalogueDeps, who: Who, input: InterestUpdate): Promise<{ action: InterestAction; changed: number }> {
  await allowContacts(deps, who);
  const d = parse(interestUpdate, input, 'request change');
  const max = await settingOf(deps, who.storeId, 'catalogue.bulk.maxProducts');
  if (d.ids.length > max) throw new CatalogueError('TOO_MANY_CHANGES', `at most ${max} in one go`, [`max:${max}`]);
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const rows = await tx.backInStockRequest.findMany({ where: { storeId: who.storeId, id: { in: d.ids } }, select: { id: true, notifiedAt: true, archivedAt: true } });
    if (rows.length !== d.ids.length) found(null, 'request');
    const which = rows.filter((r) => (d.action === 'told' ? !r.notifiedAt && !r.archivedAt : d.action === 'archive' ? !r.archivedAt : !!r.archivedAt)).map((r) => r.id);
    if (which.length) {
      const data = d.action === 'told' ? { notifiedAt: now } : { archivedAt: d.action === 'archive' ? now : null };
      await tx.backInStockRequest.updateMany({ where: { storeId: who.storeId, id: { in: which } }, data });
      await logChange(tx, who, `backInStock.${d.action}`, 'BackInStockRequest', which[0]!, null, { ids: which, count: which.length });
    }
    return { action: d.action, changed: which.length };
  });
}
