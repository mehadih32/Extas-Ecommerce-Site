// S28 · PR 705 — Settings → Roles at /admin/settings/roles: every role with its permission tree (tri-state boxes), save, new role,
// archive or restore. Seeing it needs `roles.read`; changing needs `roles.manage` (the routes check it again).
// Guide: docs/admin-guide/pages/settings/roles.md. Words: messages/admin-people.*.json (people.roles).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { RolesScreen } from '@/components/admin/people/RolesScreen';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import { rolesView } from '@/lib/people';
import bn from '../../../../../messages/admin-people.bn.json';
import en from '../../../../../messages/admin-people.en.json';
import '../../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/settings/roles';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, people: ((view.lang === 'bn' ? bn : en).people as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'people.roles.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function RolesPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('roles.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="roles" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="roles-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="roles.read" />
      </div>
    );
  const d = access.deps;
  const can = async () => {
    try {
      await requirePermission(d.db, access.guard.actor, 'roles.manage', { storeId: MOTHER_STORE_ID });
      return true;
    } catch {
      return false;
    }
  };
  const [v, canManage] = await Promise.all([rolesView(d.db, access.guard.actor), can()]);
  return (
    <div className="a2-z" data-testid="roles-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'people.roles.title')} sub={t(view.dict, 'people.roles.sub')} />
      <RolesScreen dict={view.dict} lang={view.lang === 'bn' ? 'bn' : 'en'} view={v} canManage={canManage} />
    </div>
  );
}
