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
import { registry, salaryPlan, SettingsError, staffCostsSchema, statementCostsSchema, storeTarget, type StaffCostsSettings, type StatementCostsSettings } from '@extas/settings';
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

// ---- PR 837: "Salaries and monthly costs" (each person's amount from a month on; GET/PUT /api/admin/costs/staff) ----------

export interface StaffCostsCard {
  value: StaffCostsSettings;
  version: string;
}

/** The card as the Costs page shows it, read from the store's settings (`books.staffCosts`, v837). */
export async function staffCostsCard(admin: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<StaffCostsCard> {
  const value = await admin.resolver.value('books.staffCosts', { storeId });
  return { value, version: createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16) };
}

/** GET the list (`books.read`); PUT it whole with its version (`fixedcosts.write`, audited `books.staffCosts`). Nothing is paid or moved. */
export function staffCostsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = method(request);
  if (m === 'GET') return handle(request, deps, 'books.read', async (c) => ({ staff: await staffCostsCard(c.admin, c.who.storeId) }));
  if (m !== 'PUT') return notAllowed();
  return handle(request, deps, 'fixedcosts.write', async (c) => {
    const b = await body(request);
    const before = await staffCostsCard(c.admin, c.who.storeId);
    if (b.version !== before.version) return fail(409, 'STALE');
    const parsed = staffCostsSchema.safeParse(b.value);
    if (!parsed.success) return fail(400, 'INVALID_INPUT', [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
    // nothing is ever deleted: a person already in the list stays in it (stopped from a month instead), and an earlier amount stays
    const now = new Map(parsed.data.people.map((p) => [p.id, p]));
    for (const old of before.value.people) {
      const next = now.get(old.id);
      if (!next) return fail(400, 'INVALID_INPUT', ['people']);
      if (!old.amounts.every((a) => next.amounts.some((x) => x.from === a.from && x.minor === a.minor))) return fail(400, 'INVALID_INPUT', ['amounts']);
      // PR 859: the payments are written by the pay route only, and a paid month's advance, bonus and deduction are locked
      if (JSON.stringify(old.paid ?? {}) !== JSON.stringify(next.paid ?? {})) return fail(400, 'INVALID_INPUT', ['paid']);
      for (const m of Object.keys(old.paid ?? {})) if (JSON.stringify(old.adj?.[m] ?? null) !== JSON.stringify(next.adj?.[m] ?? null)) return fail(409, 'MONTH_PAID', [m]);
    }
    if (parsed.data.people.some((p) => !before.value.people.some((o) => o.id === p.id) && p.paid && Object.keys(p.paid).length)) return fail(400, 'INVALID_INPUT', ['paid']);
    if (JSON.stringify(parsed.data) !== JSON.stringify(before.value)) {
      const key = 'books.staffCosts' as const;
      await c.admin.resolver.set(key, parsed.data, storeTarget(c.who.storeId), { actorId: c.who.actor.staffUserId ?? null, reason: 'Money › Costs: salaries and monthly costs' });
      await audit(c.admin.db, c.who.actor, { storeId: c.who.storeId, action: 'books.staffCosts', entityType: 'Setting', entityId: key, before: { people: before.value.people.length }, after: { people: parsed.data.people.length } }, { source: 'admin-api', ...c.who.ctx });
    }
    return { staff: await staffCostsCard(c.admin, c.who.storeId) };
  });
}

// ---- PR 859 (parity F5): "Pay salary" (POST /api/admin/costs/staff/pay) -------------------------------------------------------

/** One person's payment in the answer. */
export interface SalaryPaid {
  id: string;
  name: string;
  minor: number;
  repeated: boolean;
}

/**
 * POST {month, accountKey, ids?, pin}: pays the month's salaries by writing one cashbook entry per person (kind EXPENSE, out of
 * `accountKey`, a request key of its own so a retry never pays twice) and then marks those people paid in the list. Only the roles
 * that hold BOTH `fixedcosts.write` and `cash.record` (Accounts and the owner: the money rule), checked here and again by the
 * cashbook, which also asks for the owner's PIN on every entry. Nothing is automatic: it runs when this is posted, never by a
 * clock; no message is sent to anyone. A person without anything to pay (nothing left after the advance) is skipped. It stops
 * at the first refusal (a wrong PIN, a closed cashbook) and says who was paid before it.
 */
export function staffPayHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'fixedcosts.write', async (c) => {
    await requireAnyPermission(c.admin.db, c.who.actor, ['cash.record'], { storeId: c.who.storeId });
    const b = await body(request);
    const month = typeof b.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(b.month) ? b.month : null;
    const accountKey = typeof b.accountKey === 'string' && b.accountKey.trim() ? b.accountKey.trim().slice(0, 40) : null; // hardcode-ok: a key's length guard
    if (!month || !accountKey) return fail(400, 'INVALID_INPUT', [!month ? 'month' : 'accountKey']);
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string') : undefined;
    const card = await staffCostsCard(c.admin, c.who.storeId);
    const plan = salaryPlan(card.value.people, month, ids);
    if (!plan.length) return fail(409, 'NOTHING_TO_PAY');
    const day = (c.admin.now ?? (() => new Date()))().toISOString().slice(0, 10); // hardcode-ok: ISO date
    const paid: SalaryPaid[] = [];
    let stopped: Response | null = null;
    for (const x of plan) {
      try {
        const r = await inv.recordCash(c.deps, c.who, { kind: 'EXPENSE', accountKey, amountMinor: x.minor, day, note: `Salary ${month} · ${x.name}`.slice(0, 300), requestKey: `salary:${month}:${x.id}`, pin: typeof b.pin === 'string' ? b.pin : '' }); // hardcode-ok: note length guard
        paid.push({ id: x.id, name: x.name, minor: x.minor, repeated: r.repeated });
      } catch (e) {
        stopped = errorResponse(e);
        break;
      }
    }
    if (paid.length) {
      // read the list again and mark only the people the cashbook took (another save may have come in between)
      const fresh = await staffCostsCard(c.admin, c.who.storeId);
      const mark = new Map(paid.map((p) => [p.id, p]));
      const next: StaffCostsSettings = { people: fresh.value.people.map((p) => (mark.has(p.id) ? { ...p, paid: { ...(p.paid ?? {}), [month]: { at: day, minor: mark.get(p.id)!.minor, account: accountKey } } } : p)) };
      const key = 'books.staffCosts' as const;
      await c.admin.resolver.set(key, next, storeTarget(c.who.storeId), { actorId: c.who.actor.staffUserId ?? null, reason: 'Money › Costs: salary paid' });
      await audit(c.admin.db, c.who.actor, { storeId: c.who.storeId, action: 'books.staffCosts.pay', entityType: 'Setting', entityId: key, before: null, after: { month, accountKey, people: paid.map((p) => p.id), totalMinor: paid.reduce((a, p) => a + p.minor, 0) } }, { source: 'admin-api', ...c.who.ctx });
    }
    if (stopped) return stopped;
    return { paid, staff: await staffCostsCard(c.admin, c.who.storeId) };
  }, 201);
}
