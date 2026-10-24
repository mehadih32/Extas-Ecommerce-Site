// PR 167 — the practice gateway behind every payment adapter's MOCK mode (A1.3): no network, no key, no money. It
// follows the real flow so the shop's code is the same in every mode: `initiate` answers with an address that comes
// straight back to our signed callback claiming success (the "customer paid"), `mockCallback` builds the callback a
// failed or cancelled payment would send, and `confirm` answers what the callback claimed (a real gateway is asked
// instead). The mock's callback key is not a secret — it protects no money — and the go-live guard (PR 170) refuses
// the mock on the live shop.
import { randomBytes } from 'node:crypto';
import { checkCallbackSignature, signedCallbackUrl, type CallbackClaim, type GatewayOutcome, type PaymentGateway } from './contract';

/** The mock's sessions are `mock-<paymentId>`: nothing to remember between processes. */
export const MOCK_REF_PREFIX = 'mock-';
const keyOf = (provider: string) => `practice-gateway:${provider}`;

/** The callback the practice gateway sends for a payment (query parameters). */
export function mockCallback(provider: string, base: string, paymentId: string, claim: CallbackClaim): Record<string, string> {
  const u = new URL(signedCallbackUrl(keyOf(provider), provider, base, paymentId));
  u.searchParams.set('paymentID', `${MOCK_REF_PREFIX}${paymentId}`);
  u.searchParams.set('status', claim);
  return Object.fromEntries(u.searchParams.entries());
}

export function createMockGateway(provider: string): PaymentGateway {
  const outcome = (providerRef: string, claim: CallbackClaim | 'unknown'): GatewayOutcome => ({
    state: claim === 'success' ? 'PAID' : claim === 'failure' ? 'FAILED' : claim === 'cancel' ? 'CANCELLED' : 'PENDING',
    providerRef,
    providerTrxId: claim === 'success' ? `${MOCK_REF_PREFIX}${randomBytes(6).toString('hex')}` : null,
    amountMinor: null,
    currency: null,
    failureCode: claim === 'failure' ? 'MOCK_FAILURE' : null,
  });
  return {
    provider,
    async initiate(i) {
      const back = new URL(signedCallbackUrl(keyOf(provider), provider, i.callbackBaseUrl, i.paymentId));
      back.searchParams.set('paymentID', `${MOCK_REF_PREFIX}${i.paymentId}`);
      back.searchParams.set('status', 'success');
      return { providerRef: `${MOCK_REF_PREFIX}${i.paymentId}`, redirectUrl: back.toString(), expiresAt: null };
    },
    readCallback({ params }) {
      const s = checkCallbackSignature(keyOf(provider), provider, params);
      if (!s.ok) return s;
      const ref = params.paymentID ?? '';
      const claim = params.status as CallbackClaim;
      if (ref !== `${MOCK_REF_PREFIX}${s.paymentId}` || !['success', 'failure', 'cancel'].includes(claim)) return { ok: false, reason: 'malformed' };
      return { ok: true, paymentId: s.paymentId, providerRef: ref, claim, eventKey: `${ref}:${claim}` };
    },
    async confirm(read) {
      return outcome(read.providerRef, read.claim);
    },
    async query(providerRef) {
      // the practice gateway keeps no sessions: an unanswered one stays unknown (the sweep gives it up)
      return outcome(providerRef, 'unknown');
    },
  };
}
