// CN-029 · PR 619 — Settings → ERP link (`/admin/settings/erp-link`): one store's own link to the ERP company it is mapped
// to (one store = one ERP company). The admin API behind the page:
//
// - GET  /api/admin/erp-link?storeId=N   (`vault.read` in that store): the page's state — the contract the store speaks,
//   its open link (epoch, ERP company, switch date, opening balance), what was last synced each way, the last daily
//   summary the ERP accepted, the queues (orders waiting, held or failed, v5 orders kept at the switch, open exchanges,
//   summaries waiting), the balance Retail owes by the shop's books and by the ERP's, the books match state, and the
//   last dry run and switch. Its keys form is Keys & connections' card with `?storeId=` (lib/integrations.ts), so the
//   API key, webhook secret and signing secret are saved in the vault under this store id only.
// - POST /api/admin/erp-link?storeId=N   {action}:
//   - `dryRun` (`vault.write`): what the switch-over would do, read from the ERP's list; nothing else changes.
//   - `switch` {pin, confirmDate} (an owner, with his books PIN and the ERP's switch date typed back): the switch-over
//     to contract v6 (`runSwitchOver`, @extas/inventory erp-switchover.ts). `erp.model` is written with the owner's
//     written OK (`ownerApproved`), which only this action gives. A v5 order waiting at the switch goes again as a v6
//     order through the orders package (`resendOrderAsV6`, follow-up 530).
//   - `newLink` {pin, reason: HANDOVER | OPENING_WRONG, note} (an owner with his PIN): ends the open link; on a
//     handover the store's three ERP keys are revoked here (never deleted) and its connection goes back to mock and off.
//   - `sendHeld` {orderId} (`vault.write`): a v5 order kept at the switch (`erp.switchOver.queuedV5Orders` = hold) sent
//     now as a v6 order.
// Every refusal is a code the page shows in its own words. No key value ever leaves the vault through this API.
import { audit, can, isOwner } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { connectionCatalogue, secretName } from '@extas/adapters';
import * as inv from '@extas/inventory';
import { isOrdersError, resendOrderAsV6 } from '@extas/orders';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { erpCallsState, type ErpCallsState } from './erp-calls-admin';
import { listConnections, storeOfRequest, type ConnectionView } from './integrations';
import { inventoryDeps } from './inventory-api';
import { ordersDeps } from './orders-api';

export interface ErpLinkStoreChoice {
  id: number;
  name: string;
}

export interface ErpLinkView {
  storeId: number;
  state: inv.ErpLinkPage;
  connections: ConnectionView[];
  erpCalls: ErpCallsState;
  /** The stores the person may open this page for (the picker). */
  stores: ErpLinkStoreChoice[];
  canWrite: boolean;
  owner: boolean;
  vaultReady: boolean;
  /** The last dry run is clean enough in time to switch on (younger than `erp.switchOver.dryRunMaxHours`). */
  dryRunFresh: boolean;
}

/** The kinds of connection this page keeps per store (the ERP's declaration in the catalogue). */
const ERP_DECLARATIONS = connectionCatalogue.filter((d) => d.kind === 'ERP');

/** Everything the page shows for one store (the person's `vault.read` in that store was checked by the caller). */
export async function erpLinkView(deps: AdminDeps, who: inv.Who, origin: string | null, canWrite: boolean): Promise<ErpLinkView> {
  const idp = await inventoryDeps(deps);
  const storeId = who.storeId;
  const actorId = who.actor.staffUserId;
  const [state, connections, erpCalls, stores, owner] = await Promise.all([
    inv.erpLinkState(idp, who),
    listConnections(deps.db, deps.vault, undefined, storeId),
    erpCallsState(deps, storeId, origin),
    deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' } }, orderBy: { id: 'asc' }, select: { id: true, name: true } }),
    actorId ? isOwner(deps.db, actorId) : Promise.resolve(false),
  ]);
  const allowed: ErpLinkStoreChoice[] = [];
  for (const s of stores) if (owner || (await can(deps.db, who.actor, 'vault.read', { storeId: s.id }))) allowed.push(s);
  const dry = state.switchOver.lastDryRun;
  const dryRunFresh = dry ? Date.now() - new Date(dry.createdAt).getTime() <= state.switchOver.dryRunMaxHours * 3_600_000 : false;
  return { storeId, state, connections, erpCalls, stores: allowed, canWrite, owner, vaultReady: Boolean(deps.vault), dryRunFresh };
}

/** The store's ERP keys revoked (a handover), its connection back to mock and off. Answers the names revoked. */
async function revokeStoreErpKeys(deps: AdminDeps, who: inv.Who, storeId: number): Promise<string[]> {
  const revoked: string[] = [];
  if (deps.vault) {
    const live = new Set((await deps.vault.list({ storeId })).filter((s) => !s.revoked).map((s) => s.name));
    for (const d of ERP_DECLARATIONS) {
      for (const f of d.secrets) {
        const name = secretName(d.provider, f.field);
        if (!live.has(name)) continue;
        await deps.vault.revoke(name, { storeId }, { actorId: who.actor.staffUserId, service: 'admin:erp-link', purpose: 'ERP link handover' });
        revoked.push(name);
      }
    }
  }
  const rows = await deps.db.integration.findMany({ where: { storeId, kind: 'ERP', archivedAt: null }, select: { id: true, mode: true, enabled: true } });
  for (const r of rows) {
    if (r.mode === 'MOCK' && !r.enabled) continue;
    await deps.db.integration.update({ where: { id: r.id }, data: { mode: 'MOCK', enabled: false } });
    await audit(deps.db, who.actor, { storeId, action: 'integration.remove', entityType: 'Integration', entityId: r.id, before: { mode: r.mode, enabled: r.enabled }, after: { mode: 'MOCK', enabled: false, revoked, reason: 'ERP link handover' } }, who.ctx);
  }
  return revoked;
}

/** The switch-over's dependencies: the settings writer and the orders package's "send again as v6". */
async function switchDeps(deps: AdminDeps): Promise<inv.SwitchOverDeps> {
  const idp = await inventoryDeps(deps);
  return {
    ...idp,
    writer: { set: (key, value, target, opts) => deps.resolver.set(key as never, value as never, target, opts) },
    resendV5Order: async (storeId, orderId) => {
      await resendOrderAsV6(await ordersDeps(deps), storeId, orderId);
    },
  };
}

function refusal(e: unknown): Response {
  if (inv.isSwitchError(e)) return fail(e.status, e.code, e.details);
  if (isOrdersError(e)) return fail(e.status, e.code, e.details);
  return errorResponse(e);
}

/** GET and POST /api/admin/erp-link?storeId=N (see the file header). */
export async function erpLinkHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') return fail(405, 'method-not-allowed');
  const asked = storeOfRequest(request);
  if (asked === undefined) return fail(400, 'INVALID_INPUT', ['storeId']);
  const storeId = asked ?? MOTHER_STORE_ID;
  const g = await guardAdmin(request, deps, { permission: 'vault.read', storeId });
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  // qa-gate N2: a store that does not exist (or is archived) has no ERP link page: 404, never a made-up state.
  if (!(await d.db.store.findFirst({ where: { id: storeId, status: { not: 'ARCHIVED' } }, select: { id: true } }))) return fail(404, 'NOT_FOUND', ['storeId']);
  const who: inv.Who = { actor: g.actor, storeId, ctx: g.ctx };
  const canWrite = g.permissions?.has('vault.write') ?? false;
  const origin = new URL(request.url).origin;
  try {
    if (m === 'GET') return json({ ok: true, ...(await erpLinkView(d, who, origin, canWrite)) });
    const b = await body(request);
    let result: unknown;
    switch (b.action) {
      case 'dryRun':
        result = await inv.dryRunSwitchOver(await inventoryDeps(d), who);
        break;
      case 'switch':
        result = await inv.runSwitchOver(await switchDeps(d), who, { pin: b.pin, confirmDate: b.confirmDate });
        break;
      case 'newLink':
        result = await inv.startNewErpLink(await inventoryDeps(d), who, { pin: b.pin, reason: b.reason, note: b.note }, { revokeKeys: (id) => revokeStoreErpKeys(d, who, id) });
        break;
      case 'sendHeld':
        result = await inv.sendHeldV5Order(await switchDeps(d), who, b.orderId);
        break;
      default:
        return fail(400, 'INVALID_INPUT', ['action']);
    }
    return json({ ok: true, result, ...(await erpLinkView(d, who, origin, canWrite)) });
  } catch (e) {
    return refusal(e);
  }
}
