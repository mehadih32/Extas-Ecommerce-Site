// S21 · PR 594 (§5 HLP-02, CN-011) — Help & Build › Build progress at /admin/build: every stage and PR of the build,
// read from the deploy's copy of docs/MASTER-REGISTER.md (lib/build-register.ts), so a new PR or a dated update shows on
// the next deploy without being typed twice. Counts on top (in the plan, built, to build, parked), a search by number
// or words with a stage and status filter, the stage list with how much of each is built, and each PR's card one tap
// away. Seeing it needs `build.read` (the owner). Read-only.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { docsDir } from '@/lib/build-api';
import { PR_STATES, prMatches, readRegister, stateCounts, type PrState, type RegPr } from '@/lib/build-register';
import { STATE_PILL, withBuildWords } from '@/lib/build-words';
import { t } from '@/lib/i18n';
import './build.css';

export const dynamic = 'force-dynamic';

const KEY = 'build';
const HERE = '/admin/build';
// hardcode-ok: how many PRs one list shows (the register has a few hundred)
const LIST_MAX = 150;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.trim() : '');

export async function generateMetadata(): Promise<Metadata> {
  const view = withBuildWords(await adminView());
  return { title: `${t(view.dict, 'build.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function BuildPage({ searchParams }: { searchParams: Search }) {
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
  const dir = docsDir();
  const data = dir ? await readRegister(dir) : null;
  if (!data)
    return (
      <div className="a2-z" data-testid="build-page">
        <PageHead view={view} place={locateKey(KEY)} title={c('title')} />
        <SectionTabs view={view} current={KEY} />
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute" data-testid="build-nodocs">
            {c('noDocs')}
          </p>
        </section>
      </div>
    );
  const { reg, bn } = data;
  const all = [...reg.prs.values()];
  const counts = stateCounts(all);
  const q = one(sp.q);
  const stage = reg.stages.find((s) => s.id === one(sp.stage)) ?? null;
  const state = (PR_STATES as readonly string[]).includes(one(sp.state)) ? (one(sp.state) as PrState) : null;
  const filtered = !!(q || stage || state);
  const list = filtered ? all.filter((p) => (!stage || p.stage === stage.id) && (!state || p.state === state) && prMatches(p, q)).sort((a, b) => a.n - b.n) : [];
  const line = (p: RegPr) => (view.lang === 'bn' && typeof bn[String(p.n)] === 'string' && bn[String(p.n)]!.trim() ? bn[String(p.n)]! : p.title);

  return (
    <div className="a2-z" data-testid="build-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={c('title')}
        sub={c('sub', { asOf: reg.asOf })}
        right={
          <Link className="a2-btn" href="/admin/reports/health/smoke" data-testid="build-smoke">
            <ShellIcon name="pulse" size={15} />
            {c('smoke')}
          </Link>
        }
      />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis a2-mt12" data-testid="build-kpis">
        <div className="a2-card a2-kpi" data-testid="build-kpi-prs" data-n={all.length}>
          <div className="a2-kl">{c('kpi.prs')}</div>
          <b className="a2-kv">{all.length}</b>
          <div className="a2-kf">
            <span className="a2-kn">{c('kpi.prsNote', { n: reg.stages.length })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="build-kpi-done" data-n={counts.live + counts.merged}>
          <div className="a2-kl">{c('kpi.done')}</div>
          <b className="a2-kv">{counts.live + counts.merged}</b>
          <div className="a2-kf">
            <span className="a2-kn">{c('kpi.doneNote', { live: counts.live })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="build-kpi-todo" data-n={counts.todo}>
          <div className="a2-kl">{c('kpi.todo')}</div>
          <b className="a2-kv">{counts.todo}</b>
        </div>
        <div className="a2-card a2-kpi" data-testid="build-kpi-parked" data-n={counts.parked}>
          <div className="a2-kl">{c('kpi.parked')}</div>
          <b className="a2-kv">{counts.parked}</b>
          <div className="a2-kf">
            <span className="a2-kn">{c('kpi.parkedNote')}</span>
          </div>
        </div>
      </div>

      <section className="a2-card a2-mt12" aria-label={c('filter.q')}>
        <form className="bd-filter" action={HERE} method="get" data-testid="build-filter">
          <label className="a2-fsrch">
            <span className="a2-sr">{c('filter.q')}</span>
            <ShellIcon name="search" size={16} />
            <input className="a2-inp" type="search" name="q" defaultValue={q} placeholder={c('filter.qPh')} autoComplete="off" data-testid="build-q" />
          </label>
          <label className="bd-fld">
            <span className="a2-xs">{c('filter.stage')}</span>
            <select className="a2-sel" name="stage" defaultValue={stage?.id ?? ''} data-testid="build-stage">
              <option value="">{c('filter.stageAll')}</option>
              {reg.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bd-fld">
            <span className="a2-xs">{c('filter.state')}</span>
            <select className="a2-sel" name="state" defaultValue={state ?? ''} data-testid="build-state">
              <option value="">{c('filter.stateAll')}</option>
              {PR_STATES.map((s) => (
                <option key={s} value={s}>
                  {c(`state.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="a2-btn pri" data-testid="build-go">
            {c('filter.go')}
          </button>
          {filtered ? (
            <Link className="a2-btn" href={HERE} data-testid="build-clear">
              {c('filter.clear')}
            </Link>
          ) : null}
        </form>
        {reg.progress ? <p className="a2-xs a2-mute a2-mt12">{c('progress', { line: reg.progress })}</p> : null}
      </section>

      {filtered ? (
        <section className="a2-card a2-mt12" aria-labelledby="bd-list-h" data-testid="build-list" data-n={list.length}>
          <h2 className="a2-h3" id="bd-list-h">
            {stage ? `${stage.id} · ${stage.name}` : c('list.title', { n: list.length })}
          </h2>
          {stage?.intro ? <p className="a2-cs">{stage.intro}</p> : null}
          {list.length ? (
            <ul className="bd-rows">
              {list.slice(0, LIST_MAX).map((p) => (
                <li key={p.n} className="bd-row" data-testid="build-pr" data-pr={p.n} data-state={p.state}>
                  <span className="bd-main">
                    <Link href={`${HERE}/pr/${p.n}`}>
                      PR {p.n} · {line(p)}
                    </Link>
                  </span>
                  <span className={`a2-pill ${STATE_PILL[p.state]}`}>{c(`state.${p.state}`)}</span>
                  <span className="bd-sub a2-xs a2-mute">
                    <span>{p.stage}</span>
                    {p.stateDate ? <span>{c('list.since', { date: p.stateDate })}</span> : null}
                    {p.owner ? <span>{c('list.owner', { who: p.owner })}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute a2-mt6" data-testid="build-none">
              {c('list.none')}
            </p>
          )}
          {LIST_MAX < list.length ? <p className="a2-xs a2-mute a2-mt12">{c('list.more', { shown: LIST_MAX, n: list.length })}</p> : null}
        </section>
      ) : (
        <section className="a2-card a2-mt12" aria-labelledby="bd-stages-h" data-testid="build-stages">
          <h2 className="a2-h3" id="bd-stages-h">
            {c('stages.title')}
          </h2>
          <ul className="bd-rows">
            {reg.stages.map((s) => {
              const prs = all.filter((p) => p.stage === s.id);
              const done = prs.filter((p) => p.state === 'live' || p.state === 'merged').length;
              const pct = prs.length ? Math.round((done / prs.length) * 100) : 0;
              return (
                <li key={s.id} className="bd-row" data-testid="build-stage-row" data-stage={s.id} data-done={done} data-n={prs.length}>
                  <span className="bd-main">
                    <Link href={`${HERE}?stage=${s.id}`}>
                      {s.id} · {s.name}
                    </Link>
                  </span>
                  {s.parked ? <span className="a2-pill warn">{c('stages.parked')}</span> : <span className="a2-xs a2-mute">{c('stages.built', { done, n: prs.length })}</span>}
                  <span className="bd-sub">
                    <span className="bd-meter" aria-hidden="true">
                      <span className="bd-bar">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="a2-xs a2-mute">{pct}%</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
