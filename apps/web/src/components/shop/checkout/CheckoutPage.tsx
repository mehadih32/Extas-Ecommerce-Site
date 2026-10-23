// PR 115 — the checkout page (demo 51-checkout.js, V12.2): with an empty bag the empty-bag card; otherwise the client
// form (CheckoutForm) around the server-drawn summary lines. The bag's stylesheet comes too: the checkout uses its
// shared rules (stack, split-side, qty, the sticky bar).
import '../bag/bag.css';
import './checkout.css';
import { fieldOrder, viewOf, type CheckoutQuote } from '@extas/checkout';
import { cardsByIds } from '@/lib/shop/catalogue';
import { checkoutWords, type CheckoutSettings } from '@/lib/shop/checkout';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';
import { CheckoutForm } from './CheckoutForm';
import { CheckoutLines } from './CheckoutLines';

export function EmptyCheckout({ c }: { c: ShopContext }) {
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

export async function CheckoutPage({ c, quote, s }: { c: ShopContext; quote: CheckoutQuote; s: CheckoutSettings }) {
  const view = quote.bag;
  if (!view.items.length && !view.sets.length) return <EmptyCheckout c={c} />;
  const ids = view.items.map((i) => i.productId).concat(view.sets.flatMap((x) => x.pieces.map((p) => p.productId).filter((id): id is string => !!id)));
  const cards = await cardsByIds(c.storeId, ids);
  const wa = s['checkout.help.enabled'] ? waHref(c.s['contact.whatsapp'], c.t('checkout.help.message', c.vars)) : null;
  return (
    <div className="co-page" data-testid="co-page">
      <CheckoutForm
        view={viewOf(quote)}
        words={checkoutWords(c)}
        money={{ currency: c.s['store.currency'], lang: c.lang, bnDigits: c.bnDigits }}
        lines={<CheckoutLines c={c} view={view} cards={cards} />}
        wa={wa}
        fields={fieldOrder(s['checkout.fieldOrder'])}
        limits={{ nameMin: s['checkout.form.nameMin'], addressMin: s['checkout.form.addressMin'] }}
      />
    </div>
  );
}
