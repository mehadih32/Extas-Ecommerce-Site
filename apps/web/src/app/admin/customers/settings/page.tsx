// S14 · PR 288 onwards — Customers › More › Customer settings at /admin/customers/settings (CUS section settings,
// docs/ADMIN-ARCHITECTURE.md: settings inside their section, rare options under More): one card per CRM feature, each
// off as shipped — the journey view first (PR 288); later CRM PRs add their cards here. PR 622 (CN-034): "Buy again"
// (`account.reorder`) with how many orders came from it in the last 30 days, above the cards. Seeing needs `customers.read`;
// saving needs `customers.settings`, which the API checks again (schema-checked, audited). PR 534: the "Customer grading"
// card picks its "good customer from" grade among the owner's own grades, which the grades card under it keeps.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { JOURNEY_KINDS } from '@extas/customers/pure';
import { REORDER_STATES, REORDER_WORDS, REORDER_WORDS_MAX } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CrmSettingCard, type CrmField } from '@/components/admin/customers/CrmSettingCard';
import { formatNumber } from '@/components/admin/products/model';
import { GradesEditor } from '@/components/admin/customers/GradesEditor';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';
import './settings.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/customers/settings';

/** Each card: its setting, its words' name and its fields, in the page's order. */
const CARDS: { key: cu.CrmPageSetting; card: string; fields: readonly CrmField[] }[] = [
  {
    key: 'customers.journey',
    card: 'journey',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'kinds', kind: 'multi', options: JOURNEY_KINDS },
      { name: 'perPage', kind: 'int' },
    ],
  },
  {
    // PR 293 — the AI campaign writer ("Write with AI" on Messages › E-mail)
    key: 'customers.aiWriter',
    card: 'aiWriter',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'versions', kind: 'int' },
      { name: 'smsMaxChars', kind: 'int' },
      { name: 'greeting', kind: 'lang', max: 200 },
      { name: 'signOff', kind: 'lang', max: 200 },
      { name: 'style', kind: 'lang', max: 200 },
    ],
  },
  {
    // PR 294 — who and when to send ("Who and when" on an e-mail send)
    key: 'customers.sendAdvice',
    card: 'sendAdvice',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'lookbackDays', kind: 'int' },
      { name: 'minOrders', kind: 'int' },
      { name: 'windowHours', kind: 'int' },
      { name: 'maxSegments', kind: 'int' },
    ],
  },
  {
    // PR 299 — the customer export ("Export" on the customer list, with a reason; the retention rule always applies)
    key: 'customers.export',
    card: 'export',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'maxRows', kind: 'int' },
    ],
  },
  {
    // PR 301 — the birthday field (My account › Profile), ready for the parked birthday module; nothing is sent for it
    key: 'customers.birthday',
    card: 'birthday',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'askYear', kind: 'bool' },
    ],
  },
  {
    // PR 303 — the customer report (Reports › Customers): when a buyer counts as quiet, how many segments it splits by
    key: 'customers.report',
    card: 'report',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'quietDays', kind: 'int' },
      { name: 'segmentsShown', kind: 'int' },
    ],
  },
  {
    // PR 533 — the customer history at approval (Orders › To confirm): how many earlier orders and reasons it shows
    key: 'customers.approvalHistory',
    card: 'approvalHistory',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'recent', kind: 'int' },
      { name: 'reasonsShown', kind: 'int' },
    ],
  },
  {
    // PR 622 (CN-034) — "Buy again" on a past order (the order page, and My orders when `inList`); fills the bag only
    key: 'account.reorder',
    card: 'reorder',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'inList', kind: 'bool' },
      { name: 'states', kind: 'multi', options: REORDER_STATES },
      { name: 'words', kind: 'words', keys: REORDER_WORDS, max: REORDER_WORDS_MAX },
    ],
  },
  {
    // PR 534 — customer grading: the switch, the verified mark's true deliveries (0 = none), how many grades are kept;
    // "good customer from" (the owner's grades) is added on the page
    key: 'customers.grades',
    card: 'grades',
    fields: [
      { name: 'enabled', kind: 'bool' },
      { name: 'verifiedMinDelivered', kind: 'int' },
      { name: 'maxGrades', kind: 'int' },
    ],
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'cus.set.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CustomerSettingsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('customers.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="customersSettings" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="customers.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const [s, gs] = await Promise.all([cu.crmSettingsScreen(customersDeps(access.deps), who), cu.gradesScreen(customersDeps(access.deps), who)]);
  const cdict: Dict = { cus: d.cus as Dict };
  // PR 534: "good customer from" offers the owner's live grades (none = grades do not feed the good-customer override)
  const gradeChoices = [{ value: '', label: t(d, 'cus.set.grades.goodNone') }, ...gs.grades.filter((g) => !g.archived).map((g) => ({ value: g.key, label: (view.lang === 'bn' && g.nameBn) || g.nameEn }))];
  const fieldsOf = (c: (typeof CARDS)[number]): readonly CrmField[] => (c.key === 'customers.grades' ? [...c.fields, { name: 'goodFrom', kind: 'choice', options: gradeChoices }] : c.fields);
  return (
    <div className="a2-z" data-testid="customer-settings">
      <PageHead view={view} place={locateKey('customersSettings')} title={t(d, 'cus.set.title')} sub={t(d, 'cus.set.sub')} />
      <SectionTabs view={view} current="customersSettings" />
      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="customer-settings-reordered" data-count={s.reordered}>
          <div className="a2-kl">{t(d, 'cus.set.kpi.reordered')}</div>
          <div className="a2-kv">{formatNumber(s.reordered, view.locale)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{t(d, 'cus.set.kpi.days', { n: formatNumber(cu.REORDER_COUNT_DAYS, view.locale) })}</span>
          </div>
        </div>
      </div>
      <div className="a2-row a2-r2 a2-mt12">
        {CARDS.map((c) => (
          <CrmSettingCard key={c.key} dict={cdict} settingKey={c.key} card={c.card} fields={fieldsOf(c)} value={s.values[c.key] as unknown as Record<string, unknown>} canWrite={s.canWrite} />
        ))}
        <GradesEditor dict={cdict} grades={gs.grades} canWrite={gs.canWrite} enabled={gs.enabled} lang={view.lang} />
      </div>
    </div>
  );
}
