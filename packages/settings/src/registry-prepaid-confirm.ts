// S05 · PR 541 follow-up 320 — registry version 266, lane B. A prepaid order that nothing flagged (its risk section is
// "prepaid": no duplicate review, no re-order, no new identity, no high or watch band) is confirmed by itself the moment
// its money is in full — today it waits in Orders › To confirm › Prepaid for one tap.
//
// `orders.prepaid.selfConfirm.enabled`: off as shipped. It only confirms (PLACED → CONFIRMED through the one order
// service, with its timeline note and audit row, exactly as the tap would); it never takes, moves or gives back money,
// and never touches a price, a charge, a discount or Cash on Delivery. An order with a payment pending, failed or not
// matching, anything still to pay, a cancel request or an open review is left for a person, as today.
import { z } from 'zod';
import { setting } from './define';

const V320 = 266;

export const prepaidSelfConfirmSchema = z.object({ enabled: z.boolean() }).strict();
export type PrepaidSelfConfirm = z.output<typeof prepaidSelfConfirmSchema>;

export const prepaidConfirmSettings = {
  'orders.prepaid.selfConfirm': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'orders',
    version: V320,
    schema: prepaidSelfConfirmSchema,
    // hardcode-ok: off as shipped — the owner switches it on (Orders › Risk rules)
    default: { enabled: false },
    valueType: 'JSON',
    labelKey: 'orders.prepaid.selfConfirm.label',
    helpKey: 'orders.prepaid.selfConfirm.help',
    sortOrder: 342,
  }),
};
