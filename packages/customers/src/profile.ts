// PR 286 — one customer's page (BACKEND-ARCHITECTURE §5.5 CUS-02; demo V12.4 #/admin/customers/:id): beside the single
// view (view.ts) it lists the person's orders over every profile and number, newest first, a page at a time; his
// exchanges; his support history (conversations and tickets — empty until the support desk of S22 writes them); and
// "Who looked at this customer" for the owner (`audit.read`). How long each list is comes from the owner's
// `customers.profile`. Reading needs `customers.read`; a merged profile reads as its survivor. No address, no money moved.
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { accessLogOf, type AccessRow } from './access';
import { allow, parse, setting, UUID, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { familyOf, familyOrderWhere, profilesOf, type Family } from './family';
import { HISTORY_MAX } from './view';

export interface CustomerOrderRow {
  id: string;
  number: string;
  placedAt: Date;
  status: string;
  totalMinor: number;
  paymentMethod: string | null;
  source: string;
  isGift: boolean;
  /** The profile the order is on (null: a guest order with one of his numbers). */
  profileId: string | null;
}

export interface CustomerOrders {
  rows: CustomerOrderRow[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}

export interface ExchangeRow {
  id: string;
  number: string;
  status: string;
  reason: string;
  createdAt: Date;
  order: { id: string; number: string } | null;
}

export interface SupportRow {
  kind: 'conversation' | 'ticket';
  id: string;
  /** The conversation's reference, or the ticket's subject. */
  title: string;
  status: string;
  at: Date;
}

const pageInput = z.object({ page: z.coerce.number().int().min(1).max(10_000).optional() }).strict();

/** The person a profile id belongs to, or NOT_FOUND (an erased profile is never shown). */
async function personOf(deps: CustomersDeps, who: Who, id: string): Promise<Family> {
  if (!UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  const found = await familyOf(deps.db, who.storeId, id);
  if (!found || found.family.root.erasedAt) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  return found.family;
}

/** The person's orders, newest first, a page of the owner's size at a time. */
export async function customerOrders(deps: CustomersDeps, who: Who, id: string, input: unknown = {}): Promise<CustomerOrders> {
  await allow(deps, who, 'customers.read');
  const d = parse(pageInput, input, 'page');
  const f = await personOf(deps, who, id);
  const { ordersPerPage } = await setting(deps, who.storeId, 'customers.profile');
  const page = d.page ?? 1;
  const where = familyOrderWhere(who.storeId, f);
  const [rows, total] = await Promise.all([
    deps.db.order.findMany({
      where,
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * ordersPerPage,
      take: ordersPerPage,
      select: { id: true, number: true, placedAt: true, status: true, totalMinor: true, paymentMethod: true, source: true, isGift: true, customerId: true },
    }),
    deps.db.order.count({ where }),
  ]);
  return {
    rows: rows.map((o) => ({ id: o.id, number: o.number, placedAt: o.placedAt, status: o.status, totalMinor: o.totalMinor, paymentMethod: o.paymentMethod, source: o.source, isGift: o.isGift, profileId: o.customerId })),
    page,
    perPage: ordersPerPage,
    total,
    hasMore: page * ordersPerPage < total,
  };
}

/** The person's exchanges, newest first (an exchange on one of his orders, or on one of his profiles). */
export async function customerExchanges(deps: CustomersDeps, who: Who, id: string): Promise<ExchangeRow[]> {
  await allow(deps, who, 'customers.read');
  const f = await personOf(deps, who, id);
  const { listsPerPage } = await setting(deps, who.storeId, 'customers.profile');
  const ids = profilesOf(f).map((p) => p.id);
  const orders = await deps.db.order.findMany({ where: familyOrderWhere(who.storeId, f), orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: HISTORY_MAX, select: { id: true, number: true } });
  const orderIds = orders.map((o) => o.id);
  const rows = await deps.db.exchange.findMany({
    where: { storeId: who.storeId, OR: [{ customerId: { in: ids } }, ...(orderIds.length ? [{ orderId: { in: orderIds } }] : [])] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: listsPerPage,
    select: { id: true, number: true, status: true, reason: true, createdAt: true, orderId: true },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));
  return rows.map((x) => ({ id: x.id, number: x.number, status: x.status, reason: x.reason, createdAt: x.createdAt, order: byId.get(x.orderId) ?? null }));
}

/** The person's support history: conversations and tickets on any of his profiles, newest first (S22 writes them). */
export async function customerSupport(deps: CustomersDeps, who: Who, id: string): Promise<SupportRow[]> {
  await allow(deps, who, 'customers.read');
  const f = await personOf(deps, who, id);
  const { listsPerPage } = await setting(deps, who.storeId, 'customers.profile');
  const ids = profilesOf(f).map((p) => p.id);
  const [convs, tickets] = await Promise.all([
    deps.db.conversation.findMany({ where: { storeId: who.storeId, customerId: { in: ids } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: listsPerPage, select: { id: true, refCode: true, status: true, lastMessageAt: true, createdAt: true } }),
    deps.db.ticket.findMany({ where: { storeId: who.storeId, customerId: { in: ids } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: listsPerPage, select: { id: true, subject: true, status: true, createdAt: true } }),
  ]);
  const rows: SupportRow[] = [
    ...convs.map((c) => ({ kind: 'conversation' as const, id: c.id, title: c.refCode, status: c.status, at: c.lastMessageAt ?? c.createdAt })),
    ...tickets.map((x) => ({ kind: 'ticket' as const, id: x.id, title: x.subject, status: x.status, at: x.createdAt })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, listsPerPage);
}

/** "Who looked at this customer": the latest opens, copies and calls over every profile (`audit.read`, the owner). */
export async function customerLooks(deps: CustomersDeps, who: Who, id: string): Promise<AccessRow[]> {
  await allow(deps, who, 'customers.read');
  await requirePermission(deps.db, who.actor, 'audit.read', { storeId: who.storeId });
  const f = await personOf(deps, who, id);
  const { accessLogShown } = await setting(deps, who.storeId, 'customers.profile');
  return accessLogOf(deps.db, who.storeId, profilesOf(f).map((p) => p.id), accessLogShown);
}
