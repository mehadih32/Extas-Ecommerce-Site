// S07 · PR 170 — payments through a gateway (BACKEND-ARCHITECTURE §7.5, §7.6; SIM-F-026):
//
// - `startPayment`: the customer presses "Pay" on an open payment: the gateway opens its hosted session (the payment's
//   own idempotency key is its invoice number) with our signed callback address, the payment becomes PENDING with the
//   gateway's reference, and the customer's browser goes to the gateway. The practice gateway (MOCK) runs only while
//   `payments.testPayments` is on: the go-live guard (follow-up 50).
// - `receiveCallback`: the one receiver of a gateway's callback (the customer coming back, or the gateway's own call):
//   the signature of our callback address is checked first (a bad one is stored with signatureValid=false and never
//   processed); the event is stored once (`WebhookEvent`, unique per source and the gateway's event key), so a
//   repeated callback is one payment; what it claims is never trusted — the gateway itself is asked (`confirm`), and
//   only its answer is written through the one outcome writer (outcome.ts). A gateway that does not answer leaves the
//   payment open for the sweep and the event FAILED (replayable).
// - `sweepPending`: open gateway payments are asked about again at the gateway after `payments.pending`
//   recoverAfterMinutes (money that came in while the callback was lost is recorded, so the rider never asks a paid
//   customer: SIM-F-001), and, only when the owner sets abandonAfterMinutes, given up as ABANDONED (the order flagged,
//   a call task only with his switch). Run by the worker's `payments.pending.sweep` job.
// - `paymentIssues` (`payments.view`): the failed, abandoned and waiting payments for the team, newest first.
// When money completes an order's advance, the caller's `orders.advancePaid` hook moves the order (order service).
import { createHash } from 'node:crypto';
import { createMockGateway, gatewayProviderOf, paymentAdapters, type CallbackRead, type Connections, type GatewayOutcome, type PaymentGateway } from '@extas/adapters';
import { Prisma } from '@extas/db/client';
import { allow, nowOf, setting, TX, UUID, type GatewayResolver, type PaymentsDeps, type Who } from './context';
import { PaymentsError } from './errors';
import { applyOutcome, type OutcomeBy, type OutcomeResult } from './outcome';
import { FAILURE_CODES } from './pure';

/** The WebhookEvent source of a gateway's callbacks (§7.6: payment-<name>). */
export const paymentSource = (provider: string) => `payment-${provider}`;
const PROVIDER = /^[a-z][a-zA-Z0-9]{1,30}$/;
/** Methods that never go through a gateway. */
const OFFLINE = ['COD', 'WALLET', 'CASH', 'BANK_TRANSFER'] as const;

/**
 * The app's gateway resolver from its connection layer for the payment adapters: the provider's connection when the
 * owner switched one on, else its practice gateway. A card type or "Pay online" runs on the card gateway (PR 169,
 * `gatewayProviderOf`). A provider with no adapter (Rocket, Upay) runs on the practice gateway too (A1.3), which works
 * only while test payments are on.
 */
export function connectionGateways(connections: Connections): GatewayResolver {
  return async (storeId, asked) => {
    const provider = gatewayProviderOf(asked);
    if (!paymentAdapters.some((a) => a.provider === provider)) return { api: createMockGateway(provider), mode: 'MOCK' };
    const c = await connections.use<PaymentGateway>('PAYMENT', { storeId, provider });
    return { api: c.api, mode: c.mode };
  };
}

async function gatewayOf(deps: PaymentsDeps, storeId: number, provider: string) {
  if (!deps.gateways) throw new PaymentsError('GATEWAY_ERROR', 'no payment gateway is wired here');
  return deps.gateways(storeId, provider);
}

const gatewayFail = (e: unknown): PaymentsError => {
  const m = e instanceof Error ? e.message.split('\n')[0]!.slice(0, 200) : String(e);
  return new PaymentsError('GATEWAY_ERROR', `the payment service did not answer: ${m}`);
};

// ---------------------------------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------------------------------

export interface StartResult {
  paymentId: string;
  providerRef: string;
  redirectUrl: string;
  mode: 'MOCK' | 'SANDBOX' | 'LIVE';
}

/**
 * Opens the gateway's session for one open payment (the caller checked it is the customer's own). `callbackBaseUrl`
 * is our callback route for the payment's provider on the host the customer uses.
 */
export async function startPayment(deps: PaymentsDeps, req: { storeId: number; paymentId: string; callbackBaseUrl: string; payerReference?: string }): Promise<StartResult> {
  const { storeId, paymentId } = req;
  if (!UUID.test(paymentId)) throw new PaymentsError('NOT_FOUND', 'no such payment', ['paymentId']);
  const p = await deps.db.payment.findFirst({ where: { id: paymentId, storeId }, select: { id: true, status: true, method: true, provider: true, amountMinor: true, currency: true, idempotencyKey: true, order: { select: { number: true, status: true } } } });
  if (!p || !p.order) throw new PaymentsError('NOT_FOUND', 'no such payment', ['paymentId']);
  if (p.status !== 'INITIATED' && p.status !== 'PENDING') throw new PaymentsError('NOT_OPEN', 'this payment is not open', [], { status: p.status });
  if (p.order.status === 'CANCELLED') throw new PaymentsError('ORDER_CLOSED', 'the order is cancelled');
  if ((OFFLINE as readonly string[]).includes(p.method) || !p.provider || !PROVIDER.test(p.provider)) throw new PaymentsError('METHOD_NOT_ALLOWED', 'this payment does not go through a gateway');
  const gw = await gatewayOf(deps, storeId, p.provider);
  if (gw.mode === 'MOCK' && !(await setting(deps, storeId, 'payments.testPayments'))) throw new PaymentsError('TEST_PAYMENTS_OFF', 'the practice gateway is switched off and the real one is not connected');
  let s: Awaited<ReturnType<PaymentGateway['initiate']>>;
  try {
    s = await gw.api.initiate({ paymentId: p.id, idempotencyKey: p.idempotencyKey, orderNumber: p.order.number, amountMinor: p.amountMinor, currency: p.currency, payerReference: req.payerReference ?? p.order.number, callbackBaseUrl: req.callbackBaseUrl });
  } catch (e) {
    throw gatewayFail(e);
  }
  const now = nowOf(deps);
  // INITIATED → PENDING (a second "Pay" on a PENDING payment opens a fresh session for the same payment)
  await deps.db.payment.updateMany({ where: { id: p.id, status: { in: ['INITIATED', 'PENDING'] } }, data: { status: 'PENDING', providerRef: s.providerRef, statusAt: now } });
  return { paymentId: p.id, providerRef: s.providerRef, redirectUrl: s.redirectUrl, mode: gw.mode };
}

// ---------------------------------------------------------------------------------------------------------------------
// The callback receiver
// ---------------------------------------------------------------------------------------------------------------------

export type CallbackCode = 'PROCESSED' | 'DUPLICATE' | 'PENDING' | 'INVALID';

export interface CallbackResult {
  code: CallbackCode;
  eventId: string | null;
  /** Set once the payment is known and the signature holds. */
  paymentId: string | null;
  number: string | null;
  /** The payment's status after the callback. */
  status: string | null;
}

const bodyHash = (params: Record<string, string>) =>
  createHash('sha256')
    .update(JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k]])))
    .digest('hex');
/** What is kept of a callback: its fields without our signature. */
const kept = (params: Record<string, string>) => Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'sig').map(([k, v]) => [k, String(v).slice(0, 200)]));

/** Applies a gateway's own answer to the payment (callback or sweep), then the order hook. */
async function applyGateway(deps: PaymentsDeps, storeId: number, paymentId: string, out: GatewayOutcome, by: OutcomeBy, eventData: Record<string, unknown>, abandonedCallTask?: boolean): Promise<OutcomeResult | null> {
  const state = out.state;
  if (state === 'PENDING') return null;
  const now = nowOf(deps);
  const r = await deps.db.$transaction(
    (tx) =>
      applyOutcome(
        tx,
        storeId,
        {
          paymentId,
          outcome: state,
          from: 'gateway',
          providerRef: out.providerRef,
          providerTrxId: out.providerTrxId,
          receivedMinor: out.amountMinor,
          currency: out.currency,
          failureCode: out.failureCode,
          by,
          eventData,
          ...(abandonedCallTask === undefined ? {} : { callTask: abandonedCallTask }),
        },
        now,
      ),
    TX,
  );
  if (r.advanceMet && r.orderId) await deps.orders?.advancePaid?.(storeId, r.orderId, { actorId: null, source: by.source });
  return r;
}

/** One gateway callback (see the file header). Never throws for what the caller sent; a database failure throws. */
export async function receiveCallback(deps: PaymentsDeps, req: { provider: string; params: Record<string, string> }): Promise<CallbackResult> {
  const { provider, params } = req;
  const source = paymentSource(PROVIDER.test(provider) ? provider : 'unknown');
  const pid = params.pid ?? '';
  const payment = UUID.test(pid) ? await deps.db.payment.findUnique({ where: { id: pid }, select: { id: true, storeId: true, provider: true, providerRef: true, status: true, order: { select: { number: true } } } }) : null;

  const invalid = async (why: string): Promise<CallbackResult> => {
    const e = await deps.db.webhookEvent.upsert({
      where: { source_idempotencyKey: { source, idempotencyKey: `invalid:${bodyHash(params)}` } },
      create: { storeId: payment?.storeId ?? null, source, eventType: 'payment.callback', idempotencyKey: `invalid:${bodyHash(params)}`, signatureValid: false, payload: kept(params), status: 'IGNORED', error: why },
      update: {},
      select: { id: true },
    });
    return { code: 'INVALID', eventId: e.id, paymentId: null, number: null, status: null };
  };
  if (!PROVIDER.test(provider) || !payment || payment.provider !== provider) return invalid('unknown payment or provider');

  let gw: Awaited<ReturnType<typeof gatewayOf>>;
  try {
    gw = await gatewayOf(deps, payment.storeId, provider);
  } catch (e) {
    return invalid(`no gateway: ${e instanceof Error ? e.message.slice(0, 100) : 'error'}`);
  }
  // Whole-site review R1 (security B1): the practice gateway's signing key is public, so its callback counts only while
  // the owner's test payments are on — on a live shop nobody can forge "paid" with it.
  if (gw.mode === 'MOCK' && !(await setting(deps, payment.storeId, 'payments.testPayments'))) return invalid('practice gateway off');
  const read: CallbackRead = gw.api.readCallback({ params });
  if (!read.ok) return invalid(`signature ${read.reason}`);
  if (read.paymentId !== payment.id) return invalid('signature for another payment');
  // R1 (security m1) and PR 169: the gateway's own payment id must be the one this payment's session opened (a signed
  // callback URL of one order is never replayed with another order's gateway payment, nor with none)
  if (payment.providerRef && read.providerRef !== payment.providerRef) return invalid('another session than this payment opened');

  const now = () => nowOf(deps);
  const base = { paymentId: payment.id, number: payment.order?.number ?? null };
  let eventId: string;
  try {
    eventId = (
      await deps.db.webhookEvent.create({
        data: { storeId: payment.storeId, source, eventType: `payment.callback.${read.claim}`, idempotencyKey: read.eventKey.slice(0, 200), signatureValid: true, payload: kept(params), status: 'RECEIVED', receivedAt: now() },
        select: { id: true },
      })
    ).id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const p = await deps.db.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { status: true } });
      const ev = await deps.db.webhookEvent.findUnique({ where: { source_idempotencyKey: { source, idempotencyKey: read.eventKey.slice(0, 200) } }, select: { id: true } });
      return { code: 'DUPLICATE', eventId: ev?.id ?? null, ...base, status: p.status };
    }
    throw e;
  }

  let out: GatewayOutcome;
  try {
    out = await gw.api.confirm(read);
  } catch (e) {
    await deps.db.webhookEvent.update({ where: { id: eventId }, data: { status: 'FAILED', error: gatewayFail(e).message.slice(0, 500) } });
    const p = await deps.db.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { status: true } });
    return { code: 'PENDING', eventId, ...base, status: p.status };
  }
  try {
    await applyGateway(deps, payment.storeId, payment.id, out, { actorType: 'SYSTEM', actorId: null, source: `gateway:${provider}` }, { webhookEventId: eventId, claim: read.claim, gatewayState: out.state });
  } catch (e) {
    await deps.db.webhookEvent.update({ where: { id: eventId }, data: { status: 'FAILED', error: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
    throw e;
  }
  await deps.db.webhookEvent.update({ where: { id: eventId }, data: { status: 'PROCESSED', processedAt: now(), eventType: `payment.callback.${read.claim}` } });
  const p = await deps.db.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { status: true } });
  return { code: out.state === 'PENDING' ? 'PENDING' : 'PROCESSED', eventId, ...base, status: p.status };
}

// ---------------------------------------------------------------------------------------------------------------------
// The sweep of open payments
// ---------------------------------------------------------------------------------------------------------------------

export interface SweepResult {
  checked: number;
  paid: number;
  failed: number;
  abandoned: number;
  stillOpen: number;
  errors: number;
}

const SWEEP_BATCH = 200;
const MINUTE = 60_000;

/** One store's open gateway payments: recovered by the gateway's answer, or given up (see the file header). */
export async function sweepPending(deps: PaymentsDeps, storeId: number): Promise<SweepResult> {
  const cfg = await setting(deps, storeId, 'payments.pending');
  const out: SweepResult = { checked: 0, paid: 0, failed: 0, abandoned: 0, stillOpen: 0, errors: 0 };
  if (cfg.recoverAfterMinutes === 0 && cfg.abandonAfterMinutes === 0) return out;
  const now = nowOf(deps);
  const first = Math.min(...[cfg.recoverAfterMinutes, cfg.abandonAfterMinutes].filter((x) => x > 0));
  const open = await deps.db.payment.findMany({
    where: { storeId, status: { in: ['INITIATED', 'PENDING'] }, method: { notIn: [...OFFLINE] }, provider: { not: null }, statusAt: { lt: new Date(now.getTime() - first * MINUTE) } },
    orderBy: { statusAt: 'asc' },
    take: SWEEP_BATCH,
    select: { id: true, provider: true, providerRef: true, statusAt: true },
  });
  const by: OutcomeBy = { actorType: 'SYSTEM', actorId: null, source: 'payments.sweep' };
  for (const p of open) {
    out.checked += 1;
    const age = now.getTime() - (p.statusAt ?? now).getTime();
    try {
      if (cfg.recoverAfterMinutes > 0 && age >= cfg.recoverAfterMinutes * MINUTE && p.providerRef && p.provider && PROVIDER.test(p.provider)) {
        const gw = await gatewayOf(deps, storeId, p.provider);
        const answer = await gw.api.query(p.providerRef);
        const r = await applyGateway(deps, storeId, p.id, answer, by, { recovered: true });
        if (r?.changed && r.status === 'PAID') {
          out.paid += 1;
          continue;
        }
        if (r?.changed) {
          out.failed += 1;
          continue;
        }
      }
      if (cfg.abandonAfterMinutes > 0 && age >= cfg.abandonAfterMinutes * MINUTE) {
        const r = await deps.db.$transaction((tx) => applyOutcome(tx, storeId, { paymentId: p.id, outcome: 'ABANDONED', from: 'system', failureCode: FAILURE_CODES.abandoned, callTask: cfg.callTaskOnAbandon, by }, now), TX);
        if (r.changed) out.abandoned += 1;
        continue;
      }
      out.stillOpen += 1;
    } catch {
      out.errors += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// What the team sees
// ---------------------------------------------------------------------------------------------------------------------

export const ISSUE_STATES = ['failed', 'abandoned', 'waiting'] as const;
export type IssueState = (typeof ISSUE_STATES)[number];

export interface PaymentIssue {
  paymentId: string;
  orderId: string | null;
  number: string | null;
  method: string;
  provider: string | null;
  status: string;
  attempt: number;
  amountMinor: number;
  failureCode: string | null;
  statusAt: Date | null;
  /** The order has been paid since (by another try or another way): nothing to chase. */
  orderPaid: boolean;
}

/** SIM-F-026 — the failed, abandoned or still waiting payments (`payments.view`), newest first. */
export async function paymentIssues(deps: PaymentsDeps, who: Who, input: { state?: string; limit?: number } = {}): Promise<PaymentIssue[]> {
  await allow(deps, who, 'payments.view');
  const state = (ISSUE_STATES as readonly string[]).includes(input.state ?? '') ? (input.state as IssueState) : 'failed';
  const limit = Math.min(Math.max(Number.isInteger(input.limit) ? input.limit! : 50, 1), 200);
  const where: Prisma.PaymentWhereInput =
    state === 'waiting'
      ? { status: { in: ['INITIATED', 'PENDING'] }, method: { notIn: [...OFFLINE] } }
      : state === 'abandoned'
        ? { status: 'CANCELLED', failureCode: FAILURE_CODES.abandoned }
        : { OR: [{ status: 'FAILED' }, { status: 'CANCELLED', NOT: { failureCode: FAILURE_CODES.abandoned } }] };
  const rows = await deps.db.payment.findMany({
    where: { storeId: who.storeId, ...where },
    orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: { id: true, orderId: true, method: true, provider: true, status: true, attempt: true, amountMinor: true, failureCode: true, statusAt: true, order: { select: { number: true, paymentMethod: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true } } },
  });
  return rows.map((r) => ({
    paymentId: r.id,
    orderId: r.orderId,
    number: r.order?.number ?? null,
    method: r.method,
    provider: r.provider,
    status: r.status,
    attempt: r.attempt,
    amountMinor: r.amountMinor,
    failureCode: r.failureCode,
    statusAt: r.statusAt,
    orderPaid: r.order ? r.order.totalMinor - r.order.walletAppliedMinor - r.order.paidMinor <= 0 : false,
  }));
}
