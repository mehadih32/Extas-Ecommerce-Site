// S02 · PR 80 follow-up 679 (Blueprint D4.1; demo 02-core.js SHOWN, 51-checkout.js, 50-bag.js, 72-upsell.js) — registry
// version 265, lane B. The demo's eye-toggles whose parts the shop did not draw yet, each with its part:
//
// - `checkout.loginNudge`: "Ordered before? Log in for your saved address and offers." under the checkout's first
//   heading, for a visitor who is not signed in. Off (demo SHOWN off).
// - `checkout.doorNote` + `checkout.doorNote.text`: a short line under the settled delivery band. Its words are about
//   refusing at the door (a Cash on Delivery promise), so they are only ever the owner's: the text ships empty in both
//   languages and nothing is drawn until he writes it (Website › Eye-toggles, "Door note words"). Off.
// - `checkout.helpStripDesktop`: the "Need help with your order?" strip on a computer too; off = phones and tablets
//   only (demo `.co-help-m`; Blueprint D4.1 Off).
// - `bag.waSendBag`: "Send my bag on WhatsApp" under the bag's Checkout button — a preview of the message and a link
//   that opens WhatsApp with it to the store's own number (`contact.whatsapp`); nothing is sent by itself. Off.
// - `thanks.upsell`: "You may also like" on the thank-you page (products from the order's categories, never what is in
//   it), `count` cards. Off (a new part of the page).
// - `bag.upsell.setLine`: the set line inside the bag's upsell ("Buy 2 and save · 2 for ৳ 1,500 · you save ৳ 200"),
//   which the bag already drew; on as before (Blueprint D4.1 On), now with its own switch.
// Words only: no price, charge, discount or Cash on Delivery rule changes here.
import { z } from 'zod';
import { setting } from './define';

const V679 = 265;

/** The longest door note, per language (a text-length guard, not a business number). */
export const DOOR_NOTE_MAX = 160; // hardcode-ok: a text-length guard

export const doorNoteTextSchema = z.object({ en: z.string().trim().max(DOOR_NOTE_MAX), bn: z.string().trim().max(DOOR_NOTE_MAX) }).strict();
export type DoorNoteText = z.output<typeof doorNoteTextSchema>;

/** How many cards the thank-you page's upsell may show (the field's bounds). */
export const THANKS_UPSELL_COUNT = { min: 1, max: 8 } as const; // hardcode-ok: the field's bounds
export const thanksUpsellSchema = z.object({ enabled: z.boolean(), count: z.int().min(THANKS_UPSELL_COUNT.min).max(THANKS_UPSELL_COUNT.max) }).strict();
export type ThanksUpsell = z.output<typeof thanksUpsellSchema>;

const sw = (group: 'checkout' | 'bag', labelKey: string, def: boolean, sortOrder: number) =>
  setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: true,
    group,
    version: V679,
    schema: z.boolean(),
    default: def,
    valueType: 'BOOLEAN',
    labelKey: `${labelKey}.label`,
    helpKey: `${labelKey}.help`,
    sortOrder,
  });

export const eyePartSettings = {
  // hardcode-ok: the shipped defaults (Blueprint D4.1 / the demo's SHOWN; new parts off)
  'checkout.loginNudge': sw('checkout', 'checkout.loginNudge', false, 31),
  'checkout.doorNote': sw('checkout', 'checkout.doorNote', false, 32),
  'checkout.doorNote.text': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: true,
    group: 'checkout',
    version: V679,
    schema: doorNoteTextSchema,
    // hardcode-ok: empty — the owner writes his own words, or nothing is shown
    default: { en: '', bn: '' },
    valueType: 'JSON',
    labelKey: 'checkout.doorNote.text.label',
    helpKey: 'checkout.doorNote.text.help',
    sortOrder: 33,
  }),
  'checkout.helpStripDesktop': sw('checkout', 'checkout.helpStripDesktop', false, 34),
  'bag.waSendBag': sw('bag', 'bag.waSendBag', false, 145),
  'bag.upsell.setLine': sw('bag', 'bag.upsell.setLine', true, 275),
  'thanks.upsell': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: true,
    group: 'checkout',
    version: V679,
    schema: thanksUpsellSchema,
    // hardcode-ok: off as shipped; four cards once on (the demo's thank-you row)
    default: { enabled: false, count: 4 },
    valueType: 'JSON',
    labelKey: 'thanks.upsell.label',
    helpKey: 'thanks.upsell.help',
    sortOrder: 935,
  }),
};
