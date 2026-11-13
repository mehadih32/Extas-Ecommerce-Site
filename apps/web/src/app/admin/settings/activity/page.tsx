// S28 · PR 705 — Settings → Activity log at /admin/settings/activity: who changed what and who looked at customer details, with filters
// and a CSV download. Read-only. Needs `audit.read`. Guide: docs/admin-guide/pages/settings/activity.md.
// Words: messages/admin-people.*.json (people.activity).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ActivityScreen } from '@/components/admin/people/ActivityScreen';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { activityView, filtersOf } from '@/lib/activity-log';
import { t, type Dict } from '@/lib/i18n';

import bn from '../../../../../messages/admin-people.bn.json';
import en from '../../../../../messages/admin-people.en.json';
import '../../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/settings/activity';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, people: ((view.lang === 'bn' ? bn : en).people as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'people.activity.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('audit.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="activity" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="activity-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="audit.read" />
      </div>
    );
  const d = access.deps;
  const tz = await d.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID });
  const v = await activityView(d, access.guard.actor, MOTHER_STORE_ID, filtersOf(sp), tz);
  return (
    <div className="a2-z" data-testid="activity-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'people.activity.title')} sub={t(view.dict, 'people.activity.sub')} />
      <ActivityScreen dict={view.dict} view={v} tz={tz} />
    </div>
  );
}
