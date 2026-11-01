// S06 · PR 562 — /api/admin/risk/flag-report (Reports › Flag outcomes):
//   GET  the flag outcome report (@extas/orders flagReport: of the customers flagged at checkout per layer and after
//        ordering per way asked — paid, waiting, walked away, left the checkout, ordered without the ask, sent on without
//        it; what the paid ones became; the advance collected; the layers pointed out; off: says so and reads nothing)
//        with the report's own settings card (`risk.flagReport`)
//   PUT  {key: 'flagReport', value, version}  the switch, the days, the share that points a layer out, the fewest flags
//        and the most flags read (`settings.write`, audited); a screen read before someone else's save is refused (STALE)
// Seeing needs `risk.report`. The report only reads and points out: nothing here changes a layer, a price or COD.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import * as od from '@extas/orders';
import { riskFlagReportSchema, storeTarget, type RiskFlagReport } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { handle } from '../orders-api';
import { storeIdOf } from '../shipping-api';

export interface FlagReportCard {
  key: 'flagReport';
  value: RiskFlagReport;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The report's settings card as the screen shows it. */
export async function flagReportCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<FlagReportCard> {
  const value = await deps.resolver.value('risk.flagReport', { storeId });
  return { key: 'flagReport', value, version: versionOf(value) };
}

/** Every /api/admin/risk/flag-report call (`path` after /risk). */
export async function flagReportRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method === 'GET') return handle(request, deps, 'risk.report', async (x) => ({ report: await od.flagReport(x.deps, x.who), cards: { flagReport: await flagReportCard(deps!, x.who.storeId) } }));
  if (method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.report', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    await requirePermission(d.db, g.actor, 'settings.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'flagReport') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await flagReportCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  const ok = riskFlagReportSchema.safeParse(isObj(input.value) ? input.value : null);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set('risk.flagReport', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Reports › Flag outcomes' });
    await audit(d.db, g.actor, { storeId, action: 'risk.flagReport.save', entityType: 'Setting', entityId: 'risk.flagReport', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { flagReport: await flagReportCard(d, storeId) } });
}
