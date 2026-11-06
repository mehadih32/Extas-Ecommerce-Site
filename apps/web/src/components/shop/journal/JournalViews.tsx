// S12 · PR 241 (Blueprint C11.4, demo 73-blog.js bfHome / bfListing / the article page) — the shop's journal: the list
// (featured first, then the newest; topic chips; pages) and one article (topic, title, the one-line answer, the honest
// byline with the reading time and dates, the contents for a long article, the words drawn by ArticleBody and the
// product block of live product cards (fitted like the category page's, CardFits) — where the writer put `[products]`, else under the words).
// S12 · PR 249: "Read next" under the article — links to the live articles of its plan, then its topic (internal links;
// `blog.journal.relatedArticles`, none while 0).
// S12 · PR 592: house ads (`blog.houseAds`, off as shipped: none) — on the list at the top (the journal's own, or a
// topic's) and after card N; in an article after paragraph N, at its end, beside it on a wide screen, and the popup and
// slim bar (HouseAdFloat). Every place is empty unless the owner put a running ad there.
// S12 · PR 592 follow-up (demo 73-blog.js bfTag, bfAuthorPage, bfSearchPage, bfBrowse) — the list also draws a tag's
// page, a search's results and a person's articles (`heading`); the search box under the title (`blog.journal.search`);
// "More ways to browse" at the foot of the journal's first page (popular tags, the authors and reviewers, the RSS feed);
// an article's tags (`blog.journal.tags`) and its expert reviewer, the names linked to their pages while
// `blog.journal.authorPages` is on.
// PR 592 follow-up: while `blog.houseAds.countViews` is on, HouseAdViews counts how often each place on the page is seen.
import type { ImageSource } from '@extas/media/delivery';
import { Fragment, type ReactNode } from 'react';
import { ArticleBody } from '@/components/journal/ArticleBody';
import { ResponsiveImage } from '@/components/media/ResponsiveImage';
import { CardFits } from '@/components/shop/CardFits';
import { ProductCard } from '@/components/shop/ProductCard';
import { dateText } from '@/lib/shop/account-view';
import type { ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { blocks, contents } from '@/lib/journal/blocks';
import type { ShopAd } from '@/lib/journal/house-ads';
import type { LivePost } from '@/lib/journal/journal';
import { byline } from '@/lib/journal/model';
import type { Topic } from '@/lib/journal/shop';
import '@/components/journal/article.css';
import { HouseAd, HouseAdsAt } from './HouseAd';
import { HouseAdFloat } from './HouseAdFloat';
import { HouseAdViews } from './HouseAdViews';

/** PR 592 follow-up: where a page reports the house ad places it saw. */
export const AD_VIEWS_URL = '/api/shop/house-ad/seen';
import './journal.css';

const topicName = (c: ShopContext, x: { nameEn: string; nameBn: string | null }) => (c.lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn);

function Crumbs({ c, items }: { c: ShopContext; items: { label: string; href?: string }[] }) {
  return (
    <nav className="jn-crumbs small text2" aria-label="breadcrumb">
      {items.map((x, i) => (
        <span key={i}>
          {i ? <span aria-hidden="true">/</span> : null}
          {x.href ? <a href={hrefIn(c.lang, x.href)}>{x.label}</a> : <span aria-current="page">{x.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Which of the journal's browsing parts are on (each off as shipped). */
export interface JournalLinks {
  tags: boolean;
  people: boolean;
  search: boolean;
  rss: boolean;
}
const NO_LINKS: JournalLinks = { tags: false, people: false, search: false, rss: false };

/** A person's name, linked to their page while author pages are on. */
function PersonName({ c, links, person }: { c: ShopContext; links: JournalLinks; person: { slug: string; displayName: string } }) {
  return links.people ? (
    <a className="jn-who" href={hrefIn(c.lang, ROUTES.journalAuthor(person.slug))}>
      {person.displayName}
    </a>
  ) : (
    <>{person.displayName}</>
  );
}

function Meta({ c, p, aiNote, links = NO_LINKS }: { c: ShopContext; p: LivePost; aiNote?: { en: string; bn: string }; links?: JournalLinks }) {
  const t = c.t;
  const b = byline(p.author, c.lang, aiNote ?? { en: '', bn: '' }, t('journal.aiNote', { shop: c.storeName }));
  const [before, after] = t('journal.by', { name: '\u0001' }).split('\u0001');
  return (
    <div className="jn-meta small text2">
      {b.name && p.author ? (
        <span data-testid="jn-by">
          {before}
          <PersonName c={c} links={links} person={p.author} />
          {after}
        </span>
      ) : null}
      {b.ai ? <span className="jn-pill">{t('journal.aiPill')}</span> : null}
      <span>{t('journal.readMin', { n: c.num(p.readingMinutes) })}</span>
      {p.publishedAt ? <span>{t('journal.published', { date: dateText(c, p.publishedAt) })}</span> : null}
      {p.contentUpdatedAt ? <span>{t('journal.updated', { date: dateText(c, p.contentUpdatedAt) })}</span> : null}
      {aiNote && p.reviewer ? (
        <span data-testid="jn-reviewer">
          {t('journal.reviewedBy', { name: '\u0001' }).split('\u0001')[0]}
          <PersonName c={c} links={links} person={p.reviewer} />
          {t('journal.reviewedBy', { name: '\u0001' }).split('\u0001')[1]}
        </span>
      ) : null}
      {aiNote && b.note ? (
        <p className="jn-honest" data-testid="jn-honest">
          {b.note}
          {b.reviewer ? ` ${b.reviewer}` : ''}
        </p>
      ) : null}
    </div>
  );
}

/** PR 592 follow-up: the journal's own search box (a plain form: it works without JavaScript). */
export function JournalSearchBox({ c, q }: { c: ShopContext; q: string }) {
  const t = c.t;
  return (
    <form className="jn-search" role="search" action={hrefIn(c.lang, ROUTES.journalSearch)} method="get" data-testid="jn-search">
      <label className="sr" htmlFor="jn-q">
        {t('journal.search.label')}
      </label>
      <input id="jn-q" name="q" type="search" className="input" defaultValue={q} placeholder={t('journal.search.ph')} maxLength={80} autoComplete="off" enterKeyHint="search" />
      <button type="submit" className="btn btn-primary">
        {t('journal.search.go')}
      </button>
    </form>
  );
}

/** PR 592 follow-up: "More ways to browse" — popular tags, the authors and reviewers, the RSS feed (only the parts that are on). */
export function JournalBrowse({ c, links, tags, people }: { c: ShopContext; links: JournalLinks; tags: readonly { slug: string; name: string }[]; people: readonly { slug: string; displayName: string; isAiAuthor: boolean }[] }) {
  const t = c.t;
  const showTags = links.tags && tags.length > 0;
  const showPeople = links.people && people.length > 0;
  if (!showTags && !showPeople && !links.rss) return null;
  return (
    <section className="jn-browse" aria-labelledby="jn-browse-h" data-testid="jn-browse">
      <h2 className="h3" id="jn-browse-h">
        {t('journal.browse')}
      </h2>
      <div className="jn-browse-g">
        {showTags ? (
          <div>
            <h3 className="small jn-browse-t">{t('journal.popularTags')}</h3>
            <JournalTags c={c} tags={tags} />
          </div>
        ) : null}
        {showPeople ? (
          <div>
            <h3 className="small jn-browse-t">{t('journal.people')}</h3>
            <ul className="jn-rows">
              {people.map((x) => (
                <li key={x.slug}>
                  <a href={hrefIn(c.lang, ROUTES.journalAuthor(x.slug))}>
                    <span>{x.displayName}</span>
                    {x.isAiAuthor ? <span className="jn-pill">{t('journal.aiPill')}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {links.rss ? (
          <div>
            <h3 className="small jn-browse-t">{t('journal.rss')}</h3>
            <ul className="jn-rows">
              <li>
                <a href={hrefIn(c.lang, ROUTES.journalRss)} type="application/rss+xml" data-testid="jn-rss">
                  <span>{t('journal.rssLink')}</span>
                </a>
              </li>
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** PR 592 follow-up: a row of tags, each linked to its page. */
function JournalTags({ c, tags }: { c: ShopContext; tags: readonly { slug: string; name: string }[] }) {
  return (
    <ul className="jn-tags" aria-label={c.t('journal.tags')}>
      {tags.map((x) => (
        <li key={x.slug}>
          <a className="jn-tag" href={hrefIn(c.lang, ROUTES.journalTag(x.slug))}>
            #{x.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** PR 592 follow-up: the page the list draws when it is not the journal's own or a topic's. */
export interface ListHeading {
  title: string;
  intro: string | null;
  /** The page's address without /bn (the pager keeps it, with `query`). */
  base: string;
  query?: Record<string, string>;
  testId: string;
  /** Under the count line: the person's own header, the search's result line … */
  lead?: ReactNode;
  /** The topic chips show (the journal's tag and search pages); a person's page has none. */
  chips?: boolean;
  /** Said when nothing is found (else the journal's own empty card). */
  empty?: ReactNode;
}

export function JournalList(p: {
  c: ShopContext;
  posts: LivePost[];
  total: number;
  page: number;
  pages: number;
  topics: Topic[];
  topic: Topic | null;
  ads?: readonly ShopAd[];
  /** PR 592 follow-up: count the ads' views (`blog.houseAds.countViews`). */
  countViews?: boolean;
  heading?: ListHeading;
  links?: JournalLinks;
  q?: string;
  foot?: ReactNode;
}) {
  const ads = p.ads ?? [];
  const { c } = p;
  const t = c.t;
  const links = p.links ?? NO_LINKS;
  const h = p.heading;
  const mains = h && !h.chips ? [] : p.topics.filter((x) => !x.parentId);
  const base = h ? h.base : p.topic ? ROUTES.journalTopic(p.topic.slug) : ROUTES.journal;
  const pageHref = (n: number) => {
    const q = new URLSearchParams({ ...(h?.query ?? {}), ...(n > 1 ? { page: String(n) } : {}) }).toString();
    return hrefIn(c.lang, q ? `${base}?${q}` : base);
  };
  const title = h ? h.title : p.topic ? topicName(c, p.topic) : t('journal.title');
  const intro = h ? h.intro : p.topic ? (c.lang === 'bn' && p.topic.introBn ? p.topic.introBn : p.topic.introEn) : t('journal.dek');
  return (
    <div className="container jn-page" data-testid={h ? h.testId : 'journal-list'}>
      <Crumbs c={c} items={[{ label: t('journal.home'), href: ROUTES.home }, ...(p.topic || h ? [{ label: t('journal.title'), href: ROUTES.journal }] : []), { label: title }]} />
      <h1 className="h1">{title}</h1>
      {intro ? <p className="text2 jn-dek">{intro}</p> : null}
      {links.search ? <JournalSearchBox c={c} q={p.q ?? ''} /> : null}
      {h?.lead}
      {mains.length ? (
        <nav className="jn-chips" aria-label={t('journal.topics')}>
          <a className={`jn-chip${p.topic ? '' : ' on'}`} href={hrefIn(c.lang, ROUTES.journal)} aria-current={p.topic ? undefined : 'page'}>
            {t('journal.all')}
          </a>
          {mains.map((x) => {
            const on = p.topic?.id === x.id || p.topic?.parentId === x.id;
            return (
              <a key={x.id} className={`jn-chip${on ? ' on' : ''}`} href={hrefIn(c.lang, ROUTES.journalTopic(x.slug))} aria-current={p.topic?.id === x.id ? 'page' : undefined}>
                {topicName(c, x)}
              </a>
            );
          })}
        </nav>
      ) : null}
      <HouseAdsAt c={c} ads={ads} slot={p.topic ? 'topic' : 'listTop'} />
      {p.posts.length ? (
        <>
          {h?.testId === 'journal-search' ? null : <p className="small text2">{p.total === 1 ? t('journal.count1') : t('journal.count', { n: c.num(p.total) })}</p>}
          <div className="jn-grid">
            {p.posts.map((x, i) => (
              <Fragment key={x.id}>
              <article className={`jn-card${x.featured && p.page === 1 ? ' feat' : ''}`} data-testid="jn-card">
                {x.category ? <div className="jn-kicker small">{x.featured && p.page === 1 ? `${t('journal.featured')} · ` : ''}{topicName(c, x.category)}</div> : null}
                <h2 className="jn-ct">
                  <a href={hrefIn(c.lang, ROUTES.article(x.slug))}>{x.title}</a>
                </h2>
                {x.excerpt ? <p className="text2 jn-ex">{x.excerpt}</p> : null}
                <Meta c={c} p={x} links={links} />
              </article>
              <HouseAdsAt c={c} ads={ads} slot="listBetween" after={i + 1} />
              </Fragment>
            ))}
          </div>
          {p.pages > 1 ? (
            <nav className="jn-pager" aria-label={t('journal.pages')}>
              {p.page > 1 ? (
                <a className="btn btn-secondary" href={pageHref(p.page - 1)} rel="prev">
                  {t('journal.newer')}
                </a>
              ) : null}
              <span className="small text2">{t('journal.pageOf', { n: c.num(p.page), total: c.num(p.pages) })}</span>
              {p.page < p.pages ? (
                <a className="btn btn-secondary" href={pageHref(p.page + 1)} rel="next">
                  {t('journal.older')}
                </a>
              ) : null}
            </nav>
          ) : null}
        </>
      ) : h?.empty ? (
        h.empty
      ) : (
        <div className="card center jn-empty" data-testid="jn-empty">
          <h2 className="h3">{t('journal.empty')}</h2>
          <p className="text2">{c.lang === 'bn' ? t('journal.bnNone') : t('journal.emptyText')}</p>
          <div className="row wrap mt16 jn-empty-acts">
            {c.lang === 'bn' ? (
              <a className="btn btn-secondary" href={ROUTES.journal} hrefLang="en">
                {t('journal.allEn')}
              </a>
            ) : null}
            <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.home)}>
              {t('journal.shop')}
            </a>
          </div>
        </div>
      )}
      {p.foot}
      {p.countViews && ads.length ? <HouseAdViews url={AD_VIEWS_URL} /> : null}
    </div>
  );
}

/** The article's popup and slim bar (only when the owner put a running ad there). */
function Floats({ c, ads, searchWords, searchGuard }: { c: ShopContext; ads: readonly ShopAd[]; searchWords: readonly string[]; searchGuard: boolean }) {
  const pop = ads.find((a) => a.slot === 'popup');
  const bar = ads.find((a) => a.slot === 'bar');
  if (!pop && !bar) return null;
  return (
    <HouseAdFloat
      popup={pop && pop.popup ? { id: pop.placeId, rule: pop.popup.trigger, cap: pop.popup.cap, node: <HouseAd c={c} ad={pop} /> } : null}
      bar={bar ? { id: bar.placeId, node: <HouseAd c={c} ad={bar} /> } : null}
      searchWords={searchWords}
      searchGuard={searchGuard}
      words={{ close: c.t('journal.ad.close'), popup: c.t('journal.ad.popup', { shop: c.storeName }) }}
    />
  );
}

export function JournalArticle(p: {
  c: ShopContext;
  post: LivePost;
  cards: ShopCard[];
  aiNote: { en: string; bn: string };
  related?: LivePost[];
  photo?: { image: ImageSource; alt: string; studio: boolean } | null;
  ads?: { list: readonly ShopAd[]; searchWords: readonly string[]; searchGuard: boolean; countViews?: boolean };
  links?: JournalLinks;
}) {
  const { c, post } = p;
  const links = p.links ?? NO_LINKS;
  const t = c.t;
  const ads = p.ads?.list ?? [];
  const side = ads.find((a) => a.slot === 'sidebar');
  const inline = (n: number): ReactNode => <HouseAdsAt c={c} ads={ads} slot="inline" after={n} />;
  const parts = contents(blocks(post.body));
  const hasSlot = /^\s*\[products\]\s*$/im.test(post.body);
  const shop = p.cards.length ? (
    <section className="jn-shop" aria-labelledby="jn-shop-h" data-testid="jn-products">
      <h2 className="h3" id="jn-shop-h">
        {t('journal.shopTitle')}
      </h2>
      <CardFits className="grid g4 jn-shoprow">
        {p.cards.map((card) => (
          <ProductCard key={card.id} card={card} c={c} />
        ))}
      </CardFits>
    </section>
  ) : null;
  return (
    <div className="container jn-page" data-testid="journal-article">
      <Crumbs c={c} items={[{ label: t('journal.home'), href: ROUTES.home }, { label: t('journal.title'), href: ROUTES.journal }, ...(post.category ? [{ label: topicName(c, post.category), href: ROUTES.journalTopic(post.category.slug) }] : [])]} />
      <div className={side ? 'jn-withside' : undefined}>
      <article className="jn-article">
        <h1 className="h1 jn-title">{post.title}</h1>
        <Meta c={c} p={post} aiNote={p.aiNote} links={links} />
        {p.photo ? (
          // PR 547: the article's main photo (own pictures only); a studio picture always says so
          <figure className="jn-photo" data-testid="jn-photo">
            <ResponsiveImage image={p.photo.image} slot="main" sizes="(max-width: 767px) 100vw, 720px" alt={p.photo.alt} priority />
            {p.photo.studio ? <figcaption className="small jn-studio">{t('journal.studioImage')}</figcaption> : null}
          </figure>
        ) : null}
        {post.quickAnswer ? (
          <p className="jn-answer" data-testid="jn-answer">
            <b>{t('journal.answer')}:</b> {post.quickAnswer}
          </p>
        ) : null}
        {parts.length >= 2 ? (
          <nav className="jn-toc" aria-labelledby="jn-toc-h">
            <h2 className="small" id="jn-toc-h">
              {t('journal.contents')}
            </h2>
            <ol>
              {parts.map((x) => (
                <li key={x.id}>
                  <a href={`#${x.id}`}>{x.s}</a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <ArticleBody body={post.body} products={shop} boxWords={{ tip: t('journal.tip'), note: t('journal.note') }} afterParagraph={ads.length ? inline : undefined} />
        {links.tags && post.tags.length ? (
          <div className="jn-art-tags" data-testid="jn-tags">
            <JournalTags c={c} tags={post.tags} />
          </div>
        ) : null}
        <HouseAdsAt c={c} ads={ads} slot="end" />
      </article>
      {side ? (
        <div className="jn-side">
          <HouseAd c={c} ad={side} />
        </div>
      ) : null}
      </div>
      {!hasSlot ? shop : null}
      {p.related?.length ? (
        <section className="jn-related" aria-labelledby="jn-rel-h" data-testid="jn-related">
          <h2 className="h3" id="jn-rel-h">
            {t('journal.related')}
          </h2>
          <ul>
            {p.related.map((r) => (
              <li key={r.id}>
                <a href={hrefIn(c.lang, ROUTES.article(r.slug))}>
                  <span className="jn-rel-t">{r.title}</span>
                  <span className="jn-rel-m small text2">{t('journal.readMin', { n: c.num(r.readingMinutes) })}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {post.category ? (
        <p className="jn-more">
          <a className="btn btn-secondary" href={hrefIn(c.lang, ROUTES.journalTopic(post.category.slug))}>
            {t('journal.more', { topic: topicName(c, post.category) })}
          </a>
        </p>
      ) : null}
      {p.ads ? <Floats c={c} ads={ads} searchWords={p.ads.searchWords} searchGuard={p.ads.searchGuard} /> : null}
      {p.ads?.countViews && ads.length ? <HouseAdViews url={AD_VIEWS_URL} /> : null}
    </div>
  );
}
