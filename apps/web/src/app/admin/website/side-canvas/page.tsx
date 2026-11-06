// S02 · PR 596 (register "Side canvas — the empty left and right gutters on desktop"; BACKEND-ARCHITECTURE WEB-02a) —
// Website › More › Side canvas at /admin/website/side-canvas, in the Lumen look (data-lm-ready, --lm-* tokens, the one
// toast): the master switch (off as shipped; turning it on asks first), its numbers, the zones and the approval map at
// 1440 and 1920 px (components/admin/website/SideEditor.tsx). Seeing needs `website.read`; saving
// `website.layout.write` (the API checks again; audited website.sidecanvas.save). lib/website/side-canvas-admin.ts.
// Guide: docs/admin-guide/pages/website/side-canvas.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { SideEditor } from '@/components/admin/website/SideEditor';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { todayIn } from '@/lib/shop/theme';
import { layoutChoices } from '@/lib/website/layouts-admin';
import { sideView } from '@/lib/website/side-canvas-admin';
import bn from '../../../../../messages/admin-canvas.bn.json';
import en from '../../../../../messages/admin-canvas.en.json';
import './side-canvas.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/side-canvas';
const KEY = 'websiteSideCanvas';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sc.metaTitle'), robots: { index: false, follow: false } };
}

export default async function SideCanvasPage() {
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
  const g = (k: string) => t(d, `sc.${k}`);
  const [sv, choices, tz] = await Promise.all([sideView({ db: access.deps.db, resolver: access.deps.resolver }), layoutChoices(access.deps.db), access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID })]);
  const canEdit = access.guard.permissions?.has('website.layout.write') ?? false;
  return (
    <div className="a2-z scx-page" data-testid="sc-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="lm-hint scx-note" role="note">
        {g('note')}
      </p>
      {!canEdit ? <p className="lm-sub">{g('readOnly')}</p> : null}
      <SideEditor
        key={sv.version}
        canvas={sv.canvas}
        zones={sv.zones}
        version={sv.version}
        canEdit={canEdit}
        today={todayIn(String(tz))}
        choices={{ products: choices.products, cats: choices.cats }}
        lang={view.lang === 'bn' ? 'bn' : 'en'}
        w={((d.sc as Dict) ?? {}) as never}
      />
    </div>
  );
}
