// S16 · PR 504 (B3.10 V2, §59 answer 21: "profit per order with ad spend apportioned, by category and by style, e.g. Polo →
// Ralph Lauren polo → Ralph Lauren solid polo, so the owner can decide to restock, buy in bulk or stop a style") — the
// per-order profit (order-profit.ts, the ad-spend share by `costs.allocation` included) split over each delivered order's
// counted lines and added up by category or by style group, each node with everything under it:
//   - a line's Sales: its share of the order's goods (subtotal − order discount) by line totals (as for VAT);
//   - its product cost: its own cost snapshot (unit cost × quantity);
//   - the order's own figures — delivery charge in, courier, payment fees, packaging, messages out — and its ad share,
//     spread over the lines by their Sales share; a part not known yet is left out and counted, never taken as 0.
// An order with a line without a cost snapshot is left out of every profit figure (as on Profit & loss) and its Sales
// counted as "no cost yet" under its groups. Lines with no category / style are under `null`. Read-only, store-scoped.
import { Prisma } from '@extas/db/client';
import { basisWhere, type Db } from './metrics';
import { orderProfits, type ProfitInputs } from './order-profit';
import { COUNTED_LINE_STATUS, daysPeriod } from './pure';
import { apportion } from './vat';

export const PROFIT_GROUP_BY = ['category', 'style'] as const;
export type ProfitGroupBy = (typeof PROFIT_GROUP_BY)[number];

export interface GroupProfitRow {
  /** The category or style group; null = lines with none. */
  id: string | null;
  name: string | null;
  parentId: string | null;
  depth: number;
  orders: number;
  pieces: number;
  /** Sales of every delivered line (the Sales figure, M1). */
  salesMinor: number;
  /** Sales of the lines left out of profit for a missing cost. */
  uncostedSalesMinor: number;
  /** Over the costed orders' lines: */
  costedSalesMinor: number;
  productCostMinor: number;
  grossProfitMinor: number;
  /** Delivery charges in less courier, payment fees, packaging and messages out (the known ones). */
  orderCostsMinor: number;
  adsMinor: number;
  profitMinor: number;
  /** Lines whose order missed a part (courier, fee, packaging) or its ad share: the figure is short of it. */
  missingLines: number;
}

export interface GroupProfit {
  from: string;
  to: string;
  by: ProfitGroupBy;
  /** Tree order: top groups by Sales, each followed by the groups under it; `null` (none) last. */
  rows: GroupProfitRow[];
  total: GroupProfitRow;
}

/** One counted line of a delivered order, with its product's group. */
interface GroupLine {
  orderId: string;
  groupId: string | null;
  total: number;
  quantity: number;
  unitCost: number | null;
}

/** The deepest tree walked (a loop never hangs), as in vat.ts. */
const MAX_DEPTH = 32;

const empty = (id: string | null, name: string | null, parentId: string | null, depth: number): GroupProfitRow => ({
  id,
  name,
  parentId,
  depth,
  orders: 0,
  pieces: 0,
  salesMinor: 0,
  uncostedSalesMinor: 0,
  costedSalesMinor: 0,
  productCostMinor: 0,
  grossProfitMinor: 0,
  orderCostsMinor: 0,
  adsMinor: 0,
  profitMinor: 0,
  missingLines: 0,
});

/** Profit by category or style group over the days `from`–`to` (delivered orders, on their delivered day). */
export async function profitByGroup(db: Db, storeId: number, days: { from: string; to: string }, by: ProfitGroupBy, inputs: ProfitInputs): Promise<GroupProfit> {
  const period = daysPeriod(days.from, days.to, inputs.timeZone);
  const delivered = await db.$queryRaw<{ id: string }[]>`SELECT o."id" FROM "Order" o WHERE ${basisWhere('sales', storeId, period)}`;
  const ids = delivered.map((r) => r.id);
  const [profits, lines, nodes] = await Promise.all([
    orderProfits(db, storeId, ids, inputs),
    ids.length
      ? db.$queryRaw<GroupLine[]>`
          SELECT i."orderId", p.${Prisma.raw(by === 'category' ? '"categoryId"' : '"styleGroupId"')} AS "groupId",
                 i."lineTotalMinor" AS "total", i."quantity", i."unitCostMinor" AS "unitCost"
            FROM "OrderItem" i LEFT JOIN "Product" p ON p."id" = i."productId" AND p."storeId" = i."storeId"
           WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}
           ORDER BY i."orderId", i."createdAt", i."id"`
      : Promise.resolve([] as GroupLine[]),
    by === 'category'
      ? db.$queryRaw<{ id: string; parentId: string | null; name: string }[]>`SELECT c."id", c."parentId", c."nameEn" AS "name" FROM "Category" c WHERE c."storeId" = ${storeId}`
      : db.$queryRaw<{ id: string; parentId: string | null; name: string }[]>`SELECT s."id", s."parentId", s."name" FROM "StyleGroup" s WHERE s."storeId" = ${storeId}`,
  ]);
  return build(days, by, profits, lines, nodes);
}

function build(
  days: { from: string; to: string },
  by: ProfitGroupBy,
  profits: Awaited<ReturnType<typeof orderProfits>>,
  lines: readonly GroupLine[],
  nodes: readonly { id: string; parentId: string | null; name: string }[],
): GroupProfit {
  const node = new Map(nodes.map((x) => [x.id, x]));
  const parentOf = (id: string) => {
    const p = node.get(id)?.parentId ?? null;
    return p && node.has(p) ? p : null;
  };
  const rows = new Map<string, GroupProfitRow>();
  const keyOf = (id: string | null) => id ?? '';
  const rowOf = (id: string | null) => {
    const k = keyOf(id);
    let r = rows.get(k);
    if (!r) {
      r = empty(id, id ? (node.get(id)?.name ?? null) : null, id ? parentOf(id) : null, 0);
      rows.set(k, r);
    }
    return r;
  };
  // a line counts in its own group and in every group above it
  const chainOf = (id: string | null): (string | null)[] => {
    if (!id || !node.has(id)) return [null];
    const out: string[] = [];
    for (let at: string | null = id, depth = 0; at && depth < MAX_DEPTH && !out.includes(at); depth += 1, at = parentOf(at)) out.push(at);
    return out;
  };
  const total = empty(null, null, null, 0);
  const linesOf = new Map<string, typeof lines>();
  for (const l of lines) linesOf.set(l.orderId, [...(linesOf.get(l.orderId) ?? []), l]);

  for (const p of profits.values()) {
    const mine = linesOf.get(p.orderId) ?? [];
    if (!mine.length) continue;
    const goods = p.parts.sales.minor ?? 0;
    const sales = apportion(goods, mine.map((l) => Number(l.total)));
    const costed = p.parts.productCost.minor !== null;
    const part = (k: 'deliveryCharge' | 'courier' | 'paymentFees' | 'packaging' | 'messages' | 'ads') => p.parts[k].minor;
    const known = (k: Parameters<typeof part>[0]) => part(k) ?? 0;
    const orderNet = known('deliveryCharge') - known('courier') - known('paymentFees') - known('packaging') - known('messages');
    const missing = (['courier', 'paymentFees', 'packaging'] as const).some((k) => part(k) === null) || (p.parts.ads.state !== 'off' && part('ads') === null);
    const weights = sales.map((s) => Math.max(0, s));
    const netShares = apportion(orderNet, weights);
    const adShares = apportion(known('ads'), weights);
    const seen = new Set<string>();
    mine.forEach((l, k) => {
      const cost = l.unitCost === null ? 0 : Number(l.unitCost) * Number(l.quantity);
      for (const g of [...chainOf(l.groupId).map(rowOf), total]) {
        const gk = g === total ? '*' : keyOf(g.id);
        if (!seen.has(gk)) {
          seen.add(gk);
          g.orders += 1;
        }
        g.pieces += Number(l.quantity);
        g.salesMinor += sales[k]!;
        if (!costed) {
          g.uncostedSalesMinor += sales[k]!;
          continue;
        }
        g.costedSalesMinor += sales[k]!;
        g.productCostMinor += cost;
        g.orderCostsMinor += netShares[k]!;
        g.adsMinor += adShares[k]!;
        if (missing) g.missingLines += 1;
      }
    });
  }
  const finish = (r: GroupProfitRow) => {
    r.grossProfitMinor = r.costedSalesMinor - r.productCostMinor;
    r.profitMinor = r.grossProfitMinor + r.orderCostsMinor - r.adsMinor;
    return r;
  };
  // tree order: children under their parent, each level by Sales (then name); `null` last
  const kids = new Map<string, GroupProfitRow[]>();
  for (const r of rows.values()) {
    if (r.id === null) continue;
    const k = r.parentId ?? '';
    kids.set(k, [...(kids.get(k) ?? []), r]);
  }
  for (const list of kids.values()) list.sort((a, b) => b.salesMinor - a.salesMinor || (a.name ?? '').localeCompare(b.name ?? ''));
  const ordered: GroupProfitRow[] = [];
  const walk = (parent: string, depth: number) => {
    for (const r of kids.get(parent) ?? []) {
      if (ordered.includes(r) || depth > MAX_DEPTH) continue;
      r.depth = depth;
      ordered.push(finish(r));
      walk(r.id!, depth + 1);
    }
  };
  walk('', 0);
  const none = rows.get('');
  if (none) ordered.push(finish(none));
  return { from: days.from, to: days.to, by, rows: ordered, total: finish(total) };
}
