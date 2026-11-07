// PR 41 — the home page (demo 20-home.js HOME_SECTIONS): the sections the owner switched on, in his order
// (`home.sections`; the page layout builder, PR 595, edits the same list). Each section draws itself only when it has
// something true to show, so a new shop never shows an empty block or a made-up number:
// - hero (`home.hero`): words, buttons and promise lines; ~~its sliding pictures are PR 43~~ its sliding pictures
//   (`home.heroSlides`, PR 43): the categories in turns, or a live campaign collection;
// - categories (`home.categories`) and new in (`home.newIn`): from the catalogue;
// - reviews (`home.reviews`): approved reviews only;
// - ~~festive (Smart Rules' festive window),~~ (PR 281, below) sets and shop the look (combos, S03), size finder (Find My Size, PR 58),
//   ~~flash sale (PR 44)~~ and the journal (S12) join when the PRs that make their content land; until then they draw
//   nothing. The progress page stays at /status.
// - flash sale (PR 44, `home.flashSale`): the owner's sale while it runs, two rows sliding past each other and a clock
//   that ticks; no sale, nothing drawn (lib/shop/flash). A test server's `?try=flash` draws the trial sale.
// ~~Until the home page is built, it shows the store shell with one sliding row: the live categories.~~
// S11 · PR 221: its search title and description (`seo.titles.home`); PR 222: the shop's Organization and WebSite JSON-LD.
// S13 · PR 281: festive (HomeFestive) — the live festive Smart Rule's cut-off words, only while Marketing › Festive
// cut-off is on with the home page ticked (off as shipped: nothing drawn, the phone gate's page unchanged).
// S13 · PR 280: while a seasonal window is live (Marketing › Seasonal home, off as shipped), its look's home settings
// (sections, hero, the hero's pictures, the rows) stand in for the owner's own; after the window, his own again.
// Follow-up 649: only its sections, hero lines and hero collection; the hero buttons, promise lines and rows stay his own.
// Follow-up 648: `?seasonal-look=<look>` previews a saved look before its window, only for signed-in staff who may see
// Seasonal home (lib/shop/seasonal-home seasonalPreview), with a note on top; a customer gets the usual home page.
// S02 · PR 76: the owner arranges the sections on Website › Page layouts; a section may keep to phones or to computers
// (LayoutPart: a wrapper the style sheet hides; none when it shows on both, so the page is the same as before).
// S02 · PR 595: the owner's own sections (`layout.blocks`: banner, offer strip, product row or grid, sets, tiles, reviews,
// journal, his text, spacer) sit among them on their days and screens (PageBlock); none as shipped = today's page.
import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import type { HomeSectionId } from '@extas/settings';
import { HomeCategories } from '@/components/shop/home/HomeCategories';
import { HomeFestive } from '@/components/shop/home/HomeFestive';
import { HomeFlash } from '@/components/shop/home/HomeFlash';
import { HomeHero } from '@/components/shop/home/HomeHero';
import { HomeHeroSlides } from '@/components/shop/home/HomeHeroSlides';
import { HomeNewIn } from '@/components/shop/home/HomeNewIn';
import { HomeReviews } from '@/components/shop/home/HomeReviews';
import { AddedSlot, closeHrefOf } from '@/components/shop/bag/AddedSlot';
import { LayoutPart } from '@/components/shop/LayoutPart';
import { CardDeskMount } from '@/components/shop/CardDeskMount';
import { EtaBanner } from '@/components/shop/EtaBanner';
import { categoryLeads, heroCategoryCards, heroCollectionCards, newestCards } from '@/lib/shop/catalogue';
import { shopContext, type ShopContext } from '@/lib/shop/context';
import { homeFlash } from '@/lib/shop/flash';
import { heroSlidePicks, type HeroPick } from '@/lib/shop/home-model';
import { shownSections } from '@/lib/shop/layouts';
import { buildEntryFor, HomeBuildRow } from '@/components/shop/build/BuildEntry';
import { blockContent, blocksOf, pageItems } from '@/lib/shop/blocks';
import { PageBlock } from '@/components/shop/blocks/PageBlock';
import { SideCanvas } from '@/components/shop/side/SideCanvas';
import { sideItems } from '@/lib/shop/side-canvas';
import { JsonLd } from '@/components/shop/JsonLd';
import { shopLd } from '@/lib/seo/shop-ld';
import { shopMetadata, shopOrigin } from '@/lib/shop/meta';
import { hrefIn } from '@/lib/shop/lang';
import { homeReviews } from '@/lib/shop/reviews';
import { seasonalHome, seasonalPreview } from '@/lib/shop/seasonal-home';
import { PREVIEW_PARAM } from '@/lib/shop/seasonal-home-model';
import { Icon } from '@/components/shop/Icon';

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
  const [own, search] = await Promise.all([shopContext(), props.searchParams]);
  // ~~const c = await seasonalHome(own);~~ follow-up 648: a staff member's preview of a saved look comes first
  const preview = search[PREVIEW_PARAM] ? await seasonalPreview(own, search[PREVIEW_PARAM]) : null;
  const c = preview ? preview.c : await seasonalHome(own);
  // ~~homeSectionsOn(c.s['home.sections'])~~ PR 76: the shown sections with their screens
  const shown = shownSections<HomeSectionId>('home', c.s['home.sections']);
  const on = shown.map((x) => x.id);
  const want = (id: HomeSectionId) => on.includes(id);
  const newIn = c.s['home.newIn'];
  const rev = c.s['home.reviews'];
  // PR 222: the shop itself and its website name for search engines (only what the owner filled in), read alongside
  const ldBlocks = shopOrigin(c.storeId)
    .then((origin) => (origin ? shopLd(c, origin) : []))
    .catch(() => []);
  // PR 595: the owner's own sections live today (`layout.blocks`), placed among the page's own, and what they show
  const items = pageItems('home', c.s['home.sections'], blocksOf(c.s['layout.blocks'], 'home'), c.today);
  const [slides, leads, cards, reviews, flash, got, side, build] = await Promise.all([
    want('hero') ? heroPicks(c) : Promise.resolve([]),
    want('categories') ? categoryLeads(c.storeId, c.cats.map((k) => k.slug)) : Promise.resolve({}),
    want('new-in') ? newestCards(c.storeId, newIn.count, newIn.order) : Promise.resolve([]),
    want('reviews') ? homeReviews(c.storeId, rev.count, rev.minRating) : Promise.resolve({ reviews: [], average: 0, total: 0 }),
    want('flash-sale') ? homeFlash(c, search) : Promise.resolve(null),
    blockContent(c, items),
    // PR 596: the side canvas's zones for the home page (none while it is off, as shipped)
    sideItems(c, 'home', null),
    // follow-up 242: the set builder's row (`combos.builder.places` home, off as shipped)
    buildEntryFor(c, 'home'),
  ]);
  const ld = <JsonLd data={await ldBlocks} />;
  const draw: Partial<Record<HomeSectionId, () => ReactNode>> = {
    hero: () => <HomeHero c={c} media={slides.length ? <HomeHeroSlides c={c} picks={slides} /> : undefined} />,
    festive: () => <HomeFestive c={c} />,
    categories: () => <HomeCategories c={c} leads={leads} />,
    'new-in': () => <HomeNewIn c={c} cards={cards} />,
    'flash-sale': () => <HomeFlash c={c} sale={flash} />,
    reviews: () => <HomeReviews c={c} row={reviews} />,
  };
  // ~~shown.map(({ id, dev }) => <LayoutPart …>)~~ PR 595: the page's own sections with the owner's sections in between
  const sections = items.map((it) =>
    it.kind === 'sec' ? (
      <LayoutPart key={it.row.id} id={it.row.id} dev={it.row.dev ?? 'both'} page="home">
        {draw[it.row.id as HomeSectionId]?.()}
      </LayoutPart>
    ) : (
      <LayoutPart key={`lb-${it.block.id}`} id={`lb-${it.block.id}`} dev={it.block.dev} page="home">
        <PageBlock c={c} block={it.block} got={got.get(it.block.id) ?? { kind: 'none' }} />
      </LayoutPart>
    ),
  );
  // PR 193: the Eid order-by dates / pre-order line and the holiday notice, under the hero (nothing while both are off)
  const eta = <EtaBanner c={c} testId="home-eta" wrap="container sh-etawrap" />;
  const at = items.findIndex((it) => it.kind === 'sec' && it.row.id === 'hero') + 1;
  const body = [...sections.slice(0, at), <Fragment key="eta">{eta}</Fragment>, ...sections.slice(at)];
  // follow-up 242: the builder's row under New in (else under the categories, else at the end)
  if (build) {
    const after = (id: string) => body.findIndex((n) => (n as { key?: string | null }).key === id);
    const k = [after('new-in'), after('categories')].find((x) => x >= 0);
    body.splice(k === undefined ? body.length : k + 1, 0, <HomeBuildRow key="build" c={c} entry={build} />);
  }
  if (preview)
    body.unshift(
      <div key="seasonal-preview" className="container">
        <div className="tint hm-festive" role="note" data-testid="home-seasonal-preview">
          <Icon name="clock" size={22} />
          <p className="small grow">{c.t('home.seasonalPreview', { look: preview.name })}</p>
        </div>
      </div>,
    );
  // follow-up 21: the cards' back view and Quick add (computer with a mouse), and the added-to-bag panel it opens
  const desk = (
    <>
      {(want('new-in') && cards.length) || flash ? <CardDeskMount c={c} /> : null}
      <AddedSlot c={c} added={search.added} closeHref={closeHrefOf(hrefIn(c.lang, '/'), search)} />
      <SideCanvas c={c} items={side} set={c.s['layout.sideCanvas']} />
    </>
  );
  // H9 · the sliding rows fade at both edges unless the owner switched it off
  return c.s['home.rowFade'] ? (
    <>
      {ld}
      {body}
      {desk}
    </>
  ) : (
    <div className="hm-nofade" style={{ display: 'contents' }}>
      {ld}
      {body}
      {desk}
    </div>
  );
}
