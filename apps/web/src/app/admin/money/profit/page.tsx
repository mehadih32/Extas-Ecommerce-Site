// S16 · PR 349 — Money → Profit & loss at /admin/money/profit (B3.10; BACKEND-ARCHITECTURE §5 MNY-01, §10.2): Sales of
// delivered orders with Ordered value beside it, gross profit, contribution, ad spend, other costs, fixed costs and net
// profit for any period (one-press periods or from/to, made safe by `costs.report`), how each line is made, the orders
// left out for a missing cost, the parts not known yet, day by day, and the CSV. Seeing it needs `books.read`. Read-only.
// PR 351: at the end, the money report to the owner (how often, when, the language; changing it needs `books.report`).
// PR 537: while the VAT system is on, a "VAT inside Sales" line under the profit lines (the same figure as Money → VAT).
// Words: messages/admin-profit.*.json.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { PNL_MAYBE_MISSING, ymdIn } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { MoneyReportCard } from '@/components/admin/money/MoneyReportCard';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { PrintButton } from '@/components/admin/reports/PrintButton';
import { adminDeps } from '@/lib/admin-auth';
import { withLaneF } from '@/lib/admin-lane-f';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { parseReportQuery, QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';
import { moneyReportView } from '@/lib/money-report-api';
import { profitReport } from '@/lib/profit-report';
import { vatReportFor } from '@/lib/vat-report';
import { Delta, deltaPct } from '@/components/admin/lane-f/Parts';
import { channelMarginPct, channelProfitView } from '@/lib/channel-profit-view';
import { monthSheet } from '@/lib/month-sheet';
import { PERIOD_KEYS, previousPeriod, resolvePeriod, type PeriodKey } from '@/lib/lane-f/period';
import channelsBn from '../../../../../messages/admin-profit-channels.bn.json';
import channelsEn from '../../../../../messages/admin-profit-channels.en.json';
import bn from '../../../../../messages/admin-profit.bn.json';
import en from '../../../../../messages/admin-profit.en.json';
import reportBn from '../../../../../messages/admin-cost-report.bn.json';
import reportEn from '../../../../../messages/admin-cost-report.en.json';
import '../../settings-cards.css';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyProfit';
const HERE = '/admin/money/profit';

function withScreen(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, moneyProfit: (b ? bn : en).moneyProfit as unknown as Dict, moneyCostReport: (b ? reportBn : reportEn).moneyCostReport as unknown as Dict, moneyProfitChannels: (b ? channelsBn : channelsEn).moneyProfitChannels as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyProfit.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ProfitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withLaneF(withScreen(plain));
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="money-profit" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyProfit.${k}`, vars);
  const cr = (k: string) => t(d, `moneyCostReport.${k}`);
  const at = { storeId: MOTHER_STORE_ID };
  const [currency, timeZone, limits] = await Promise.all([access.deps.resolver.value('store.currency', at), access.deps.resolver.value('store.timeZone', at), access.deps.resolver.value('costs.report', at)]);
  const today = ymdIn(new Date(), timeZone);
  const parsed = parseReportQuery(sp, today, limits);
  const notes = parsed.notes;
  // PR 982 (prototype): the page opens on "This month" with the five one-press periods; a typed from/to or an older ?period= still works
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const mine: PeriodKey | null = PERIOD_KEYS.find((k) => k === one(sp.period)) ?? (sp.period || sp.from || sp.to ? null : 'month');
  const q = mine ? { ...parsed.q, ...resolvePeriod(mine, today) } : parsed.q;
  const more = sp.more === '1';
  const prevRange = mine === 'month' && one(sp.cmp) === 'full' ? resolvePeriod('lastmonth', today) : previousPeriod(q.from, q.to);
  const [r, prev, report, vat] = await Promise.all([profitReport(access.deps, MOTHER_STORE_ID, q.from, q.to), profitReport(access.deps, MOTHER_STORE_ID, prevRange.from, prevRange.to), moneyReportView(access.deps, MOTHER_STORE_ID), vatReportFor(access.deps, MOTHER_STORE_ID, q.from, q.to)]);
  const chView = await channelProfitView(access.deps, MOTHER_STORE_ID, { from: q.from, to: q.to }, limits);
  const lastMonthKey = resolvePeriod('lastmonth', today).from.slice(0, 7);
  const thisMonthKey = today.slice(0, 7);
  const prevMonthKey = (() => {
    const d = new Date(Date.UTC(Number(lastMonthKey.slice(0, 4)), Number(lastMonthKey.slice(5, 7)) - 2, 1));
    return d.toISOString().slice(0, 7);
  })();
  const sheets = await Promise.all([prevMonthKey, lastMonthKey, thisMonthKey].map((mo) => monthSheet(access.deps.db, MOTHER_STORE_ID, mo, timeZone, today)));
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  // prototype v5 (Finance › Profit & loss): the two compare buttons name their own days ("vs 1–12 Oct", "vs all of October")
  const ymd = (s: string) => new Date(`${s}T12:00:00Z`);
  const dm = (s: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(view.locale, { timeZone: 'UTC', numberingSystem: 'latn', ...o }).format(ymd(s));
  const sameRange = previousPeriod(q.from, q.to);
  const dd = (s: string) => dm(s, { day: 'numeric' });
  const mo = (s: string) => dm(s, { month: 'short' });
  const sameLabel = sameRange.from.slice(0, 7) === sameRange.to.slice(0, 7) ? `${dd(sameRange.from)}–${dd(sameRange.to)} ${mo(sameRange.to)}` : `${dd(sameRange.from)} ${mo(sameRange.from)}–${dd(sameRange.to)} ${mo(sameRange.to)}`;
  const fullLabel = dm(resolvePeriod('lastmonth', today).from, { month: 'long' });
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const asked = QUICK_PERIODS.find((p) => p === sp.period);
  const current =
    asked ??
    QUICK_PERIODS.find((p) => {
      const x = quickPeriod(p, today);
      return x.from === q.from && x.to === q.to;
    });
  const margin = r.netProfitMinor === null || r.parts.sales <= 0 ? null : Math.round((r.netProfitMinor * 1000) / r.parts.sales) / 10;
  const kpis: { key: string; value: string; sub?: string }[] = [
    { key: 'sales', value: m(r.salesMinor), sub: c('kpi.orders', { n: r.orders }) },
    { key: 'ordered', value: m(r.orderedMinor), sub: c('kpi.orderedSub') },
    { key: 'gross', value: m(r.grossProfitMinor) },
    { key: 'contribution', value: m(r.contributionMinor) },
    { key: 'net', value: r.netProfitMinor === null ? '—' : m(r.netProfitMinor) },
    { key: 'margin', value: margin === null ? '—' : `${margin}%` },
  ];
  const dayListCut = r.byDay.length > limits.maxDayRows;
  type Line = { key: string; sign: '+' | '−' | '='; minor: number | null; how?: string; note?: string };
  const lines: Line[] = [
    { key: 'sales', sign: '+', minor: r.parts.sales, how: c('lines.salesHow') },
    { key: 'returns', sign: '−', minor: r.parts.returns, how: c('lines.returnsHow') },
    { key: 'netSales', sign: '=', minor: r.netSalesMinor },
    { key: 'productCost', sign: '−', minor: r.parts.productCost, how: c('lines.productCostHow') },
    { key: 'gross', sign: '=', minor: r.grossProfitMinor },
    { key: 'deliveryCharge', sign: '+', minor: r.parts.deliveryCharge, how: c('lines.deliveryChargeHow') },
    { key: 'courier', sign: '−', minor: r.parts.courier, how: r.estimatedCourier > 0 ? `${c('lines.courierHow')} · ${c('lines.courierEstimated', { n: r.estimatedCourier })}` : c('lines.courierHow') },
    ...(r.parts.codFee !== 0 || r.missing.codFee > 0 ? [{ key: 'codFee', sign: '−' as const, minor: r.parts.codFee, how: c('lines.codFeeHow') }] : []),
    { key: 'paymentFees', sign: '−', minor: r.parts.paymentFees, how: c('lines.paymentFeesHow') },
    { key: 'packaging', sign: '−', minor: r.parts.packaging, how: c('lines.packagingHow') },
    { key: 'messages', sign: '−', minor: r.parts.messages, how: c('lines.messagesHow') },
    { key: 'returnLoss', sign: '−', minor: r.parts.returnLoss, how: c('lines.returnLossHow') },
    { key: 'contribution', sign: '=', minor: r.contributionMinor },
    { key: 'ads', sign: '−', minor: r.adsMinor, how: r.adsMinor === null ? c('lines.adsUnknown') : r.adsImported ? c('lines.adsHow') : c('lines.adsNone') },
    { key: 'other', sign: '−', minor: r.otherCostsMinor, how: c('lines.otherHow') },
    { key: 'fixed', sign: '−', minor: r.fixedMinor ?? 0, how: r.fixedMinor === null ? c('lines.fixedNone') : c('lines.fixedHow') },
    { key: 'net', sign: '=', minor: r.netProfitMinor, how: r.netProfitMinor === null ? c('lines.netUnknown') : undefined },
  ];

  // prototype v5: "One average order" — each line per delivered order (the same figures as the lines above, shared out)
  const per = (x: number | null) => (r.orders > 0 && x !== null ? Math.round(x / r.orders) : 0);
  const ue: { key: string; minor: number }[] = [
    { key: 'avg', minor: per(r.parts.sales) },
    { key: 'cost', minor: -per(r.parts.productCost) },
    { key: 'courier', minor: -per(r.parts.courier) },
    { key: 'cod', minor: -per(r.parts.codFee) },
    { key: 'pack', minor: -per(r.parts.paymentFees + r.parts.packaging) },
    { key: 'returns', minor: -per(r.parts.returns + r.parts.returnLoss) },
    { key: 'ads', minor: -per(r.adsMinor) },
    { key: 'fixed', minor: -per((r.fixedMinor ?? 0) + (r.otherCostsMinor ?? 0)) },
  ];
  const ueNet = ue.reduce((sum, x) => sum + x.minor, 0);
  const sm = (x: number) => (x < 0 ? `− ${m(-x)}` : m(x));

  // the prototype's Statement: each line for this period, the period before, and the change
  type St = { key: string; minor: (x: typeof r) => number | null; out: boolean; kind: 'ind' | 'sum' | 'big' };
  const ST: St[] = [
    { key: 'sales', minor: (x) => x.parts.sales, out: false, kind: 'ind' },
    { key: 'returns', minor: (x) => x.parts.returns, out: true, kind: 'ind' },
    { key: 'delivery', minor: (x) => x.parts.deliveryCharge, out: false, kind: 'ind' },
    { key: 'cost', minor: (x) => x.parts.productCost, out: true, kind: 'ind' },
    { key: 'courier', minor: (x) => x.parts.courier, out: true, kind: 'ind' },
    { key: 'cod', minor: (x) => x.parts.codFee, out: true, kind: 'ind' },
    { key: 'pack', minor: (x) => x.parts.packaging, out: true, kind: 'ind' },
    { key: 'gate', minor: (x) => x.parts.paymentFees, out: true, kind: 'ind' },
    { key: 'msg', minor: (x) => x.parts.messages, out: true, kind: 'ind' },
    { key: 'loss', minor: (x) => x.parts.returnLoss, out: true, kind: 'ind' },
    { key: 'gross', minor: (x) => x.contributionMinor, out: false, kind: 'sum' },
    { key: 'ads', minor: (x) => x.adsMinor, out: true, kind: 'ind' },
    { key: 'fixed', minor: (x) => x.fixedMinor ?? 0, out: true, kind: 'ind' },
    { key: 'other', minor: (x) => x.otherCostsMinor, out: true, kind: 'ind' },
    { key: 'net', minor: (x) => x.netProfitMinor, out: false, kind: 'big' },
  ];
  const stCell = (v: number | null, out: boolean) => (v === null ? '—' : out && v ? `− ${m(Math.abs(v))}` : m(v));
  const marginOf = (x: typeof r) => (x.netProfitMinor === null || x.parts.sales <= 0 ? null : Math.round((x.netProfitMinor * 1000) / x.parts.sales) / 10);
  const segs: PeriodKey[] = ['today', '7d', 'month', 'lastmonth', '30d'];
  const monthName = (mo: string) => new Intl.DateTimeFormat(view.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${mo}-01T00:00:00Z`));
  const chRows = chView.report.rows.filter((x) => x.orders > 0);
  const chTotal = chRows.reduce((n, x) => n + (x.profitMinor ?? 0), 0) || 1; // hardcode-ok: avoids a divide by zero
  const chName = (key: string) => {
    const v = t(d, `moneyProfitChannels.channel.${key}`);
    return v.startsWith('moneyProfitChannels.') ? key : v;
  };
  const chBest = [...chRows].sort((a, b) => (b.profitMinor ?? 0) - (a.profitMinor ?? 0))[0];
  const chWorst = [...chRows].filter((x) => channelMarginPct(x) !== null).sort((a, b) => (channelMarginPct(a) ?? 0) - (channelMarginPct(b) ?? 0))[0];

  return (
    <div className="a2-z" data-testid="money-profit" data-lm-ready="" data-from={q.from} data-to={q.to}>
      {/* The prototype shows no Profit by group / channel sub-tabs: they live under "More" (this page only). */}
      {!more ? <style>{'nav[data-testid="a2-subtabs"]{display:none}'}</style> : null}
      <PageHead view={view} place={locateKey(KEY)} title={c('title')}
        sub={t(d, 'lf.fp.sub')}
        right={
          <>
            <div className="pl-seg" role="group" aria-label={t(d, 'lf.fp.seg.month')} data-testid="pl-seg">
              {segs.map((k) => (
                <Link key={k} href={`${HERE}?period=${k}`} className={mine === k ? 'on' : ''} aria-current={mine === k ? 'true' : undefined} data-testid={`pl-seg-${k}`}>
                  {t(d, `lf.fp.seg.${k}`)}
                </Link>
              ))}
            </div>
            <Link className="a2-btn" href="/admin/money/month-end" data-testid="pl-cs">
              {t(d, 'lf.mn.act.close')}
            </Link>
            <PrintButton label={t(d, 'lf.mn.act.dl')} testId="pl-dl" />
          </>
        }
      />
      <SectionTabs view={view} current={KEY} />

      <div className="pl-two">
        <section className="a2-card" aria-labelledby="pl-st" data-testid="pl-statement">
          <h2 className="a2-h3" id="pl-st">
            {t(d, 'lf.fp.st.title')}
          </h2>
          {mine === 'month' ? (
            <div className="pl-seg pl-seg-sm a2-mt6" role="group" data-testid="pl-cmp">
              <Link href={`${HERE}?period=month`} className={one(sp.cmp) === 'full' ? '' : 'on'}>
                {t(d, 'lf.fp.st.vsSame', { range: sameLabel })}
              </Link>
              <Link href={`${HERE}?period=month&cmp=full`} className={one(sp.cmp) === 'full' ? 'on' : ''}>
                {t(d, 'lf.fp.st.vsFull', { month: fullLabel })}
              </Link>
            </div>
          ) : null}
          <div className="a2-tblw a2-mt6">
            <table className="a2-tbl pl-tbl">
              <thead>
                <tr>
                  <th>{t(d, 'lf.fp.st.line')}</th>
                  <th className="w4-r">{t(d, 'lf.fp.st.this')}</th>
                  <th className="w4-r pl-hide">{t(d, 'lf.fp.st.cmp')}</th>
                  <th className="w4-r">{t(d, 'lf.fp.st.chg')}</th>
                </tr>
              </thead>
              <tbody>
                {ST.map((x) => {
                  const a = x.minor(r);
                  const b = x.minor(prev);
                  return (
                    <tr key={x.key} className={`pl-${x.kind}`} data-testid={`pl-st-${x.key}`}>
                      <td className={x.kind === 'ind' ? 'pl-ind' : ''}>{t(d, `lf.fp.st.${x.key}`)}</td>
                      <td className={`w4-r${x.kind === 'big' && (a ?? 0) < 0 ? ' w4-neg' : ''}`}>{stCell(a, x.out)}</td>
                      <td className="w4-r a2-mute pl-hide">{stCell(b, x.out)}</td>
                      <td className="w4-r">{b ? <Delta pct={deltaPct(a, b)} inverse={x.out} /> : <span className="a2-mute">—</span>}</td>
                    </tr>
                  );
                })}
                <tr data-testid="pl-st-margin">
                  <td>{t(d, 'lf.fp.st.margin')}</td>
                  <td className="w4-r">
                    <b>{marginOf(r) === null ? '—' : `${marginOf(r)}%`}</b>
                  </td>
                  <td className="w4-r a2-mute pl-hide">{marginOf(prev) === null ? '—' : `${marginOf(prev)}%`}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="a2-xs a2-mute a2-mt6">{t(d, 'lf.fp.note', { n: r.orders })}</p>
        </section>
        <div className="a2-stack">
          {r.orders > 0 ? (
            <section className="a2-card" aria-labelledby="pl-ue" data-testid="pl-ue">
              <h2 className="a2-h3" id="pl-ue">
                {t(d, 'lf.fp.ue.title')}
              </h2>
              {ue.map((x) => (
                <div key={x.key} className="a2-rule">
                  <span>{t(d, `lf.fp.ue.${x.key}`)}</span>
                  <span />
                  <b className={x.minor < 0 ? 'w4-neg' : ''}>{sm(x.minor)}</b>
                </div>
              ))}
              <div className="a2-rule" data-testid="pl-ue-profit">
                <span>
                  <b>{t(d, 'lf.fp.ue.profit')}</b>
                </span>
                <span />
                <b className={ueNet < 0 ? 'w4-neg' : 'w4-pos'}>{sm(ueNet)}</b>
              </div>
              <p className="a2-xs a2-mute a2-mt12">{t(d, 'lf.fp.ue.note', { n: r.orders })}</p>
            </section>
          ) : null}
          <section className="a2-card" aria-labelledby="pl-close" data-testid="pl-closecard">
            <h2 className="a2-h3" id="pl-close">
              {t(d, 'lf.fp.close.title')}
            </h2>
            <p className="a2-cs">{t(d, 'lf.fp.close.sub')}</p>
            {[prevMonthKey, lastMonthKey, thisMonthKey].map((mo, i) => {
              const closed = sheets[i]?.close.state === 'CLOSED';
              const word = closed ? t(d, 'lf.fp.close.closed') : mo === thisMonthKey ? t(d, 'lf.fp.close.running') : t(d, 'lf.fp.close.ready');
              return (
                <div key={mo} className="a2-rule">
                  <span>{monthName(mo)}</span>
                  <span />
                  <span className={`a2-pill ${closed ? '' : mo === thisMonthKey ? 'info' : 'warn'}`}>{word}</span>
                </div>
              );
            })}
            <Link className="a2-btn sm pri a2-mt12" href="/admin/money/books/closes">
              {t(d, 'lf.fp.close.open')}
            </Link>
          </section>
        </div>
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="pl-drill" data-testid="pl-drill">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="pl-drill">
              {t(d, 'lf.fp.drill.title')}
            </h2>
            <div className="a2-cs">{t(d, 'lf.fp.drill.sub')}</div>
          </div>
          <Link className="lf-more" href={`/admin/money/profit/groups?from=${q.from}&to=${q.to}`}>
            {t(d, 'lf.fp.drill.deeper')} →
          </Link>
        </div>
        {chRows.length ? (
          <>
            <p className="a2-xs a2-mute">{t(d, 'lf.fp.drill.all')}</p>
            {chBest && chWorst && chRows.length > 1 ? (
              <p className="a2-sm">{t(d, 'lf.fp.drill.insight', { best: chName(chBest.key), pct: Math.round(((chBest.profitMinor ?? 0) / chTotal) * 100), worst: chName(chWorst.key), m: channelMarginPct(chWorst) ?? 0 })}</p>
            ) : null}
            <div className="a2-tblw">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{t(d, 'lf.fp.drill.channel')}</th>
                    <th className="w4-r pl-hide">{t(d, 'lf.fp.drill.orders')}</th>
                    <th className="w4-r">{t(d, 'lf.fp.drill.sales')}</th>
                    <th className="w4-r">{t(d, 'lf.fp.drill.profit')}</th>
                    <th className="w4-r pl-hide">{t(d, 'lf.fp.drill.margin')}</th>
                    <th className="pl-hide">{t(d, 'lf.fp.drill.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {chRows.map((x) => {
                    const share = Math.max(0, Math.round(((x.profitMinor ?? 0) / chTotal) * 100));
                    return (
                      <tr key={x.key}>
                        <td>
                          <Link href={`/admin/money/profit/channels?from=${q.from}&to=${q.to}`}>{chName(x.key)}</Link>
                        </td>
                        <td className="w4-r pl-hide">{x.orders}</td>
                        <td className="w4-r">{m(x.salesMinor)}</td>
                        <td className="w4-r">
                          <b>{x.profitMinor === null ? '—' : m(x.profitMinor)}</b>
                        </td>
                        <td className="w4-r pl-hide">{channelMarginPct(x) === null ? '—' : `${channelMarginPct(x)}%`}</td>
                        <td className="pl-hide">
                          <span className="pl-bar">
                            <i style={{ width: `${Math.min(100, share)}%` }} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="a2-xs a2-mute">{t(d, 'lf.fp.drill.empty')}</p>
        )}
      </section>

      {!more ? (
        <p className="a2-mt12">
          <Link className="lf-more" href={`${HERE}?period=${mine ?? 'month'}&more=1`} data-testid="pl-more">
            {t(d, 'lf.fp.moreLink')} →
          </Link>
        </p>
      ) : (
        <>

      <nav className="ct-actions a2-mt12" aria-label={cr('quick.label')} data-testid="pl-quick">
        {QUICK_PERIODS.map((p) => (
          <Link key={p} className={`a2-btn${current === p ? ' pri' : ''}`} href={`${HERE}?period=${p}`} aria-current={current === p ? 'true' : undefined} data-testid={`pl-quick-${p}`}>
            {cr(`quick.${p}`)}
          </Link>
        ))}
      </nav>

      <form className="a2-card a2-mt12" action={HERE} method="get" aria-label={cr('form.label')} data-testid="pl-form">
        <div className="ct-grid">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="pl-from">
              {cr('form.from')}
            </label>
            <input id="pl-from" name="from" type="date" className="a2-inp" max={today} defaultValue={q.from} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="pl-to">
              {cr('form.to')}
            </label>
            <input id="pl-to" name="to" type="date" className="a2-inp" max={today} defaultValue={q.to} />
          </div>
        </div>
        <div className="ct-actions a2-mt12">
          <button type="submit" className="a2-btn pri" data-testid="pl-show">
            {cr('form.show')}
          </button>
          <a className="a2-btn" href={`/api/admin/money/profit?from=${q.from}&to=${q.to}`} download data-testid="pl-export">
            {c('export')}
          </a>
          {/* S16 · PR 504: the same period by category or by style */}
          <Link className="a2-btn" href={`/admin/money/profit/groups?from=${q.from}&to=${q.to}`} data-testid="pl-groups">
            {c('groups')}
          </Link>
          {/* S16 · PR 355: the same period by channel (ad spend per platform against its Sales) */}
          <Link className="a2-btn" href={`/admin/money/profit/channels?from=${q.from}&to=${q.to}`} data-testid="pl-channels">
            {c('channels')}
          </Link>
        </div>
        {notes
          .filter((n) => n !== 'byMonth')
          .map((n) => (
            <p key={n} className="a2-xs bk-warn a2-mt12" data-testid={`pl-note-${n}`}>
              {t(d, `moneyCostReport.note.${n}`, { days: limits.maxDays, rows: limits.maxDayRows })}
            </p>
          ))}
      </form>

      <p className="a2-xs a2-mute a2-mt12">{c('period', { from: dayText(q.from), to: dayText(q.to) })}</p>
      <div className="a2-kpis k3 a2-mt12" data-testid="pl-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="a2-kpi" data-testid={`pl-kpi-${k.key}`}>
            <span className="a2-xs a2-mute">{c(`kpi.${k.key}`)}</span>
            <b className="a2-kv">{k.value}</b>
            {k.sub ? <span className="a2-xs a2-mute">{k.sub}</span> : null}
          </div>
        ))}
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="pl-lines" data-testid="pl-lines">
        <h2 className="a2-h3" id="pl-lines">
          {c('lines.title')}
        </h2>
        <p className="a2-cs">{c('lines.sub')}</p>
        {lines.map((l) => (
          <div key={l.key} className="a2-rule" data-testid={`pl-line-${l.key}`}>
            <span>
              {l.sign === '=' ? <b>{c(`lines.${l.key}`)}</b> : c(`lines.${l.key}`)}
              {l.how ? <span className="a2-xs a2-mute cl-sub">{l.how}</span> : null}
            </span>
            <span />
            <b>{l.minor === null ? '—' : l.sign === '=' ? m(l.minor) : `${l.sign} ${m(l.minor)}`}</b>
          </div>
        ))}
        {vat ? (
          <div className="a2-rule" data-testid="pl-line-vat">
            <span>
              {c('vat.label')}
              <span className="a2-xs a2-mute cl-sub">
                {c('vat.how', { goods: m(vat.goodsVatMinor), delivery: vat.deliveryVatMinor === null ? c('vat.off') : m(vat.deliveryVatMinor), noRate: m(vat.unratedMinor) })}
              </span>
            </span>
            <span />
            <b>{m(vat.totalVatMinor)}</b>
          </div>
        ) : null}
        {vat ? (
          <div className="ct-actions">
            <Link className="a2-btn" href={`/admin/money/vat?from=${q.from}&to=${q.to}#vr-title`} data-testid="pl-vat-open">
              {c('vat.open')}
            </Link>
          </div>
        ) : null}
        {r.uncosted.orders ? (
          <p className="a2-xs bk-warn a2-mt12" data-testid="pl-uncosted">
            {c('uncosted', { n: r.uncosted.orders, amount: m(r.uncosted.salesMinor), skus: r.uncosted.skus.join(', ') })}
          </p>
        ) : null}
        {PNL_MAYBE_MISSING.filter((k) => r.missing[k] > 0).map((k) => (
          <p key={k} className="a2-xs bk-warn" data-testid={`pl-missing-${k}`}>
            {c(`missing.${k}`, { n: r.missing[k] })}
          </p>
        ))}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="pl-days" data-testid="pl-days">
        <h2 className="a2-h3" id="pl-days">
          {c('byDay.title')}
        </h2>
        <p className="a2-cs">{c('byDay.sub')}</p>
        {dayListCut ? <p className="a2-xs a2-mute">{c('byDay.cut', { n: limits.maxDayRows })}</p> : null}
        {r.byDay.length ? (
          r.byDay.slice(0, limits.maxDayRows).map((x) => (
            <div key={x.day} className="a2-rule" data-testid="pl-day">
              <span>
                <b>{dayText(x.day)}</b>
                <span className="a2-xs a2-mute cl-sub">{c('byDay.line', { n: x.orders, gross: m(x.grossProfitMinor) })}</span>
              </span>
              <span className="a2-xs a2-mute">{m(x.salesMinor)}</span>
              <b>{m(x.contributionMinor)}</b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('byDay.none')}</p>
        )}
      </section>

      {/* S16 · PR 351: the money report to the owner — how often, when, in which language; its next day and its words. */}
      <MoneyReportCard key={report.version} dict={d} view={report} canEdit={access.guard.permissions?.has('books.report') ?? false} nextDayText={report.nextDay ? dayText(report.nextDay) : null} />
        </>
      )}
    </div>
  );
}
