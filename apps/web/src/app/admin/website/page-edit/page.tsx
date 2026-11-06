// S02 · PR 600 (register "On-page edit mode"; Blueprint D10.6) — Website › More › On-page edit at
// /admin/website/page-edit, in the Lumen look (data-lm-ready, --lm-* tokens, the one toast): the switch for the owner's
// on-page edit bar on the shop (off as shipped), the phone options and checks, the phone screens checked, and the
// on-page publishes (components/admin/website/PageEditSettings.tsx). Seeing needs `website.read`; saving
// `website.layout.write` (the API checks again; audited website.pageEdit.settings). The bar itself shows only to the
// owner (super admin). lib/website/page-edit-settings.ts. Guide: docs/admin-guide/pages/website/page-edit.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { registry } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { PageEditSettings } from '@/components/admin/website/PageEditSettings';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { pageEditSettingsView } from '@/lib/website/page-edit-settings';
import bn from '../../../../../messages/admin-pageedit.bn.json';
import en from '../../../../../messages/admin-pageedit.en.json';
import './page-edit.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/page-edit';
const KEY = 'websitePageEdit';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'pe.metaTitle'), robots: { index: false, follow: false } };
}

export default async function PageEditPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('website.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="website.read" />
      </div>
    );
  const g = (k: string) => t(d, `pe.${k}`);
  const [pv, tz] = await Promise.all([pageEditSettingsView({ db: access.deps.db, resolver: access.deps.resolver }), access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID })]);
  const canEdit = access.guard.permissions?.has('website.layout.write') ?? false;
  return (
    <div className="a2-z pex-page" data-testid="pe-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!canEdit ? <p className="lm-sub">{g('readOnly')}</p> : null}
      <PageEditSettings key={pv.version} view={pv} shipped={registry['shop.pageEdit'].default.phones} canEdit={canEdit} lang={view.lang === 'bn' ? 'bn' : 'en'} tz={String(tz)} w={((d.pe as Dict) ?? {}) as never} />
    </div>
  );
}
