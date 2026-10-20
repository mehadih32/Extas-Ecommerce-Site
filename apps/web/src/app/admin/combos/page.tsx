// S03 · PR 90 (with 571, 99) — Combos & customer sets (demo #/admin/combos), in its own admin section: the fixed
// combos with their price box and switches, the editor with its live preview, and what customers can combine (the
// set tiers from Smart Rules). Reading needs `combos.read`; changing `combos.write`; switching on or off
// `combos.publish`; a set price `combos.prices` (the owner's decision). The API checks each again on every call.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cb from '@extas/combos';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { CombosScreen } from '@/components/admin/combos/CombosScreen';
import { adminDeps } from '@/lib/admin-auth';
import { combosAccess, setPhotoUrls, storeCurrency } from '@/lib/admin-combos';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/combos';
const KEY = 'combos';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'combos.metaTitle'), robots: { index: false, follow: false } };
}

export default async function CombosPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('combos.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const a = combosAccess(access);
  const [combos, options, currency] = await Promise.all([cb.listCombos(a.deps, a.who), cb.comboOptions(a.deps, a.who), storeCurrency(a)]);
  const photos = await setPhotoUrls(a, combos);

  return (
    <AdminFrame view={view} current={KEY}>
      <CombosScreen
        dict={view.dict}
        lang={view.lang}
        locale={view.locale}
        currency={currency}
        tab="fixed"
        combos={combos}
        products={options.products}
        photos={photos}
        perms={a.perms}
        tabs={
          <div className="cb-gtabs">
            <SystemTabs view={view} current={KEY} group="combos" />
          </div>
        }
      />
    </AdminFrame>
  );
}
