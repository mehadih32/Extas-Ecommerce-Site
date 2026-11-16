// S28 · PR 687 (admin prototype v5) — Finance › Money in & out at /admin/money/cash: every account's balance (cash, bank, bKash,
// Nagad …), this month's money in and out, every movement with the balance after it, "Record money" (owner put in or took money,
// other money in or out, a move between accounts; each asks for the owner's PIN) and a read-only forecast with the cash the
// couriers hold and the fixed costs due. A wrong entry is reversed, never edited. Seeing it needs `books.read`; recording
// `cash.record`. The switch is `books.cash.enabled`. Words: messages/admin-cash.*.json (`moneyCash.*`).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CashRecordButton, CashScreen } from '@/components/admin/money/CashScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { PrintButton } from '@/components/admin/reports/PrintButton';
import { withLaneF } from '@/lib/admin-lane-f';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { cashScreen } from '@/lib/cash-api';
import { matchSummary } from '@/lib/lane-f/match-summary';
import { t, type Dict } from '@/lib/i18n';
import { inventoryDeps } from '@/lib/inventory-api';
import bn from '../../../../../messages/admin-cash.bn.json';
import en from '../../../../../messages/admin-cash.en.json';
import '../money.css';
import '../../wave4b.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyCash';
const HERE = '/admin/money/cash';

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      moneyCash: (view.lang === 'bn' ? bn : en).moneyCash as unknown as Dict,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: `${t(view.dict, 'moneyCash.metaTitle')} · ${t(view.dict, 'shell.admin')}`,
    robots: { index: false, follow: false },
  };
}

export default async function CashPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withLaneF(withScreen(plain));
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="cash-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const who: inv.Who = {
    actor: access.guard.actor,
    storeId: MOTHER_STORE_ID,
    ctx: access.guard.ctx,
  };
  const idep = await inventoryDeps(access.deps);
  const [screen, currency, match] = await Promise.all([cashScreen(access.deps, idep, who), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }), matchSummary(access.deps.db, MOTHER_STORE_ID, new Date())]);
  const canRecord = access.guard.permissions?.has('cash.record') ?? false;
  return (
    <div className="a2-z" data-testid="cash-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'moneyCash.title')} sub={t(view.dict, 'moneyCash.sub')} right={
          <>
            <PrintButton label={t(view.dict, 'lf.mn.act.dl')} testId="cb-dl" />
            <CashRecordButton label={t(view.dict, 'moneyCash.record')} disabled={!canRecord || !screen.book.enabled} />
          </>
        } />
      <SectionTabs view={view} current={KEY} />
      <CashScreen dict={view.dict} lang={view.lang} money={moneyOf(currency, view.locale)} book={screen.book} forecast={screen.forecast} codHeldMinor={screen.codHeldMinor} canRecord={canRecord} match={match} showForecast={sp.more === '1'} />
    </div>
  );
}
