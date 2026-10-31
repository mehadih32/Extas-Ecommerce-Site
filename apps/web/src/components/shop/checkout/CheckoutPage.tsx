// PR 115 — the checkout page (demo 51-checkout.js, V12.2): with an empty bag the empty-bag card; otherwise the client
// form (CheckoutForm) around the server-drawn summary lines. The bag's stylesheet comes too: the checkout uses its
// shared rules (stack, split-side, qty, the sticky bar).
// PR 137: a signed-in customer's own details start the boxes (`prefill`); this browser's memory when the owner allows it.
// PR 605: `gift` — the checkout opened as a gift with gift mode on: the gift card's limits and dates (store's time zone).
// PR 610 (qa-gate I3): `paused` — checkout is paused now (the ERP holds the account): the form says so from the start.
import '../bag/bag.css';
import './checkout.css';
import type { CheckoutPrefill } from '@extas/accounts';
import { fieldOrder, giftDateWindow, storeToday, viewOf, type CheckoutQuote } from '@extas/checkout';
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

export async function CheckoutPage({ c, quote, s, prefill = null, gift = false, paused = false }: { c: ShopContext; quote: CheckoutQuote; s: CheckoutSettings; prefill?: CheckoutPrefill | null; gift?: boolean; paused?: boolean }) {
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
  const g = s['checkout.gift'];
  const today = storeToday(new Date(), c.s['store.timeZone']);
  const giftCfg = gift
    ? { noteMax: g.noteMaxChars, maxDays: g.deliverAfterMaxDays, window: giftDateWindow(today, g.deliverAfterMaxDays), hidePricesDefault: g.hidePricesDefault, today, plainHref: hrefIn(c.lang, ROUTES.checkout) }
    : null;
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
        consent={s['checkout.consent.enabled'] ? { sms: s['checkout.consent.sms.default'], whatsapp: s['checkout.consent.whatsapp.default'] } : null}
        links={{ exchange: hrefIn(c.lang, ROUTES.help('exchange')), terms: hrefIn(c.lang, ROUTES.help('terms')) }}
        confirmStyle={s['checkout.confirm.style']}
        note={s['checkout.note.enabled'] ? { max: s['checkout.note.maxChars'] } : null}
        capture={s['checkout.capture.enabled'] ? { waitMs: s['checkout.capture.waitMs'] } : null}
        bagHref={bagHref}
        suggest={s['delivery.suggest.enabled'] ? { minChars: s['delivery.suggest.minChars'], storeId: c.storeId, words: { label: c.t('addrSuggest.label'), count: c.t('addrSuggest.count') } } : null}
        prefill={prefill}
        remember={s['checkout.autofill'].browserDays > 0 ? { days: s['checkout.autofill'].browserDays } : null}
        backfill={s['checkout.address.backfill'].enabled}
        gift={giftCfg}
        gps={s['risk.capture'].gpsButton && !giftCfg ? { decimals: s['risk.capture'].gpsDecimals, days: s['risk.capture'].retentionDays, waitMs: s['risk.capture'].gpsWaitSeconds * 1000 } : null}
        callMe={s['checkout.callMe'].enabled ? { failedTries: s['checkout.callMe'].failedTries, idleSeconds: s['checkout.callMe'].idleSeconds } : null}
        voice={s['checkout.voice'].enabled ? { speechLang: s['checkout.voice'].speechLang, maxSeconds: s['checkout.voice'].maxSeconds, maxKb: s['checkout.voice'].maxKb, keepRecording: s['checkout.voice'].keepRecording, retentionDays: s['checkout.voice'].retentionDays } : null}
        paused={paused}
      />
      {actions}
    </div>
  );
}
