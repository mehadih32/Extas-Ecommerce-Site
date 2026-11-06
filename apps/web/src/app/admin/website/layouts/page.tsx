// S02 · PR 76 (register "Page builder — sections, drag order, show/hide, per page"; Blueprint D1.3, D4.2;
// BACKEND-ARCHITECTURE WEB-02) — Website › Page layouts at /admin/website/layouts (?page=home | category | product | bag,
// PR 77): the page
// picker, then the page's sections in order (Show, screens, ▲ ▼, drag on a computer), Save, Discard changes and "Back to
// the default order", and "Open the page". The defaults draw today's pages. Seeing needs `website.read`; saving
// `website.layout.write` (the API checks again; audited). lib/website/layouts-admin.ts, components/admin/website/
// LayoutEditor.tsx. Guide: docs/admin-guide/pages/website/layouts.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { LayoutEditor, type LayoutEditorWords } from '@/components/admin/website/LayoutEditor';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { isLayoutPage, LAYOUT_PAGES, PAGE_LAYOUTS, type LayoutPage } from '@/lib/shop/layouts';
import { ROUTES } from '@/lib/shop/routes';
import { layoutView } from '@/lib/website/layouts-admin';
import bn from '../../../../../messages/admin-layouts.bn.json';
import en from '../../../../../messages/admin-layouts.en.json';
import '../../settings-cards.css';
import './layouts.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/layouts';
const KEY = 'websiteLayouts';
/**
 * The shop page each layout opens: the home page, the "New in" page (every shop has it) for the category pages and,
 * PR 77, for the product pages (a product is one tap away there), and the bag.
 */
const OPEN: Record<LayoutPage, string> = { home: ROUTES.home, category: ROUTES.newIn, product: ROUTES.newIn, bag: ROUTES.bag };

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'ly.metaTitle'), robots: { index: false, follow: false } };
}

export default async function PageLayoutsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('website.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  const asked = typeof sp.page === 'string' ? sp.page : 'home';
  const page: LayoutPage = isLayoutPage(asked) ? asked : 'home';
  const here = page === 'home' ? HERE : `${HERE}?page=${page}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="website.read" />
      </div>
    );
  const g = (k: string) => t(d, `ly.${k}`);
  const lv = await layoutView({ db: access.deps.db, resolver: access.deps.resolver }, page);
  const canEdit = access.guard.permissions?.has('website.layout.write') ?? false;
  const ids = PAGE_LAYOUTS[page].ids;
  const names = Object.fromEntries(ids.map((id) => [id, g(`sec.${id}`)]));
  const hints = Object.fromEntries(ids.map((id) => [id, g(`hint.${id}`)]));
  const errKeys = ['INVALID_INPUT', 'LOCKED', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'];
  const w: LayoutEditorWords = {
    count: g('count'),
    always: g('always'),
    show: g('show'),
    screens: g('screens'),
    dev: { both: g('dev.both'), phone: g('dev.phone'), desktop: g('dev.desktop') },
    up: g('up'),
    down: g('down'),
    drag: g('drag'),
    save: g('save'),
    saving: g('saving'),
    saved: g('saved'),
    discard: g('discard'),
    reset: g('reset'),
    resetHelp: g('resetHelp'),
    unsaved: g('unsaved'),
    err: Object.fromEntries(errKeys.map((k) => [k, g(`err.${k}`)])),
  };
  const shopHref = view.lang === 'bn' ? `/bn${OPEN[page] === '/' ? '' : OPEN[page]}` : OPEN[page];

  return (
    <div className="a2-z" data-testid="ly-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      <nav className="lyb-pick" aria-label={g('pages')} data-testid="ly-pick">
        {LAYOUT_PAGES.map((p) => (
          <a key={p} className="a2-btn" href={p === 'home' ? HERE : `${HERE}?page=${p}`} aria-current={p === page ? 'page' : undefined} data-testid={`ly-pick-${p}`}>
            {g(`page.${p}`)}
          </a>
        ))}
      </nav>
      <section className="a2-sc a2-mt12" aria-labelledby="ly-h" data-testid="ly-card">
        <h2 className="a2-h3" id="ly-h">
          {g(`cardH.${page}`)}
        </h2>
        {page === 'home' ? <p className="a2-xs a2-mute lyb-mt6">{g('seasonal')}</p> : null}
        {page === 'product' || page === 'bag' ? <p className="a2-xs a2-mute lyb-mt6">{g(`fixedNote.${page}`)}</p> : null}
        {!canEdit ? <p className="a2-xs a2-mute lyb-mt6">{g('readOnly')}</p> : null}
        <LayoutEditor key={page} page={page} rows={lv.rows} defaults={lv.defaults} locked={lv.locked} version={lv.version} names={names} hints={hints} canEdit={canEdit} w={w} />
        <div className="lyb-bar">
          <a className="a2-btn" href={shopHref} target="_blank" rel="noopener noreferrer" data-testid="ly-open">
            {g('open')}
          </a>
        </div>
      </section>
    </div>
  );
}
