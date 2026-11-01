// S16 · PR 350 — Money → VAT at /admin/money/vat (B3.10, Blueprint §59 answer 23: "VAT system present and dynamic per
// product/category, off for now"): the VAT system's switch (off as shipped) and the owner's rates — a default, per
// category and per product, empty as shipped. Seeing needs `books.read`; changing needs `vat.manage`. Prices are VAT
// inclusive, so nothing here changes a price, a delivery charge or COD. Words: messages/admin-vat.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { vatInsideMinor } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { VatScreen } from '@/components/admin/money/VatScreen';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { bpsToPercent, vatView } from '@/lib/vat-api';
import bn from '../../../../../messages/admin-vat.bn.json';
import en from '../../../../../messages/admin-vat.en.json';
import '../../settings-cards.css';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyVat';
const HERE = '/admin/money/vat';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, moneyVat: (view.lang === 'bn' ? bn : en).moneyVat as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyVat.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function VatPage() {
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
  const [v, currency] = await Promise.all([vatView(access.deps.db, access.deps, MOTHER_STORE_ID), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const canEdit = access.guard.permissions?.has('vat.manage') ?? false;
  const money = moneyOf(currency, view.locale);
  // A round price of 1,000 in the store's currency, to show what the saved default rate means.
  const price = 1_000 * 10 ** money.digits;
  const bps = v.rates.value?.defaultBps ?? null;
  const example = bps === null ? null : { price: formatMoney(price, money), vat: formatMoney(vatInsideMinor(price, bps), money), pct: bpsToPercent(bps) };
  return (
    <div className="a2-z" data-testid="vat-page">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'moneyVat.title')} sub={t(view.dict, 'moneyVat.sub')} />
      <SectionTabs view={view} current={KEY} />
      {/* Keyed by the saved versions, so the fields start again from what was saved after each save. */}
      <VatScreen key={`${v.system.version}-${v.rates.version}`} dict={view.dict} lang={view.lang === 'bn' ? 'bn' : 'en'} view={v} canEdit={canEdit} example={example} />
    </div>
  );
}
