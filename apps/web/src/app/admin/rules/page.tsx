// S28 · PR 676 (CN-048, admin prototype v5, Rules) — the one-page Rules screen (`/admin/rules`): every rule of the shop as one plain
// sentence with a pill, the groups on the left, the editor of the rule picked on the right. The Smart Rules editor (PR 209–219) is
// its own page (`/admin/rules/smart`) and the rows of discounts, delivery and exchange rules open it. Reading needs `rules.read`;
// changing a row `rules.write`; a rule that moves money also `rules.approve` and the owner's PIN.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { courierScoreAccuracy } from '@extas/orders';
import { AdminFrame, AdminNotice } from '@/components/admin/AdminFrame';
import { RulesHub } from '@/components/admin/rules/RulesHub';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { rulesAccess, rulesEnv } from '@/lib/admin-rules';
import { t, type Dict } from '@/lib/i18n';
import bnWords from '../../../../messages/admin-rules-hub.bn.json';
import enWords from '../../../../messages/admin-rules-hub.en.json';

export const dynamic = 'force-dynamic';

const HERE = '/admin/rules';
const KEY = 'rules';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'rulesHub.metaTitle'), robots: { index: false, follow: false } };
}

export default async function RulesHubPage({ searchParams }: { searchParams: Promise<{ rule?: string }> }) {
  const { rule } = await searchParams;
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('rules.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} ready />;

  const a = rulesAccess(access);
  const [hub, env, roles] = await Promise.all([
    rl.hubScreen({ ...a.deps, settings: deps!.resolver }, a.who),
    rulesEnv(a),
    a.deps.db.role.findMany({ where: { archivedAt: null }, select: { key: true, nameEn: true, nameBn: true }, orderBy: [{ isSystem: 'desc' }, { nameEn: 'asc' }] }),
  ]);

  // PR 946: the courier score's accuracy report sits under its row (only while the score is on and the person may read orders' risk)
  const scoreOn = hub.rows.some((r) => r.id === 'score' && r.type === 'link' && r.pill === 'on');
  const accuracy = scoreOn
    ? await courierScoreAccuracy(readDeps(access.deps), { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx }).catch(() => null)
    : null;

  return (
    <AdminFrame view={view} current={KEY} ready crumb={false}>
      <RulesHub
        dict={view.dict}
        otherDict={(view.lang === 'bn' ? enWords : bnWords) as unknown as Dict}
        lang={view.lang}
        env={env}
        hub={hub}
        accuracy={accuracy}
        roles={roles.map((r) => ({ key: r.key, name: (view.lang === 'bn' ? r.nameBn : null) || r.nameEn }))}
        perms={{ write: a.perms.write, approve: a.perms.approve }}
        initialSel={rule && hub.rows.some((r) => r.id === rule && r.type === 'setting') ? rule : null}
      />
    </AdminFrame>
  );
}
