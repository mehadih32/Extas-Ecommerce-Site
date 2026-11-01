// S21 · PR 594 (§5 HLP-02) — one PR's card at /admin/build/pr/<n>: what it does (from its register row, with the plain
// Bengali line of docs/stages/bn.json), its stage, status and owning agent, the PRs it builds on, every dated scope update
// (newest first), the change notes that name it, its build record, and the problems reported on it with "Report a
// problem on this PR" (`build.report`). Seeing it needs `build.read`. Read-only apart from the report.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ProblemStatus, ReportProblem } from '@/components/admin/build/BuildActions';
import { DocBlocks } from '@/components/admin/build/DocBlocks';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { parseMarkdown } from '@/lib/admin-shell/guide';
import { locateKey } from '@/lib/admin-shell/sections';
import { docsDir } from '@/lib/build-api';
import { listProblems } from '@/lib/build-problems';
import { readRegister } from '@/lib/build-register';
import { buildButtonWords, PROBLEM_PILL, STATE_PILL, withBuildWords } from '@/lib/build-words';
import { t } from '@/lib/i18n';
import '../../build.css';

export const dynamic = 'force-dynamic';

const KEY = 'buildPr';
const BASE = '/admin/build';

type Params = Promise<{ n: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ n }, plain] = await Promise.all([params, adminView()]);
  const view = withBuildWords(plain);
  return { title: `${t(view.dict, 'build.pr.metaTitle', { n: /^\d{1,5}$/.test(n) ? n : '' })} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function BuildPrPage({ params }: { params: Params }) {
  const deps = adminDeps();
  const [{ n: raw }, plain, access] = await Promise.all([params, adminView(deps), pageAccess('build.read', deps, MOTHER_STORE_ID)]);
  const view = withBuildWords(plain);
  const here = `${BASE}/pr/${encodeURIComponent(raw)}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="build.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `build.${k}`, vars);
  const dir = docsDir();
  const data = dir ? await readRegister(dir) : null;
  const n = /^\d{1,5}$/.test(raw) ? Number(raw) : 0;
  const pr = data?.reg.prs.get(n);
  const back = (
    <Link className="bd-crumb" href={pr ? `${BASE}?stage=${pr.stage}` : BASE} data-testid="bpr-back">
      <ShellIcon name="cl" size={12} />
      {pr ? `${pr.stage} · ${data!.reg.stages.find((s) => s.id === pr.stage)?.name ?? ''}` : c('pr.backAll')}
    </Link>
  );
  if (!data || !pr)
    return (
      <div className="a2-z" data-testid="bpr-page">
        <PageHead view={view} place={locateKey(KEY)} crumb={back} title={c('pr.metaTitle', { n: n || raw.slice(0, 8) })} />
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute" data-testid="bpr-none">
            {data ? c('pr.notFound', { n: n || raw.slice(0, 8) }) : c('noDocs')}
          </p>
        </section>
      </div>
    );
  const { reg, bn } = data;
  const actor = access.guard.actor;
  const [problems, mayReport] = await Promise.all([listProblems(access.deps.db, MOTHER_STORE_ID, { view: 'all', pr: n }), can(access.deps.db, actor, 'build.report', { storeId: MOTHER_STORE_ID })]);
  const boxes = { tip: t(d, 'shell.guide.box.tip'), careful: t(d, 'shell.guide.box.careful'), example: '' };
  const at = (x: Date | string | null) => (x ? dateTime(new Date(x).toISOString(), view.locale, view.timeZone) : '');
  const w = buildButtonWords(view.lang);
  const short = typeof bn[String(n)] === 'string' ? bn[String(n)]!.trim() : '';
  const updates = [...pr.updates].sort((a, b) => b.key - a.key);
  const someone = c('problems.row.someone');

  return (
    <div className="a2-z" data-testid="bpr-page" data-pr={n} data-state={pr.state}>
      <PageHead view={view} place={locateKey(KEY)} crumb={back} title={c('pr.title', { n, title: pr.title })} />
      <SectionTabs view={view} current={KEY} />

      <div className="bd-grid a2-mt12">
        <section className="a2-card" aria-labelledby="bpr-does-h" data-testid="bpr-does">
          <h2 className="a2-h3" id="bpr-does-h">
            {c('pr.does')}
          </h2>
          {short ? (
            <p className="a2-sm a2-mt6" lang="bn" data-testid="bpr-short">
              <b>{c('pr.short')}:</b> {short}
            </p>
          ) : null}
          <div className="bd-text a2-guidebody a2-mt6">
            <DocBlocks blocks={parseMarkdown(pr.text)} boxes={boxes} />
          </div>
          {pr.derived ? <p className="a2-xs a2-mute">{c('pr.derived')}</p> : null}
          <dl className="bd-facts">
            <dt>{c('pr.stage')}</dt>
            <dd>
              <Link className="a2-lnk" href={`${BASE}?stage=${pr.stage}`}>
                {pr.stage} · {reg.stages.find((s) => s.id === pr.stage)?.name ?? ''}
              </Link>
            </dd>
            <dt>{c('pr.state')}</dt>
            <dd>
              <span className={`a2-pill ${STATE_PILL[pr.state]}`} data-testid="bpr-state">
                {c(`state.${pr.state}`)}
              </span>
              {pr.stateDate ? <span className="a2-xs a2-mute">{c('list.since', { date: pr.stateDate })}</span> : null}
            </dd>
            <dt>{c('pr.owner')}</dt>
            <dd>{pr.owner || c('pr.none')}</dd>
            <dt>{c('pr.buildsOn')}</dt>
            <dd data-testid="bpr-builds-on">
              {pr.buildsOn.length
                ? pr.buildsOn.map((x) =>
                    reg.prs.has(x) ? (
                      <Link key={x} className="a2-lnk" href={`${BASE}/pr/${x}`}>
                        PR {x}
                      </Link>
                    ) : (
                      <span key={x}>PR {x}</span>
                    ),
                  )
                : c('pr.none')}
            </dd>
          </dl>
        </section>

        <section className="a2-card" aria-labelledby="bpr-problems-h" data-testid="bpr-problems" data-n={problems.rows.length}>
          <h2 className="a2-h3" id="bpr-problems-h">
            {c('pr.problems')}
          </h2>
          {problems.rows.length ? (
            <ul className="bd-rows">
              {problems.rows.map((r) => (
                <li key={r.id} className="bd-row" data-testid="bpr-problem" data-status={r.status}>
                  <span className="bd-main a2-sm">
                    {c('problems.row.n', { n: r.number })} · {r.note}
                  </span>
                  <span className={`a2-pill ${PROBLEM_PILL[r.status] ?? 'line'}`}>{c(`problems.status.${r.status}`)}</span>
                  <span className="bd-sub a2-xs a2-mute">
                    <span>{c('problems.row.by', { who: r.reportedBy ?? someone, at: at(r.createdAt) })}</span>
                    {r.statusNote ? <span>{r.statusNote}</span> : null}
                  </span>
                  {mayReport ? (
                    <span className="bd-full">
                      <ProblemStatus w={w} id={r.id} status={r.status} testId={`bpr-st-${r.number}`} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{c('pr.noProblems')}</p>
          )}
          <div className="a2-mt12">{mayReport ? <ReportProblem w={w} pr={n} page={here} testId="bpr-report" /> : null}</div>
          <p className="a2-xs a2-mt12">
            <Link className="a2-lnk bd-lnk" href={`${BASE}/problems`}>
              {c('pr.allProblems')}
            </Link>
          </p>
        </section>
      </div>

      <div className="bd-grid a2-mt12">
        <section className="a2-card" aria-labelledby="bpr-upd-h" data-testid="bpr-updates" data-n={updates.length}>
          <h2 className="a2-h3" id="bpr-upd-h">
            {c('pr.updates')}
          </h2>
          <p className="a2-cs">{c('pr.updatesSub')}</p>
          {updates.length ? (
            <ol className="bd-tl">
              {updates.map((u, i) => (
                <li key={i}>
                  {u.date ? <span className="bd-when">{u.date}</span> : null}
                  <div className="bd-text a2-guidebody">
                    <DocBlocks blocks={parseMarkdown(u.text)} boxes={boxes} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{c('pr.noUpdates')}</p>
          )}
        </section>

        <div>
          <section className="a2-card" aria-labelledby="bpr-notes-h" data-testid="bpr-notes" data-n={pr.notes.length}>
            <h2 className="a2-h3" id="bpr-notes-h">
              {c('pr.notes')}
            </h2>
            {pr.notes.length ? (
              <ol className="bd-tl">
                {pr.notes.map((x, i) => (
                  <li key={`${x.id}-${i}`}>
                    <span className="bd-when">
                      {x.id} · {x.head}
                    </span>
                    <div className="bd-text a2-guidebody">
                      <DocBlocks blocks={parseMarkdown(x.text)} boxes={boxes} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{c('pr.noNotes')}</p>
            )}
          </section>

          <section className="a2-card a2-mt12" aria-labelledby="bpr-rec-h" data-testid="bpr-record" data-n={pr.status.length}>
            <h2 className="a2-h3" id="bpr-rec-h">
              {c('pr.record')}
            </h2>
            {pr.status.length ? (
              <ol className="bd-tl">
                {pr.status.map((r, i) => (
                  <li key={i}>
                    <span className="bd-when">
                      {r.date} · {c(`state.${r.state === 'live' ? 'live' : 'merged'}`)}
                    </span>
                    <div className="bd-text a2-guidebody">
                      <DocBlocks blocks={parseMarkdown(r.note)} boxes={boxes} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{c('pr.noRecord')}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
