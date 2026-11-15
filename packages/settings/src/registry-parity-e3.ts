// PR 815-816 (owner order 15 Nov 2026: the real admin equals prototype v5 100%, lane E3) — the few small settings the prototype's
// Settings pages need that did not exist yet. Nothing here runs an agent, moves money or sends anything; every one ships empty or at
// the prototype's own starting choice and every number is editable on its own page. Registry version 815-816.
// - `security.blockedAddresses` (PR 815): addresses the owner blocked from the admin sign-in page (Security › Blocked addresses). The
//   admin refuses a listed address at the same doors as the address list (guardAdmin, the sign-in, its 2FA step). Never deleted
//   from the history: an unblock only takes the address off this list (the settings history keeps who and when).
// - `privacy.keepMonths` (PR 815): how long old product photos and videos and chat messages are kept (Data & privacy › How long
//   things are kept). Orders and money records are never part of it.
// Labels: messages/parity-e3.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const text = (max: number) => z.string().trim().max(max);
const base = { scope: 'installation', valueType: 'JSON', group: 'system', isOwnerData: false, isPublic: false } as const;

export const BLOCKED_ADDRESSES_MAX = 200; // hardcode-ok: technical bound (a list, not a book)
export const blockedAddressSchema = z.object({ ip: text(64).min(2), why: text(200), at: text(40) }).strict();
export const blockedAddressesSchema = z.object({ list: z.array(blockedAddressSchema).max(BLOCKED_ADDRESSES_MAX) }).strict();
export type BlockedAddressesSettings = z.output<typeof blockedAddressesSchema>;

/** The choices the prototype offers (months). Anything else is refused, so a typo can never mean "keep nothing". */
export const MEDIA_KEEP_MONTHS = [12, 24, 60] as const; // hardcode-ok: the prototype's own options
export const CHAT_KEEP_MONTHS = [6, 12, 24] as const; // hardcode-ok: the prototype's own options
export const privacyKeepMonthsSchema = z
  .object({
    media: z.union([z.literal(12), z.literal(24), z.literal(60)]),
    chat: z.union([z.literal(6), z.literal(12), z.literal(24)]),
  })
  .strict();
export type PrivacyKeepMonthsSettings = z.output<typeof privacyKeepMonthsSchema>;
export const PRIVACY_KEEP_MONTHS_DEFAULT: PrivacyKeepMonthsSettings = { media: 24, chat: 12 }; // hardcode-ok: the prototype's starting choice, editable on the page

export const parityE3Settings = {
  'security.blockedAddresses': setting({
    ...base,
    schema: blockedAddressesSchema,
    default: { list: [] },
    labelKey: 'security.blockedAddresses.label',
    helpKey: 'security.blockedAddresses.help',
    sortOrder: 815,
    version: 815,
  }),
  'privacy.keepMonths': setting({
    ...base,
    group: 'privacy',
    schema: privacyKeepMonthsSchema,
    default: PRIVACY_KEEP_MONTHS_DEFAULT,
    labelKey: 'privacy.keepMonths.label',
    helpKey: 'privacy.keepMonths.help',
    sortOrder: 815,
    version: 815,
  }),
};
