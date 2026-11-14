// PR 718 — a policy page the owner wrote in Website › Policies (cancellation and refund, wallet and coupons, reviews,
// cookies): the title, the line under it and the owner's text as paragraphs, headings and lists, in the shop's help
// layout. Only the owner's words; nothing is added. Server-drawn, no script.
import './help.css';
import type { ShopContext } from '@/lib/shop/context';
import { textBlocks } from '@/lib/shop/help-pages';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import type { PolicyWords } from '@/lib/website-policies/model';

export function PolicyDocPage({ c, slug, words }: { c: ShopContext; slug: string; words: PolicyWords }) {
  const pick = (p: { en: string; bn: string } | null) => (p ? (c.lang === 'bn' ? p.bn : p.en) || p.en : null);
  const title = pick(words.title);
  const lede = pick(words.lede);
  const blocks = textBlocks(pick(words.body));
  return (
    <div className="pg" data-testid="help-page" data-help={slug}>
      <nav className="crumbs pg-crumbs hide-m" aria-label={c.t('helpPage.crumbs')}>
        <a href={hrefIn(c.lang, ROUTES.home)}>{c.t('helpPage.home')}</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <h1>{title}</h1>
      {lede ? <p className="pg-lede">{lede}</p> : null}
      <div className="card pg-body">
        <section data-testid="help-own">
          {blocks.map((b, i) =>
            b.kind === 'h' ? (
              <h2 key={i}>{b.text}</h2>
            ) : b.kind === 'p' ? (
              <p key={i}>{b.text}</p>
            ) : (
              <ul key={i}>
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      </div>
    </div>
  );
}
