// S13 · PR 254 (Blueprint MKT-05, demo 97x-adm2-marketing.js) — Marketing › Landing pages at /admin/marketing/landing:
// the pages made for ads (one product, an order box inside), the orders each brought and how many were delivered, the
// views All / Live / Archived, "Create" and the master switch's card (`marketing.landing`, off as it ships). Seeing needs
// `marketing.landing.read`; creating and the switch need `marketing.landing.write`. Guide:
// docs/admin-guide/pages/marketing/landing.md. PR 255: "Templates" opens the templates and the parts library.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { landingList } from '@/lib/marketing/landing';
import bn from '../../../../../messages/admin-landing.bn.json';
import en from '../../../../../messages/admin-landing.en.json';
import '../../settings-cards.css';
import './landing.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/landing';
const API = '/api/admin/marketing/landing-pages';
const KEY = 'marketingLanding';
const VIEWS = ['all', 'live', 'archived'] as const;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'lp.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ v?: string }> };

export default async function LandingPagesPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.landing.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.landing.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `lp.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const canWrite = access.guard.permissions?.has('marketing.landing.write') ?? false;
  const v = (VIEWS as readonly string[]).includes(sp.v ?? '') ? (sp.v as (typeof VIEWS)[number]) : 'all';
  const l = await landingList(access.deps.db, access.deps.resolver);
  const rows = l.rows.filter((r) => (v === 'archived' ? r.state === 'archived' : v === 'live' ? r.state === 'live' : r.state !== 'archived'));
  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: s('card.save'),
    saving: s('card.saving'),
    saved: s('card.saved'),
    discard: s('card.discard'),
    unsaved: s('card.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: s('card.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)])),
  };
  const kpis = [
    { k: 'live', v: l.kpis.live, foot: '' },
    { k: 'orders', v: l.kpis.orders, foot: s('kpi.ordersFoot') },
    { k: 'delivered', v: l.kpis.delivered, foot: s('kpi.deliveredFoot') },
  ];

  return (
    <div className="a2-z" data-testid="landing-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={s('title')}
        sub={s('sub')}
        right={
          <div className="lp-acts">
            <Link className="a2-btn" href={`${HERE}/templates`} data-testid="lp-templates-link">
              {s('templates')}
            </Link>
            {canWrite ? (
              <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="lp-create">
                {s('create')}
              </Link>
            ) : null}
          </div>
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!l.card.value.on ? (
        <div className="a2-note a2-mt12" role="note" data-testid="lp-off">
          {s('off')}
        </div>
      ) : null}
      <div className="a2-kpis a2-mt12" data-testid="lp-kpis">
        {kpis.map((x) => (
          <div key={x.k} className="a2-card a2-kpi">
            <div className="a2-kl">{s(`kpi.${x.k}`)}</div>
            <div className="a2-kv">{num(x.v)}</div>
            {x.foot ? (
              <div className="a2-kf">
                <span className="a2-kn">{x.foot}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <nav className="a2-views lp-views a2-mt12" aria-label={s('title')}>
        {VIEWS.map((n) => (
          <Link key={n} className={`a2-view${v === n ? ' on' : ''}`} href={n === 'all' ? HERE : `${HERE}?v=${n}`} aria-current={v === n ? 'page' : undefined}>
            {s(`views.${n}`)}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl" data-testid="lp-table">
            <thead>
              <tr>
                <th>{s('col.page')}</th>
                <th>{s('col.product')}</th>
                <th>{s('col.campaign')}</th>
                <th className="r">{s('col.orders')}</th>
                <th className="r">{s('col.delivered')}</th>
                <th>{s('col.state')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="lp-row">
                  <td>
                    <Link className="a2-b lp-name" href={`${HERE}/${r.id}`}>
                      {r.title}
                    </Link>
                    <span className="a2-mono a2-xs a2-mute lp-slug">/l/{r.slug}</span>
                  </td>
                  <td className="a2-sm">{r.productName ?? s('none')}</td>
                  <td className="a2-sm">{r.campaignName ?? s('none')}</td>
                  <td className="r a2-num">{num(r.orders)}</td>
                  <td className="r a2-num">{num(r.delivered)}</td>
                  <td>
                    <span className={`a2-pill${r.state === 'live' ? ' ok' : r.state === 'off' ? ' warn' : ''}`}>{s(`state.${r.state}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-card a2-mt12 lp-empty" data-testid="lp-empty">
          <b>{s('empty')}</b>
          <p className="a2-sm a2-mute">{s('emptySub')}</p>
        </div>
      )}
      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: l.card.key, value: l.card.value, version: l.card.version }} fields={[{ kind: 'switch', path: 'on', label: s('card.on') }]} texts={texts} canEdit={canWrite} testId="lp-settings" />
      </div>
    </div>
  );
}
