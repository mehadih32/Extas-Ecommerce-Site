// PR 169 — the card and bank gateway: SSLCommerz (hosted payment page; Visa, Mastercard, Amex, internet banking and the
// wallets it carries) behind the payment gateway contract. LIVE and SANDBOX talk to the address the owner types into
// "Keys & connections" (SSLCommerz gives a sandbox and a live address); MOCK is the practice gateway. The store password
// lives only in the vault; the store id is a plain connection setting. Card data never touches the shop.
//
// - `initiate`: `POST /gwprocess/v4/api.php` (form) with the amount in taka, a transaction id made from the payment's
//   idempotency key (the same payment is always the same transaction there), and our signed callback address as the
//   success, fail, cancel and IPN address (`outcome` says which page sent the customer back; it is only a hint) →
//   `GatewayPageURL`, where the customer's browser goes.
// - `confirm` and `query`: the transaction query by our transaction id
//   (`/validator/api/merchantTransIDvalidationAPI.php`): only SSLCommerz's own answer is written, and only a VALID or
//   VALIDATED payment of this transaction counts as paid. The transaction id the callback names must be ours for this
//   payment (the payments service also checks it against the payment's own reference).
// - Every failure is a PaymentGatewayError with a stable code; the password is never put into a message or a log (it
//   travels in the query of the validation call, as SSLCommerz asks, over HTTPS only).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';
import type { FetchLike } from '../erp/http-client';
import { checkCallbackSignature, PaymentGatewayError, signedCallbackUrl, type CallbackClaim, type GatewayOutcome, type PaymentGateway } from './contract';
import { createMockGateway } from './mock';

export interface SslcommerzOptions {
  baseUrl: string;
  storeId: string;
  storePassword: string;
  /** The e-mail address SSLCommerz shows as the shop's contact on its page (it asks for one on every payment). */
  contactEmail: string;
  fetch?: FetchLike;
  /** How long one call waits (ms). */
  timeoutMs?: number;
}

/** SSLCommerz's paths (part of its API, like a route). */
export const SSLCOMMERZ_PATHS = {
  session: '/gwprocess/v4/api.php',
  byTransaction: '/validator/api/merchantTransIDvalidationAPI.php',
} as const;

const DEFAULT_TIMEOUT_MS = 30_000;
const TRAN = /^EX[0-9A-F]{28}$/;

/** Minor units as SSLCommerz's amount text (taka with two decimals). */
export const sslcommerzAmount = (minor: number): string => (minor / 100).toFixed(2);
/** Our transaction id at SSLCommerz for a payment: 30 letters and digits from its idempotency key. */
export const sslcommerzTranId = (idempotencyKey: string): string => `EX${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 28).toUpperCase()}`;

const minorOf = (v: unknown): number | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const stateOf = (status: unknown): GatewayOutcome['state'] => {
  switch (String(status ?? '').toUpperCase()) {
    case 'VALID':
    case 'VALIDATED':
      return 'PAID';
    case 'CANCELLED':
    case 'UNATTEMPTED':
      return 'CANCELLED';
    case 'FAILED':
    case 'EXPIRED':
    case 'INVALID_TRANSACTION':
      return 'FAILED';
    default:
      return 'PENDING';
  }
};

/** What a callback's page or IPN status hints at. */
const claimOf = (outcome: string | undefined, status: string | undefined): CallbackClaim | null => {
  if (outcome === 'success' || outcome === 'failure' || outcome === 'cancel') return outcome;
  const s = stateOf(status);
  return s === 'PAID' ? 'success' : s === 'CANCELLED' ? 'cancel' : s === 'FAILED' ? 'failure' : null;
};

export function createSslcommerzGateway(o: SslcommerzOptions): PaymentGateway {
  const base = o.baseUrl.replace(/\/+$/, '');

  async function call(path: string, init: { method: 'GET' | 'POST'; query?: Record<string, string>; form?: Record<string, string> }): Promise<Record<string, unknown>> {
    const f = o.fetch ?? fetch;
    const u = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) u.searchParams.set(k, v);
    let res: Response;
    try {
      res = await f(u.toString(), {
        method: init.method,
        headers: { accept: 'application/json', ...(init.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        body: init.form ? new URLSearchParams(init.form).toString() : undefined,
        signal: AbortSignal.timeout(o.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (e) {
      throw new PaymentGatewayError('UNREACHABLE', `SSLCommerz did not answer (${e instanceof Error ? e.name : 'error'})`, true);
    }
    if (res.status === 401 || res.status === 403) throw new PaymentGatewayError('REJECTED', `SSLCommerz refused the store (HTTP ${res.status})`);
    if (res.status >= 500) throw new PaymentGatewayError('UNREACHABLE', `SSLCommerz had a problem (HTTP ${res.status})`, true);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new PaymentGatewayError('BAD_ANSWER', `SSLCommerz's answer is not JSON (HTTP ${res.status})`);
    }
    if (!json || typeof json !== 'object') throw new PaymentGatewayError('BAD_ANSWER', 'SSLCommerz answered nothing');
    return json as Record<string, unknown>;
  }

  async function query(providerRef: string): Promise<GatewayOutcome> {
    if (!TRAN.test(providerRef) && providerRef !== 'probe') throw new PaymentGatewayError('BAD_ANSWER', 'not one of our SSLCommerz transaction ids');
    const r = await call(SSLCOMMERZ_PATHS.byTransaction, { method: 'GET', query: { tran_id: providerRef, store_id: o.storeId, store_passwd: o.storePassword, format: 'json' } });
    if (String(r.APIConnect ?? '').toUpperCase() !== 'DONE') {
      const why = String(r.APIConnect ?? 'no answer');
      if (/INACTIVE|INVALID_REQUEST/i.test(why)) throw new PaymentGatewayError('REJECTED', `SSLCommerz refused the store (${why.slice(0, 60)})`);
      throw new PaymentGatewayError('BAD_ANSWER', `SSLCommerz did not answer the query (${why.slice(0, 60)})`);
    }
    const rows = (Array.isArray(r.element) ? r.element : []).filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object' && (e as Record<string, unknown>).tran_id === providerRef);
    const paid = rows.find((e) => stateOf(e.status) === 'PAID');
    const row = paid ?? rows.at(-1);
    if (!row) return { state: 'PENDING', providerRef, providerTrxId: null, amountMinor: null, currency: null, failureCode: null };
    const state = stateOf(row.status);
    return {
      state,
      providerRef,
      providerTrxId: state === 'PAID' ? String(row.bank_tran_id ?? row.val_id ?? '') || null : null,
      amountMinor: minorOf(row.currency_amount ?? row.amount),
      currency: typeof row.currency_type === 'string' ? row.currency_type : typeof row.currency === 'string' ? row.currency : null,
      failureCode: state === 'FAILED' || state === 'CANCELLED' ? String(row.status ?? 'FAILED').slice(0, 60) : null,
    };
  }

  return {
    provider: 'sslcommerz',
    async initiate(i) {
      const tranId = sslcommerzTranId(i.idempotencyKey);
      const back = (outcome: CallbackClaim | null) => {
        const u = new URL(signedCallbackUrl(o.storePassword, 'sslcommerz', i.callbackBaseUrl, i.paymentId));
        if (outcome) u.searchParams.set('outcome', outcome);
        return u.toString();
      };
      const r = await call(SSLCOMMERZ_PATHS.session, {
        method: 'POST',
        form: {
          store_id: o.storeId,
          store_passwd: o.storePassword,
          total_amount: sslcommerzAmount(i.amountMinor),
          currency: i.currency,
          tran_id: tranId,
          success_url: back('success'),
          fail_url: back('failure'),
          cancel_url: back('cancel'),
          ipn_url: back(null),
          shipping_method: 'NO',
          product_name: i.orderNumber,
          product_category: 'order',
          product_profile: 'physical-goods',
          num_of_item: '1',
          cus_name: i.orderNumber,
          cus_email: o.contactEmail,
          cus_phone: i.payerReference,
          cus_add1: i.orderNumber,
          cus_city: 'NA',
          cus_country: 'Bangladesh',
          value_a: i.orderNumber,
        },
      });
      const url = typeof r.GatewayPageURL === 'string' && r.GatewayPageURL ? r.GatewayPageURL : null;
      if (String(r.status ?? '').toUpperCase() !== 'SUCCESS' || !url) throw new PaymentGatewayError('REJECTED', `SSLCommerz did not open a payment (${String(r.failedreason ?? r.status ?? 'no reason').slice(0, 120)})`);
      return { providerRef: tranId, redirectUrl: url, expiresAt: null };
    },
    readCallback({ params }) {
      const s = checkCallbackSignature(o.storePassword, 'sslcommerz', params);
      if (!s.ok) return s;
      const ref = params.tran_id ?? '';
      const claim = claimOf(params.outcome, params.status);
      if (!TRAN.test(ref) || !claim) return { ok: false, reason: 'malformed' };
      return { ok: true, paymentId: s.paymentId, providerRef: ref, claim, eventKey: `${ref}:${claim}:${(params.val_id ?? '').slice(0, 60)}` };
    },
    async confirm(read) {
      const q = await query(read.providerRef);
      if (q.state !== 'PENDING' || read.claim === 'success') return q;
      return { ...q, state: read.claim === 'cancel' ? 'CANCELLED' : 'FAILED', failureCode: read.claim === 'cancel' ? 'CUSTOMER_CANCELLED' : 'CARD_FAILURE' };
    },
    query,
  };
}

export const sslcommerzConfigSchema = z
  .object({
    baseUrl: z.url({ protocol: /^https$/ }),
    storeId: z.string().regex(/^[A-Za-z0-9_-]{2,60}$/),
    contactEmail: z.email(),
  })
  .strict();
export type SslcommerzConfig = z.infer<typeof sslcommerzConfigSchema>;

/** The card and bank connection: MOCK (the practice gateway) until the owner's store passes the Test button. */
export const sslcommerzAdapter = defineAdapter<PaymentGateway, SslcommerzConfig>({
  kind: 'PAYMENT',
  provider: 'sslcommerz',
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['storePassword'],
  configSchema: sslcommerzConfigSchema,
  async create(ctx) {
    if (!ctx.config.baseUrl || !ctx.config.storeId || !ctx.config.contactEmail) throw new AdapterError('the SSLCommerz address, store id or contact e-mail is not entered yet');
    return createSslcommerzGateway({ baseUrl: ctx.config.baseUrl, storeId: ctx.config.storeId, contactEmail: ctx.config.contactEmail, storePassword: await requireSecret(ctx, 'storePassword') });
  },
  async mock() {
    return createMockGateway('sslcommerz');
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'practice card gateway: no money moves' };
    // one cheap round trip: the query of a transaction that does not exist proves the store id and password work
    try {
      await api.query('probe');
      return { ok: true, message: 'SSLCommerz answered: the store id and password work' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
});
