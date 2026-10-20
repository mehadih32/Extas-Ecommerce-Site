// S10 · PR 209 (with 210–219) — Smart Rules (demo #/admin/rules): every rule of the store, its editor with the live
// preview, "Preview changes", publish, history, simulation, coupons and the conflict banner. Reading needs
// `rules.read`; changing `rules.write`; publishing `rules.publish`; a change that moves money needs the owner's OK
// (`rules.approve`). The API checks each again on every call.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { RulesScreen } from '@/components/admin/rules/RulesScreen';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { allRuleViews, ruleScopes, rulePlaces, rulesAccess, rulesEnv, scopeProducts } from '@/lib/admin-rules';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/rules';
const KEY = 'rules';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'rules.metaTitle'), robots: { index: false, follow: false } };
}

export default async function RulesPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('rules.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const a = rulesAccess(access);
  const [views, conflicts, templates, env, places, scopes, notices, aiEnabled, simDays] = await Promise.all([
    allRuleViews(a),
    rl.listConflicts(a.deps, a.who),
    rl.listTemplates(a.deps, a.who),
    rulesEnv(a),
    rulePlaces(a),
    ruleScopes(a),
    a.deps.db.notice.findMany({ where: { storeId: a.storeId }, select: { id: true, nameEn: true, nameBn: true, key: true } }),
    a.deps.settings.value('ai.enabled', { storeId: a.storeId }) as Promise<boolean>,
    a.deps.settings.value('rules.simulation.defaultDays', { storeId: a.storeId }) as Promise<number>,
  ]);
  const products = await scopeProducts(a, views);
  const noticeNames = Object.fromEntries(notices.map((n) => [n.id, (view.lang === 'bn' ? n.nameBn : null) ?? n.nameEn ?? n.key ?? n.id]));

  return (
    <AdminFrame view={view} current={KEY}>
      <RulesScreen
        dict={view.dict}
        lang={view.lang}
        locale={view.locale}
        timeZone={view.timeZone}
        env={env}
        views={views}
        conflicts={conflicts}
        templates={templates}
        places={places}
        scopes={scopes}
        products={products}
        notices={noticeNames}
        perms={a.perms}
        aiEnabled={aiEnabled === true}
        simDays={simDays}
        tabs={
          <div className="pa-gtabs">
            <SystemTabs view={view} current={KEY} group="rules" />
          </div>
        }
      />
    </AdminFrame>
  );
}
