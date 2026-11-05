// S22 · PR 624 (CN-034, 1 Nov 2026; customer 360° finding 7) — the Messenger button on the shop. Registry version 189
// (lane C's range). Labels: messages/support-messenger.<lang>.json; the admin's place is Support → Support settings
// (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `contact.messenger` (per store, owner data, empty as shipped): the store's own Facebook Page that Messenger opens —
// its user name ("extas.bd") or number id, or an address that names it (m.me/…, facebook.com/…). Kept as the bare name.
// Owner data never has a default (PR 509), so the Page is its own key beside the other contact details.
//
// `support.messengerButton` (per store): the button itself. Off as it ships (CN-034 (5)).
// - `enabled`: the switch. With no Page (here or, when allowed, in the Facebook link) the button shows nowhere.
// - `useFacebookLink`: with no Page above, the Page named by the shop's Facebook link (`social.facebook`) is used.
// - `places`: where it shows — the header beside the WhatsApp icon, the product page, the help pages, the contact page,
//   the customer's order page.
// - `sendRef`: the link carries a "ref" naming the page (and product or order) it was tapped on, so the chat starts with
//   context (Messenger hands it to the Page with the first message).
// - `countTaps`: while the button is on, every tap on the shop's support buttons (Messenger, WhatsApp, the call
//   button) is counted by day, channel and place — numbers only, nothing about the person.
// - `label`, `hint`: the button's words and the small line under it, in English and Bengali.
//
// Nothing here sends a message, moves money, changes an order, a price or COD, blocks or deletes anything.
import { z } from 'zod';
import { setting } from './define';

export const MESSENGER_PLACES = ['header', 'product', 'help', 'contact', 'order'] as const;
export type MessengerPlace = (typeof MESSENGER_PLACES)[number];

/** The longest button words and hint. */
export const MESSENGER_WORDS_MAX = { label: 40, hint: 120 } as const;

/** A Page's user name (letters, digits and dots, not at either end) or its number id. */
const PAGE_NAME = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.]{0,48}[A-Za-z0-9])?|\d{5,20})$/;
/** Facebook paths that are never a Page's own name. */
const NOT_A_PAGE = new Set(['pages', 'profile.php', 'groups', 'events', 'sharer', 'sharer.php', 'share', 'watch', 'marketplace', 'messages', 'home.php', 'login', 'people', 'permalink.php', 'story.php', 'photo.php', 'help']);
const FB_HOSTS = /^(?:(?:www|m|web|business|mbasic)\.)?(?:facebook\.com|fb\.com|fb\.me|m\.me|messenger\.com)$/i;
/** A name the Page can have: a number id of 5–20 digits, or a user name with a letter, no ".." and not a site
 * (Facebook refuses names ending in .com or .net). */
const okName = (n: string): boolean => PAGE_NAME.test(n) && !n.includes('..') && !FB_HOSTS.test(n) && !/\.(?:com|net)$/i.test(n) && (/^\d{5,20}$/.test(n) || /[A-Za-z]/.test(n));

/**
 * The Page's bare name from what the owner typed — "extas.bd", "@extas.bd", "https://m.me/extas.bd",
 * "facebook.com/extas.bd/", "https://www.facebook.com/profile.php?id=1000123", "messenger.com/t/extas.bd" — or null
 * when it names no Page.
 */
export function messengerPageOf(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim().replace(/^@/, '');
  if (!raw) return null;
  if (PAGE_NAME.test(raw) && !FB_HOSTS.test(raw)) return okName(raw) ? raw : null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !FB_HOSTS.test(url.hostname) || url.username || url.password) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const id = url.searchParams.get('id');
  if (parts[0] === 'profile.php' && id && /^\d{5,20}$/.test(id)) return id;
  // facebook.com/pages/<Name>/<id> and facebook.com/p/<Name>-<id> name the Page by its number
  if (parts[0] === 'pages' && parts[2] && /^\d{5,20}$/.test(parts[2])) return parts[2];
  if (parts[0] === 'p' && parts[1]) {
    const m = /-(\d{5,20})$/.exec(parts[1]);
    return m ? m[1]! : null;
  }
  const name = /messenger\.com$/i.test(url.hostname) && parts[0] === 't' ? parts[1] : parts[0];
  return name && !NOT_A_PAGE.has(name.toLowerCase()) && okName(name) ? name : null;
}

const pageSchema = z
  .string()
  .trim()
  .max(50)
  .refine((v) => messengerPageOf(v) === v, 'a Facebook Page name (letters, digits and dots) or its number id');

const wordsOf = (max: number) => z.object({ en: z.string().trim().min(1).max(max), bn: z.string().trim().min(1).max(max) }).strict();

export const supportMessengerButtonSchema = z
  .object({
    enabled: z.boolean(),
    useFacebookLink: z.boolean(),
    places: z.array(z.enum(MESSENGER_PLACES)).max(MESSENGER_PLACES.length).refine((a) => new Set(a).size === a.length, 'each place once'),
    sendRef: z.boolean(),
    countTaps: z.boolean(),
    label: wordsOf(MESSENGER_WORDS_MAX.label),
    hint: wordsOf(MESSENGER_WORDS_MAX.hint),
  })
  .strict();
export type SupportMessengerButtonSettings = z.output<typeof supportMessengerButtonSchema>;

export const supportMessengerSettings = {
  'contact.messenger': setting({
    schema: pageSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'STRING',
    group: 'contact',
    labelKey: 'contact.messenger.label',
    helpKey: 'contact.messenger.help',
    isOwnerData: true,
    sortOrder: 25,
    version: 189,
  }),
  'support.messengerButton': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportMessengerButtonSchema,
    default: {
      enabled: false,
      useFacebookLink: true,
      places: [...MESSENGER_PLACES],
      sendRef: true,
      countTaps: true,
      label: { en: 'Chat on Messenger', bn: 'মেসেঞ্জারে কথা বলুন' },
      hint: { en: 'Opens our Facebook Page in Messenger', bn: 'আমাদের ফেসবুক পেজ মেসেঞ্জারে খুলবে' },
    },
    labelKey: 'support.messengerButton.label',
    helpKey: 'support.messengerButton.help',
    sortOrder: 66,
    version: 189,
  }),
};
