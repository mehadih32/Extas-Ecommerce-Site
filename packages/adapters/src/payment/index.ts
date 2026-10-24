// PR 167 — the payment gateways (BACKEND-ARCHITECTURE §7.5): one contract (contract.ts), the practice gateway behind
// every MOCK mode (mock.ts) and bKash (bkash.ts). Nagad and the card/bank gateway (PR 168, 169) add their adapter here
// and to `paymentAdapters`; the payments service picks the one the customer chose by its provider key.
import { bkashAdapter } from './bkash';

export * from './contract';
export * from './mock';
export * from './bkash';

export const paymentAdapters = [bkashAdapter] as const;
