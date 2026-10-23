// PR 138 — the order list and one order's page data for the admin API (§9.10): the views the team works from (new,
// waiting for an advance, on hold, the customer asked to cancel, cancel after booking waiting for the courier, duplicate
// review, …), a search by order number, phone or name, and for one order everything its screen shows: lines, money
// (amount due, the payment pill), the shipment, payments and refund requests as their own records (§6.5.0), notes, the
// open reviews, the timeline and the commands open now. The admin pages come later (S05 UI); the shapes are here.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, parse, setting, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { notesOf, type OrderNoteView } from './notes';
import { allowedCommands, customerCancelMode, dueOf, FINAL_STATES, OPEN_STATES, paymentPill, type OrderCommand, type OrderState, type PaymentPill } from './pure';
import { factsOf, machineOf, MACHINE_SELECT } from './service';

export const ORDER_VIEWS = ['all', 'open', 'new', 'awaitingAdvance', 'onHold', 'cancelRequests', 'cancelPending', 'inReview', 'finished'] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

/** The filter of each view. */
function viewWhere(view: OrderView, openReviewOrderIds: string[]): Prisma.OrderWhereInput {
  switch (view) {
    case 'open':
      return { status: { in: [...OPEN_STATES] } };
    case 'new':
      return { status: 'PLACED' };
    case 'awaitingAdvance':
      return { status: 'AWAITING_ADVANCE' };
    case 'onHold':
      return { status: 'ON_HOLD' };
    case 'cancelRequests':
      return { cancelRequestedAt: { not: null }, status: { in: [...OPEN_STATES] } };
    case 'cancelPending':
      return { cancelPending: true };
    case 'inReview':
      return { id: { in: openReviewOrderIds } };
    case 'finished':
      return { status: { in: [...FINAL_STATES] } };
    default:
      return {};
  }
}

export const listQuery = z
  .object({
    view: z.enum(ORDER_VIEWS).default('all'),
    status: z.string().trim().max(40).optional(),
    q: z.string().trim().max(80).optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export interface OrderRow {
  id: string;
  number: string;
  status: OrderState;
  version: number;
  placedAt: Date;
  customerName: string | null;
  phone: string | null;
  itemCount: number;
  totalMinor: number;
  dueMinor: number;
  currency: string;
  paymentMethod: string | null;
  payment: PaymentPill;
  holdReasonCode: string | null;
  cancelReasonCode: string | null;
  cancelRequested: boolean;
  cancelPending: boolean;
  customerWantsChange: boolean;
  inReview: boolean;
  flags: string[];
  internalFlags: string[];
  orderGroupId: string | null;
}

const ROW_SELECT = {
  id: true,
  number: true,
  status: true,
  version: true,
  placedAt: true,
  customerName: true,
  phone: true,
  totalMinor: true,
  walletAppliedMinor: true,
  paidMinor: true,
  currency: true,
  paymentMethod: true,
  holdReasonCode: true,
  cancelReasonCode: true,
  cancelRequestedAt: true,
  cancelPending: true,
  customerWantsChange: true,
  flags: true,
  internalFlags: true,
  orderGroupId: true,
  _count: { select: { items: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.OrderSelect;

/** Refunds paid out per order (for the payment pill: money still owed back). */
async function refundedOf(deps: OrdersDeps, storeId: number, orderIds: string[]): Promise<Map<string, number>> {
  if (!orderIds.length) return new Map();
  const rows = await deps.db.refund.groupBy({ by: ['orderId'], where: { storeId, orderId: { in: orderIds }, status: 'COMPLETED' }, _sum: { amountMinor: true } });
  return new Map(rows.map((r) => [r.orderId, r._sum.amountMinor ?? 0]));
}

async function openReviewIds(deps: OrdersDeps, storeId: number): Promise<string[]> {
  const rows = await deps.db.fraudAlert.findMany({ where: { storeId, status: 'OPEN' }, select: { orderId: true }, distinct: ['orderId'] });
  return rows.map((r) => r.orderId);
}

/** One page of orders, newest first, with the count of every view (the tabs). */
export async function listOrders(deps: OrdersDeps, who: Who, query: unknown = {}): Promise<{ rows: OrderRow[]; next: string | null; counts: Record<OrderView, number> }> {
  await allow(deps, who, 'orders.read');
  const q = parse(listQuery, query, 'query');
  const take = q.limit ?? (await setting(deps, who.storeId, 'orders.list.pageSize'));
  const reviews = await openReviewIds(deps, who.storeId);
  const search: Prisma.OrderWhereInput = q.q
    ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q.replace(/[^\d+]/g, '') || q.q } }, { customerName: { contains: q.q, mode: 'insensitive' } }] }
    : {};
  const status = q.status ? { status: q.status as OrderState } : {};
  if (q.status && !(OPEN_STATES as readonly string[]).concat([...FINAL_STATES], ['DRAFT']).includes(q.status)) throw new OrdersError('INVALID_INPUT', 'no such status', ['status']);
  const base: Prisma.OrderWhereInput = { storeId: who.storeId, archivedAt: null, status: { not: 'DRAFT' } };
  const where: Prisma.OrderWhereInput = { AND: [base, viewWhere(q.view, reviews), status, search] };
  const found = await deps.db.order.findMany({ where, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: take + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}), select: ROW_SELECT });
  const page = found.slice(0, take);
  const refunded = await refundedOf(deps, who.storeId, page.map((o) => o.id));
  const inReview = new Set(reviews);
  const rows = page.map((o): OrderRow => ({
    id: o.id,
    number: o.number,
    status: o.status as OrderState,
    version: o.version,
    placedAt: o.placedAt,
    customerName: o.customerName,
    phone: o.phone,
    itemCount: o._count.items,
    totalMinor: o.totalMinor,
    dueMinor: dueOf(o),
    currency: o.currency,
    paymentMethod: o.paymentMethod,
    payment: paymentPill({ ...o, status: o.status as OrderState, refundedMinor: refunded.get(o.id) ?? 0 }),
    holdReasonCode: o.holdReasonCode,
    cancelReasonCode: o.cancelReasonCode,
    cancelRequested: o.cancelRequestedAt !== null,
    cancelPending: o.cancelPending,
    customerWantsChange: o.customerWantsChange,
    inReview: inReview.has(o.id),
    flags: o.flags,
    internalFlags: o.internalFlags,
    orderGroupId: o.orderGroupId,
  }));
  const counts = Object.fromEntries(
    await Promise.all(ORDER_VIEWS.map(async (v) => [v, await deps.db.order.count({ where: { AND: [base, viewWhere(v, reviews)] } })] as const)),
  ) as Record<OrderView, number>;
  return { rows, next: found.length > take ? page[page.length - 1]!.id : null, counts };
}

export interface OrderDetail {
  order: Record<string, unknown> & { id: string; number: string; status: OrderState; version: number };
  money: { totalMinor: number; walletAppliedMinor: number; paidMinor: number; dueMinor: number; refundedMinor: number; payment: PaymentPill };
  items: { id: string; sku: string; productName: string; colourName: string | null; sizeLabel: string | null; quantity: number; unitPriceMinor: number; lineTotalMinor: number; status: string }[];
  shipments: { id: string; status: string; courierAccountId: string | null; trackingCode: string | null; cancelRequestedAt: Date | null; cancelOutcome: string | null; createdAt: Date }[];
  payments: { id: string; method: string; status: string; amountMinor: number; createdAt: Date }[];
  refundRequests: { id: string; status: string; amountMinor: number; method: string | null; reason: string | null; source: string | null; createdAt: Date }[];
  reviews: { id: string; status: string; severity: string | null; matchedOrderIds: string[]; createdAt: Date }[];
  notes: OrderNoteView[];
  timeline: { id: string; type: string; fromStatus: string | null; toStatus: string | null; reasonCode: string | null; message: string | null; data: unknown; actorType: string; actorId: string | null; source: string | null; createdAt: Date }[];
  /** The commands open now (the admin shows these buttons). */
  allowed: OrderCommand[];
  /** What the customer's own page offers now (CN-020 (5)). */
  customerCancel: string;
}

/** Everything one order's screen shows. */
export async function getOrder(deps: OrdersDeps, who: Who, orderId: string): Promise<OrderDetail> {
  await allow(deps, who, 'orders.read');
  if (!z.uuid().safeParse(orderId).success) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const o = await deps.db.order.findFirst({
    where: { id: orderId, storeId: who.storeId },
    select: {
      ...MACHINE_SELECT,
      number: true,
      version: true,
      placedAt: true,
      source: true,
      fulfillmentType: true,
      customerId: true,
      customerName: true,
      phone: true,
      email: true,
      shippingAddressText: true,
      addressUnclear: true,
      subtotalMinor: true,
      discountMinor: true,
      deliveryChargeMinor: true,
      walletAppliedMinor: true,
      totalMinor: true,
      codAmountMinor: true,
      currency: true,
      paymentMethod: true,
      note: true,
      riskBand: true,
      holdReasonCode: true,
      holdReason: true,
      onHoldSince: true,
      cancelReasonCode: true,
      cancelNote: true,
      cancelledAt: true,
      cancelRequestReason: true,
      customerWantsChange: true,
      advanceDueAt: true,
      confirmedAt: true,
      packedAt: true,
      handedOverAt: true,
      deliveredAt: true,
      returnedAt: true,
      flags: true,
      internalFlags: true,
      orderGroupId: true,
    },
  });
  if (!o) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const [items, shipments, payments, refunds, reviews, events, notes, facts, cfg] = await Promise.all([
    deps.db.orderItem.findMany({ where: { storeId: o.storeId, orderId: o.id }, orderBy: { createdAt: 'asc' }, select: { id: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true, lineTotalMinor: true, status: true } }),
    deps.db.shipment.findMany({ where: { storeId: o.storeId, orderId: o.id }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, courierAccountId: true, trackingCode: true, cancelRequestedAt: true, cancelOutcome: true, createdAt: true } }),
    deps.db.payment.findMany({ where: { storeId: o.storeId, orderId: o.id }, orderBy: { createdAt: 'asc' }, select: { id: true, method: true, status: true, amountMinor: true, createdAt: true } }),
    deps.db.refund.findMany({ where: { storeId: o.storeId, orderId: o.id }, orderBy: { createdAt: 'asc' }, select: { id: true, status: true, amountMinor: true, method: true, reason: true, source: true, createdAt: true } }),
    deps.db.fraudAlert.findMany({ where: { storeId: o.storeId, orderId: o.id }, orderBy: { createdAt: 'asc' }, select: { id: true, status: true, severity: true, matchedOrderIds: true, createdAt: true } }),
    deps.db.orderEvent.findMany({ where: { storeId: o.storeId, orderId: o.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, type: true, fromStatus: true, toStatus: true, reasonCode: true, message: true, data: true, actorType: true, actorId: true, source: true, createdAt: true } }),
    notesOf(deps, o.storeId, o.id),
    factsOf(deps.db, o),
    setting(deps, o.storeId, 'orders.cancel.customer'),
  ]);
  const refundedMinor = refunds.filter((r) => r.status === 'COMPLETED').reduce((s, r) => s + r.amountMinor, 0);
  const m = machineOf(o, facts);
  return {
    order: { ...o, status: o.status as OrderState, cancelRequested: o.cancelRequestedAt !== null, inReview: facts.inReview, booked: facts.shipment !== null },
    money: { totalMinor: o.totalMinor, walletAppliedMinor: o.walletAppliedMinor, paidMinor: o.paidMinor, dueMinor: dueOf(o), refundedMinor, payment: paymentPill({ ...o, status: o.status as OrderState, refundedMinor }) },
    items,
    shipments,
    payments,
    refundRequests: refunds,
    reviews,
    notes,
    timeline: events,
    allowed: allowedCommands(m),
    customerCancel: customerCancelMode(cfg, m),
  };
}
