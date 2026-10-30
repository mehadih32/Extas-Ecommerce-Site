// PR 285 — the Customers list (BACKEND-ARCHITECTURE §5.5 CUS-01; demo V12.4 #/admin/customers): one row per person —
// the profile he stays under, with the profiles merged into it counted under him — his orders, Sales (delivered only)
// beside Ordered value from @extas/metrics (CN-022), true deliveries, refusals that were not the shop's fault (SIM-F-044,
// the owner's `risk.history.ourFaultRefusals`), exchanges, last order and whether he takes offers. Never his address.
//
// Views (the owner's `customers.list`): All · New (fewer orders than "Returning") · Returning · VIP (delivered spend at
// or above the owner's own figure; hidden while it is empty, CN-018) · At risk (had a delivery, no order for the owner's
// number of days) · Refused before · Exchanged · No offers (neither SMS nor WhatsApp marketing consent). Each view has
// its count. Search by name, e-mail or any of his numbers (4 digits or more, however written); filter by where he first
// came from; sort by last order, newest profile, spend, orders or name. A page is the owner's page size, then "More".
//
// Reading needs `customers.read`; the numbers are masked without `customers.phone`. Nothing here is exported (PR 299).
import { Prisma } from '@extas/db/client';
import { customerFiguresSql, customerOrdersSql } from '@extas/metrics';
import { historyOptions } from '@extas/orders';
import { z } from 'zod';
import { allow, nowOf, parse, setting, type CustomersDeps, type Viewer, type Who } from './context';
import { CUSTOMER_SORTS, CUSTOMER_VIEWS, PHONE_SEARCH_MIN_DIGITS, phoneShown, type CustomerSort, type CustomerView, type PhoneShown } from './pure';
import { maskOf } from './view';

const DAY_MS = 86_400_000;

export const listInput = z
  .object({
    view: z.enum(CUSTOMER_VIEWS).optional(),
    q: z.string().trim().max(100).optional(),
    source: z.string().trim().max(60).optional(),
    sort: z.enum(CUSTOMER_SORTS).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
  })
  .strict();
export type ListInput = z.input<typeof listInput>;

export interface CustomerRow {
  id: string;
  name: string | null;
  phone: PhoneShown | null;
  email: string | null;
  source: string | null;
  createdAt: Date;
  /** Profiles merged into this one. */
  members: number;
  orders: number;
  orderedMinor: number;
  delivered: number;
  salesMinor: number;
  refused: number;
  exchanges: number;
  lastOrderAt: Date | null;
  consent: { sms: boolean | null; whatsapp: boolean | null };
  codPolicy: string | null;
}

export interface CustomerList {
  rows: CustomerRow[];
  /** People in each view (with the search and the filter applied); `vip` is absent while the owner's figure is empty. */
  counts: Partial<Record<CustomerView, number>>;
  views: CustomerView[];
  /** The query as read (defaults filled in). */
  query: { view: CustomerView; q: string; source: string; sort: CustomerSort; page: number };
  pageSize: number;
  hasMore: boolean;
  /** Where people first came from, for the filter. */
  sources: string[];
  viewer: Viewer;
}

interface Row {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  firstSource: string | null;
  createdAt: Date;
  smsMarketingConsent: boolean | null;
  whatsappMarketingConsent: boolean | null;
  codPolicy: string | null;
  members: bigint | number;
  orders: bigint | number;
  ordered_value: bigint | number;
  delivered: bigint | number;
  sales_value: bigint | number;
  refused: bigint | number;
  exchanges: bigint | number;
  last_at: Date | null;
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** The list of people, a page at a time (see the file header). */
export async function customerList(deps: CustomersDeps, who: Who, input: unknown = {}): Promise<CustomerList> {
  const viewer = await allow(deps, who, 'customers.read');
  const d = parse(listInput, input, 'list');
  const S = who.storeId;
  const [rules, mask, hist] = await Promise.all([setting(deps, S, 'customers.list'), maskOf(deps, S), historyOptions(deps, S)]);
  const views = CUSTOMER_VIEWS.filter((v) => v !== 'vip' || rules.vipMinSalesMinor !== null);
  const view: CustomerView = d.view && views.includes(d.view) ? d.view : 'all';
  const sort: CustomerSort = d.sort ?? 'last';
  const page = d.page ?? 1;
  const q = d.q ?? '';
  const source = d.source ?? '';
  const riskSince = new Date(nowOf(deps).getTime() - rules.atRiskDays * DAY_MS);
  const ourFault = [...hist.ourFault];

  // every live profile under the person it belongs to (a merged profile under its survivor); orders carry E.164
  const people = Prisma.sql`SELECT COALESCE(c."mergedIntoId", c."id")::text AS k, c."id" AS cid, c."phone" AS phone FROM "Customer" c WHERE c."storeId" = ${S} AND c."erasedAt" IS NULL`;
  const refusal = Prisma.sql`COALESCE(
      (SELECT e."reasonCode" FROM "OrderEvent" e WHERE e."storeId" = ${S} AND e."orderId" = o."id" AND e."type" = 'order.returned' AND e."reasonCode" IS NOT NULL ORDER BY e."createdAt" DESC, e."id" DESC LIMIT 1),
      (SELECT r."reasonCode" FROM "ReturnRecord" r WHERE r."storeId" = ${S} AND r."orderId" = o."id" AND r."kind"::text = 'REFUSED_AT_DOOR' AND r."reasonCode" IS NOT NULL ORDER BY r."createdAt" DESC LIMIT 1),
      '')`;
  const base = Prisma.sql`
    WITH fig AS (${customerFiguresSql(S, people)}),
    own AS (${customerOrdersSql(S, people)}),
    cnt AS (
      SELECT own.k,
             count(*) FILTER (WHERE o."status" = 'RETURNED' AND NOT (${refusal} = ANY(${ourFault}::text[]))) AS refused,
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
        ${searchSql(S, q)} ${source ? Prisma.sql`AND r."firstSource" = ${source}` : Prisma.empty}
    )`;

  const viewSql = (v: CustomerView): Prisma.Sql => {
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
  };
  const order = {
    last: Prisma.sql`b.last_at DESC NULLS LAST, b."createdAt" DESC`,
    new: Prisma.sql`b."createdAt" DESC`,
    spend: Prisma.sql`b.sales_value DESC, b.orders DESC`,
    orders: Prisma.sql`b.orders DESC, b.last_at DESC NULLS LAST`,
    name: Prisma.sql`lower(COALESCE(b."name", '')) ASC`,
  }[sort];

  const [rows, countRows, sourceRows] = await Promise.all([
    deps.db.$queryRaw<Row[]>`${base} SELECT b.* FROM base b WHERE ${viewSql(view)} ORDER BY ${order}, b."id" LIMIT ${rules.pageSize + 1} OFFSET ${(page - 1) * rules.pageSize}`,
    deps.db.$queryRaw<Record<string, bigint>[]>`${base} SELECT ${Prisma.join(
      views.map((v) => Prisma.sql`count(*) FILTER (WHERE ${viewSql(v)}) AS ${Prisma.raw(`"${v}"`)}`),
      ', ',
    )} FROM base b`,
    deps.db.$queryRaw<{ s: string }[]>`SELECT DISTINCT c."firstSource" AS s FROM "Customer" c WHERE c."storeId" = ${S} AND c."mergedIntoId" IS NULL AND c."erasedAt" IS NULL AND c."firstSource" IS NOT NULL ORDER BY 1`,
  ]);
  const c = countRows[0] ?? {};
  return {
    rows: rows.slice(0, rules.pageSize).map((r) => ({
      id: r.id,
      name: r.name,
      phone: phoneShown(r.phone, viewer.fullPhone, mask),
      email: r.email,
      source: r.firstSource,
      createdAt: r.createdAt,
      members: num(r.members),
      orders: num(r.orders),
      orderedMinor: num(r.ordered_value),
      delivered: num(r.delivered),
      salesMinor: num(r.sales_value),
      refused: num(r.refused),
      exchanges: num(r.exchanges),
      lastOrderAt: r.last_at,
      consent: { sms: r.smsMarketingConsent, whatsapp: r.whatsappMarketingConsent },
      codPolicy: r.codPolicy,
    })),
    counts: Object.fromEntries(views.map((v) => [v, num(c[v])])),
    views,
    query: { view, q, source, sort, page },
    pageSize: rules.pageSize,
    hasMore: rows.length > rules.pageSize,
    sources: sourceRows.map((r) => r.s),
    viewer,
  };
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
