// S16 · PR 344 — Money → Expenses at /admin/money/expenses (B3.8; BACKEND-ARCHITECTURE §5 MNY-04): the owner's quick
// entry of a retail expense on a head he names, the month's expenses by head with a reverse on each, and the heads under
// "More options". Each expense goes to the ERP through PR 618's cost line on its head's line (one path, never typed
// twice). Seeing it needs `books.read`; entering needs `fixedcosts.write`. Before the store's switch to contract v6 it
// says so and takes nothing. Nothing here moves money. Words: messages/admin-expenses.*.json (`moneyExpenses.*`), the
// line names and the books errors from admin-costs.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ExpensesScreen } from '@/components/admin/money/ExpensesScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { expensesView } from '@/lib/expenses-api';
import { inventoryDeps } from '@/lib/inventory-api';
import { t, type Dict } from '@/lib/i18n';
import costsBn from '../../../../../messages/admin-costs.bn.json';
import costsEn from '../../../../../messages/admin-costs.en.json';
import bn from '../../../../../messages/admin-expenses.bn.json';
import en from '../../../../../messages/admin-expenses.en.json';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyExpenses';
const HERE = '/admin/money/expenses';

function withScreen(view: AdminView): AdminView {
  const bnOn = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, moneyExpenses: (bnOn ? bn : en).moneyExpenses as unknown as Dict, moneyCosts: (bnOn ? costsBn : costsEn).moneyCosts as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyExpenses.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ExpensesPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const who: inv.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const idep = await inventoryDeps(access.deps);
  const at = { storeId: MOTHER_STORE_ID };
  const [fixed, currency, resendDays, receipts] = await Promise.all([inv.fixedCostsView(idep, who), access.deps.resolver.value('store.currency', at), access.deps.resolver.value('books.resend.days', at), access.deps.resolver.value('costs.receipts', at)]);
  const today = fixed.today;
  const openFrom = [fixed.startDay ?? today, inv.addDays(today, -resendDays)].sort().at(-1)!;
  const v = await expensesView(access.deps.db, MOTHER_STORE_ID, today.slice(0, 7));
  const canEdit = access.guard.permissions?.has('fixedcosts.write') ?? false;
  return (
    <div className="a2-z" data-testid="expenses-page" data-linked={fixed.linked ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'moneyExpenses.title')} sub={t(view.dict, 'moneyExpenses.sub')} />
      <SectionTabs view={view} current={KEY} />
      <ExpensesScreen dict={view.dict} lang={view.lang === 'bn' ? 'bn' : 'en'} money={moneyOf(currency, view.locale)} view={v} lines={inv.COST_LINE_ORDER} today={today} openFrom={openFrom} linked={fixed.linked} canEdit={canEdit} receipts={receipts} />
    </div>
  );
}
