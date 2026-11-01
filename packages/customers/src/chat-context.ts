// S22 · PR 428 (Blueprint B4.5) — the customer beside a support chat: the instant scan of the person who writes. From
// the chat's customer (PR 427 links it) or, when none is linked, the number on the chat: how many orders, how many
// delivered, refused and returned (the same counting as the single view and the risk score's phone history, PR 157 /
// 284), the risk score of his latest scored order (open first), and the orders that are still on their way with where
// each one is now (the order's state and its courier parcel). Worked out fresh each time the chat is opened.
//
// Reading needs `support.read`. The counts, ratios and risk score are customer history: they go out only to a person who
// also holds `customers.read` (without it: the order count and the live orders, as before). The open is not logged as
// a profile open — the inbox reads it on every chat; "Open customer" (the single view) logs as always.
import { requirePermission } from '@extas/auth';
import { historyOptions, pastOrdersOf, phoneForms, summarizeHistory, type PhoneSummary } from '@extas/orders';
import type { Prisma } from '@extas/db/client';
import { checkStoreId, type CustomersDeps, type Who } from './context';
import { familyOf, familyOrderWhere, type Family } from './family';
import { HISTORY_MAX } from './view';
import { chatRatios, type ChatRatios } from './pure';

/** Order states that are finished (anything else is still live: placed, confirmed, packed, with the courier …). */
const FINISHED = ['DRAFT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'] as const;

export interface ChatOrder {
  id: string;
  number: string;
  status: string;
  placedAt: Date;
  totalMinor: number;
  /** Its latest courier parcel (state, courier, tracking code), when it has one. */
  parcel: { status: string; courier: string; trackingCode: string | null } | null;
}

export interface ChatContext {
  /** How the person was found: the chat's linked customer, the chat's number, or nobody yet. */
  matchedBy: 'customer' | 'phone' | null;
  customer: { id: string; name: string | null } | null;
  orders: number;
  /** With `customers.read` only (else null). */
  history: PhoneSummary | null;
  ratios: ChatRatios | null;
  /** The latest scored order's risk score and band (open orders first); with `customers.read` only. */
  risk: { score: number; band: { key: string; en: string; bn: string; tone: 'ok' | 'warn' | 'bad' } | null; orderId: string; number: string } | null;
  /** Orders still on their way, newest first. */
  live: ChatOrder[];
  /** The latest few orders, newest first (`recent` of them). */
  recent: ChatOrder[];
  /** What the reader may open: the customer's single view, the order page. */
  you: { history: boolean; customer: boolean; orders: boolean };
}

const ORDER_SELECT = { id: true, number: true, placedAt: true, status: true, totalMinor: true, cancelReasonCode: true, areaId: true, riskScore: true, riskBand: true } as const;

async function personOfChat(deps: CustomersDeps, storeId: number, ref: { customerId: string | null; phone: string | null }): Promise<{ family: Family | null; forms: string[]; matchedBy: ChatContext['matchedBy'] }> {
  if (ref.customerId) {
    const f = await familyOf(deps.db, storeId, ref.customerId);
    if (f && !f.family.root.erasedAt) return { family: f.family, forms: [], matchedBy: 'customer' };
  }
  const forms = phoneForms(ref.phone);
  if (!forms.length) return { family: null, forms: [], matchedBy: null };
  const c = await deps.db.customer.findFirst({
    where: { storeId, erasedAt: null, OR: [{ phone: { in: forms } }, { whatsappNumber: { in: forms } }] },
    orderBy: [{ mergedIntoId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const f = c ? await familyOf(deps.db, storeId, c.id) : null;
  if (f && !f.family.root.erasedAt) return { family: f.family, forms, matchedBy: 'phone' };
  return { family: null, forms, matchedBy: 'phone' };
}

/** The scan of the person behind a chat (null fields when nobody is known). Needs `support.read`. */
export async function chatContextOf(deps: CustomersDeps, who: Who, ref: { customerId: string | null; phone: string | null }, opts: { recent: number }): Promise<ChatContext> {
  checkStoreId(who.storeId);
  const held = await requirePermission(deps.db, who.actor, 'support.read', { storeId: who.storeId });
  const you = { history: held.has('customers.read'), customer: held.has('customers.read'), orders: held.has('orders.read') };
  const empty: ChatContext = { matchedBy: null, customer: null, orders: 0, history: null, ratios: null, risk: null, live: [], recent: [], you };
  const { family, forms, matchedBy } = await personOfChat(deps, who.storeId, ref);
  let where: Prisma.OrderWhereInput;
  if (family) where = familyOrderWhere(who.storeId, family);
  else if (forms.length) where = { storeId: who.storeId, archivedAt: null, status: { not: 'DRAFT' }, customerId: null, isGift: false, phone: { in: forms } };
  else return empty;
  const rows = await deps.db.order.findMany({ where, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: HISTORY_MAX, select: ORDER_SELECT });
  if (!family && !rows.length) return { ...empty, matchedBy };
  const liveRows = rows.filter((o) => !(FINISHED as readonly string[]).includes(o.status));
  const shown = [...new Map([...liveRows, ...rows.slice(0, opts.recent)].map((o) => [o.id, o])).values()];
  const parcels = shown.length
    ? await deps.db.shipment.findMany({
        where: { storeId: who.storeId, orderId: { in: shown.map((o) => o.id) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { orderId: true, status: true, trackingCode: true, courierAccount: { select: { name: true } } },
      })
    : [];
  const parcelOf = new Map<string, ChatOrder['parcel']>();
  for (const p of parcels) if (!parcelOf.has(p.orderId)) parcelOf.set(p.orderId, { status: p.status, courier: p.courierAccount.name, trackingCode: p.trackingCode });
  const card = (o: (typeof rows)[number]): ChatOrder => ({ id: o.id, number: o.number, status: o.status, placedAt: o.placedAt, totalMinor: o.totalMinor, parcel: parcelOf.get(o.id) ?? null });
  let history: PhoneSummary | null = null;
  let risk: ChatContext['risk'] = null;
  if (you.history) {
    const [past, hopts, bands] = await Promise.all([pastOrdersOf(deps, who.storeId, rows), historyOptions(deps, who.storeId), deps.settings.value('risk.bands', { storeId: who.storeId })]);
    history = summarizeHistory(past, { ourFault: hopts.ourFault, noAnswerOutcomes: hopts.noAnswerOutcomes });
    const scored = liveRows.find((o) => o.riskScore !== null) ?? rows.find((o) => o.riskScore !== null);
    if (scored) {
      const b = bands.find((x) => x.key === scored.riskBand);
      risk = { score: scored.riskScore!, band: b ? { key: b.key, en: b.en, bn: b.bn, tone: b.tone } : null, orderId: scored.id, number: scored.number };
    }
  }
  return {
    matchedBy,
    customer: family ? { id: family.root.id, name: family.root.name } : null,
    orders: rows.length,
    history,
    ratios: history ? chatRatios(history) : null,
    risk,
    live: liveRows.map(card),
    recent: rows.slice(0, opts.recent).map(card),
    you,
  };
}
