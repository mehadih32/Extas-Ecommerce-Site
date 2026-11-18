// PR 1121 (prototype v5): Orders › Returns & exchanges "Excel" — the returned parcels, their value and the reasons in the
// page's date range as a CSV file (`returns.view`). GET /api/admin/returns/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { adminDeps, fail, guardAdmin } from '@/lib/admin-auth';
import { validDay } from '@/lib/admin-orders/range';
import { plainReason, returnsCsv, returnsSummary } from '@/lib/admin-returns/summary';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const deps = adminDeps();
  const g = await guardAdmin(request, deps, { permission: 'returns.view', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const sp = new URL(request.url).searchParams;
    const at = { storeId: MOTHER_STORE_ID };
    const [tz, currency, lists] = await Promise.all([d.resolver.value('store.timeZone', at), d.resolver.value('store.currency', at), od.reasonLists({ db: d.db, settings: d.resolver, ...(d.now ? { now: d.now } : {}) }, MOTHER_STORE_ID)]);
    const names = new Map(lists.refusal.map((r) => [r.key, r.en]));
    const s = await returnsSummary(d.db, MOTHER_STORE_ID, validDay(sp.get('from') ?? undefined), validDay(sp.get('to') ?? undefined), tz, currency);
    return new Response(returnsCsv(s, (c) => names.get(c) ?? plainReason(c)), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="returns.csv"', 'cache-control': 'no-store' },
    });
  } catch {
    return fail(500, 'internal');
  }
}
