// PR 167 — the payment gateways (BACKEND-ARCHITECTURE §7.5): one contract (contract.ts), the practice gateway behind
// every MOCK mode (mock.ts), bKash (bkash.ts), PR 168 Nagad (nagad.ts) and PR 169 the card and bank gateway,
// SSLCommerz (sslcommerz.ts). The payments service picks the gateway of the customer's choice by its provider key;
// a card type or "Pay online" is paid on the card gateway (`gatewayProviderOf`), while the payment keeps the card the
// customer chose for every page that names it.
import { bkashAdapter } from './bkash';
import { nagadAdapter } from './nagad';
import { sslcommerzAdapter } from './sslcommerz';

export * from './contract';
export * from './mock';
export * from './bkash';
export * from './nagad';
export * from './sslcommerz';

export const paymentAdapters = [bkashAdapter, nagadAdapter, sslcommerzAdapter] as const;

/** The checkout's card types and "Pay online" (settings `checkout.pay.card.list`, `checkout.pay.online.enabled`). */
const ON_CARD_GATEWAY: readonly string[] = ['visa', 'mastercard', 'amex', 'bank', 'online'];

/** The gateway that takes a payment of this provider key: the card gateway for a card type or "Pay online". */
export const gatewayProviderOf = (provider: string): string => (ON_CARD_GATEWAY.includes(provider) ? sslcommerzAdapter.provider : provider);
