// S06 · PR 161 — ORD-06 Risk rules at /admin/orders/risk-rules (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3
// #/admin/orders/risk-rules; CN-018 (2) "the page lives at Orders → Risk rules"): its Levels card first — what follows
// when an order's score lands in a band (a watch mark, a hold, a call, the advance proposed); PR 542: under it the
// Advance request card (send the proposal by itself — off; the ways ticked first; the pay link's service). The risk matrix, the rule
// switches (PR 544's API), the duplicate rules, the blocklist and protection & learning join with their PRs. Seeing needs
// `risk.rules.read`, saving `risk.rules.write`; the API checks both again. Everything ships off.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { advanceSettings, riskLevels } from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { AdvanceRequestCard } from '@/components/admin/orders/AdvanceRequestCard';
import { RiskLevels } from '@/components/admin/orders/RiskLevels';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { advanceCardScreen, advanceCardTexts } from '@/lib/admin-orders/advance-card';
import { levelsScreen, levelsTexts } from '@/lib/admin-orders/risk-levels';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/risk-rules';
const KEY = 'riskRules';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: `${t(view.dict, 'orders.page.riskRules')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function RiskRulesPage() {
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess('risk.rules.read', deps, MOTHER_STORE_ID)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="risk.rules.read" />
      </div>
    );
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const canEdit = access.guard.permissions?.has('risk.rules.write') ?? false;
  const [data, adv] = await Promise.all([riskLevels(readDeps(access.deps), who), advanceSettings(readDeps(access.deps), who)]);
  const d = view.dict;
  return (
    <div className="a2-z" data-testid="risk-rules">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'orders.page.riskRules')} sub={t(d, 'orders.rr.sub')} />
      <SectionTabs view={view} current={KEY} />
      <RiskLevels screen={levelsScreen(view, data)} texts={levelsTexts(view)} canEdit={canEdit} />
      <AdvanceRequestCard screen={advanceCardScreen(adv)} texts={advanceCardTexts(view, adv.providers)} canEdit={canEdit} />
      <p className="a2-xs a2-mute a2-mt12">{t(d, 'orders.rr.later')}</p>
    </div>
  );
}
