// CN-010 (owner) — "Coming soon" inside the store shell, for a page a later PR builds (the routing table's
// COMING_SOON) and, since PR 75, for a help page with nothing true to say yet. The words are the dictionary's.
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from './Icon';

export function ComingSoon({ c, soonKey }: { c: ShopContext; soonKey: string }) {
  const t = c.t;
  return (
    <div className="container co-wrap">
      <div className="card center co-empty" data-testid="soon" data-soon={soonKey}>
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
