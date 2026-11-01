// S16 · PR 349 — Money → Profit & loss at /admin/money/profit (B3.10; BACKEND-ARCHITECTURE §5 MNY-01, §10.2): Sales of
// delivered orders with Ordered value beside it, gross profit, contribution, ad spend, other costs, fixed costs and net
// profit for any period (one-press periods or from/to, made safe by `costs.report`), how each line is made, the orders
// left out for a missing cost, the parts not known yet, day by day, and the CSV. Seeing it needs `books.read`. Read-only.
// PR 351: at the end, the money report to the owner (how often, when, the language; changing it needs `books.report`).
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
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { parseReportQuery, QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';
import { moneyReportView } from '@/lib/money-report-api';
import { profitReport } from '@/lib/profit-report';
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
  return { ...view, dict: { ...view.dict, moneyProfit: (b ? bn : en).moneyProfit as unknown as Dict, moneyCostReport: (b ? reportBn : reportEn).moneyCostReport as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyProfit.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ProfitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyProfit.${k}`, vars);
  const cr = (k: string) => t(d, `moneyCostReport.${k}`);
  const at = { storeId: MOTHER_STORE_ID };
  const [currency, timeZone, limits] = await Promise.all([access.deps.resolver.value('store.currency', at), access.deps.resolver.value('store.timeZone', at), access.deps.resolver.value('costs.report', at)]);
  const today = ymdIn(new Date(), timeZone);
  const { q, notes } = parseReportQuery(sp, today, limits);
  const [r, report] = await Promise.all([profitReport(access.deps, MOTHER_STORE_ID, q.from, q.to), moneyReportView(access.deps, MOTHER_STORE_ID)]);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
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
    { key: 'productCost', sign: '−', minor: r.parts.productCost, how: c('lines.productCostHow') },
    { key: 'gross', sign: '=', minor: r.grossProfitMinor },
    { key: 'deliveryCharge', sign: '+', minor: r.parts.deliveryCharge, how: c('lines.deliveryChargeHow') },
    { key: 'courier', sign: '−', minor: r.parts.courier, how: c('lines.courierHow') },
    { key: 'paymentFees', sign: '−', minor: r.parts.paymentFees, how: c('lines.paymentFeesHow') },
    { key: 'packaging', sign: '−', minor: r.parts.packaging, how: c('lines.packagingHow') },
    { key: 'messages', sign: '−', minor: r.parts.messages, how: c('lines.messagesHow') },
    { key: 'contribution', sign: '=', minor: r.contributionMinor },
    { key: 'ads', sign: '−', minor: r.adsMinor, how: r.adsMinor === null ? c('lines.adsUnknown') : r.adsImported ? c('lines.adsHow') : c('lines.adsNone') },
    { key: 'other', sign: '−', minor: r.otherCostsMinor, how: c('lines.otherHow') },
    { key: 'fixed', sign: '−', minor: r.fixedMinor ?? 0, how: r.fixedMinor === null ? c('lines.fixedNone') : c('lines.fixedHow') },
    { key: 'net', sign: '=', minor: r.netProfitMinor, how: r.netProfitMinor === null ? c('lines.netUnknown') : undefined },
  ];

  return (
    <div className="a2-z" data-testid="money-profit" data-from={q.from} data-to={q.to}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

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
    </div>
  );
}
