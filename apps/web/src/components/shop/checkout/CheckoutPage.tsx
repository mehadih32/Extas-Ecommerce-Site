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
import { BagActions } from '../bag/BagActions';
import { bagWords } from '../bag/BagPage';
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
  const bagHref = hrefIn(c.lang, ROUTES.bag);
  // PR 121: the lines' quantity and Remove go through the bag's own script (its API, Undo and redraw); it stays mounted
  // when the last item goes, so its Undo still works on the empty-bag card.
  const actions = <BagActions words={bagWords(c)} undoMs={s['bag.undoMs']} bagHref={bagHref} stamp={`${view.summary.count}:${view.summary.totalMinor}`} />;
  if (!view.items.length && !view.sets.length)
    return (
      <div className="co-page" data-bag-root="" data-testid="co-page">
        <EmptyCheckout c={c} />
        {actions}
      </div>
    );
  const ids = view.items.map((i) => i.productId).concat(view.sets.flatMap((x) => x.pieces.map((p) => p.productId).filter((id): id is string => !!id)));
  const cards = await cardsByIds(c.storeId, ids);
  const wa = s['checkout.help.enabled'] ? waHref(c.s['contact.whatsapp'], c.t('checkout.help.message', c.vars)) : null;
  return (
    <div className="co-page" data-bag-root="" data-testid="co-page">
      <CheckoutForm
        view={viewOf(quote)}
        words={checkoutWords(c)}
        money={{ currency: c.s['store.currency'], lang: c.lang, bnDigits: c.bnDigits }}
        lines={<CheckoutLines c={c} view={view} cards={cards} manyMin={s['checkout.manyOfOne.enabled'] ? s['checkout.manyOfOne.min'] : null} />}
        wa={wa}
        fields={fieldOrder(s['checkout.fieldOrder'])}
        limits={{ nameMin: s['checkout.form.nameMin'], addressMin: s['checkout.form.addressMin'] }}
        settle={{ settleMs: s['delivery.resolver.settleMs'], minWords: s['delivery.resolver.minWords'] }}
        addressMax={s['delivery.resolver.maxChars']}
      />
      {actions}
    </div>
  );
}
