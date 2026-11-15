// Parity round 3, lane F (PR 807) — Marketing › Ad campaigns as the prototype v5 draws it: the period bar, four figures, and
// "All campaigns" with a chip per platform (and "Needs action"), a search, a sort and the table with a plain verdict
// and its one-line reason per campaign. Server component; the filter, search and sort live in the address. Read-only.
import Link from 'next/link';
import type { Overview, OverviewCampaignRow } from '@/lib/marketing/overview';
import { PERIOD_KEYS, type PeriodKey } from '@/lib/lane-f/period';
import { moneyOf, numOf, perOf, symbolOf } from '@/lib/lane-f/format';
import { t, type Dict } from '@/lib/i18n';
import { AiLine, Chips, GuideNote, Kpi, KpiGrid, PeriodBar, deltaPct } from './Parts';

const PLATFORMS = ['META', 'GOOGLE', 'YOUTUBE', 'TIKTOK'] as const;
const TONE = { SCALE: 'ok', KEEP: 'info', FIX: 'warn', STOP: 'bad', NONE: '' } as const;
const RUNNING = /^(ACTIVE|ENABLED|RUNNING|LIVE|ON)$/i;

export interface AdCampaignsProps {
  d: Dict;
  here: string;
  o: Overview;
  period: PeriodKey;
  /** filter chip key (all, action or a platform), the search words and the sort (spend | per). */
  chip: string;
  q: string;
  sort: string;
}

export function AdCampaigns({ d, here, o, period, chip, q, sort }: AdCampaignsProps) {
  const f = (k: string, v?: Record<string, string | number>) => t(d, `lf.${k}`, v);
  const g = (k: string, v?: Record<string, string | number>) => t(d, `lf6.ac.${k}`, v);
  const cur = symbolOf(o.currency);
  const money = (m: number | null) => moneyOf(m, o.currency);
  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams({ period, chip, q, sort, ...over });
    for (const [k, v] of [...p.entries()]) if (!v || (k === 'chip' && v === 'all') || (k === 'sort' && v === 'spend') || (k === 'period' && v === '30d')) p.delete(k);
    const s = p.toString();
    return s ? `${here}?${s}` : here;
  };
  const needs = (x: OverviewCampaignRow) => x.verdict === 'SCALE' || x.verdict === 'FIX' || x.verdict === 'STOP';
  const match = (x: OverviewCampaignRow, k: string) => (k === 'all' ? true : k === 'action' ? needs(x) : x.platform === k);
  const list = o.campaigns
    .filter((x) => match(x, chip) && (!q || x.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (sort === 'per' ? (b.perTk ?? -1) - (a.perTk ?? -1) : b.spendMinor - a.spendMinor));
  const perAll = o.spendMinor && o.spendMinor > 0 ? o.adSalesMinor / o.spendMinor : null;
  const dailyNow = o.campaigns.filter((x) => RUNNING.test(x.status)).reduce((a, x) => a + (x.dailyBudgetMinor ?? 0), 0);
  const best = o.campaigns.filter((x) => x.spendMinor > 0 && x.perTk !== null).sort((a, b) => (b.perTk ?? 0) - (a.perTk ?? 0));
  const top = best[0];
  const low = best[best.length - 1];
  const ai = top
    ? [f('ov.aiBestCh', { name: top.name, per: perOf(top.perTk, o.currency), cur }), low && low !== top ? f('ov.aiWeak', { name: low.name, per: perOf(low.perTk, o.currency), cur }) : ''].filter(Boolean).join(' ')
    : f('ov.aiNone');
  const chips = [
    { key: 'all', label: f('ac.chip.all'), count: o.campaigns.length, href: link({ chip: 'all' }) },
    ...PLATFORMS.map((p) => ({ key: p, label: f(`ac.chip.${p}`), count: o.campaigns.filter((x) => x.platform === p).length, href: link({ chip: p }) })),
    { key: 'action', label: f('ac.chip.action'), count: o.campaigns.filter(needs).length, href: link({ chip: 'action' }) },
  ];
  return (
    <div data-testid="ac-ad-campaigns">
      <PeriodBar current={period} note={f('per.vs')} items={PERIOD_KEYS.map((k) => ({ key: k, label: f(`per.${k}`), href: link({ period: k }) }))} />
      <AiLine>{ai}</AiLine>
      <KpiGrid cols={4}>
        <Kpi testId="ac-spend" label={f('ac.kSpend')} value={money(o.spendMinor)} delta={deltaPct(o.spendMinor, o.prev.spendMinor)} inverse sub={f('ac.kSpendSub', { x: money(dailyNow) })} />
        <Kpi testId="ac-delivered" label={f('ac.kDelivered')} value={numOf(o.adDelivered)} delta={deltaPct(o.adDelivered, o.prev.adDelivered)} />
        <Kpi testId="ac-per" label={f('ac.kPer', { cur })} value={perOf(perAll, o.currency)} />
        <Kpi testId="ac-profit" label={f('ac.kProfit')} value={money(o.profitMinor)} delta={deltaPct(o.profitMinor, o.prev.profitMinor)} />
      </KpiGrid>
      <section className="a2-card a2-mt12" data-testid="ac-all">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {f('ac.all')}
        </h2>
        <div className="lf-bar">
          <Chips items={chips} current={chip} label={f('ac.all')} testId="ac-chips" />
          <form method="get" action={here} className="lf-find" role="search">
            <input type="hidden" name="period" value={period} />
            {chip !== 'all' ? <input type="hidden" name="chip" value={chip} /> : null}
            <input className="a2-inp" name="q" defaultValue={q} placeholder={f('ac.search')} aria-label={f('ac.search')} maxLength={60} />
            <select className="a2-sel" name="sort" defaultValue={sort} aria-label={f('ac.sortSpend')}>
              <option value="spend">{f('ac.sortSpend')}</option>
              <option value="per">{f('ac.sortPer', { cur })}</option>
            </select>
            <button type="submit" className="a2-btn">
              {f('ac.search').replace('…', '')}
            </button>
          </form>
        </div>
        {list.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="ac-table">
              <thead>
                <tr>
                  <th>{f('ac.col.campaign')}</th>
                  <th>{f('ac.col.status')}</th>
                  <th className="r">{f('ac.col.spend')}</th>
                  <th className="r">{f('ac.col.clicks')}</th>
                  <th className="r">{f('ac.col.orders')}</th>
                  <th className="r">{f('ac.col.delivered')}</th>
                  <th className="r">{g('colReturned')}</th>
                  <th className="r">{f('ac.col.sales')}</th>
                  <th className="r">{f('ac.col.per', { cur })}</th>
                  <th className="r">{g('colProfit')}</th>
                  <th>{f('ac.col.verdict')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((x) => {
                  const on = RUNNING.test(x.status);
                  return (
                    <tr key={x.id} data-testid="ac-row" data-verdict={x.verdict}>
                      <td>
                        <Link className="lf-cn a2-b" href={`/admin/marketing/campaigns/ad/${x.id}`} data-testid="ac-open" aria-label={g('open', { name: x.name })}>
                          {x.name}
                        </Link>
                        <span className="a2-xs a2-mute lf-cs">
                          {f(`ac.chip.${x.platform}`) === `lf.ac.chip.${x.platform}` ? x.platform : f(`ac.chip.${x.platform}`)}
                          {x.dailyBudgetMinor ? ` · ${money(x.dailyBudgetMinor)}${f('ac.day')}` : ''}
                        </span>
                      </td>
                      <td>
                        <span className={`a2-pill ${on ? 'ok' : ''}`}>{on ? f('ac.running') : f('ac.paused')}</span>
                      </td>
                      <td className="r a2-num">{money(x.spendMinor)}</td>
                      <td className="r a2-num">{numOf(x.clicks)}</td>
                      <td className="r a2-num">{numOf(x.purchases)}</td>
                      <td className="r a2-num">{numOf(x.delivered)}</td>
                      <td className="r a2-num">{numOf(x.returned)}</td>
                      <td className="r a2-num">{money(x.salesMinor)}</td>
                      <td className="r a2-num">
                        <b>{perOf(x.perTk, o.currency)}</b>
                      </td>
                      <td className={`r a2-num ${x.profitMinor === null ? '' : x.profitMinor < 0 ? 'lf6-neg' : 'lf6-pos'}`} data-testid="ac-profit-cell">
                        <b>{money(x.profitMinor)}</b>
                      </td>
                      <td>
                        <span className={`a2-pill ${TONE[x.verdict]}`}>{f(`ac.verdict.${x.verdict}`)}</span>
                        <span className="a2-xs a2-mute lf-cs">{f(`ac.why.${x.verdict}`, { per: perOf(x.perTk, o.currency), cur })}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="ac-empty">
            {f('ac.empty')}
          </p>
        )}
        <GuideNote>{g('note')}</GuideNote>
      </section>
      <p className="a2-xs a2-mute a2-mt12">
        <Link className="a2-lnk" href="/admin/marketing/ad-platforms/campaigns">
          {t(d, 'lf.ac.newLink')}
        </Link>
      </p>
    </div>
  );
}
