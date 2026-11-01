// PR 285, 287 — the Customers list's people as SQL, shared by the list (list.ts) and the segments (segments.ts): the base
// rows with each person's figures, the owner's views and the search.
import { Prisma } from '@extas/db/client';
import { customerFiguresSql, customerOrdersSql } from '@extas/metrics';
import { PHONE_SEARCH_MIN_DIGITS, type CustomerView } from './pure';

/**
 * The list's people as one SQL `WITH … base AS (…)`: one row `b` per person (the profile he stays under, never a merged
 * or erased or archived one) with his figures — orders, ordered_value, delivered, sales_value, refused (not the shop's
 * fault), exchanges, last_at, members — and the CTE `own (k, id)`, his orders, for conditions that look inside them
 * (PR 287's segments). `filter` is extra SQL on the profile `r`.
 */
export function peopleBaseSql(S: number, ourFault: readonly string[], filter: Prisma.Sql = Prisma.empty): Prisma.Sql {
  // every live profile under the person it belongs to (a merged profile under its survivor); orders carry E.164
  const people = Prisma.sql`SELECT COALESCE(c."mergedIntoId", c."id")::text AS k, c."id" AS cid, c."phone" AS phone FROM "Customer" c WHERE c."storeId" = ${S} AND c."erasedAt" IS NULL`;
  const refusal = Prisma.sql`COALESCE(
      (SELECT e."reasonCode" FROM "OrderEvent" e WHERE e."storeId" = ${S} AND e."orderId" = o."id" AND e."type" = 'order.returned' AND e."reasonCode" IS NOT NULL ORDER BY e."createdAt" DESC, e."id" DESC LIMIT 1),
      (SELECT r."reasonCode" FROM "ReturnRecord" r WHERE r."storeId" = ${S} AND r."orderId" = o."id" AND r."kind"::text = 'REFUSED_AT_DOOR' AND r."reasonCode" IS NOT NULL ORDER BY r."createdAt" DESC LIMIT 1),
      '')`;
  return Prisma.sql`
    WITH fig AS (${customerFiguresSql(S, people)}),
    own AS (${customerOrdersSql(S, people)}),
    cnt AS (
      SELECT own.k,
             count(*) FILTER (WHERE o."status" = 'RETURNED' AND NOT (${refusal} = ANY(${[...ourFault]}::text[]))) AS refused,
             count(DISTINCT x."id") AS exchanges
      FROM own JOIN "Order" o ON o."id" = own."id" AND o."archivedAt" IS NULL
      LEFT JOIN "Exchange" x ON x."orderId" = o."id" AND x."storeId" = ${S}
      GROUP BY own.k
    ),
    mem AS (SELECT c."mergedIntoId"::text AS k, count(*) AS n FROM "Customer" c WHERE c."storeId" = ${S} AND c."mergedIntoId" IS NOT NULL GROUP BY c."mergedIntoId"),
    base AS (
      SELECT r."id", r."name", r."phone", r."email", r."firstSource", r."createdAt", r."smsMarketingConsent", r."whatsappMarketingConsent", r."codPolicy",
             COALESCE(mem.n, 0) AS members,
             COALESCE(fig.ordered_orders, 0) AS orders, COALESCE(fig.ordered_value, 0) AS ordered_value,
             COALESCE(fig.sales_orders, 0) AS delivered, COALESCE(fig.sales_value, 0) AS sales_value,
             COALESCE(cnt.refused, 0) AS refused, COALESCE(cnt.exchanges, 0) AS exchanges, fig.last_at
      FROM "Customer" r
      LEFT JOIN fig ON fig.k = r."id"::text
      LEFT JOIN cnt ON cnt.k = r."id"::text
      LEFT JOIN mem ON mem.k = r."id"::text
      WHERE r."storeId" = ${S} AND r."mergedIntoId" IS NULL AND r."erasedAt" IS NULL AND r."archivedAt" IS NULL
        ${filter}
    )`;
}

/** One of the owner's views as SQL on a base row `b` (also the built-in segments, PR 287). */
export function viewWhere(v: CustomerView, rules: { returningMinOrders: number; vipMinSalesMinor: number | null }, riskSince: Date): Prisma.Sql {
  switch (v) {
    case 'new':
      return Prisma.sql`b.orders < ${rules.returningMinOrders}`;
    case 'returning':
      return Prisma.sql`b.orders >= ${rules.returningMinOrders}`;
    case 'vip':
      return Prisma.sql`b.sales_value >= ${rules.vipMinSalesMinor ?? 0}`;
    case 'atrisk':
      return Prisma.sql`b.delivered > 0 AND b.last_at < ${riskSince}`;
    case 'refused':
      return Prisma.sql`b.refused > 0`;
    case 'exchanged':
      return Prisma.sql`b.exchanges > 0`;
    case 'nooffers':
      return Prisma.sql`NOT (COALESCE(b."smsMarketingConsent", false) OR COALESCE(b."whatsappMarketingConsent", false))`;
    default:
      return Prisma.sql`TRUE`;
  }
}

/** The search: a name or an e-mail, or (4 digits or more) any number of any of the person's profiles (also PR 620's ERP list). */
export function searchSql(storeId: number, q: string): Prisma.Sql {
  if (!q) return Prisma.empty;
  const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const digits = q.replace(/\D/g, '');
  const byDigits = digits.length >= PHONE_SEARCH_MIN_DIGITS ? Prisma.sql`OR regexp_replace(COALESCE(m."phone", '') || ' ' || COALESCE(m."whatsappNumber", ''), '[^0-9 ]', '', 'g') LIKE ${`%${digits.replace(/^0+/, '')}%`}` : Prisma.empty;
  return Prisma.sql`AND EXISTS (
      SELECT 1 FROM "Customer" m WHERE m."storeId" = ${storeId} AND (m."id" = r."id" OR m."mergedIntoId" = r."id")
        AND (m."name" ILIKE ${like} OR m."email" ILIKE ${like} ${byDigits}))`;
}
