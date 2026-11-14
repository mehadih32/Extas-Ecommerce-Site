// PR 718 (admin prototype v5 · docs/demo/admin-proto-v5/GAP-MAP.md "Policies: 5 new pages … history", placed under
// Website) — Website › Policies at /admin/website/policies (?page=): the shop's nine policy pages (Terms, Privacy,
// Delivery, Exchange & returns, Payment & COD, Cancellation & Refund, Wallet & coupons, Reviews, Cookies), each with its
// words in English and Bengali, a live preview, its state (live, live with a draft waiting, or draft), who changed it last
// and when, a link to the public page and the version history with restore. The five pages the shop already had share
// their words with Settings › Policies & texts (kept there as version 1); the four new ones are read by the shop from
// this page's history. The words are the owner's own: nothing is written for him. Seeing needs `website.read`, changing
// `settings.write` (the API checks again). lib/website-policies, components/admin/website/PoliciesTab.
// Guide: docs/admin-guide/pages/website/policies.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PoliciesTab } from '@/components/admin/website/PoliciesTab';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { paymentModeOf } from '@/lib/payments-gateway';
import { isPolicySlug, POLICY_SLUGS } from '@/lib/website-policies/model';
import { policyTabView } from '@/lib/website-policies/service';
import bn from '../../../../../messages/admin-website-policies.bn.json';
import en from '../../../../../messages/admin-website-policies.en.json';
import '../../settings-cards.css';
import './policies.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/policies';
const KEY = 'websitePolicies';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

/** The screen's nested words as one flat list of `a.b` keys (the editor reads them by name). */
function flat(o: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === 'string') acc[prefix + k] = v;
    else if (v && typeof v === 'object') Object.assign(acc, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    return acc;
  }, {});
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'pw.metaTitle'), robots: { index: false, follow: false } };
}

export default async function WebsitePoliciesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('website.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  const asked = typeof sp.page === 'string' && isPolicySlug(sp.page) ? sp.page : POLICY_SLUGS[0];
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(`${HERE}?page=${asked}`)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="pol-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="website.read" />
      </div>
    );
  const v = await policyTabView({ db: access.deps.db, resolver: access.deps.resolver, paymentMode: paymentModeOf }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const words = flat((view.lang === 'bn' ? bn : en).pw as unknown as Record<string, unknown>);
  const names = Object.fromEntries(POLICY_SLUGS.map((s) => [s, words[`names.${s}`]!]));
  const published = v.rows.filter((r) => r.state !== 'draft').length;

  return (
    <div className="a2-z" data-testid="pol-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'pw.title')} sub={t(d, 'pw.sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{t(d, 'pw.note')}</span>
      </div>
      <p className="a2-xs a2-mute polb-mt6" data-testid="pol-summary">
        {published} / {v.rows.length}
      </p>
      <PoliciesTab rows={v.rows} w={words} names={names} initial={asked} canEdit={canEdit} locale={view.locale} timeZone={view.timeZone} shopLang={view.lang === 'bn' ? 'bn' : 'en'} />
    </div>
  );
}
