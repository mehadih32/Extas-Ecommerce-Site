// S14 · PR 288 onwards — Customers › More › Customer settings at /admin/customers/settings (CUS section settings,
// docs/ADMIN-ARCHITECTURE.md: settings inside their section, rare options under More): one card per CRM feature, each
// off as shipped — the journey view first (PR 288); later CRM PRs add their cards here. Seeing needs `customers.read`;
// saving needs `customers.settings`, which the API checks again (schema-checked, audited).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { JOURNEY_KINDS } from '@extas/customers/pure';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CrmSettingCard, type CrmField } from '@/components/admin/customers/CrmSettingCard';
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
  const s = await cu.crmSettingsScreen(customersDeps(access.deps), who);
  const cdict: Dict = { cus: d.cus as Dict };
  return (
    <div className="a2-z" data-testid="customer-settings">
      <PageHead view={view} place={locateKey('customersSettings')} title={t(d, 'cus.set.title')} sub={t(d, 'cus.set.sub')} />
      <SectionTabs view={view} current="customersSettings" />
      <div className="a2-row a2-r2 a2-mt12">
        {CARDS.map((c) => (
          <CrmSettingCard key={c.key} dict={cdict} settingKey={c.key} card={c.card} fields={c.fields} value={s.values[c.key] as unknown as Record<string, unknown>} canWrite={s.canWrite} />
        ))}
      </div>
    </div>
  );
}
