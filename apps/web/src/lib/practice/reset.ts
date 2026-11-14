// S28 · PR 706 (CN-049) — "Reset practice data": removes every practice record and leaves a clean store. It removes ONLY
// rows flagged `isPractice` (orders, customers, sample products, practice couriers, claims, payouts, incomplete orders)
// and everything that hangs on them (items, payments, parcels, timelines, ...). It KEEPS every product the owner uploaded
// himself (not flagged), and keeps demo products (PR 684, `Product.isDemo`) unless `removeDemo` is ticked.
// How it deletes without knowing every table: it reads the database's own foreign-key list and removes a row's children
// before the row, level by level, so a table added later is handled too. The two append-only history tables (order
// timeline, parcel events) are cleared for practice orders only, through the database function
// `extas_purge_practice_history` (migration 0281); no real order's history can be reached, and a practice flag can never
// be switched on for a real record (trigger). One transaction: it all goes or nothing goes.
import { Prisma, type PrismaClient } from '@extas/db/client';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

/** The tables whose rows carry the practice flag (the roots of the reset), children of each are found from the foreign keys. */
export const PRACTICE_ROOTS = ['Order', 'Customer', 'Shipment', 'Payment', 'CourierSettlement', 'CourierClaim', 'CheckoutDraft', 'CourierAccount', 'Product'] as const;

interface Fk {
  child: string;
  childCol: string;
  parent: string;
  parentCol: string;
  many: boolean;
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const MAX_DEPTH = 12; // hardcode-ok: a guard against a foreign-key loop

async function foreignKeys(tx: Tx): Promise<Fk[]> {
  const rows = await tx.$queryRaw<
    {
      child: string;
      child_col: string;
      parent: string;
      parent_col: string;
      n: number;
    }[]
  >`
    SELECT cl.relname AS child, ca.attname AS child_col, pl.relname AS parent, pa.attname AS parent_col, array_length(c.conkey, 1) AS n
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
      JOIN pg_class pl ON pl.oid = c.confrelid
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.contype = 'f'`;
  const out: Fk[] = [];
  for (const r of rows) {
    out.push({
      child: r.child,
      childCol: r.child_col,
      parent: r.parent,
      parentCol: r.parent_col,
      many: Number(r.n) !== 1,
    });
  }
  return out;
}

/** Removes the rows of `table` matching `where` (a SQL condition on that table), children first. */
async function removeRows(tx: Tx, fks: readonly Fk[], table: string, where: string, depth: number, removed: Map<string, number>): Promise<void> {
  if (depth > MAX_DEPTH) throw new Error(`reset practice: foreign keys go deeper than ${MAX_DEPTH} below ${table}`);
  for (const fk of fks.filter((f) => f.parent === table && f.child !== table)) {
    // a many-column key below a practice row is not handled: stop rather than guess (nothing is removed, the transaction rolls back)
    if (fk.many) throw new Error(`reset practice: ${fk.child} has a many-column foreign key to ${table}`);
    await removeRows(tx, fks, fk.child, `${q(fk.childCol)} IN (SELECT ${q(fk.parentCol)} FROM ${q(table)} WHERE ${where})`, depth + 1, removed);
  }
  const n = await tx.$executeRawUnsafe(`DELETE FROM ${q(table)} WHERE ${where}`);
  if (n) removed.set(table, (removed.get(table) ?? 0) + n);
}

export interface ResetResult {
  removed: Record<string, number>;
  keptProducts: number;
  removedDemoProducts: number;
}

/** Does `Product.isDemo` exist yet (PR 684, branch w4a)? When it does not, there are no demo products to keep or remove. */
async function hasDemoColumn(tx: Tx): Promise<boolean> {
  const r = await tx.$queryRaw<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'isDemo'`;
  return Number(r[0]?.n ?? 0) > 0;
}

export async function resetPractice(db: Db, storeId: number, opts: { removeDemo?: boolean } = {}): Promise<ResetResult> {
  return db.$transaction(
    async (tx) => {
      const removed = new Map<string, number>();
      const fks = await foreignKeys(tx);
      // 1. the history ledgers (append-only) of practice orders: only through the database's own function
      const history = Number((await tx.$queryRaw<{ n: number }[]>`SELECT extas_purge_practice_history(${storeId}::integer) AS n`)[0]?.n ?? 0);
      if (history) removed.set('OrderEvent+ShipmentEvent', history);
      // 2. the practice records and what hangs on them. Children are removed through the foreign keys.
      const where = `"storeId" = ${Math.trunc(storeId)} AND "isPractice" = true`;
      // order of the roots: money and parcels before orders before people before products and couriers
      for (const t of ['CourierClaim', 'CourierSettlement', 'Payment', 'Shipment', 'CheckoutDraft', 'Order', 'Customer', 'CourierAccount'] as const) {
        await removeRows(tx, fks, t, where, 0, removed);
      }
      // 3. demo products only when the owner ticked the box (never a product he uploaded)
      let removedDemo = 0;
      if (opts.removeDemo && (await hasDemoColumn(tx))) {
        const before = removed.get('Product') ?? 0;
        await removeRows(tx, fks, 'Product', `"storeId" = ${Math.trunc(storeId)} AND "isDemo" = true`, 0, removed);
        removedDemo = (removed.get('Product') ?? 0) - before;
      }
      // 4. the practice sample products. Their size-chart links have no foreign key, so they go first, by hand.
      const practiceProducts = (
        await tx.product.findMany({
          where: { storeId, isPractice: true },
          select: { id: true },
        })
      ).map((p) => p.id);
      const links = await tx.sizeChartAssignment.deleteMany({
        where: { storeId, productId: { in: practiceProducts } },
      });
      if (links.count) removed.set('SizeChartAssignment', links.count);
      await removeRows(tx, fks, 'Product', where, 0, removed);
      // 4b. what the sample products brought along, practice-owned by key or name and no longer used by any product
      // (a real colour, size, fabric or chart never carries these marks, and one still in use is left alone)
      const gone = {
        SizeChart: (
          await tx.sizeChart.deleteMany({
            where: {
              storeId,
              name: { endsWith: ' (practice)' },
              assignments: { none: {} },
            },
          })
        ).count,
        Fabric: (
          await tx.fabric.deleteMany({
            where: {
              storeId,
              nameEn: { endsWith: ' (practice)' },
              products: { none: {} },
            },
          })
        ).count,
        Colour: (
          await tx.colour.deleteMany({
            where: {
              storeId,
              key: { startsWith: 'practice-' },
              variants: { none: {} },
              productColours: { none: {} },
            },
          })
        ).count,
        Size: (
          await tx.size.deleteMany({
            where: {
              storeId,
              key: { startsWith: 'practice-' },
              variants: { none: {} },
            },
          })
        ).count,
      };
      for (const [table, n] of Object.entries(gone)) if (n) removed.set(table, n);
      // 4c. the sample pictures (library files in the "practice" folder, no longer placed on any product); their sizes go first
      const pics = (await tx.mediaAsset.findMany({ where: { storeId, folder: 'practice', productMedia: { none: {} } }, select: { id: true } })).map((a) => a.id);
      if (pics.length) {
        await tx.mediaRendition.deleteMany({ where: { assetId: { in: pics } } });
        const n = (await tx.mediaAsset.deleteMany({ where: { id: { in: pics } } })).count;
        if (n) removed.set('MediaAsset', n);
      }
      const keptProducts = await tx.product.count({ where: { storeId } });
      return {
        removed: Object.fromEntries(removed),
        keptProducts,
        removedDemoProducts: removedDemo,
      };
    },
    { timeout: 120_000, maxWait: 10_000 }, // hardcode-ok: a transaction time guard
  );
}

/** What a reset would remove: the count of practice rows in each root table (the preview). */
export async function practiceCounts(db: Db, storeId: number): Promise<Record<string, number>> {
  const [orders, customers, incomplete, claims, payouts, products, couriers, shipments] = await Promise.all([
    db.order.count({ where: { storeId, isPractice: true } }),
    db.customer.count({ where: { storeId, isPractice: true } }),
    db.checkoutDraft.count({ where: { storeId, isPractice: true } }),
    db.courierClaim.count({ where: { storeId, isPractice: true } }),
    db.courierSettlement.count({ where: { storeId, isPractice: true } }),
    db.product.count({ where: { storeId, isPractice: true } }),
    db.courierAccount.count({ where: { storeId, isPractice: true } }),
    db.shipment.count({ where: { storeId, isPractice: true } }),
  ]);
  return {
    orders,
    customers,
    incomplete,
    claims,
    payouts,
    products,
    couriers,
    parcels: shipments,
  };
}
