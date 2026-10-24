// S06 · PR 542 — the pay link of an advance a person asked for from the order (`/pay/<token>`; the order service makes the
// payment row with its random token, @extas/orders `requestAdvance`). The customer opens the link from his SMS or
// WhatsApp on any phone — no login, no cookie: the token alone finds the payment, and the page shows only the shop's
// order number and the amount (never a name, phone or address).
//
// - `linkPayView`: the link's latest try, whether it can be paid now (the order still waits for its advance and the try
//   is open), and how (`modes`): through the real gateway once the owner's keys pass the Test button, else the test
//   page's two answers while `payments.testPayments` is on (the go-live guard of follow-up 50), else "not open now".
// - `linkPayAction`: the test page's answers — paid or failed, written by the one outcome writer exactly like a gateway's
//   (outcome.ts), and the order hook when the advance is now met — and "Try again", a new try with the same token.
// - `startLinkPayment`: "Pay" on a real gateway (gateway.ts `startPayment`).
// No money moves here except what the customer pays; nothing changes a COD rule, a price or a charge.
import { z } from 'zod';
import { nowOf, parse, setting, TX, type PaymentsDeps } from './context';
import { PaymentsError } from './errors';
import { applyOutcome } from './outcome';
import { startPayment, type StartResult } from './gateway';

/** The source the link's timeline rows carry. */
export const PAY_LINK_SOURCE = 'pay-link';
/** A link's token as the order service makes it (18 random bytes, base64url). */
export const LINK_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export interface LinkModes {
  /** The test page's "paid" and "failed" may answer (test payments on, the provider on its practice gateway). */
  test: boolean;
  /** A real gateway (sandbox or live) is connected: "Pay" opens its page. */
  gateway: boolean;
}

export interface LinkPayView extends LinkModes {
  token: string;
  paymentId: string;
  storeId: number;
  number: string;
  amountMinor: number;
  currency: string;
  provider: string | null;
  method: string;
  status: 'INITIATED' | 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  /** The try can be paid now: open, and the order still waits for its advance. */
  open: boolean;
  /** The order is not waiting any more (paid another way, released, cancelled): nothing to pay here. */
  closed: boolean;
  /** "Try again" can make a new try (the last failed and the order still waits). */
  canRetry: boolean;
}

async function latest(deps: Pick<PaymentsDeps, 'db'>, token: string) {
  if (!LINK_TOKEN.test(token)) return null;
  return deps.db.payment.findFirst({
    where: { linkToken: token },
    orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }],
    include: { order: { select: { id: true, number: true, status: true } } },
  });
}

/** How a provider's payment can be paid now (a gateway that cannot be read is neither). */
export async function linkModes(deps: PaymentsDeps, storeId: number, provider: string | null): Promise<LinkModes> {
  try {
    const [testOn, gw] = await Promise.all([setting(deps, storeId, 'payments.testPayments'), deps.gateways && provider ? deps.gateways(storeId, provider) : Promise.resolve({ mode: 'MOCK' as const })]);
    const real = gw.mode === 'SANDBOX' || gw.mode === 'LIVE';
    return { test: testOn && !real, gateway: real };
  } catch {
    return { test: false, gateway: false };
  }
}

/** The link's page (null: no such link). */
export async function linkPayView(deps: PaymentsDeps, token: string): Promise<LinkPayView | null> {
  const p = await latest(deps, token);
  if (!p?.order || !p.linkToken) return null;
  const waiting = p.order.status === 'AWAITING_ADVANCE';
  const isOpen = p.status === 'INITIATED' || p.status === 'PENDING';
  return {
    token: p.linkToken,
    paymentId: p.id,
    storeId: p.storeId,
    number: p.order.number,
    amountMinor: p.amountMinor,
    currency: p.currency,
    provider: p.provider,
    method: p.method,
    status: p.status,
    open: isOpen && waiting,
    closed: !waiting && p.status !== 'PAID',
    canRetry: waiting && (p.status === 'FAILED' || p.status === 'CANCELLED'),
    ...(await linkModes(deps, p.storeId, p.provider)),
  };
}

export const LINK_ACTIONS = ['approve', 'fail', 'retry'] as const;
export const linkActionSchema = z.object({ token: z.string().regex(LINK_TOKEN), action: z.enum(LINK_ACTIONS) }).strict();

export interface LinkActionResult {
  token: string;
  status: LinkPayView['status'];
  /** The order's advance is now met (the order hook ran). */
  advanceMet: boolean;
}

/**
 * The test page's answer (A1.3; follow-up 50: only while test payments are on and no real gateway is connected) or
 * "Try again". Approve and fail are the gateway's two answers, through the one outcome writer; try again makes a new
 * try with the same token, only while the order still waits.
 */
export async function linkPayAction(deps: PaymentsDeps, input: unknown): Promise<LinkActionResult> {
  const d = parse(linkActionSchema, input, 'pay link');
  const p = await latest(deps, d.token);
  if (!p?.order) throw new PaymentsError('NOT_FOUND', 'no such pay link', ['token']);
  const now = nowOf(deps);
  if (d.action === 'retry') {
    if (p.status === 'PAID' || p.status === 'INITIATED' || p.status === 'PENDING') return { token: d.token, status: p.status, advanceMet: false };
    if (p.order.status !== 'AWAITING_ADVANCE') throw new PaymentsError('ORDER_CLOSED', 'the order is not waiting for this advance any more');
    const next = p.attempt + 1;
    await deps.db.payment.create({
      data: { storeId: p.storeId, orderId: p.order.id, method: p.method, provider: p.provider, purpose: p.purpose, status: 'INITIATED', amountMinor: p.amountMinor, currency: p.currency, idempotencyKey: `advance:${d.token}:${next}`, attempt: next, linkToken: d.token, statusAt: now },
    });
    return { token: d.token, status: 'INITIATED', advanceMet: false };
  }
  if (!(await linkModes(deps, p.storeId, p.provider)).test) throw new PaymentsError('TEST_PAYMENTS_OFF', 'the test page is off here; the payment service answers for this payment');
  if (p.status !== 'INITIATED' && p.status !== 'PENDING') {
    if (p.status === 'PAID' && d.action === 'approve') return { token: d.token, status: 'PAID', advanceMet: false };
    throw new PaymentsError('NOT_OPEN', 'this try is not open', [], { status: p.status });
  }
  if (p.order.status !== 'AWAITING_ADVANCE') throw new PaymentsError('ORDER_CLOSED', 'the order is not waiting for this advance any more');
  const outcome = d.action === 'approve' ? 'PAID' : 'FAILED';
  const r = await deps.db.$transaction(
    (tx) =>
      applyOutcome(
        tx,
        p.storeId,
        { paymentId: p.id, outcome, from: 'gateway', providerTrxId: outcome === 'PAID' ? `mock-${p.id.slice(-12)}` : null, by: { actorType: 'CUSTOMER', actorId: null, source: PAY_LINK_SOURCE }, eventData: { provider: 'mock', link: true } },
        now,
      ),
    TX,
  );
  if (r.advanceMet && r.orderId) await deps.orders?.advancePaid?.(p.storeId, r.orderId, { actorId: null, source: PAY_LINK_SOURCE });
  return { token: d.token, status: r.status as LinkPayView['status'], advanceMet: r.advanceMet };
}

/** "Pay" on a real gateway: its hosted session for the link's open try. */
export async function startLinkPayment(deps: PaymentsDeps, req: { token: string; callbackBaseUrl: string }): Promise<StartResult> {
  const v = await linkPayView(deps, req.token);
  if (!v) throw new PaymentsError('NOT_FOUND', 'no such pay link', ['token']);
  if (!v.open) throw new PaymentsError(v.closed ? 'ORDER_CLOSED' : 'NOT_OPEN', 'this pay link cannot be paid now', [], { status: v.status });
  return startPayment(deps, { storeId: v.storeId, paymentId: v.paymentId, callbackBaseUrl: req.callbackBaseUrl, payerReference: v.number });
}

/** The pay link of a payment (the callback sends the customer back to it), or null for a checkout payment. */
export async function linkTokenOf(deps: Pick<PaymentsDeps, 'db'>, paymentId: string): Promise<string | null> {
  const p = await deps.db.payment.findUnique({ where: { id: paymentId }, select: { linkToken: true } });
  return p?.linkToken ?? null;
}
