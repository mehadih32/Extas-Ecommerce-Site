// PR 1040 (S28, final round D14; prototype Finance › Costs "2 · Budgets & other expenses") — each cost against the budget the owner
// set (bar, "at this pace"), the month's other expenses with their receipt, and the ad spend by platform (this month, last month,
// the dollars beside the taka, share of sales). Server-rendered and read-only: "Edit budgets" and "Add photo" open the pages that
// take the PIN and the picture. Words: messages/admin-costs.*.json (`moneyCosts.fc.*`) and admin-budgets (`moneyBudgets.heads.*`).
import Link from 'next/link';
import type { CostsOverview } from '@/lib/costs-page';
import { t, type Dict } from '@/lib/i18n';
import { formatMoney, type Money } from './../products/model';

export function BudgetsExpensesSection({ dict, locale, money, o, canEdit }: { dict: Dict; locale: string; money: Money; o: CostsOverview; canEdit: boolean }) {
  const c = (key: string, vars?: Record<string, string | number>) => t(dict, `moneyCosts.fc.${key}`, vars);
  const m = (minor: number) => formatMoney(minor, money);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' });
  const dollars = (list: { currency: string; minor: number }[]) =>
    list
      .filter((x) => x.currency !== money.currency)
      .map((x) => `${x.currency} ${(x.minor / 100).toLocaleString('en', { maximumFractionDigits: 0 })}`) // hardcode-ok: a foreign amount shown in its own currency's minor unit (cents)
      .join(' · ');
  const headName = (id: string, list: { id: string; nameEn: string; nameBn: string | null }[]) => {
    const h = list.find((x) => x.id === id);
    return h ? (locale.startsWith('bn') && h.nameBn ? h.nameBn : h.nameEn) : '';
  };
  const rows = [...o.expenses.thisMonth.rows.map((r) => ({ r, heads: o.expenses.thisMonth.heads })), ...o.expenses.lastMonth.rows.map((r) => ({ r, heads: o.expenses.lastMonth.heads }))].filter((x) => !x.r.reversal && !x.r.reversed);
  return (
    <section className="fc" data-testid="budgets-expenses-section" aria-labelledby="be-h">
      <h2 className="fc-h" id="be-h">
        {c('h2')}
      </h2>

      <section className="a2-card" data-testid="be-budgets" aria-labelledby="be-b-h">
        <h3 className="a2-h3" id="be-b-h">
          {c('bud.title')}
        </h3>
        <p className="a2-cs">{c('bud.sub', { day: o.day, days: o.days })}</p>
        <div className="fc-budgets a2-mt12">
          {o.budgets.lines
            .filter((l) => l.budgetMinor !== null || l.spentMinor > 0)
            .map((l) => {
              const b = l.budgetMinor ?? 0;
              const pct = b ? Math.min(100, (l.spentMinor / b) * 100) : 0;
              return (
                <div key={l.headKey} data-testid="be-budget" data-state={l.state}>
                  <div className="a2-between a2-sm">
                    <b>{t(dict, `moneyBudgets.heads.${l.headKey}`)}</b>
                    <span>
                      {m(l.spentMinor)} / {l.budgetMinor === null ? '—' : m(b)}
                    </span>
                  </div>
                  <div className="fc-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                    <i className={`fc-fill ${l.state === 'over' ? 'bad' : l.state === 'pace' ? 'warn' : 'ok'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={`a2-xs ${l.state === 'over' || (l.state === 'pace' && l.paceMinor > b) ? 'fc-bad' : 'a2-mute'}`}>
                    {l.budgetMinor === null
                      ? c('bud.none')
                      : l.state === 'over'
                        ? c('bud.over', { amount: m(l.spentMinor - b) })
                        : l.state === 'pace' && l.paceMinor > b
                          ? c('bud.pace', { pace: m(l.paceMinor), over: m(Math.max(0, l.paceMinor - b)) })
                          : c('bud.left', { amount: m(b - l.spentMinor) })}
                  </div>
                </div>
              );
            })}
        </div>
        {!o.budgets.lines.some((l) => l.budgetMinor !== null || l.spentMinor > 0) ? (
          <p className="a2-sm a2-mute a2-mt12" data-testid="be-budgets-none">
            {c('bud.noneSet')}
          </p>
        ) : null}
        {canEdit ? (
          <Link className="a2-btn sm a2-mt12" href="/admin/money/budgets" data-testid="cs-bud">
            {c('bud.edit')}
          </Link>
        ) : null}
      </section>

      <section className="a2-card a2-mt12" data-testid="be-expenses" aria-labelledby="be-e-h">
        <h3 className="a2-h3" id="be-e-h">
          {c('exp.title')}
        </h3>
        {o.expenses.withoutReceipt ? (
          <p className="a2-note" data-testid="be-no-receipt">
            {c('exp.noReceipt', { n: o.expenses.withoutReceipt })}
          </p>
        ) : null}
        {rows.length ? (
          <div className="a2-tbl-wrap a2-mt12">
            <table className="a2-tbl" data-testid="be-exp-table">
              <thead>
                <tr>
                  <th>{c('exp.date')}</th>
                  <th>{c('exp.what')}</th>
                  <th className="r">{c('exp.amount')}</th>
                  <th>{c('exp.receipt')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, heads }) => (
                  <tr key={r.id} data-testid="be-exp-row">
                    <td>{day.format(new Date(`${r.day}T00:00:00Z`))}</td>
                    <td>
                      {r.note ?? headName(r.headId, heads)}
                      <div className="a2-xs a2-mute">{headName(r.headId, heads)}</div>
                    </td>
                    <td className="r">{m(r.amountMinor)}</td>
                    <td>
                      {r.receiptId ? (
                        <span className="a2-pill ok">✓ {c('exp.photo')}</span>
                      ) : (
                        <Link className="a2-btn sm" href="/admin/money/expenses">
                          {c('exp.addPhoto')}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="be-exp-none">
            {c('exp.none')}
          </p>
        )}
      </section>

      <section className="a2-card a2-mt12" data-testid="be-ads" aria-labelledby="be-a-h">
        <h3 className="a2-h3" id="be-a-h">
          {c('ads.title')}
        </h3>
        {o.ads.rows.length ? (
          <div className="a2-tbl-wrap a2-mt12">
            <table className="a2-tbl" data-testid="be-ads-table">
              <thead>
                <tr>
                  <th>{c('ads.platform')}</th>
                  <th className="r">{c('ads.thisMonth')}</th>
                  <th className="r">{c('ads.lastMonth')}</th>
                  <th className="r">{c('ads.share')}</th>
                </tr>
              </thead>
              <tbody>
                {o.ads.rows.map((r) => (
                  <tr key={r.platform} data-testid="be-ads-row">
                    <td>
                      <b>{c(`platform.${r.platform}`)}</b>
                    </td>
                    <td className="r">
                      {m(r.thisMinor)}
                      <div className="a2-xs a2-mute">{dollars(r.thisNative)}</div>
                    </td>
                    <td className="r">
                      {m(r.lastMinor)}
                      <div className="a2-xs a2-mute">{dollars(r.lastNative)}</div>
                    </td>
                    <td className="r">{r.shareOfSalesBp === null ? '—' : `${(r.shareOfSalesBp / 100).toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="be-ads-none">
            {c('ads.none')}
          </p>
        )}
        <div className="a2-between a2-sm a2-mt12" style={{ flexWrap: 'wrap', gap: 6 }}>
          <span className="a2-mute">{o.ads.rate ? c('ads.rate', { rate: Number(o.ads.rate.rate).toFixed(2), currency: money.currency }) : c('ads.noRate')}</span>
          <Link className="a2-btn sm" href="/admin/money/fees" data-testid="cs-usd">
            {c('ads.changeRate')}
          </Link>
        </div>
      </section>
    </section>
  );
}
