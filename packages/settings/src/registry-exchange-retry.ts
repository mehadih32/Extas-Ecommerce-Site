// Follow-up 546 (PR 614) — an exchange approval that found the store's ERP unreachable is tried again by the background
// turn. Registry version 272. Labels: messages/returns-v6.<lang>.json (`exchange.erp.retryUnreachable`); edited on
// Orders › Returns › ERP returns, in the "Exchange settings" card, beside `exchange.erp.keepForOrders`.
//
// - `exchange.erp.retryUnreachable`: off as shipped (a person presses "Send to the ERP again" on the case card, as
//   before). On: the store's returns turn (job `orders.returns.erp`) sends such an approval again once `afterMinutes`
//   passed since its last try, with the same idempotency key (the ERP never takes it twice), and keeps trying at that
//   pace until the ERP answers. Only an approved send that never reached the ERP: a refusal, a closed or a finished
//   send is never sent again by itself, and an exchange waiting for stock keeps its own retries.
import { z } from 'zod';
import { setting } from './define';

const V = 272;

export const exchangeRetrySchema = z
  .object({
    enabled: z.boolean(),
    afterMinutes: z.int().min(5).max(1_440),
  })
  .strict();
export type ExchangeRetrySettings = z.output<typeof exchangeRetrySchema>;

export const exchangeRetrySettings = {
  'exchange.erp.retryUnreachable': setting({
    scope: 'store',
    schema: exchangeRetrySchema,
    default: { enabled: false, afterMinutes: 30 },
    valueType: 'JSON',
    group: 'orders',
    labelKey: 'exchange.erp.retryUnreachable.label',
    helpKey: 'exchange.erp.retryUnreachable.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 101,
    version: V,
  }),
} as const;
