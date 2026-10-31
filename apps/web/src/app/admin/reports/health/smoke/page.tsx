// S21 · PR 418 (§5 REP-07e, CN-016) — Reports › Site health › Smoke runs at /admin/reports/health/smoke: the newest
// smoke test after a deploy and the newest nightly one, as the server kept them (lib/admin-health/smoke-runs.ts): the
// result, what went wrong, and every page on a phone and a desktop with its picture. Seeing needs `health.read`; an
// admin page's picture also `health.smoke.shots` (it can show customers' names). Read-only.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { SMOKE_SLOTS, smokeRunsView, type SmokeRow } from '@/lib/admin-health/smoke-runs';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import hbn from '../../../../../../messages/admin-health.bn.json';
import hen from '../../../../../../messages/admin-health.en.json';
import '../health.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/health/smoke';
const SHOT = '/api/admin/health/smoke/shot';
const KEY = 'healthSmoke';
/** The screens in the order the smoke test opens them (docs/qa/smoke.json `viewports`); others follow. */
const SCREENS = ['phone', 'desktop'];
/** How many of the run's problems are listed above the table. */
const FIRST_PROBLEMS = 5;

function withScreen(view: AdminView): AdminView {
  const extra = (view.lang === 'bn' ? [hbn] : [hen]) as unknown as Dict[];
  return { ...view, dict: Object.assign({}, view.dict, ...extra) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'smk.metaTitle'), robots: { index: false, follow: false } };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function SmokeRunsPage({ searchParams }: { searchParams: Promise<{ run?: string | string[]; show?: string | string[] }> }) {
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
  const v = await smokeRunsView({ db: access.deps.db }, { actor: access.guard.actor, ctx: access.guard.ctx }, { slot: one(q.run), show: one(q.show) });
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `smk.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const run = v.run;
  const moreProblems = run ? run.problems.length - FIRST_PROBLEMS : 0;
  const kindOf = (k: string) => (k === 'after deploy' ? s('kind.deploy') : k === 'nightly' ? s('kind.nightly') : k === 'first-week' ? s('kind.firstWeek') : s('kind.other', { kind: k }));
  const screens = [...new Set([...SCREENS, ...v.pages.flatMap((p) => p.screens.map((x) => x.screen))])];
  const href = (slot: string, show?: string) => `${HERE}?run=${slot}${show ? `&show=${show}` : ''}`;

  const cell = (r: SmokeRow | undefined) => {
    if (!r) return <span className="a2-mute">—</span>;
    return (
      <div className="sk-cell" data-ok={String(r.ok)}>
        <span className={`a2-pill ${r.ok ? 'ok' : 'bad'}`}>{s(r.ok ? 'pass' : 'fail')}</span>
        {!r.ok && r.status ? <span className="a2-sm a2-mute">{s('answer', { status: r.status })}</span> : null}
        {r.landed && r.landed !== r.path ? <span className="a2-sm a2-mute sk-wrap">{s('landed', { path: r.landed })}</span> : null}
        {r.problems.length ? (
          <ul className="sk-problems a2-sm">
            {r.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ) : null}
        {r.shot ? (
          <a className="sk-pic" href={`${SHOT}?run=${v.slot}&file=${encodeURIComponent(r.shot)}`} target="_blank" rel="noopener" data-testid="smoke-picture">
            {s('picture')}
          </a>
        ) : (
          <span className="a2-sm a2-mute">{r.admin && !v.canSeeAdminShots ? s('hiddenPicture') : s('noPicture')}</span>
        )}
      </div>
    );
  };

  return (
    <div className="a2-z" data-testid="smoke-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="a2-views sk-views" aria-label={s('title')} data-testid="smoke-runs-choice">
        {SMOKE_SLOTS.map((slot) => {
          const kept = v.slots[slot];
          return (
            <Link key={slot} className={`a2-view${v.slot === slot ? ' on' : ''}`} href={href(slot)} aria-current={v.slot === slot ? 'page' : undefined} data-testid={`smoke-run-${slot}`} data-ok={kept ? String(kept.ok) : 'none'}>
              {s(`runs.${slot}`)} · {kept ? s(kept.ok ? 'runOk' : 'runFail') : s('runNone')}
            </Link>
          );
        })}
      </nav>

      {!run ? (
        <div className="a2-note a2-mt12" role="note" data-testid="smoke-none">
          <span>{s('none')}</span>
        </div>
      ) : (
        <>
          <div className="a2-kpis a2-mt12">
            <div className="a2-card a2-kpi" data-testid="smoke-kpi-result" data-ok={String(run.ok)}>
              <div className="a2-kl">{s('kpi.result')}</div>
              <div className={`a2-kv sp-kvt${run.ok ? '' : ' sp-bad'}`}>{s(run.ok ? 'kpi.ok' : 'kpi.fail')}</div>
              <div className="a2-kf">
                <span className="a2-kn">{s('kpi.resultFoot', { when: run.at })}</span>
              </div>
            </div>
            <div className="a2-card a2-kpi" data-testid="smoke-kpi-pages">
              <div className="a2-kl">{s('kpi.pages')}</div>
              <div className="a2-kv">{num(v.pageCount || run.pages)}</div>
              <div className="a2-kf">
                <span className="a2-kn">{s('kpi.pagesFoot', { views: num(run.pages) })}</span>
              </div>
            </div>
            <div className="a2-card a2-kpi" data-testid="smoke-kpi-failed" data-failed={v.failedPages}>
              <div className="a2-kl">{s('kpi.failed')}</div>
              <div className={`a2-kv${v.failedPages || run.failed ? ' sp-bad' : ''}`}>{num(v.failedPages)}</div>
              <div className="a2-kf">
                <span className="a2-kn">{s('kpi.failedFoot', { views: num(run.failed) })}</span>
              </div>
            </div>
            <div className="a2-card a2-kpi" data-testid="smoke-kpi-version">
              <div className="a2-kl">{s('kpi.version')}</div>
              <div className="a2-kv sp-kvt">
                <code>{run.sha || '—'}</code>
              </div>
              <div className="a2-kf">
                <span className="a2-kn">{s('kpi.versionFoot', { kind: kindOf(run.kind) })}</span>
              </div>
            </div>
          </div>

          {!run.ok && run.rolledBack ? (
            <div className="a2-note a2-mt12 sk-bad" role="note" data-testid="smoke-put-back">
              <span>{s('putBack')}</span>
            </div>
          ) : null}

          {!run.ok && run.problems.length ? (
            <section className="a2-sc a2-mt12" aria-labelledby="sk-problems-h" data-testid="smoke-problems">
              <h2 className="a2-h3" id="sk-problems-h">
                {s('problemsH')}
              </h2>
              <ul className="sk-problems a2-sm a2-mt12">
                {run.problems.slice(0, FIRST_PROBLEMS).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              {moreProblems > 0 ? <p className="a2-sm a2-mute">{s('problemsMore', { n: num(moreProblems) })}</p> : null}
            </section>
          ) : null}

          {run.database ? (
            <p className="a2-sm a2-mute a2-mt12" data-testid="smoke-db">
              {s('db', { guards: run.database.appendOnly, role: run.database.appRole })}
            </p>
          ) : null}

          <section className="a2-sc a2-mt12" aria-labelledby="sk-list-h">
            <h2 className="a2-h3" id="sk-list-h">
              {s('listH')}
            </h2>
            {!run.hasRows ? (
              <p className="a2-sm a2-mute a2-mt12" data-testid="smoke-no-rows">
                {s('noRows')}
              </p>
            ) : (
              <>
                <nav className="a2-views a2-mt12" aria-label={s('listH')}>
                  {(['failed', 'all'] as const).map((w) => (
                    <Link key={w} className={`a2-view${v.show === w ? ' on' : ''}`} href={href(v.slot, w)} aria-current={v.show === w ? 'page' : undefined} data-testid={`smoke-show-${w}`}>
                      {s(`shows.${w}`, { n: num(w === 'failed' ? v.failedPages : v.pageCount) })}
                    </Link>
                  ))}
                </nav>
                {!v.canSeeAdminShots ? (
                  <p className="a2-sm a2-mute a2-mt12" data-testid="smoke-admin-shots">
                    {s('adminShots')}
                  </p>
                ) : null}
                {v.pages.length ? (
                  <div className="a2-tblw a2-mt12">
                    <table className="a2-tbl sp-tbl" data-testid="smoke-pages">
                      <thead>
                        <tr>
                          <th>{s('col.page')}</th>
                          {screens.map((x) => (
                            <th key={x}>{SCREENS.includes(x) ? s(`col.${x}`) : x}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {v.pages.map((p) => (
                          <tr key={p.path} data-ok={String(p.ok)} data-testid="smoke-page-row">
                            <td className="a2-tdh">
                              <span className="sk-wrap">{p.path}</span>
                            </td>
                            {screens.map((x) => (
                              <td key={x} data-l={SCREENS.includes(x) ? s(`screen.${x}`) : x}>
                                {cell(p.screens.find((r) => r.screen === x))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="a2-sm a2-mute a2-mt12" data-testid="smoke-none-failed">
                    {s('noneFailed')}
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
