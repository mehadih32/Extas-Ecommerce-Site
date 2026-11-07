// S02 · PR 72 follow-up 100 — Reports › Searches at /admin/reports/searches (CN-019: inside the analytics section): what
// shoppers searched for on the results page over 7, 30 or 90 days (`?days=`, never past the owner's longest period),
// the words that found no product (what customers look for that the shop lacks) and the most searched words. Words
// and counts only (lib/search-insights; never who searched). Off as shipped: More options holds the card
// (`search.insights`, /api/admin/search-insights). Seeing needs `reports.read`; the card's save `settings.write`.
// Follow-up 101: More options also holds "Popular words from real searches" (`search.popular`, off).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SummaryTiles } from '@/components/admin/lumen/SummaryTiles';
import { pct } from '@/components/admin/courier-report/PerfTable';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { figureTiles, type ReportFigure } from '@/lib/admin-lumen/figures';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { periodsOf, searchReport, type SearchWord } from '@/lib/search-insights';
import { insightsCards } from '@/lib/search-insights-api';
import { searchHref } from '@/lib/shop/search-model';
import { todayIn } from '@/lib/shop/theme';
import bn from '../../../../../messages/admin-searches.bn.json';
import en from '../../../../../messages/admin-searches.en.json';
import '../delivery/report.css';
import '../../settings-cards.css';
import './searches.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsSearches';
const HERE = '/admin/reports/searches';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'srch.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SearchesReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-lm-ready="" data-testid="searches-report">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const s = (k: string, v?: Record<string, string | number>) => t(d, `srch.${k}`, v);
  const cards = await insightsCards(access.deps);
  const card = cards['search.insights'];
  const pop = cards['search.popular'];
  const set = card.value;
  const periods = periodsOf(set.days);
  const asked = Number(sp.days);
  const days = periods.includes(asked) ? asked : (periods.find((p) => p >= 30) ?? periods[periods.length - 1]!);
  const tz = await access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID });
  // switched off, the words counted while it was on still show (nothing is deleted)
  const read = await searchReport(access.deps.db, MOTHER_STORE_ID, { today: todayIn(tz), days, rows: set.rows });
  const r = set.keep || read.searches > 0 ? read : null;
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: 'UTC', dateStyle: 'medium', numberingSystem: 'latn' });
  const shopLang = view.lang === 'bn' ? 'bn' : 'en';
  const kpis: ReportFigure[] = r
    ? [
        { id: 'searches', label: s('kpi.searches'), value: n(r.searches), n: r.searches, foot: s('kpi.searchesNote') },
        { id: 'empty', label: s('kpi.empty'), value: n(r.empty), n: r.empty, tone: r.empty ? 'warn' : undefined, foot: s('kpi.emptyNote', { pct: pct(r.searches ? r.empty / r.searches : null, view.locale) }) },
        { id: 'words', label: s('kpi.words'), value: n(r.words), n: r.words, foot: s('kpi.wordsNote') },
      ]
    : [];
  const texts: FieldsCardTexts = {
    h: s('set.h'),
    d: s('set.d'),
    save: s('set.save'),
    saving: s('set.saving'),
    saved: s('set.saved'),
    discard: s('set.discard'),
    unsaved: s('set.unsaved'),
    readOnly: s('set.readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`set.err.${k}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'switch', path: 'keep', label: s('set.keep'), help: s('set.keepHelp') },
    { kind: 'number', path: 'days', label: s('set.days'), help: s('set.daysHelp'), min: 7, max: 365 },
    { kind: 'number', path: 'rows', label: s('set.rows'), help: s('set.rowsHelp'), min: 5, max: 200 },
  ];
  // follow-up 101: the empty search box's popular words from these counts, while the owner's own list is empty
  const popFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: s('pop.on'), help: s('pop.onHelp') },
    { kind: 'number', path: 'days', label: s('pop.days'), help: s('pop.daysHelp'), min: 7, max: 90 },
    { kind: 'number', path: 'min', label: s('pop.min'), help: s('pop.minHelp'), min: 1, max: 100 },
    { kind: 'number', path: 'max', label: s('pop.max'), help: s('pop.maxHelp'), min: 1, max: 12 },
  ];
  const table = (rows: readonly SearchWord[], first: 'searches' | 'empty', testId: string) => (
    <div className="a2-tblw">
      <table className="a2-tbl" data-testid={testId}>
        <thead>
          <tr>
            <th>{s('col.word')}</th>
            <th className="r">{s(`col.${first}`)}</th>
            <th className="r">{s(`col.${first === 'searches' ? 'empty' : 'searches'}`)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.term} data-testid="search-word">
              <td className="a2-tdh">
                <a className="srch-w" href={searchHref(shopLang, w.term)} target="_blank" rel="noopener" title={s('open')}>
                  <b>{w.term}</b>
                </a>
              </td>
              <td className="r" data-l={s(`col.${first}`)}>
                {n(first === 'searches' ? w.searches : w.empty)}
              </td>
              <td className="r" data-l={s(`col.${first === 'searches' ? 'empty' : 'searches'}`)}>
                {n(first === 'searches' ? w.empty : w.searches)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="a2-z lm-rp" data-lm-ready="" data-testid="searches-report" data-days={days} data-on={set.keep ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!set.keep ? (
        <section className="a2-card a2-mt12" data-testid="report-off">
          <p className="a2-sm">{s('off')}</p>
        </section>
      ) : null}
      {r ? (
        <>
          <nav className="a2-views a2-mt12" aria-label={s('period.label')} data-testid="search-periods">
            {periods.map((p) => (
              <Link key={p} className={`a2-view cr-tap${p === days ? ' on' : ''}`} href={`${HERE}?days=${p}`} aria-current={p === days ? 'page' : undefined}>
                {s('period.d', { n: n(p) })}
              </Link>
            ))}
          </nav>
          <p className="a2-xs a2-mute" data-testid="report-range">
            {s('range', { from: day.format(new Date(`${r.from}T00:00:00Z`)), to: day.format(new Date(`${r.to}T00:00:00Z`)) })}
          </p>
          <SummaryTiles className="a2-mt12" tiles={figureTiles(kpis, { locale: view.locale })} label={s('title')} testId="searches-kpis" />
          <div className="a2-row a2-r2 a2-mt12">
            <section className="a2-card" data-testid="search-missing">
              <div className="a2-ch">
                <div>
                  <h2 className="a2-h3">{s('missing.title')}</h2>
                  <div className="a2-cs">{s('missing.sub')}</div>
                </div>
              </div>
              {r.missing.length ? table(r.missing, 'empty', 'missing-table') : <p className="a2-sm a2-mute a2-mt6">{s('missing.none')}</p>}
            </section>
            <section className="a2-card" data-testid="search-top">
              <div className="a2-ch">
                <div>
                  <h2 className="a2-h3">{s('top.title')}</h2>
                  <div className="a2-cs">{s('top.sub')}</div>
                </div>
              </div>
              {r.top.length ? table(r.top, 'searches', 'top-table') : <p className="a2-sm a2-mute a2-mt6">{s('top.none')}</p>}
            </section>
          </div>
          <p className="a2-xs a2-mute a2-mt12">{s('note')}</p>
        </>
      ) : null}
      <details className="a2-mt12 a2-more-opts" data-testid="search-more-opts" open={!set.keep && canEdit}>
        <summary className="a2-sm a2-b">{s('set.more')}</summary>
        <div className="a2-mt12">
          <FieldsCard url="/api/admin/search-insights" screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="search-insights-card" />
          <FieldsCard url="/api/admin/search-insights" screen={{ key: pop.key, value: pop.value, version: pop.version }} fields={popFields} texts={{ ...texts, h: s('pop.h'), d: s('pop.d') }} canEdit={canEdit} testId="search-popular-card" />
        </div>
      </details>
    </div>
  );
}
