// PR 746 + 747 — Products › Categories & tags at /admin/products/structure: the order of the categories (shown or hidden in
// the shop), the order of the collections and the badge on a product card (which tag, in what order, with which words). Every
// list is dragged (mouse, touch) or moved with the arrow keys. Seeing needs `catalogue.read`; saving `catalogue.write` (the
// API checks again; audited). lib/admin-structure/*, components/admin/products/StructureEditor.tsx.
// Guide: docs/admin-guide/pages/products/structure.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { StructureEditor } from '@/components/admin/products/StructureEditor';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { structureView } from '@/lib/admin-structure/service';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-structure.bn.json';
import en from '../../../../../messages/admin-structure.en.json';
import '../../settings-cards.css';
import '../../website/brand-menus/brand.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/products/structure';
const KEY = 'productStructure';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

/** A nested words file as one flat list: `{a: {b: 'x'}}` → `{'a.b': 'x'}`. */
function flat(d: Dict, at = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [[`${at}${k}`, v]] : Object.entries(flat(v, `${at}${k}.`)))));
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'st.metaTitle'), robots: { index: false, follow: false } };
}

export default async function StructurePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('catalogue.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="st-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="catalogue.read" />
      </div>
    );
  const cards = await structureView({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('catalogue.write') ?? false;
  const g = (k: string) => t(d, `st.${k}`);
  return (
    <div className="a2-z bm-page" data-testid="st-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      <StructureEditor categories={cards.categories} collections={cards.collections} tags={cards.tags} texts={flat((d.st ?? {}) as Dict)} lang={view.lang === 'bn' ? 'bn' : 'en'} canEdit={canEdit} />
    </div>
  );
}
