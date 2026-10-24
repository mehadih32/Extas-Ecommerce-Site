// PR 167 — bKash (tokenized checkout) behind the payment gateway contract. LIVE and SANDBOX talk to the address the
// owner types into "Keys & connections" (bKash gives a sandbox and a live address); MOCK is the practice gateway, so the
// shop runs from day one with no key. The four keys (app key, app secret, username, password) live only in the vault.
//
// - Token: `POST /tokenized/checkout/token/grant` (headers username + password; body app_key + app_secret) gives an
//   id_token, kept in memory until shortly before it expires; never written anywhere.
// - `initiate`: `POST /tokenized/checkout/create` (mode 0011, intent sale, the amount in taka as text, our signed
//   callback address, the payment's idempotency key as merchantInvoiceNumber) → paymentID + bkashURL.
// - `confirm`: a "success" callback is executed on the server (`/tokenized/checkout/execute`); any other claim, or an
//   execute that does not say Completed, is checked with the status query (`/tokenized/checkout/payment/status`). Only
//   bKash's own answer is written (never the redirect).
// - Every failure is a PaymentGatewayError with a stable code; a key is never put into a message, a URL or a log.
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';
import type { FetchLike } from '../erp/http-client';
import { checkCallbackSignature, PaymentGatewayError, signedCallbackUrl, type CallbackClaim, type GatewayOutcome, type PaymentGateway } from './contract';
import { createMockGateway } from './mock';

export interface BkashOptions {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  fetch?: FetchLike;
  now?: () => number;
  /** How long one call waits (ms). */
  timeoutMs?: number;
}

/** bKash's paths of the tokenized checkout (part of its API, like a route). */
export const BKASH_PATHS = {
  grant: '/tokenized/checkout/token/grant',
  create: '/tokenized/checkout/create',
  execute: '/tokenized/checkout/execute',
  status: '/tokenized/checkout/payment/status',
} as const;

const OK_CODE = '0000';
const TOKEN_EARLY_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Minor units as bKash's amount text (taka with two decimals). */
export const bkashAmount = (minor: number): string => (minor / 100).toFixed(2);
const minorOf = (v: unknown): number | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const stateOf = (transactionStatus: unknown): GatewayOutcome['state'] => {
  switch (String(transactionStatus ?? '').toLowerCase()) {
    case 'completed':
      return 'PAID';
    case 'cancelled':
      return 'CANCELLED';
    case 'failed':
    case 'expired':
    case 'declined':
      return 'FAILED';
    default:
      return 'PENDING';
  }
};

export function createBkashGateway(o: BkashOptions): PaymentGateway {
  const base = o.baseUrl.replace(/\/+$/, '');
  const now = o.now ?? Date.now;
  let token: { value: string; until: number } | null = null;

  async function call(path: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const f = o.fetch ?? fetch;
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (e) {
      throw new PaymentGatewayError('UNREACHABLE', `bKash did not answer (${e instanceof Error ? e.name : 'error'})`, true);
    }
    if (res.status === 401 || res.status === 403) throw new PaymentGatewayError('REJECTED', `bKash refused the keys (HTTP ${res.status})`);
    if (res.status >= 500) throw new PaymentGatewayError('UNREACHABLE', `bKash had a problem (HTTP ${res.status})`, true);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new PaymentGatewayError('BAD_ANSWER', `bKash's answer is not JSON (HTTP ${res.status})`);
    }
    if (!json || typeof json !== 'object') throw new PaymentGatewayError('BAD_ANSWER', 'bKash answered nothing');
    return json as Record<string, unknown>;
  }

  async function idToken(): Promise<string> {
    if (token && now() < token.until) return token.value;
    const r = await call(BKASH_PATHS.grant, { username: o.username, password: o.password }, { app_key: o.appKey, app_secret: o.appSecret });
    const value = typeof r.id_token === 'string' ? r.id_token : null;
    if (!value) throw new PaymentGatewayError('REJECTED', `bKash gave no token (${String(r.statusMessage ?? r.statusCode ?? 'no reason')})`);
    const seconds = Number(r.expires_in);
    token = { value, until: now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : TOKEN_EARLY_MS * 2) - TOKEN_EARLY_MS };
    return value;
  }

  const authed = async (path: string, body: Record<string, unknown>) => call(path, { authorization: await idToken(), 'x-app-key': o.appKey }, body);

  const outcomeOf = (r: Record<string, unknown>, ref: string): GatewayOutcome => {
    const code = r.statusCode === undefined ? null : String(r.statusCode);
    const state = code !== null && code !== OK_CODE && r.transactionStatus === undefined ? 'FAILED' : stateOf(r.transactionStatus);
    return {
      state,
      providerRef: typeof r.paymentID === 'string' ? r.paymentID : ref,
      providerTrxId: state === 'PAID' && typeof r.trxID === 'string' ? r.trxID : null,
      amountMinor: minorOf(r.amount),
      currency: typeof r.currency === 'string' ? r.currency : null,
      failureCode: state === 'FAILED' || state === 'CANCELLED' ? (code ?? String(r.transactionStatus ?? 'FAILED')) : null,
    };
  };

  async function query(providerRef: string): Promise<GatewayOutcome> {
    return outcomeOf(await authed(BKASH_PATHS.status, { paymentID: providerRef }), providerRef);
  }

  return {
    provider: 'bkash',
    async initiate(i) {
      const r = await authed(BKASH_PATHS.create, {
        mode: '0011',
        payerReference: i.payerReference,
        callbackURL: signedCallbackUrl(o.appSecret, 'bkash', i.callbackBaseUrl, i.paymentId),
        amount: bkashAmount(i.amountMinor),
        currency: i.currency,
        intent: 'sale',
        merchantInvoiceNumber: i.idempotencyKey.slice(0, 255),
      });
      const ref = typeof r.paymentID === 'string' ? r.paymentID : null;
      const url = typeof r.bkashURL === 'string' ? r.bkashURL : null;
      if (!ref || !url) throw new PaymentGatewayError('REJECTED', `bKash did not open a payment (${String(r.statusMessage ?? r.statusCode ?? 'no reason')})`);
      return { providerRef: ref, redirectUrl: url, expiresAt: null };
    },
    readCallback({ params }) {
      const s = checkCallbackSignature(o.appSecret, 'bkash', params);
      if (!s.ok) return s;
      const ref = params.paymentID ?? '';
      const claim = params.status as CallbackClaim;
      if (!/^[A-Za-z0-9_-]{4,100}$/.test(ref) || !['success', 'failure', 'cancel'].includes(claim)) return { ok: false, reason: 'malformed' };
      return { ok: true, paymentId: s.paymentId, providerRef: ref, claim, eventKey: `${ref}:${claim}` };
    },
    async confirm(read) {
      // the tokenized checkout takes money only when we execute it: a session never executed cannot be paid
      const ref = read.providerRef;
      const claimed: GatewayOutcome = { state: read.claim === 'cancel' ? 'CANCELLED' : 'FAILED', providerRef: ref, providerTrxId: null, amountMinor: null, currency: null, failureCode: read.claim === 'cancel' ? 'CUSTOMER_CANCELLED' : 'BKASH_FAILURE' };
      if (read.claim === 'success') {
        const ex = outcomeOf(await authed(BKASH_PATHS.execute, { paymentID: ref }), ref);
        if (ex.state === 'PAID') return ex;
        // executed before (a repeat), or refused: bKash's status decides; with no answer the execute's own stands
        const q = await query(ref);
        return q.state === 'PENDING' ? ex : q;
      }
      const q = await query(ref);
      return q.state === 'PENDING' ? claimed : q;
    },
    query,
  };
}

export const bkashConfigSchema = z.object({ baseUrl: z.url({ protocol: /^https$/ }) }).strict();
export type BkashConfig = z.infer<typeof bkashConfigSchema>;

/** The bKash connection: MOCK (the practice gateway) until the owner's keys pass the Test button. */
export const bkashAdapter = defineAdapter<PaymentGateway, BkashConfig>({
  kind: 'PAYMENT',
  provider: 'bkash',
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['appKey', 'appSecret', 'username', 'password'],
  configSchema: bkashConfigSchema,
  async create(ctx) {
    if (!ctx.config.baseUrl) throw new AdapterError('the bKash address is not entered yet');
    return createBkashGateway({
      baseUrl: ctx.config.baseUrl,
      appKey: await requireSecret(ctx, 'appKey'),
      appSecret: await requireSecret(ctx, 'appSecret'),
      username: await requireSecret(ctx, 'username'),
      password: await requireSecret(ctx, 'password'),
    });
  },
  async mock() {
    return createMockGateway('bkash');
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'practice bKash: no money moves' };
    // one cheap round trip: the status of a session that does not exist proves the keys and the address work
    try {
      await api.query('probe');
      return { ok: true, message: 'bKash answered: the address and the keys work' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
});
