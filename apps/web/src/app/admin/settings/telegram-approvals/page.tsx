// S28 · PR 703 — Settings → Telegram approvals at /admin/settings/telegram-approvals: the switch and numbers for urgent
// approvals on Telegram, the requests waiting for the owner (decide here with the PIN or on Telegram), the decided ones,
// the wrong-PIN lock and "Connect the buttons". Needs `settings.write`; deciding and the settings are the owner's, with
// the PIN. Guide: docs/admin-guide/pages/settings/telegram-approvals.md. Words: messages/admin-telegram-approvals.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { TelegramApprovalsScreen } from '@/components/admin/telegram/TelegramApprovalsScreen';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import { approvalsView } from '@/lib/telegram-approvals';
import bn from '../../../../../messages/admin-telegram-approvals.bn.json';
import en from '../../../../../messages/admin-telegram-approvals.en.json';
import '../../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/settings/telegram-approvals';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, telegramApprovals: ((view.lang === 'bn' ? bn : en).telegramApprovals as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'telegramApprovals.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function TelegramApprovalsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('settings.write', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="telegramApprovals" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="telegram-approvals-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="settings.write" />
      </div>
    );
  const d = access.deps;
  const [v, currency] = await Promise.all([approvalsView(d, access.guard.actor, MOTHER_STORE_ID), d.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  return (
    <div className="a2-z" data-testid="telegram-approvals-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'telegramApprovals.title')} sub={t(view.dict, 'telegramApprovals.sub')} />
      <TelegramApprovalsScreen dict={view.dict} money={moneyOf(currency, view.locale)} view={v} />
    </div>
  );
}
