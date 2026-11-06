// S02 · PR 598 (register "Site builder", V2.1 Shimmer control; demo 89t-shimmer.js) — Settings › More › Shimmer at
// /admin/settings/shimmer, in the Lumen look (data-lm-ready, --lm-* tokens, the one toast): the master switch, every
// shimmer's switch, speed and strength, the four factors under More options (components/admin/settings/ShimmerEditor.tsx).
// Seeing needs `settings.read`; saving `settings.write` (the API checks again; audited settings.shimmer.save).
// lib/website/shimmer-admin.ts. Guide: docs/admin-guide/pages/settings/shimmer.md. The rest of PR 598 stays paused.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ShimmerEditor } from '@/components/admin/settings/ShimmerEditor';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shimmerView } from '@/lib/website/shimmer-admin';
import bn from '../../../../../messages/admin-shimmer.bn.json';
import en from '../../../../../messages/admin-shimmer.en.json';
import './shimmer.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/shimmer';
const KEY = 'settingsShimmer';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sh.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ShimmerPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('settings.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="settings.read" />
      </div>
    );
  const g = (k: string) => t(d, `sh.${k}`);
  const sv = await shimmerView({ db: access.deps.db, resolver: access.deps.resolver });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  return (
    <div className="a2-z shx-page" data-testid="sh-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!canEdit ? <p className="lm-sub">{g('readOnly')}</p> : null}
      <ShimmerEditor key={sv.version} sweep={sv.sweep} pdp={sv.pdp} tune={sv.tune} version={sv.version} canEdit={canEdit} w={((d.sh as Dict) ?? {}) as never} />
    </div>
  );
}
