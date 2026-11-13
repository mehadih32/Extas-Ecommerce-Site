// The page kind of a shop path. Its own file with no runtime imports on purpose: the shop's analytics beacon (PR 338,
// a client component on every shop page) needs only this, and page-edit-model.ts pulls in the whole settings registry
// and the layouts — which made every shop page download them and cost it speed (Lighthouse total blocking time).
import type { EditPage } from './page-edit-model';

/** The page kind of a shop path (without /bn). */
export function pageKindOf(path: string, productPrefix: string): EditPage {
  const p = path.split(/[?#]/)[0] || '/';
  if (p === '/' || p === '') return 'home';
  if (p.startsWith('/collections/')) return 'category';
  if (p === '/bag' || p.startsWith('/bag/')) return 'bag';
  if (p.startsWith('/checkout') || p.startsWith('/pay')) return 'checkout';
  const pre = `/${productPrefix.replace(/^\/+|\/+$/g, '')}/`;
  if (productPrefix && p.startsWith(pre)) return 'product';
  return 'other';
}
