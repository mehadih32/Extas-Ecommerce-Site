// PR 622 (CN-034) — what the order page and My orders need for "Buy again": whether an order offers it and the
// owner's words in the page's language (`account.reorder`; the two error lines are the shop dictionary's).
import type { AccountReorderSettings } from '@extas/settings';
import { reorderOffered } from '@extas/cart/pure';
import type { BuyAgainWords } from '@/components/shop/account/BuyAgain';
import type { ShopContext } from './context';

export interface ReorderView {
  /** Whether an order in this state shows the button. */
  offered: (status: string) => boolean;
  /** My orders shows it on the cards too. */
  inList: boolean;
  words: BuyAgainWords;
}

/** The view of the setting for a page in `c.lang`. */
export function reorderViewOf(c: Pick<ShopContext, 'lang' | 't'>, s: AccountReorderSettings): ReorderView {
  const lang = c.lang === 'bn' ? 'bn' : 'en';
  const w = s.words;
  return {
    offered: (status) => reorderOffered(s, status),
    inList: s.enabled && s.inList,
    words: {
      button: w.button[lang],
      added: w.added[lang],
      soldOut: w.soldOut[lang],
      inStock: w.inStock[lang],
      gone: w.gone[lang],
      nothing: w.nothing[lang],
      goBag: w.goBag[lang],
      error: c.t('account.reorder.error'),
      off: c.t('account.reorder.off'),
    },
  };
}
