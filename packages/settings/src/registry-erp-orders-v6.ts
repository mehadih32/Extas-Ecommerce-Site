// CN-028 · PR 610, 611 (CN-029 Phase 1, lane Sawdagor) — orders to the ERP in contract v6. Registry version 66. Labels:
// messages/erp-orders-v6.<lang>.json (the ERP group, Settings → ERP connection). The hold settings themselves
// (`erp.hold.pauseCheckout`, `erp.hold.warnDays`, `erp.account.checkMinutes`) are in registry-erp-v6.ts (v62).
//
// - `erp.orders.refusedRetryMinutes` (60): an order the ERP refused for now with a 409 it keeps against its
//   Idempotency-Key (short of stock, no shop price yet) waits HELD and goes again with a new key once the stock or the
//   price is there (the order check reads the ERP), and at the latest after this many minutes, so a missed signal never
//   leaves an order behind. An account hold waits for the release (`account.released`, or the account check).
// - `erp.orders.catchUpDays` (14) and `erp.orders.catchUpBatch` (50): follow-up 490 — the order check also reads the
//   ERP's own copy of the open orders of the last days (`GET /orders/{id}`), so a lost `order.line.short` or
//   `order.line.filled` webhook, or a lost answer, is caught up (the hourly pull of PR 608 lists only returns and
//   exchanges).
// Nothing here moves money: the ERP bills by its own contract; these only say when the shop asks again.
import { z } from 'zod';
import { setting } from './define';

const V = 66;

const erp = { scope: 'store', isOwnerData: false, isPublic: false, group: 'erp', version: V } as const;

export const erpOrdersV6Settings = {
  'erp.orders.refusedRetryMinutes': setting({
    ...erp,
    schema: z.int().min(5).max(24 * 60),
    default: 60,
    valueType: 'INT',
    labelKey: 'erp.orders.refusedRetryMinutes.label',
    helpKey: 'erp.orders.refusedRetryMinutes.help',
    sortOrder: 30,
  }),
  'erp.orders.catchUpDays': setting({
    ...erp,
    schema: z.int().min(1).max(90),
    default: 14,
    valueType: 'INT',
    labelKey: 'erp.orders.catchUpDays.label',
    helpKey: 'erp.orders.catchUpDays.help',
    sortOrder: 31,
  }),
  'erp.orders.catchUpBatch': setting({
    ...erp,
    scope: 'installation',
    schema: z.int().min(1).max(1000),
    default: 50,
    valueType: 'INT',
    labelKey: 'erp.orders.catchUpBatch.label',
    helpKey: 'erp.orders.catchUpBatch.help',
    sortOrder: 32,
  }),
};
