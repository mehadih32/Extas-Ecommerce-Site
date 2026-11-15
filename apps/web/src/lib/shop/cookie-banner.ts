// PR 743 (owner order 15 Nov 2026, group ঙ) — the cookie banner's rules without a database or a screen: the cookie that
// remembers a visitor's choice (its name and "yes"/"no" are technical, the days it lasts are the owner's `cookie.banner`
// setting), whether the banner shows (it is on, and the visitor has not chosen yet), and whether the shop's own analytics and
// the ad beacons may run for this visitor (they may unless the banner is on, the owner asked that a "No" stops them, and
// the visitor said no). The banner never blocks the shop: nothing is hidden behind it.
import type { CookieBanner } from '@extas/settings';

/** The cookie that holds the visitor's choice (technical, never a policy). */
export const CONSENT_COOKIE = 'extas_cookie_choice'; // hardcode-ok: a technical cookie name
export const CONSENT_YES = 'yes'; // hardcode-ok: a technical cookie value
export const CONSENT_NO = 'no'; // hardcode-ok: a technical cookie value

export type Choice = typeof CONSENT_YES | typeof CONSENT_NO | null;

/** The visitor's remembered choice from the cookie's value (anything else is "not chosen yet"). */
export const choiceOf = (value: string | null | undefined): Choice => (value === CONSENT_YES || value === CONSENT_NO ? value : null);

/** Whether the banner is drawn: switched on, and no choice yet. */
export const bannerShows = (b: CookieBanner, choice: Choice): boolean => b.on && choice === null;

/** Whether the analytics and ad beacons may run for this visitor. */
export const beaconsAllowed = (b: CookieBanner, choice: Choice): boolean => !(b.on && b.declineStops && choice === CONSENT_NO);

/** The `Set-Cookie`-style text a browser writes for a choice (`document.cookie`), lasting the owner's days. */
export const choiceCookie = (choice: typeof CONSENT_YES | typeof CONSENT_NO, days: number): string => `${CONSENT_COOKIE}=${choice}; Max-Age=${Math.round(days * 86_400)}; Path=/; SameSite=Lax`;
