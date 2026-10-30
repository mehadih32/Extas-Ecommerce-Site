// PR 620 — "The ERP asks the shop" on Keys & connections (admin/integrations): what the owner needs to let the ERP ask
// this store, live, for its top products and customers (docs/erp/site-changes-v6.md §2.7).
//
// - GET  /api/admin/integrations/erp-calls   (needs `vault.read`): the address to put into the ERP's shop settings (the
//   store's primary domain, else the preview host the server was given, else the address the page was opened on, plus
//   `/erp-api`), whether the calls are on for this store, whether the store speaks contract v6 yet (they answer only
//   then), the store's latest verified calls (`erp.siteApi.callsShown`, never a customer), and how many calls were
//   refused in the last `erp.siteApi.refusedShownDays` days (summed apart, so they never push the store's own calls out;
//   opening the card writes this app's counted refusals first).
// - PUT  /api/admin/integrations/erp-calls   {enabled} (needs `vault.write`, like changing a key): switches
//   `erp.siteApi.enabled` for this store; the settings log and the audit log say who did it.
// The keys the calls are signed with are typed on the same page (the ERP connection's optional signing secret).
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ERP_SITE_BASE_PATH, erpSiteCalls, erpSiteGuard, erpSiteRefusals, flushErpSiteRefusals, type ErpSiteCallView, type ErpSiteRefusalSum } from '@extas/inventory';
import { storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

export interface ErpCallsState {
  enabled: boolean;
  /** The store speaks ERP contract v6 (the calls answer only then). */
  v6: boolean;
  /** The address to put into the ERP; null when none is known. */
  base: string | null;
  calls: ErpSiteCallView[];
  /** Calls refused in the last `days` days (nobody proved who asked, so no store). */
  refused: ErpSiteRefusalSum & { days: number };
}

const DAY_MS = 86_400_000;

const HOST = /^[a-z0-9.-]+(:\d+)?$/i;

/** The card's state for one store. `origin` is the address the page or the call came in on (the last fallback). */
export async function erpCallsState(deps: Pick<AdminDeps, 'db' | 'resolver'>, storeId: number, origin: string | null): Promise<ErpCallsState> {
  const at = { storeId };
  const now = new Date();
  // The refusals this app counted since its last summary are written first (one row), so the count is current.
  await flushErpSiteRefusals(deps.db, erpSiteGuard(), now, { force: true });
  const [enabled, model, staging, shown, days, primary] = await Promise.all([
    deps.resolver.value('erp.siteApi.enabled', at),
    deps.resolver.value('erp.model', at),
    deps.resolver.value('system.stagingHost', at),
    deps.resolver.value('erp.siteApi.callsShown'),
    deps.resolver.value('erp.siteApi.refusedShownDays'),
    deps.db.storeDomain.findFirst({ where: { storeId, isPrimaryHost: true, archivedAt: null }, select: { hostname: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  const host = primary?.hostname.trim().toLowerCase() || staging;
  const site = host && HOST.test(host) ? `https://${host}` : origin;
  const [calls, refused] = await Promise.all([erpSiteCalls(deps.db, storeId, shown), erpSiteRefusals(deps.db, new Date(now.getTime() - days * DAY_MS))]);
  return { enabled, v6: model === 'v6', base: site ? `${site.replace(/\/+$/, '')}${ERP_SITE_BASE_PATH}` : null, calls, refused: { ...refused, days } };
}

/** GET and PUT /api/admin/integrations/erp-calls (see the file header). */
export async function erpCallsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: m === 'GET' ? 'vault.read' : 'vault.write', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  const origin = new URL(request.url).origin;
  try {
    if (m === 'PUT') {
      const b = await body(request);
      if (typeof b.enabled !== 'boolean') return fail(400, 'VALIDATION', ['enabled']);
      const before = await d.resolver.value('erp.siteApi.enabled', { storeId: MOTHER_STORE_ID });
      if (before !== b.enabled) {
        const actorId = g.actor.staffUserId ?? null;
        await d.resolver.set('erp.siteApi.enabled', b.enabled, storeTarget(MOTHER_STORE_ID), { actorId, reason: 'Keys & connections › the ERP asks the shop' });
        await audit(d.db, g.actor, { storeId: MOTHER_STORE_ID, action: 'erp.siteApi.enabled', entityType: 'Setting', entityId: 'erp.siteApi.enabled', before: { enabled: before }, after: { enabled: b.enabled } }, { source: 'admin-api', ...g.ctx });
      }
    }
    const canWrite = m === 'PUT' || (g.permissions?.has('vault.write') ?? false);
    return json({ ok: true, ...(await erpCallsState(d, MOTHER_STORE_ID, origin)), canWrite });
  } catch (e) {
    return errorResponse(e);
  }
}
