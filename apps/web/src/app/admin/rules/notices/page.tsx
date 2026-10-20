// S10 · PR 216 — Notices & pop-ups (`/admin/rules/notices`): the announcement bar, banners, notes on a page and
// pop-ups, their place, timing and frequency cap, and the rule they quote. Reading needs `rules.read`; changing
// `rules.write`; switching on, off and archiving `rules.publish`. The API checks each again on every call.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { NoticesScreen } from '@/components/admin/rules/NoticesScreen';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { rulePlaces, rulesAccess, rulesEnv } from '@/lib/admin-rules';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/rules/notices';
const KEY = 'notices';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'rules.notices.metaTitle'), robots: { index: false, follow: false } };
}

export default async function NoticesPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('rules.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const a = rulesAccess(access);
  const [notices, env, places, limits, { rules }] = await Promise.all([
    rl.listNotices(a.deps, a.who, { includeArchived: true }),
    rulesEnv(a),
    rulePlaces(a),
    rl.noticeLimits(a.deps, a.storeId),
    rl.loadRules(a.deps.db, a.storeId),
  ]);
  const ruleOptions = rules.filter((r) => !r.archived).map((r) => ({ id: r.id, key: r.key, nameEn: r.nameEn, nameBn: r.nameBn ?? null, params: r.params }));

  return (
    <AdminFrame view={view} current={KEY}>
      <NoticesScreen
        dict={view.dict}
        lang={view.lang}
        timeZone={view.timeZone}
        env={env}
        notices={notices}
        rules={ruleOptions}
        places={places}
        limits={{ ...limits, placements: [...limits.placements] }}
        perms={a.perms}
        tabs={
          <div className="pa-gtabs">
            <SystemTabs view={view} current={KEY} group="rules" />
          </div>
        }
      />
    </AdminFrame>
  );
}
