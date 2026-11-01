// S13 · PR 256 (Blueprint C6.2, demo 93-admin-ads.js "New campaign · draft") — /admin/marketing/campaigns/<id> (`new`
// for a new one): the campaign's name, aim, channels and audience, its offer, creative, window and planned budget, its
// landing pages and the orders they brought, and its steps (schedule, start, pause, resume, end, archive, restore).
// Seeing needs `marketing.campaigns.read`, changing `marketing.campaigns.write`. The budget is a plan, locked once the
// campaign has started. Guide: docs/admin-guide/pages/marketing/campaign.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CampaignEditor, type EditorCampaign } from '@/components/admin/marketing/CampaignEditor';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { campaignChoices, campaignOne } from '@/lib/marketing/campaigns';
import bn from '../../../../../../messages/admin-campaigns.bn.json';
import en from '../../../../../../messages/admin-campaigns.en.json';
import '../../../settings-cards.css';
import '../../landing/landing.css';
import '../campaigns.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/marketing/campaigns';
const KEY = 'marketingCampaign';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'cp.editMeta'), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }> };

export default async function CampaignPage(props: Props) {
  const deps = adminDeps();
  const [{ id }, plain] = await Promise.all([props.params, adminView(deps)]);
  const here = `${LIST}/${encodeURIComponent(id)}`;
  const access = await pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `cp.${k}`, vars);
  const crumb = (
    <Link className="bd-crumb" href={LIST} data-testid="cp-back">
      {s('back')}
    </Link>
  );
  const isNew = id === 'new';
  const [c, choices, currency] = await Promise.all([isNew ? Promise.resolve(null) : campaignOne(access.deps.db, id), campaignChoices(access.deps.db), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  if (!isNew && !c)
    return (
      <div className="a2-z">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('editMeta')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const start: EditorCampaign = c ?? { id: null, name: '', state: 'DRAFT', objective: 'delivered', channels: [], audienceId: null, couponId: null, offer: { kind: 'none' }, creative: {}, startsAt: null, endsAt: null, budgetMinor: null, budgetKind: null, landingPages: [], version: null };
  const words = { cp: (d as Record<string, Dict>).cp ?? {} } as Dict;
  const money = moneyOf(c?.budgetCurrency ?? currency, view.locale);

  return (
    <div className="a2-z" data-testid="campaign-editor">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={c ? c.name : s('newTitle')} sub={c ? s('stats', { pages: c.pages, orders: c.orders, delivered: c.delivered }) : undefined} />
      <SectionTabs view={view} current={KEY} />
      <CampaignEditor words={words} campaign={start} audiences={choices.audiences} coupons={choices.coupons} money={money} canWrite={canWrite} listHref={LIST} landingHref="/admin/marketing/landing" />
    </div>
  );
}
