// S12 · PR 241 (Blueprint C11.4, demo 73-blog.js bfHome / bfListing / the article page) — the shop's journal: the list
// (featured first, then the newest; topic chips; pages) and one article (topic, title, the one-line answer, the honest
// byline with the reading time and dates, the contents for a long article, the words drawn by ArticleBody and the
// product block of live product cards (fitted like the category page's, CardFits) — where the writer put `[products]`, else under the words).
// S12 · PR 249: "Read next" under the article — links to the live articles of its plan, then its topic (internal links;
// `blog.journal.relatedArticles`, none while 0).
import { ArticleBody } from '@/components/journal/ArticleBody';
import { CardFits } from '@/components/shop/CardFits';
import { ProductCard } from '@/components/shop/ProductCard';
import { dateText } from '@/lib/shop/account-view';
import type { ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { blocks, contents } from '@/lib/journal/blocks';
import type { LivePost } from '@/lib/journal/journal';
import { byline } from '@/lib/journal/model';
import type { Topic } from '@/lib/journal/shop';
import '@/components/journal/article.css';
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

function Meta({ c, p, aiNote }: { c: ShopContext; p: LivePost; aiNote?: { en: string; bn: string } }) {
  const t = c.t;
  const b = byline(p.author, c.lang, aiNote ?? { en: '', bn: '' }, t('journal.aiNote', { shop: c.storeName }));
  return (
    <div className="jn-meta small text2">
      {b.name ? <span data-testid="jn-by">{t('journal.by', { name: b.name })}</span> : null}
      {b.ai ? <span className="jn-pill">{t('journal.aiPill')}</span> : null}
      <span>{t('journal.readMin', { n: c.num(p.readingMinutes) })}</span>
      {p.publishedAt ? <span>{t('journal.published', { date: dateText(c, p.publishedAt) })}</span> : null}
      {p.contentUpdatedAt ? <span>{t('journal.updated', { date: dateText(c, p.contentUpdatedAt) })}</span> : null}
      {aiNote && b.note ? (
        <p className="jn-honest" data-testid="jn-honest">
          {b.note}
          {b.reviewer ? ` ${b.reviewer}` : ''}
        </p>
      ) : null}
    </div>
  );
}

export function JournalList(p: { c: ShopContext; posts: LivePost[]; total: number; page: number; pages: number; topics: Topic[]; topic: Topic | null }) {
  const { c } = p;
  const t = c.t;
  const mains = p.topics.filter((x) => !x.parentId);
  const base = p.topic ? ROUTES.journalTopic(p.topic.slug) : ROUTES.journal;
  const pageHref = (n: number) => hrefIn(c.lang, n > 1 ? `${base}?page=${n}` : base);
  const title = p.topic ? topicName(c, p.topic) : t('journal.title');
  const intro = p.topic ? (c.lang === 'bn' && p.topic.introBn ? p.topic.introBn : p.topic.introEn) : t('journal.dek');
  return (
    <div className="container jn-page" data-testid="journal-list">
      <Crumbs c={c} items={[{ label: t('journal.home'), href: ROUTES.home }, ...(p.topic ? [{ label: t('journal.title'), href: ROUTES.journal }] : []), { label: title }]} />
      <h1 className="h1">{title}</h1>
      {intro ? <p className="text2 jn-dek">{intro}</p> : null}
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
      {p.posts.length ? (
        <>
          <p className="small text2">{p.total === 1 ? t('journal.count1') : t('journal.count', { n: c.num(p.total) })}</p>
          <div className="jn-grid">
            {p.posts.map((x) => (
              <article key={x.id} className={`jn-card${x.featured && p.page === 1 ? ' feat' : ''}`} data-testid="jn-card">
                {x.category ? <div className="jn-kicker small">{x.featured && p.page === 1 ? `${t('journal.featured')} · ` : ''}{topicName(c, x.category)}</div> : null}
                <h2 className="jn-ct">
                  <a href={hrefIn(c.lang, ROUTES.article(x.slug))}>{x.title}</a>
                </h2>
                {x.excerpt ? <p className="text2 jn-ex">{x.excerpt}</p> : null}
                <Meta c={c} p={x} />
              </article>
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
    </div>
  );
}

export function JournalArticle(p: { c: ShopContext; post: LivePost; cards: ShopCard[]; aiNote: { en: string; bn: string }; related?: LivePost[] }) {
  const { c, post } = p;
  const t = c.t;
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
      <article className="jn-article">
        <h1 className="h1 jn-title">{post.title}</h1>
        <Meta c={c} p={post} aiNote={p.aiNote} />
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
        <ArticleBody body={post.body} products={shop} boxWords={{ tip: t('journal.tip'), note: t('journal.note') }} />
      </article>
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
    </div>
  );
}
