// S13 · PR 254 (Blueprint MKT-05, demo 97x-adm2-marketing.js "Landing page builder") — /admin/marketing/landing/<id>
// (`new` for a new page): the headline, the product, the link and the campaign; the parts of the page switched on or
// off in their fixed order and their words; a phone sketch; Save, Publish (asks once more), Take down, Archive and
// Restore (nothing is deleted), Open and Copy link. Seeing needs `marketing.landing.read`, changing
// `marketing.landing.write`. Guide: docs/admin-guide/pages/marketing/landing-builder.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { LandingBuilder, type BuilderPage } from '@/components/admin/marketing/LandingBuilder';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { landingChoices, landingOne } from '@/lib/marketing/landing';
import { shopOrigin } from '@/lib/shop/meta';
import { sectionsOf } from '@/lib/marketing/landing-model';
import bn from '../../../../../../messages/admin-landing.bn.json';
import en from '../../../../../../messages/admin-landing.en.json';
import '../../../settings-cards.css';
import '../landing.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/marketing/landing';
const KEY = 'marketingLandingPage';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'lp.builderMeta'), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }> };

export default async function LandingBuilderPage(props: Props) {
  const deps = adminDeps();
  const [{ id }, plain] = await Promise.all([props.params, adminView(deps)]);
  const here = `${LIST}/${encodeURIComponent(id)}`;
  const access = await pageAccess('marketing.landing.read', deps, MOTHER_STORE_ID);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.landing.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `lp.${k}`, vars);
  const crumb = (
    <Link className="bd-crumb" href={LIST} data-testid="lp-back">
      {s('b.back')}
    </Link>
  );
  const isNew = id === 'new';
  const [page, choices, domain] = await Promise.all([isNew ? Promise.resolve(null) : landingOne(access.deps.db, id), landingChoices(access.deps.db), shopOrigin(MOTHER_STORE_ID).catch(() => undefined)]);
  if (!isNew && !page)
    return (
      <div className="a2-z">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('builderMeta')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const canWrite = access.guard.permissions?.has('marketing.landing.write') ?? false;
  const start: BuilderPage = page ?? { id: null, slug: '', titleEn: '', titleBn: null, productId: null, campaignId: null, state: 'draft', sections: sectionsOf([]), version: null, orders: 0, delivered: 0 };
  const words = { lp: (d as Record<string, Dict>).lp ?? {} } as Dict;

  return (
    <div className="a2-z" data-testid="landing-builder">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={page ? page.titleEn : s('newTitle')} sub={page ? s('b.stats', { orders: page.orders, delivered: page.delivered }) : undefined} />
      <SectionTabs view={view} current={KEY} />
      <LandingBuilder words={words} page={start} products={choices.products} campaigns={choices.campaigns} origin={domain?.origin ?? ''} canWrite={canWrite} listHref={LIST} />
    </div>
  );
}

