// S02 · PR 76 (register "Page builder — sections, drag order, show/hide, per page"; Blueprint D1.3, D4.2;
// BACKEND-ARCHITECTURE WEB-02) — Website › Page layouts at /admin/website/layouts (?page=home | category | product | bag,
// PR 77): the page
// picker, then the page's sections in order (Show, screens, ▲ ▼, drag on a computer), Save, Discard changes and "Back to
// the default order", and "Open the page". The defaults draw today's pages. Seeing needs `website.read`; saving
// `website.layout.write` (the API checks again; audited). lib/website/layouts-admin.ts, components/admin/website/
// ~~LayoutEditor.tsx~~ LayoutBuilder.tsx (PR 595). Guide: docs/admin-guide/pages/website/layouts.md.
// S02 · PR 595 (register "Page layout builder (home and every category page)"): drawn in the Lumen look (CN-036;
// data-lm-ready, --lm-* tokens, the one toast). The home and category pages take the owner's own sections (ten types,
// each with its switch, whole days, screens, Edit and Duplicate; hidden, never deleted); the category picker adds "one
// category" (?page=category&cat=<link name>) with its own order and switch; a phone + computer preview of the page.
// PR 77 follow-up (667, 6 Nov): the product pages pick which product "Open the page" and the preview show
// (?page=product&prod=<link name>; the first product by name until one is picked; New in while the shop has none).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { BLOCK_TYPES, blockDefaults, type BlockType } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { LayoutBuilder } from '@/components/admin/website/LayoutBuilder';
import { LayoutPreview } from '@/components/admin/website/LayoutPreview';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { isLayoutPage, LAYOUT_PAGES, type LayoutPage } from '@/lib/shop/layouts';
import { todayIn } from '@/lib/shop/theme';
import { layoutChoices, layoutOpenPath, layoutView, type LayoutChoices } from '@/lib/website/layouts-admin';
import bn from '../../../../../messages/admin-layouts.bn.json';
import en from '../../../../../messages/admin-layouts.en.json';
import './layouts.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/layouts';
const KEY = 'websiteLayouts';
// ~~const OPEN: the home page, "New in" for the category and product pages, the bag~~ PR 77 follow-up (667): the
// page each layout opens is lib/website/layouts-admin layoutOpenPath (the picked product for the product pages).
const NONE: LayoutChoices = { cats: [], products: [], tags: [], rules: [] };

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
  const askedCat = page === 'category' && typeof sp.cat === 'string' && /^[a-z0-9-]{1,80}$/.test(sp.cat) ? sp.cat : null;
  const askedProd = page === 'product' && typeof sp.prod === 'string' && /^[a-z0-9-]{1,120}$/.test(sp.prod) ? sp.prod : null;
  const here = page === 'home' ? HERE : `${HERE}?page=${page}${askedCat ? `&cat=${askedCat}` : ''}${askedProd ? `&prod=${askedProd}` : ''}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="ly-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="website.read" />
      </div>
    );
  const g = (k: string) => t(d, `ly.${k}`);
  const ld = { db: access.deps.db, resolver: access.deps.resolver };
  const takesBlocks = page === 'home' || page === 'category';
  const [choices, tz, prefix] = await Promise.all([
    takesBlocks || page === 'product' ? layoutChoices(access.deps.db) : Promise.resolve(NONE),
    access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID }),
    access.deps.resolver.value('naming.productPathPrefix', { storeId: MOTHER_STORE_ID }),
  ]);
  const cat = askedCat && choices.cats.some((c) => c.slug === askedCat) ? askedCat : null;
  const lv = await layoutView(ld, page, cat);
  const canEdit = access.guard.permissions?.has('website.layout.write') ?? false;
  const starts = Object.fromEntries(BLOCK_TYPES.map((x) => [x, blockDefaults(x)])) as Record<BlockType, ReturnType<typeof blockDefaults>>;
  // PR 77 follow-up (667): the picked product, else the first by name
  const { path, prod } = layoutOpenPath({ page, cat, products: choices.products, askedProd, productPrefix: prefix });
  const shopHref = view.lang === 'bn' ? `/bn${path === '/' ? '' : path}` : path;
  const catName = (c: { en: string; bn: string | null }) => (view.lang === 'bn' && c.bn) || c.en;
  const words = ((d.ly as Dict) ?? {}) as Dict;

  return (
    <div className="a2-z lyb-page" data-testid="ly-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="lm-hint lyb-note" role="note">
        {g('note')}
      </p>
      <nav className="lm-chips lyb-pick" aria-label={g('pages')} data-testid="ly-pick">
        {LAYOUT_PAGES.map((x) => (
          <a key={x} className={`lm-chip${x === page ? ' on' : ''}`} href={x === 'home' ? HERE : `${HERE}?page=${x}`} aria-current={x === page ? 'page' : undefined} data-testid={`ly-pick-${x}`}>
            {g(`page.${x}`)}
          </a>
        ))}
      </nav>
      {page === 'category' && choices.cats.length ? (
        <form className="lyb-catpick" method="get" action={HERE} data-testid="ly-catpick">
          <input type="hidden" name="page" value="category" />
          <div className="lm-fl">
            <label htmlFor="ly-cat">{g('whichCat')}</label>
            <select id="ly-cat" name="cat" className="lm-inp" defaultValue={cat ?? ''}>
              <option value="">{g('allCats')}</option>
              {choices.cats.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {catName(c)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="lm-btn">
            {g('openCat')}
          </button>
        </form>
      ) : null}
      {page === 'product' && choices.products.length ? (
        <form className="lyb-catpick" method="get" action={HERE} data-testid="ly-prodpick">
          <input type="hidden" name="page" value="product" />
          <div className="lm-fl">
            <label htmlFor="ly-prod">{g('whichProduct')}</label>
            <select id="ly-prod" name="prod" className="lm-inp" defaultValue={prod ?? ''}>
              {choices.products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {catName(p)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="lm-btn">
            {g('openCat')}
          </button>
        </form>
      ) : null}
      <section className="lm-card lyb-card" aria-labelledby="ly-h" data-testid="ly-card">
        <h2 id="ly-h">{cat ? g('cardH.one').replace('{name}', catName(choices.cats.find((c) => c.slug === cat)!)) : g(`cardH.${page}`)}</h2>
        {page === 'home' ? <p className="lm-sub">{g('seasonal')}</p> : null}
        {page === 'product' || page === 'bag' ? <p className="lm-sub">{g(`fixedNote.${page}`)}</p> : null}
        {!canEdit ? <p className="lm-sub">{g('readOnly')}</p> : null}
        <LayoutBuilder
          key={`${page}:${cat ?? ''}:${lv.version}`}
          page={page}
          cat={cat}
          rows={lv.rows}
          blocks={lv.blocks}
          defaults={lv.defaults}
          locked={lv.locked}
          version={lv.version}
          own={lv.own}
          ownRows={lv.ownRows}
          shared={lv.shared}
          canEdit={canEdit}
          today={todayIn(String(tz))}
          starts={starts}
          choices={choices}
          lang={view.lang === 'bn' ? 'bn' : 'en'}
          w={words as never}
        />
      </section>
      <section className="lm-card lyb-card" aria-labelledby="ly-ph" data-testid="ly-prevcard">
        <h2 id="ly-ph">{g('prev.title')}</h2>
        <div className="lyb-bar">
          <a className="lm-btn" href={shopHref} target="_blank" rel="noopener noreferrer" data-testid="ly-open">
            {g('open')}
          </a>
        </div>
        {takesBlocks || prod ? <LayoutPreview src={shopHref} stamp={lv.version} w={{ show: g('prev.show'), hide: g('prev.hide'), phone: g('prev.phone'), desktop: g('prev.desktop'), note: g('prev.note') }} /> : null}
      </section>
    </div>
  );
}
