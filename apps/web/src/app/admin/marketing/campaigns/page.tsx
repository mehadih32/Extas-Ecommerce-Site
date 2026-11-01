// S13 · PR 256 (Blueprint C6.2, demo 93-admin-ads.js "Campaigns") — Marketing › Campaigns at /admin/marketing/campaigns:
// each campaign with its state, where it runs, its window, its planned budget, its landing pages and the orders they
// brought (delivered is the sale); views All / Running / Planned / Ended / Archived; "New campaign". Seeing needs
// `marketing.campaigns.read`; creating needs `marketing.campaigns.write`. The budget is a plan: nothing here changes an ad
// platform. Guide: docs/admin-guide/pages/marketing/campaigns.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { campaignList } from '@/lib/marketing/campaigns';
import bn from '../../../../../messages/admin-campaigns.bn.json';
import en from '../../../../../messages/admin-campaigns.en.json';
import '../../settings-cards.css';
import '../landing/landing.css';
import './campaigns.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/campaigns';
const KEY = 'marketingCampaigns';
const VIEWS = ['all', 'running', 'planned', 'ended', 'archived'] as const;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'cp.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ v?: string }> };

export default async function CampaignsPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `cp.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const v = (VIEWS as readonly string[]).includes(sp.v ?? '') ? (sp.v as (typeof VIEWS)[number]) : 'all';
  const [l, currency, timeZone] = await Promise.all([campaignList(access.deps.db), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }), access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID })]);
  const money = moneyOf(currency, view.locale);
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(view.locale, { timeZone, day: 'numeric', month: 'short', numberingSystem: 'latn' }).format(new Date(iso)) : '…');
  const rows = l.rows.filter((r) =>
    v === 'archived' ? r.state === 'ARCHIVED' : r.state === 'ARCHIVED' ? false : v === 'running' ? r.state === 'RUNNING' || r.state === 'PAUSED' : v === 'planned' ? r.state === 'DRAFT' || r.state === 'SCHEDULED' : v === 'ended' ? r.state === 'ENDED' : true,
  );
  const kpis = [
    { k: 'running', v: l.kpis.running, foot: '' },
    { k: 'planned', v: l.kpis.planned, foot: '' },
    { k: 'orders', v: l.kpis.orders, foot: s('kpi.ordersFoot') },
    { k: 'delivered', v: l.kpis.delivered, foot: s('kpi.deliveredFoot') },
  ];
  const pill = (st: string) => (st === 'RUNNING' ? ' ok' : st === 'PAUSED' ? ' warn' : '');

  return (
    <div className="a2-z" data-testid="campaigns-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={s('title')}
        sub={s('sub')}
        right={
          canWrite ? (
            <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="cp-create">
              {s('new')}
            </Link>
          ) : undefined
        }
      />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        {s('planNote')}
      </div>
      <div className="a2-kpis a2-mt12" data-testid="cp-kpis">
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
          <table className="a2-tbl" data-testid="cp-table">
            <thead>
              <tr>
                <th>{s('col.campaign')}</th>
                <th>{s('col.window')}</th>
                <th className="r">{s('col.budget')}</th>
                <th className="r">{s('col.pages')}</th>
                <th className="r">{s('col.orders')}</th>
                <th className="r">{s('col.delivered')}</th>
                <th>{s('col.state')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="cp-row">
                  <td>
                    <Link className="a2-b lp-name" href={`${HERE}/${r.id}`}>
                      {r.name}
                    </Link>
                    <span className="a2-xs a2-mute lp-slug">{r.channels.length ? r.channels.map((c) => s(`ch.${c}`)).join(' · ') : s('noChannel')}</span>
                  </td>
                  <td className="a2-sm">{r.startsAt || r.endsAt ? `${day(r.startsAt)} – ${day(r.endsAt)}` : s('none')}</td>
                  <td className="r a2-num">{r.budgetMinor == null ? s('none') : `${formatMoney(r.budgetMinor, money)} ${s(`bkShort.${r.budgetKind ?? 'TOTAL'}`)}`}</td>
                  <td className="r a2-num">{num(r.pages)}</td>
                  <td className="r a2-num">{num(r.orders)}</td>
                  <td className="r a2-num">{num(r.delivered)}</td>
                  <td>
                    <span className={`a2-pill${pill(r.state)}`}>{s(`state.${r.state}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-card a2-mt12 lp-empty" data-testid="cp-empty">
          <b>{s('empty')}</b>
          <p className="a2-sm a2-mute">{s('emptySub')}</p>
        </div>
      )}
    </div>
  );
}
