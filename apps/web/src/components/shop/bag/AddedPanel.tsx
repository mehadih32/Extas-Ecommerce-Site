// PR 106 — "Added to bag" (demo 30-product.js bag modal, CN-012 panel style B): on a phone a sheet from the bottom with
// the item just added (name, colour, size, price), the bag's count and total, and the delivery line; on a computer a
// drawer from the right (style B: every bag line with "Just added" first, "+N more", the delivery line, the three
// buttons, and "Complete the look" filled by the fill rule) or the same sheet as the phone (style "default").
// When delivery is not free it never says "add ৳X more": only the Cash on Delivery and exchange line, when they are on.
//
// How a page mounts it (the product page, PR 49, the same way as the bag's test page): the Add button (AddToBag) adds
// through the bag's API and opens `?added=<lineId>`; the page then draws <AddedPanel> for that line on the server.
import type { BagItem, BagView } from '@extas/cart';
import { colourName, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { panelDeliveryLine, plural, type Reassurance } from '@/lib/shop/bag-model';
import type { BagSettings } from '@/lib/shop/bag';
import { productPath } from '@/lib/shop/home-model';
import { Icon } from '../Icon';
import { AddedDialog } from './AddedDialog';
import { nameOf, Thumb } from './BagLines';

function deliveryWords(c: ShopContext, kind: ReturnType<typeof panelDeliveryLine>): string | null {
  if (kind === 'free') return c.t('bag.panel.freeUnlocked');
  if (kind === 'codExchange') return c.t('bag.panel.codExchange', c.vars);
  if (kind === 'cod') return c.t('bag.panel.cod');
  if (kind === 'exchange') return c.t('bag.panel.exchange', c.vars);
  return null;
}

const subOf = (c: ShopContext, i: BagItem) => [i.colour ? colourName(i.colour, c.lang) : null, i.size?.label].filter(Boolean).join(' · ');

export function AddedPanel({ c, view, lineId, s, cards, picks, trust, closeHref }: { c: ShopContext; view: BagView; lineId: string; s: BagSettings; cards: Map<string, ShopCard>; picks: ShopCard[]; trust: Reassurance; closeHref: string }) {
  const t = c.t;
  const added = view.items.find((i) => i.lineId === lineId);
  if (!added) return null;
  const styleB = s['bag.panel.style'] === 'B';
  const count = plural(t, 'bag.count', view.summary.count, c.num);
  const delivery = deliveryWords(c, panelDeliveryLine(view.summary.freeDelivery, trust));
  const free = view.summary.freeDelivery;
  const name = nameOf(added, c);
  const others = view.items.filter((i) => i.lineId !== lineId);
  const max = s['bag.panel.maxLines'];
  const shownOthers = max > 0 ? others.slice(0, Math.max(0, max - 1)) : others;
  const more = others.length - shownOthers.length + view.sets.length;
  const bag = hrefIn(c.lang, ROUTES.bag);
  const buttons = (
    <div className="pdp-bagbtns">
      <button type="button" className="btn btn-ghost" data-added-close="">
        {t('bag.panel.keep')}
      </button>
      <a className="btn btn-secondary" href={bag}>
        {t('bag.panel.view')}
      </a>
      <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.checkout)}>
        {t('bag.panel.checkout')}
      </a>
    </div>
  );
  const sheet = (
    <div className={`stack s16${styleB ? ' hide-d' : ''}`} data-testid="bag-modal">
      <div className="row" style={{ gap: 12 }}>
        <div style={{ width: 60, flexShrink: 0 }}>
          <Thumb c={c} card={cards.get(added.productId)} colourKey={added.colour?.key} hex={added.colour?.hex ?? ''} alt={name} />
        </div>
        <div className="grow">
          <div className="small bold">{name}</div>
          <div className="xs text2">{added.colour && added.size ? t('bag.panel.sizeLine', { colour: colourName(added.colour, c.lang), size: added.size.label }) : subOf(c, added)}</div>
        </div>
        <div className="price small">{c.money(added.lineMinor)}</div>
      </div>
      <div className="soft p16">
        <div className="row between small">
          <span className="text2">{t('bag.panel.bag', { count })}</span>
          <span className="price" data-testid="bag-modal-total">
            {c.money(view.summary.totalMinor)}
          </span>
        </div>
        {delivery ? (
          <div className={`xs row mt8 ${free ? 'brandc bold' : 'text2'}`} style={{ gap: 6 }} data-testid="bag-modal-delivery">
            <Icon name={free ? 'truck' : 'cash'} size={14} />
            {delivery}
          </div>
        ) : null}
      </div>
      {buttons}
    </div>
  );
  const drawer = styleB ? (
    <div className="stack s16 atbc atbc-B hide-m" data-testid="bag-modal-d" data-style="B">
      <div className="atbc-card atbc-b">
        <div className="atbc-sum" data-testid="atbc-sum">
          <span className="atbc-bag">
            {t('bag.panel.bagWord')} <span className="atbc-cnt">{count}</span>
          </span>
          <span className="price atbc-tot" data-testid="atbc-total">
            {c.money(view.summary.totalMinor)}
          </span>
        </div>
        <div className="atbc-list">
          {[added, ...shownOthers].map((i) => (
            <div key={i.lineId} className={`atbc-li${i.lineId === lineId ? ' new' : ''}`} data-testid="atbc-line">
              <div className="atbc-lth">
                <Thumb c={c} card={cards.get(i.productId)} colourKey={i.colour?.key} hex={i.colour?.hex ?? ''} alt={nameOf(i, c)} />
              </div>
              <div className="atbc-lt">
                <div className="atbc-ln">
                  {i.lineId === lineId ? <span className="atbc-new">{t('bag.panel.justAdded')}</span> : null}
                  {nameOf(i, c)}
                </div>
                <div className="atbc-ls">{subOf(c, i)}</div>
              </div>
              <div className="atbc-lp">
                <span className="price">{c.money(i.lineMinor)}</span>
              </div>
            </div>
          ))}
        </div>
        {more > 0 ? (
          <a className="atbc-more" href={bag} data-testid="atbc-more">
            <span className="atbc-mt">{plural(t, 'bag.panel.more', more, c.num)}</span>
            <Icon name="right" size={14} />
          </a>
        ) : null}
      </div>
      {delivery ? (
        <div className="atbc-free" data-testid="atbc-free">
          <Icon name={free ? 'truck' : 'cash'} size={18} />
          <span>{delivery}</span>
        </div>
      ) : null}
      {buttons}
      {picks.length && s['bag.panel.fill'] !== 'off' ? (
        <div className="atb-x atbc-x" data-testid="atb-cross" data-added-picks="">
          <div className="atb-xh">{t('bag.panel.cross')}</div>
          {picks.map((p) => (
            <a key={p.id} className="atb-xi" href={hrefIn(c.lang, productPath(c.s['naming.productPathPrefix'], p.slug))}>
              <Thumb c={c} card={p} colourKey={p.colours[0]?.key} hex={p.colours[0]?.hex ?? ''} alt={nameOf(p, c)} />
              <span className="atb-xn">{nameOf(p, c)}</span>
              {p.priceMinor != null ? <span className="atb-xp price">{c.money(p.priceMinor)}</span> : null}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;
  return (
    <AddedDialog closeHref={closeHref} fill={s['bag.panel.fill']} picks={s['bag.panel.picks']} gapPx={s['bag.panel.gapPx']}>
      <div className="modal-back" data-added-back="">
        <div className={`modal${styleB ? ' atb-d' : ''}`} role="dialog" aria-modal="true" aria-label={t('bag.panel.title')} tabIndex={-1} data-testid="bag-panel">
          <div className="modal-hd">
            <div className="h3" style={{ fontSize: 17 }}>
              {t('bag.panel.title')}
            </div>
            <button type="button" className="iconbtn" data-added-close="" aria-label={t('bag.panel.close')}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="modal-bd">
            {sheet}
            {drawer}
          </div>
        </div>
      </div>
    </AddedDialog>
  );
}
