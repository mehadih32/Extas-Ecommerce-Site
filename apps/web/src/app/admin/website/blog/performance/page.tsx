// S12 · PR 250 (register "Content performance report: which articles bring traffic and which bring orders"; Blueprint
// C11 the blog as the traffic engine) — Website › Blog & journal › Performance at /admin/website/blog/performance: over
// the last `blog.performance.days` shop days (or ?days=7/30/90), each article's readers by where they came from and the
// orders placed by a browser that read it — Ordered value beside Sales (delivered orders only), both through
// @extas/metrics (lib/journal/performance.ts) — and the card `blog.performance` (counting off as it ships).
// Seeing needs `blog.read`; the amounts `reports.read` (without it, order counts); the card `blog.publish`.
// Read-only report. Guide: docs/admin-guide/pages/website/blog-performance.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { BLOG_CREDIT_RULES } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { performanceReport, withoutMoney } from '@/lib/journal/performance';
import { PERIOD_CHOICES } from '@/lib/journal/performance-model';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import '../../../settings-cards.css';
import '../blog.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/performance';
const KEY = 'blogPerformance';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.perf.meta'), robots: { index: false, follow: false } };
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="blog-performance" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `jr.${k}`, vars);
  const l = (k: string, vars?: Record<string, string | number>) => s(`perf.${k}`, vars);
  const canPublish = access.guard.permissions?.has('blog.publish') ?? false;
  const canMoney = access.guard.permissions?.has('reports.read') ?? false;
  const asked = typeof sp.days === 'string' ? Number(sp.days) : null;
  const [full, currency] = await Promise.all([
    performanceReport(access.deps.db, access.deps.resolver, new Date(), { days: asked }),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }),
  ]);
  const r = canMoney ? full : withoutMoney(full);
  const set = r.card.value;
  const num = (n: number) => formatNumber(n, view.locale);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const pctOf = (part: number, whole: number) => (whole > 0 ? `${formatNumber(Math.round((part * 1000) / whole) / 10, view.locale)}%` : null);
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const periods = [...new Set([...PERIOD_CHOICES, set.days])].sort((a, b) => a - b);
  const texts: FieldsCardTexts = {
    h: l('card.h'),
    d: l('card.d'),
    save: s('card.save'),
    saving: s('card.saving'),
    saved: s('card.saved'),
    discard: s('card.discard'),
    unsaved: s('card.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: s('card.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)])),
  };
  const fa = r.fromArticles;
  const orderedShare = pctOf(fa.ordered.valueMinor, r.shop.ordered.valueMinor);
  const kpis: [string, string, string][] = [
    ['kReaders', num(r.totals.readers), l('kReadersS', { n: num(r.totals.fromSearch) })],
    ['kOrders', num(fa.ordered.orders), l('kOrdersS', { n: num(r.shop.ordered.orders) })],
    canMoney ? ['kOrdered', m(fa.ordered.valueMinor), orderedShare ? l('kOrderedS', { pct: orderedShare }) : l('noShare')] : null,
    canMoney ? ['kSales', m(fa.sales.valueMinor), l('kSalesS', { n: num(fa.sales.orders) })] : ['kSalesC', num(fa.sales.orders), l('kSalesCS')],
  ].filter((k): k is [string, string, string] => k !== null);
  const crumb = (
    <Link className="bd-crumb" href="/admin/website/blog">
      {s('e.back')}
    </Link>
  );

  return (
    <div className="a2-z" data-testid="blog-performance" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={l('title')} sub={l('sub')} />
      <SectionTabs view={view} current={KEY} />
      <nav className="pf-periods a2-mt12" aria-label={l('periodLabel')} data-testid="pf-periods">
        {periods.map((n) => (
          <Link key={n} className={`a2-btn${n === r.days ? ' pri' : ''}`} href={`${HERE}?days=${n}`} aria-current={n === r.days ? 'page' : undefined}>
            {l('days', { n: num(n) })}
          </Link>
        ))}
      </nav>
      <p className="a2-xs a2-mute a2-mt12" data-testid="pf-span">
        {l('span', { from: dayText(r.from), to: dayText(r.to), days: num(r.days), tz: r.timeZone })}
      </p>
      {set.count ? null : (
        <p className="a2-card a2-sc a2-sm a2-mt12" role="note" data-testid="pf-off">
          {l('off')}
        </p>
      )}
      <div className="pl-kpis a2-mt12" data-testid="pf-kpis">
        {kpis.map(([k, v, sub]) => (
          <div key={k} className="a2-card pl-k" data-testid={`pf-${k}`}>
            <div className="pl-v">{v}</div>
            <div className="a2-sm">{l(k)}</div>
            <div className="a2-xs a2-mute cal-sub">{sub}</div>
          </div>
        ))}
      </div>
      <div className="jr-grid a2-mt12">
        <div className="jr-stack">
          <section className="a2-card a2-sc" aria-labelledby="pf-list" data-testid="pf-list">
            <h2 className="a2-h3" id="pf-list">
              {l('list')}
            </h2>
            <p className="a2-sm a2-mute">{l('listSub')}</p>
            {r.rows.length ? (
              <div className="a2-tblw a2-mt12">
                <table className="a2-tbl" data-testid="pf-rows">
                  <thead>
                    <tr>
                      <th>{l('col.article')}</th>
                      <th className="r a2-num">{l('col.readers')}</th>
                      <th className="r a2-num">{l('col.search')}</th>
                      <th className="r a2-num">{l('col.shop')}</th>
                      <th className="r a2-num">{l('col.other')}</th>
                      <th className="r a2-num">{l('col.orders')}</th>
                      {canMoney ? <th className="r a2-num">{l('col.ordered')}</th> : null}
                      <th className="r a2-num">{canMoney ? l('col.sales') : l('col.sold')}</th>
                      <th className="r a2-num">{l('col.per100')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((x) => (
                      <tr key={x.id} data-id={x.id}>
                        <td className="pf-art">
                          <Link className="pf-title" href={`/admin/website/blog/${x.id}`} lang={x.locale}>
                            {x.title}
                          </Link>
                          <span className="a2-pill">{s(`lang.${x.locale}`)}</span>
                          {x.live ? null : <span className="a2-pill">{l('notLive')}</span>}
                          {x.readers > 0 && x.ordered.orders === 0 ? <span className="a2-pill warn">{l('noOrders')}</span> : null}
                        </td>
                        <td className="r a2-num">{num(x.readers)}</td>
                        <td className="r a2-num">{num(x.fromSearch)}</td>
                        <td className="r a2-num">{num(x.fromShop)}</td>
                        <td className="r a2-num">{num(x.fromOther)}</td>
                        <td className="r a2-num">{num(x.ordered.orders)}</td>
                        {canMoney ? <td className="r a2-num">{m(x.ordered.valueMinor)}</td> : null}
                        <td className="r a2-num">{canMoney ? m(x.sales.valueMinor) : num(x.sales.orders)}</td>
                        <td className="r a2-num">{x.perHundred === null ? '—' : num(x.perHundred)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="a2-sm a2-mt12" data-testid="pf-none">
                {l('none')}
              </p>
            )}
            <p className="a2-xs a2-mute a2-mt12">{l('rules', { w: num(set.windowDays) })}</p>
            <p className="a2-xs a2-mute">{l(set.credit === 'every' ? 'creditEvery' : 'creditLast')}</p>
            {canMoney ? null : <p className="a2-xs a2-mute">{l('noMoney')}</p>}
          </section>
        </div>
        <div className="jr-stack">
          <FieldsCard
            url="/api/admin/blog/performance"
            screen={{ key: r.card.key, value: set, version: r.card.version }}
            fields={[
              { kind: 'switch', path: 'count', label: l('card.count'), help: l('card.countHelp') },
              { kind: 'number', path: 'windowDays', label: l('card.windowDays'), min: 1, max: 90 },
              { kind: 'select', path: 'credit', label: l('card.credit'), options: BLOG_CREDIT_RULES.map((v) => ({ value: v, label: l(v === 'last' ? 'card.creditLast' : 'card.creditEvery') })) },
              { kind: 'number', path: 'days', label: l('card.days'), min: 1, max: 365 },
            ]}
            texts={texts}
            canEdit={canPublish}
            testId="pf-settings"
          />
          <section className="a2-card a2-sc" aria-labelledby="pf-how">
            <h2 className="a2-h3" id="pf-how">
              {l('how')}
            </h2>
            <ol className="pl-how a2-sm">
              {['how1', 'how2', 'how3', 'how4'].map((k) => (
                <li key={k}>{l(k)}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
