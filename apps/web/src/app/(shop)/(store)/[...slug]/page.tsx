// Any shop address no page answers yet. CN-010 (owner): a page a later PR builds (category, product, search, bag,
// account, help …; the list is the routing table's COMING_SOON) shows "Coming soon" inside the store shell; every other
// address gets the shop's own "page not found". ~~Every unknown address: notFound().~~ The words are the dictionary's.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/shop/Icon';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { comingSoon, ROUTES } from '@/lib/shop/routes';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  const key = comingSoon(c.path, c.s['naming.productPathPrefix']);
  if (!key) return {};
  return { ...(await shopMetadata(c, `soon-${key}`, c.t('soon.title'))), robots: { index: false, follow: true } };
}

export default async function Soon() {
  const c = await shopContext();
  const key = comingSoon(c.path, c.s['naming.productPathPrefix']);
  if (!key) notFound();
  const t = c.t;
  return (
    <div className="container co-wrap">
      <div className="card center co-empty" data-testid="soon" data-soon={key}>
        <div className="bg-emptyic">
          <Icon name="clock" size={32} />
        </div>
        <h1 className="h1 mt16">{t('soon.title')}</h1>
        <p className="text2">{t('soon.text')}</p>
        <div className="row wrap mt16" style={{ justifyContent: 'center', gap: 10 }}>
          <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.home)}>
            {t('soon.home')}
          </a>
        </div>
      </div>
    </div>
  );
}
