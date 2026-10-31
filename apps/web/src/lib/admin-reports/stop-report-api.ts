// S06 · PR 524 — /api/admin/risk/stopped (Reports › Stopped by the engine):
//   GET  the stop report (@extas/orders stopReport: every order the engine stopped by itself in the last days, its rule,
//        how sure the rule was and what became of it; the tally per rule with its flag; the orders the good-customer
//        override spared) and the report's own settings card (`risk.stopReport`)
//   PUT  {key: 'stopReport', value, version}  the days, the warning share, the fewest stops and the most rows
//        (`settings.write`, audited); a screen read before someone else's save is refused with STALE
// Seeing needs `risk.report`. A report only reads: nothing here holds, releases, cancels an order or moves money.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import * as od from '@extas/orders';
import { riskStopReportSchema, storeTarget, type RiskStopReport } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { handle } from '../orders-api';
import { storeIdOf } from '../shipping-api';

export interface StopReportCard {
  key: 'stopReport';
  value: RiskStopReport;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The report's settings card as the screen shows it. */
export async function stopReportCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<StopReportCard> {
  const value = await deps.resolver.value('risk.stopReport', { storeId });
  return { key: 'stopReport', value, version: versionOf(value) };
}

/** Every /api/admin/risk/stopped call (`path` after /risk). */
export async function stopReportRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method === 'GET') return handle(request, deps, 'risk.report', async (x) => ({ report: await od.stopReport(x.deps, x.who), cards: { stopReport: await stopReportCard(deps!, x.who.storeId) } }));
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
  if (input.key !== 'stopReport') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await stopReportCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  // an emptied warning box is "never flag"
  const raw = isObj(input.value) ? { ...input.value, ...(input.value.warnWrongPercent === '' ? { warnWrongPercent: null } : {}) } : null;
  const ok = riskStopReportSchema.safeParse(raw);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set('risk.stopReport', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Reports › Stopped by the engine' });
    await audit(d.db, g.actor, { storeId, action: 'risk.stopReport.save', entityType: 'Setting', entityId: 'risk.stopReport', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { stopReport: await stopReportCard(d, storeId) } });
}
