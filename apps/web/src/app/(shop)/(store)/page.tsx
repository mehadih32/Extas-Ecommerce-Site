// PR 41 — the home page (demo 20-home.js HOME_SECTIONS): the sections the owner switched on, in his order
// (`home.sections`; the page layout builder, PR 595, edits the same list). Each section draws itself only when it has
// something true to show, so a new shop never shows an empty block or a made-up number:
// - hero (`home.hero`): words, buttons and promise lines; its sliding pictures are PR 43;
// - categories (`home.categories`) and new in (`home.newIn`): from the catalogue;
// - reviews (`home.reviews`): approved reviews only;
// - festive (Smart Rules' festive window), sets and shop the look (combos, S03), size finder (Find My Size, PR 58),
//   flash sale (PR 44) and the journal (S12) join when the PRs that make their content land; until then they draw
//   nothing. The progress page stays at /status.
// ~~Until the home page is built, it shows the store shell with one sliding row: the live categories.~~
import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import type { HomeSectionId } from '@extas/settings';
import { HomeCategories } from '@/components/shop/home/HomeCategories';
import { HomeHero } from '@/components/shop/home/HomeHero';
import { HomeNewIn } from '@/components/shop/home/HomeNewIn';
import { HomeReviews } from '@/components/shop/home/HomeReviews';
import { categoryLeads, newestCards } from '@/lib/shop/catalogue';
import { shopContext } from '@/lib/shop/context';
import { homeSectionsOn } from '@/lib/shop/home-model';
import { shopMetadata } from '@/lib/shop/meta';
import { homeReviews } from '@/lib/shop/reviews';

export async function generateMetadata(): Promise<Metadata> {
  return shopMetadata(await shopContext(), 'home', null);
}

export default async function Home() {
  const c = await shopContext();
  const on = homeSectionsOn(c.s['home.sections']);
  const want = (id: HomeSectionId) => on.includes(id);
  const newIn = c.s['home.newIn'];
  const rev = c.s['home.reviews'];
  const [leads, cards, reviews] = await Promise.all([
    want('categories') ? categoryLeads(c.storeId, c.cats.map((k) => k.slug)) : Promise.resolve({}),
    want('new-in') ? newestCards(c.storeId, newIn.count, newIn.order) : Promise.resolve([]),
    want('reviews') ? homeReviews(c.storeId, rev.count, rev.minRating) : Promise.resolve({ reviews: [], average: 0, total: 0 }),
  ]);
  const draw: Partial<Record<HomeSectionId, () => ReactNode>> = {
    hero: () => <HomeHero c={c} />,
    categories: () => <HomeCategories c={c} leads={leads} />,
    'new-in': () => <HomeNewIn c={c} cards={cards} />,
    reviews: () => <HomeReviews c={c} row={reviews} />,
  };
  const body = on.map((id) => <Fragment key={id}>{draw[id]?.()}</Fragment>);
  // H9 · the sliding rows fade at both edges unless the owner switched it off
  return c.s['home.rowFade'] ? <>{body}</> : <div className="hm-nofade" style={{ display: 'contents' }}>{body}</div>;
}
