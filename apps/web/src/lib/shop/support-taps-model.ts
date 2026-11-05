// S22 · PR 624 (CN-034) — which support button a tap was on and where (browser and server safe, no database). The
// shop's listener (components/shop/SupportTaps) reads the tapped link's address and its place on the page and sends
// both to /api/shop/support-tap, where they are counted by day (lib/shop/support-taps.ts → @extas/support taps.ts).
// Numbers only: never who tapped.
import { tapChannelOf, type TapChannel, type TapPlace } from '@extas/support/pure';
import { splitLang } from './lang';
import { ROUTES } from './routes';

export const SUPPORT_TAP_URL = '/api/shop/support-tap';
export { tapChannelOf, type TapChannel, type TapPlace };

/** Where the tapped button sat: inside the header, the phone menu or the WhatsApp disc, else the kind of page. */
export function tapPlaceOf(o: { inHeader: boolean; inMenu: boolean; inFab: boolean; path: string; productPrefix: string }): TapPlace {
  if (o.inFab) return 'fab';
  if (o.inMenu) return 'menu';
  if (o.inHeader) return 'header';
  const path = splitLang(o.path.split(/[?#]/)[0] || '/').path.replace(/\/+$/, '') || '/';
  if (path === ROUTES.help('contact')) return 'contact';
  if (path.startsWith('/help/')) return 'help';
  if (path.startsWith(`${ROUTES.orders}/`)) return 'order';
  const prefix = o.productPrefix.replace(/\/+$/, '');
  if (prefix && path.startsWith(`${prefix}/`)) return 'product';
  return 'other';
}
