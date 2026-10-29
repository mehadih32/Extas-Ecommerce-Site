// PR 407 (S20; Blueprint B2.1 locked) — the customer invoice is issued once per order and kept: "generated automatically
// on every order; one invoice per order; regenerated only if the order is edited". Each issued invoice is one
// GeneratedDocument row (kind INVOICE) with its printed number (made once from the owner's `account.invoice.number`
// pattern and never changed, even if the pattern changes later), the order content it showed (`data`) and a
// fingerprint of that content. When the order's items, money, name, address or gift details change, a new version is
// made with the same number and the reason EDITED; a payment, a status change or a delivery never makes one (the
// fingerprint leaves them out on purpose). Older versions stay; nothing is deleted.
//
// Who calls it: the background job `invoices.issue` (every few minutes, orders changed in the last `lookbackDays`), the
// customer's invoice page and the admin's print (both issue on demand, so an older order gets its invoice too).
// Nothing here moves money or works a figure out: every amount is copied from the order as stored (CN-022).
import { createHash } from 'node:crypto';
import { Prisma } from '@extas/db/client';
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, TX, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { invoiceNumberOf } from './invoice-pure';

/** Why a version was made: the order was placed (version 1), or it was edited after that. */
export const INVOICE_REASONS = ['PLACED', 'EDITED'] as const;
export type InvoiceReason = (typeof INVOICE_REASONS)[number];

/** One line of the order as the invoice showed it (copied from the stored order line). */
export interface InvoiceContentLine {
  id: string;
  sku: string;
  name: string;
  colour: string | null;
  size: string | null;
  quantity: number;
  unitMinor: number;
  discountMinor: number;
  lineTotalMinor: number;
  setKey: string | null;
  isAddOn: boolean;
}

/** What an issued invoice showed: the order's own stored facts, never worked out again. */
export interface InvoiceContent {
  orderNumber: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gift: { sender: string | null; note: string | null; hidePrices: boolean } | null;
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  walletMinor: number;
  totalMinor: number;
  chargeFixed: boolean;
  currency: string;
  lines: InvoiceContentLine[];
}

/** The order fields the invoice content is copied from. */
export interface InvoiceOrderFacts {
  number: string;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  shippingAddressText: string | null;
  isGift: boolean;
  giftSenderName: string | null;
  giftNote: string | null;
  giftHidePrices: boolean;
  subtotalMinor: number;
  discountMinor: number;
  deliveryChargeMinor: number;
  walletAppliedMinor: number;
  totalMinor: number;
  chargeFixed: boolean;
  currency: string;
  items: {
    id: string;
    sku: string;
    productName: string;
    colourName: string | null;
    sizeLabel: string | null;
    quantity: number;
    unitPriceMinor: number;
    discountMinor: number;
    lineTotalMinor: number;
    comboGroupKey: string | null;
    isAddOn: boolean;
  }[];
}

/** The content of an order's invoice: its active lines in order, its stored money, name, address and gift. */
export function invoiceContentOf(o: InvoiceOrderFacts): InvoiceContent {
  return {
    orderNumber: o.number,
    name: o.customerName,
    phone: o.phone,
    email: o.email,
    address: o.shippingAddressText,
    gift: o.isGift ? { sender: o.giftSenderName, note: o.giftNote, hidePrices: o.giftHidePrices } : null,
    subtotalMinor: o.subtotalMinor,
    discountMinor: o.discountMinor,
    deliveryMinor: o.deliveryChargeMinor,
    walletMinor: o.walletAppliedMinor,
    totalMinor: o.totalMinor,
    chargeFixed: o.chargeFixed,
    currency: o.currency,
    lines: o.items.map((i) => ({
      id: i.id,
      sku: i.sku,
      name: i.productName,
      colour: i.colourName,
      size: i.sizeLabel,
      quantity: i.quantity,
      unitMinor: i.unitPriceMinor,
      discountMinor: i.discountMinor,
      lineTotalMinor: i.lineTotalMinor,
      setKey: i.comboGroupKey,
      isAddOn: i.isAddOn,
    })),
  };
}

/** JSON with its keys sorted, so the same content always gives the same text. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** sha256 of the content: the same order content gives the same fingerprint; a payment or a status is not in it. */
export function invoiceFingerprint(content: InvoiceContent): string {
  return createHash('sha256').update(canonical(content)).digest('hex');
}

/** One issued invoice (its latest version). */
export interface IssuedInvoice {
  id: string;
  orderId: string;
  number: string;
  version: number;
  reason: InvoiceReason;
  /** When this version was made (version 1: when the invoice was first issued). */
  issuedAt: Date;
  /** When version 1 was made. */
  firstIssuedAt: Date;
  content: InvoiceContent;
}

/** What issueInvoice did: made version 1, made a new version (edited), or nothing changed. */
export type IssueOutcome = 'issued' | 'revised' | 'unchanged';

const ORDER_SELECT = {
  id: true,
  storeId: true,
  number: true,
  status: true,
  archivedAt: true,
  updatedAt: true,
  customerName: true,
  phone: true,
  email: true,
  shippingAddressText: true,
  isGift: true,
  giftSenderName: true,
  giftNote: true,
  giftHidePrices: true,
  subtotalMinor: true,
  discountMinor: true,
  deliveryChargeMinor: true,
  walletAppliedMinor: true,
  totalMinor: true,
  chargeFixed: true,
  currency: true,
  items: {
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true, discountMinor: true, lineTotalMinor: true, comboGroupKey: true, isAddOn: true },
  },
} satisfies Prisma.OrderSelect;

const DOC_SELECT = { id: true, orderId: true, number: true, version: true, regeneratedReason: true, createdAt: true, data: true, fingerprint: true } as const;

type DocRow = { id: string; orderId: string | null; number: string | null; version: number; regeneratedReason: string | null; createdAt: Date; data: Prisma.JsonValue; fingerprint: string | null };

const issued = (d: DocRow, first: Date, fallbackNumber: string): IssuedInvoice => ({
  id: d.id,
  orderId: d.orderId ?? '',
  number: d.number ?? fallbackNumber,
  version: d.version,
  reason: d.regeneratedReason === 'EDITED' ? 'EDITED' : 'PLACED',
  issuedAt: d.createdAt,
  firstIssuedAt: first,
  content: d.data as unknown as InvoiceContent,
});

/**
 * Issues the order's invoice, or its next version when the order was edited since; idempotent (a second call with
 * nothing changed only notes the check). The invoice switched off (`account.invoice.enabled`), a draft (a checkout
 * not yet placed) or an archived order gets none: null. One order at a time (an advisory lock), so two callers at
 * once never make two versions.
 */
export async function issueInvoice(deps: Pick<OrdersDeps, 'db' | 'settings' | 'now'>, input: { storeId: number } & ({ orderId: string } | { number: string })): Promise<{ invoice: IssuedInvoice; outcome: IssueOutcome } | null> {
  checkStoreId(input.storeId);
  const set = await setting(deps, input.storeId, 'account.invoice');
  if (!set.enabled) return null;
  const where = 'orderId' in input ? { id: input.orderId, storeId: input.storeId } : { storeId: input.storeId, number: input.number };
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const o = await tx.order.findFirst({ where, select: ORDER_SELECT });
    if (!o || o.status === 'DRAFT' || o.archivedAt) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice:${o.storeId}:${o.id}`}, 0))`;
    const content = invoiceContentOf(o);
    const fingerprint = invoiceFingerprint(content);
    const versions = await tx.generatedDocument.findMany({ where: { storeId: o.storeId, kind: 'INVOICE', orderId: o.id }, orderBy: { version: 'asc' }, select: DOC_SELECT });
    const first = versions[0];
    const last = versions[versions.length - 1];
    const data = content as unknown as Prisma.InputJsonValue;
    if (!first || !last) {
      const number = invoiceNumberOf(set.number, o.number);
      const d = await tx.generatedDocument.create({
        data: { storeId: o.storeId, kind: 'INVOICE', orderId: o.id, refType: 'Order', refId: o.id, format: 'pdf', version: 1, regeneratedReason: 'PLACED', number, fingerprint, data, checkedAt: o.updatedAt, createdAt: now },
        select: DOC_SELECT,
      });
      return { invoice: issued(d, d.createdAt, number), outcome: 'issued' as const };
    }
    const number = first.number ?? invoiceNumberOf(set.number, o.number);
    if (last.fingerprint === fingerprint) {
      await tx.generatedDocument.update({ where: { id: last.id }, data: { checkedAt: o.updatedAt } });
      return { invoice: issued(last, first.createdAt, number), outcome: 'unchanged' as const };
    }
    const d = await tx.generatedDocument.create({
      data: { storeId: o.storeId, kind: 'INVOICE', orderId: o.id, refType: 'Order', refId: o.id, format: 'pdf', version: last.version + 1, regeneratedReason: 'EDITED', number, fingerprint, data, checkedAt: o.updatedAt, createdAt: now },
      select: DOC_SELECT,
    });
    return { invoice: issued(d, first.createdAt, number), outcome: 'revised' as const };
  }, TX);
}

/** The order's issued invoice as it stands (its latest version), without issuing anything; null: none yet. */
export async function latestInvoice(deps: Pick<OrdersDeps, 'db'>, storeId: number, orderId: string): Promise<IssuedInvoice | null> {
  const versions = await deps.db.generatedDocument.findMany({ where: { storeId, kind: 'INVOICE', orderId }, orderBy: { version: 'asc' }, select: DOC_SELECT });
  const first = versions[0];
  const last = versions[versions.length - 1];
  return first && last ? issued(last, first.createdAt, first.number ?? '') : null;
}

/**
 * The background run: issues the invoices of placed orders changed in the last `lookbackDays` whose invoice was not
 * compared since (or that have none), oldest change first, at most `perRun`. Off (`documents.invoice.issue.enabled`
 * or `account.invoice.enabled`): nothing.
 */
export async function issueDueInvoices(deps: Pick<OrdersDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<{ issued: number; revised: number; unchanged: number }> {
  checkStoreId(storeId);
  const out = { issued: 0, revised: 0, unchanged: 0 };
  const cfg = await setting(deps, storeId, 'documents.invoice.issue');
  if (!cfg.enabled || !(await setting(deps, storeId, 'account.invoice')).enabled) return out;
  const since = new Date(nowOf(deps).getTime() - cfg.lookbackDays * 86_400_000);
  const due = await deps.db.$queryRaw<{ id: string }[]>`
    SELECT o."id" FROM "Order" o
    WHERE o."storeId" = ${storeId} AND o."updatedAt" >= ${since} AND o."status" <> 'DRAFT' AND o."archivedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "GeneratedDocument" d
        WHERE d."storeId" = o."storeId" AND d."kind" = 'INVOICE' AND d."orderId" = o."id" AND d."checkedAt" >= o."updatedAt"
      )
    ORDER BY o."updatedAt" ASC
    LIMIT ${cfg.perRun}`;
  for (const { id } of due) {
    const r = await issueInvoice(deps, { storeId, orderId: id });
    if (r) out[r.outcome] += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The admin's list (Orders › Packing & print › Invoices)
// ---------------------------------------------------------------------------------------------------------------------

export const INVOICE_VIEWS = ['all', 'revised', 'waiting'] as const;
export type InvoiceListView = (typeof INVOICE_VIEWS)[number];

const listSchema = z
  .object({
    view: z.enum(INVOICE_VIEWS).default('all'),
    q: z.string().trim().max(60).optional(),
    // the page asks for the owner's "most per print" (documents.invoice.print.maxPerPdf, up to 500)
    limit: z.int().min(1).max(500).default(50),
  })
  .strict();

export interface InvoiceListRow {
  orderId: string;
  orderNumber: string;
  status: string;
  placedAt: Date;
  totalMinor: number;
  currency: string;
  /** Null: no invoice yet (it is issued on the next run, or when it is printed). */
  invoice: { number: string; version: number; issuedAt: Date; revisedAt: Date | null } | null;
}

export interface InvoiceList {
  rows: InvoiceListRow[];
  counts: Record<InvoiceListView, number>;
}

/**
 * The invoices of the store's placed orders, newest order first: all, those revised after an edit (version 2 or more),
 * or those waiting for their invoice (none issued yet). `q`: an order or invoice number. Needs `fulfilment.read` (the
 * list shows order and invoice numbers and totals only — no customer's name, phone or address).
 */
export async function invoiceList(deps: Pick<OrdersDeps, 'db'>, who: Who, input: unknown): Promise<InvoiceList> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'fulfilment.read', { storeId: who.storeId });
  const q = parse(listSchema, input, 'invoice list');
  const storeId = who.storeId;
  const base: Prisma.OrderWhereInput = { storeId, status: { not: 'DRAFT' }, archivedAt: null };
  const search: Prisma.OrderWhereInput = q.q
    ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { documents: { some: { kind: 'INVOICE', number: { contains: q.q, mode: 'insensitive' } } } }] }
    : {};
  const revised: Prisma.OrderWhereInput = { documents: { some: { kind: 'INVOICE', version: { gt: 1 } } } };
  const waiting: Prisma.OrderWhereInput = { documents: { none: { kind: 'INVOICE' } } };
  const viewWhere = q.view === 'revised' ? revised : q.view === 'waiting' ? waiting : {};
  const [orders, all, nRevised, nWaiting] = await Promise.all([
    deps.db.order.findMany({
      where: { AND: [base, search, viewWhere] },
      orderBy: { placedAt: 'desc' },
      take: q.limit,
      select: { id: true, number: true, status: true, placedAt: true, totalMinor: true, currency: true, documents: { where: { kind: 'INVOICE' }, orderBy: { version: 'asc' }, select: { number: true, version: true, createdAt: true } } },
    }),
    deps.db.order.count({ where: { AND: [base, search] } }),
    deps.db.order.count({ where: { AND: [base, search, revised] } }),
    deps.db.order.count({ where: { AND: [base, search, waiting] } }),
  ]);
  return {
    rows: orders.map((o) => {
      const first = o.documents[0];
      const last = o.documents[o.documents.length - 1];
      return {
        orderId: o.id,
        orderNumber: o.number,
        status: o.status,
        placedAt: o.placedAt,
        totalMinor: o.totalMinor,
        currency: o.currency,
        invoice: first && last ? { number: first.number ?? '', version: last.version, issuedAt: first.createdAt, revisedAt: last.version > 1 ? last.createdAt : null } : null,
      };
    }),
    counts: { all, revised: nRevised, waiting: nWaiting },
  };
}

/** The orders a print asks for, in the order asked, at most `max`; unknown or draft ones are left out. */
export async function invoiceOrders(deps: Pick<OrdersDeps, 'db'>, storeId: number, orderIds: readonly string[], max: number): Promise<{ id: string; number: string }[]> {
  checkStoreId(storeId);
  if (orderIds.length > max) throw new OrdersError('INVALID_INPUT', `at most ${max} invoices in one print`, ['orderIds']);
  const rows = await deps.db.order.findMany({ where: { storeId, id: { in: [...orderIds] }, status: { not: 'DRAFT' }, archivedAt: null }, select: { id: true, number: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return orderIds.map((id) => byId.get(id)).filter((r): r is { id: string; number: string } => !!r);
}
