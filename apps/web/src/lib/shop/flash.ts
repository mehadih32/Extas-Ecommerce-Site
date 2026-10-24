// PR 44 — what the home page's flash sale reads on the server: the owner's sale (`home.flashSale`, none until he sets
// one) and its rows' look (`home.flashRows`), whether it runs now, its products as cards (catalogue.ts
// `flashSaleCards`) and the two rows (flash-model.ts). No sale, a paused one, one not begun or over, or one with no card
// to show: nothing is drawn. Without a database the sale is the registry's (none).
//
// A test server (EXTAS_SHOP_TEST_PAGES=1) may ask for the trial (`/?try=flash`, the device gate and Lighthouse): the
// section as it looks with a sale running — every sample product with a compare-at price, shown through the PR 38 rule
// as if the owner had chosen the compare-at price as the "was" price, ending 4 h 12 min 38 s after the page is drawn
// (the demo's clock). Never on the live shop; nothing is written.
import type { HomeFlashRows, HomeFlashSale } from '@extas/settings';
import { flashSaleCards, type PriceRuleTrial, type ShopCard } from './catalogue';
import { readPageSettings, type ShopContext } from './context';
import { flashPick, flashRows, flashRunning, flashUpTo, type FlashRow } from './flash-model';

type Search = Record<string, string | string[] | undefined>;

/** The test server's trial of a running sale (never on the live shop). */
export const flashTrialAsked = (search: Search): boolean =>
  process.env.EXTAS_SHOP_TEST_PAGES === '1' && (Array.isArray(search.try) ? search.try[0] : search.try) === 'flash';

/** The trial's clock: the demo's 04:12:38. */
export const TRIAL_LEFT_MS = ((4 * 60 + 12) * 60 + 38) * 1000;
/** The trial's "was" price: the sample catalogue's compare-at prices, through the PR 38 rule. */
export const TRIAL_PRICE_RULE: PriceRuleTrial = { store: 'MRP', mrpOwnLabel: true };

/** The trial's sale: every real markdown, running now. */
export function trialSale(now: number): HomeFlashSale {
  return { on: true, startsAt: null, endsAt: new Date(now + TRIAL_LEFT_MS).toISOString(), source: 'markdowns', productIds: [], collection: null };
}

export interface FlashData {
  /** When the clock reaches zero, and the server's time as it drew the page (epoch ms). */
  endsAt: number;
  serverNow: number;
  /** The biggest saving shown, for the "Up to N% off" tag (0 = no tag). */
  upTo: number;
  rows: FlashRow[];
  look: HomeFlashRows;
}

/** The running sale ready to draw, or null when there is nothing to show. */
export async function homeFlash(c: ShopContext, search: Search, now = Date.now()): Promise<FlashData | null> {
  const set = await readPageSettings(['home.flashSale', 'home.flashRows'], c.storeId);
  const trial = flashTrialAsked(search);
  const sale = trial ? trialSale(now) : set['home.flashSale'];
  const look = set['home.flashRows'];
  const window = flashRunning(sale, now);
  if (!sale || !window) return null;
  const all: ShopCard[] = await flashSaleCards(c.storeId, sale, look.inStockOnly, new Date(now), trial ? TRIAL_PRICE_RULE : undefined);
  const cards = flashPick(all, look);
  const rows = flashRows(cards, look);
  if (!rows.length) return null;
  return { endsAt: window.endsAt, serverNow: now, upTo: look.upTo ? flashUpTo(cards.slice(0, look.perRow * 2)) : 0, rows, look };
}
