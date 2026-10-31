// S06 · PR 556 — the in-transit duplicate notice's settings card and report, the admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/transit  the setting as the Risk rules card shows it ({cards: {transit}}) and the report of the
//                                 last `reportDays` days by campaign ({report}) (risk.rules.read; the report risk.report)
//   PUT  /api/admin/risk/transit  {key: 'transit', value, version} the switch, which orders count, how far back, the number
//                                 alone, the report's days (risk.rules.write, audited); a screen read before someone
//                                 else's save is STALE
// The notice only tells the customer; nothing here cancels, holds or blocks anyone.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import * as od from '@extas/orders';
import { checkoutTransitDuplicateSchema, storeTarget, type CheckoutTransitDuplicate } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../shipping-api';

export interface TransitCard {
  key: 'transit';
  value: CheckoutTransitDuplicate;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function transitCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<TransitCard> {
  const value = await deps.resolver.value('checkout.transitDuplicate', { storeId });
  return { key: 'transit', value, version: versionOf(value) };
}

/** The report by campaign, or null for someone without `risk.report` (the card still shows). */
export async function transitReportFor(deps: Pick<AdminDeps, 'db' | 'resolver'>, who: od.Who): Promise<{ days: number; rows: od.TransitReportRow[] } | null> {
  try {
    return await od.transitDuplicateReport({ db: deps.db, settings: deps.resolver }, who);
  } catch (e) {
    if ((e as { code?: string }).code === 'FORBIDDEN') return null;
    throw e;
  }
}

/** /api/admin/risk/transit (GET, PUT). */
export async function transitSettingsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.rules.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') {
    const who = { actor: g.actor, storeId, ctx: g.ctx };
    const report = await transitReportFor(d, who);
    return json({ ok: true, cards: { transit: await transitCard(d, storeId) }, report });
  }
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'transit') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await transitCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  const ok = checkoutTransitDuplicateSchema.safeParse(isObj(input.value) ? input.value : null);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set('checkout.transitDuplicate', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Risk rules › Parcel already on its way' });
    await audit(d.db, g.actor, { storeId, action: 'checkout.transitDuplicate.save', entityType: 'Setting', entityId: 'checkout.transitDuplicate', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { transit: await transitCard(d, storeId) } });
}
