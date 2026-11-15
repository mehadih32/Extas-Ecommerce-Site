// PR 726 — Website › Brand & menus at /admin/website/brand-menus (docs/ADMIN-ARCHITECTURE.md §4.9 Site builder: menus,
// header, footer): the shop's name, slogans, browser-tab title, logos and favicon with a live preview; the announcement bar,
// header icons and menu items; the footer's promise strip, sign-up box, link columns, contact block, social marks and
// addresses, payment marks and copyright line. Every list is dragged (mouse, touch) or moved with the arrow keys. Seeing
// needs `website.read`; saving `website.layout.write` (the API checks again; audited). lib/admin-brand/*,
// components/admin/website/BrandMenusEditor.tsx. Guide: docs/admin-guide/pages/website/brand-menus.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { LOGO_STYLE_COUNT, SHOP_ICONS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { BrandMenusEditor } from '@/components/admin/website/BrandMenusEditor';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { ALL_PAY, ALL_SOCIAL, type Pair } from '@/lib/admin-brand/model';
import { brandView } from '@/lib/admin-brand/service';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shopT } from '@/lib/shop/dict';
import bn from '../../../../../messages/admin-brand.bn.json';
import en from '../../../../../messages/admin-brand.en.json';
import '../../settings-cards.css';
import './brand.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/brand-menus';
const KEY = 'websiteBrand';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

/** A nested words file as one flat list: `{a: {b: 'x'}}` → `{'a.b': 'x'}`. */
function flat(d: Dict, at = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [[`${at}${k}`, v]] : Object.entries(flat(v, `${at}${k}.`)))));
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'bm.metaTitle'), robots: { index: false, follow: false } };
}

export default async function BrandMenusPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('website.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="bm-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="website.read" />
      </div>
    );
  const v = await brandView({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('website.layout.write') ?? false;
  const g = (k: string) => t(d, `bm.${k}`);
  // the shop's own words for the social and payment marks, in both languages
  const own = await access.deps.resolver.value('language.labels', { storeId: MOTHER_STORE_ID });
  const shop = { en: shopT('en', own), bn: shopT('bn', own) };
  const marks: Record<string, Pair> = {};
  for (const id of ALL_SOCIAL) marks[`social.${id}`] = { en: shop.en(`social.${id}`), bn: shop.bn(`social.${id}`) };
  for (const id of ALL_PAY) marks[`pay.${id}`] = { en: shop.en(`pay.${id}`), bn: shop.bn(`pay.${id}`) };
  const texts = flat((d.bm ?? {}) as Dict);

  return (
    <div className="a2-z bm-page" data-testid="bm-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      <BrandMenusEditor
        brand={v.cards.brand}
        menu={v.cards.menu}
        footer={v.cards.footer}
        contact={v.cards.contact}
        icons={[...SHOP_ICONS]}
        previews={v.previews}
        texts={texts}
        lang={view.lang === 'bn' ? 'bn' : 'en'}
        canEdit={canEdit}
        seoHref="/admin/website/seo"
        styleCount={LOGO_STYLE_COUNT}
        marks={marks}
      />
    </div>
  );
}
