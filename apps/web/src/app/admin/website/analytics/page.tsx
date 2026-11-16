// S28 · PR 700 — Website → Analytics → Overview at /admin/website/analytics: visitors, sessions, page views, orders, visit
// to order, live now, the daily chart, sources, pages, devices and regions from the shop's own first-party page views.
// Needs `reports.read`; the settings need `settings.write` and the owner's PIN. Guide: docs/admin-guide/pages/website/analytics.md.
// Words: messages/admin-website-analytics.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AnalyticsSub } from '@/components/admin/analytics/AnalyticsSub';
import { VisitorsScreen } from '@/components/admin/analytics/VisitorsScreen';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { locateKey } from '@/lib/admin-shell/sections';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { visitorsView } from '@/lib/analytics/visitors';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-website-analytics.bn.json';
import en from '../../../../../messages/admin-website-analytics.en.json';
import '../../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/website/analytics';
const KEY = 'websiteAnalytics';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, webAnalytics: ((view.lang === 'bn' ? bn : en).webAnalytics as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'webAnalytics.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function WebsiteAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string; range?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="websiteAnalytics" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="web-analytics-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const d = access.deps;
  const can = async () => {
    try {
      await requirePermission(d.db, access.guard.actor, 'settings.write', { storeId: MOTHER_STORE_ID });
      return true;
    } catch {
      return false;
    }
  };
  // PR 912 (prototype Analytics): Today, 7 days, 30 days, This month, Last month (the old ?days=7|30|90 still works)
  const tz = String(await d.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID }));
  const todayYmd = ymdIn(new Date(), tz);
  const range = ['today', '7d', '30d', 'month', 'last'].includes(sp.range ?? '') ? (sp.range as string) : [7, 90].includes(Number(sp.days)) ? `${Number(sp.days)}d` : '30d'; // hardcode-ok: the range buttons' choices and their default
  const dayNo = Number(todayYmd.slice(8, 10));
  const lastEnd = new Date(Date.UTC(Number(todayYmd.slice(0, 4)), Number(todayYmd.slice(5, 7)) - 1, 0));
  const lastEndYmd = lastEnd.toISOString().slice(0, 10);
  const span = range === 'today' ? 1 : range === 'month' ? dayNo : range === 'last' ? lastEnd.getUTCDate() : Number.parseInt(range, 10); // hardcode-ok: the range buttons' lengths
  const [v, canEdit] = await Promise.all([visitorsView(d, MOTHER_STORE_ID, span, range === 'last' ? lastEndYmd : null), can()]);
  return (
    <div className="a2-z" data-testid="web-analytics-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'webAnalytics.title')} sub={t(view.dict, 'webAnalytics.sub')} right={<a className="a2-btn" download="visitors.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(['day,visitors,views', ...v.days.map((x) => `${x.day},${x.visitors},${x.views}`)].join('\n'))}`} data-testid="va-export">{t(view.dict, 'webAnalytics.export')}</a>} />
      <SectionTabs view={view} current={KEY} />
      <AnalyticsSub dict={view.dict} current="overview" />
      <VisitorsScreen dict={view.dict} view={v} canEdit={canEdit} canBehaviour span={span} range={range} locale={view.locale} />
    </div>
  );
}
