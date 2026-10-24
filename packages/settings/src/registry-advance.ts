// S04 · PR 558, 560 — the advance-payment checkout mode's one switch (registry version 53). Labels:
// messages/checkout-more.<lang>.json (`checkout.advance.*`). The owner's layers themselves (what counts as a flag, how
// many layers, what each asks for) are rows, not settings: CheckoutParameterLayer, edited on Orders › Risk rules ›
// Checkout advance (docs/admin-guide/checkout-advance.md). Off by default: until the owner switches it on, every customer
// sees the checkout as before. On, a flagged customer — and only once he has filled everything in — is asked to pay
// ahead by his layer (the delivery charge, a part or the full amount) and Cash on Delivery is not offered to him; he
// is never shown a score or a reason. Nothing here blocks anyone or changes a price, a charge or a discount.
import { z } from 'zod';
import { setting } from './define';

const V = 53;

/** How many layers the panel may hold (the choices offered under "More options"). */
export const ADVANCE_CHOICES = { maxLayers: [3, 5, 10] } as const;

/** `enabled`: the whole feature's one switch. `maxLayers`: the most layers the panel takes. */
export const checkoutAdvanceSchema = z
  .object({
    enabled: z.boolean(),
    maxLayers: z.int().refine((v) => (ADVANCE_CHOICES.maxLayers as readonly number[]).includes(v), { message: `one of ${ADVANCE_CHOICES.maxLayers.join(', ')}` }),
  })
  .strict();
export type CheckoutAdvance = z.output<typeof checkoutAdvanceSchema>;

export const advanceSettings = {
  'checkout.advance': setting({
    scope: 'store',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    version: V,
    group: 'checkout',
    schema: checkoutAdvanceSchema,
    default: { enabled: false, maxLayers: 5 },
    labelKey: 'checkout.advance.label',
    helpKey: 'checkout.advance.help',
    sortOrder: 965,
  }),
};
