// S08 · PR 193 (CN-014 g; demo 97x-adm2-marketing.js "Eid order-by dates and pre-order", SIM-F-019) — Marketing ›
// Smart Rules › Eid dates at /admin/rules/eid, on the PR 214 follow-up's API (/api/admin/rules/eid): the switch, the
// Eid day and each delivery band's last day, a district's own date, the customer's words, pre-order with its advance
// (the owner's OK) and what the shop shows today. Reading needs `rules.read`; dates and words `rules.write`; the switch
// `rules.publish`; pre-order `rules.approve` — the API checks each again. Off as shipped, with no date (SIM-F-033).
// Guide: docs/admin-guide/pages/marketing/eid.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { EidScreen } from '@/components/admin/rules/EidScreen';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withEta } from '@/lib/admin-eta';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { rulesAccess } from '@/lib/admin-rules';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';
import '../../settings/settings.css';
import './eid.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/rules/eid';
const KEY = 'eidDates';

export async function generateMetadata(): Promise<Metadata> {
  const view = withEta(await adminView());
  return { title: t(view.dict, 'eta.eid.metaTitle'), robots: { index: false, follow: false } };
}

export default async function EidPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('rules.read', deps, MOTHER_STORE_ID)]);
  const view = withEta(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="rules.read" />
      </div>
    );
  const a = rulesAccess(access);
  const [screen, ctx] = await Promise.all([rl.getEidScreen(a.deps, a.who), rl.textContext(a.deps, a.storeId)]);
  return (
    <div className="a2-z" data-testid="eid-page">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'eta.eid.title')} sub={t(d, 'eta.eid.sub')} />
      <SectionTabs view={view} current={KEY} />
      <EidScreen d={d} lang={view.lang} timeZone={ctx.timeZone} currency={ctx.currency} data={screen} />
    </div>
  );
}
