// CN-028 · PR 618 (CN-029 Phase 1) — Money → Costs at /admin/money/costs (docs/RETAIL-ERP-MODEL.md §3.3,
// docs/erp/site-changes-v6.md §2.11): the owner sets each month's fixed costs (salary, rent, utilities, other; a new
// version on each change, sent by `PUT /fixed-costs/{month}`, shown spread by day with the ERP's rule) and enters the
// daily cost lines (packaging, accessories, payment and COD fees, courier, ads, other) that feed each day's summary; a
// wrong cost is reversed, never edited. The amounts are owner data: the page ships empty and asks for no number. Seeing
// it needs `books.read`; writing needs `fixedcosts.write`. Before the store's switch-over to contract v6 it says so and
// takes nothing. Nothing here moves money. Words: messages/admin-costs.*.json (`moneyCosts.*`).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CostsScreen } from '@/components/admin/money/CostsScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { costsScreen } from '@/lib/costs-api';
import { inventoryDeps } from '@/lib/inventory-api';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-costs.bn.json';
import en from '../../../../../messages/admin-costs.en.json';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyCosts';
const HERE = '/admin/money/costs';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, moneyCosts: (view.lang === 'bn' ? bn : en).moneyCosts as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyCosts.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CostsPage() {
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
  const [screen, currency, resendDays] = await Promise.all([costsScreen(idep, who), access.deps.resolver.value('store.currency', at), access.deps.resolver.value('books.resend.days', at)]);
  const canEdit = access.guard.permissions?.has('fixedcosts.write') ?? false;
  const today = screen.fixed.today;
  const openFrom = [screen.fixed.startDay ?? today, inv.addDays(today, -resendDays)].sort().at(-1)!;
  return (
    <div className="a2-z" data-testid="costs-page" data-linked={screen.fixed.linked ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'moneyCosts.title')} sub={t(view.dict, 'moneyCosts.sub')} />
      <SectionTabs view={view} current={KEY} />
      <CostsScreen dict={view.dict} locale={view.locale} money={moneyOf(currency, view.locale)} fixed={screen.fixed} entries={screen.entries.rows} entriesMore={screen.entries.more} entriesLimit={screen.entries.limit} noCostLines={screen.noCostLines} lines={inv.COST_LINE_ORDER} openFrom={openFrom} canEdit={canEdit} />
    </div>
  );
}
