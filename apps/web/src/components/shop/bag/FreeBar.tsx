// PR 113 — free-delivery progress on top of the bag: "free" with the reason when the rules engine says so, or how much
// more is needed with a bar; nothing at all when no rule backs it (CN-018: no promise the shop has not switched on).
import type { BagView } from '@extas/cart';
import type { ShopContext } from '@/lib/shop/context';
import { Icon } from '../Icon';

/** PR 113 — free delivery: free (with why), or how much more with a bar; nothing when no rule backs it. */
export function FreeBar({ c, free }: { c: ShopContext; free: BagView['free'] }) {
  const t = c.t;
  if (free.free) {
    const why = free.reason === 'FREE_OVER' && free.freeOverMinor ? t('bag.free.over', { amount: c.money(free.freeOverMinor) }) : t('bag.free.on');
    return (
      <div className="bg-freebar" data-testid="bag-free" data-free="1">
        <Icon name="truck" size={22} />
        <span className="grow">
          <b>{t('bag.free.title')}</b>
          <span>{why}</span>
        </span>
        <span className="bg-freeb">
          <Icon name="check" size={13} />
          {t('bag.free.badge')}
        </span>
      </div>
    );
  }
  if (!free.freeOverMinor || free.remainingMinor === null || free.remainingMinor <= 0) return null;
  const [before, after] = t('bag.free.gap', { amount: '\u0000' }).split('\u0000');
  return (
    <div className="card p16 bg-free" data-testid="bag-free" data-free="0">
      <div className="row small" style={{ gap: 10 }}>
        <span className="brandc">
          <Icon name="truck" size={18} />
        </span>
        <span>
          {before}
          <b>{c.money(free.remainingMinor)}</b>
          {after}
        </span>
      </div>
      <div className="bar-progress mt8" role="progressbar" aria-label={t('bag.free.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={free.progress}>
        <div style={{ width: `${free.progress}%` }} />
      </div>
    </div>
  );
}
