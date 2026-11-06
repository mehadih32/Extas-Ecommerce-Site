// PR 40 follow-up (6 Nov, lane B) — an address the shop has no page for, known before any page draws. Next 16 draws a
// page's notFound() only in the browser (its server answer is an empty error shell with HTTP 404; React's server
// renderer has no error boundaries), so for the commonest "page not found" — a typo, an old or broken link, a bot's
// guess — the proxy answers HTTP 404 itself and marks the request, and the catch-all page draws the shop's not-found
// page on the server inside the shop's shell (header, footer, both languages). Only the address is looked at: not under
// a folder of the shop's own (OWN_TOP_SEGMENTS), not a product address under the owner's prefix
// (`naming.productPathPrefix`), not a "Coming soon" address (lib/shop/routes). A missing product or article is still
// found by its page (it needs the database) and drawn in the browser, with HTTP 404 all the same.
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { productRoute } from './product-model';
import { comingSoon } from './routes';

/** The request header the proxy marks an unknown address with (its value is the process's random rewrite mark). */
export const NOT_FOUND_HEADER = 'x-extas-not-found';

/**
 * The first address segments that have a page or route of their own besides the catch-all: the shop's folders under
 * app/(shop) and the app's own pages outside it the proxy sees. A test keeps this list equal to the folders.
 */
export const OWN_TOP_SEGMENTS: readonly string[] = [
  'account',
  'bag',
  'bulk-order',
  'checkout',
  'collections',
  'combo',
  'combos',
  'email',
  'feeds',
  'fresh-start',
  'help',
  'journal',
  'l',
  'pay',
  'search',
];

const clean = (path: string) => path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';

/** Whether the address could be unknown at all (not the home page, not under a folder of its own): no setting needed. */
function mayBeUnknown(p: string): boolean {
  return p !== '/' && !OWN_TOP_SEGMENTS.includes(p.split('/')[1] ?? '');
}

/** Whether an English page path (no /bn, no query) is one the shop has no page for at all. */
export function unknownAddress(path: string, productPrefix: string): boolean {
  const p = clean(path);
  return mayBeUnknown(p) && !productRoute(p, productPrefix) && comingSoon(p, productPrefix) === null;
}

/** For the proxy: whether this address is unknown now (false when the settings cannot be read: the page decides). */
export async function unknownAddressNow(storeId: number, path: string): Promise<boolean> {
  if (!mayBeUnknown(clean(path))) return false;
  const r = settingsResolver();
  if (!r) return false;
  try {
    return unknownAddress(path, await withTimeout(r.value('naming.productPathPrefix', { storeId }), settingsTimeoutMs()));
  } catch {
    return false;
  }
}
