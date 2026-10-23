// PR 132 — the offer banner at the top of My orders (demo 52-thanks.js ty_offerBanner {big}, r12-acct.css note 51): the
// customer's real wallet balance when there is credit, then the owner's member offers (his own words; a coupon code
// only while it works for this customer), and "Shop now". The data says null when there is nothing true to show, and
// then nothing is drawn. For you lists the same offers as cards (OfferCards).
import type { AccountOffer, OfferBanner as Banner } from '@extas/accounts';
import type { ShopContext } from '@/lib/shop/context';
import { tabHref } from '@/lib/shop/account-view';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';

const pick = (c: ShopContext, t: { en: string; bn: string }) => (c.lang === 'bn' ? t.bn : t.en);

export function OfferBanner({ c, banner, walletUsable, showAll }: { c: ShopContext; banner: Banner | null; walletUsable: boolean; showAll: boolean }) {
  if (!banner) return null;
  const t = c.t;
  return (
    <section className="acc-ob" data-testid="acc-offerbanner" aria-label={t('account.ob.aria')}>
      <div className="acc-ob-hd">
        <span className="acc-ob-eb">
          <Icon name="spark" size={14} />
          {t('account.ob.eyebrow')}
        </span>
        {showAll && banner.offers.length ? (
          <a className="acc-ob-all" href={tabHref(c, 'foryou')}>
            {t('account.ob.seeAll')}
            <Icon name="right" size={14} />
          </a>
        ) : null}
      </div>
      {banner.walletMinor !== null ? (
        <div className="acc-ob-wal">
          <span className="k">{t('account.ob.wallet')}</span>
          <b className="v" data-testid="acc-ob-wallet">
            {c.money(banner.walletMinor)}
          </b>
          <span className="s">{t(walletUsable ? 'account.ob.walletReady' : 'account.ob.walletHere')}</span>
        </div>
      ) : null}
      {banner.offers.length ? (
        <div className="acc-ob-list">
          {banner.offers.map((o) => (
            <div className="acc-ob-row" key={o.id} data-testid="acc-ob-offer">
              <span className="ic">
                <Icon name={o.code ? 'tag' : 'gift'} size={17} />
              </span>
              <span className="tx">
                <b>{pick(c, o.title)}</b>
                {o.note ? <span>{pick(c, o.note)}</span> : null}
              </span>
              {o.code ? (
                <span className="acc-ob-code" aria-label={`${t('account.ob.code')} ${o.code}`}>
                  {o.code}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <a className="btn acc-ob-cta" href={hrefIn(c.lang, ROUTES.newIn)}>
        {t('account.ob.shop')}
        <Icon name="right" size={16} />
      </a>
    </section>
  );
}

/** For you: the same offers, one card each (demo acc_offerCard), or nothing (the section says there are none). */
export function OfferCards({ c, offers }: { c: ShopContext; offers: AccountOffer[] }) {
  if (!offers.length) return null;
  return (
    <div className="acc-g2" data-testid="acc-offers">
      {offers.map((o) => (
        <article className="card p20" key={o.id} data-testid="acc-offer">
          <span className="acc-oico">
            <Icon name={o.code ? 'tag' : 'gift'} size={20} />
          </span>
          <div className="h3 mt12 acc-ofr-t">{pick(c, o.title)}</div>
          {o.note ? (
            <div className="small text2" style={{ marginTop: 3 }}>
              {pick(c, o.note)}
            </div>
          ) : null}
          {o.code ? (
            <div className="acc-ocode mt12">
              <span className="xs muted">{c.t('account.ob.code')}</span>
              <b>{o.code}</b>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
