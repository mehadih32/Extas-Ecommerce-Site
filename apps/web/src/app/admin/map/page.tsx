// S28 · PR 707 — Admin map at /admin/map: every page of the admin on one searchable page, made from the menu model
// (lib/admin-map.ts), one plain English and Bengali line each (messages/admin-map.*.json), tasks like "Change the
// delivery charge" that lead to the page. Opens in its own window from the menu foot and the guide panel (the nav
// patch). Seeing it needs only `help.read` (everyone); it lists the pages the person may open. Guide:
// docs/admin-guide/pages/help/admin-map.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { authLabel } from '@extas/auth';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AdminMapScreen } from '@/components/admin/map/AdminMapScreen';
import { PageHead, ShellState, shellViewer } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { buildAdminMap } from '@/lib/admin-map';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import type { Dict } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import bn from '../../../../messages/admin-map.bn.json';
import en from '../../../../messages/admin-map.en.json';
import '../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/map';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, adminMap: ((view.lang === 'bn' ? bn : en).adminMap as unknown) as Dict } };
}

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
  const lines = ((view.lang === 'bn' ? bn : en).adminMap.lines ?? {}) as Record<string, string>;
  const viewer = await shellViewer();
  const map = buildAdminMap(viewer, lines);
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `adminMap.${k}`, vars);
  const permName = (p: string) => {
    try {
      const l = authLabel(`permissions.${p}`);
      return view.lang === 'bn' ? l.bn : l.en;
    } catch {
      return p;
    }
  };
  const groups = map.groups.map((g) => ({
    id: g.id,
    name: s(`groups.${g.id}`),
    sections: g.sections.map((sec) => ({
      id: sec.id,
      name: t(d, `shell.sec.${sec.id}`),
      href: sec.href,
      pages: sec.pages.map((p) => ({
        key: p.key,
        href: p.href,
        name: t(d, `shell.tab.${p.section}.${p.tab}`),
        line: p.line || s('noLine'),
        who: `${s('owner')}, ${permName(p.perm)}`,
        section: sec.id,
      })),
    })),
  }));
  const tasks = map.tasks.map((x) => ({ id: x.id, name: s(`taskNames.${x.id}`), where: `${t(d, `shell.sec.${x.page.section}`)} › ${t(d, `shell.tab.${x.page.section}.${x.page.tab}`)}`, href: x.page.href }));
  return (
    <div className="a2-z" data-testid="admin-map-page" data-lm-ready="">
      <PageHead view={view} place={null} title={s('title')} sub={`${s('sub')} ${s('count', { n: map.pages.length, s: groups.reduce((n, g) => n + g.sections.length, 0) })}`} />
      <AdminMapScreen groups={groups} tasks={tasks} text={{ search: s('search'), hint: s('searchHint'), noMatch: s('noMatch'), tasks: s('tasks'), pages: s('pages'), open: s('open'), who: s('who') }} />
    </div>
  );
}
