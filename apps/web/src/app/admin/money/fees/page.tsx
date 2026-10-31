// S16 · PR 345 — Money → Costs & fees at /admin/money/fees (BACKEND-ARCHITECTURE §5 MNY-06): the owner's own cost inputs —
// payment gateway fees, the packaging cost of one order, the USD rate and the courier rates — with a link to the RTO
// cost inputs on Delivery → Couriers. All empty as shipped. Seeing needs `books.read`; saving needs `costs.write`.
// Nothing here charges, pays or changes a price, a delivery charge or COD. Words: messages/admin-fees.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FeesScreen } from '@/components/admin/money/FeesScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { feesView } from '@/lib/fees-api';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-fees.bn.json';
import en from '../../../../../messages/admin-fees.en.json';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyFees';
const HERE = '/admin/money/fees';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, moneyFees: (view.lang === 'bn' ? bn : en).moneyFees as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyFees.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function FeesPage() {
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
  const v = await feesView(access.deps.db, access.deps, MOTHER_STORE_ID);
  const canEdit = access.guard.permissions?.has('costs.write') ?? false;
  return (
    <div className="a2-z" data-testid="fees-page">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'moneyFees.title')} sub={t(view.dict, 'moneyFees.sub')} />
      <SectionTabs view={view} current={KEY} />
      <FeesScreen dict={view.dict} lang={view.lang === 'bn' ? 'bn' : 'en'} money={moneyOf(v.currency, view.locale)} view={v} canEdit={canEdit} />
    </div>
  );
}
