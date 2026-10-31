// S16 · PR 343 (B3.9; BACKEND-ARCHITECTURE §5 MNY-06) — Money → Cost ledger (`/admin/money/cost-ledger`) and its API.
// Every paid call writes a CostEntry (messages: packages/messages/src/costs.ts; the daily cost lines of PR 618 and the
// return losses are cost rows too). This reads them for one store: today, this month and this year in the store's own
// time zone, by service; the latest rows (`costs.ledger.recentRows`); the prepaid balances (SMS credit …) with their
// low mark and last top-up; and a CSV export of a period (at most `costs.ledger.exportMaxRows` rows, cut and said so).
//
// `path` is what comes after /api/admin/money/cost-ledger:
//   GET   ''          ?from=YYYY-MM-DD&to=YYYY-MM-DD   the period's rows as a CSV file (`books.read`)
//   POST  'top-up'    {service, amountMinor, credits?, note?, requestKey}   record a top-up the shop already paid for:
//                     the balance goes up (`costs.write`; audited `costs.topUp`; the same request key twice writes once)
//   PUT   'low-mark'  {service, lowMinor|null}   the balance below which the page warns (`costs.write`; audited)
// Records only: nothing here pays anyone, buys credit or moves money.
import { z } from 'zod';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma, type PrismaClient } from '@extas/db/client';
import { dayStart, nextDay, ymdIn } from '@extas/metrics';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

type Db = Pick<PrismaClient, 'costEntry' | 'prepaidBalance'>;

/** The services a prepaid balance can be kept for (the paid calls that draw it down). */
export const PREPAID_SERVICES = ['SMS', 'WHATSAPP', 'EMAIL', 'AI'] as const;
export const LEDGER_PERIODS = ['today', 'month', 'year'] as const;
export type LedgerPeriod = (typeof LEDGER_PERIODS)[number];
/** The audit entity of a top-up request: its id is the form's request key (a double tap writes once). */
const TOP_UP_REQUEST = 'PrepaidTopUpRequest';

/** Where today, this month and this year start in the store's time zone. */
export function periodStarts(now: Date, timeZone: string): Record<LedgerPeriod, Date> {
  const day = ymdIn(now, timeZone);
  return { today: dayStart(day, timeZone), month: dayStart(`${day.slice(0, 7)}-01`, timeZone), year: dayStart(`${day.slice(0, 4)}-01-01`, timeZone) };
}

export interface LedgerRow {
  id: string;
  service: string;
  module: string | null;
  amountMinor: number;
  currency: string;
  refType: string | null;
  refId: string | null;
  detail: string | null;
  source: string;
  occurredAt: Date;
}

export interface CostLedgerView {
  at: string;
  periods: { key: LedgerPeriod; from: string; minor: number; count: number; byService: { service: string; minor: number; count: number }[] }[];
  recent: LedgerRow[];
  recentLimit: number;
  more: boolean;
  prepaid: { service: string; balanceMinor: number; lowMinor: number | null; low: boolean; lastTopUp: { amountMinor: number; credits: number | null; at: string } | null }[];
}

const ROW_SELECT = { id: true, service: true, module: true, amountMinor: true, currency: true, refType: true, refId: true, detail: true, source: true, occurredAt: true } as const;

/** The ledger of one store now. */
export async function costLedger(db: Db, storeId: number, timeZone: string, recentRows: number, now = new Date()): Promise<CostLedgerView> {
  const starts = periodStarts(now, timeZone);
  const [groups, recent, balances] = await Promise.all([
    Promise.all(LEDGER_PERIODS.map((key) => db.costEntry.groupBy({ by: ['service'], where: { storeId, occurredAt: { gte: starts[key], lte: now } }, _sum: { amountMinor: true }, _count: { _all: true } }))),
    db.costEntry.findMany({ where: { storeId }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: recentRows + 1, select: ROW_SELECT }),
    db.prepaidBalance.findMany({ where: { storeId }, orderBy: { service: 'asc' }, select: { service: true, balanceMinor: true, lowThresholdMinor: true, topUps: { orderBy: { createdAt: 'desc' }, take: 1, select: { amountMinor: true, credits: true, createdAt: true } } } }),
  ]);
  return {
    at: now.toISOString(),
    periods: LEDGER_PERIODS.map((key, i) => {
      const byService = groups[i]!.map((g) => ({ service: g.service, minor: g._sum.amountMinor ?? 0, count: g._count._all })).sort((a, b) => b.minor - a.minor || a.service.localeCompare(b.service));
      return { key, from: starts[key].toISOString(), minor: byService.reduce((s, x) => s + x.minor, 0), count: byService.reduce((s, x) => s + x.count, 0), byService };
    }),
    recent: recent.slice(0, recentRows),
    recentLimit: recentRows,
    more: recent.length > recentRows,
    prepaid: balances.map((b) => ({
      service: b.service,
      balanceMinor: b.balanceMinor,
      lowMinor: b.lowThresholdMinor,
      low: b.lowThresholdMinor !== null && b.balanceMinor < b.lowThresholdMinor,
      lastTopUp: b.topUps[0] ? { amountMinor: b.topUps[0].amountMinor, credits: b.topUps[0].credits, at: b.topUps[0].createdAt.toISOString() } : null,
    })),
  };
}

/** One CSV cell: quoted when it holds a comma, quote or line break; a leading = + - @ is defused for spreadsheets. */
export function csvCell(v: string | number | null): string {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** The rows as a CSV text (amounts in minor units, times in UTC). */
export function ledgerCsv(rows: readonly LedgerRow[], cut: boolean): string {
  const head = ['occurredAt', 'service', 'module', 'amountMinor', 'currency', 'refType', 'refId', 'detail', 'source', 'id'];
  const lines = rows.map((r) => [r.occurredAt.toISOString(), r.service, r.module, r.amountMinor, r.currency, r.refType, r.refId, r.detail, r.source, r.id].map(csvCell).join(','));
  return [head.join(','), ...lines, ...(cut ? [`# cut at ${rows.length} rows (costs.ledger.exportMaxRows): choose a shorter period`] : [])].join('\r\n') + '\r\n';
}

const DAY = z.iso.date();
const requestKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const invalid = (details: string[]) => json({ ok: false, error: 'costs.INVALID_INPUT', details }, { status: 400 });

/** The cost ledger's admin routes (the table above). */
export async function costLedgerRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const where = path.join('/');
  const want = where === '' ? 'GET' : where === 'top-up' ? 'POST' : where === 'low-mark' ? 'PUT' : null;
  if (!want) return fail(404, 'not-found');
  if (m !== want) return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: where === '' ? 'books.read' : 'costs.write', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const at = { storeId };
    if (where === '') {
      const from = DAY.safeParse(url.searchParams.get('from'));
      const to = DAY.safeParse(url.searchParams.get('to'));
      if (!from.success || !to.success || to.data < from.data) return invalid(['from, to: days as YYYY-MM-DD, from not after to']);
      const [timeZone, cfg] = await Promise.all([d.resolver.value('store.timeZone', at), d.resolver.value('costs.ledger', at)]);
      const rows = await d.db.costEntry.findMany({
        where: { storeId, occurredAt: { gte: dayStart(from.data, timeZone), lt: dayStart(nextDay(to.data), timeZone) } },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: cfg.exportMaxRows + 1,
        select: ROW_SELECT,
      });
      const cut = rows.length > cfg.exportMaxRows;
      return new Response(ledgerCsv(rows.slice(0, cfg.exportMaxRows), cut), {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="cost-ledger-${from.data}-${to.data}.csv"`, 'cache-control': 'no-store' },
      });
    }
    const b = await body(request);
    const service = PREPAID_SERVICES.find((s) => s === b.service);
    if (!service) return invalid([`service: ${PREPAID_SERVICES.join(', ')}`]);
    const maxLine = await d.resolver.value('books.costs.maxLineMinor', at);
    if (where === 'low-mark') {
      const low = b.lowMinor === null ? null : z.int().min(0).max(maxLine).safeParse(b.lowMinor);
      if (low !== null && !low.success) return invalid([`lowMinor: a whole number of minor units 0–${maxLine}, or null`]);
      const lowMinor = low === null ? null : low.data;
      const before = await d.db.prepaidBalance.findUnique({ where: { storeId_service: { storeId, service } }, select: { lowThresholdMinor: true } });
      await d.db.prepaidBalance.upsert({ where: { storeId_service: { storeId, service } }, create: { storeId, service, lowThresholdMinor: lowMinor }, update: { lowThresholdMinor: lowMinor } });
      if ((before?.lowThresholdMinor ?? null) !== lowMinor)
        await audit(d.db, g.actor, { storeId, action: 'costs.lowMark', entityType: 'PrepaidBalance', entityId: service, before: { lowMinor: before?.lowThresholdMinor ?? null }, after: { lowMinor } }, g.ctx);
      return json({ ok: true, service, lowMinor });
    }
    const input = z
      .object({ amountMinor: z.int().min(1).max(maxLine), credits: z.int().min(1).max(100_000_000).nullish(), note: z.string().trim().max(300).nullish(), requestKey: requestKeySchema })
      .safeParse(b);
    if (!input.success) return invalid(input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    const x = input.data;
    const out = await d.db.$transaction(async (tx: Prisma.TransactionClient) => {
      // one request key at a time; a second press of the same key answers the top-up already written
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${TOP_UP_REQUEST}:${storeId}:${x.requestKey}`}))`;
      const seen = await tx.auditLog.findFirst({ where: { entityType: TOP_UP_REQUEST, entityId: x.requestKey, storeId }, select: { id: true } });
      const bal = await tx.prepaidBalance.upsert({ where: { storeId_service: { storeId, service } }, create: { storeId, service }, update: {}, select: { id: true, balanceMinor: true } });
      if (seen) return { again: true, balanceMinor: bal.balanceMinor };
      const top = await tx.prepaidTopUp.create({ data: { storeId, balanceId: bal.id, amountMinor: x.amountMinor, credits: x.credits ?? null, enteredById: g.actor.staffUserId ?? null }, select: { id: true } });
      const after = await tx.prepaidBalance.update({ where: { id: bal.id }, data: { balanceMinor: { increment: x.amountMinor } }, select: { balanceMinor: true } });
      await audit(
        tx,
        g.actor,
        { storeId, action: 'costs.topUp', entityType: TOP_UP_REQUEST, entityId: x.requestKey, before: { service, balanceMinor: bal.balanceMinor }, after: { service, topUpId: top.id, amountMinor: x.amountMinor, credits: x.credits ?? null, note: x.note || null, balanceMinor: after.balanceMinor } },
        g.ctx,
      );
      return { again: false, balanceMinor: after.balanceMinor };
    });
    return json({ ok: true, service, ...out }, { status: out.again ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
