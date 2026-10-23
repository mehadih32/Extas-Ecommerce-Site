// PR 70 — the floating WhatsApp button's page switch (Blueprint `fab.whatsapp`, Note 3.1): which kind of page an
// address is, and whether the button shows there. Off unless the owner switches it on, never without his number.
import type { ShellFabSettings } from '@extas/settings';
import { ROUTES } from './routes';

export type FabPage = keyof ShellFabSettings['pages'];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** The kind of page at a path (without /bn); `productPrefix` is the owner's product address prefix. */
export function fabPage(path: string, productPrefix: string): FabPage {
  const p = path.replace(/\/+$/, '') || '/';
  const prefix = `/${productPrefix.replace(/^\/+|\/+$/g, '')}`;
  if (p === ROUTES.home) return 'home';
  if (p === ROUTES.bag) return 'bag';
  if (under(p, '/collections')) return 'category';
  if (prefix !== '/' && under(p, prefix)) return 'product';
  if (under(p, '/help')) return 'help';
  if (p === ROUTES.wishlist) return 'wishlist';
  if (under(p, ROUTES.account)) return 'account';
  return 'other';
}

/** Whether the button shows on this page: switched on, this kind of page ticked, and a number to send to. */
export function fabShows(set: ShellFabSettings, page: FabPage, href: string | null): boolean {
  return set.on && set.pages[page] && !!href;
}

/** The button's place classes. */
export function fabClass(set: Pick<ShellFabSettings, 'side' | 'place'>): string {
  return ['wa-fab', set.side === 'left' ? 'wa-left' : '', set.place === 'middle' ? 'wa-mid' : ''].filter(Boolean).join(' ');
}
