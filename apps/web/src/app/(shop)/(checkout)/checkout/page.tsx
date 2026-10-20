// The checkout address (demo 51-checkout.js). The bag (PR 50) and the checkout form (PR 51) come later; until then the
// bag is always empty, so this shows the demo's empty-bag card (co_empty) inside the slim checkout shell.
import type { Metadata } from 'next';
import { Icon } from '@/components/shop/Icon';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  // A checkout is never a search result, in either language.
  return { ...(await shopMetadata(c, 'checkout', c.t('checkout.title'))), robots: { index: false, follow: false } };
}

export default async function Checkout() {
  const c = await shopContext();
  const t = c.t;
  return (
    <div className="container co-wrap">
      <div className="card center co-empty" data-testid="co-empty">
        <div className="bg-emptyic">
          <Icon name="bag" size={32} />
        </div>
        <h1 className="h1 mt16">{t('checkout.emptyTitle')}</h1>
        <p className="text2">{t('checkout.emptyText')}</p>
        <div className="row wrap mt16" style={{ justifyContent: 'center', gap: 10 }}>
          <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.newIn)}>
            {t('checkout.startShopping')}
          </a>
          <a className="btn btn-ghost" href={hrefIn(c.lang, ROUTES.bag)}>
            {t('checkout.goToBag')}
          </a>
        </div>
      </div>
    </div>
  );
}
