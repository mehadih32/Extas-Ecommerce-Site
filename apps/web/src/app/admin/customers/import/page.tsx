// S14 · PR 535 — Customers › More › Import old customers at /admin/customers/import (demo V12.4 97u-adm2-customers.js
// CUS-06): the old shop's order list brought in — a preview first, then history only (never overwrites a customer, never
// an order, never a message), and each past import with its undo (archived, never deleted). Seeing the page and the past
// imports needs `customers.read`; importing and undoing need `customers.import` and the owner's `customers.legacyImport`
// switch (off as shipped), which the API checks again.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { LegacyImport } from '@/components/admin/customers/LegacyImport';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';
import './import.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/customers/import';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'cus.imp.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CustomerImportPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('customers.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="customersImport" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="customers.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const s = await cu.legacyImportScreen(customersDeps(access.deps), who);
  const screen = { ...s, imports: s.imports.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), undoneAt: x.undoneAt ? x.undoneAt.toISOString() : null })) };
  const cdict: Dict = { cus: d.cus as Dict };
  return (
    <div className="a2-z" data-testid="customer-import">
      <PageHead view={view} place={locateKey('customersImport')} title={t(d, 'cus.imp.title')} sub={t(d, 'cus.imp.sub')} />
      <SectionTabs view={view} current="customersImport" />
      {!s.enabled ? (
        <div className="a2-gap8 a2-mt12" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }} data-testid="imp-off">
          <span className="a2-sm">{t(d, 'cus.imp.off')}</span>
          <Link className="a2-btn" href="/admin/customers/settings">
            {t(d, 'cus.imp.offLink')}
          </Link>
        </div>
      ) : !s.canImport ? (
        <p className="a2-sm a2-mt12">{t(d, 'cus.imp.readOnly')}</p>
      ) : null}
      <LegacyImport dict={cdict} screen={screen} locale={view.locale} timeZone={view.timeZone} />
    </div>
  );
}
