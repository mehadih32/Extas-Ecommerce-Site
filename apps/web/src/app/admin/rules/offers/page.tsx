// S28 · PR 677 (CN-048, admin prototype v5, Rules › Offers & discounts) — Offers & Discounts 360 (`/admin/rules/offers`): offers,
// coupons, built-in price rules, the online-payment reward, points and wallet in one list, with what each cost and brought, the
// seven-step wizard, the calendar, what waits for the owner's OK and the history. Reading needs `rules.read`; making an offer
// `rules.write`; making one live, pausing or ending it `rules.approve` and the owner's PIN.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { OffersScreen } from '@/components/admin/rules/OffersScreen';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { ruleScopes, rulesAccess, rulesEnv } from '@/lib/admin-rules';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/rules/offers';
const KEY = 'rulesOffers';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'rulesHub.offers.metaTitle'), robots: { index: false, follow: false } };
}

export default async function OffersPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('rules.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} ready />;

  const a = rulesAccess(access);
  const [screen, env, scopes] = await Promise.all([rl.offersScreen({ ...a.deps, settings: deps!.resolver }, a.who), rulesEnv(a), ruleScopes(a)]);

  return (
    <AdminFrame view={view} current={KEY} ready>
      <OffersScreen
        dict={view.dict}
        lang={view.lang}
        env={env}
        screen={screen}
        scopes={scopes}
        perms={{ write: a.perms.write, approve: a.perms.approve }}
        tabs={
          <div className="pa-gtabs">
            <SystemTabs view={view} current={KEY} group="rules" />
          </div>
        }
      />
    </AdminFrame>
  );
}
