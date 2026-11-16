// S28 · PR 707 — Admin map at /admin/map: every page of the admin on one searchable page, made from the menu model
// (lib/admin-map.ts), one plain English and Bengali line each (messages/admin-map.*.json), tasks like "Change the
// delivery charge" that lead to the page. Opens as an overlay on the same page (PR 1066, MapOverlay) from the menu foot and the guide panel (the nav
// patch). Seeing it needs only `help.read` (everyone); it lists the pages the person may open. Guide:
// docs/admin-guide/pages/help/admin-map.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AdminMapScreen } from '@/components/admin/map/AdminMapScreen';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { buildMapScreen, withMapDict } from '@/lib/admin-map-screen';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t } from '@/lib/i18n';
import '../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/map';

const withScreen = withMapDict;

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'adminMap.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AdminMapPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('help.read', deps)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="adminMap" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="admin-map-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="help.read" />
      </div>
    );
  const screen = await buildMapScreen(view);
  return (
    <div className="a2-z" data-testid="admin-map-page" data-lm-ready="">
      <PageHead view={view} place={null} title={screen.title} sub={screen.sub} />
      <AdminMapScreen {...screen.props} />
    </div>
  );
}
