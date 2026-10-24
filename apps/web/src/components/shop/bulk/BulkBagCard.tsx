// PR 606 — the bag's "Ordering for a company or a team?" card (the bulk / corporate lane, `orders.bulkLane`): drawn under
// the bag's lines, in the same card style as the bag's WhatsApp card, when the owner has the lane on and the bag has
// his number of pieces or more, or a line has reached what can be added (`bulkCardReason`). It links to /bulk-order
// with the bag's pieces, and offers the hotline when the owner keeps it shown. Nothing about the bag or its prices
// changes.
import './bulk.css';
import type { BagView } from '@extas/cart';
import { bulkCardReason } from '@extas/checkout/pure';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { telHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';

export function BulkBagCard({ c, view }: { c: ShopContext; view: BagView }) {
  const lane = c.s['orders.bulkLane'];
  const why = bulkCardReason(lane, view.summary.count, view.items);
  if (!why) return null;
  const t = c.t;
  const phone = lane.showContact ? c.s['contact.phone'] : null;
  const tel = telHref(phone);
  return (
    <div className="card p16 bk-bag" data-testid="bag-bulk" data-why={why}>
      <div className="row" style={{ gap: 12 }}>
        <span className="bg-ic">
          <Icon name="box" size={18} />
        </span>
        <div className="grow">
          <div className="h3">{t('bulk.bag.title')}</div>
          <div className="small text2">{t(why === 'count' ? 'bulk.bag.textCount' : 'bulk.bag.textStock')}</div>
        </div>
        <a className="btn btn-secondary btn-sm" href={`${hrefIn(c.lang, ROUTES.bulkOrder)}?from=bag`} data-testid="bag-bulk-go">
          {t('bulk.bag.button')}
        </a>
      </div>
      {tel && phone ? (
        <a className="link small bk-bag-call" href={tel}>
          {t('bulk.bag.call', { number: phone })}
        </a>
      ) : null}
    </div>
  );
}
