// CN-028 · PR 618 (CN-029 Phase 1) — Money → Costs at /admin/money/costs (docs/RETAIL-ERP-MODEL.md §3.3,
// docs/erp/site-changes-v6.md §2.11): the owner sets each month's fixed costs (salary, rent, utilities, other; a new
// version on each change, sent by `PUT /fixed-costs/{month}`, shown spread by day with the ERP's rule) and enters the
// daily cost lines (packaging, accessories, payment and COD fees, courier, ads, other) that feed each day's summary; a
// wrong cost is reversed, never edited. The amounts are owner data: the page ships empty and asks for no number. Seeing
// it needs `books.read`; writing needs `fixedcosts.write` (the daily cost lines alone: `costlines.write`, follow-up 567). Before the store's switch-over to contract v6 it says so and
// takes nothing. Nothing here moves money. Words: messages/admin-costs.*.json (`moneyCosts.*`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BudgetsExpensesSection } from '@/components/admin/money/BudgetsExpensesSection';
import { CostsScreen } from '@/components/admin/money/CostsScreen';
import { FixedCostsSection } from '@/components/admin/money/FixedCostsSection';
import { moneyOf } from '@/components/admin/products/model';
import { PrintButton } from '@/components/admin/reports/PrintButton';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { withLaneF } from '@/lib/admin-lane-f';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { costsScreen, staffCostsCard, statementCostsCard } from '@/lib/costs-api';
import { costsOverview } from '@/lib/costs-page';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { inventoryDeps } from '@/lib/inventory-api';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-costs.bn.json';
import en from '../../../../../messages/admin-costs.en.json';
import budgetsBn from '../../../../../messages/admin-budgets.bn.json';
import budgetsEn from '../../../../../messages/admin-budgets.en.json';
import '../money.css';
import '../costs-page.css';
import '../../wave4b.css';
import '../../settings/settings.css';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyCosts';
const HERE = '/admin/money/costs';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, moneyCosts: (view.lang === 'bn' ? bn : en).moneyCosts as unknown as Dict, moneyBudgets: (view.lang === 'bn' ? budgetsBn : budgetsEn).moneyBudgets as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyCosts.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CostsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID)]);
  const view = withLaneF(withScreen(plain));
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="costs-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const who: inv.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const idep = await inventoryDeps(access.deps);
  const at = { storeId: MOTHER_STORE_ID };
  const [screen, currency, resendDays, stCard, staff] = await Promise.all([costsScreen(idep, who), access.deps.resolver.value('store.currency', at), access.deps.resolver.value('books.resend.days', at), statementCostsCard(access.deps, MOTHER_STORE_ID), staffCostsCard(access.deps, MOTHER_STORE_ID)]);
  const canEdit = access.guard.permissions?.has('fixedcosts.write') ?? false;
  // PR 859: Pay salary is for the roles that hold both the fixed-costs and the cashbook rights (Accounts, owner); the cashbook asks for the PIN
  const canPaySalary = canEdit && (access.guard.permissions?.has('cash.record') ?? false);
  const cashAccounts = canPaySalary ? (await inv.cashbookView(idep, who, { limit: 1 })).accounts.filter((a) => !a.archived).map((a) => ({ key: a.key, name: view.locale === 'bn' && a.nameBn ? a.nameBn : a.nameEn })) : []; // hardcode-ok: only the account list is needed, one row is enough
  const canEnterLines = canEdit || (access.guard.permissions?.has('costlines.write') ?? false);
  const money = moneyOf(currency, view.locale);
  const overview = await costsOverview(access.deps, idep, who, staff.value.people, currency as string);
  const today = screen.fixed.today;
  const openFrom = [screen.fixed.startDay ?? today, inv.addDays(today, -resendDays)].sort().at(-1)!;
  // follow-up 565: the courier charges and gateway fees written by the imported statements (books.costs.fromStatements)
  const st = (key: string) => t(view.dict, `moneyCosts.fromStatements.${key}`);
  const stTexts: FieldsCardTexts = {
    h: st('h'),
    d: st('d'),
    save: st('save'),
    saving: st('saving'),
    saved: st('saved'),
    discard: st('discard'),
    unsaved: st('unsaved'),
    readOnly: st('readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, st(`err.${c}`)])),
  };
  const stFields: FieldsCardField[] = [
    { kind: 'switch', path: 'courierCharges', label: st('courier'), help: st('courierHelp') },
    { kind: 'switch', path: 'gatewayFees', label: st('gateway'), help: st('gatewayHelp') },
  ];
  return (
    <div className="a2-z" data-testid="costs-page" data-lm-ready="" data-linked={screen.fixed.linked ? 'yes' : 'no'}>
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={t(view.dict, 'lf.fh.budgets.title')}
        sub={t(view.dict, 'lf.fh.budgets.sub')}
        right={
          <>
            <PrintButton label={t(view.dict, 'lf.mn.act.dl')} testId="cs-dl" />
            <Link className="a2-btn" href="/admin/money/costs" data-testid="cs-fx">
              {t(view.dict, 'lf.fh.budgets.addHead')}
            </Link>
            <Link className="a2-btn pri" href="/admin/money/expenses" data-testid="cs-add">
              {t(view.dict, 'lf.fh.budgets.addExpense')}
            </Link>
          </>
        }
      />
      <SectionTabs view={view} current={KEY} />
      <FixedCostsSection
        dict={view.dict}
        locale={view.locale}
        money={money}
        people={[...staff.value.people]}
        version={staff.version}
        rows={overview.rows}
        changes={overview.changes}
        month={overview.month}
        day={overview.day}
        trend={overview.trend}
        perOrderMinor={overview.perOrderMinor}
        deliveriesAtPace={overview.deliveriesAtPace}
        canEdit={canEdit}
        canPay={canPaySalary}
        accounts={cashAccounts}
      />
      <BudgetsExpensesSection dict={view.dict} locale={view.locale} money={money} o={overview} canEdit={canEdit} />
      <details className="a2-card a2-mt12 fc-more" data-testid="costs-more">
        <summary className="a2-h3">{t(view.dict, 'moneyCosts.fc.more')}</summary>
        <p className="a2-cs">{t(view.dict, 'moneyCosts.fc.moreSub')}</p>
        <CostsScreen dict={view.dict} locale={view.locale} money={money} fixed={screen.fixed} entries={screen.entries.rows} entriesMore={screen.entries.more} entriesLimit={screen.entries.limit} noCostLines={screen.noCostLines} lines={inv.COST_LINE_ORDER} openFrom={openFrom} canEdit={canEdit} canEnterLines={canEnterLines} canPaySalary={canPaySalary} cashAccounts={cashAccounts} staff={{ people: [...staff.value.people], version: staff.version, rows: overview.rows }} />
        <div className="a2-mt12">
          <FieldsCard url="/api/admin/costs/statements" screen={{ key: stCard.key, value: { ...stCard.value }, version: stCard.version }} fields={stFields} texts={stTexts} canEdit={canEdit} testId="costs-from-statements" />
        </div>
      </details>
    </div>
  );
}
