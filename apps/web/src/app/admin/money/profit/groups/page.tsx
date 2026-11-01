// S16 · PR 504 — Money → Profit & loss → Profit by group at /admin/money/profit/groups (B3.10 V2, §59 answer 21): for any
// period (one-press or from/to, `costs.report`), by category or by style group, each group with everything under it —
// Sales, gross profit, the order costs and the ad-spend share, profit and margin — the Sales with no cost yet named, and
// the CSV. Seeing needs `books.read`. Read-only. The figure is lib/group-profit-view.ts. Words:
// messages/admin-profit-groups.*.json.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { PROFIT_GROUP_BY, type GroupProfitRow } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { groupProfitView, marginPct } from '@/lib/group-profit-view';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-profit-groups.bn.json';
import en from '../../../../../../messages/admin-profit-groups.en.json';
import reportBn from '../../../../../../messages/admin-cost-report.bn.json';
import reportEn from '../../../../../../messages/admin-cost-report.en.json';
import '../../../settings-cards.css';
import '../../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyProfitGroups';
const HERE = '/admin/money/profit/groups';

function withScreen(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, moneyProfitGroups: (b ? bn : en).moneyProfitGroups as unknown as Dict, moneyCostReport: (b ? reportBn : reportEn).moneyCostReport as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyProfitGroups.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ProfitGroupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyProfitGroups.${k}`, vars);
  const cr = (k: string) => t(d, `moneyCostReport.${k}`);
  const at = { storeId: MOTHER_STORE_ID };
  const [currency, limits] = await Promise.all([access.deps.resolver.value('store.currency', at), access.deps.resolver.value('costs.report', at)]);
  const v = await groupProfitView(access.deps, MOTHER_STORE_ID, sp, limits);
  // Bengali names of the categories (styles have one name)
  const bnNames =
    view.lang === 'bn' && v.by === 'category'
      ? new Map((await access.deps.db.category.findMany({ where: { storeId: MOTHER_STORE_ID }, select: { id: true, nameBn: true } })).filter((x) => x.nameBn).map((x) => [x.id, x.nameBn!]))
      : new Map<string, string>();
  const nameOf = (x: GroupProfitRow) => (x.id === null ? c(v.by === 'category' ? 'table.noneCategory' : 'table.noneStyle') : (bnNames.get(x.id) ?? x.name ?? x.id));
  const { q, notes } = v.period;
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const current =
    QUICK_PERIODS.find((p) => p === sp.period) ??
    QUICK_PERIODS.find((p) => {
      const x = quickPeriod(p, v.today);
      return x.from === q.from && x.to === q.to;
    });
  // no costed line at all: no profit figure to show (never 0)
  const profitText = (x: GroupProfitRow) => (x.costedSalesMinor === 0 && x.uncostedSalesMinor > 0 ? '—' : m(x.profitMinor));
  const r = v.report;
  const total = r.total;
  const margin = marginPct(total);
  const kpis = [
    { key: 'sales', value: m(total.salesMinor) },
    { key: 'profit', value: profitText(total) },
    { key: 'margin', value: margin === null ? '—' : `${margin}%` },
    { key: 'noCost', value: m(total.uncostedSalesMinor) },
  ];
  const cut = r.rows.length > limits.maxDayRows;

  return (
    <div className="a2-z" data-testid="profit-groups" data-from={q.from} data-to={q.to} data-by={v.by}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="ct-actions a2-mt12" aria-label={c('by.label')} data-testid="pg-by">
        {PROFIT_GROUP_BY.map((b) => (
          <Link key={b} className={`a2-btn${v.by === b ? ' pri' : ''}`} href={`${HERE}?by=${b}&from=${q.from}&to=${q.to}`} aria-current={v.by === b ? 'true' : undefined} data-testid={`pg-by-${b}`}>
            {c(`by.${b}`)}
          </Link>
        ))}
      </nav>
      <nav className="ct-actions a2-mt12" aria-label={cr('quick.label')} data-testid="pg-quick">
        {QUICK_PERIODS.map((p) => (
          <Link key={p} className={`a2-btn${current === p ? ' pri' : ''}`} href={`${HERE}?by=${v.by}&period=${p}`} aria-current={current === p ? 'true' : undefined} data-testid={`pg-quick-${p}`}>
            {cr(`quick.${p}`)}
          </Link>
        ))}
      </nav>

      <form className="a2-card a2-mt12" action={HERE} method="get" aria-label={cr('form.label')} data-testid="pg-form">
        <input type="hidden" name="by" value={v.by} />
        <div className="ct-grid">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="pg-from">
              {cr('form.from')}
            </label>
            <input id="pg-from" name="from" type="date" className="a2-inp" max={v.today} defaultValue={q.from} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="pg-to">
              {cr('form.to')}
            </label>
            <input id="pg-to" name="to" type="date" className="a2-inp" max={v.today} defaultValue={q.to} />
          </div>
        </div>
        <div className="ct-actions a2-mt12">
          <button type="submit" className="a2-btn pri" data-testid="pg-show">
            {cr('form.show')}
          </button>
          <a className="a2-btn" href={`/api/admin/money/profit/groups?by=${v.by}&from=${q.from}&to=${q.to}`} download data-testid="pg-export">
            {c('export')}
          </a>
        </div>
        {notes
          .filter((n) => n !== 'byMonth')
          .map((n) => (
            <p key={n} className="a2-xs bk-warn a2-mt12" data-testid={`pg-note-${n}`}>
              {t(d, `moneyCostReport.note.${n}`, { days: limits.maxDays, rows: limits.maxDayRows })}
            </p>
          ))}
      </form>

      <p className="a2-xs a2-mute a2-mt12">{c('period', { from: dayText(q.from), to: dayText(q.to) })}</p>
      {v.adsOn ? null : (
        <p className="a2-xs bk-warn a2-mt12" data-testid="pg-ads-off">
          {c('adsOff')}
        </p>
      )}
      <div className="a2-kpis k3 a2-mt12" data-testid="pg-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="a2-kpi" data-testid={`pg-kpi-${k.key}`}>
            <span className="a2-xs a2-mute">{c(`kpi.${k.key}`)}</span>
            <b className="a2-kv">{k.value}</b>
          </div>
        ))}
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="pg-table" data-testid="pg-table">
        <h2 className="a2-h3" id="pg-table">
          {c('table.title')}
        </h2>
        <p className="a2-cs">{c('table.sub')}</p>
        {cut ? <p className="a2-xs a2-mute">{c('table.cut', { n: limits.maxDayRows })}</p> : null}
        {r.rows.length ? null : <p className="a2-xs a2-mute">{c('table.empty')}</p>}
        {r.rows.slice(0, limits.maxDayRows).map((x) => {
          const pct = marginPct(x);
          return (
            <div key={x.id ?? 'none'} className="a2-rule" data-testid="pg-row" data-depth={x.depth}>
              <span style={x.depth ? { paddingInlineStart: `${Math.min(x.depth, 4) * 16}px` } : undefined}>
                {x.depth === 0 ? <b>{nameOf(x)}</b> : nameOf(x)}
                <span className="a2-xs a2-mute cl-sub">{c('table.line', { orders: x.orders, pieces: x.pieces, gross: m(x.grossProfitMinor), ads: m(x.adsMinor) })}</span>
                {x.uncostedSalesMinor ? <span className="a2-xs bk-warn cl-sub">{c('table.noCost', { amount: m(x.uncostedSalesMinor) })}</span> : null}
                {x.missingLines ? <span className="a2-xs bk-warn cl-sub">{c('table.missing', { n: x.missingLines })}</span> : null}
              </span>
              <span className={`a2-xs${x.profitMinor < 0 ? ' bk-warn' : ' a2-mute'}`}>{pct === null ? '—' : `${pct}%`}</span>
              <b>{profitText(x)}</b>
            </div>
          );
        })}
        {r.rows.length ? (
          <div className="a2-rule" data-testid="pg-total">
            <span>
              <b>{c('table.total')}</b>
              <span className="a2-xs a2-mute cl-sub">{c('table.line', { orders: total.orders, pieces: total.pieces, gross: m(total.grossProfitMinor), ads: m(total.adsMinor) })}</span>
            </span>
            <span className="a2-xs a2-mute">{margin === null ? '—' : `${margin}%`}</span>
            <b>{profitText(total)}</b>
          </div>
        ) : null}
      </section>
    </div>
  );
}
