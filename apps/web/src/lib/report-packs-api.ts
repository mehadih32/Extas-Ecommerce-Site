// S28 · PR 690 (admin prototype v5, Reports › Report packs) — the packs' admin API. Every route signs the person in (guardAdmin,
// `reports.read`, the store in `?storeId=`); @extas/catalogue checks it again.
//
//   GET   /api/admin/reports/packs/<report>?format=pdf|xlsx|csv[&period=last6m|&from=&to=][&lang=bn][&download=1]
//                                                          a pack (monthly, bank, stock, sales) or a single report (figures,
//                                                          products, timing, review) as a PDF on the shop's letterhead, a real
//                                                          Excel workbook (one sheet per part) or a CSV; the period is the pack's
//                                                          own unless `period` or your own dates are given (the bank pack's
//                                                          balances need `books.read` too)
//   GET   /api/admin/reports/packs                         the packs' schedules
//   POST  /api/admin/reports/packs                         {pack, frequency, channels, enabled} saves one schedule (off as shipped)
// Read-only: a pack changes nothing; a schedule only sends the owner a Telegram summary (never a buyer or supplier).
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import * as inv from '@extas/inventory';
import { requirePermission } from '@extas/auth';
import * as cu from '@extas/customers';
import { salesByArea } from '@extas/metrics';
import * as sh from '@extas/shipping';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';
import { libraryScreen, periodOf } from './report-library-api';
import { fileCsv, filePdf, fileXlsx, wordsFor } from './report-files';
import { PACKS, PACK_PRESET, packFile, type PackData, type PackId } from './report-packs';
import { SINGLE_REPORTS, singleFile, type SingleData, type SingleId } from './report-singles';
import { sellableReader } from './shop/sellable';
import { customersDeps } from './customers-api';
import { shippingDeps } from './shipping-api';
import { teamView } from './team-performance';

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The numbers of one pack, from the same functions as the library and Finance. */
export async function packData(admin: AdminDeps, who: inv.Who, pack: PackId, period: Parameters<typeof libraryScreen>[2] = PACK_PRESET[pack]): Promise<PackData> {
  const s = await libraryScreen(admin, who, period);
  const currency = await admin.resolver.value('store.currency', { storeId: who.storeId });
  let accounts: PackData['accounts'] = null;
  if (pack === 'bank') {
    try {
      const book = await inv.cashbookView(await inventoryDeps(admin), who, { limit: 1 }); // hardcode-ok: only the balances are used
      accounts = book.accounts.filter((a) => !a.archived).map((a) => ({ name: a.nameEn, balanceMinor: a.balanceMinor }));
    } catch {
      accounts = null; // no books.read: the pack goes without balances
    }
  }
  const fixed = await inv.profitReport(await inventoryDeps(admin), who.storeId, s.range.from, s.range.to);
  return {
    range: { from: s.range.from, to: s.range.to },
    currency,
    cards: s.cards.map((c) => ({ id: c.id, kind: c.kind, now: c.now })),
    restock: s.restock,
    weekday: s.time.weekday,
    discountMinor: s.time.discountMinor,
    accounts,
    fixedMinor: fixed.fixedMinor,
  };
}

/** The numbers of one single report (the library's own screen for the period; Courier, Areas, Customers and Team read their own report's figures). */
export async function singleData(admin: AdminDeps, who: inv.Who, period: Parameters<typeof libraryScreen>[2], id?: SingleId): Promise<SingleData> {
  const s = await libraryScreen(admin, who, period);
  const at = { storeId: who.storeId };
  const [currency, timeZone] = await Promise.all([admin.resolver.value('store.currency', at), admin.resolver.value('store.timeZone', at)]);
  const out: SingleData = { range: { from: s.range.from, to: s.range.to }, currency, cards: s.cards, restock: s.restock, time: s.time, review: s.review };
  // A report the person may not open (or that is off) stays null: the file then says so, it never fails.
  const allowed = async (perm: 'reports.read' | 'books.read' | 'staff.performance') => requirePermission(admin.db, who.actor, perm, at).then(() => true, () => false);
  const day = 86_400_000; // hardcode-ok: milliseconds in a day
  const from = new Date(`${s.range.from}T00:00:00Z`);
  const to = new Date(new Date(`${s.range.to}T00:00:00Z`).getTime() + day);
  if (id === 'courier' && (await allowed('reports.read'))) {
    const perf = await sh.courierPerformance(await shippingDeps(admin), { actor: who.actor, storeId: who.storeId, ctx: who.ctx }, { from, to, lang: 'en', lateRows: 0 });
    out.courier = perf.byCourier.map((c) => ({ label: c.label, parcels: c.parcels, delivered: c.delivered, successRate: c.successRate, onTimeRate: c.onTimeRate, returned: c.returned, refused: c.refused }));
  }
  if (id === 'areas' && (await allowed('books.read'))) {
    const a = await salesByArea(admin.db, who.storeId, { from: s.range.from, to: s.range.to }, { timeZone, level: 'district' });
    const fig = (x: { delivered: number; salesMinor: number; pieces: number; returned: number; returnRate: number | null }) => ({ delivered: x.delivered, salesMinor: x.salesMinor, pieces: x.pieces, returned: x.returned, returnRate: x.returnRate });
    out.areas = { level: a.level, rows: a.rows.map((r) => ({ name: r.nameEn, parent: r.parentNameEn ?? null, ...fig(r) })), unknown: fig(a.unknown) };
  }
  if (id === 'customers' && (await allowed('reports.read'))) {
    const r = await cu.customerReport(customersDeps(admin), { actor: who.actor, storeId: who.storeId, ctx: who.ctx }, { from, to });
    out.customers = r.totals ? { enabled: true, quietDays: r.quietDays, buyers: r.totals.buyers, newBuyers: r.totals.newBuyers, returning: r.totals.returning, quiet: r.totals.quiet, repeaters: r.totals.repeaters, repeatRate: r.totals.repeatRate } : { enabled: false, quietDays: r.quietDays, buyers: 0, newBuyers: 0, returning: 0, quiet: 0, repeaters: 0, repeatRate: null };
  }
  if (id === 'team' && (await allowed('staff.performance'))) {
    const v = await teamView(admin, who.storeId, 0, (admin.now ?? (() => new Date()))());
    out.team = v.settings.value.enabled ? { from: v.from, to: v.to, rows: v.rows.map((r) => ({ name: r.name, counts: r.counts })) } : null;
  }
  return out;
}

const isFile = (x: string) => (PACKS as readonly string[]).includes(x) || (SINGLE_REPORTS as readonly string[]).includes(x);

async function letterhead(admin: AdminDeps, storeId: number) {
  const v = <K extends Parameters<typeof admin.resolver.value>[0]>(k: K) => admin.resolver.value(k, { storeId });
  const [name, address, phone, timeZone] = await Promise.all([v('store.name'), v('contact.address'), v('contact.phone'), v('store.timeZone')]);
  return { head: { name, address: address ? address.en || null : null, phone: phone ?? null }, timeZone };
}

export async function packsHandler(request: Request, deps: AdminDeps | null, pack?: string): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  if (pack !== undefined && !isFile(pack)) return fail(404, 'NOT_FOUND');
  if (pack !== undefined && m !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  try {
    const who: inv.Who = { actor: g.actor, storeId, ctx: g.ctx };
    const cdep: cat.CatalogueDeps = { db: deps!.db, settings: deps!.resolver, now: deps!.now, sellable: sellableReader(deps!.db, deps!.resolver, storeId) };
    if (pack === undefined) {
      if (m === 'GET') return json({ ok: true, schedules: await cat.listSchedules(cdep, who) });
      await requirePermission(deps!.db, g.actor, 'reports.read', { storeId });
      return json({ ok: true, schedules: await cat.saveSchedule(cdep, who, (await body(request)) as cat.SaveScheduleInput) });
    }
    const f = url.searchParams.get('format');
    const format = f === 'csv' || f === 'xlsx' ? f : 'pdf';
    const w = wordsFor(url.searchParams.get('lang') ?? 'en');
    const period = periodOf(url, (PACKS as readonly string[]).includes(pack) ? PACK_PRESET[pack as PackId] : 'last30');
    if (period === null) return fail(400, 'INVALID_INPUT', ['period']);
    const model = (PACKS as readonly string[]).includes(pack)
      ? packFile(pack as PackId, await packData(deps!, who, pack as PackId, period), w)
      : singleFile(pack as SingleId, await singleData(deps!, who, period, pack as SingleId), w);
    const { head, timeZone } = await letterhead(deps!, storeId);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format((deps!.now ?? (() => new Date()))());
    const file = `${pack}-${(PACKS as readonly string[]).includes(pack) ? 'pack-' : ''}${model.range.from}`;
    const headers = { 'cache-control': 'no-store' };
    const attach = (name: string) => `attachment; filename="${name}"`;
    if (format === 'csv') return new Response(fileCsv(model, head, w), { status: 200, headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attach(`${file}.csv`) } });
    if (format === 'xlsx')
      return new Response(new Uint8Array(fileXlsx(model, w)), {
        status: 200,
        headers: { ...headers, 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': attach(`${file}.xlsx`) },
      });
    const pdf = await filePdf(model, head, w, 150, day); // hardcode-ok: print resolution of the letterhead PDF
    const download = url.searchParams.get('download') === '1';
    return new Response(new Uint8Array(pdf), { status: 200, headers: { ...headers, 'content-type': 'application/pdf', 'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${file}.pdf"` } });
  } catch (e) {
    return errorResponse(e);
  }
}
