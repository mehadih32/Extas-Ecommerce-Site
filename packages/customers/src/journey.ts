// PR 288 — the customer journey view: every touch, in order (Blueprint B5.3; BACKEND-ARCHITECTURE §5.5 CUS-02 "Journey"
// tab). One list per person (every profile and number of his, PR 284) built from what the shop already keeps — nothing
// new is stored, so there is nothing new to erase: each profile made and where from; his visits (a browsing session
// from the site's own analytics, grouped, with how many pages); the touches other parts record (an ad click, a chat start
// — CustomerTouchpoint); every order with its channel, its campaign and how it ended; exchanges; messages sent to him;
// support conversations; reviews; wallet credits and debits; consent changes; merges and splits; staff notes (PR 297).
// "How he first came" is the earliest of these with a source or a campaign.
//
// The owner's `customers.journey` (off as shipped) turns the tab on, chooses which kinds show and how many rows a page
// shows. Reading needs `customers.read`; a merged profile reads as its survivor; a note's text and a wallet line show
// only to those who may see them elsewhere (`customers.read` for notes, `payments.view` for money), and a phone number
// never appears in a row.
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { allow, parse, setting, UUID, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { familyOf, familyOrderWhere, profilesOf, type Family } from './family';
import { JOURNEY_KINDS, type JourneyKind } from './journey-kinds';

export interface JourneyRow {
  kind: JourneyKind;
  at: Date;
  /** What happened, as a code the page turns into words (`cus.jr.what.<code>`). */
  what: string;
  /** Words to fill in (an order number, a channel, a campaign, an amount in minor units, a count). */
  data: Record<string, string | number | null>;
  /** Where it opens (an order, a conversation), when there is one. */
  ref: { type: 'order' | 'conversation'; id: string } | null;
}

export interface CustomerJourney {
  enabled: boolean;
  kinds: JourneyKind[];
  /** The earliest touch with a source or a campaign ("how he first came"). */
  first: JourneyRow | null;
  rows: JourneyRow[];
  page: number;
  perPage: number;
  hasMore: boolean;
}

const pageInput = z.object({ page: z.coerce.number().int().min(1).max(200).optional() }).strict();

async function personOf(deps: CustomersDeps, who: Who, id: string): Promise<Family> {
  if (!UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  const found = await familyOf(deps.db, who.storeId, id);
  if (!found || found.family.root.erasedAt) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  return found.family;
}

const clip = (s: string | null | undefined, n = 80) => (s ? s.slice(0, n) : null);

/** The person's journey, newest first, a page at a time (see the file header). */
export async function customerJourney(deps: CustomersDeps, who: Who, id: string, input: unknown = {}): Promise<CustomerJourney> {
  await allow(deps, who, 'customers.read');
  const d = parse(pageInput, input, 'page');
  const f = await personOf(deps, who, id);
  const s = await setting(deps, who.storeId, 'customers.journey');
  const page = d.page ?? 1;
  if (!s.enabled) return { enabled: false, kinds: [], first: null, rows: [], page, perPage: s.perPage, hasMore: false };
  const on = new Set(s.kinds);
  const S = who.storeId;
  const ids = profilesOf(f).map((p) => p.id);
  const take = page * s.perPage + 1;
  const money = await requirePermission(deps.db, who.actor, 'customers.read', { storeId: S }).then((held) => held.has('payments.view'));
  const orders = await deps.db.order.findMany({
    where: familyOrderWhere(S, f),
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take: Math.max(take, 500),
    select: { id: true, number: true, placedAt: true, status: true, source: true, utmSource: true, utmCampaign: true, referrer: true, visitorId: true, deliveredAt: true, totalMinor: true },
  });
  const orderIds = orders.map((o) => o.id);
  const visitorIds = [...new Set(orders.map((o) => o.visitorId).filter((v): v is string => !!v))];
  const none = Promise.resolve([] as never[]);
  const [visits, touches, exchanges, messages, chats, reviews, wallet, consent, merges, notes] = await Promise.all([
    on.has('visit')
      ? deps.db.analyticsEvent.groupBy({
          by: ['sessionId'],
          where: { storeId: S, sessionId: { not: null }, OR: [{ customerId: { in: ids } }, ...(visitorIds.length ? [{ visitorId: { in: visitorIds } }] : [])] },
          _min: { occurredAt: true },
          _count: { _all: true },
          orderBy: { _min: { occurredAt: 'desc' } },
          take,
        })
      : none,
    on.has('touch') ? deps.db.customerTouchpoint.findMany({ where: { storeId: S, customerId: { in: ids } }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take }) : none,
    on.has('exchange') ? deps.db.exchange.findMany({ where: { storeId: S, OR: [{ customerId: { in: ids } }, ...(orderIds.length ? [{ orderId: { in: orderIds } }] : [])] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { number: true, status: true, createdAt: true, orderId: true } }) : none,
    on.has('message')
      ? deps.db.notificationLog.findMany({ where: { storeId: S, OR: [{ customerId: { in: ids } }, ...(orderIds.length ? [{ orderId: { in: orderIds } }] : [])] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { channel: true, status: true, step: true, createdAt: true, sentAt: true, orderId: true } })
      : none,
    on.has('chat') ? deps.db.conversation.findMany({ where: { storeId: S, customerId: { in: ids } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { id: true, refCode: true, status: true, createdAt: true, channel: { select: { kind: true } } } }) : none,
    on.has('review') ? deps.db.review.findMany({ where: { storeId: S, OR: [{ customerId: { in: ids } }, ...(orderIds.length ? [{ orderId: { in: orderIds } }] : [])] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { rating: true, status: true, createdAt: true, orderId: true } }) : none,
    on.has('wallet') && money ? deps.db.walletEntry.findMany({ where: { storeId: S, wallet: { customerId: { in: ids } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { direction: true, amountMinor: true, reason: true, createdAt: true, orderId: true } }) : none,
    on.has('consent') ? deps.db.consentRecord.findMany({ where: { storeId: S, customerId: { in: ids } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { channel: true, scope: true, granted: true, source: true, createdAt: true } }) : none,
    on.has('merge') ? deps.db.customerMerge.findMany({ where: { storeId: S, OR: [{ survivorId: { in: ids } }, { mergedId: { in: ids } }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { decision: true, createdAt: true, undoneAt: true } }) : none,
    on.has('note') ? deps.db.customerNote.findMany({ where: { storeId: S, customerId: { in: ids }, archivedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { body: true, createdAt: true } }) : none,
  ]);
  const numberOf = new Map(orders.map((o) => [o.id, o.number]));
  const oref = (orderId: string | null) => (orderId ? { type: 'order' as const, id: orderId } : null);
  const rows: JourneyRow[] = [];
  if (on.has('profile'))
    for (const p of profilesOf(f)) rows.push({ kind: 'profile', at: p.createdAt, what: p.id === f.root.id ? 'profile.first' : 'profile.other', data: { source: p.firstSource ?? null, campaign: clip(p.firstCampaignRef) }, ref: null });
  for (const v of visits) rows.push({ kind: 'visit', at: v._min.occurredAt!, what: 'visit', data: { pages: v._count._all }, ref: null });
  for (const x of touches) rows.push({ kind: 'touch', at: x.occurredAt, what: `touch`, data: { kind: clip(x.kind, 40), source: clip(x.source, 40), campaign: clip(x.campaignRef) }, ref: x.refType === 'order' && x.refId ? oref(x.refId) : x.refType === 'conversation' && x.refId ? { type: 'conversation', id: x.refId } : null });
  if (on.has('order'))
    for (const o of orders.slice(0, take)) {
      rows.push({ kind: 'order', at: o.placedAt, what: 'order.placed', data: { number: o.number, source: o.source, campaign: clip(o.utmCampaign), from: clip(o.utmSource, 40), status: o.status, total: money ? o.totalMinor : null }, ref: oref(o.id) });
      if (o.deliveredAt && (o.status === 'DELIVERED' || o.status === 'PARTIALLY_DELIVERED')) rows.push({ kind: 'order', at: o.deliveredAt, what: 'order.delivered', data: { number: o.number }, ref: oref(o.id) });
    }
  for (const x of exchanges) rows.push({ kind: 'exchange', at: x.createdAt, what: 'exchange', data: { number: x.number, status: x.status, order: numberOf.get(x.orderId) ?? null }, ref: oref(x.orderId) });
  for (const m of messages) rows.push({ kind: 'message', at: m.sentAt ?? m.createdAt, what: 'message', data: { channel: m.channel, status: m.status, step: clip(m.step, 40), order: m.orderId ? (numberOf.get(m.orderId) ?? null) : null }, ref: oref(m.orderId) });
  for (const c of chats) rows.push({ kind: 'chat', at: c.createdAt, what: 'chat', data: { channel: c.channel.kind, ref: c.refCode, status: c.status }, ref: { type: 'conversation', id: c.id } });
  for (const r of reviews) rows.push({ kind: 'review', at: r.createdAt, what: 'review', data: { rating: r.rating, status: r.status }, ref: oref(r.orderId) });
  for (const w of wallet) rows.push({ kind: 'wallet', at: w.createdAt, what: w.direction === 'CREDIT' ? 'wallet.credit' : 'wallet.debit', data: { amount: w.amountMinor, reason: clip(w.reason, 40) }, ref: oref(w.orderId) });
  for (const c of consent) rows.push({ kind: 'consent', at: c.createdAt, what: c.granted ? 'consent.yes' : 'consent.no', data: { channel: c.channel, scope: c.scope, source: clip(c.source, 40) }, ref: null });
  for (const m of merges) rows.push({ kind: 'merge', at: m.createdAt, what: m.decision === 'MERGED' ? (m.undoneAt ? 'merge.split' : 'merge.merged') : 'merge.notSame', data: {}, ref: null });
  for (const n of notes) rows.push({ kind: 'note', at: n.createdAt, what: 'note', data: { text: clip(n.body, 140) }, ref: null });
  rows.sort((a, b) => b.at.getTime() - a.at.getTime() || JOURNEY_KINDS.indexOf(a.kind) - JOURNEY_KINDS.indexOf(b.kind));
  const firstWithSource = [...rows].reverse().find((r) => r.data.source || r.data.campaign || r.data.from) ?? null;
  const start = (page - 1) * s.perPage;
  return { enabled: true, kinds: s.kinds, first: firstWithSource, rows: rows.slice(start, start + s.perPage), page, perPage: s.perPage, hasMore: rows.length > start + s.perPage };
}
