// S28 · PR 688 (admin prototype v5) — Finance › Budgets & profit at /admin/money/budgets: the profit snapshot (today, last 7 days,
// this month, and the monthly target when it is on), each cost against the budget the owner set with an "at this pace" status,
// "Edit budgets" (owner's PIN) and who can approve refunds (one approver is enough). Seeing it needs `books.read`; changing
// budgets `fixedcosts.write`. Words: messages/admin-budgets.*.json (`moneyBudgets.*`). Nothing here moves money.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BudgetsScreen } from '@/components/admin/money/BudgetsScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { budgetsScreen } from '@/lib/budgets-api';
import { t, type Dict } from '@/lib/i18n';
import { inventoryDeps } from '@/lib/inventory-api';
import bn from '../../../../../messages/admin-budgets.bn.json';
import en from '../../../../../messages/admin-budgets.en.json';
import '../money.css';
import '../../wave4b.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyBudgets';
const HERE = '/admin/money/budgets';

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      moneyBudgets: (view.lang === 'bn' ? bn : en).moneyBudgets as unknown as Dict,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: `${t(view.dict, 'moneyBudgets.metaTitle')} · ${t(view.dict, 'shell.admin')}`,
    robots: { index: false, follow: false },
  };
}

export default async function BudgetsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="budgets-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const who: inv.Who = {
    actor: access.guard.actor,
    storeId: MOTHER_STORE_ID,
    ctx: access.guard.ctx,
  };
  const idep = await inventoryDeps(access.deps);
  const [screen, currency] = await Promise.all([budgetsScreen(idep, who), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const canEdit = access.guard.permissions?.has('fixedcosts.write') ?? false;
  return (
    <div className="a2-z" data-testid="budgets-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'moneyBudgets.title')} sub={t(view.dict, 'moneyBudgets.sub')} />
      <SectionTabs view={view} current={KEY} />
      <BudgetsScreen dict={view.dict} lang={view.lang} money={moneyOf(currency, view.locale)} budgets={screen.budgets} snapshot={screen.snapshot} roles={screen.approvers.roles} canEdit={canEdit} />
    </div>
  );
}
