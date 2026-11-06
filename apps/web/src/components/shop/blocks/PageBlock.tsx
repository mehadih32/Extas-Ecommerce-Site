// S02 · PR 595 — one of the owner's own sections on a shop page (Website › Page layouts; demo 96c-layout-builder.js
// LB_RENDER): a banner (his words, a button, one product's picture), an offer strip (words only: never a price), a
// product row or grid, a set row (prices as the set rule gives them), category tiles, reviews, journal articles, his own
// text (paragraphs, headings, lists, **bold**, links inside the shop or https; React escapes everything) and a spacer.
// A section with nothing true to show (no products, no reviews, no words) draws nothing. On the home page each sits in
// its own container; inside the category page's container it draws without one.
import { Fragment, type ReactNode } from 'react';
import type { BlockWords, LayoutBlock } from '@extas/settings';
import { blocks as textBlocks, type Inline } from '@/lib/journal/blocks';
import type { BlockContent } from '@/lib/shop/blocks';
import { photoFor } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { categoryName } from '@/lib/shop/shell-model';
import { CardFits } from '../CardFits';
import { Icon } from '../Icon';
import { ProductCard } from '../ProductCard';
import { ProductPicture } from '../ProductPicture';
import { SetCardItem } from '../combo/SetCards';
import { HomeReviews } from '../home/HomeReviews';
import { SecHd } from '../home/SecHd';
import './blocks.css';

/** The owner's words in the page's language, else in the other one ('' = none). */
export const wordsIn = (c: Pick<ShopContext, 'lang'>, w: BlockWords): string => (c.lang === 'bn' ? w.bn || w.en : w.en || w.bn);
/** A shop path in the page's language; a full https address as it is. */
const linkIn = (c: ShopContext, href: string) => (href.startsWith('/') ? hrefIn(c.lang, href) : href);

function Line({ s }: { s: Inline[] }) {
  return (
    <>
      {s.map((x, i) =>
        x.t === 'b' ? (
          <strong key={i}>{x.s}</strong>
        ) : x.t === 'a' ? (
          <a key={i} href={x.href} rel={x.href.startsWith('/') ? undefined : 'noopener'}>
            {x.s}
          </a>
        ) : (
          <Fragment key={i}>{x.s}</Fragment>
        ),
      )}
    </>
  );
}

/** The owner's own text: the journal's writing format (lib/journal/blocks.ts), without its product block and boxes. */
function RichText({ src }: { src: string }) {
  return (
    <div className="lb-rt">
      {textBlocks(src).map((b, i) => {
        if (b.t === 'h2' || b.t === 'h3') return <h3 key={i}>{b.s}</h3>;
        if (b.t === 'p' || b.t === 'box')
          return (
            <p key={i}>
              <Line s={b.s} />
            </p>
          );
        if (b.t === 'ul' || b.t === 'ol') {
          const L = b.t;
          return (
            <L key={i}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Line s={it} />
                </li>
              ))}
            </L>
          );
        }
        return null;
      })}
    </div>
  );
}

function Head({ c, title, sub, more, moreHref }: { c: ShopContext; title: BlockWords; sub?: BlockWords; more?: BlockWords; moreHref?: string }) {
  const t = wordsIn(c, title);
  if (!t) return null;
  const m = more ? wordsIn(c, more) : '';
  return <SecHd title={t} sub={sub ? wordsIn(c, sub) || undefined : undefined} href={m && moreHref ? linkIn(c, moreHref) : undefined} more={m || undefined} />;
}

function inner(c: ShopContext, b: LayoutBlock, got: BlockContent): ReactNode {
  switch (b.type) {
    case 'banner': {
      const d = b.data;
      const title = wordsIn(c, d.title);
      if (!title) return null;
      const p = got.kind === 'cards' ? got.cards[0] : undefined;
      const colour = p?.colours[0];
      const cta = wordsIn(c, d.cta);
      return (
        <div className={`lb-ban tone-${d.tone}${p ? ' has-img' : ''}`}>
          <div className="lb-ban-txt">
            {wordsIn(c, d.eyebrow) ? <div className="eyebrow lb-ban-e">{wordsIn(c, d.eyebrow)}</div> : null}
            <h2 className="lb-ban-t">{title}</h2>
            {wordsIn(c, d.text) ? <p className="lb-ban-s">{wordsIn(c, d.text)}</p> : null}
            {cta && d.href ? (
              <a className="btn lb-ban-cta" href={linkIn(c, d.href)}>
                {cta}
                <Icon name="right" size={16} />
              </a>
            ) : null}
          </div>
          {p ? (
            <div className="lb-ban-img">
              <ProductPicture garment={p.garment} hex={colour?.hex ?? ''} photo={photoFor(p, colour?.key)} ratio="ratio-11" alt={title} lang={c.lang} sizes="(min-width: 1024px) 360px, 40vw" />
            </div>
          ) : null}
        </div>
      );
    }
    case 'offerStrip': {
      const d = b.data;
      const text = wordsIn(c, d.text);
      if (!text) return null;
      const link = wordsIn(c, d.link);
      const body = (
        <>
          <Icon name="tag" size={16} />
          <span className="lb-strip-t">{text}</span>
          {link && d.href ? (
            <span className="lb-strip-l">
              {link}
              <Icon name="right" size={14} />
            </span>
          ) : null}
        </>
      );
      return d.href ? (
        <a className={`lb-strip tone-${d.tone}`} href={linkIn(c, d.href)}>
          {body}
        </a>
      ) : (
        <div className={`lb-strip tone-${d.tone}`}>{body}</div>
      );
    }
    case 'productRow':
    case 'productGrid': {
      if (got.kind !== 'cards' || !got.cards.length) return null;
      const d = b.data;
      const cards = got.cards.map((p) => <ProductCard key={p.id} card={p} c={c} />);
      return (
        <>
          <Head c={c} title={d.title} sub={d.sub} more={d.more} moreHref={d.moreHref} />
          {b.type === 'productRow' ? <div className="lb-row">{cards}</div> : <CardFits className="grid g4">{cards}</CardFits>}
        </>
      );
    }
    case 'comboRow': {
      if (got.kind !== 'sets' || !got.sets.length) return null;
      return (
        <>
          <Head c={c} title={b.data.title} sub={b.data.sub} />
          <div className="lb-row">
            {got.sets.map((v) => (
              <SetCardItem key={v.href} c={c} v={v} />
            ))}
          </div>
        </>
      );
    }
    case 'categoryTiles': {
      if (got.kind !== 'tiles') return null;
      const want = b.data.cats;
      const tiles = c.cats.filter((k) => k.count > 0 && got.leads[k.slug] && (!want.length || want.includes(k.slug)));
      if (!tiles.length) return null;
      return (
        <>
          <Head c={c} title={b.data.title} />
          <div className="grid g6">
            {tiles.map((k) => {
              const p = got.leads[k.slug]!;
              const colour = p.colours[0];
              const name = categoryName(k, c.lang);
              return (
                <a key={k.slug} className="hm-cat" href={hrefIn(c.lang, ROUTES.category(k.slug))}>
                  <ProductPicture garment={p.garment ?? k.garment} hex={colour?.hex ?? ''} photo={photoFor(p, colour?.key)} ratio="ratio-34" alt={name} lang={c.lang} sizes="(max-width: 767px) 33vw, 200px" />
                  <div className="hm-cat-name">{name}</div>
                </a>
              );
            })}
          </div>
        </>
      );
    }
    case 'reviews':
      return got.kind === 'reviews' && got.row.reviews.length ? <HomeReviews c={c} row={got.row} title={wordsIn(c, b.data.title) || c.t('home.reviews.title')} trackId={`lb-rev-${b.id}`} /> : null;
    case 'journal': {
      if (got.kind !== 'posts' || !got.posts.length) return null;
      return (
        <>
          <Head c={c} title={b.data.title} more={{ en: c.t('home.viewAll'), bn: c.t('home.viewAll') }} moreHref={ROUTES.journal} />
          <div className="lb-row lb-row-j">
            {got.posts.map((x) => (
              <article key={x.id} className="card lb-jcard">
                <h3 className="lb-jcard-t">
                  <a href={hrefIn(c.lang, ROUTES.article(x.slug))}>{x.title}</a>
                </h3>
                {x.excerpt ? <p className="small muted">{x.excerpt}</p> : null}
              </article>
            ))}
          </div>
        </>
      );
    }
    case 'richText': {
      const body = wordsIn(c, b.data.body);
      const title = wordsIn(c, b.data.title);
      if (!body && !title) return null;
      return (
        <>
          {title ? <h2 className="h2">{title}</h2> : null}
          {body ? <RichText src={body} /> : null}
        </>
      );
    }
    case 'spacer':
      return <div className="lb-spacer" style={{ ['--lb-sp-m' as string]: `${b.data.phone}px`, ['--lb-sp-d' as string]: `${b.data.desktop}px` }} aria-hidden="true" />;
    default:
      return null;
  }
}

/** One owner's section; `bare` = already inside a container (the category page). */
export function PageBlock({ c, block, got, bare = false }: { c: ShopContext; block: LayoutBlock; got: BlockContent; bare?: boolean }) {
  const body = inner(c, block, got);
  if (body === null) return null;
  // the reviews section draws its own section and container (HomeReviews)
  if (block.type === 'reviews') return <div data-lb={block.id}>{body}</div>;
  const tight = block.type === 'offerStrip' || block.type === 'spacer';
  return (
    <section className={`${tight ? 'lb-sec lb-tight' : 'section lb-sec'} lb-t-${block.type}`} data-lb={block.id} data-testid="lb-sec">
      {bare ? body : <div className="container">{body}</div>}
    </section>
  );
}
