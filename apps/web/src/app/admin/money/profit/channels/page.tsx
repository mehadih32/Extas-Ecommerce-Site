// S16 · PR 355 — Money → Profit & loss → Profit by channel at /admin/money/profit/channels (B3.10 Locked): for any period
// (one-press or from/to, `costs.report`), the ad spend of Meta, Google, YouTube and TikTok set against the Sales
// attributed to each, against organic and every other channel — delivered Sales, the goods that came back, the
// contribution, the parcels that came back and the return rate, profit after ads and its margin — and the CSV. The UTM
// words sit under "More options" (`reports.channels`). Seeing needs `books.read`. Read-only: nothing changes a budget or
// a campaign. The figure is lib/channel-profit-view.ts. Words: messages/admin-profit-channels.*.json.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { ChannelRow } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ChannelRulesCard } from '@/components/admin/money/ChannelRulesCard';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { channelMarginPct, channelProfitView } from '@/lib/channel-profit-view';
import { QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-profit-channels.bn.json';
import en from '../../../../../../messages/admin-profit-channels.en.json';
import reportBn from '../../../../../../messages/admin-cost-report.bn.json';
import reportEn from '../../../../../../messages/admin-cost-report.en.json';
import '../../../settings-cards.css';
import '../../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyProfitChannels';
const HERE = '/admin/money/profit/channels';

function withScreen(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, moneyProfitChannels: (b ? bn : en).moneyProfitChannels as unknown as Dict, moneyCostReport: (b ? reportBn : reportEn).moneyCostReport as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyProfitChannels.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ProfitChannelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyProfitChannels.${k}`, vars);
  const cr = (k: string) => t(d, `moneyCostReport.${k}`);
  const at = { storeId: MOTHER_STORE_ID };
  const [currency, limits] = await Promise.all([access.deps.resolver.value('store.currency', at), access.deps.resolver.value('costs.report', at)]);
  const canEdit = access.guard.permissions?.has('costs.write') ?? false;
  const v = await channelProfitView(access.deps, MOTHER_STORE_ID, sp, limits);
  const { q, notes } = v.period;
  const money = moneyOf(currency, view.locale);
  const m = (minor: number | null) => (minor === null ? '—' : formatMoney(minor, money));
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const current =
    QUICK_PERIODS.find((p) => p === sp.period) ??
    QUICK_PERIODS.find((p) => {
      const x = quickPeriod(p, v.today);
      return x.from === q.from && x.to === q.to;
    });
  const name = (x: ChannelRow) => {
    const k = `moneyProfitChannels.channel.${x.key}`;
    const w = t(d, k);
    return w === k ? x.key.replace(/^source:/, '') : w;
  };
  // no costed order at all: no profit figure to show (never 0)
  const profitText = (x: ChannelRow) => (x.costedSalesMinor === 0 && x.uncostedSalesMinor > 0 ? '—' : m(x.profitMinor));
  const r = v.report;
  const adsRows = r.rows.filter((x) => x.kind === 'ads');
  const adsSales = adsRows.reduce((s, x) => s + x.salesMinor, 0);
  const kpis = [
    { key: 'spend', value: r.adsImported ? m(r.adSpendMinor) : m(0), sub: r.adsImported ? undefined : c('kpi.spendNone') },
    { key: 'adsSales', value: m(adsSales), sub: r.total.salesMinor > 0 ? c('kpi.share', { pct: Math.round((adsSales * 1000) / r.total.salesMinor) / 10 }) : undefined },
    { key: 'sales', value: m(r.total.salesMinor), sub: c('kpi.orders', { n: r.total.orders }) },
    { key: 'profit', value: profitText(r.total), sub: r.total.profitMinor === null && r.total.costedSalesMinor > 0 ? c('kpi.spendUnknown') : undefined },
  ];

  return (
    <div className="a2-z" data-testid="profit-channels" data-from={q.from} data-to={q.to}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="ct-actions a2-mt12" aria-label={cr('quick.label')} data-testid="pc-quick">
        {QUICK_PERIODS.map((p) => (
          <Link key={p} className={`a2-btn${current === p ? ' pri' : ''}`} href={`${HERE}?period=${p}`} aria-current={current === p ? 'true' : undefined} data-testid={`pc-quick-${p}`}>
            {cr(`quick.${p}`)}
          </Link>
        ))}
      </nav>

      <form className="a2-card a2-mt12" action={HERE} method="get" aria-label={cr('form.label')} data-testid="pc-form">
        <div className="ct-grid">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="pc-from">
              {cr('form.from')}
            </label>
            <input id="pc-from" name="from" type="date" className="a2-inp" max={v.today} defaultValue={q.from} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="pc-to">
              {cr('form.to')}
            </label>
            <input id="pc-to" name="to" type="date" className="a2-inp" max={v.today} defaultValue={q.to} />
          </div>
        </div>
        <div className="ct-actions a2-mt12">
          <button type="submit" className="a2-btn pri" data-testid="pc-show">
            {cr('form.show')}
          </button>
          <a className="a2-btn" href={`/api/admin/money/profit/channels?from=${q.from}&to=${q.to}`} download data-testid="pc-export">
            {c('export')}
          </a>
        </div>
        {notes
          .filter((n) => n !== 'byMonth')
          .map((n) => (
            <p key={n} className="a2-xs bk-warn a2-mt12" data-testid={`pc-note-${n}`}>
              {t(d, `moneyCostReport.note.${n}`, { days: limits.maxDays, rows: limits.maxDayRows })}
            </p>
          ))}
      </form>

      <p className="a2-xs a2-mute a2-mt12">{c('period', { from: dayText(q.from), to: dayText(q.to) })}</p>
      <div className="a2-kpis a2-mt12" data-testid="pc-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="a2-kpi" data-testid={`pc-kpi-${k.key}`}>
            <span className="a2-xs a2-mute">{c(`kpi.${k.key}`)}</span>
            <b className="a2-kv">{k.value}</b>
            {k.sub ? <span className="a2-xs a2-mute">{k.sub}</span> : null}
          </div>
        ))}
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="pc-table" data-testid="pc-table">
        <h2 className="a2-h3" id="pc-table">
          {c('table.title')}
        </h2>
        <p className="a2-cs">{c('table.sub')}</p>
        {r.rows.length ? null : <p className="a2-xs a2-mute">{c('table.empty')}</p>}
        {r.rows.map((x) => {
          const pct = channelMarginPct(x);
          return (
            <div key={x.key} className="a2-rule" data-testid="pc-row" data-key={x.key}>
              <span>
                <b>{name(x)}</b>
                <span className="a2-xs a2-mute cl-sub">{c('table.line', { orders: x.orders, sales: m(x.salesMinor), returns: m(x.returnsMinor), contribution: m(x.contributionMinor) })}</span>
                {x.kind === 'ads' ? <span className="a2-xs a2-mute cl-sub">{c('table.spend', { spend: m(x.adSpendMinor) })}</span> : null}
                {x.returnRatePct !== null ? <span className="a2-xs a2-mute cl-sub">{c('table.returned', { n: x.returnedOrders, pct: x.returnRatePct })}</span> : null}
                {x.uncostedSalesMinor ? <span className="a2-xs bk-warn cl-sub">{c('table.noCost', { amount: m(x.uncostedSalesMinor) })}</span> : null}
                {x.missingOrders ? <span className="a2-xs bk-warn cl-sub">{c('table.missing', { n: x.missingOrders })}</span> : null}
                {x.kind === 'ads' && x.adSpendMinor === null ? <span className="a2-xs bk-warn cl-sub">{c('table.spendUnknown')}</span> : null}
              </span>
              <span className={`a2-xs${(x.profitMinor ?? 0) < 0 ? ' bk-warn' : ' a2-mute'}`}>{pct === null ? '—' : `${pct}%`}</span>
              <b>{profitText(x)}</b>
            </div>
          );
        })}
        {r.rows.length ? (
          <div className="a2-rule" data-testid="pc-total">
            <span>
              <b>{c('table.total')}</b>
              <span className="a2-xs a2-mute cl-sub">{c('table.line', { orders: r.total.orders, sales: m(r.total.salesMinor), returns: m(r.total.returnsMinor), contribution: m(r.total.contributionMinor) })}</span>
            </span>
            <span className="a2-xs a2-mute">{channelMarginPct(r.total) === null ? '—' : `${channelMarginPct(r.total)}%`}</span>
            <b>{profitText(r.total)}</b>
          </div>
        ) : null}
      </section>

      <ChannelRulesCard dict={d} rules={v.rules.value} version={v.rules.version} canEdit={canEdit} />
    </div>
  );
}
