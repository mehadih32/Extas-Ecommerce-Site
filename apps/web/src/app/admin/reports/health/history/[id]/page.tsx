// S21 · PR 419 (B7.3) — one run of the history at /admin/reports/health/history/<id>: its result, every finding
// (severity, page and screen, how to repeat it, the suggested fix and whether one was applied), compared with the run
// of the same tool before it: new, still failing, fixed since. Seeing needs `health.read`. Read-only.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { historyRunView, isHistoryError, type HistoryFinding, type HistoryRow } from '@/lib/admin-health/history';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import hbn from '../../../../../../../messages/admin-health.bn.json';
import hen from '../../../../../../../messages/admin-health.en.json';
import '../../health.css';
import { kindKey, SEV_TONE } from '../kinds';

export const dynamic = 'force-dynamic';

const LIST = '/admin/reports/health/history';
const KEY = 'healthHistory';

function withScreen(view: AdminView): AdminView {
  const extra = (view.lang === 'bn' ? [hbn] : [hen]) as unknown as Dict[];
  return { ...view, dict: Object.assign({}, view.dict, ...extra) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'hst.run.metaTitle'), robots: { index: false, follow: false } };
}

export default async function HistoryRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const here = `${LIST}/${encodeURIComponent(id)}`;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('health.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="health.read" />
      </div>
    );
  const v = await historyRunView({ db: access.deps.db }, { actor: access.guard.actor, ctx: access.guard.ctx }, id).catch((e: unknown) => {
    if (isHistoryError(e)) notFound();
    throw e;
  });
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `hst.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const when = (r: HistoryRow) => r.at || new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(r.startedAt));
  const run = v.run;
  const fresh = v.findings.filter((f) => f.isNew).length;
  const problems = Array.isArray(run.summary.problems) ? run.summary.problems.filter((x): x is string => typeof x === 'string') : [];
  const where = (f: Pick<HistoryFinding, 'page' | 'device'>) =>
    f.page || f.device ? s('where', { page: f.page ?? '—', screen: f.device ? s(`screen.${f.device}`) : '—' }) : null;

  return (
    <div className="a2-z" data-testid="history-run-page" data-ok={String(run.ok)}>
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={s('run.title', { tool: s(`tool.${run.tool}`), when: when(run) })}
        sub={s('run.sub', { kind: s(`kind.${kindKey(run.kind)}`, { kind: run.kind }), version: run.sha ? s('version', { sha: run.sha }) : '—' })}
      />
      <SectionTabs view={view} current={KEY} />
      <p className="a2-sm">
        <Link className="sk-pic" href={LIST} data-testid="history-back">
          {s('run.back')}
        </Link>
      </p>

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="history-run-result" data-ok={String(run.ok)}>
          <div className="a2-kl">{s('run.result')}</div>
          <div className={`a2-kv sp-kvt${run.ok ? '' : ' sp-bad'}`}>{s(run.ok ? 'ok' : 'fail')}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s(`counts.${run.tool}`, { passed: num(run.passed), failed: num(run.failed) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="history-run-findings" data-new={fresh}>
          <div className="a2-kl">{s('run.findings')}</div>
          <div className={`a2-kv${v.findings.length ? ' sp-bad' : ''}`}>{num(v.findings.length)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{v.previous ? s('run.findingsFoot', { new: num(fresh) }) : ''}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="history-run-compare">
          <div className="a2-kl">{s('run.compare')}</div>
          <div className="a2-kv sp-kvt">
            {v.previous ? (
              <Link className="sk-pic" href={`${LIST}/${v.previous.id}`} data-testid="history-run-previous">
                {when(v.previous)}
              </Link>
            ) : (
              s('run.firstRun')
            )}
          </div>
          <div className="a2-kf">
            <span className="a2-kn">{v.previous ? s('run.compareFoot', { result: s(v.previous.ok ? 'ok' : 'fail') }) : ''}</span>
          </div>
        </div>
      </div>

      {!v.previous ? (
        <p className="a2-sm a2-mute a2-mt12" data-testid="history-run-first">
          {s('run.firstNote')}
        </p>
      ) : null}

      {!run.ok && problems.length && !v.findings.length ? (
        <section className="a2-sc a2-mt12" aria-labelledby="hs-problems-h">
          <h2 className="a2-h3" id="hs-problems-h">
            {s('run.problemsH')}
          </h2>
          <ul className="sk-problems a2-sm a2-mt12">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="hs-findings-h">
        <h2 className="a2-h3" id="hs-findings-h">
          {s('run.findingsH')}
        </h2>
        {v.findings.length ? (
          <ul className="hs-findings a2-mt12" data-testid="history-findings">
            {v.findings.map((f) => (
              <li key={f.id} className="a2-card hs-finding" data-severity={f.severity} data-new={String(f.isNew)}>
                <div className="hs-pills">
                  <span className={`a2-pill ${SEV_TONE[f.severity] ?? 'line'}`}>{s(`sev.${f.severity}`)}</span>
                  {v.previous ? <span className={`a2-pill ${f.isNew ? 'gold' : 'line'}`}>{s(f.isNew ? 'new' : 'still')}</span> : null}
                </div>
                <div className="hs-title sk-wrap">{f.title}</div>
                {where(f) ? <div className="a2-sm a2-mute sk-wrap">{where(f)}</div> : null}
                {f.reproduce ? <div className="a2-sm sk-wrap">{s('repeat', { steps: f.reproduce })}</div> : null}
                <div className="a2-sm a2-mute">{f.suggestedFix ? s('fix', { fix: f.suggestedFix }) : s('fixNone')}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="history-no-findings">
            {s('run.noFindings')}
          </p>
        )}
      </section>

      {v.fixedSince.length ? (
        <section className="a2-sc a2-mt12" aria-labelledby="hs-fixed-h" data-testid="history-fixed">
          <h2 className="a2-h3" id="hs-fixed-h">
            {s('run.fixedH')}
          </h2>
          <p className="a2-sm a2-mute">{s('run.fixedD')}</p>
          <ul className="hs-fixed a2-sm a2-mt12">
            {v.fixedSince.map((f, i) => (
              <li key={i} className="sk-wrap">
                <span className="a2-pill ok">{s(`sev.${f.severity}`)}</span> {f.title}
                {where(f) ? <span className="a2-mute"> · {where(f)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
