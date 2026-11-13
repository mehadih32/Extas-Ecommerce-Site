// S28 · PR 705 — Settings → People at /admin/settings/people: the staff list with roles, status and 2-step login; add, suspend,
// archive, give or take a role. Seeing it needs `staff.read`; changing needs `staff.manage` (the routes check it again).
// Guide: docs/admin-guide/pages/settings/people.md. Words: messages/admin-people.*.json (people).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PeopleScreen } from '@/components/admin/people/PeopleScreen';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import { peopleView } from '@/lib/people';
import bn from '../../../../../messages/admin-people.bn.json';
import en from '../../../../../messages/admin-people.en.json';
import '../../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/settings/people';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, people: ((view.lang === 'bn' ? bn : en).people as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'people.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function PeoplePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('staff.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="people" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="people-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="staff.read" />
      </div>
    );
  const d = access.deps;
  const can = async () => {
    try {
      await requirePermission(d.db, access.guard.actor, 'staff.manage', { storeId: MOTHER_STORE_ID });
      return true;
    } catch {
      return false;
    }
  };
  const [v, canManage] = await Promise.all([peopleView(d.db, access.guard.actor), can()]);
  return (
    <div className="a2-z" data-testid="people-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'people.title')} sub={t(view.dict, 'people.sub')} />
      <PeopleScreen dict={view.dict} lang={view.lang === 'bn' ? 'bn' : 'en'} view={v} canManage={canManage} me={access.guard.actor.staffUserId} />
    </div>
  );
}
