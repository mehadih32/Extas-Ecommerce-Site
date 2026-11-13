// S28 · PR 700 — Website → Analytics → Overview at /admin/website/analytics: visitors, sessions, page views, orders, visit
// to order, live now, the daily chart, sources, pages, devices and regions from the shop's own first-party page views.
// Needs `reports.read`; the settings need `settings.write` and the owner's PIN. Guide: docs/admin-guide/pages/website/analytics.md.
// Words: messages/admin-website-analytics.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { VisitorsScreen } from '@/components/admin/analytics/VisitorsScreen';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
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

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, webAnalytics: ((view.lang === 'bn' ? bn : en).webAnalytics as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'webAnalytics.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function WebsiteAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
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
  const span = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30; // hardcode-ok: the range buttons' choices and their default
  const [v, canEdit] = await Promise.all([visitorsView(d, MOTHER_STORE_ID, span), can()]);
  return (
    <div className="a2-z" data-testid="web-analytics-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'webAnalytics.title')} sub={t(view.dict, 'webAnalytics.sub')} />
      <VisitorsScreen dict={view.dict} view={v} canEdit={canEdit} canBehaviour={false} span={span} />
    </div>
  );
}
