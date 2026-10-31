// S06 · PR 164 — /api/admin/risk/report (Reports › Fraud & RTO):
//   GET  ?from=&to=  the fraud report (@extas/shipping fraudReport: what was caught, wrong, missed, stopped, the cost
//                    probably avoided, the RTO cost book by district, campaign, product, courier and reason) and the
//                    report's own settings card (`risk.report`)
//   PUT  {key: 'report', value, version}  how many days it shows by default and the most rows it reads
//                    (`settings.write`, audited); a screen read before someone else's save is refused with STALE
// Seeing needs `risk.report`. A report only reads: nothing here blocks anyone, cancels an order or moves money.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import * as sh from '@extas/shipping';
import { riskReportSchema, storeTarget, type RiskReport } from '@extas/settings';
import { body, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { shippingDeps, shippingFail, storeIdOf } from '../shipping-api';

export interface ReportCard {
  key: 'report';
  value: RiskReport;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The report's settings card as the screen shows it. */
export async function reportCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<ReportCard> {
  const value = await deps.resolver.value('risk.report', { storeId });
  return { key: 'report', value, version: versionOf(value) };
}

/** Every /api/admin/risk/report call (`path` after /risk). */
export async function fraudReportRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.report', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    if (method === 'GET') {
      const query = Object.fromEntries(['from', 'to'].flatMap((k) => (url.searchParams.get(k) ? [[k, url.searchParams.get(k)!]] : [])));
      const report = await sh.fraudReport(await shippingDeps(d), { actor: g.actor, storeId, ctx: g.ctx }, query);
      return json({ ok: true, report, cards: { report: await reportCard(d, storeId) } });
    }
    await requirePermission(d.db, g.actor, 'settings.write', { storeId });
    const input = await body(request);
    if (input.key !== 'report') return fail(400, 'INVALID_INPUT', ['key']);
    const before = await reportCard(d, storeId);
    if (input.version !== before.version) return fail(409, 'STALE');
    const ok = riskReportSchema.safeParse(isObj(input.value) ? input.value : null);
    if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
    if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
      await d.resolver.set('risk.report', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Reports › Fraud & RTO' });
      await audit(d.db, g.actor, { storeId, action: 'risk.report.save', entityType: 'Setting', entityId: 'risk.report', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
    }
    return json({ ok: true, cards: { report: await reportCard(d, storeId) } });
  } catch (e) {
    return shippingFail(e);
  }
}
