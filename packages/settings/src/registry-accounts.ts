// S04 · customer accounts — PR 129–137 (Blueprint D3.13–D3.15; demo 60-account.js, 52-thanks.js). Registry version 29 (the product page templates took 28 and merge first).
// Labels: messages/accounts.<lang>.json. Every word the account pages show is in the shop dictionary
// (apps/web/messages/shop-account.<lang>.json, `account.*`), editable in both languages through `language.labels`.
//
// SIM-F-039 (CN-017): an account made from an order never gets a password; the first sign-in is by a one-time SMS code.
// CN-018: every limit is a setting with bounds; every optional feature and perk ships off, and nothing here holds money
// or a made-up offer: the offer banner lists only the owner's own offers and the customer's real wallet balance.
import { z } from 'zod';
import { setting } from './define';

const V = 29;

const base = { scope: 'store', isOwnerData: false, group: 'accounts', version: V } as const;

export const accountSettings = {
  // ---- PR 129 · the account made with the first order ----
  'account.autoCreate.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'account.autoCreate.enabled.label',
    helpKey: 'account.autoCreate.enabled.help',
    sortOrder: 10,
  }),
  'account.thanksCard.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'account.thanksCard.enabled.label',
    helpKey: 'account.thanksCard.enabled.help',
    sortOrder: 20,
  }),
};
