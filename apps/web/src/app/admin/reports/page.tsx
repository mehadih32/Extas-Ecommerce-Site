// S28 · PR 689 (admin prototype v5) — Reports › Report library at /admin/reports: pick a question, see the answer for a period
// (with compare), pin cards to Home, restock and unsold lists, orders by weekday and hour, last month's review, saved views.
// Seeing it needs `reports.read`. Words: messages/admin-reports-library.*.json (`reportsLibrary.*`). Read-only reports.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { PERIOD_PRESETS, type PeriodPreset } from '@extas/catalogue';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { LibraryScreen } from '@/components/admin/reports/LibraryScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { libraryScreen } from '@/lib/report-library-api';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../messages/admin-reports-library.bn.json';
import en from '../../../../messages/admin-reports-library.en.json';
import '../wave4b.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsLibrary';
const HERE = '/admin/reports';

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      reportsLibrary: (view.lang === 'bn' ? bn : en).reportsLibrary as unknown as Dict,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: `${t(view.dict, 'reportsLibrary.metaTitle')} · ${t(view.dict, 'shell.admin')}`,
    robots: { index: false, follow: false },
  };
}

export default async function ReportsLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const sp = await searchParams;
  const raw = typeof sp.preset === 'string' ? sp.preset : 'month';
  const preset = ((PERIOD_PRESETS as readonly string[]).includes(raw) ? raw : 'month') as PeriodPreset;
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="library-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const who: inv.Who = {
    actor: access.guard.actor,
    storeId: MOTHER_STORE_ID,
    ctx: access.guard.ctx,
  };
  const [screen, currency] = await Promise.all([libraryScreen(access.deps, who, preset), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  return (
    <div className="a2-z" data-testid="library-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'reportsLibrary.title')} sub={t(view.dict, 'reportsLibrary.sub')} />
      <SectionTabs view={view} current={KEY} />
      <LibraryScreen
        dict={view.dict}
        money={moneyOf(currency, view.locale)}
        preset={preset}
        compare={sp.compare === '1'}
        range={screen.range}
        cards={screen.cards}
        restock={screen.restock}
        time={screen.time}
        review={screen.review}
        views={screen.views}
        pins={screen.pins}
      />
    </div>
  );
}
