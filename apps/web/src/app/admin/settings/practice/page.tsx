// S28 · PR 706 (CN-049) — Settings → Practice data at /admin/settings/practice: the practice switch, "Add sample data" and
// "Reset practice data" (PIN, the words, a backup note; keeps products the owner uploaded). Owner only for the actions.
// Guide: docs/admin-guide/pages/settings/practice.md. Words: messages/admin-practice.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PracticeScreen } from '@/components/admin/practice/PracticeScreen';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import { practiceView } from '@/lib/practice/api';
import bn from '../../../../../messages/admin-practice.bn.json';
import en from '../../../../../messages/admin-practice.en.json';

export const dynamic = 'force-dynamic';
const HERE = '/admin/settings/practice';

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      practice: (view.lang === 'bn' ? bn : en).practice as unknown as Dict,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: `${t(view.dict, 'practice.metaTitle')} · ${t(view.dict, 'shell.admin')}`,
    robots: { index: false, follow: false },
  };
}

export default async function PracticePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('settings.write', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="practice" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="practice-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="settings.write" />
      </div>
    );
  const v = await practiceView(access.deps, access.guard.actor, MOTHER_STORE_ID);
  return (
    <div className="a2-z" data-testid="practice-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'practice.title')} sub={t(view.dict, 'practice.sub')} />
      <PracticeScreen dict={view.dict} view={v} />
    </div>
  );
}
