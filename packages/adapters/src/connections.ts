// The connection layer (PR 18): finds the Integration row for a kind, builds its adapter in the row's mode with the
// row's config and the vault's keys, runs the Test button, and moves a connection between MOCK, SANDBOX and LIVE.
//
// - Lookup: the store's own connection first, then the installation-wide one, then the kind's fallback (storage →
//   local disk), then the kind's mock. So nothing ever waits for a key (A1.3).
// - A connection leaves MOCK only after a test in the target mode passes; every switch is in the audit log.
// - Decrypted keys stay in memory for `secretCacheMs`, so the vault's access log gets one row per refresh instead of
//   one per request (PR 493 note). Other app replicas pick up a change when their cache expires.
// - Test messages never carry a key: any secret value read during the test is scrubbed from the message.
import type { PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';
import { AdapterError, secretName, type AdapterContext, type AdapterDefinition, type Kind, type Mode, type TestResult } from './define';

type Db = Pick<PrismaClient, 'integration' | 'integrationTestRun' | 'auditLog' | '$transaction'>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdapter = AdapterDefinition<any, any>;

export interface Fallback {
  provider: string;
  mode: Mode;
  config: unknown;
}

export interface ConnectionOptions {
  db: Db;
  vault: Pick<Vault, 'get'>;
  adapters: readonly AnyAdapter[];
  /** How long a decrypted key and a resolved connection stay in memory (ms). */
  secretCacheMs: number;
  /** How long the Test button waits for the provider (ms). */
  testTimeoutMs: number;
  /** Used when no connection of a kind is set up, e.g. STORAGE → local disk on the media volume. */
  fallbacks?: Partial<Record<Kind, Fallback>>;
  now?: () => number;
}

export interface Connected<Api> {
  api: Api;
  integrationId: string | null;
  provider: string;
  mode: Mode;
}

export interface Who {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface TestOutcome extends TestResult {
  latencyMs: number;
  mode: Mode;
}

export function createConnections(opts: ConnectionOptions) {
  const now = opts.now ?? Date.now;
  const byKey = new Map<string, AnyAdapter>();
  for (const a of opts.adapters) {
    const k = `${a.kind}:${a.provider}`;
    if (byKey.has(k)) throw new AdapterError(`adapter ${k} is registered twice`);
    byKey.set(k, a);
  }
  const secrets = new Map<string, { value: string | null; at: number }>();
  const resolved = new Map<string, { value: Connected<unknown>; at: number }>();

  function adapter(kind: Kind, provider: string): AnyAdapter {
    const a = byKey.get(`${kind}:${provider}`);
    if (!a) throw new AdapterError(`no adapter "${provider}" for ${kind}`);
    return a;
  }

  function context(a: AnyAdapter, mode: Mode, rawConfig: unknown, storeId: number | null, seen?: string[]): AdapterContext<unknown> {
    const parsed = a.configSchema.safeParse(rawConfig ?? {});
    // A mock needs no settings: it runs before the owner has filled anything in.
    if (!parsed.success && mode !== 'MOCK') {
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(config)'))].join(', ');
      throw new AdapterError(`settings for ${a.provider} are incomplete or wrong: ${fields}`);
    }
    return {
      mode,
      config: parsed.success ? parsed.data : (rawConfig ?? {}),
      storeId,
      async secret(field) {
        if (!a.secrets.includes(field)) throw new AdapterError(`${a.provider} has no key "${field}"`);
        const name = secretName(a.provider, field);
        const ck = `${storeId ?? '-'}:${name}`;
        const hit = secrets.get(ck);
        let value: string | null;
        if (hit && now() - hit.at < opts.secretCacheMs) value = hit.value;
        else {
          value = await opts.vault.get(name, { storeId }, { service: `adapter:${a.provider}`, purpose: `${a.kind} ${mode}` });
          secrets.set(ck, { value, at: now() });
        }
        if (value && seen) seen.push(value);
        return value;
      },
    };
  }

  async function build(a: AnyAdapter, ctx: AdapterContext<unknown>) {
    return ctx.mode === 'MOCK' ? a.mock(ctx) : a.create(ctx);
  }

  async function findRow(kind: Kind, storeId: number | null, provider?: string) {
    const where = { kind, enabled: true, archivedAt: null, ...(provider ? { provider } : {}) };
    const tiers = storeId == null ? [null] : [storeId, null];
    for (const tier of tiers) {
      const rows = await opts.db.integration.findMany({ where: { ...where, storeId: tier }, orderBy: { updatedAt: 'desc' } });
      if (rows.length > 1) throw new AdapterError(`more than one ${kind} connection is switched on; name the provider`);
      if (rows[0]) return rows[0];
    }
    return null;
  }

  /** The Test button: one round trip in `mode` (default: the connection's own), recorded on the connection. */
async function test(integrationId: string, who: Who = {}, mode?: Mode): Promise<TestOutcome> {
    const row = await opts.db.integration.findUniqueOrThrow({ where: { id: integrationId } });
    const runMode = mode ?? row.mode;
    const seen: string[] = [];
    const started = performance.now();
    let result: TestResult;
    try {
      const a = adapter(row.kind, row.provider);
      if (runMode !== 'MOCK' && !a.modes.includes(runMode)) throw new AdapterError(`${a.provider} has no ${runMode} mode`);
      const ctx = context(a, runMode, row.config, row.storeId, seen);
      result = await withTimeout(a.test(await build(a, ctx), ctx), opts.testTimeoutMs);
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    const latencyMs = Math.round(performance.now() - started);
    const message = scrub(result.message, seen);
    await opts.db.$transaction([
      opts.db.integrationTestRun.create({
        data: { integrationId, storeId: row.storeId, ok: result.ok, latencyMs, message, actorId: who.actorId ?? null },
      }),
      opts.db.integration.update({
        where: { id: integrationId },
        data: { lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: message },
      }),
    ]);
    return { ok: result.ok, message, latencyMs, mode: runMode };
  }

  function forget() {
    secrets.clear();
    resolved.clear();
  }

  return {
    test,
    forget,

    /** The adapter to use right now for `kind` (optionally one provider), for a store or the installation. */
    async use<Api>(kind: Kind, where: { storeId?: number | null; provider?: string } = {}): Promise<Connected<Api>> {
      const storeId = where.storeId ?? null;
      const rk = `${kind}:${storeId ?? '-'}:${where.provider ?? '*'}`;
      const hit = resolved.get(rk);
      if (hit && now() - hit.at < opts.secretCacheMs) return hit.value as Connected<Api>;

      let value: Connected<unknown>;
      const row = await findRow(kind, storeId, where.provider);
      if (row) {
        const a = adapter(kind, row.provider);
        const ctx = context(a, row.mode, row.config, row.storeId);
        value = { api: await build(a, ctx), integrationId: row.id, provider: row.provider, mode: row.mode };
      } else {
        const fb = opts.fallbacks?.[kind];
        const a = fb && (!where.provider || where.provider === fb.provider)
          ? adapter(kind, fb.provider)
          : opts.adapters.find((x) => x.kind === kind && (!where.provider || x.provider === where.provider));
        if (!a) throw new AdapterError(`no adapter for ${kind}${where.provider ? ` / ${where.provider}` : ''}`);
        const mode: Mode = fb && a.provider === fb.provider ? fb.mode : 'MOCK';
        const ctx = context(a, mode, fb && a.provider === fb.provider ? fb.config : {}, storeId);
        value = { api: await build(a, ctx), integrationId: null, provider: a.provider, mode };
      }
      resolved.set(rk, { value, at: now() });
      return value as Connected<Api>;
    },

    /**
     * PR 196 — one key of the connection `use` would pick, for checking what comes in from that service (an incoming
     * webhook's signature). Null when no connection row is switched on or the key is not in the vault. Read through
     * the same cache as the adapters' own keys (one vault access-log row per refresh).
     */
    async secretOf(kind: Kind, field: string, where: { storeId?: number | null; provider?: string } = {}): Promise<{ value: string; integrationId: string; provider: string; mode: Mode; storeId: number | null } | null> {
      const row = await findRow(kind, where.storeId ?? null, where.provider);
      if (!row) return null;
      const a = adapter(kind, row.provider);
      if (!a.secrets.includes(field)) return null;
      let value: string | null;
      try {
        value = await context(a, row.mode, row.config, row.storeId).secret(field);
      } catch {
        // A connection whose settings are broken is not one to trust incoming messages for.
        return null;
      }
      return value ? { value, integrationId: row.id, provider: row.provider, mode: row.mode, storeId: row.storeId } : null;
    },

    /** Moves a connection to `mode`. Leaving MOCK needs a passing test in that mode first; the switch is audited. */
    async setMode(integrationId: string, mode: Mode, who: Who = {}): Promise<TestOutcome> {
      const row = await opts.db.integration.findUniqueOrThrow({ where: { id: integrationId } });
      const outcome: TestOutcome = mode === 'MOCK'
        ? { ok: true, message: 'switched to mock', latencyMs: 0, mode }
        : await test(integrationId, who, mode);
      if (!outcome.ok || row.mode === mode) return outcome;
      await opts.db.$transaction([
        opts.db.integration.update({ where: { id: integrationId }, data: { mode } }),
        opts.db.auditLog.create({
          data: {
            storeId: row.storeId,
            actorType: who.actorId ? 'STAFF' : 'SYSTEM',
            actorId: who.actorId ?? null,
            action: 'integration.mode',
            entityType: 'Integration',
            entityId: integrationId,
            before: { mode: row.mode },
            after: { mode },
            ip: who.ip ?? null,
            userAgent: who.userAgent ?? null,
            source: 'adapters',
          },
        }),
      ]);
      forget();
      return outcome;
    },
  };
}

export type Connections = ReturnType<typeof createConnections>;

function scrub(message: string, secrets: string[]): string {
  let m = message;
  for (const s of secrets) if (s.length >= 4) m = m.split(s).join('***');
  return m.slice(0, 500);
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AdapterError(`no answer within ${Math.round(ms / 1000)} s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
