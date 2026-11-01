// S14 · PR 296 — rewards and points with the rules the owner sets (register PR 296; SIM-F-032: points never given; demo
// 97u-adm2-customers.js CUS-04 "Loyalty & wallet"). Off as shipped (`customers.points`, every number 0).
//
// - `pointsFor` / `redeemableOf`: the owner's rule in numbers — points per ৳100 of the goods (subtotal less discount;
//   the delivery charge never counts) plus a fixed number per order; and how many whole blocks of `redeemPoints` a
//   balance holds, each worth `redeemMinor` of wallet credit.
// - `runPoints`: one store's run (the jobs worker, hourly): every order DELIVERED at least `holdDays` ago (the exchange
//   window) and at most `lookbackDays` ago, with a customer who is not erased and no points yet, earns once — one
//   RewardEntry with the key `order:<id>`, so a second run, or two runs at once, give nothing more.
// - `pointsOf`: a customer's balance, his rule and what he can turn in now, with his newest entries (My account ›
//   Rewards).
// - `redeemPoints`: the customer himself turns every whole block into wallet credit at the owner's rate, in one
//   transaction: the wallet entry (reason POINTS, through @extas/payments `postWalletEntry`, the ledger's one writer)
//   and the points entry that names it; his own key makes a double press one redemption. Only while the owner has set
//   both numbers. Audited as the customer.
// - `loyaltyScreen` (`customers.read`): Customers › Loyalty & wallet — the store's points and, for a person holding
//   `payments.view`, the wallet ledger's newest lines; the setting card.
// Points are not money (the ledger is append-only and locked at the database, migration 0010 / 0143). No points are
// ever taken back by a job: a correction of a mistake is the owner's (a later PR's manual entry).
import { Prisma } from '@extas/db/client';
import { postWalletEntry } from '@extas/payments';
import type { PointsSettings } from '@extas/settings';
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { allow, nowOf, parse, setting, TX, type CustomersDeps, type Db, type Tx, type Who } from './context';
import { CustomersError } from './errors';

const DAY = 86_400_000;

/** Why a points entry was written (`RewardEntry.reason`). */
export const POINTS_REASONS = { order: 'ORDER_DELIVERED', redeem: 'REDEEMED' } as const;

/** The wallet reason of a redemption (@extas/payments WALLET_REASONS). */
export const POINTS_WALLET_REASON = 'POINTS' as const;

/** The points an order's goods earn by the owner's rule (whole points, rounded down). */
export function pointsFor(rule: Pick<PointsSettings, 'pointsPer100' | 'orderPoints'>, goodsMinor: number): number {
  const goods = Math.max(0, Math.trunc(goodsMinor));
  return Math.floor((goods * rule.pointsPer100) / 10_000) + rule.orderPoints;
}

/** Whether the owner's rule gives any points at all. */
export const earns = (rule: PointsSettings): boolean => rule.enabled && (rule.pointsPer100 > 0 || rule.orderPoints > 0);

/** Whether points can become wallet credit: both of the owner's numbers set. */
export const redeems = (rule: PointsSettings): boolean => rule.enabled && rule.redeemPoints > 0 && rule.redeemMinor > 0;

/** How many whole blocks a balance holds, the points they take and the credit they make. */
export function redeemableOf(rule: PointsSettings, balance: number): { blocks: number; points: number; minor: number } {
  if (!redeems(rule) || balance < rule.redeemPoints) return { blocks: 0, points: 0, minor: 0 };
  const blocks = Math.floor(balance / rule.redeemPoints);
  return { blocks, points: blocks * rule.redeemPoints, minor: blocks * rule.redeemMinor };
}

/** The customer's points after his newest entry (0 before any). */
export async function balanceOf(db: Db, storeId: number, customerId: string): Promise<number> {
  const last = await db.rewardEntry.findFirst({ where: { storeId, customerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { pointsAfter: true } });
  return last?.pointsAfter ?? 0;
}

/** One entry under the customer's row lock, so the running balance stays right when two writers meet. */
async function addEntry(tx: Tx, e: { storeId: number; customerId: string; points: number; reason: string; key: string; orderId?: string | null; walletEntryId?: string | null; at: Date }) {
  await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${e.customerId}::uuid FOR UPDATE`;
  const before = await balanceOf(tx, e.storeId, e.customerId);
  return tx.rewardEntry.create({
    data: { storeId: e.storeId, customerId: e.customerId, points: e.points, pointsAfter: before + e.points, reason: e.reason, orderId: e.orderId ?? null, idempotencyKey: e.key, walletEntryId: e.walletEntryId ?? null, createdAt: e.at },
    select: { id: true, pointsAfter: true },
  });
}

const isDuplicate = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export interface PointsRunResult {
  /** Orders that earned points in this run. */
  given: number;
  /** Their points together. */
  points: number;
}

/** One store's points run (see the file header); null while the owner's rule gives nothing. */
export async function runPoints(deps: CustomersDeps, storeId: number): Promise<PointsRunResult | null> {
  const rule = await setting(deps, storeId, 'customers.points');
  if (!earns(rule)) return null;
  const now = nowOf(deps);
  const latest = new Date(now.getTime() - rule.holdDays * DAY);
  const earliest = new Date(now.getTime() - rule.lookbackDays * DAY);
  const due = await deps.db.$queryRaw<{ id: string; customerId: string; subtotalMinor: number; discountMinor: number }[]>`
    SELECT o."id"::text AS id, o."customerId"::text AS "customerId", o."subtotalMinor", o."discountMinor"
    FROM "Order" o JOIN "Customer" c ON c."id" = o."customerId"
    WHERE o."storeId" = ${storeId} AND o."status" = 'DELIVERED' AND o."archivedAt" IS NULL
      AND o."deliveredAt" >= ${earliest} AND o."deliveredAt" <= ${latest} AND c."erasedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "RewardEntry" r WHERE r."customerId" = o."customerId" AND r."idempotencyKey" = 'order:' || o."id"::text)
    ORDER BY o."deliveredAt" ASC, o."id" ASC
    LIMIT ${rule.batchSize}`;
  const out: PointsRunResult = { given: 0, points: 0 };
  for (const o of due) {
    const points = pointsFor(rule, o.subtotalMinor - o.discountMinor);
    if (points <= 0) continue;
    try {
      await deps.db.$transaction((tx) => addEntry(tx, { storeId, customerId: o.customerId, points, reason: POINTS_REASONS.order, key: `order:${o.id}`, orderId: o.id, at: now }), TX);
      out.given += 1;
      out.points += points;
    } catch (e) {
      if (!isDuplicate(e)) throw e; // another run gave this order its points a moment ago
    }
  }
  return out;
}

export interface PointsEntryView {
  id: string;
  points: number;
  pointsAfter: number;
  reason: string;
  orderNumber: string | null;
  at: Date;
}

export interface MyPoints {
  /** The owner's points are on and give something. */
  enabled: boolean;
  balance: number;
  rule: Pick<PointsSettings, 'pointsPer100' | 'orderPoints' | 'holdDays' | 'redeemPoints' | 'redeemMinor'>;
  /** Points can become credit at all (both numbers set). */
  canRedeem: boolean;
  redeemable: { blocks: number; points: number; minor: number };
  entries: PointsEntryView[];
}

async function entriesOf(db: Db, where: Prisma.RewardEntryWhereInput, take: number): Promise<(PointsEntryView & { customerId: string })[]> {
  const rows = await db.rewardEntry.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { id: true, customerId: true, points: true, pointsAfter: true, reason: true, orderId: true, createdAt: true } });
  const ids = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x))];
  const numbers = new Map((ids.length ? await db.order.findMany({ where: { id: { in: ids } }, select: { id: true, number: true } }) : []).map((o) => [o.id, o.number]));
  return rows.map((r) => ({ id: r.id, customerId: r.customerId, points: r.points, pointsAfter: r.pointsAfter, reason: r.reason, orderNumber: r.orderId ? (numbers.get(r.orderId) ?? null) : null, at: r.createdAt }));
}

/** The signed-in customer's points (My account › Rewards). */
export async function pointsOf(deps: CustomersDeps, storeId: number, customerId: string, opts: { take?: number } = {}): Promise<MyPoints> {
  const rule = await setting(deps, storeId, 'customers.points');
  const balance = await balanceOf(deps.db, storeId, customerId);
  const entries = await entriesOf(deps.db, { storeId, customerId }, Math.min(Math.max(1, opts.take ?? 10), 50));
  return {
    enabled: earns(rule),
    balance,
    rule: { pointsPer100: rule.pointsPer100, orderPoints: rule.orderPoints, holdDays: rule.holdDays, redeemPoints: rule.redeemPoints, redeemMinor: rule.redeemMinor },
    canRedeem: redeems(rule),
    redeemable: redeemableOf(rule, balance),
    entries: entries.map(({ customerId: _c, ...e }) => e),
  };
}

const redeemInput = z.object({ key: z.string().trim().min(8).max(80) }).strict();

export interface RedeemResult {
  points: number;
  creditMinor: number;
  walletEntryId: string;
  balance: number;
  /** The same key was used before: this is that redemption. */
  replay: boolean;
}

/** The customer turns every whole block of his points into wallet credit (see the file header). */
export async function redeemPoints(deps: CustomersDeps, me: { storeId: number; customerId: string; ip?: string | null; userAgent?: string | null }, input: unknown): Promise<RedeemResult> {
  const d = parse(redeemInput, input, 'redemption');
  const rule = await setting(deps, me.storeId, 'customers.points');
  if (!redeems(rule)) throw new CustomersError('SWITCHED_OFF', 'points cannot be turned into credit (customers.points)');
  const key = `redeem:${d.key}`;
  const at = nowOf(deps);
  const run = () =>
    deps.db.$transaction(async (tx) => {
      // the lock first, so a second press with the same key waits and then finds the first one's entry
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${me.customerId}::uuid FOR UPDATE`;
      const same = await tx.rewardEntry.findUnique({ where: { customerId_idempotencyKey: { customerId: me.customerId, idempotencyKey: key } }, select: { points: true, pointsAfter: true, walletEntryId: true, storeId: true } });
      if (same && same.storeId === me.storeId && same.walletEntryId) {
        const w = await tx.walletEntry.findUnique({ where: { id: same.walletEntryId }, select: { amountMinor: true } });
        return { points: -same.points, creditMinor: w?.amountMinor ?? 0, walletEntryId: same.walletEntryId, balance: same.pointsAfter, replay: true };
      }
      const c = await tx.customer.findFirst({ where: { id: me.customerId, storeId: me.storeId, erasedAt: null }, select: { id: true } });
      if (!c) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
      const r = redeemableOf(rule, await balanceOf(tx, me.storeId, me.customerId));
      if (r.blocks === 0) throw new CustomersError('NOT_ENOUGH_POINTS', 'not enough points for one block', [], { redeemPoints: rule.redeemPoints });
      const w = await postWalletEntry(tx, { storeId: me.storeId, customerId: me.customerId, direction: 'CREDIT', amountMinor: r.minor, reason: POINTS_WALLET_REASON, idempotencyKey: `points:${d.key}`, note: `${r.points} points` });
      const e = await addEntry(tx, { storeId: me.storeId, customerId: me.customerId, points: -r.points, reason: POINTS_REASONS.redeem, key, walletEntryId: w.entryId, at });
      await tx.auditLog.create({
        data: {
          storeId: me.storeId,
          actorType: 'CUSTOMER',
          actorId: me.customerId,
          action: 'customer.points.redeem',
          entityType: 'RewardEntry',
          entityId: e.id,
          after: { points: r.points, creditMinor: r.minor, walletEntryId: w.entryId, rate: { redeemPoints: rule.redeemPoints, redeemMinor: rule.redeemMinor } },
          ip: me.ip ? me.ip.slice(0, 64) : null,
          userAgent: me.userAgent ? me.userAgent.slice(0, 512) : null,
          source: 'shop',
        },
      });
      return { points: r.points, creditMinor: r.minor, walletEntryId: w.entryId, balance: e.pointsAfter, replay: false };
    }, TX);
  try {
    return await run();
  } catch (e) {
    if (isDuplicate(e)) return run(); // a second press at the same moment finds the first
    throw e;
  }
}

export interface WalletLine {
  id: string;
  customerId: string;
  customerName: string | null;
  direction: 'CREDIT' | 'DEBIT';
  amountMinor: number;
  reason: string;
  orderNumber: string | null;
  at: Date;
}

export interface LoyaltyScreen {
  points: PointsSettings;
  /** The late-delivery apology credit's switch (Money › Wallet, `payments.wallet.apology`). */
  apologyOn: boolean;
  kpis: { members: number; given: number; redeemed: number; days: number; walletMinor: number | null; walletLines: number | null };
  pointsLines: (PointsEntryView & { customerId: string; customerName: string | null })[];
  /** null without `payments.view`. */
  walletLines: WalletLine[] | null;
  /** The points card saves with `customers.settings` and `settings.write` (a money rate). */
  canWrite: boolean;
}

/** Customers › Loyalty & wallet (`customers.read`; the wallet's lines also need `payments.view`). */
export async function loyaltyScreen(deps: CustomersDeps, who: Who, opts: { days?: number; take?: number } = {}): Promise<LoyaltyScreen> {
  await allow(deps, who, 'customers.read');
  const held = await requirePermission(deps.db, who.actor, 'customers.read', { storeId: who.storeId });
  const S = who.storeId;
  const days = Math.min(Math.max(1, Math.trunc(opts.days ?? 30)), 366);
  const take = Math.min(Math.max(1, Math.trunc(opts.take ?? 20)), 100);
  const since = new Date(nowOf(deps).getTime() - days * DAY);
  const [points, apology, members, sums, lines] = await Promise.all([
    setting(deps, S, 'customers.points'),
    setting(deps, S, 'payments.wallet.apology'),
    deps.db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (
        SELECT DISTINCT ON ("customerId") "pointsAfter" FROM "RewardEntry" WHERE "storeId" = ${S}
        ORDER BY "customerId", "createdAt" DESC, "id" DESC) last WHERE last."pointsAfter" > 0`,
    deps.db.$queryRaw<{ given: number; redeemed: number }[]>`
      SELECT coalesce(sum("points") FILTER (WHERE "points" > 0), 0)::int AS given, coalesce(-sum("points") FILTER (WHERE "points" < 0), 0)::int AS redeemed
      FROM "RewardEntry" WHERE "storeId" = ${S} AND "createdAt" >= ${since}`,
    entriesOf(deps.db, { storeId: S }, take),
  ]);
  const wallet = held.has('payments.view');
  const [walletSum, walletCount, walletRows] = wallet
    ? await Promise.all([
        deps.db.walletAccount.aggregate({ where: { storeId: S }, _sum: { balanceMinor: true } }),
        deps.db.walletEntry.count({ where: { storeId: S, createdAt: { gte: since } } }),
        deps.db.walletEntry.findMany({ where: { storeId: S }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { id: true, direction: true, amountMinor: true, reason: true, orderId: true, createdAt: true, wallet: { select: { customerId: true } } } }),
      ])
    : [null, null, null];
  const customerIds = [...new Set([...lines.map((l) => l.customerId), ...(walletRows ?? []).map((w) => w.wallet.customerId)])];
  const names = new Map((customerIds.length ? await deps.db.customer.findMany({ where: { storeId: S, id: { in: customerIds } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c.name]));
  const orderIds = [...new Set((walletRows ?? []).map((w) => w.orderId).filter((x): x is string => !!x))];
  const numbers = new Map((orderIds.length ? await deps.db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } }) : []).map((o) => [o.id, o.number]));
  return {
    points,
    apologyOn: apology.enabled,
    kpis: { members: members[0]?.n ?? 0, given: sums[0]?.given ?? 0, redeemed: sums[0]?.redeemed ?? 0, days, walletMinor: walletSum ? (walletSum._sum.balanceMinor ?? 0) : null, walletLines: walletCount },
    pointsLines: lines.map((l) => ({ ...l, customerName: names.get(l.customerId) ?? null })),
    walletLines: walletRows
      ? walletRows.map((w) => ({ id: w.id, customerId: w.wallet.customerId, customerName: names.get(w.wallet.customerId) ?? null, direction: w.direction, amountMinor: w.amountMinor, reason: w.reason, orderNumber: w.orderId ? (numbers.get(w.orderId) ?? null) : null, at: w.createdAt }))
      : null,
    canWrite: held.has('customers.settings') && held.has('settings.write'),
  };
}
