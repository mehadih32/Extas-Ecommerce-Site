// S16 · PR 348 — "Profit on this order" on the order page: goods sold and the delivery charge, less the product cost,
// courier, payment fees, packaging, messages and AI, and the ad-spend share (an estimate); a part not known yet says so
// and is left out, a line without an ERP cost hides the profit. Only for a delivered order. Words: orderProfit.*.
import { PROFIT_INCOME, PROFIT_PARTS, type OrderProfit } from '@extas/metrics';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';

export function OrderProfitCard({ dict, p, money }: { dict: Dict; p: OrderProfit; money: (minor: number) => string }) {
  const c = (k: string, vars?: Record<string, string | number>) => t(dict, `orderProfit.${k}`, vars);
  const tone = p.status === 'complete' ? 'ok' : p.status === 'notDelivered' ? '' : 'warn';
  return (
    <section className="a2-card" data-testid="order-profit" data-status={p.status}>
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{c('title')}</h2>
          <div className="a2-cs">{c('sub')}</div>
        </div>
        <span className={`a2-pill ${tone}`}>{c(`status.${p.status}`)}</span>
      </div>
      {p.status === 'notDelivered' ? (
        <div className="a2-sm a2-mute">{c('notDelivered')}</div>
      ) : (
        <>
          {PROFIT_PARTS.map((k) => {
            const part = p.parts[k];
            const sign = PROFIT_INCOME.includes(k) ? '+' : '−';
            return (
              <div key={k} className="a2-rule" data-testid={`profit-${k}`} data-state={part.state}>
                <span>{c(`part.${k}`)}</span>
                <span className="a2-xs a2-mute">{part.state === 'known' ? '' : c(`state.${part.state}`)}</span>
                <b>{part.minor === null ? '—' : `${sign} ${money(part.minor)}`}</b>
              </div>
            );
          })}
          <div className="a2-rule" data-testid="profit-total">
            <b>{c('profit')}</b>
            <span className="a2-xs a2-mute">{p.profitMinor === null ? c('noProfit') : ''}</span>
            <b>{p.profitMinor === null ? '—' : money(p.profitMinor)}</b>
          </div>
          {p.uncostedSkus.length ? (
            <div className="a2-note" data-testid="profit-uncosted">
              <ShellIcon name="alert" size={15} />
              <span>{c('uncosted', { skus: p.uncostedSkus.join(', ') })}</span>
            </div>
          ) : null}
        </>
      )}
      <div className="a2-note">
        <ShellIcon name="info" size={15} />
        <span>{c('never')}</span>
      </div>
    </section>
  );
}
