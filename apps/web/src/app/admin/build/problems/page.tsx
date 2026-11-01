// S21 · PR 594 (§5 HLP-02) — Help & Build › Reported problems at /admin/build/problems: every problem reported on a PR
// of the build (R-1, R-2 …), by where it stands (open or being fixed; fixed or closed; all), each with its PR, what is
// wrong, where it was seen, who reported it and when, and its status with how it was fixed or why it was closed.
// "Report a problem" and the status buttons need `build.report`; seeing it needs `build.read`. Nothing is deleted.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ProblemStatus, ReportProblem } from '@/components/admin/build/BuildActions';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { listProblems, PROBLEM_PAGE, PROBLEM_VIEWS } from '@/lib/build-problems';
import { buildButtonWords, PROBLEM_PILL, withBuildWords } from '@/lib/build-words';
import { t } from '@/lib/i18n';
import '../build.css';

export const dynamic = 'force-dynamic';

const KEY = 'buildProblems';
const HERE = '/admin/build/problems';

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const view = withBuildWords(await adminView());
  return { title: `${t(view.dict, 'build.problems.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function BuildProblemsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [sp, plain, access] = await Promise.all([searchParams, adminView(deps), pageAccess('build.read', deps, MOTHER_STORE_ID)]);
  const view = withBuildWords(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="build.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `build.${k}`, vars);
  const [v, mayReport] = await Promise.all([
    listProblems(access.deps.db, MOTHER_STORE_ID, { view: typeof sp.view === 'string' ? sp.view : undefined }),
    can(access.deps.db, access.guard.actor, 'build.report', { storeId: MOTHER_STORE_ID }),
  ]);
  const at = (x: Date | string | null) => (x ? dateTime(new Date(x).toISOString(), view.locale, view.timeZone) : '');
  const w = buildButtonWords(view.lang);
  const someone = c('problems.row.someone');

  return (
    <div className="a2-z" data-testid="bp-page" data-view={v.view}>
      <PageHead view={view} place={locateKey(KEY)} title={c('problems.title')} sub={c('problems.sub')} />
      <SectionTabs view={view} current={KEY} />

      {mayReport ? (
        <section className="a2-card a2-mt12">
          <ReportProblem w={w} primary testId="bp-report" />
        </section>
      ) : null}

      <nav className="a2-views bd-views a2-mt12" aria-label={c('problems.views')} data-testid="bp-views">
        {PROBLEM_VIEWS.map((x) => (
          <Link key={x} className={`a2-view${x === v.view ? ' on' : ''}`} href={x === 'open' ? HERE : `${HERE}?view=${x}`} aria-current={x === v.view ? 'page' : undefined} scroll={false} data-view={x}>
            {c(`problems.view.${x}`)}
            {v.counts[x] ? ` · ${v.counts[x]}` : ''}
          </Link>
        ))}
      </nav>

      <section className="a2-card a2-mt12" aria-labelledby="bp-list-h" data-testid="bp-list" data-n={v.rows.length}>
        <h2 className="a2-h3" id="bp-list-h">
          {c(`problems.view.${v.view}`)}
        </h2>
        {v.rows.length ? (
          <ul className="bd-rows">
            {v.rows.map((r) => (
              <li key={r.id} className="bd-row" data-testid="bp-row" data-number={r.number} data-pr={r.prNumber} data-status={r.status}>
                <span className="bd-main">
                  <b>{c('problems.row.n', { n: r.number })}</b> ·{' '}
                  <Link href={`/admin/build/pr/${r.prNumber}`}>{c('problems.row.pr', { n: r.prNumber })}</Link>
                </span>
                <span className={`a2-pill ${PROBLEM_PILL[r.status] ?? 'line'}`}>{c(`problems.status.${r.status}`)}</span>
                <span className="bd-full a2-sm">{r.note}</span>
                <span className="bd-sub a2-xs a2-mute">
                  <span>{c('problems.row.by', { who: r.reportedBy ?? someone, at: at(r.createdAt) })}</span>
                  {r.page ? (
                    <Link className="a2-lnk" href={r.page}>
                      {c('problems.row.seen', { page: r.page })}
                    </Link>
                  ) : null}
                </span>
                {r.statusAt && r.status !== 'OPEN' ? (
                  <span className="bd-sub a2-xs">
                    <span>
                      {c(`problems.status.${r.status}`)} · {c('problems.row.status', { who: r.statusBy ?? someone, at: at(r.statusAt) })}
                    </span>
                    {r.statusNote ? <span>{r.statusNote}</span> : null}
                  </span>
                ) : null}
                {mayReport ? (
                  <span className="bd-full">
                    <ProblemStatus w={w} id={r.id} status={r.status} testId={`bp-st-${r.number}`} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute a2-mt6" data-testid="bp-none">
            {c(`problems.none.${v.view}`)}
          </p>
        )}
        {v.rows.length >= PROBLEM_PAGE ? <p className="a2-xs a2-mute a2-mt12">{c('problems.more', { n: v.rows.length })}</p> : null}
      </section>
    </div>
  );
}
