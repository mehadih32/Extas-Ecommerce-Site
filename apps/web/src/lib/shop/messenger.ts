// S22 · PR 624 (CN-034; customer 360° finding 7) — the Messenger button's link, built from settings only: the store's
// own Facebook Page (`contact.messenger`, owner data, empty as shipped; or, when the owner allows it, the Page his
// Facebook link names) opened in Messenger at `https://m.me/<page>`, with a "ref" naming where it was tapped
// (`header`, `product-<slug>`, `order-<number>`, `help-<slug>`, `contact`) so the chat starts with context. Off as it
// ships (`support.messengerButton`); with the switch off, the place not ticked or no Page, there is no link at all.
// Server and browser safe (no database).
import { messengerPageOf, type MessengerPlace, type SupportMessengerButtonSettings } from '@extas/settings';
import type { ShopLang } from './lang';

export interface MessengerLink {
  href: string;
  label: string;
  hint: string;
}

/** The longest "ref" sent (Messenger allows more; a short one is enough to say where). */
export const MESSENGER_REF_MAX = 120; // hardcode-ok: a length guard on our own link, not a business number

/** Messenger's "ref": letters, digits, "-" and "_" only. */
export function messengerRef(place: MessengerPlace | 'menu', detail?: string | null): string {
  const tail = (detail ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${place}${tail ? `-${tail}` : ''}`.slice(0, MESSENGER_REF_MAX);
}

/** The Page the button opens: the owner's own, else (when allowed) the one his Facebook link names, else none. */
export function messengerPage(set: Pick<SupportMessengerButtonSettings, 'useFacebookLink'>, page: string | null | undefined, facebook: string | null | undefined): string | null {
  return messengerPageOf(page) ?? (set.useFacebookLink ? messengerPageOf(facebook) : null);
}

/** `https://m.me/<page>`, with `?ref=` when one is given. */
export function messengerHref(page: string, ref?: string | null): string {
  return `https://m.me/${encodeURIComponent(page)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
}

/**
 * The button for one place, or null when it must not show: the switch off, the place not ticked, or no Page.
 * `detail` (a product's slug, an order's number, a help page) goes into the ref while the owner sends one; `refAs`
 * names the phone menu, which carries the header's button.
 */
export function messengerLink(
  set: SupportMessengerButtonSettings,
  o: { page: string | null | undefined; facebook: string | null | undefined; place: MessengerPlace; lang: ShopLang; detail?: string | null; refAs?: 'menu' },
): MessengerLink | null {
  if (!set.enabled || !set.places.includes(o.place)) return null;
  const page = messengerPage(set, o.page, o.facebook);
  if (!page) return null;
  return {
    href: messengerHref(page, set.sendRef ? messengerRef(o.refAs ?? o.place, o.detail) : null),
    label: set.label[o.lang] || set.label.en,
    hint: set.hint[o.lang] || set.hint.en,
  };
}
