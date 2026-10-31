// S21 · PR 419 (B7.3) — Reports › Site health › Run history at /admin/reports/health/history: every smoke test and
// saved-journeys run, newest first, with what passed and failed and how many findings; by tool and by result, a page
// at a time; each run opens with its findings compared with the run before (history/[id]). Seeing needs `health.read`.
// Old runs are kept; nothing here deletes or changes one (lib/admin-health/history.ts).
// PR 424: the "Telegram when a test fails" card (`health.runAlerts`, `settings.write`; lib/admin-health/run-alerts.ts)
// and what the server last said about each test.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { RUN_TOOLS } from '@extas/jobs';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { historyView, type HistoryRow } from '@/lib/admin-health/history';
import { runAlertsView, type RunAlertState } from '@/lib/admin-health/run-alerts';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import hbn from '../../../../../../messages/admin-health.bn.json';
import hen from '../../../../../../messages/admin-health.en.json';
import '../../../settings-cards.css';
import '../health.css';
import { kindKey } from './kinds';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/health/history';
const ALERTS_API = '/api/admin/health/run-alerts';
const KEY = 'healthHistory';

function withScreen(view: AdminView): AdminView {
  const extra = (view.lang === 'bn' ? [hbn] : [hen]) as unknown as Dict[];
  return { ...view, dict: Object.assign({}, view.dict, ...extra) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'hst.metaTitle'), robots: { index: false, follow: false } };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function RunHistoryPage({ searchParams }: { searchParams: Promise<{ tool?: string | string[]; result?: string | string[]; page?: string | string[] }> }) {
  const deps = adminDeps();
  const q = await searchParams;
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('health.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="health.read" />
      </div>
    );
  const who = { actor: access.guard.actor, ctx: access.guard.ctx };
  const [v, alerts] = await Promise.all([
    historyView({ db: access.deps.db, now: access.deps.now }, who, { tool: one(q.tool), result: one(q.result), page: one(q.page) }),
    runAlertsView({ db: access.deps.db, resolver: access.deps.resolver }, who),
  ]);
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `hst.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const kind = (k: string) => s(`kind.${kindKey(k)}`, { kind: k });
  const href = (o: { tool?: string; result?: string; page?: number }) => {
    const p = new URLSearchParams();
    const tool = o.tool ?? v.tool;
    const result = o.result ?? v.result;
    if (tool !== 'all') p.set('tool', tool);
    if (result !== 'all') p.set('result', result);
    if (o.page && o.page > 1) p.set('page', String(o.page));
    const qs = p.toString();
    return qs ? `${HERE}?${qs}` : HERE;
  };
  const stamp = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const when = (r: HistoryRow) => r.at || stamp(r.startedAt);
  const a = (k: string, vars?: Record<string, string | number>) => s(`alerts.${k}`, vars);
  const alertTexts: FieldsCardTexts = {
    h: a('h'),
    d: a('d'),
    save: t(d, 'hlt.save'),
    saving: t(d, 'hlt.saving'),
    saved: t(d, 'hlt.saved'),
    discard: t(d, 'hlt.discard'),
    unsaved: t(d, 'hlt.unsaved'),
    readOnly: a('readOnly'),
    pairHelp: t(d, 'hlt.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, t(d, `hlt.err.${c}`)])),
  };
  const alertFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: a('enabled'), help: a('enabledHelp') },
    { kind: 'switch', path: 'smoke', label: a('smoke'), help: a('smokeHelp') },
    { kind: 'switch', path: 'journeys', label: a('journeys'), help: a('journeysHelp') },
    { kind: 'number', path: 'repeatHours', label: a('repeatHours'), help: a('repeatHoursHelp'), min: 1, max: 168 },
    { kind: 'switch', path: 'recovered', label: a('recovered'), help: a('recoveredHelp') },
  ];
  const told = (tool: (typeof RUN_TOOLS)[number], st: RunAlertState | null) => {
    const vars = { tool: s(`tool.${tool}`), since: st?.since ? stamp(st.since) : '', told: st?.told ? stamp(st.told) : '' };
    if (!st) return a('toldNone', vars);
    if (st.failing) return a(st.told ? 'toldFailing' : 'toldFailingQuiet', vars);
    return a(st.told ? 'toldOkLast' : 'toldOk', vars);
  };

  return (
    <div className="a2-z" data-testid="history-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      {v.caughtUp ? (
        <p className="a2-sm a2-mute" data-testid="history-caught">
          {s('caught', { n: num(v.caughtUp) })}
        </p>
      ) : null}

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="history-kpi-kept">
          <div className="a2-kl">{s('kpi.kept')}</div>
          <div className="a2-kv">{num(v.kept)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.keptFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="history-kpi-failed-week" data-n={v.failedWeek}>
          <div className="a2-kl">{s('kpi.failedWeek')}</div>
          <div className={`a2-kv${v.failedWeek ? ' sp-bad' : ''}`}>{num(v.failedWeek)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.failedWeekFoot')}</span>
          </div>
        </div>
        {RUN_TOOLS.map((tool) => {
          const r = v.latest[tool];
          return (
            <div key={tool} className="a2-card a2-kpi" data-testid={`history-kpi-last-${tool}`} data-ok={r ? String(r.ok) : 'none'}>
              <div className="a2-kl">{s('kpi.last', { tool: s(`tool.${tool}`) })}</div>
              <div className={`a2-kv sp-kvt${r && !r.ok ? ' sp-bad' : ''}`}>{r ? s(r.ok ? 'ok' : 'fail') : s('kpi.none')}</div>
              <div className="a2-kf">
                <span className="a2-kn">{r ? when(r) : ''}</span>
              </div>
            </div>
          );
        })}
      </div>

      <nav className="a2-views sk-views a2-mt12" aria-label={s('col.run')}>
        {(['all', ...RUN_TOOLS] as const).map((tool) => (
          <Link key={tool} className={`a2-view${v.tool === tool ? ' on' : ''}`} href={href({ tool })} aria-current={v.tool === tool ? 'page' : undefined} data-testid={`history-tool-${tool}`}>
            {s(`tools.${tool}`)}
          </Link>
        ))}
      </nav>
      <nav className="a2-views sk-views" aria-label={s('col.result')}>
        {(['all', 'failed'] as const).map((result) => (
          <Link key={result} className={`a2-view${v.result === result ? ' on' : ''}`} href={href({ result })} aria-current={v.result === result ? 'page' : undefined} data-testid={`history-result-${result}`}>
            {s(`results.${result}`)}
          </Link>
        ))}
      </nav>

      {v.rows.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl sp-tbl" data-testid="history-rows">
            <thead>
              <tr>
                <th>{s('col.when')}</th>
                <th>{s('col.run')}</th>
                <th>{s('col.result')}</th>
                <th>{s('col.counts')}</th>
                <th>{s('col.findings')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.id} data-ok={String(r.ok)} data-tool={r.tool}>
                  <td className="a2-tdh">{when(r)}</td>
                  <td data-l={s('col.run')}>
                    <div>{s(`tool.${r.tool}`)}</div>
                    <div className="a2-sm a2-mute">
                      {kind(r.kind)}
                      {r.sha ? ` · ${s('version', { sha: r.sha })}` : ''}
                    </div>
                  </td>
                  <td data-l={s('col.result')}>
                    <span className={`a2-pill ${r.ok ? 'ok' : 'bad'}`}>{s(r.ok ? 'ok' : 'fail')}</span>
                  </td>
                  <td className="a2-sm" data-l={s('col.counts')}>
                    {s(`counts.${r.tool}`, { passed: num(r.passed), failed: num(r.failed) })}
                  </td>
                  <td className="a2-sm" data-l={s('col.findings')}>
                    {s('findings', { n: num(r.findings) })}
                  </td>
                  <td className="a2-tdw">
                    <Link className="a2-btn" href={`${HERE}/${r.id}`}>
                      {s('open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-note a2-mt12" role="note" data-testid="history-none">
          <span>{v.kept ? s('noneFiltered') : s('none')}</span>
        </div>
      )}

      {v.pages > 1 ? (
        <nav className="a2-views sk-views a2-mt12" aria-label={s('pageOf', { page: num(v.page), pages: num(v.pages) })} data-testid="history-pager">
          {v.page > 1 ? (
            <Link className="a2-view" href={href({ page: v.page - 1 })} data-testid="history-newer">
              {s('newer')}
            </Link>
          ) : null}
          <span className="a2-sm a2-mute sk-page">{s('pageOf', { page: num(v.page), pages: num(v.pages) })}</span>
          {v.page < v.pages ? (
            <Link className="a2-view" href={href({ page: v.page + 1 })} data-testid="history-older">
              {s('older')}
            </Link>
          ) : null}
        </nav>
      ) : null}

      <div className="a2-mt12">
        <FieldsCard url={ALERTS_API} screen={{ key: alerts.cards.runAlerts.key, value: alerts.cards.runAlerts.value, version: alerts.cards.runAlerts.version }} fields={alertFields} texts={alertTexts} canEdit={alerts.canEdit} testId="history-alerts-card" />
      </div>
      <section className="a2-sc a2-mt12" aria-labelledby="history-told-h" data-testid="history-alerts-told" data-on={String(alerts.settings.enabled)}>
        <h2 id="history-told-h" className="a2-h3">
          {a('toldH')}
        </h2>
        <ul className="hs-said a2-sm">
          {RUN_TOOLS.map((tool) => (
            <li key={tool} data-tool={tool} data-failing={String(alerts.told[tool]?.failing ?? false)}>
              {told(tool, alerts.told[tool])}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
