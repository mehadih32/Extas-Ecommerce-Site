// PR 285 — the Customers list (BACKEND-ARCHITECTURE §5.5 CUS-01; demo V12.4 #/admin/customers): one row per person —
// the profile he stays under, with the profiles merged into it counted under him — his orders, Sales (delivered only)
// beside Ordered value from @extas/metrics (CN-022), true deliveries, refusals that were not the shop's fault (SIM-F-044,
// the owner's `risk.history.ourFaultRefusals`), exchanges, last order and whether he takes offers. Never his address.
//
// Views (the owner's `customers.list`): All · New (fewer orders than "Returning") · Returning · VIP (delivered spend at
// or above the owner's own figure; hidden while it is empty, CN-018) · At risk (had a delivery, no order for the owner's
// number of days) · Refused before · Exchanged · No offers (neither SMS nor WhatsApp marketing consent). Each view has
// its count. Search by name, e-mail or any of his numbers (4 digits or more, however written); filter by where he first
// came from or (follow-up 473) by the district of his latest order with a resolved place; sort by last order, newest
// profile, spend, orders or name. A page is the owner's page size, then "More".
//
// PR 534: while the owner's grading is on, each row carries the grade and verified mark its own counts earn.
//
// Reading needs `customers.read`; the numbers are masked without `customers.phone`. The export (PR 299, export.ts) reads
// the same people through `listSql`.
import { Prisma } from '@extas/db/client';
import { gradingOf, historyOptions, markOf, type GradeMark } from '@extas/orders';
import { z } from 'zod';
import { allow, nowOf, parse, setting, type CustomersDeps, type Viewer, type Who } from './context';
import { peopleBaseSql, searchSql, viewWhere } from './people-sql';
import { CUSTOMER_SORTS, CUSTOMER_VIEWS, phoneShown, type CustomerSort, type CustomerView, type PhoneShown } from './pure';
import { segmentFilterSql } from './segments';
import { maskOf } from './view';

/** PR 287: a live saved segment of the store, with its SQL on `b`. */
async function segmentOf(deps: CustomersDeps, storeId: number, id: string): Promise<{ id: string; name: string; sql: Prisma.Sql } | null> {
  const sql = await segmentFilterSql(deps, storeId, id);
  if (!sql) return null;
  const row = await deps.db.segment.findFirst({ where: { id, storeId }, select: { id: true, name: true } });
  return row ? { ...row, sql } : null;
}

const DAY_MS = 86_400_000;

export const listInput = z
  .object({
    view: z.enum(CUSTOMER_VIEWS).optional(),
    q: z.string().trim().max(100).optional(),
    source: z.string().trim().max(60).optional(),
    sort: z.enum(CUSTOMER_SORTS).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    /** PR 904: "Show more" — the list shows this many people from the top (instead of a page at a time). */
    upto: z.coerce.number().int().min(1).max(2000).optional(),
    /** PR 287: only the people of this saved segment (an archived, unreadable or other store's segment: nobody). */
    segment: z.string().trim().max(40).optional(),
    /** Follow-up 473: only the people whose latest order with a resolved place is in this district (a GeoArea id). */
    district: z.union([z.literal(''), z.string().uuid()]).optional(),
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
  /** PR 801: the district and area of his latest order with a resolved place (names in both languages), for the District column. */
  place: { districtEn: string; districtBn: string | null; areaEn: string | null } | null;
  /** PR 534: his grade and verified mark from this row's counts (null while grading is off). */
  mark: GradeMark | null;
}

export interface CustomerList {
  rows: CustomerRow[];
  /** People in each view (with the search and the filter applied); `vip` is absent while the owner's figure is empty. */
  counts: Partial<Record<CustomerView, number>>;
  views: CustomerView[];
  /** The query as read (defaults filled in). */
  query: { view: CustomerView; q: string; source: string; sort: CustomerSort; page: number; segment: string; district: string };
  /** PR 287: the saved segment the list is narrowed to (null: none, or it is not one this store keeps live). */
  segment: { id: string; name: string } | null;
  pageSize: number;
  hasMore: boolean;
  /** Where people first came from, for the filter. */
  sources: string[];
  /** Follow-up 473: the districts the store's orders reached, for the district filter. */
  districts: District[];
  viewer: Viewer;
  /** PR 801: the figures of the prototype's strip and note — new this month (and the same days last month), average spend
   *  of people with a delivery, and the share of all Sales the ten biggest spenders bring. */
  extra: ListExtra;
}

export interface ListExtra {
  newThisMonth: number;
  newLastMonth: number;
  avgSalesMinor: number;
  top10Pct: number;
  /** The service clock (ms) the group pills are worked out against. */
  now: number;
}

/** Follow-up 473: a district of the filter, named in both languages. */
export interface District {
  id: string;
  nameEn: string;
  nameBn: string | null;
}

/** Follow-up 473: SQL on the profile `r` — his latest order with a resolved place is in district `d` (the place, or under it). */
export function districtSql(d: string): Prisma.Sql {
  if (!d) return Prisma.empty;
  return Prisma.sql`AND (
      SELECT (a."id" = ${d}::uuid OR ${d}::uuid = ANY(a."ancestorIds"))
      FROM own JOIN "Order" o ON o."id" = own."id" AND o."archivedAt" IS NULL JOIN "GeoArea" a ON a."id" = o."areaId"
      WHERE own.k = r."id"::text ORDER BY o."placedAt" DESC, o."id" DESC LIMIT 1) IS TRUE`;
}

export interface PeopleRow {
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

/** PR 299: the list's people as SQL, shared by the list and its export — the base rows (search and filter applied), the
 * chosen view's condition (with the saved segment) and the chosen order. */
export async function listSql(deps: CustomersDeps, S: number, d: z.output<typeof listInput>) {
  const [rules, hist] = await Promise.all([setting(deps, S, 'customers.list'), historyOptions(deps, S)]);
  const views = CUSTOMER_VIEWS.filter((v) => v !== 'vip' || rules.vipMinSalesMinor !== null);
  const view: CustomerView = d.view && views.includes(d.view) ? d.view : 'all';
  const sort: CustomerSort = d.sort ?? 'last';
  const q = d.q ?? '';
  const source = d.source ?? '';
  const district = d.district ?? '';
  const riskSince = new Date(nowOf(deps).getTime() - rules.atRiskDays * DAY_MS);
  const ourFault = [...hist.ourFault];

  const base = peopleBaseSql(S, ourFault, Prisma.sql`${searchSql(S, q)} ${source ? Prisma.sql`AND r."firstSource" = ${source}` : Prisma.empty} ${districtSql(district)}`);
  const segmentId = d.segment ?? '';
  const seg = segmentId ? await segmentOf(deps, S, segmentId) : null;
  const segSql = segmentId ? (seg?.sql ?? Prisma.sql`FALSE`) : Prisma.sql`TRUE`;
  const viewSql = (v: CustomerView): Prisma.Sql => Prisma.sql`(${viewWhere(v, rules, riskSince)}) AND (${segSql})`;
  const order = {
    last: Prisma.sql`b.last_at DESC NULLS LAST, b."createdAt" DESC`,
    new: Prisma.sql`b."createdAt" DESC`,
    spend: Prisma.sql`b.sales_value DESC, b.orders DESC`,
    orders: Prisma.sql`b.orders DESC, b.last_at DESC NULLS LAST`,
    name: Prisma.sql`lower(COALESCE(b."name", '')) ASC`,
    refused: Prisma.sql`b.refused DESC, b.orders DESC`,
  }[sort];
  return { rules, views, view, sort, q, source, district, segmentId, seg, base, viewSql, order };
}

/** The list of people, a page at a time (see the file header). */
export async function customerList(deps: CustomersDeps, who: Who, input: unknown = {}): Promise<CustomerList> {
  const viewer = await allow(deps, who, 'customers.read');
  const d = parse(listInput, input, 'list');
  const S = who.storeId;
  const [{ rules, views, view, sort, q, source, district, segmentId, seg, base, viewSql, order }, mask, grading] = await Promise.all([listSql(deps, S, d), maskOf(deps, S), gradingOf(deps, S)]);
  const page = d.page ?? 1;
  const size = d.upto ?? rules.pageSize;

  const now = nowOf(deps);
  const OFFSET_MS = 6 * 3_600_000; // Dhaka is UTC+6 all year
  const local = new Date(now.getTime() + OFFSET_MS);
  const monthStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET_MS);
  const lastStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - OFFSET_MS);
  const lastSame = new Date(Math.min(lastStart.getTime() + (now.getTime() - monthStart.getTime()), monthStart.getTime()));
  const [rows, countRows, sourceRows, districtRows, extraRows] = await Promise.all([
    deps.db.$queryRaw<PeopleRow[]>`${base} SELECT b.* FROM base b WHERE ${viewSql(view)} ORDER BY ${order}, b."id" LIMIT ${size + 1} OFFSET ${(page - 1) * size}`,
    deps.db.$queryRaw<Record<string, bigint>[]>`${base} SELECT ${Prisma.join(
      views.map((v) => Prisma.sql`count(*) FILTER (WHERE ${viewSql(v)}) AS ${Prisma.raw(`"${v}"`)}`),
      ', ',
    )} FROM base b`,
    deps.db.$queryRaw<{ s: string }[]>`SELECT DISTINCT c."firstSource" AS s FROM "Customer" c WHERE c."storeId" = ${S} AND c."mergedIntoId" IS NULL AND c."erasedAt" IS NULL AND c."firstSource" IS NOT NULL ORDER BY 1`,
    deps.db.$queryRaw<District[]>`SELECT DISTINCT d."id"::text AS "id", d."nameEn", d."nameBn" FROM "Order" o JOIN "GeoArea" a ON a."id" = o."areaId"
      JOIN "GeoArea" d ON d."level"::text = 'DISTRICT' AND (d."id" = a."id" OR d."id" = ANY(a."ancestorIds"))
      WHERE o."storeId" = ${S} AND o."archivedAt" IS NULL ORDER BY d."nameEn", 1`,
    deps.db.$queryRaw<Record<string, bigint | number | null>[]>`${base} SELECT
      count(*) FILTER (WHERE b.orders > 0 AND b."createdAt" >= ${monthStart}) AS new_m,
      count(*) FILTER (WHERE b.orders > 0 AND b."createdAt" >= ${lastStart} AND b."createdAt" < ${lastSame}) AS new_lm,
      COALESCE(avg(b.sales_value) FILTER (WHERE b.delivered > 0), 0) AS avg_sales,
      COALESCE(sum(b.sales_value), 0) AS total_sales,
      COALESCE((SELECT sum(x.sales_value) FROM (SELECT sales_value FROM base ORDER BY sales_value DESC LIMIT 10) x), 0) AS top10
      FROM base b`,
  ]);
  const ex = extraRows[0] ?? {};
  const totalSales = num(ex.total_sales);
  const c = countRows[0] ?? {};
  const shown = rows.slice(0, size);
  const placeRows = shown.length
    ? await deps.db.$queryRaw<{ id: string; de: string | null; db: string | null; ae: string | null }[]>`${base} SELECT b."id"::text AS id,
        (SELECT d."nameEn" FROM own JOIN "Order" o ON o."id" = own."id" AND o."archivedAt" IS NULL JOIN "GeoArea" a ON a."id" = o."areaId"
           JOIN "GeoArea" d ON d."level"::text = 'DISTRICT' AND (d."id" = a."id" OR d."id" = ANY(a."ancestorIds"))
           WHERE own.k = b."id"::text ORDER BY o."placedAt" DESC, o."id" DESC LIMIT 1) AS de,
        (SELECT d."nameBn" FROM own JOIN "Order" o ON o."id" = own."id" AND o."archivedAt" IS NULL JOIN "GeoArea" a ON a."id" = o."areaId"
           JOIN "GeoArea" d ON d."level"::text = 'DISTRICT' AND (d."id" = a."id" OR d."id" = ANY(a."ancestorIds"))
           WHERE own.k = b."id"::text ORDER BY o."placedAt" DESC, o."id" DESC LIMIT 1) AS db,
        (SELECT a."nameEn" FROM own JOIN "Order" o ON o."id" = own."id" AND o."archivedAt" IS NULL JOIN "GeoArea" a ON a."id" = o."areaId"
           WHERE own.k = b."id"::text ORDER BY o."placedAt" DESC, o."id" DESC LIMIT 1) AS ae
      FROM base b WHERE b."id" = ANY(${shown.map((r) => r.id)}::uuid[])`
    : [];
  const placeOf = new Map(placeRows.map((r) => [r.id, r.de ? { districtEn: r.de, districtBn: r.db, areaEn: r.ae } : null]));
  return {
    rows: shown.map((r) => ({
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
      place: placeOf.get(r.id) ?? null,
      mark: grading ? markOf(grading, { delivered: num(r.delivered), refused: num(r.refused) }) : null,
    })),
    counts: Object.fromEntries(views.map((v) => [v, num(c[v])])),
    views,
    query: { view, q, source, sort, page, segment: segmentId, district },
    segment: seg ? { id: seg.id, name: seg.name } : null,
    pageSize: size,
    hasMore: rows.length > size,
    sources: sourceRows.map((r) => r.s),
    districts: districtRows.map((r) => ({ id: r.id, nameEn: r.nameEn, nameBn: r.nameBn })),
    viewer,
    extra: {
      newThisMonth: num(ex.new_m),
      newLastMonth: num(ex.new_lm),
      avgSalesMinor: Math.round(Number(ex.avg_sales ?? 0)),
      top10Pct: totalSales > 0 ? (num(ex.top10) / totalSales) * 100 : 0,
      now: now.getTime(),
    },
  };
}
