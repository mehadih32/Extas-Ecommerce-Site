// S14 · PR 286 follow-up 477 — registry version 267, lane B. "Who looked at this customer" on a customer's page lists every
// open of the page; one person reading an order and coming back to the customer a few times fills the card with the
// same line. When on, repeated opens of the page by the same person within the owner's minutes of each other show as
// one line with a count. Only the card folds: the log keeps every open (Note 24.1), and a copy or a call of the number
// is always its own line.
//
// `customers.looksFold`: off as shipped; `minutes` is the owner's gap (1–120).
import { z } from 'zod';
import { setting } from './define';

const V477 = 267;

export const looksFoldSchema = z.object({ enabled: z.boolean(), minutes: z.int().min(1).max(120) }).strict();
export type LooksFold = z.output<typeof looksFoldSchema>;

export const looksFoldSettings = {
  'customers.looksFold': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'customers',
    version: V477,
    schema: looksFoldSchema,
    // hardcode-ok: off as shipped — the owner switches it on and sets the minutes (Customers › Customer settings)
    default: { enabled: false, minutes: 5 },
    valueType: 'JSON',
    labelKey: 'customers.looksFold.label',
    helpKey: 'customers.looksFold.help',
    sortOrder: 335,
  }),
};
