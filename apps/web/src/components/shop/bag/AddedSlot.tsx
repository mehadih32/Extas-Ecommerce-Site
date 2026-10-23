// PR 41 · follow-up 21 — the added-to-bag panel (PR 106) on a page whose cards carry "Quick add" (the home page, a
// category): the card's Add button opens `?added=<line>`, and the page draws <AddedPanel> for that line exactly as the
// product page does; closing it goes back to the same address without `added`. Nothing is read without `added`.
import { bagSettings, currentBag } from '@/lib/shop/bag';
import { reassurance } from '@/lib/shop/bag-model';
import { bagPickCards, cardsByIds } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { AddedPanel } from './AddedPanel';
import './bag.css';

/** The address to go back to: the same path and query without `added`. */
export function closeHrefOf(path: string, search: Record<string, string | string[] | undefined>): string {
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (k === 'added' || v === undefined) continue;
    // a filter may repeat (`?size=M&size=L`): every value comes back
    for (const one of typeof v === 'string' ? [v] : v) keep.append(k, one);
  }
  return `${path}${keep.size ? `?${keep.toString()}` : ''}`;
}

export async function AddedSlot({ c, added, closeHref }: { c: ShopContext; added: string | string[] | undefined; closeHref: string }) {
  const lineId = typeof added === 'string' ? added : null;
  if (!lineId) return null;
  const [s, view] = await Promise.all([bagSettings(c.storeId), currentBag(c)]);
  if (!view.items.some((i) => i.lineId === lineId)) return null;
  const [cards, picks] = await Promise.all([cardsByIds(c.storeId, view.items.map((i) => i.productId)), bagPickCards(c.storeId, view.productIds, s['bag.panel.picks'])]);
  return (
    <AddedPanel
      c={c}
      view={view}
      lineId={lineId}
      s={s}
      cards={cards}
      picks={picks.cards}
      trust={reassurance(c.flags, { securePayment: s['bag.trust.securePayment'], originalLine: s['bag.upsell.originalLine'] })}
      closeHref={closeHref}
    />
  );
}
