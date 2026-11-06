// S02 · PR 595 — the owner's own sections on the shop (Website › Page layouts, `layout.blocks`) and a category's own
// layout (`layout.categoryOwn`). The home page and the category pages draw `pageItems`: their own sections in the owner's
// order with his sections in between, each only on its days (store time zone) and its screens. `blockContent` reads what
// the shown sections need (products, tiles, reviews, articles, sets) once per page; a section with nothing true to show
// draws nothing. Nothing here changes a price, an order or a customer: a set's price is the one the set rule gives.
import { getPrisma } from '@extas/db/client';
import type { CategoryOwn, LayoutBlock } from '@extas/settings';
import { liveJournal, type LivePost } from '../journal/journal';
import { journalSettings } from '../journal/shop';
import { categoryLeads, pickCards, type ShopCard } from './catalogue';
import { cardView, setCardGroups, type CardView } from './combo';
import type { ShopContext } from './context';
import { blockLive, flatten, type FlatItem } from './layout-flat';
import { fullLayout, type LayoutPage } from './layouts';
import type { LayoutRow } from './layout-rows';
import { homeReviews, type ReviewRow } from './reviews';

/** The owner's sections of a page: the home page's, or a category page's (every category's, then this one's). */
export function blocksOf(all: readonly LayoutBlock[], page: 'home' | 'category', slug: string | null = null): LayoutBlock[] {
  if (page === 'home') return all.filter((b) => b.page === 'home');
  return [...all.filter((b) => b.page === 'category' && b.cat === null), ...all.filter((b) => b.page === 'category' && b.cat !== null && b.cat === slug)];
}

/** A category's own order while its switch is on, else the order for every category page. */
export function categoryRows(own: CategoryOwn, slug: string, every: readonly LayoutRow[]): readonly LayoutRow[] {
  const mine = own.find((x) => x.cat === slug);
  return mine?.on ? mine.rows : every;
}

/** What the page draws, in order: its shown sections and the owner's sections live today. */
export function pageItems(page: LayoutPage, saved: readonly LayoutRow[] | null | undefined, blocks: readonly LayoutBlock[], today: string): FlatItem<LayoutBlock>[] {
  return flatten(fullLayout(page, saved), blocks).filter((it) => (it.kind === 'sec' ? it.row.on : blockLive(it.block, today)));
}

export type BlockContent =
  | { kind: 'cards'; cards: ShopCard[] }
  | { kind: 'tiles'; leads: Record<string, ShopCard> }
  | { kind: 'reviews'; row: ReviewRow }
  | { kind: 'posts'; posts: LivePost[] }
  | { kind: 'sets'; sets: CardView[] }
  | { kind: 'none' };

async function contentOf(c: ShopContext, b: LayoutBlock): Promise<BlockContent> {
  switch (b.type) {
    case 'banner': {
      if (!b.data.product) return { kind: 'none' };
      return { kind: 'cards', cards: await pickCards(c.storeId, { source: 'manual', cat: '', tag: '', ids: [b.data.product] }, 1) };
    }
    case 'productRow':
    case 'productGrid':
      return { kind: 'cards', cards: await pickCards(c.storeId, b.data, b.data.limit) };
    case 'categoryTiles': {
      const slugs = b.data.cats.length ? b.data.cats : c.cats.map((k) => k.slug);
      return { kind: 'tiles', leads: await categoryLeads(c.storeId, slugs) };
    }
    case 'reviews':
      return { kind: 'reviews', row: await homeReviews(c.storeId, b.data.limit, c.s['home.reviews'].minRating) };
    case 'journal': {
      if (!process.env.DATABASE_URL || !(await journalSettings(c.storeId)).on) return { kind: 'none' };
      const { posts } = await liveJournal(getPrisma(), c.storeId, c.lang, { page: 1, perPage: b.data.limit });
      return { kind: 'posts', posts };
    }
    case 'comboRow': {
      const all = await setCardGroups(c);
      const groups = all.groups.filter((g) => !b.data.rule || g.ruleId === b.data.rule).slice(0, b.data.limit);
      return { kind: 'sets', sets: groups.map((g) => cardView(c, g, all)) };
    }
    default:
      return { kind: 'none' };
  }
}

/** What each shown owner's section needs, read together; a section whose read fails draws nothing. */
export async function blockContent(c: ShopContext, items: readonly FlatItem<LayoutBlock>[]): Promise<Map<string, BlockContent>> {
  const blocks = items.flatMap((it) => (it.kind === 'block' ? [it.block] : []));
  const read = await Promise.all(
    blocks.map(async (b) => {
      try {
        return [b.id, await contentOf(c, b)] as const;
      } catch (e) {
        console.warn(`shop: section ${b.id} unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
        return [b.id, { kind: 'none' } as BlockContent] as const;
      }
    }),
  );
  return new Map(read);
}
