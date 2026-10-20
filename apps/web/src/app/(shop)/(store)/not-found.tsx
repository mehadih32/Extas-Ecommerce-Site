// The shop's "page not found" (demo PAGES.notfound): a short line and the way home. On a desktop it also helps the
// shopper recover (D-019): a search box, the live categories and the WhatsApp line. Bestsellers join with the product
// cards (PR 43). Names and counts come from the catalogue, nothing typed here.
import type { Metadata } from 'next';
import { Icon, WaGlyph } from '@/components/shop/Icon';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { categoryName } from '@/lib/shop/shell-model';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { title: c.t('meta.page', { page: c.t('notFound.title'), store: c.storeName }), robots: { index: false, follow: true } };
}

export default async function NotFound() {
  const c = await shopContext();
  const t = c.t;
  const wa = waHref(c.s['contact.whatsapp'], t('notFound.waMessage', c.vars));
  const cats = c.cats.filter((k) => k.count > 0);
  return (
    <div className="container empty">
      <h1 className="h1">{t('notFound.title')}</h1>
      <p className="muted mt12">{t('notFound.text')}</p>
      <a className="btn btn-primary mt16" href={hrefIn(c.lang, ROUTES.home)}>
        {t('notFound.home')}
      </a>
      <div className="nf-d hide-m">
        <form className="nf-search" role="search" action={hrefIn(c.lang, ROUTES.search)} method="get">
          <label className="sr" htmlFor="nf-q">
            {t('notFound.searchLabel')}
          </label>
          <input id="nf-q" name="q" className="input" placeholder={t('notFound.searchPlaceholder')} autoComplete="off" />
          <button className="btn btn-primary">
            <Icon name="search" size={17} />
            <span>{t('notFound.search')}</span>
          </button>
        </form>
        {cats.length || c.s['shell.desktopNav'].combos ? (
          <div className="nf-cats">
            {cats.map((k) => (
              <a key={k.slug} className="chip" href={hrefIn(c.lang, ROUTES.category(k.slug))}>
                {categoryName(k, c.lang)}
              </a>
            ))}
            {c.s['shell.desktopNav'].combos ? (
              <a className="chip" href={hrefIn(c.lang, ROUTES.combos)}>
                {t('nav.combos')}
              </a>
            ) : null}
          </div>
        ) : null}
        {wa ? (
          <p className="small text2 nf-wa">
            {t('notFound.waLine')}{' '}
            <a className="wa-btn" href={wa} target="_blank" rel="noopener">
              <WaGlyph size={18} />
              {t('notFound.waButton')}
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
