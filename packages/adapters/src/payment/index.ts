// PR 167 — the payment gateways (BACKEND-ARCHITECTURE §7.5): one contract (contract.ts), the practice gateway behind
// every MOCK mode (mock.ts), bKash (bkash.ts) and, PR 168, Nagad (nagad.ts). The card/bank gateway (PR 169) adds its
// adapter here and to `paymentAdapters`; the payments service picks the one the customer chose by its provider key.
import { bkashAdapter } from './bkash';
import { nagadAdapter } from './nagad';

export * from './contract';
export * from './mock';
export * from './bkash';
export * from './nagad';

export const paymentAdapters = [bkashAdapter, nagadAdapter] as const;
