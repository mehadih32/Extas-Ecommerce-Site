// S04 · PR 558 — the Parameter for Checkout at /admin/orders/risk-rules/checkout (Orders › Risk rules, ORD-06 of the
// demo V12.3 "Checkout advance layers"; docs/ADMIN-ARCHITECTURE.md: risk rules sit with orders): its own panel, mixed
// with no earlier parameter — the one switch (`checkout.advance`, off), the layers (what counts as a flag, what each
// asks for) and the most layers under "More options". Seeing needs `risk.rules.read`; saving `risk.rules.write`.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { registry } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CheckoutLayers, type AdvancePanel } from '@/components/admin/orders/CheckoutLayers';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-advance.bn.json';
import en from '../../../../../../messages/admin-advance.en.json';
import '../../../settings/settings.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/risk-rules/checkout';
const KEY = 'checkoutAdvance';

/** The admin dictionary with this screen's own messages under `advance.*`. */
function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, advance: (view.lang === 'bn' ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'advance.metaTitle'), robots: { index: false, follow: false } };
}

/** The panel as the client part takes it (each layer with its own list key). */
function panelOf(l: od.LayerList): AdvancePanel {
  return { ...l, layers: l.layers.map((x) => ({ ...x, key: x.id })) };
}

export default async function CheckoutAdvancePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('risk.rules.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="risk.rules.read" />
      </div>
    );
  const who: od.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const list = await od.checkoutLayers({ db: access.deps.db, settings: access.deps.resolver }, who);
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `advance.${k}`, vars);
  const canWrite = access.guard.permissions?.has('risk.rules.write') ?? false;
  const live = list.layers.filter((l) => l.enabled).length;

  return (
    <div className="a2-z" data-testid="advance-page">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="advance-kpi-state" data-on={list.enabled ? 'on' : 'off'}>
          <div className="a2-kl">{c('kpi.state')}</div>
          <div className="a2-kv a2-sm">{c(list.enabled ? 'kpi.on' : 'kpi.off')}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('kpi.layers')}</div>
          <div className="a2-kv a2-sm">{c('kpi.layersOf', { n: list.layers.length, max: list.maxLayers })}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('kpi.live')}</div>
          <div className="a2-kv a2-sm">{c('kpi.liveOf', { n: live })}</div>
        </div>
      </div>

      <div className="a2-note a2-mt12">
        <ShellIcon name="shield" size={16} />
        <div>
          <b>{c('safe.title')}</b> {c('safe.text')}
        </div>
      </div>

      <div className="a2-mt12">
        <CheckoutLayers d={d} lang={view.lang === 'bn' ? 'bn' : 'en'} panel={panelOf(list)} canWrite={canWrite} defaultMax={registry['checkout.advance'].default.maxLayers} />
      </div>
    </div>
  );
}
