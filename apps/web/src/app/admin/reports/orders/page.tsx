// S05 · PR 155 follow-up 91 — Reports › Orders at /admin/reports/orders (CN-019: inside the analytics section): over 7,
// 30 or 90 days (`?days=`, default 30) the Ordered value and the Sales (CN-022's one KPI definition, @extas/metrics),
// the average order, then day by day, by delivery zone and by payment method — each row with orders placed and their
// value, orders delivered and their Sales. Read-only (lib/order-report.ts). Seeing needs `books.read` (money figures,
// as Sales by area).
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { KpiRow } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SummaryTiles } from '@/components/admin/lumen/SummaryTiles';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { figureTiles, type ReportFigure } from '@/lib/admin-lumen/figures';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { averageOf, daysOf, ORDER_REPORT_PERIODS, orderReport } from '@/lib/order-report';
import bn from '../../../../../messages/admin-order-report.bn.json';
import en from '../../../../../messages/admin-order-report.en.json';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsOrders';
const HERE = '/admin/reports/orders';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'ordRep.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function OrdersReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-lm-ready="" data-testid="orders-report">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const s = (k: string, v?: Record<string, string | number>) => t(d, `ordRep.${k}`, v);
  const at = { storeId: MOTHER_STORE_ID };
  const [currency, timeZone] = await Promise.all([access.deps.resolver.value('store.currency', at), access.deps.resolver.value('store.timeZone', at)]);
  const days = daysOf(sp.days);
  const r = await orderReport(access.deps.db, { days, timeZone });
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const avg = averageOf(r.total);
  const kpis: ReportFigure[] = [
    { id: 'ordered', label: s('kpi.ordered'), value: m(r.total.ordered.valueMinor), n: r.total.ordered.valueMinor, kind: 'money', foot: s('kpi.orderedNote', { n: n(r.total.ordered.orders) }) },
    { id: 'sales', label: s('kpi.sales'), value: m(r.total.sales.valueMinor), n: r.total.sales.valueMinor, kind: 'money', foot: s('kpi.salesNote', { n: n(r.total.sales.orders) }) },
    { id: 'avg', label: s('kpi.avg'), value: avg === null ? '—' : m(avg), n: avg, kind: 'money', foot: s('kpi.avgNote') },
  ];
  const bnLang = view.lang === 'bn';
  const zone = new Map(r.zones.map((z) => [z.key, z]));
  const zoneName = (row: KpiRow) => {
    const z = zone.get(row.key);
    return row.key ? (bnLang && z?.nameBn) || z?.nameEn || row.key : s('zone.none');
  };
  const table = (first: 'day' | 'zone' | 'method', rows: readonly KpiRow[], name: (r: KpiRow) => string, testId: string) => (
    <div className="a2-tblw">
      <table className="a2-tbl" data-testid={testId}>
        <thead>
          <tr>
            <th>{s(`col.${first}`)}</th>
            <th className="r">{s('col.placed')}</th>
            <th className="r">{s('col.ordered')}</th>
            <th className="r">{s('col.delivered')}</th>
            <th className="r">{s('col.sales')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || '-'} data-testid={`${testId}-row`}>
              <td className="a2-tdh">
                <b>{name(row)}</b>
              </td>
              <td className="r" data-l={s('col.placed')}>
                {n(row.ordered.orders)}
              </td>
              <td className="r cr-rate" data-l={s('col.ordered')}>
                {m(row.ordered.valueMinor)}
              </td>
              <td className="r" data-l={s('col.delivered')}>
                {n(row.sales.orders)}
              </td>
              <td className="r cr-rate" data-l={s('col.sales')}>
                {m(row.sales.valueMinor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const section = (id: 'day' | 'zone' | 'pay', body: ReactNode) => (
    <section className="a2-card a2-mt12" data-testid={`ord-rep-${id}`}>
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{s(`${id}.title`)}</h2>
          <div className="a2-cs">{s(`${id}.sub`)}</div>
        </div>
      </div>
      {body}
    </section>
  );

  return (
    <div className="a2-z lm-rp" data-lm-ready="" data-testid="orders-report" data-days={days}>
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />
      <nav className="a2-views a2-mt12" aria-label={s('period.label')} data-testid="ord-rep-periods">
        {ORDER_REPORT_PERIODS.map((p) => (
          <Link key={p} className={`a2-view cr-tap${p === days ? ' on' : ''}`} href={`${HERE}?days=${p}`} aria-current={p === days ? 'page' : undefined}>
            {s('period.d', { n: n(p) })}
          </Link>
        ))}
      </nav>
      <p className="a2-xs a2-mute" data-testid="report-range">
        {s('range', { from: dayText(r.from), to: dayText(r.to) })}
      </p>
      <SummaryTiles className="a2-mt12" tiles={figureTiles(kpis, { locale: view.locale, money: { kind: 'money', ...money } })} label={s('title')} testId="ord-rep-kpis" />
      {section('day', r.days.length ? table('day', r.days, (row) => dayText(row.key), 'ord-rep-days') : <p className="a2-sm a2-mute a2-mt6">{s('empty')}</p>)}
      {section('zone', r.zones.length ? table('zone', r.zones, zoneName, 'ord-rep-zones') : <p className="a2-sm a2-mute a2-mt6">{s('empty')}</p>)}
      {section('pay', r.methods.length ? table('method', r.methods, (row) => (row.key ? s(`method.${row.key}`) : s('pay.none')), 'ord-rep-methods') : <p className="a2-sm a2-mute a2-mt6">{s('empty')}</p>)}
      <p className="a2-xs a2-mute a2-mt12">{s('note')}</p>
    </div>
  );
}
