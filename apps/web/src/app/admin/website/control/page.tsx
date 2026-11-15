// PR 778 — Website › Control at /admin/website/control (owner request, 15 Nov 2026): the first Website tab. One hub with
// grouped cards and a search box that links to every website-related setting where it lives today (shop name, logo, favicon,
// header, menu, footer, look, cookie banner, policies, page layouts, shop text, SEO, analytics, email look, home-screen icon,
// checkout and payment display, delivery information, contact card, categories and tags order). Nothing moves and no address
// changes; each card opens the page the setting already lives on. Seeing needs `website.read`; a card shows only when the
// person may open the page it leads to. lib/admin-website-control/cards.ts, components/admin/website/ControlHub.tsx.
// Guide: docs/admin-guide/pages/website/control.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState, shellViewer } from '@/components/admin/shell/ShellParts';
import { ControlHub, type ControlTexts } from '@/components/admin/website/ControlHub';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { controlGroups, CONTROL_GROUPS } from '@/lib/admin-website-control/cards';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-website-control.bn.json';
import en from '../../../../../messages/admin-website-control.en.json';
import './control.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/control';
const KEY = 'websiteControl';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'wc.metaTitle'), robots: { index: false, follow: false } };
}

export default async function WebsiteControlPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('website.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="wc-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="website.read" />
      </div>
    );
  const groups = controlGroups(await shellViewer());
  const g = (k: string) => t(d, `wc.${k}`);
  const cardIds = CONTROL_GROUPS.flatMap((x) => x.cards.map((c) => c.id));
  const texts: ControlTexts = {
    search: g('search'),
    searchLabel: g('searchLabel'),
    count: g('count'),
    none: g('none'),
    open: g('open'),
    clear: g('clear'),
    groups: Object.fromEntries(CONTROL_GROUPS.map((x) => [x.id, g(`group.${x.id}`)])),
    cards: Object.fromEntries(cardIds.map((id) => [id, { t: g(`card.${id}.t`), d: g(`card.${id}.d`), k: g(`card.${id}.k`) }])),
  };

  return (
    <div className="a2-z wc-page" data-testid="wc-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      {groups.length ? <ControlHub groups={groups} texts={texts} /> : <p className="a2-note a2-mt12">{g('denied')}</p>}
    </div>
  );
}
