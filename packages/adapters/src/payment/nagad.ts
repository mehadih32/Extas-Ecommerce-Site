// PR 168 — Nagad (the merchant payment gateway, "check-out" API) behind the payment gateway contract. LIVE and SANDBOX
// talk to the address the owner types into "Keys & connections" (Nagad gives a sandbox and a live address); MOCK is the
// practice gateway, so the shop runs from day one with no key. The merchant's private key and Nagad's public key live
// only in the vault; the merchant id and the merchant's Nagad number are plain connection settings.
//
// - `initiate`: `POST /api/dfs/check-out/initialize/{merchantId}/{orderId}` with the merchant id, the time, the order id
//   and a random challenge, encrypted with Nagad's public key (RSA, PKCS#1 v1.5) and signed with the merchant's private
//   key (SHA256withRSA); Nagad answers encrypted to the merchant's key: the payment reference and its own challenge.
//   Then `POST /api/dfs/check-out/complete/{paymentReferenceId}` with the amount in taka, the challenge and our signed
//   callback address → the address the customer's browser goes to. The order id is made from the payment's
//   idempotency key (20 letters and digits), so the same payment is always the same order at Nagad.
// - `confirm` and `query`: `GET /api/dfs/verify/payment/{paymentRefId}` — only Nagad's own answer is written (never the
//   redirect's `status`).
// - Every failure is a PaymentGatewayError with a stable code; a key is never put into a message, a URL or a log.
import { constants, createHash, createPrivateKey, createPublicKey, createSign, privateDecrypt, publicEncrypt, randomBytes, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';
import type { FetchLike } from '../erp/http-client';
import { checkCallbackSignature, PaymentGatewayError, signedCallbackUrl, type CallbackClaim, type GatewayOutcome, type PaymentGateway } from './contract';
import { createMockGateway } from './mock';

export interface NagadOptions {
  baseUrl: string;
  merchantId: string;
  /** The merchant's own Nagad account number. */
  merchantNumber: string;
  /** The merchant's RSA private key (PEM, or its base64 body as Nagad hands it out). */
  merchantPrivateKey: string;
  /** Nagad's RSA public key (PEM, or its base64 body). */
  nagadPublicKey: string;
  /** The server's public IPv4 address, when Nagad asks for it (`X-KM-IP-V4`). */
  ipV4?: string | null;
  fetch?: FetchLike;
  now?: () => Date;
  /** How long one call waits (ms). */
  timeoutMs?: number;
}

/** Nagad's paths of the check-out API (part of its API, like a route). */
export const NAGAD_PATHS = {
  initialize: '/api/dfs/check-out/initialize',
  complete: '/api/dfs/check-out/complete',
  verify: '/api/dfs/verify/payment',
} as const;

/** The API version and client type Nagad's check-out expects in its headers. */
const NAGAD_HEADERS = { 'X-KM-Api-Version': 'v-0.2.0', 'X-KM-Client-Type': 'PC_WEB' } as const;
/** ISO 4217 numeric code of the taka, as Nagad wants it. */
const BDT_NUMERIC = '050';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Minor units as Nagad's amount text (taka with two decimals). */
export const nagadAmount = (minor: number): string => (minor / 100).toFixed(2);

/** Nagad's order id for a payment: 20 letters and digits from its idempotency key (the same key, the same order). */
export const nagadOrderId = (idempotencyKey: string): string => `EX${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 18).toUpperCase()}`;

/** Nagad's time stamp: yyyyMMddHHmmss in Bangladesh time (UTC+6, no daylight saving). */
export function nagadDateTime(at: Date): string {
  const d = new Date(at.getTime() + 6 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/**
 * A key as PEM: Nagad hands keys out as a bare base64 body, and a one-line box in "Keys & connections" drops the line
 * breaks of a pasted PEM; either way the body is taken and wrapped again.
 */
export function nagadPem(text: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  const body = text.replace(/-----(BEGIN|END)[A-Z ]*-----/g, '').replace(/\s+/g, '');
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)?.join('\n') ?? ''}\n-----END ${label}-----\n`;
}

const stateOf = (status: unknown): GatewayOutcome['state'] => {
  switch (String(status ?? '').toLowerCase()) {
    case 'success':
      return 'PAID';
    case 'aborted':
    case 'cancelled':
      return 'CANCELLED';
    case 'failed':
    case 'fail':
    case 'refunded':
    case 'expired':
    case 'invalidrequest':
      return 'FAILED';
    default:
      return 'PENDING';
  }
};

const minorOf = (v: unknown): number | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function createNagadGateway(o: NagadOptions): PaymentGateway {
  const base = o.baseUrl.replace(/\/+$/, '');
  const now = o.now ?? (() => new Date());
  let keys: { priv: KeyObject; pub: KeyObject } | null = null;
  const keysOf = () => {
    if (keys) return keys;
    try {
      keys = { priv: createPrivateKey(nagadPem(o.merchantPrivateKey, 'PRIVATE KEY')), pub: createPublicKey(nagadPem(o.nagadPublicKey, 'PUBLIC KEY')) };
    } catch {
      throw new PaymentGatewayError('NOT_CONFIGURED', 'a Nagad key is not a valid RSA key');
    }
    return keys;
  };
  const encrypt = (data: unknown) => publicEncrypt({ key: keysOf().pub, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(JSON.stringify(data))).toString('base64');
  const sign = (data: unknown) => createSign('RSA-SHA256').update(JSON.stringify(data)).sign(keysOf().priv).toString('base64');
  const decrypt = (b64: string): Record<string, unknown> => {
    try {
      const j = JSON.parse(privateDecrypt({ key: keysOf().priv, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(b64, 'base64')).toString('utf8')) as unknown;
      if (j && typeof j === 'object') return j as Record<string, unknown>;
    } catch {
      // falls through
    }
    throw new PaymentGatewayError('BAD_ANSWER', "Nagad's answer could not be read with the merchant key");
  };

  async function call(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const f = o.fetch ?? fetch;
    const headers: Record<string, string> = { accept: 'application/json', ...NAGAD_HEADERS };
    if (o.ipV4) headers['X-KM-IP-V4'] = o.ipV4;
    if (body) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await f(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(o.timeoutMs ?? DEFAULT_TIMEOUT_MS) });
    } catch (e) {
      throw new PaymentGatewayError('UNREACHABLE', `Nagad did not answer (${e instanceof Error ? e.name : 'error'})`, true);
    }
    if (res.status === 401 || res.status === 403) throw new PaymentGatewayError('REJECTED', `Nagad refused the keys (HTTP ${res.status})`);
    if (res.status >= 500) throw new PaymentGatewayError('UNREACHABLE', `Nagad had a problem (HTTP ${res.status})`, true);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new PaymentGatewayError('BAD_ANSWER', `Nagad's answer is not JSON (HTTP ${res.status})`);
    }
    if (!json || typeof json !== 'object') throw new PaymentGatewayError('BAD_ANSWER', 'Nagad answered nothing');
    return json as Record<string, unknown>;
  }

  const reason = (r: Record<string, unknown>) => String(r.message ?? r.reason ?? r.status ?? 'no reason').slice(0, 120);

  async function query(providerRef: string): Promise<GatewayOutcome> {
    if (!/^[A-Za-z0-9_-]{4,100}$/.test(providerRef)) throw new PaymentGatewayError('BAD_ANSWER', 'not a Nagad payment reference');
    const r = await call('GET', `${NAGAD_PATHS.verify}/${encodeURIComponent(providerRef)}`);
    const state = stateOf(r.status);
    return {
      state,
      providerRef: typeof r.paymentRefId === 'string' ? r.paymentRefId : providerRef,
      providerTrxId: state === 'PAID' && typeof r.issuerPaymentRefNo === 'string' ? r.issuerPaymentRefNo : null,
      amountMinor: minorOf(r.amount),
      currency: state === 'PAID' ? 'BDT' : null,
      failureCode: state === 'FAILED' || state === 'CANCELLED' ? String(r.statusCode ?? r.status ?? 'FAILED').slice(0, 60) : null,
    };
  }

  return {
    provider: 'nagad',
    async initiate(i) {
      if (i.currency !== 'BDT') throw new PaymentGatewayError('REJECTED', 'Nagad takes taka only');
      const orderId = nagadOrderId(i.idempotencyKey);
      const dateTime = nagadDateTime(now());
      const first = { merchantId: o.merchantId, datetime: dateTime, orderId, challenge: randomBytes(20).toString('hex') };
      const init = await call('POST', `${NAGAD_PATHS.initialize}/${encodeURIComponent(o.merchantId)}/${orderId}`, { accountNumber: o.merchantNumber, dateTime, sensitiveData: encrypt(first), signature: sign(first) });
      if (typeof init.sensitiveData !== 'string') throw new PaymentGatewayError('REJECTED', `Nagad did not open a payment (${reason(init)})`);
      const opened = decrypt(init.sensitiveData);
      const ref = typeof opened.paymentReferenceId === 'string' ? opened.paymentReferenceId : null;
      const challenge = typeof opened.challenge === 'string' ? opened.challenge : null;
      if (!ref || !challenge) throw new PaymentGatewayError('BAD_ANSWER', 'Nagad gave no payment reference');
      const order = { merchantId: o.merchantId, orderId, currencyCode: BDT_NUMERIC, amount: nagadAmount(i.amountMinor), challenge };
      const done = await call('POST', `${NAGAD_PATHS.complete}/${encodeURIComponent(ref)}`, {
        sensitiveData: encrypt(order),
        signature: sign(order),
        merchantCallbackURL: signedCallbackUrl(o.merchantPrivateKey, 'nagad', i.callbackBaseUrl, i.paymentId),
        additionalMerchantInfo: { orderNumber: i.orderNumber },
      });
      const url = typeof done.callBackUrl === 'string' ? done.callBackUrl : null;
      if (String(done.status ?? '').toLowerCase() !== 'success' || !url) throw new PaymentGatewayError('REJECTED', `Nagad did not open a payment (${reason(done)})`);
      return { providerRef: ref, redirectUrl: url, expiresAt: null };
    },
    readCallback({ params }) {
      const s = checkCallbackSignature(o.merchantPrivateKey, 'nagad', params);
      if (!s.ok) return s;
      const ref = params.payment_ref_id ?? '';
      if (!/^[A-Za-z0-9_-]{4,100}$/.test(ref)) return { ok: false, reason: 'malformed' };
      const st = (params.status ?? '').toLowerCase();
      const claim: CallbackClaim = st === 'success' ? 'success' : st === 'aborted' || st === 'cancelled' ? 'cancel' : 'failure';
      return { ok: true, paymentId: s.paymentId, providerRef: ref, claim, eventKey: `${ref}:${claim}` };
    },
    async confirm(read) {
      // the redirect's status is only a hint: Nagad's verify decides; with no answer yet, a cancel or failure stands
      const q = await query(read.providerRef);
      if (q.state !== 'PENDING' || read.claim === 'success') return q;
      return { ...q, state: read.claim === 'cancel' ? 'CANCELLED' : 'FAILED', failureCode: read.claim === 'cancel' ? 'CUSTOMER_CANCELLED' : 'NAGAD_FAILURE' };
    },
    query,
  };
}

export const nagadConfigSchema = z
  .object({
    baseUrl: z.url({ protocol: /^https$/ }),
    merchantId: z.string().regex(/^[0-9]{6,20}$/),
    merchantNumber: z.string().regex(/^01[3-9][0-9]{8}$/),
    ipV4: z.ipv4().optional(),
  })
  .strict();
export type NagadConfig = z.infer<typeof nagadConfigSchema>;

/** The Nagad connection: MOCK (the practice gateway) until the owner's keys pass the Test button. */
export const nagadAdapter = defineAdapter<PaymentGateway, NagadConfig>({
  kind: 'PAYMENT',
  provider: 'nagad',
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['merchantPrivateKey', 'nagadPublicKey'],
  configSchema: nagadConfigSchema,
  async create(ctx) {
    if (!ctx.config.baseUrl || !ctx.config.merchantId || !ctx.config.merchantNumber) throw new AdapterError('the Nagad address, merchant id or merchant number is not entered yet');
    return createNagadGateway({
      baseUrl: ctx.config.baseUrl,
      merchantId: ctx.config.merchantId,
      merchantNumber: ctx.config.merchantNumber,
      ipV4: ctx.config.ipV4 ?? null,
      merchantPrivateKey: await requireSecret(ctx, 'merchantPrivateKey'),
      nagadPublicKey: await requireSecret(ctx, 'nagadPublicKey'),
    });
  },
  async mock() {
    return createMockGateway('nagad');
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'practice Nagad: no money moves' };
    // one cheap round trip: the verify of a reference that does not exist proves the address answers
    try {
      await api.query('probe');
      return { ok: true, message: 'Nagad answered: the address works' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
});
