// CN-028 · PR 618 (CN-029 Phase 1) — the costs admin API for Money → Costs (/admin/money/costs). Every route signs the
// person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then
// calls @extas/inventory (books-costs.ts), which checks the permission again and writes the audit log. Answers are
// `{ ok: true, … }` or `{ ok: false, error: CODE, details }`. Nothing here moves money.
//
//   GET   /api/admin/costs                               the months' fixed costs, the open days' cost entries and the
//                                                        cost lines the store never has (`books.read`)
//   PUT   /api/admin/costs/fixed-costs                   {month, salaryMinor, rentMinor, utilitiesMinor, otherMinor,
//                                                        note?} a month's fixed costs: a new version when changed
//   POST  /api/admin/costs/cost-entries                  {line, day, amountMinor, note?} one cost on a summary line
//   POST  /api/admin/costs/cost-entries/:id/reverse      {reason} reverse a cost entered here (a negative entry)
//   PUT   /api/admin/costs/no-cost-lines                 {value} the cost lines this store never has
//                                                        (`erp.summary.noCostLines`)
// The writes need `fixedcosts.write`.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { audit } from '@extas/auth';
import * as inv from '@extas/inventory';
import { registry, SettingsError, storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';

type CostsPerm = 'books.read' | 'fixedcosts.write';

interface Ctx {
  deps: inv.InventoryDeps;
  admin: AdminDeps;
  who: inv.Who;
  url: URL;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

async function handle(request: Request, deps: AdminDeps | null, permission: CostsPerm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: await inventoryDeps(deps!), admin: deps!, who: { actor: g.actor, storeId, ctx: g.ctx }, url });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    if (e instanceof SettingsError) return fail(400, 'INVALID_INPUT', [...e.issues]);
    return errorResponse(e);
  }
}

const method = (request: Request) => request.method.toUpperCase();
const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));

/** Everything the Costs page shows, for one store. */
export async function costsScreen(deps: inv.InventoryDeps, who: inv.Who) {
  const [fixed, entries, noCostLines] = await Promise.all([inv.fixedCostsView(deps, who), inv.costEntries(deps, who), deps.settings.value('erp.summary.noCostLines', { storeId: who.storeId })]);
  return { fixed, entries, noCostLines };
}

export function costsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'books.read', async (c) => costsScreen(c.deps, c.who));
}

export function fixedCostsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'PUT') return notAllowed();
  return handle(request, deps, 'fixedcosts.write', async (c) => ({ result: await inv.setFixedCosts(c.deps, c.who, await body(request)) }));
}

export function costEntriesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'fixedcosts.write', async (c) => ({ result: await inv.addCostEntry(c.deps, c.who, await body(request)) }), 201);
}

export function reverseCostEntryHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  if (!isUuid(id)) return Promise.resolve(fail(400, 'INVALID_INPUT', ['id']));
  return handle(request, deps, 'fixedcosts.write', async (c) => ({ result: await inv.reverseCostEntry(c.deps, c.who, id, await body(request)) }), 201);
}

/** "More options": the cost lines this store never has (a store setting, logged in the settings history and the audit log). */
export function noCostLinesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'PUT') return notAllowed();
  return handle(request, deps, 'fixedcosts.write', async (c) => {
    const key = 'erp.summary.noCostLines' as const;
    const b = await body(request);
    const parsed = registry[key].schema.safeParse(b.value);
    if (!parsed.success) return fail(400, 'INVALID_INPUT', parsed.error.issues.map((i) => `${[key, ...i.path].join('.')}: ${i.message}`));
    const at = { storeId: c.who.storeId };
    const before = await c.admin.resolver.value(key, at);
    if (JSON.stringify([...parsed.data].sort()) !== JSON.stringify([...before].sort())) {
      await c.admin.resolver.set(key, parsed.data as never, storeTarget(c.who.storeId), { actorId: c.who.actor.staffUserId ?? null, reason: 'Money › Costs: cost lines this shop never has' });
      await audit(c.admin.db, c.who.actor, { storeId: c.who.storeId, action: 'books.noCostLines', entityType: 'Setting', entityId: key, before: { [key]: before }, after: { [key]: parsed.data } }, { source: 'admin-api', ...c.who.ctx });
    }
    return { noCostLines: await c.admin.resolver.value(key, at) };
  });
}
