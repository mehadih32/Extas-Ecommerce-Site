// S06 · PR 567 — the multi-courier fraud data: Steadfast's own check, Pathao's own check and any aggregator behind one
// contract (contract.ts), each an adapter of kind FRAUD_CHECK with its own row in Keys & connections. Each keeps its own
// keys (vault names `steadfastFraud.*`, `pathaoFraud.*`, `fraudAggregator.*`), so removing a fraud check never touches the
// courier connection that books the parcels. Every one runs on the practice source ("nothing known") until its keys are
// in and its Test passes (A1.3); the shop asks only the connections that passed (apps/web lib/shop/courier-fraud.ts).
//
// The paths: Steadfast's check is `GET <base>/fraud_check/<number>` with the merchant API's two keys; Pathao's is
// `POST <base>/aladdin/api/v1/user/success` with a merchant token; an aggregator is `GET <its address>?phone=<number>`
// with its key as a bearer token. A different path can be set on each connection: the Test shows whether it answers with
// two counts, and a connection whose Test fails is never asked.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { PATHAO_LIVE_BASE_URL } from '../courier/pathao';
import { STEADFAST_DEFAULT_BASE_URL } from '../courier/steadfast';
import { createHttpFraudCheck, createMockFraudCheck, FraudCheckError, type FraudCheckApi } from './contract';

export * from './contract';

/** The well-formed number the Test asks about (a placeholder, never a customer's: the answer only proves the check answers). */
export const FRAUD_PROBE_NUMBER = '+8801700000000'; // hardcode-ok: a placeholder number, never a customer's; asked only by the Test button

const https = z.url({ protocol: /^https$/, message: 'not an https address' }).max(500);
const path = z
  .string()
  .trim()
  .regex(/^\/[A-Za-z0-9/_.{}-]*$/, 'a path starting with /')
  .max(200);

/** Puts the number in a path's `{phone}` (or after it). */
const withPhone = (p: string, local: string) => (p.includes('{phone}') ? p.replace('{phone}', encodeURIComponent(local)) : `${p.replace(/\/+$/, '')}/${encodeURIComponent(local)}`);
const trim = (u: string) => u.replace(/\/+$/, '');

// ---- Steadfast's own check ----
export const steadfastFraudConfig = z.object({ baseUrl: https.optional(), path: path.optional() });
export type SteadfastFraudConfig = z.output<typeof steadfastFraudConfig>;
export const STEADFAST_FRAUD_PATH = '/fraud_check/{phone}';

export const steadfastFraudAdapter = defineAdapter<FraudCheckApi, SteadfastFraudConfig>({
  kind: 'FRAUD_CHECK',
  provider: 'steadfastFraud',
  modes: ['LIVE'],
  secrets: ['apiKey', 'secretKey'],
  configSchema: steadfastFraudConfig,
  async create(ctx) {
    const [apiKey, secretKey] = await Promise.all([requireSecret(ctx, 'apiKey'), requireSecret(ctx, 'secretKey')]);
    const base = trim(ctx.config.baseUrl ?? STEADFAST_DEFAULT_BASE_URL);
    const p = ctx.config.path ?? STEADFAST_FRAUD_PATH;
    return createHttpFraudCheck({ source: 'steadfast', url: (local) => `${base}${withPhone(p, local)}`, headers: async () => ({ 'Api-Key': apiKey, 'Secret-Key': secretKey }), probe: FRAUD_PROBE_NUMBER });
  },
  async mock() {
    return createMockFraudCheck('steadfast');
  },
  async test(api) {
    return api.health();
  },
});

// ---- Pathao's own check ----
export const pathaoFraudConfig = z.object({ baseUrl: https.optional(), path: path.optional() });
export type PathaoFraudConfig = z.output<typeof pathaoFraudConfig>;
export const PATHAO_FRAUD_PATH = '/aladdin/api/v1/user/success';

type Fetch = typeof fetch;

/** Pathao's merchant token from the four keys (issued once, again after a 401). */
export function pathaoToken(base: string, keys: { clientId: string; clientSecret: string; username: string; password: string }, doFetch: Fetch = fetch) {
  let token: string | null = null;
  return {
    async get(): Promise<string> {
      if (token) return token;
      let res: Response;
      try {
        res = await doFetch(`${base}/aladdin/api/v1/issue-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ client_id: keys.clientId, client_secret: keys.clientSecret, grant_type: 'password', username: keys.username, password: keys.password }),
        });
      } catch (e) {
        throw new FraudCheckError(`Pathao did not answer: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
      }
      const body = (await res.json().catch(() => ({}))) as { access_token?: string };
      if (!res.ok || !body.access_token) throw new FraudCheckError(`Pathao gave no token (${res.status})`);
      token = body.access_token;
      return token;
    },
    forget() {
      token = null;
    },
  };
}

export const pathaoFraudAdapter = defineAdapter<FraudCheckApi, PathaoFraudConfig>({
  kind: 'FRAUD_CHECK',
  provider: 'pathaoFraud',
  modes: ['LIVE'],
  secrets: ['clientId', 'clientSecret', 'username', 'password'],
  configSchema: pathaoFraudConfig,
  async create(ctx) {
    const [clientId, clientSecret, username, password] = await Promise.all(['clientId', 'clientSecret', 'username', 'password'].map((f) => requireSecret(ctx, f)));
    const base = trim(ctx.config.baseUrl ?? PATHAO_LIVE_BASE_URL);
    const tok = pathaoToken(base, { clientId: clientId!, clientSecret: clientSecret!, username: username!, password: password! });
    const p = ctx.config.path ?? PATHAO_FRAUD_PATH;
    return createHttpFraudCheck({
      source: 'pathao',
      url: () => `${base}${p}`,
      method: 'POST',
      body: (local) => ({ phone: local }),
      headers: async () => ({ Authorization: `Bearer ${await tok.get()}` }),
      refresh: async () => tok.forget(),
      probe: FRAUD_PROBE_NUMBER,
    });
  },
  async mock() {
    return createMockFraudCheck('pathao');
  },
  async test(api) {
    return api.health();
  },
});

// ---- an aggregator (several couriers' counts summed by one service) ----
export const fraudAggregatorConfig = z.object({ baseUrl: https });
export type FraudAggregatorConfig = z.output<typeof fraudAggregatorConfig>;

export const fraudAggregatorAdapter = defineAdapter<FraudCheckApi, FraudAggregatorConfig>({
  kind: 'FRAUD_CHECK',
  provider: 'fraudAggregator',
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: fraudAggregatorConfig,
  async create(ctx) {
    const apiKey = await requireSecret(ctx, 'apiKey');
    const base = trim(ctx.config.baseUrl);
    const join = base.includes('?') ? '&' : '?';
    return createHttpFraudCheck({ source: 'aggregator', url: (local) => `${base}${join}phone=${encodeURIComponent(local)}`, headers: async () => ({ Authorization: `Bearer ${apiKey}` }), probe: FRAUD_PROBE_NUMBER });
  },
  async mock() {
    return createMockFraudCheck('aggregator');
  },
  async test(api) {
    return api.health();
  },
});

/** Every fraud check source, for the connection layer and Keys & connections. */
export const fraudCheckAdapters = [steadfastFraudAdapter, pathaoFraudAdapter, fraudAggregatorAdapter] as const;
