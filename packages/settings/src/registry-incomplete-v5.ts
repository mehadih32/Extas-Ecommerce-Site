// S28 · PR 668 (Admin v5, Orders › Incomplete orders) — registry version 295.
//
// - `orders.incompleteV5`: what the v5 screen adds to PR 274's `orders.incomplete`.
//   - `possibleMatch`: while on, a draft whose connection (IP) matches an earlier customer's order under a different phone
//     is marked "Possible match". It only marks: nothing is attached and no customer is merged (a person decides).
//   - `templates`: the four ready messages the team can open in WhatsApp or SMS (forgot, size, delivery, offer). Words
//     in curly braces ({name}, {items}, {link}) are filled in when the message opens. Sending stays a person's click:
//     the screen only opens the chat or SMS app, never sends by itself. The "offer" message names a discount, so it is
//     only opened by someone allowed to approve a discount and the code is typed by that person (never chosen here).
// Off as shipped (the marking); the texts are the owner's to edit.
import { z } from 'zod';
import { setting } from './define';

export const INCOMPLETE_TEMPLATE_KEYS = ['forgot', 'size', 'delivery', 'offer'] as const;
export type IncompleteTemplateKey = (typeof INCOMPLETE_TEMPLATE_KEYS)[number];

const text = z.string().trim().min(1).max(500);

export const incompleteV5Schema = z.object({ possibleMatch: z.boolean(), templates: z.object({ forgot: text, size: text, delivery: text, offer: text }).strict() }).strict();
export type IncompleteV5 = z.output<typeof incompleteV5Schema>;

// hardcode-ok: shipped starter texts of the owner's own editable messages; no price, discount or code inside.
export const INCOMPLETE_V5_DEFAULT: IncompleteV5 = {
  possibleMatch: false,
  templates: {
    forgot: 'Hello {name}, you left {items} in your bag. Need any help to finish your order? {link}',
    size: 'Hello {name}, not sure about the size for {items}? Tell us your height and weight and we will help you pick.',
    delivery: 'Hello {name}, we deliver to your area. Your order of {items} is ready to place whenever you are. {link}',
    offer: 'Hello {name}, we have an offer for your bag of {items}: {offer}. {link}',
  },
};

export const incompleteV5Settings = {
  'orders.incompleteV5': setting({
    scope: 'store',
    schema: incompleteV5Schema,
    default: INCOMPLETE_V5_DEFAULT,
    valueType: 'JSON',
    group: 'orders',
    labelKey: 'orders.incompleteV5.label',
    helpKey: 'orders.incompleteV5.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 348,
    version: 295,
  }),
};
