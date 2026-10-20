// PR 500 — "Keys & connections": the admin API behind the page (Blueprint A1.3; register 493/500).
//
// - GET  /api/admin/integrations            every declared connection with its state (needs `vault.read`). Secret
//   values never leave: the answer says only which fields are saved, when, the mode and the last test.
// - POST /api/admin/integrations/:id        {action: 'save', secrets, config} | {action: 'test'} | {action: 'remove'}
//   (needs `vault.write`). Save = the vault stores each key (PR 493), the connection row gets its plain settings, the
//   Test button runs in the declared target mode, and only a passing test moves the connection out of MOCK and switches
//   it on (connections.setMode, PR 18). A failing test leaves it on MOCK and off, so the shop keeps its fallback.
//   Remove = the keys are revoked (the rows stay: nothing is deleted) and the connection goes back to MOCK and off.
//
// Every change is in the audit log (who, when, from where; never a value). The connection list is data
// (`connectionCatalogue` in @extas/adapters), never markup. Connections are installation-wide here (storeId null):
// storage, backups, CDN and alerts serve every store. Per-store connections (couriers, payments) come with their PRs.
import type { Prisma } from '@extas/db/client';
import {
  allAdapters,
  connectionCatalogue,
  createConnections,
  secretName,
  type AdapterDefinition,
  type ConnectionDeclaration,
  type Mode,
  type TestOutcome,
} from '@extas/adapters';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { SecretInfo, Vault } from '@extas/vault';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

type Db = AdminDeps['db'];

/** The longest key or setting the page accepts (a long JSON service-account key still fits). */
const MAX_VALUE = 16_384;

export interface FieldState {
  field: string;
  optional: boolean;
}

export interface ConnectionView {
  id: string;
  kind: string;
  /** An adapter exists in code: keys can be saved and tested. */
  adapter: boolean;
  /** Needs no key (local disk). */
  builtIn: boolean;
  secrets: (FieldState & { set: boolean })[];
  /** Plain settings (not secret) with their saved value, so the form can show them again. */
  config: (FieldState & { value: string | null })[];
  /** Every key of this connection is in the vault and not revoked. */
  keySaved: boolean;
  savedAt: string | null;
  integrationId: string | null;
  mode: Mode | null;
  enabled: boolean;
  /** For a built-in connection: nothing else of its kind is switched on, so this one is used. */
  inUse: boolean;
  lastTest: { at: string; ok: boolean; message: string | null } | null;
}

const isResponse = (v: unknown): v is Response => v instanceof Response;

/** What the page lists and which adapters serve it; tests pass their own (a test adapter needs no network). */
export interface Catalogue {
  declarations: readonly ConnectionDeclaration[];
  adapters: readonly AdapterDefinition<any, any>[];
}

export const defaultCatalogue: Catalogue = { declarations: connectionCatalogue, adapters: allAdapters };

const vaultWho = (actor: Actor) => ({ actorId: actor.staffUserId, service: 'admin:keys', purpose: 'keys & connections' });
const adapterOf = (d: ConnectionDeclaration, cat: Catalogue) => cat.adapters.find((a) => a.kind === d.kind && a.provider === d.provider);

async function rowsOf(db: Db) {
  return db.integration.findMany({ where: { storeId: null, archivedAt: null }, orderBy: { createdAt: 'asc' } });
}

function rowFor(rows: Awaited<ReturnType<typeof rowsOf>>, d: ConnectionDeclaration) {
  return rows.find((r) => r.kind === d.kind && r.provider === d.provider && r.name === d.id) ?? null;
}

/** The page's list: one entry per declared connection, never a secret value. */
export async function listConnections(db: Db, vault: Pick<Vault, 'list'> | null, cat: Catalogue = defaultCatalogue): Promise<ConnectionView[]> {
  const [rows, secrets] = await Promise.all([rowsOf(db), vault ? vault.list({ storeId: null }) : Promise.resolve([] as SecretInfo[])]);
  const byName = new Map(secrets.map((s) => [s.name, s]));
  return cat.declarations.map((d) => {
    const row = rowFor(rows, d);
    const saved = d.secrets.map((s) => byName.get(secretName(d.provider, s.field)));
    const set = saved.map((s) => Boolean(s && !s.revoked));
    const cfg = (row?.config ?? {}) as Record<string, unknown>;
    const times = saved.filter((s): s is SecretInfo => Boolean(s && !s.revoked)).map((s) => s.updatedAt.getTime());
    return {
      id: d.id,
      kind: d.kind,
      adapter: d.adapter,
      builtIn: Boolean(d.builtIn),
      secrets: d.secrets.map((s, i) => ({ field: s.field, optional: false, set: set[i] ?? false })),
      config: d.config.map((c) => ({ field: c.field, optional: Boolean(c.optional), value: typeof cfg[c.field] === 'string' ? (cfg[c.field] as string) : null })),
      // A connection with no key (the page reader) counts as saved once its settings are.
      keySaved: d.secrets.length > 0 ? set.every(Boolean) : !d.builtIn && row !== null,
      savedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
      integrationId: row?.id ?? null,
      mode: row?.mode ?? null,
      enabled: row?.enabled ?? false,
      inUse: Boolean(d.builtIn) && !rows.some((r) => r.kind === d.kind && r.provider !== d.provider && r.enabled && r.mode !== 'MOCK'),
      lastTest: row?.lastTestAt ? { at: row.lastTestAt.toISOString(), ok: row.lastTestOk === true, message: row.lastTestMessage } : null,
    };
  });
}

async function connectionsFor(deps: AdminDeps, vault: Vault, cat: Catalogue) {
  const [testSeconds, cacheSeconds] = await Promise.all([
    deps.resolver.value('system.integrationTestTimeoutSeconds'),
    deps.resolver.value('system.integrationKeyCacheSeconds'),
  ]);
  return createConnections({ db: deps.db, vault, adapters: cat.adapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
}

/** GET /api/admin/integrations */
export async function integrationsHandler(request: Request, deps: AdminDeps | null, cat: Catalogue = defaultCatalogue): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'vault.read' });
  if (isResponse(g)) return g;
  try {
    return json({ ok: true, vaultReady: Boolean(deps!.vault), connections: await listConnections(deps!.db, deps!.vault, cat) });
  } catch (e) {
    return errorResponse(e);
  }
}

type Parsed = { secrets: Record<string, string>; config: Record<string, string> } | { bad: string[] };

/** Checks the form against the declaration and the adapter's own config schema. Values are never echoed back. */
export function parseSave(d: ConnectionDeclaration, b: Record<string, unknown>, cat: Catalogue = defaultCatalogue): Parsed {
  const bad: string[] = [];
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const inSecrets = obj(b.secrets) ?? {};
  const inConfig = obj(b.config) ?? {};
  const known = (list: readonly { field: string }[], given: Record<string, unknown>, prefix: string) => {
    for (const k of Object.keys(given)) if (!list.some((f) => f.field === k)) bad.push(`${prefix}.${k}`);
  };
  known(d.secrets, inSecrets, 'secrets');
  known(d.config, inConfig, 'config');

  const secrets: Record<string, string> = {};
  for (const s of d.secrets) {
    const v = inSecrets[s.field];
    const value = typeof v === 'string' ? v.trim() : '';
    if (!value || value.length > MAX_VALUE) bad.push(`secrets.${s.field}`);
    else secrets[s.field] = value;
  }
  const config: Record<string, string> = {};
  for (const c of d.config) {
    const v = inConfig[c.field];
    const value = typeof v === 'string' ? v.trim() : '';
    if (value.length > MAX_VALUE) bad.push(`config.${c.field}`);
    else if (value) config[c.field] = value;
    else if (!c.optional) bad.push(`config.${c.field}`);
  }
  if (!bad.length) {
    const checked = adapterOf(d, cat)?.configSchema.safeParse(config);
    if (checked && !checked.success) for (const i of checked.error.issues) bad.push(`config.${i.path.join('.') || '(config)'}`);
  }
  return bad.length ? { bad: [...new Set(bad)] } : { secrets, config };
}

interface Ctx {
  deps: AdminDeps;
  vault: Vault;
  actor: Actor;
  ctx: RequestContext;
  cat: Catalogue;
  connections: Awaited<ReturnType<typeof connectionsFor>>;
}

const toJson = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

/** Runs the test in the declared mode; on a pass the connection leaves MOCK and is switched on (only one per kind). */
async function switchOn(c: Ctx, d: ConnectionDeclaration, integrationId: string): Promise<TestOutcome> {
  const who = { actorId: c.actor.staffUserId, ip: c.ctx.ip, userAgent: c.ctx.userAgent };
  const outcome = await c.connections.setMode(integrationId, d.targetMode, who);
  const db = c.deps.db;
  if (outcome.ok) {
    await db.$transaction(async (tx) => {
      if (d.exclusive) {
        const others = await tx.integration.findMany({ where: { storeId: null, kind: d.kind, enabled: true, id: { not: integrationId } } });
        for (const o of others) {
          await tx.integration.update({ where: { id: o.id }, data: { enabled: false } });
          await audit(tx, c.actor, { action: 'integration.disable', entityType: 'Integration', entityId: o.id, before: { enabled: true, provider: o.provider }, after: { enabled: false, reason: `replaced by ${d.provider}` } }, c.ctx);
        }
      }
      const row = await tx.integration.findUniqueOrThrow({ where: { id: integrationId } });
      if (!row.enabled) {
        await tx.integration.update({ where: { id: integrationId }, data: { enabled: true } });
        await audit(tx, c.actor, { action: 'integration.enable', entityType: 'Integration', entityId: integrationId, before: { enabled: false }, after: { enabled: true, mode: row.mode } }, c.ctx);
      }
    });
  } else {
    // A key that fails its test is never used: back to MOCK (audited by setMode) and off, so the fallback serves.
    const row = await db.integration.findUniqueOrThrow({ where: { id: integrationId } });
    if (row.mode !== 'MOCK') await c.connections.setMode(integrationId, 'MOCK', who);
    if (row.enabled) {
      await db.integration.update({ where: { id: integrationId }, data: { enabled: false } });
      await audit(db, c.actor, { action: 'integration.disable', entityType: 'Integration', entityId: integrationId, before: { enabled: true }, after: { enabled: false, reason: 'test failed' } }, c.ctx);
    }
  }
  await audit(db, c.actor, { action: 'integration.test', entityType: 'Integration', entityId: integrationId, after: { ok: outcome.ok, mode: outcome.mode, latencyMs: outcome.latencyMs } }, c.ctx);
  return outcome;
}

async function save(c: Ctx, d: ConnectionDeclaration, b: Record<string, unknown>): Promise<Response> {
  const parsed = parseSave(d, b, c.cat);
  if ('bad' in parsed) return fail(400, 'INVALID_INPUT', parsed.bad);
  const db = c.deps.db;
  for (const [field, value] of Object.entries(parsed.secrets)) {
    await c.vault.put(secretName(d.provider, field), value, { storeId: null }, vaultWho(c.actor));
  }
  const secretNames = d.secrets.map((s) => secretName(d.provider, s.field));
  const existing = rowFor(await rowsOf(db), d);
  const row = existing
    ? await db.integration.update({ where: { id: existing.id }, data: { config: toJson(parsed.config), secretNames } })
    : await db.integration.create({ data: { storeId: null, kind: d.kind, provider: d.provider, name: d.id, mode: 'MOCK', enabled: false, config: toJson(parsed.config), secretNames } });
  await audit(db, c.actor, {
    action: 'integration.save',
    entityType: 'Integration',
    entityId: row.id,
    before: existing ? { config: existing.config, secrets: existing.secretNames } : null,
    after: { config: parsed.config, secrets: secretNames },
  }, c.ctx);
  c.connections.forget();
  const test = await switchOn(c, d, row.id);
  return json({ ok: true, test, connection: await viewOf(c, d) });
}

async function viewOf(c: Ctx, d: ConnectionDeclaration): Promise<ConnectionView | undefined> {
  return (await listConnections(c.deps.db, c.vault, c.cat)).find((x) => x.id === d.id);
}

async function test(c: Ctx, d: ConnectionDeclaration): Promise<Response> {
  const view = await viewOf(c, d);
  if (!view?.integrationId || !view.keySaved) return fail(409, 'NOT_CONNECTED');
  let outcome: TestOutcome;
  if (view.mode === 'MOCK') {
    outcome = await switchOn(c, d, view.integrationId);
  } else {
    outcome = await c.connections.test(view.integrationId, { actorId: c.actor.staffUserId, ip: c.ctx.ip, userAgent: c.ctx.userAgent });
    await audit(c.deps.db, c.actor, { action: 'integration.test', entityType: 'Integration', entityId: view.integrationId, after: { ok: outcome.ok, mode: outcome.mode, latencyMs: outcome.latencyMs } }, c.ctx);
  }
  return json({ ok: true, test: outcome, connection: await viewOf(c, d) });
}

async function remove(c: Ctx, d: ConnectionDeclaration): Promise<Response> {
  const view = await viewOf(c, d);
  const live = view?.secrets.filter((s) => s.set).map((s) => secretName(d.provider, s.field)) ?? [];
  if (!view?.integrationId && !live.length) return fail(409, 'NOT_CONNECTED');
  for (const name of live) await c.vault.revoke(name, { storeId: null }, vaultWho(c.actor));
  if (view?.integrationId) {
    const id = view.integrationId;
    if (view.mode !== 'MOCK') await c.connections.setMode(id, 'MOCK', { actorId: c.actor.staffUserId, ip: c.ctx.ip, userAgent: c.ctx.userAgent });
    await c.deps.db.integration.update({ where: { id }, data: { enabled: false } });
    await audit(c.deps.db, c.actor, {
      action: 'integration.remove',
      entityType: 'Integration',
      entityId: id,
      before: { mode: view.mode, enabled: view.enabled },
      after: { mode: 'MOCK', enabled: false, revoked: live },
    }, c.ctx);
  }
  c.connections.forget();
  return json({ ok: true, connection: await viewOf(c, d) });
}

/** POST /api/admin/integrations/:id {action: 'save' | 'test' | 'remove', …} */
export async function integrationHandler(request: Request, deps: AdminDeps | null, id: string, cat: Catalogue = defaultCatalogue): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'vault.write' });
  if (isResponse(g)) return g;
  const d = cat.declarations.find((x) => x.id === id);
  if (!d) return fail(404, 'NOT_FOUND');
  if (!d.adapter || d.builtIn) return fail(409, 'NOT_AVAILABLE');
  if (!deps!.vault) return fail(503, 'VAULT_NOT_CONFIGURED');
  try {
    const b = await body(request);
    const c: Ctx = { deps: deps!, vault: deps!.vault, actor: g.actor, ctx: g.ctx, cat, connections: await connectionsFor(deps!, deps!.vault, cat) };
    if (b.action === 'save') return await save(c, d, b);
    if (b.action === 'test') return await test(c, d);
    if (b.action === 'remove') return await remove(c, d);
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
