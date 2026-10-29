// PR 41 — the home page (demo 20-home.js HOME_SECTIONS): the sections the owner switched on, in his order
// (`home.sections`; the page layout builder, PR 595, edits the same list). Each section draws itself only when it has
// something true to show, so a new shop never shows an empty block or a made-up number:
// - hero (`home.hero`): words, buttons and promise lines; ~~its sliding pictures are PR 43~~ its sliding pictures
//   (`home.heroSlides`, PR 43): the categories in turns, or a live campaign collection;
// - categories (`home.categories`) and new in (`home.newIn`): from the catalogue;
// - reviews (`home.reviews`): approved reviews only;
// - festive (Smart Rules' festive window), sets and shop the look (combos, S03), size finder (Find My Size, PR 58),
//   ~~flash sale (PR 44)~~ and the journal (S12) join when the PRs that make their content land; until then they draw
//   nothing. The progress page stays at /status.
// - flash sale (PR 44, `home.flashSale`): the owner's sale while it runs, two rows sliding past each other and a clock
//   that ticks; no sale, nothing drawn (lib/shop/flash). A test server's `?try=flash` draws the trial sale.
// ~~Until the home page is built, it shows the store shell with one sliding row: the live categories.~~
import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import type { HomeSectionId } from '@extas/settings';
import { HomeCategories } from '@/components/shop/home/HomeCategories';
import { HomeFlash } from '@/components/shop/home/HomeFlash';
import { HomeHero } from '@/components/shop/home/HomeHero';
import { HomeHeroSlides } from '@/components/shop/home/HomeHeroSlides';
import { HomeNewIn } from '@/components/shop/home/HomeNewIn';
import { HomeReviews } from '@/components/shop/home/HomeReviews';
import { AddedSlot, closeHrefOf } from '@/components/shop/bag/AddedSlot';
import { CardDeskMount } from '@/components/shop/CardDeskMount';
import { categoryLeads, heroCategoryCards, heroCollectionCards, newestCards } from '@/lib/shop/catalogue';
import { shopContext, type ShopContext } from '@/lib/shop/context';
import { homeFlash } from '@/lib/shop/flash';
import { heroSlidePicks, homeSectionsOn, type HeroPick } from '@/lib/shop/home-model';
import { shopMetadata } from '@/lib/shop/meta';
import { hrefIn } from '@/lib/shop/lang';
import { homeReviews } from '@/lib/shop/reviews';

export async function generateMetadata(): Promise<Metadata> {
  // PR 221: the home page's search title and description (`seo.titles.home`; the shop's name until the owner writes more)
  return shopMetadata(await shopContext(), 'home', null, { seo: { kind: 'home' } });
}

/** The hero's pictures: a live campaign collection's products when one is set, else the categories in turns. */
async function heroPicks(c: ShopContext): Promise<HeroPick[]> {
  const set = c.s['home.heroSlides'];
  if (set.collection) {
    const own = await heroCollectionCards(c.storeId, set.collection, set.count, set.inStockOnly);
    if (own?.length) return heroSlidePicks([own], set.count, set.count);
  }
  const slugs = c.cats.filter((k) => k.count > 0).map((k) => k.slug);
  return heroSlidePicks(await heroCategoryCards(c.storeId, slugs, set.perCategory, set.inStockOnly), set.count, set.perCategory);
}

type Search = Record<string, string | string[] | undefined>;

export default async function Home(props: { searchParams: Promise<Search> }) {
  const [c, search] = await Promise.all([shopContext(), props.searchParams]);
  const on = homeSectionsOn(c.s['home.sections']);
  const want = (id: HomeSectionId) => on.includes(id);
  const newIn = c.s['home.newIn'];
  const rev = c.s['home.reviews'];
  const [slides, leads, cards, reviews, flash] = await Promise.all([
    want('hero') ? heroPicks(c) : Promise.resolve([]),
    want('categories') ? categoryLeads(c.storeId, c.cats.map((k) => k.slug)) : Promise.resolve({}),
    want('new-in') ? newestCards(c.storeId, newIn.count, newIn.order) : Promise.resolve([]),
    want('reviews') ? homeReviews(c.storeId, rev.count, rev.minRating) : Promise.resolve({ reviews: [], average: 0, total: 0 }),
    want('flash-sale') ? homeFlash(c, search) : Promise.resolve(null),
  ]);
  const draw: Partial<Record<HomeSectionId, () => ReactNode>> = {
    hero: () => <HomeHero c={c} media={slides.length ? <HomeHeroSlides c={c} picks={slides} /> : undefined} />,
    categories: () => <HomeCategories c={c} leads={leads} />,
    'new-in': () => <HomeNewIn c={c} cards={cards} />,
    'flash-sale': () => <HomeFlash c={c} sale={flash} />,
    reviews: () => <HomeReviews c={c} row={reviews} />,
  };
  const body = on.map((id) => <Fragment key={id}>{draw[id]?.()}</Fragment>);
  // follow-up 21: the cards' back view and Quick add (computer with a mouse), and the added-to-bag panel it opens
  const desk = (
    <>
      {(want('new-in') && cards.length) || flash ? <CardDeskMount c={c} /> : null}
      <AddedSlot c={c} added={search.added} closeHref={closeHrefOf(hrefIn(c.lang, '/'), search)} />
    </>
  );
  // H9 · the sliding rows fade at both edges unless the owner switched it off
  return c.s['home.rowFade'] ? (
    <>
      {body}
      {desk}
    </>
  ) : (
    <div className="hm-nofade" style={{ display: 'contents' }}>
      {body}
      {desk}
    </div>
  );
}
