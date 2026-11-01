// S16 · PR 350 — Money → VAT at /admin/money/vat (B3.10, Blueprint §59 answer 23: "VAT system present and dynamic per
// product/category, off for now"): the VAT system's switch (off as shipped) and the owner's rates — a default, per
// category and per product, empty as shipped. Seeing needs `books.read`; changing needs `vat.manage`. Prices are VAT
// inclusive, so nothing here changes a price, a delivery charge or COD. Words: messages/admin-vat.*.json.
// PR 537: below the rates, the VAT report of a period (only while the system is on) and its CSV (lib/vat-report.ts).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { vatInsideMinor, ymdIn } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { VatReportSection } from '@/components/admin/money/VatReportSection';
import { VatScreen } from '@/components/admin/money/VatScreen';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { parseReportQuery, QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';
import { bpsToPercent, vatView } from '@/lib/vat-api';
import { vatReportFor } from '@/lib/vat-report';
import bn from '../../../../../messages/admin-vat.bn.json';
import en from '../../../../../messages/admin-vat.en.json';
import reportBn from '../../../../../messages/admin-cost-report.bn.json';
import reportEn from '../../../../../messages/admin-cost-report.en.json';
import '../../settings-cards.css';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyVat';
const HERE = '/admin/money/vat';

function withScreen(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, moneyVat: (b ? bn : en).moneyVat as unknown as Dict, moneyCostReport: (b ? reportBn : reportEn).moneyCostReport as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyVat.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function VatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const at = { storeId: MOTHER_STORE_ID };
  const [v, currency, timeZone, limits] = await Promise.all([vatView(access.deps.db, access.deps, MOTHER_STORE_ID), access.deps.resolver.value('store.currency', at), access.deps.resolver.value('store.timeZone', at), access.deps.resolver.value('costs.report', at)]);
  const today = ymdIn(new Date(), timeZone);
  const { q, notes } = parseReportQuery(sp, today, limits);
  const report = await vatReportFor(access.deps, MOTHER_STORE_ID, q.from, q.to);
  const asked = QUICK_PERIODS.find((p) => p === sp.period);
  const current =
    asked ??
    QUICK_PERIODS.find((p) => {
      const x = quickPeriod(p, today);
      return x.from === q.from && x.to === q.to;
    });
  const canEdit = access.guard.permissions?.has('vat.manage') ?? false;
  const money = moneyOf(currency, view.locale);
  // A round price of 1,000 in the store's currency, to show what the saved default rate means.
  const price = 1_000 * 10 ** money.digits;
  const bps = v.rates.value?.defaultBps ?? null;
  const example = bps === null ? null : { price: formatMoney(price, money), vat: formatMoney(vatInsideMinor(price, bps), money), pct: bpsToPercent(bps) };
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const names = v.categoryNames;
  const categoryName = (id: string | null) => {
    const n = id ? names[id] : undefined;
    return n ? (view.lang === 'bn' && n.nameBn ? n.nameBn : n.nameEn) : (id ?? '');
  };
  return (
    <div className="a2-z" data-testid="vat-page">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'moneyVat.title')} sub={t(view.dict, 'moneyVat.sub')} />
      <SectionTabs view={view} current={KEY} />
      {/* Keyed by the saved versions, so the fields start again from what was saved after each save. */}
      <VatScreen key={`${v.system.version}-${v.rates.version}`} dict={view.dict} lang={view.lang === 'bn' ? 'bn' : 'en'} view={v} canEdit={canEdit} example={example} />
      <VatReportSection
        dict={view.dict}
        here={HERE}
        today={today}
        from={q.from}
        to={q.to}
        current={current}
        notes={notes}
        limits={limits}
        report={report}
        money={(minor) => formatMoney(minor, money)}
        dayText={dayText}
        categoryName={categoryName}
      />
    </div>
  );
}
