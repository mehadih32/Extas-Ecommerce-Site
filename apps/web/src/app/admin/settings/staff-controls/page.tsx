// S28 · PR 702 — Settings → Staff controls at /admin/settings/staff-controls: discount limit per role (Tk and percent,
// empty = no limit), the export rows (read-only), hide phone and address per role, the packer role, and the end-of-day
// cash and bKash handover sheet. Seeing it needs `staff.read`; saving the limits needs `settings.write` and the owner's
// PIN. Guide: docs/admin-guide/pages/settings/staff-controls.md. Words: messages/admin-staff-controls.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { moneyOf } from '@/components/admin/products/model';
import { StaffControlsScreen } from '@/components/admin/staff/StaffControlsScreen';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import { EXPORT_KEYS, handoverSheet, staffControlsView } from '@/lib/staff-controls';
import bn from '../../../../../messages/admin-staff-controls.bn.json';
import en from '../../../../../messages/admin-staff-controls.en.json';
import '../../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/settings/staff-controls';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, staffControls: ((view.lang === 'bn' ? bn : en).staffControls as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'staffControls.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function StaffControlsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('staff.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="staffControls" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="staff-controls-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="staff.read" />
      </div>
    );
  const d = access.deps;
  const storeId = MOTHER_STORE_ID;
  const can = async (k: 'settings.write' | 'roles.manage') => {
    try {
      await requirePermission(d.db, access.guard.actor, k, { storeId });
      return true;
    } catch {
      return false;
    }
  };
  const [v, currency, tz, canEdit, canMakeRole] = await Promise.all([staffControlsView(d, storeId), d.resolver.value('store.currency', { storeId }), d.resolver.value('store.timeZone', { storeId }), can('settings.write'), can('roles.manage')]);
  const today = ymdIn(d.now ? d.now() : new Date(), tz);
  const sheet = await handoverSheet(d.db, storeId, today);
  return (
    <div className="a2-z" data-testid="staff-controls-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'staffControls.title')} sub={t(view.dict, 'staffControls.sub')} />
      <StaffControlsScreen dict={view.dict} money={moneyOf(currency, view.locale)} view={v} canEdit={canEdit} canMakeRole={canMakeRole} day={today} today={today} sheet={sheet} exportKeys={EXPORT_KEYS} />
    </div>
  );
}
