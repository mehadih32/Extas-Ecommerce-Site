// S28 · PR 690 (admin prototype v5) — Reports › Report packs at /admin/reports/packs: four ready packs (Monthly business, Bank,
// Stock, Sales) as a PDF on the shop's letterhead and a spreadsheet file, and a schedule for each (off as shipped; a short Telegram
// summary to the owner). Seeing and downloading needs `reports.read`. Words: messages/admin-reports-packs.*.json (`reportsPacks.*`).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import * as cat from '@extas/catalogue';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PacksScreen, type PackSchedule } from '@/components/admin/reports/PacksScreen';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { PACKS } from '@/lib/report-packs';
import { sellableReader } from '@/lib/shop/sellable';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-reports-packs.bn.json';
import en from '../../../../../messages/admin-reports-packs.en.json';
import '../../wave4b.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsPacks';
const HERE = '/admin/reports/packs';

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      reportsPacks: (view.lang === 'bn' ? bn : en).reportsPacks as unknown as Dict,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: `${t(view.dict, 'reportsPacks.metaTitle')} · ${t(view.dict, 'shell.admin')}`,
    robots: { index: false, follow: false },
  };
}

export default async function ReportsPacksPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="packs-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const who: inv.Who = {
    actor: access.guard.actor,
    storeId: MOTHER_STORE_ID,
    ctx: access.guard.ctx,
  };
  const cdep: cat.CatalogueDeps = { db: access.deps.db, settings: access.deps.resolver, now: access.deps.now, sellable: sellableReader(access.deps.db, access.deps.resolver, MOTHER_STORE_ID) };
  const schedules = await cat.listSchedules(cdep, who);
  return (
    <div className="a2-z" data-testid="packs-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'reportsPacks.title')} sub={t(view.dict, 'reportsPacks.sub')} />
      <SectionTabs view={view} current={KEY} />
      <PacksScreen dict={view.dict} packs={PACKS} schedules={schedules as PackSchedule[]} />
    </div>
  );
}
