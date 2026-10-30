// PR 620 (CN-028, docs/erp/site-changes-v6.md §2.7) — the ERP's live "Customers" list (GET /erp-api/customers). The ERP
// asks only when the owner clicks, shows the page and forgets it; the shop never pushes a customer list anywhere. One row
// per person who placed an order, as on the Customers list (PR 285): the profile he stays under with the profiles merged
// into it and his guest orders by number (`customerFiguresSql`, the one KPI rule), never an erased or archived profile.
// Per person: his name and number, his address (his default saved address, else his latest saved one, else the address
// of his latest order), the total spent (Sales: delivered orders only, all time), his placed orders, and when he first
// and last ordered. Newest order first; search by name, e-mail or any of his numbers (`searchSql`, the list's own rule).
// The caller (the signed call, apps/web lib/erp-site-api.ts) has already proved which store is asking; nothing here
// reads another store.
import { Prisma, type PrismaClient } from '@extas/db/client';
import { customerFiguresSql } from '@extas/metrics';
import { searchSql } from './list';

export interface ErpCustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  /** Sales (delivered orders, all time), minor units. */
  salesMinor: number;
  /** Placed orders. */
  orders: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}

export interface ErpCustomerPage {
  /** People who match, on every page. */
  total: number;
  rows: ErpCustomerRow[];
}

interface Row {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  sales_value: bigint | number;
  ordered_orders: bigint | number;
  first_at: Date | null;
  last_at: Date | null;
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** One page of the people who ordered, newest order first. */
export async function erpCustomerPage(db: PrismaClient | Prisma.TransactionClient, storeId: number, q: { page: number; pageSize: number; search: string }): Promise<ErpCustomerPage> {
  const S = storeId;
  const people = Prisma.sql`SELECT COALESCE(c."mergedIntoId", c."id")::text AS k, c."id" AS cid, c."phone" AS phone FROM "Customer" c WHERE c."storeId" = ${S} AND c."erasedAt" IS NULL`;
  const address = Prisma.sql`COALESCE(
      (SELECT a."addressLine" FROM "CustomerAddress" a WHERE a."storeId" = ${S} AND a."customerId" = r."id" AND a."archivedAt" IS NULL ORDER BY a."isDefault" DESC, a."updatedAt" DESC, a."id" DESC LIMIT 1),
      (SELECT o."shippingAddressText" FROM "Order" o WHERE o."storeId" = ${S} AND o."customerId" = r."id" AND o."archivedAt" IS NULL AND o."shippingAddressText" IS NOT NULL ORDER BY o."placedAt" DESC, o."id" DESC LIMIT 1))`;
  const inner = Prisma.sql`
    WITH fig AS (${customerFiguresSql(S, people)})
    SELECT r."id"::text AS "id", r."name", r."phone", ${address} AS "address", fig.sales_value, fig.ordered_orders, fig.first_at, fig.last_at
    FROM "Customer" r JOIN fig ON fig.k = r."id"::text
    WHERE r."storeId" = ${S} AND r."mergedIntoId" IS NULL AND r."erasedAt" IS NULL AND r."archivedAt" IS NULL AND fig.ordered_orders > 0
      ${searchSql(S, q.search.trim())}`;
  const [rows, count] = await Promise.all([
    db.$queryRaw<Row[]>`SELECT b.* FROM (${inner}) b ORDER BY b.last_at DESC NULLS LAST, b."id" LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM (${inner}) b`,
  ]);
  return {
    total: num(count[0]?.n),
    rows: rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, address: r.address, salesMinor: num(r.sales_value), orders: num(r.ordered_orders), firstOrderAt: r.first_at, lastOrderAt: r.last_at })),
  };
}
