// S14 · PR 299 — the customer export (demo 97u-adm2-customers.js "Export": "Personal data export — logged with your name
// and reason; retention rules apply"). The people the Customers list shows (its view, search, filter, saved segment and
// order, list.ts `listSql`) as one CSV file:
//
// - Off as shipped (`customers.export`); downloading needs `customers.read` and the export's own key `customers.export`,
//   and a reason typed by the person (kept in the audit line).
// - The retention rule always applies (Blueprint B5.6, answer 50, PR 302): a customer who asked to be forgotten (erased)
//   or an archived profile is never in the file; a merged profile is counted under the person he stays under; the
//   address, IP, device and location are never read; the number is written as this person may see it (masked without
//   `customers.phone`), the same as on the screen. The file itself is not kept (the details stay in the database).
// - More people than the owner's `maxRows` are refused with the count, never cut. A cell a spreadsheet would run as a
//   formula gets a leading apostrophe (@extas/catalogue `writeCsv`). Every export is an ExportJob row and an audit line
//   (who, why, which list, how many, with full numbers or not) in one transaction. Nothing is changed by an export.
import { audit, can } from '@extas/auth';
import { formatMoneyCell, writeCsv } from '@extas/catalogue';
import { Prisma } from '@extas/db/client';
import { localTime } from '@extas/orders';
import { z } from 'zod';
import { allow, nowOf, parse, setting, TX, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { listInput, listSql, type PeopleRow } from './list';
import { phoneShown } from './pure';
import { maskOf } from './view';

/** The file's columns, in order (the header row is these keys). Never an address, IP, device or location. */
export const CUSTOMER_EXPORT_COLUMNS = ['name', 'phone', 'email', 'source', 'firstSeen', 'merged', 'orders', 'ordered', 'delivered', 'sales', 'refused', 'exchanges', 'lastOrder', 'smsOffers', 'whatsappOffers'] as const;
export type CustomerExportColumn = (typeof CUSTOMER_EXPORT_COLUMNS)[number];

/** The shortest and longest reason. */
export const EXPORT_REASON = { min: 5, max: 300 } as const;

export const exportInput = listInput
  .omit({ page: true })
  .extend({ reason: z.string().trim().min(EXPORT_REASON.min).max(EXPORT_REASON.max) })
  .strict();

export interface CustomersCsv {
  fileName: string;
  csv: string;
  rows: number;
  /** The numbers are written in full (`customers.phone`). */
  fullPhone: boolean;
  exportId: string;
}

/** Currency digits (BDT and the others the shop takes are 2). */
const digitsOf = (currency: string): number => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
const yesNo = (v: boolean | null) => (v === null ? '' : v ? 1 : 0);

/** Whether the list shows Export: the owner turned it on and the person holds `customers.export` in the store. */
export async function canExport(deps: CustomersDeps, who: Who): Promise<boolean> {
  const [cfg, held] = await Promise.all([setting(deps, who.storeId, 'customers.export'), can(deps.db, who.actor, 'customers.export', { storeId: who.storeId })]);
  return cfg.enabled && held;
}

/** The list's people as one CSV file (see the file header). */
export async function exportCustomers(deps: CustomersDeps, who: Who, input: unknown = {}): Promise<CustomersCsv> {
  await allow(deps, who, 'customers.export');
  const viewer = await allow(deps, who, 'customers.read');
  const d = parse(exportInput, input, 'export');
  const S = who.storeId;
  const [cfg, delimiter, timeZone, currency, mask] = await Promise.all([
    setting(deps, S, 'customers.export'),
    setting(deps, S, 'orders.export.delimiter'),
    setting(deps, S, 'store.timeZone'),
    setting(deps, S, 'store.currency'),
    maskOf(deps, S),
  ]);
  if (!cfg.enabled) throw new CustomersError('SWITCHED_OFF', 'the customer export is switched off', ['customers.export']);
  const l = await listSql(deps, S, d);
  const [c] = await deps.db.$queryRaw<{ n: bigint }[]>`${l.base} SELECT count(*) AS n FROM base b WHERE ${l.viewSql(l.view)}`;
  const count = num(c?.n);
  if (count > cfg.maxRows) throw new CustomersError('EXPORT_TOO_LARGE', `${count} people are more than one file holds (${cfg.maxRows}); narrow the list`, ['maxRows'], { count, maxRows: cfg.maxRows });
  const rows = await deps.db.$queryRaw<PeopleRow[]>`${l.base} SELECT b.* FROM base b WHERE ${l.viewSql(l.view)} ORDER BY ${l.order}, b."id"`;
  const digits = digitsOf(currency);
  const money = (v: bigint | number) => formatMoneyCell(num(v), digits);
  const cells = (r: PeopleRow): Record<CustomerExportColumn, string | number | null> => ({
    name: r.name,
    phone: phoneShown(r.phone, viewer.fullPhone, mask)?.text ?? null,
    email: r.email,
    source: r.firstSource,
    firstSeen: localTime(r.createdAt, timeZone),
    merged: num(r.members),
    orders: num(r.orders),
    ordered: money(r.ordered_value),
    delivered: num(r.delivered),
    sales: money(r.sales_value),
    refused: num(r.refused),
    exchanges: num(r.exchanges),
    lastOrder: localTime(r.last_at, timeZone),
    smsOffers: yesNo(r.smsMarketingConsent),
    whatsappOffers: yesNo(r.whatsappMarketingConsent),
  });
  const csv = writeCsv(
    CUSTOMER_EXPORT_COLUMNS,
    rows.map((r) => {
      const x = cells(r);
      return CUSTOMER_EXPORT_COLUMNS.map((k) => x[k]);
    }),
    delimiter,
  );
  const now = nowOf(deps);
  const filters = { view: l.view, q: l.q || null, source: l.source || null, sort: l.sort, segment: l.segmentId || null };
  const job = await deps.db.$transaction(async (tx) => {
    const j = await tx.exportJob.create({
      data: { storeId: S, kind: 'customers.csv', filters: { ...filters, fullPhone: viewer.fullPhone } as Prisma.InputJsonValue, excludesOwnerData: false, status: 'SUCCEEDED', rowCount: rows.length, requestedById: who.actor.staffUserId ?? null, finishedAt: now },
      select: { id: true },
    });
    await audit(tx, who.actor, { storeId: S, action: 'customers.export', entityType: 'ExportJob', entityId: j.id, before: null, after: { rows: rows.length, fullPhone: viewer.fullPhone, reason: d.reason, filters } }, who.ctx);
    return j;
  }, TX);
  return { fileName: `customers-${localTime(now, timeZone).slice(0, 10)}.csv`, csv, rows: rows.length, fullPhone: viewer.fullPhone, exportId: job.id };
}
