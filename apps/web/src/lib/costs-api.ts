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
//   GET   /api/admin/costs/statements                    the "Costs from statements" card {cards: {statements}}
//   PUT   /api/admin/costs/statements                    {key: 'statements', value, version} follow-up 565: the
//                                                        courier charges and gateway fees written by the imported
//                                                        statements (`books.costs.fromStatements`, v274, off; audited
//                                                        `books.statementCosts`; a screen read before another save: STALE)
// The writes need `fixedcosts.write`; a cost entry and its reversal take `costlines.write` too (follow-up 567).
import { createHash } from 'node:crypto';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { audit, requireAnyPermission } from '@extas/auth';
import * as inv from '@extas/inventory';
import { registry, SettingsError, statementCostsSchema, storeTarget, type StatementCostsSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';

type CostsPerm = 'books.read' | 'fixedcosts.write';
/** Follow-up 567: either of these enters or reverses a day's cost line. */
const LINE_PERMS = inv.COST_LINE_PERMISSIONS;

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

async function handle(request: Request, deps: AdminDeps | null, permission: CostsPerm | typeof LINE_PERMS, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, typeof permission === 'string' ? { permission, storeId } : { storeId });
  if (g instanceof Response) return g;
  try {
    if (typeof permission !== 'string') await requireAnyPermission(deps!.db, g.actor, permission, { storeId });
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
  return handle(request, deps, LINE_PERMS, async (c) => ({ result: await inv.addCostEntry(c.deps, c.who, await body(request)) }), 201);
}

export function reverseCostEntryHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  if (!isUuid(id)) return Promise.resolve(fail(400, 'INVALID_INPUT', ['id']));
  return handle(request, deps, LINE_PERMS, async (c) => ({ result: await inv.reverseCostEntry(c.deps, c.who, id, await body(request)) }), 201);
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

// ---- follow-up 565: "Costs from statements" -----------------------------------------------------------------------------

export interface StatementCostsCard {
  key: 'statements';
  value: StatementCostsSettings;
  version: string;
}

/** The card as the Costs page shows it, read from the store's settings. */
export async function statementCostsCard(admin: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<StatementCostsCard> {
  const value = await admin.resolver.value('books.costs.fromStatements', { storeId });
  return { key: 'statements', value, version: createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16) };
}

/** GET the card (`books.read`); PUT it whole with its version (`fixedcosts.write`, audited). */
export function statementCostsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = method(request);
  if (m === 'GET') return handle(request, deps, 'books.read', async (c) => ({ cards: { statements: await statementCostsCard(c.admin, c.who.storeId) } }));
  if (m !== 'PUT') return notAllowed();
  return handle(request, deps, 'fixedcosts.write', async (c) => {
    const b = await body(request);
    if (b.key !== 'statements') return fail(400, 'INVALID_INPUT', ['key']);
    const before = await statementCostsCard(c.admin, c.who.storeId);
    if (b.version !== before.version) return fail(409, 'STALE');
    const parsed = statementCostsSchema.safeParse(b.value);
    if (!parsed.success) return fail(400, 'INVALID_INPUT', [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
    if (JSON.stringify(parsed.data) !== JSON.stringify(before.value)) {
      const key = 'books.costs.fromStatements' as const;
      await c.admin.resolver.set(key, parsed.data, storeTarget(c.who.storeId), { actorId: c.who.actor.staffUserId ?? null, reason: 'Money › Costs: costs from the imported statements' });
      await audit(c.admin.db, c.who.actor, { storeId: c.who.storeId, action: 'books.statementCosts', entityType: 'Setting', entityId: key, before: { ...before.value }, after: { ...parsed.data } }, { source: 'admin-api', ...c.who.ctx });
    }
    return { cards: { statements: await statementCostsCard(c.admin, c.who.storeId) } };
  });
}
