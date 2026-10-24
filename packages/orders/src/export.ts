// PR 151 — the order export (§5.3 ORD-01's Export, the bulk bar's Export): the orders the list shows (the same view,
// status, search, payment method and channel filters, list.ts `listWhere`) or the ticked ones, as one CSV file, newest
// first. The columns and their order are the owner's (`orders.export.columns`); the customer's name, phone, e-mail and
// address are written only for staff holding `orders.exportPersonal`, and the file says so (`personal`). Cost, the
// ERP's figures, IP and device are never read. More orders than `orders.export.maxRows` are refused with the count, never
// cut silently. A cell a spreadsheet would run as a formula gets a leading apostrophe. Every export is an ExportJob row
// and an audit row (who, which filter, how many, with or without personal details); the file itself is not kept (the
// customers' details stay in the database, not in a file store). Nothing is changed by an export.
import type { Prisma } from '@extas/db/client';
import { formatMoneyCell, writeCsv } from '@extas/catalogue';
import { ORDER_EXPORT_PERSONAL, type OrderExportColumn } from '@extas/settings';
import { can, audit } from '@extas/auth';
import { z } from 'zod';
import { allow, nowOf, parse, setting, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { listBase, listQuery, listWhere, openReviewIds } from './list';
import { dueOf } from './pure';

export const exportQuery = listQuery
  .omit({ cursor: true, limit: true })
  .extend({
    /** The ticked orders (the bulk bar); when given, only these, still within the store. */
    ids: z.array(z.uuid()).min(1).max(1_000).optional(),
  })
  .strict();

export interface OrdersCsv {
  fileName: string;
  csv: string;
  rows: number;
  columns: OrderExportColumn[];
  /** The file carries the customer's name, phone, e-mail or address. */
  personal: boolean;
  exportId: string;
}

const EXPORT_SELECT = {
  id: true,
  number: true,
  placedAt: true,
  status: true,
  source: true,
  paymentMethod: true,
  subtotalMinor: true,
  discountMinor: true,
  deliveryChargeMinor: true,
  walletAppliedMinor: true,
  totalMinor: true,
  paidMinor: true,
  currency: true,
  couponCode: true,
  confirmedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  cancelReasonCode: true,
  holdReasonCode: true,
  flags: true,
  isGift: true,
  utmSource: true,
  utmCampaign: true,
  customerName: true,
  phone: true,
  email: true,
  shippingAddressText: true,
  deliveryBand: { select: { key: true } },
  items: { where: { status: 'ACTIVE' }, select: { quantity: true } },
  shipments: { orderBy: { createdAt: 'desc' }, take: 1, select: { trackingCode: true } },
} satisfies Prisma.OrderSelect;
type ExportOrder = Prisma.OrderGetPayload<{ select: typeof EXPORT_SELECT }>;

/** Currency digits (BDT and the others the shop takes are 2). */
const digitsOf = (currency: string): number => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;

/** A time as the store reads it: `YYYY-MM-DD HH:mm` in its time zone. */
export function localTime(at: Date | null, timeZone: string): string {
  if (!at) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** One cell of one order. */
export function exportCell(o: ExportOrder, col: OrderExportColumn, timeZone: string): string | number | null {
  const money = (minor: number) => formatMoneyCell(minor, digitsOf(o.currency));
  switch (col) {
    case 'number':
      return o.number;
    case 'placedAt':
      return localTime(o.placedAt, timeZone);
    case 'status':
      return o.status;
    case 'source':
      return o.source;
    case 'paymentMethod':
      return o.paymentMethod;
    case 'items':
      return o.items.length;
    case 'pieces':
      return o.items.reduce((n, i) => n + i.quantity, 0);
    case 'subtotal':
      return money(o.subtotalMinor);
    case 'discount':
      return money(o.discountMinor);
    case 'deliveryCharge':
      return money(o.deliveryChargeMinor);
    case 'wallet':
      return money(o.walletAppliedMinor);
    case 'total':
      return money(o.totalMinor);
    case 'paid':
      return money(o.paidMinor);
    case 'due':
      return money(dueOf(o));
    case 'currency':
      return o.currency;
    case 'coupon':
      return o.couponCode;
    case 'deliveryBand':
      return o.deliveryBand?.key ?? null;
    case 'tracking':
      return o.shipments[0]?.trackingCode ?? null;
    case 'confirmedAt':
      return localTime(o.confirmedAt, timeZone);
    case 'deliveredAt':
      return localTime(o.deliveredAt, timeZone);
    case 'cancelledAt':
      return localTime(o.cancelledAt, timeZone);
    case 'cancelReason':
      return o.cancelReasonCode;
    case 'holdReason':
      return o.holdReasonCode;
    case 'flags':
      return o.flags.join(' ');
    case 'gift':
      return o.isGift ? 1 : 0;
    case 'utmSource':
      return o.utmSource;
    case 'utmCampaign':
      return o.utmCampaign;
    case 'customerName':
      return o.customerName;
    case 'phone':
      return o.phone;
    case 'email':
      return o.email;
    case 'address':
      return o.shippingAddressText;
  }
}

/** The orders of the list's filter (or the ticked ones) as a CSV file (`orders.export`). */
export async function exportOrders(deps: OrdersDeps, who: Who, input: unknown = {}): Promise<OrdersCsv> {
  await allow(deps, who, 'orders.export');
  const q = parse(exportQuery, input, 'export');
  const [maxRows, wanted, delimiter, timeZone, personalOk] = await Promise.all([
    setting(deps, who.storeId, 'orders.export.maxRows'),
    setting(deps, who.storeId, 'orders.export.columns'),
    setting(deps, who.storeId, 'orders.export.delimiter'),
    setting(deps, who.storeId, 'store.timeZone'),
    can(deps.db, who.actor, 'orders.exportPersonal', { storeId: who.storeId }),
  ]);
  const columns = wanted.filter((c) => personalOk || !ORDER_EXPORT_PERSONAL.has(c));
  if (!columns.length) throw new OrdersError('INVALID_INPUT', 'no column may be exported without personal details', ['columns']);
  const personal = columns.some((c) => ORDER_EXPORT_PERSONAL.has(c));
  const where: Prisma.OrderWhereInput = q.ids ? { AND: [listBase(who.storeId), { id: { in: q.ids } }] } : listWhere(who.storeId, q, await openReviewIds(deps, who.storeId));
  const count = await deps.db.order.count({ where });
  if (count > maxRows) throw new OrdersError('EXPORT_TOO_LARGE', `${count} orders are more than one file holds (${maxRows}); narrow the filter`, ['maxRows'], { count, maxRows });
  const orders = await deps.db.order.findMany({ where, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], select: EXPORT_SELECT });
  const csv = writeCsv(
    columns,
    orders.map((o) => columns.map((c) => exportCell(o, c, timeZone))),
    delimiter,
  );
  const now = nowOf(deps);
  const filters = q.ids ? { ids: q.ids.length } : { view: q.view, status: q.status ?? null, q: q.q ?? null, payment: q.payment ?? null, source: q.source ?? null };
  const job = await deps.db.$transaction(async (tx) => {
    const j = await tx.exportJob.create({
      data: { storeId: who.storeId, kind: 'orders.csv', filters: { ...filters, columns }, excludesOwnerData: false, status: 'SUCCEEDED', rowCount: orders.length, requestedById: who.actor.staffUserId ?? null, finishedAt: now },
      select: { id: true },
    });
    await audit(tx, who.actor, { storeId: who.storeId, action: 'orders.export', entityType: 'ExportJob', entityId: j.id, before: null, after: { rows: orders.length, personal, filters } }, { source: 'admin-api', ...who.ctx });
    return j;
  });
  return { fileName: `orders-${localTime(now, timeZone).slice(0, 10)}.csv`, csv, rows: orders.length, columns, personal, exportId: job.id };
}
