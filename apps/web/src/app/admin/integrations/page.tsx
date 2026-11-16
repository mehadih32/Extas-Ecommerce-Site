// PR 500 — "Keys & connections" (demo #/admin/integrations; Blueprint A1.3, A2.9.18). Needs `vault.read` to see and
// `vault.write` to change; the API checks both again on every call.
// ~~PR 620: the "The ERP asks the shop" card under the connections (the address for the ERP, the switch, the latest calls).~~
// CN-029 · PR 619 (Bhandari follow-up 524): that card moved to each store's ERP link page (Settings → ERP link), where
// the store's own ERP keys are typed too; a note here leads there.
// PR 1020 (D12, owner order: the real admin equals prototype v5 100%): drawn as the prototype draws it (KeysScreen): the warning,
// the three status cards, seven groups; the real connections the prototype does not list are under "More options".
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { KeysScreen } from '@/components/admin/KeysScreen';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { listConnections } from '@/lib/integrations';
import '../settings-cards.css';
import './keys.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/integrations';
const KEY = 'integrations';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'integrations.metaTitle'), robots: { index: false, follow: false } };
}

export default async function IntegrationsPage() {
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess('vault.read', deps)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="integrations-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="vault.read" />
      </div>
    );

  const connections = await listConnections(access.deps.db, access.deps.vault);
  const canWrite = access.guard.permissions?.has('vault.write') ?? false;
  const d = view.dict;
  const now = (access.deps.now ? access.deps.now() : new Date()).getTime();
  return (
    <div className="a2-z lm-st" data-testid="integrations-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'integrations.keys.title')} sub={t(d, 'integrations.keys.sub')} />
      <SectionTabs view={view} current={KEY} />
      <KeysScreen dict={d} initial={connections} canWrite={canWrite} vaultReady={Boolean(access.deps.vault)} now={now} />
      <div className="a2-note a2-mt12" data-testid="integrations-erp-link">
        <div>
          {t(d, 'integrations.erpLinkNote')}{' '}
          <Link className="ig-tap" href="/admin/settings/erp-link">{t(d, 'integrations.erpLinkOpen')}</Link>
        </div>
      </div>
      <div className="a2-note a2-mt12">
        <div>{t(d, 'integrations.note')}</div>
      </div>
    </div>
  );
}
