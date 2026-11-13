// S28 · PR 706 — Settings → Start fresh at /admin/settings/start-fresh: the one-time clearing of the test and sample
// business data on go-live day (preview, full backup first, the words START FRESH and the owner's PIN; owner only, off
// until switched on, runs once). Guide: docs/admin-guide/pages/settings/start-fresh.md. Words: messages/admin-start-fresh.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { StartFreshScreen } from '@/components/admin/fresh/StartFreshScreen';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import { startFreshView } from '@/lib/start-fresh';
import bn from '../../../../../messages/admin-start-fresh.bn.json';
import en from '../../../../../messages/admin-start-fresh.en.json';
import '../../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/settings/start-fresh';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, startFresh: ((view.lang === 'bn' ? bn : en).startFresh as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'startFresh.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function StartFreshPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('settings.write', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="startFresh" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="start-fresh-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="settings.write" />
      </div>
    );
  const v = await startFreshView(access.deps, access.guard.actor, MOTHER_STORE_ID);
  return (
    <div className="a2-z" data-testid="start-fresh-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'startFresh.title')} sub={t(view.dict, 'startFresh.sub')} />
      <StartFreshScreen dict={view.dict} view={v} />
    </div>
  );
}
