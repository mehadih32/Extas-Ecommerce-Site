// PR 606 (CN-017 SIM-F-023, simulation idea 21, proposal P11; Blueprint B8.5 item 4) — the bulk / corporate lane: the
// customer's enquiry from the bag, the menu or its own page, and the team's list of them.
//
// `sendBulkEnquiry` is public (no sign-in, like the checkout): while the owner has the lane on, it checks the form with
// the same pure rules as the page (bulk.ts checkBulk), takes the bag's lines when he came from the bag (what, which
// colour and size, how many — never a price), keeps at most `perDay` enquiries a day from one number or one browser,
// and numbers the enquiry under the store's lock (BQ-1001 …). `listBulkEnquiries` (orders.read) and
// `setBulkEnquiryStatus` (orders.notes, audited) are the team's: the stage it is at. The quote, its advance and the
// order it becomes are the Orders screen's (ORD-09) with the owner's own numbers; nothing here prices or moves money.
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { findBag } from '@extas/cart';
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { BULK_SOURCES, BULK_STATUSES, BULK_TEXT_MAX, checkBulk, type BulkField, type BulkProblem, type BulkStatus } from './bulk';
import { CheckoutError, checkStoreId, nowOf, parse, setting, TX, type CheckoutDeps } from './context';
import { storeToday } from './gift';

const TEXT_MAX = BULK_TEXT_MAX;
const DAY_MS = 86_400_000;
/** The store's lock for numbering its enquiries (one transaction-scoped advisory lock per store). */
const LOCK = 606;

export const bulkInputSchema = z
  .object({
    lang: z.enum(['en', 'bn']).default('en'),
    source: z.enum(BULK_SOURCES).default('page'),
    name: z.string().max(TEXT_MAX),
    phone: z.string().max(TEXT_MAX),
    email: z.string().max(TEXT_MAX).nullable().optional(),
    company: z.string().max(TEXT_MAX).nullable().optional(),
    itemsText: z.string().max(TEXT_MAX).nullable().optional(),
    quantity: z.union([z.int(), z.string().max(20)]),
    logo: z.boolean().optional(),
    neededBy: z.string().max(20).nullable().optional(),
    note: z
      .string()
      .max(TEXT_MAX * 2)
      .nullable()
      .optional(),
    /** He came from the bag: take its lines with the enquiry. */
    withBag: z.boolean().optional(),
  })
  .strict();
export type BulkEnquiryInput = z.input<typeof bulkInputSchema>;

export interface BulkRequest {
  storeId: number;
  /** The browser's random visitor id (the bag cookie), or null. */
  visitorId: string | null;
  customerId?: string | null;
  ip?: string | null;
  input: unknown;
}

/** A refused form names its field and the problem (the page puts the words under that box). */
export class BulkFormError extends CheckoutError {
  constructor(field: BulkField, problem: BulkProblem) {
    super('FORM', `the bulk enquiry's ${field} is not right (${problem})`, [field], { field, problem });
  }
}

export interface BulkSent {
  id: string;
  ref: string;
}

/** One bag line as the enquiry keeps it (no price: a bulk price is the owner's quote). */
export interface BulkLine {
  productId: string;
  variantId: string;
  name: string;
  colour: string | null;
  size: string | null;
  quantity: number;
}

async function bagLinesOf(deps: CheckoutDeps, storeId: number, visitorId: string | null): Promise<BulkLine[]> {
  if (!visitorId) return [];
  const cartId = await findBag(deps, { storeId, visitorId });
  if (!cartId) return [];
  const rows = await deps.db.cartItem.findMany({
    where: { storeId, cartId, removedAt: null, savedForLater: false },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { variantId: true, quantity: true },
  });
  const variants = await deps.db.productVariant.findMany({
    where: { storeId, id: { in: [...new Set(rows.map((r) => r.variantId))] } },
    select: { id: true, productId: true, product: { select: { nameEn: true } }, colour: { select: { nameEn: true } }, size: { select: { label: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  return rows.flatMap((r) => {
    const v = byId.get(r.variantId);
    return v ? [{ productId: v.productId, variantId: r.variantId, name: v.product.nameEn, colour: v.colour?.nameEn ?? null, size: v.size?.label ?? null, quantity: r.quantity }] : [];
  });
}

/** POST /api/shop/bulk — the enquiry, while the lane is on. */
export async function sendBulkEnquiry(deps: CheckoutDeps, req: BulkRequest): Promise<BulkSent> {
  checkStoreId(req.storeId);
  const lane = await setting(deps, req.storeId, 'orders.bulkLane');
  if (!lane.enabled) throw new CheckoutError('NOT_OPEN', 'the bulk lane is off');
  const d = parse(bulkInputSchema, req.input, 'bulk enquiry');
  const [nameMin, timeZone] = await Promise.all([setting(deps, req.storeId, 'checkout.form.nameMin'), setting(deps, req.storeId, 'store.timeZone')]);
  const now = nowOf(deps);
  const lines = d.withBag ? await bagLinesOf(deps, req.storeId, req.visitorId) : [];
  const c = checkBulk(d, {
    nameMin,
    textMax: TEXT_MAX,
    noteMax: lane.noteMaxChars,
    minQuantity: lane.minQuantity,
    maxQuantity: lane.maxQuantity,
    today: storeToday(now, timeZone),
    hasBagLines: lines.length > 0,
  });
  if (!c.ok) throw new BulkFormError(c.field, c.problem);
  const v = c.value;

  return deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK}::int, ${req.storeId}::int)`;
    const since = new Date(now.getTime() - DAY_MS);
    const same: Prisma.BulkEnquiryWhereInput[] = [{ phone: v.phone }, ...(req.visitorId ? [{ visitorId: req.visitorId }] : [])];
    const recent = await tx.bulkEnquiry.count({ where: { storeId: req.storeId, createdAt: { gte: since }, OR: same } });
    if (recent >= lane.perDay) throw new CheckoutError('TOO_MANY', 'enough enquiries from this number today', [], { perDay: lane.perDay });
    const last = await tx.bulkEnquiry.findFirst({ where: { storeId: req.storeId }, orderBy: { refNo: 'desc' }, select: { refNo: true } });
    const refNo = (last?.refNo ?? 1_000) + 1;
    const row = await tx.bulkEnquiry.create({
      data: {
        storeId: req.storeId,
        refNo,
        name: v.name,
        phone: v.phone,
        email: v.email,
        company: v.company,
        items: lines.length ? (lines as unknown as Prisma.InputJsonValue) : undefined,
        itemsText: v.itemsText,
        quantity: v.quantity,
        logo: lane.logo.offered && v.logo,
        neededBy: v.neededBy ? new Date(`${v.neededBy}T00:00:00Z`) : null,
        note: v.note,
        source: d.source,
        lang: d.lang,
        visitorId: req.visitorId,
        customerId: req.customerId ?? null,
        ip: req.ip ?? null,
        createdAt: now,
      },
      select: { id: true },
    });
    return { id: row.id, ref: `${lane.refPrefix}${refNo}` };
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------------
// The team's side
// ---------------------------------------------------------------------------------------------------------------------

export interface TeamWho {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export const bulkListQuery = z
  .object({
    status: z.enum(BULK_STATUSES).optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export interface BulkEnquiryRow {
  id: string;
  ref: string;
  status: BulkStatus;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  items: BulkLine[];
  itemsText: string | null;
  quantity: number;
  logo: boolean;
  neededBy: string | null;
  note: string | null;
  source: string;
  lang: string;
  orderId: string | null;
  createdAt: Date;
}

const ROW = {
  id: true,
  refNo: true,
  status: true,
  name: true,
  phone: true,
  email: true,
  company: true,
  items: true,
  itemsText: true,
  quantity: true,
  logo: true,
  neededBy: true,
  note: true,
  source: true,
  lang: true,
  orderId: true,
  createdAt: true,
} as const;

/** GET /api/admin/bulk-enquiries — newest first, by stage (orders.read). */
export async function listBulkEnquiries(deps: CheckoutDeps, who: TeamWho, query: unknown): Promise<{ rows: BulkEnquiryRow[]; next: string | null; counts: Record<BulkStatus, number> }> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'orders.read', { storeId: who.storeId });
  const q = parse(bulkListQuery, query, 'list query');
  const prefix = (await setting(deps, who.storeId, 'orders.bulkLane')).refPrefix;
  const where: Prisma.BulkEnquiryWhereInput = { storeId: who.storeId, ...(q.status ? { status: q.status } : {}) };
  const [rows, groups] = await Promise.all([
    deps.db.bulkEnquiry.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}), select: ROW }),
    deps.db.bulkEnquiry.groupBy({ by: ['status'], where: { storeId: who.storeId }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(BULK_STATUSES.map((s) => [s, groups.find((g) => g.status === s)?._count._all ?? 0])) as Record<BulkStatus, number>;
  const page = rows.slice(0, q.limit);
  return {
    rows: page.map((r) => ({
      ...r,
      ref: `${prefix}${r.refNo}`,
      status: r.status as BulkStatus,
      items: Array.isArray(r.items) ? (r.items as unknown as BulkLine[]) : [],
      neededBy: r.neededBy ? r.neededBy.toISOString().slice(0, 10) : null,
    })),
    next: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    counts,
  };
}

export const bulkStatusInput = z.object({ status: z.enum(BULK_STATUSES) }).strict();

/** POST /api/admin/bulk-enquiries/:id/status — the stage it is at (orders.notes), with an audit row. */
export async function setBulkEnquiryStatus(deps: CheckoutDeps, who: TeamWho, id: string, input: unknown): Promise<{ id: string; status: BulkStatus }> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'orders.notes', { storeId: who.storeId });
  const d = parse(bulkStatusInput, input, 'stage');
  if (!z.uuid().safeParse(id).success) throw new CheckoutError('INVALID_INPUT', 'not an enquiry id', ['id']);
  return deps.db.$transaction(async (tx) => {
    const was = await tx.bulkEnquiry.findFirst({ where: { id, storeId: who.storeId }, select: { status: true } });
    if (!was) throw new CheckoutError('NOT_FOUND', 'no such enquiry in this store');
    if (was.status !== d.status) {
      await tx.bulkEnquiry.update({ where: { id }, data: { status: d.status } });
      await audit(tx, who.actor, { action: 'bulkEnquiry.status', entityType: 'BulkEnquiry', entityId: id, before: { status: was.status }, after: { status: d.status }, storeId: who.storeId }, who.ctx);
    }
    return { id, status: d.status };
  }, TX);
}
