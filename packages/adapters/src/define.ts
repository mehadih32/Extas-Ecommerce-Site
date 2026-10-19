// PR 18 — the adapter framework (Blueprint A1.3). Every integration (courier, SMS, payment, AI, Meta, Drive, storage …)
// is one adapter with up to three modes: MOCK works from day one with no key, SANDBOX talks to the provider's test
// system, LIVE to the real one. The shop runs on mocks until the owner types a key into "Keys & connections" (PR 500);
// the key lives in the vault (PR 493), and an integration only leaves MOCK after its Test button passes.
//
// An adapter declares what it needs (config shape, secret fields) and how to build its client and test it. It never
// reads env, files or the vault itself: the connection layer (connections.ts) hands it everything through `ctx`.
import type { z } from 'zod';
import type { AdapterMode, IntegrationKind } from '@extas/db/client';

export type Mode = AdapterMode;
export type Kind = IntegrationKind;

export interface TestResult {
  ok: boolean;
  /** Short and human-readable; shown next to the Test button. Never carries a secret. */
  message: string;
}

export interface AdapterContext<Config> {
  mode: Mode;
  /** Validated non-secret config from the Integration row (account name, bucket, endpoint …). */
  config: Config;
  /** Installation-wide connection when null. */
  storeId: number | null;
  /** A secret field of this adapter (e.g. `accountKey`), read from the vault; null when not entered or revoked. */
  secret(field: string): Promise<string | null>;
}

export interface AdapterDefinition<Api, Config = unknown> {
  kind: Kind;
  /** Adapter key, camelCase: it prefixes the vault names of its secrets (`azureBlob.accountKey`). */
  provider: string;
  /** Modes this adapter offers besides MOCK. */
  modes: readonly Exclude<Mode, 'MOCK'>[];
  /** Secret fields; the vault name is `<provider>.<field>`. */
  secrets: readonly string[];
  configSchema: z.ZodType<Config>;
  /** The client for SANDBOX / LIVE. Throws AdapterError when a needed secret is missing. */
  create(ctx: AdapterContext<Config>): Promise<Api>;
  /** The client for MOCK: no network, no key, deterministic. */
  mock(ctx: AdapterContext<Config>): Promise<Api>;
  /** One cheap round trip that proves the connection works (read a status, write and read back a probe …). */
  test(api: Api, ctx: AdapterContext<Config>): Promise<TestResult>;
}

export class AdapterError extends Error {}

const PROVIDER = /^[a-z][a-zA-Z0-9]*$/;
const FIELD = /^[a-zA-Z0-9]+$/;

export function defineAdapter<Api, Config>(def: AdapterDefinition<Api, Config>): AdapterDefinition<Api, Config> {
  if (!PROVIDER.test(def.provider)) throw new AdapterError(`adapter provider must be camelCase, got "${def.provider}"`);
  for (const f of def.secrets) if (!FIELD.test(f)) throw new AdapterError(`secret field must be alphanumeric, got "${f}"`);
  return def;
}

export function secretName(provider: string, field: string): string {
  return `${provider}.${field}`;
}

/** Throws AdapterError naming the missing field (never a value). */
export async function requireSecret(ctx: AdapterContext<unknown>, field: string): Promise<string> {
  const v = await ctx.secret(field);
  if (!v) throw new AdapterError(`the key "${field}" is not entered yet`);
  return v;
}
