// S28 · PR 690 (admin prototype v5, Reports › Report packs) — the packs' admin API. Every route signs the person in (guardAdmin,
// `reports.read`, the store in `?storeId=`); @extas/catalogue checks it again.
//
//   GET   /api/admin/reports/packs/<pack>?format=pdf|csv   a pack as a PDF on the shop's letterhead or as a spreadsheet file
//                                                          (the bank pack's balances need `books.read` too)
//   GET   /api/admin/reports/packs                         the packs' schedules
//   POST  /api/admin/reports/packs                         {pack, frequency, channels, enabled} saves one schedule (off as shipped)
// Read-only: a pack changes nothing; a schedule only sends the owner a Telegram summary (never a buyer or supplier).
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import * as inv from '@extas/inventory';
import { requirePermission } from '@extas/auth';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';
import { libraryScreen } from './report-library-api';
import { PACKS, PACK_PRESET, packCsv, packPdf, type PackData, type PackId } from './report-packs';
import { sellableReader } from './shop/sellable';

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The numbers of one pack, from the same functions as the library and Finance. */
export async function packData(admin: AdminDeps, who: inv.Who, pack: PackId): Promise<PackData> {
  const s = await libraryScreen(admin, who, PACK_PRESET[pack]);
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
  if (pack !== undefined && !(PACKS as readonly string[]).includes(pack)) return fail(404, 'NOT_FOUND');
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
    const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'pdf';
    const data = await packData(deps!, who, pack as PackId);
    const { head, timeZone } = await letterhead(deps!, storeId);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format((deps!.now ?? (() => new Date()))());
    const file = `${pack}-pack-${data.range.from}`;
    const headers = { 'cache-control': 'no-store' };
    if (format === 'csv')
      return new Response(packCsv(pack as PackId, data, head), {
        status: 200,
        headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${file}.csv"` },
      });
    const pdf = await packPdf(pack as PackId, data, head, 150, day);
    return new Response(new Uint8Array(pdf), { status: 200, headers: { ...headers, 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${file}.pdf"` } });
  } catch (e) {
    return errorResponse(e);
  }
}
