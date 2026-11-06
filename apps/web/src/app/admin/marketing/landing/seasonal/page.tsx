// S12 · PR 246 (Blueprint answer 15; ADMIN-ARCHITECTURE "Landing pages: campaign and seasonal landing pages … PR 254–255,
// 246, 530") — Marketing › Landing pages › Seasonal pages at /admin/marketing/landing/seasonal: the permanent pages for
// Eid, winter, Puja and the owner's own occasions, each with its occasion, collection, state and when it was last live;
// the views All / Live / Archived, "Create" and the settings card (`marketing.seasonal`, off as it ships). Seeing needs
// `marketing.landing.read`; creating and the card need `marketing.landing.write`. Guide:
// docs/admin-guide/pages/marketing/seasonal.md.
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
import { occasionName } from '@/lib/marketing/seasonal-model';
import { seasonalList } from '@/lib/marketing/seasonal';
import bn from '../../../../../../messages/admin-seasonal.bn.json';
import en from '../../../../../../messages/admin-seasonal.en.json';
import '../../../settings-cards.css';
import '../landing.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/landing/seasonal';
const API = '/api/admin/marketing/seasonal-pages';
const KEY = 'marketingSeasonal';
const VIEWS = ['all', 'live', 'archived'] as const;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sp.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ v?: string }> };

export default async function SeasonalPagesPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.landing.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="seasonal-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.landing.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `sp.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const day = (iso: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  const canWrite = access.guard.permissions?.has('marketing.landing.write') ?? false;
  const v = (VIEWS as readonly string[]).includes(sp.v ?? '') ? (sp.v as (typeof VIEWS)[number]) : 'all';
  const l = await seasonalList(access.deps.db, access.deps.resolver);
  const set = l.card.value;
  const lang = view.lang === 'bn' ? 'bn' : 'en';
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
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`card.err.${k}`)])),
  };
  const kpis = [
    { k: 'live', v: l.kpis.live, foot: '' },
    { k: 'resting', v: l.kpis.resting, foot: s('kpi.restingFoot') },
    { k: 'pages', v: l.kpis.pages, foot: '' },
  ];

  return (
    <div className="a2-z" data-testid="seasonal-page" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={s('title')}
        sub={s('sub')}
        right={
          <div className="lp-acts">
            <Link className="a2-btn" href="/admin/marketing/landing" data-testid="sp-landing-link">
              {s('landing')}
            </Link>
            {canWrite ? (
              <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="sp-create">
                {s('create')}
              </Link>
            ) : null}
          </div>
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!set.enabled ? (
        <div className="a2-note a2-mt12" role="note" data-testid="sp-off">
          {s('off')}
        </div>
      ) : null}
      <div className="a2-kpis a2-mt12" data-testid="sp-kpis">
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
          <table className="a2-tbl" data-testid="sp-table">
            <thead>
              <tr>
                <th>{s('col.page')}</th>
                <th>{s('col.occasion')}</th>
                <th>{s('col.collection')}</th>
                <th>{s('col.lastLive')}</th>
                <th>{s('col.state')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="sp-row">
                  <td>
                    <Link className="a2-b lp-name" href={`${HERE}/${r.id}`}>
                      {r.title}
                    </Link>
                    <span className="a2-mono a2-xs a2-mute lp-slug">/collections/{r.slug}</span>
                  </td>
                  <td className="a2-sm">{r.occasion ? occasionName(set.occasions, r.occasion, lang) : s('none')}</td>
                  <td className="a2-sm">{r.collectionName ?? s('none')}</td>
                  <td className="a2-sm">{r.lastLive ? day(r.lastLive) : s('never')}</td>
                  <td>
                    <span className={`a2-pill${r.state === 'live' ? ' ok' : r.state === 'off' ? ' warn' : ''}`}>{s(`state.${r.state}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-card a2-mt12 lp-empty" data-testid="sp-empty">
          <b>{s('empty')}</b>
          <p className="a2-sm a2-mute">{s('emptySub')}</p>
        </div>
      )}
      <div className="a2-mt12">
        <FieldsCard
          url={API}
          screen={{ key: l.card.key, value: l.card.value, version: l.card.version }}
          fields={[
            { kind: 'switch', path: 'enabled', label: s('card.on') },
            { kind: 'switch', path: 'offSeason', label: s('card.offSeason'), help: s('card.offSeasonHelp') },
            { kind: 'number', path: 'productsMax', label: s('card.productsMax'), min: 1, max: 60 },
            { kind: 'number', path: 'articlesMax', label: s('card.articlesMax'), min: 1, max: 12 },
            { kind: 'checks', path: 'cutoffOccasions', label: s('card.cutoff'), options: set.occasions.map((o) => ({ value: o.key, label: o[lang] || o.en })) },
            {
              kind: 'rows',
              path: 'occasions',
              label: s('card.occasions'),
              help: s('card.occasionsHelp'),
              max: 20,
              add: s('card.add'),
              remove: s('card.remove'),
              empty: s('card.emptyOcc'),
              columns: [
                { kind: 'text', key: 'key', label: s('card.occKey'), max: 30 },
                { kind: 'text', key: 'en', label: s('card.occEn'), max: 40 },
                { kind: 'text', key: 'bn', label: s('card.occBn'), max: 40, lang: 'bn' },
              ],
            },
          ]}
          texts={texts}
          canEdit={canWrite}
          testId="sp-settings"
        />
      </div>
    </div>
  );
}
