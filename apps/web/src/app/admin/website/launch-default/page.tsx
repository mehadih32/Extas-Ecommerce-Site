// S02 · PR 597 (register "Launch default — save and restore"; BACKEND-ARCHITECTURE WEB-07) — Website › More › Launch
// default at /admin/website/launch-default, in the Lumen look (data-lm-ready, --lm-* tokens, the one toast): the launch
// default with "Back to launch default", named looks (save, restore, rename, set aside — never deleted), the restore log
// with Undo, and what a look holds (components/admin/website/LookSnapshots.tsx). Seeing needs `website.read`; every step
// `website.layout.write` (the API checks again; audited website.look.*). lib/website/launch-default-admin.ts.
// Guide: docs/admin-guide/pages/website/launch-default.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { LookSnapshots } from '@/components/admin/website/LookSnapshots';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { lookView } from '@/lib/website/launch-default-admin';
import bn from '../../../../../messages/admin-launch.bn.json';
import en from '../../../../../messages/admin-launch.en.json';
import './launch-default.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/launch-default';
const KEY = 'websiteLaunchDefault';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'ld.metaTitle'), robots: { index: false, follow: false } };
}

export default async function LaunchDefaultPage() {
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
  const g = (k: string) => t(d, `ld.${k}`);
  const [lv, tz] = await Promise.all([lookView({ db: access.deps.db, resolver: access.deps.resolver }), access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID })]);
  const canEdit = access.guard.permissions?.has('website.layout.write') ?? false;
  return (
    <div className="a2-z ldx-page" data-testid="ld-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="lm-hint ldx-note" role="note">
        {g('note')}
      </p>
      {!canEdit ? <p className="lm-sub">{g('readOnly')}</p> : null}
      <LookSnapshots key={`${lv.version}-${lv.log[0]?.id ?? ''}-${lv.looks.length}`} view={lv} canEdit={canEdit} lang={view.lang === 'bn' ? 'bn' : 'en'} tz={String(tz)} w={((d.ld as Dict) ?? {}) as never} />
    </div>
  );
}
