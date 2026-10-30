// PR 500 — "Keys & connections" (demo #/admin/integrations; Blueprint A1.3, A2.9.18). Needs `vault.read` to see and
// `vault.write` to change; the API checks both again on every call.
// PR 620: the "The ERP asks the shop" card under the connections (the address for the ERP, the switch, the latest calls).
import type { Metadata } from 'next';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { redirect } from 'next/navigation';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { ErpCalls } from '@/components/admin/ErpCalls';
import { Icon } from '@/components/admin/Icon';
import { Integrations } from '@/components/admin/Integrations';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { erpCallsState } from '@/lib/erp-calls-admin';
import { t } from '@/lib/i18n';
import { listConnections } from '@/lib/integrations';
import { siteAddress } from '@/lib/seo/site';
import '../settings-cards.css';

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
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const [connections, site] = await Promise.all([listConnections(access.deps.db, access.deps.vault), siteAddress(MOTHER_STORE_ID)]);
  const erpCalls = await erpCallsState(access.deps, MOTHER_STORE_ID, site.origin?.origin ?? null);
  const canWrite = access.guard.permissions?.has('vault.write') ?? false;
  const d = view.dict;
  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd">
        <div className="ad-eyebrow">{t(d, 'integrations.eyebrow')}</div>
        <h1 className="ad-h1">{t(d, 'integrations.title')}</h1>
        <p className="ad-intro">{t(d, 'integrations.intro')}</p>
      </div>
      <SystemTabs view={view} current={KEY} />
      <Integrations
        dict={d}
        initial={connections}
        canWrite={canWrite}
        vaultReady={Boolean(access.deps.vault)}
        locale={view.locale}
        timeZone={view.timeZone}
      />
      <ErpCalls dict={d} initial={erpCalls} canWrite={canWrite} locale={view.locale} timeZone={view.timeZone} />
      <div className="ad-note">
        <Icon name="shield" size={16} />
        <div>{t(d, 'integrations.note')}</div>
      </div>
    </AdminFrame>
  );
}
