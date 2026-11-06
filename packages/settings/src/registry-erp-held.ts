// Follow-up 539 (PR 610) — orders the ERP keeps refusing for now. Registry version 239. Labels:
// messages/erp-orders-v6.<lang>.json (`erp.orders.heldAlertAfterHours`).
//
// - `erp.orders.heldAlertAfterHours`: empty (off) as shipped. A document the ERP refused for now (HELD: short of stock,
//   no shop price yet, the account on hold, a line waiting, B grade closed) is woken again every
//   `erp.orders.refusedRetryMinutes` with no end. With a number of hours set, a document still HELD that long after it
//   was queued raises one line on the stock page and one row in "Needs you now", so a person looks at it. The shop keeps
//   asking the ERP either way: the alert never stops or cancels anything.
import { z } from 'zod';
import { setting } from './define';

const V = 239;

export const erpHeldSettings = {
  'erp.orders.heldAlertAfterHours': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'erp',
    version: V,
    schema: z.int().min(1).max(30 * 24).nullable(),
    default: null,
    valueType: 'INT',
    labelKey: 'erp.orders.heldAlertAfterHours.label',
    helpKey: 'erp.orders.heldAlertAfterHours.help',
    sortOrder: 33,
  }),
} as const;
