// S28 · PR 711 (CN-048, admin prototype v5, Couriers › Claims & payouts) — ONE page across every courier: each claim with its
// state, what was claimed, what the courier paid, how old it is and whether it is late, and the money side of each courier
// (what it holds for us, what it has paid on its statements, the payout requests in progress, the claims still to get back).
// READ ONLY. The ledger is PR 673's (`listClaims`' table `CourierClaim`, `claimOutcome`, `deadlineState`) and the cash it holds
// is PR 193's `codPosition`; nothing is calculated twice and no money moves from here (CLAUDE.md rule 6). The steps of a claim
// (sent, settled, rejected) stay PR 673's `moveClaim`, behind `delivery.claims`.
//
// Practice rows: a practice claim shows, and counts, only while practice mode (`practice.enabled`) is on, exactly like a
// practice order (PR 706); off, every list and figure leaves it out. Every figure comes from ONE pass over ONE row set, so no
// claim is counted twice.
import { Prisma } from '@extas/db/client';
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { CLAIM_KINDS, claimOutcome, deadlineState, OPEN_CLAIM_STATES, type ClaimKind, type ClaimOutcome, type ClaimState, type DeadlineState } from './claims';
import { codPosition } from './cod';
import { allow, checkStoreId, nowOf, parse, setting, type PaymentsDeps, type Who } from './context';

export const OVERVIEW_STATUS = ['all', 'open', 'sent', 'won', 'lost'] as const;
export type OverviewStatus = (typeof OVERVIEW_STATUS)[number];
/** How many claims one reading looks at for its figures (a store's claims are far fewer). */
export const OVERVIEW_SCAN = 20_000;
const DAY = 86_400_000;

export const claimsOverviewQuery = z
  .object({
    courierAccountId: z.uuid().optional(),
    status: z.enum(OVERVIEW_STATUS).default('all'),
    kind: z.enum(CLAIM_KINDS).optional(),
    /** The day a claim was raised: from (included) and to (not included). */
    from: z.date().optional(),
    to: z.date().optional(),
    page: z.number().int().min(1).max(10_000).default(1),
  })
  .strict();
export type ClaimsOverviewQuery = z.input<typeof claimsOverviewQuery>;

export interface OverviewClaim {
  id: string;
  kind: ClaimKind;
  status: ClaimState;
  outcome: ClaimOutcome;
  courierAccountId: string;
  courier: string;
  orderId: string;
  orderNumber: string | null;
  consignmentId: string | null;
  claimedMinor: number;
  settledMinor: number | null;
  courierRef: string | null;
  note: string | null;
  deadlineAt: Date | null;
  deadline: DeadlineState;
  createdAt: Date;
  closedAt: Date | null;
  /** Whole days since it was raised (an open claim: until now; a closed one: until it closed). */
  ageDays: number;
  practice: boolean;
}

export interface ClaimLite {
  courierAccountId: string;
  status: ClaimState;
  claimedMinor: number;
  settledMinor: number | null;
  deadlineAt: Date | null;
}

export interface ClaimFigures {
  /** Open and sent: still to get back. */
  open: { count: number; claimedMinor: number };
  sent: { count: number; claimedMinor: number };
  /** Settled with money: what was asked and what the courier paid. */
  won: { count: number; claimedMinor: number; paidMinor: number };
  lost: { count: number; claimedMinor: number };
  /** Still open, past the deadline / within the warning days of it. */
  late: { count: number; claimedMinor: number };
  soon: { count: number; claimedMinor: number };
  byCourier: { courierAccountId: string; claims: number; open: { count: number; claimedMinor: number }; claimedMinor: number; paidMinor: number }[];
}

const zero = () => ({ count: 0, claimedMinor: 0 });

/** The figures of a set of claims, each claim counted once (pure). */
export function claimFigures(rows: readonly ClaimLite[], now: Date, warnDays: number): ClaimFigures {
  const f: ClaimFigures = { open: zero(), sent: zero(), won: { count: 0, claimedMinor: 0, paidMinor: 0 }, lost: zero(), late: zero(), soon: zero(), byCourier: [] };
  const by = new Map<string, ClaimFigures['byCourier'][number]>();
  for (const r of rows) {
    let c = by.get(r.courierAccountId);
    if (!c) by.set(r.courierAccountId, (c = { courierAccountId: r.courierAccountId, claims: 0, open: zero(), claimedMinor: 0, paidMinor: 0 }));
    c.claims += 1;
    c.claimedMinor += r.claimedMinor;
    const out = claimOutcome(r);
    if (out === 'open' || out === 'sent') {
      const bucket = out === 'open' ? f.open : f.sent;
      bucket.count += 1;
      bucket.claimedMinor += r.claimedMinor;
      c.open.count += 1;
      c.open.claimedMinor += r.claimedMinor;
      const dl = deadlineState(r, now, warnDays);
      if (dl === 'late') {
        f.late.count += 1;
        f.late.claimedMinor += r.claimedMinor;
      } else if (dl === 'soon') {
        f.soon.count += 1;
        f.soon.claimedMinor += r.claimedMinor;
      }
    } else if (out === 'won') {
      f.won.count += 1;
      f.won.claimedMinor += r.claimedMinor;
      f.won.paidMinor += r.settledMinor ?? 0;
      c.paidMinor += r.settledMinor ?? 0;
    } else {
      f.lost.count += 1;
      f.lost.claimedMinor += r.claimedMinor;
    }
  }
  f.byCourier = [...by.values()].sort((a, b) => b.open.claimedMinor - a.open.claimedMinor || b.claims - a.claims || a.courierAccountId.localeCompare(b.courierAccountId));
  return f;
}

/** The part of the filter that is a claim's state (pure). */
export function statusWhere(status: OverviewStatus): Prisma.CourierClaimWhereInput {
  switch (status) {
    case 'open':
      return { status: 'OPEN' };
    case 'sent':
      return { status: 'SENT' };
    case 'won':
      return { status: 'SETTLED', settledMinor: { gt: 0 } };
    case 'lost':
      return { OR: [{ status: 'REJECTED' }, { status: 'SETTLED', OR: [{ settledMinor: null }, { settledMinor: 0 }] }] };
    default:
      return {};
  }
}

/** Whole days from `from` to `to` (never negative). */
export const ageInDays = (from: Date, to: Date): number => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));

export interface CourierMoneyRow {
  courierAccountId: string;
  courier: string;
  /** Cash it holds for us (delivered, on no statement yet) and the parcels behind it. */
  holdsMinor: number;
  holdsParcels: number;
  /** Cash still on the road with the riders. */
  onRoadMinor: number;
  /** What its statements paid (net of its charges), in the dates asked. */
  paidMinor: number;
  /** A payout request in progress (asked, not yet paid). */
  requestedMinor: number;
  /** Claims still to get back. */
  claimsMinor: number;
  /** Cash it holds plus claims it still owes: what the courier owes us. */
  owedMinor: number;
}

export interface PayoutLine {
  id: string;
  courierAccountId: string;
  courier: string;
  state: string;
  amountMinor: number;
  coveredMinor: number;
  paidMinor: number | null;
  differenceMinor: number | null;
  requestedAt: Date;
  paidAt: Date | null;
}

export interface MoneySide {
  couriers: CourierMoneyRow[];
  totals: { holdsMinor: number; paidMinor: number; requestedMinor: number; claimsMinor: number; owedMinor: number };
  latest: PayoutLine[];
}

export interface ClaimsOverview {
  rows: OverviewClaim[];
  /** Claims matching the filter, the page and the size of a page. */
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  /** Figures over the courier, kind and date filters (not the state filter), so the chips never change them. */
  figures: ClaimFigures;
  /** Every courier of the store, for the filter and the names. */
  couriers: { id: string; name: string }[];
  terms: { deadlineEnabled: boolean; warnDays: number };
  /** Null for someone without `payments.view`: the money side is not for them. */
  money: MoneySide | null;
  practiceOn: boolean;
  at: Date;
}

const ROW = {
  id: true,
  kind: true,
  status: true,
  courierAccountId: true,
  orderId: true,
  shipmentId: true,
  claimedMinor: true,
  settledMinor: true,
  courierRef: true,
  note: true,
  deadlineAt: true,
  createdAt: true,
  closedAt: true,
  isPractice: true,
} satisfies Prisma.CourierClaimSelect;

async function canSee(deps: PaymentsDeps, who: Who, permission: 'payments.view'): Promise<boolean> {
  try {
    await allow(deps, who, permission);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every claim of every courier, the figures, and the money side of each courier. Seeing the claims needs `delivery.read`;
 * the money side needs `payments.view` too (without it `money` is null). Nothing is written.
 */
export async function claimsOverview(deps: PaymentsDeps, who: Who, query: unknown = {}): Promise<ClaimsOverview> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'delivery.read', { storeId: who.storeId });
  const q = parse(claimsOverviewQuery, query, 'claims overview query');
  const storeId = who.storeId;
  const now = nowOf(deps);
  const [practice, terms, page, accounts] = await Promise.all([
    setting(deps, storeId, 'practice.enabled'),
    setting(deps, storeId, 'delivery.courier.claimTerms'),
    setting(deps, storeId, 'delivery.courier.claimsPage'),
    deps.db.courierAccount.findMany({ where: { storeId }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
  ]);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const base: Prisma.CourierClaimWhereInput = {
    storeId,
    ...(practice.on ? {} : { isPractice: false }),
    ...(q.courierAccountId ? { courierAccountId: q.courierAccountId } : {}),
    ...(q.kind ? { kind: q.kind } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {}),
  };
  const where: Prisma.CourierClaimWhereInput = { AND: [base, statusWhere(q.status)] };
  const [lite, total] = await Promise.all([
    deps.db.courierClaim.findMany({ where: base, select: { courierAccountId: true, status: true, claimedMinor: true, settledMinor: true, deadlineAt: true }, take: OVERVIEW_SCAN, orderBy: { id: 'asc' } }),
    deps.db.courierClaim.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / page.claimRows));
  const at = Math.min(q.page, pages);
  const rows = await deps.db.courierClaim.findMany({ where, select: ROW, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (at - 1) * page.claimRows, take: page.claimRows });
  const orderIds = [...new Set(rows.map((r) => r.orderId))];
  const shipmentIds = rows.map((r) => r.shipmentId).filter((x): x is string => Boolean(x));
  const [orders, parcels] = await Promise.all([
    orderIds.length ? deps.db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } }) : Promise.resolve([]),
    shipmentIds.length ? deps.db.shipment.findMany({ where: { id: { in: shipmentIds } }, select: { id: true, consignmentId: true } }) : Promise.resolve([]),
  ]);
  const orderNo = new Map(orders.map((o) => [o.id, o.number]));
  const consignment = new Map(parcels.map((p) => [p.id, p.consignmentId]));
  const figures = claimFigures(lite as ClaimLite[], now, terms.warnDays);
  const out: OverviewClaim[] = rows.map((r) => {
    const st = r.status as ClaimState;
    return {
      id: r.id,
      kind: r.kind as ClaimKind,
      status: st,
      outcome: claimOutcome({ status: st, settledMinor: r.settledMinor }),
      courierAccountId: r.courierAccountId,
      courier: names.get(r.courierAccountId) ?? '',
      orderId: r.orderId,
      orderNumber: orderNo.get(r.orderId) ?? null,
      consignmentId: r.shipmentId ? (consignment.get(r.shipmentId) ?? null) : null,
      claimedMinor: r.claimedMinor,
      settledMinor: r.settledMinor,
      courierRef: r.courierRef,
      note: r.note,
      deadlineAt: r.deadlineAt,
      deadline: deadlineState({ status: st, deadlineAt: r.deadlineAt }, now, terms.warnDays),
      createdAt: r.createdAt,
      closedAt: r.closedAt,
      ageDays: ageInDays(r.createdAt, (OPEN_CLAIM_STATES as readonly string[]).includes(st) ? now : (r.closedAt ?? now)),
      practice: r.isPractice,
    };
  });
  const money = (await canSee(deps, who, 'payments.view')) ? await moneySide(deps, who, { names, figures, practiceOn: practice.on, q, payoutRows: page.payoutRows }) : null;
  return { rows: out, total, page: at, pages, pageSize: page.claimRows, figures, couriers: accounts.map((a) => ({ id: a.id, name: a.name })), terms: { deadlineEnabled: terms.deadlineEnabled, warnDays: terms.warnDays }, money, practiceOn: practice.on, at: now };
}

async function moneySide(deps: PaymentsDeps, who: Who, o: { names: Map<string, string>; figures: ClaimFigures; practiceOn: boolean; q: z.output<typeof claimsOverviewQuery>; payoutRows: number }): Promise<MoneySide> {
  const storeId = who.storeId;
  const when = (field: 'receivedAt' | 'requestedAt') => (o.q.from || o.q.to ? { [field]: { ...(o.q.from ? { gte: o.q.from } : {}), ...(o.q.to ? { lt: o.q.to } : {}) } } : {});
  const byCourier = o.q.courierAccountId ? { courierAccountId: o.q.courierAccountId } : {};
  const [pos, settlements, open, latest] = await Promise.all([
    codPosition(deps, who),
    deps.db.courierSettlement.groupBy({ by: ['courierAccountId'], where: { storeId, status: 'IMPORTED', ...(o.practiceOn ? {} : { isPractice: false }), ...byCourier, ...when('receivedAt') }, _sum: { netMinor: true } }),
    deps.db.courierPayout.groupBy({ by: ['courierAccountId'], where: { storeId, state: { in: ['REQUESTED', 'PROCESSING'] }, ...byCourier }, _sum: { amountMinor: true } }),
    deps.db.courierPayout.findMany({
      where: { storeId, ...byCourier, ...when('requestedAt') },
      select: { id: true, courierAccountId: true, state: true, amountMinor: true, coveredMinor: true, paidMinor: true, differenceMinor: true, requestedAt: true, paidAt: true },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: o.payoutRows,
    }),
  ]);
  const position = new Map(pos.couriers.map((c) => [c.courierAccountId, c]));
  const paid = new Map(settlements.map((s) => [s.courierAccountId, s._sum.netMinor ?? 0]));
  const requested = new Map(open.map((s) => [s.courierAccountId, s._sum.amountMinor ?? 0]));
  const claims = new Map(o.figures.byCourier.map((c) => [c.courierAccountId, c.open.claimedMinor]));
  const ids = o.q.courierAccountId ? [o.q.courierAccountId] : [...o.names.keys()];
  const couriers: CourierMoneyRow[] = ids
    .map((id) => {
      const p = position.get(id);
      const holdsMinor = p?.withCourierMinor ?? 0;
      const claimsMinor = claims.get(id) ?? 0;
      return { courierAccountId: id, courier: o.names.get(id) ?? '', holdsMinor, holdsParcels: p?.withCourierParcels ?? 0, onRoadMinor: p?.onTheRoadMinor ?? 0, paidMinor: paid.get(id) ?? 0, requestedMinor: requested.get(id) ?? 0, claimsMinor, owedMinor: holdsMinor + claimsMinor };
    })
    .filter((c) => c.holdsMinor || c.onRoadMinor || c.paidMinor || c.requestedMinor || c.claimsMinor)
    .sort((a, b) => b.owedMinor - a.owedMinor || a.courier.localeCompare(b.courier));
  const sum = (f: (c: CourierMoneyRow) => number) => couriers.reduce((s, c) => s + f(c), 0);
  return {
    couriers,
    totals: { holdsMinor: sum((c) => c.holdsMinor), paidMinor: sum((c) => c.paidMinor), requestedMinor: sum((c) => c.requestedMinor), claimsMinor: sum((c) => c.claimsMinor), owedMinor: sum((c) => c.owedMinor) },
    latest: latest.map((p) => ({ ...p, courier: o.names.get(p.courierAccountId) ?? '' })),
  };
}
