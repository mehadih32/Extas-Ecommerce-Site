// S14 · PR 285 — Customers → All customers at /admin/customers (CUS-01, docs/BACKEND-ARCHITECTURE.md §5.5; demo V12.4
// #/admin/customers): one row per person with the owner's views and their counts, the search and filters in the address
// (`?view=&q=&source=&sort=&page=`, so a link opens the same list), the table and "More". Reading needs `customers.read`
// in the store (the numbers are masked without `customers.phone`); the customers service checks the key again. The list
// has no export (PR 299 brings one, with its own key).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CustomerListPage } from '@/components/admin/customers/CustomerList';
import { moneyOf } from '@/components/admin/products/model';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { customersHref, parseCustomerQuery } from '@/lib/admin-customers/model';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { customersDeps } from '@/lib/customers-api';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'cus.list.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('customers.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(plain);
  const query = parseCustomerQuery(sp);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(customersHref(query))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="customers" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="customers.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const cd = customersDeps(access.deps);
  const [data, settings, currency] = await Promise.all([
    cu.customerList(cd, who, query),
    cd.settings.value('customers.list', { storeId: MOTHER_STORE_ID }),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
  ]);
  return <CustomerListPage view={view} data={data} query={query} settings={settings} money={moneyOf(currency, view.locale)} hrefOf={(id) => `/admin/customers/${id}`} />;
}
