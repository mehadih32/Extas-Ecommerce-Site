// PR 6 — the Server page (demo #/admin/server), first with the background worker's part (CN-022): is the worker alive
// (its heartbeat, fresh or stale after `jobs.heartbeat.staleSeconds`), which copy leads the scheduler, how many jobs
// run, and the jobs that failed in the last `jobs.serverPage.failedHours` with their reason, their try count and their
// next try (or that they were given up). Reading needs `system.read`. The page reads only the database (the worker's
// own rows); it never talks to the queue, so it opens when Redis or the worker is down. The demo's other cards
// (memory per service, disks, the NVMe unit, cache, alerts: PR 423, 601, 603, 604, 9) join this page with their PRs.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { workerStatus, type WorkerState } from '@extas/jobs';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { formatNumber } from '@/components/admin/products/model';
import { beatAgo, failureText, jobName, nextTry, SERVER_HOME } from '@/components/admin/server/text';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'server';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'server.metaTitle'), robots: { index: false, follow: false } };
}

const STATE_DOT: Record<WorkerState, string> = { ok: 'ad-dot', stale: 'ad-dot bad', stopped: 'ad-dot warn', never: 'ad-dot off' };
const STATE_LEVEL: Record<WorkerState, string> = { ok: 'ok', stale: 'down', stopped: 'failing', never: 'off' };

export default async function ServerPage() {
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess('system.read', deps)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(SERVER_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const s = await workerStatus({ db: access.deps.db, settings: access.deps.resolver, now: access.deps.now });
  const d = view.dict;
  const now = new Date(s.checkedAt);
  const num = (n: number) => formatNumber(n, view.locale);
  const when = (iso: string) => dateTime(iso, view.locale, view.timeZone);
  const fresh = s.workers.filter((w) => w.fresh);
  const failedMore = Math.max(0, s.failedCounts.retrying + s.failedCounts.dead - s.failed.length);

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd">
        <div className="ad-eyebrow">{t(d, 'server.eyebrow')}</div>
        <h1 className="ad-h1">{t(d, 'server.title')}</h1>
        <p className="ad-intro">{t(d, 'server.intro')}</p>
      </div>
      <SystemTabs view={view} current={KEY} />

      <div className={`ad-note ad-note-top st-verdict lv-${STATE_LEVEL[s.state]}`} role="status" data-worker-state={s.state}>
        <span className={STATE_DOT[s.state]} />
        <div>
          <b>{t(d, `server.verdict.${s.state}.title`)}</b>
          <div>{t(d, `server.verdict.${s.state}.text`, { seconds: num(s.staleAfterSeconds) })}</div>
        </div>
      </div>

      <div className="pa-kpis">
        <div className="pa-kpi">
          <div className={`pa-kpi-v st-kpi-t${s.state === 'ok' ? '' : ' warn'}`}>{beatAgo(d, s.lastBeatAt, now, view.locale, view.timeZone)}</div>
          <div className="pa-kpi-l">{t(d, 'server.kpi.lastBeat')}</div>
          <div className="pa-kpi-s">{t(d, 'server.kpi.lastBeatSub')}</div>
        </div>
        <div className="pa-kpi">
          <div className={`pa-kpi-v${fresh.length ? ' ok' : ' warn'}`}>{num(fresh.length)}</div>
          <div className="pa-kpi-l">{t(d, 'server.kpi.workers')}</div>
          <div className="pa-kpi-s">{t(d, 'server.kpi.workersSub')}</div>
        </div>
        <div className="pa-kpi">
          <div className="pa-kpi-v">{num(s.running)}</div>
          <div className="pa-kpi-l">{t(d, 'server.kpi.running')}</div>
          <div className="pa-kpi-s">{t(d, 'server.kpi.runningSub')}</div>
        </div>
        <div className="pa-kpi">
          <div className={`pa-kpi-v${s.failedCounts.retrying ? ' warn' : ' ok'}`}>{num(s.failedCounts.retrying)}</div>
          <div className="pa-kpi-l">{t(d, 'server.kpi.retrying')}</div>
          <div className="pa-kpi-s">{t(d, 'server.kpi.retryingSub')}</div>
        </div>
        <div className="pa-kpi">
          <div className={`pa-kpi-v${s.failedCounts.dead ? ' warn' : ' ok'}`}>{num(s.failedCounts.dead)}</div>
          <div className="pa-kpi-l">{t(d, 'server.kpi.dead')}</div>
          <div className="pa-kpi-s">{t(d, 'server.kpi.deadSub')}</div>
        </div>
      </div>

      <div className="st-grid">
        <section className="ad-card st-card" aria-labelledby="sv-failed" data-failed-jobs={s.failedCounts.retrying + s.failedCounts.dead}>
          <h2 id="sv-failed">{t(d, 'server.failed.title')}</h2>
          <p className="ad-sub">{t(d, 'server.failed.sub', { hours: num(s.failedHours) })}</p>
          {s.failed.length ? (
            <ul className="st-list">
              {s.failed.map((f) => (
                <li key={f.runId} className="st-li">
                  <span className={`st-st s-${f.status}`}>{t(d, `server.failed.status.${f.status}`)}</span>
                  <span className="st-li-main">
                    <b>{jobName(d, f.jobKey)}</b>
                    <span className="ad-mini st-block">
                      {f.storeId ? (
                        <>
                          {t(d, 'server.failed.store', { id: num(f.storeId) })}
                          {t(d, 'stock.sep')}
                        </>
                      ) : null}
                      {t(d, 'server.failed.tries', { n: num(f.attempt), max: num(f.maxAttempts) })}
                      {t(d, 'stock.sep')}
                      {when(f.startedAt)}
                    </span>
                    {f.error ? <span className="ad-mini bad st-block st-err">{failureText(d, f.error)}</span> : null}
                    <span className="ad-mini st-block">{f.status === 'DEAD_LETTERED' ? t(d, 'server.failed.dead') : nextTry(d, f.nextAttemptAt, now, view.locale, view.timeZone)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, 'server.failed.empty')}</p>
          )}
          {failedMore ? <p className="ad-mini">{t(d, 'server.failed.more', { n: num(failedMore) })}</p> : null}
        </section>

        <section className="ad-card st-card" aria-labelledby="sv-workers">
          <h2 id="sv-workers">{t(d, 'server.workers.title')}</h2>
          <p className="ad-sub">{t(d, 'server.workers.sub')}</p>
          {s.workers.length ? (
            <ul className="st-list">
              {s.workers.map((w) => {
                const st = w.stoppedAt ? 'stopped' : w.fresh ? 'alive' : 'late';
                return (
                  <li key={w.workerKey} className="st-li">
                    <span className={`st-st s-${st === 'alive' ? 'SUCCEEDED' : st === 'late' ? 'FAILED' : 'CANCELLED'}`}>{t(d, `server.workers.${st}`)}</span>
                    <span className="st-li-main">
                      <b translate="no">{w.hostname}</b>
                      {w.isLeader ? <span className="ad-tag sv-leader">{t(d, 'server.workers.leader')}</span> : null}
                      <span className="ad-mini st-block">
                        {t(d, 'server.workers.beat', { time: beatAgo(d, w.beatAt, now, view.locale, view.timeZone) })}
                        {t(d, 'stock.sep')}
                        {t(d, 'server.workers.jobs', { n: num(w.activeJobs) })}
                      </span>
                      <span className="ad-mini st-block">
                        {t(d, 'server.workers.since', { time: when(w.startedAt) })}
                        {w.version ? (
                          <>
                            {t(d, 'stock.sep')}
                            <span translate="no">{t(d, 'server.workers.version', { version: w.version })}</span>
                          </>
                        ) : null}
                        {w.color ? (
                          <>
                            {t(d, 'stock.sep')}
                            {t(d, 'server.workers.colour', { colour: w.color })}
                          </>
                        ) : null}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, 'server.workers.empty', { hours: num(s.failedHours) })}</p>
          )}
        </section>
      </div>

      <div className="ad-note">
        <Icon name="info" size={16} />
        <div>{t(d, 'server.note')}</div>
      </div>
    </AdminFrame>
  );
}
