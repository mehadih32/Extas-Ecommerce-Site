// S05 · PR 150 — "What happened" on the order page: the order's life, oldest first, as the customer may see it (Blueprint
// B1.1 "customer dashboard with full order history and lifecycle"; @extas/accounts lifecycle.ts says what is in it and
// what never is). Folded shut under the items, so the page opens as the demo draws it (60-account.js PAGES.order) and
// the tracking steps stay the first thing he reads; open, each row is a dot, what happened, who did it, and when.
// Every word comes from the shop dictionary (`account.life.*`); the times are the store's own time zone.
import type { LifeStep } from '@extas/accounts';
import type { ShopContext } from '@/lib/shop/context';
import { dateText } from '@/lib/shop/account-view';
import { listText } from '@/lib/shop/bag-model';
import { Icon } from '../Icon';

/** The detail line of a row: which fields an edit changed, the pieces it names, the size he kept. */
function detailOf(c: ShopContext, s: LifeStep): string[] {
  const t = c.t;
  const out: string[] = [];
  if (s.fields?.length) out.push(t('account.life.changed', { fields: listText(s.fields.map((f) => t(`account.life.field.${f}`)), t('bag.sizes.and')) }));
  for (const l of s.lines ?? []) out.push(l.to ? `${l.from} → ${l.to}` : l.from);
  if (s.kind === 'sizeAnswered' && s.product) out.push(s.keep ? t('account.life.keepOne', { product: s.product, size: s.keep }) : t('account.life.keepAll', { product: s.product }));
  return out;
}

export function OrderLife({ c, steps }: { c: ShopContext; steps: LifeStep[] }) {
  const t = c.t;
  if (!steps.length) return null;
  return (
    <details className="card ord-life" data-testid="order-life">
      <summary className="ord-life-s" data-testid="order-life-open">
        <h2 className="h3">{t('account.life.title')}</h2>
        <Icon name="down" size={18} className="ord-life-c" />
      </summary>
      <ol className="ord-life-l">
        {steps.map((s, i) => {
          const detail = detailOf(c, s);
          return (
            <li key={`${s.kind}-${s.at}-${i}`} className="ord-life-r" data-kind={s.kind}>
              <span className={`ord-life-d${s.kind === 'cancelled' || s.kind === 'returned' ? ' end' : ''}`} aria-hidden="true" />
              <div style={{ minWidth: 0 }}>
                <div className="small bold">
                  {t(`account.life.kind.${s.kind}`)}
                  {s.by ? <span className="xs muted ord-life-by"> · {t(`account.life.by.${s.by}`)}</span> : null}
                </div>
                {detail.map((d) => (
                  <div key={d} className="xs text2 ord-life-x">
                    {d}
                  </div>
                ))}
                <div className="xs muted">
                  <time dateTime={s.at}>{dateText(c, s.at, true)}</time>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
