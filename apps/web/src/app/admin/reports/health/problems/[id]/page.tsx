// S21 · PR 423 (REP-07c, CN-015) — one customer problem at /admin/reports/health/problems/<id>: what happened, where,
// how many visitors and reports in the last `showDays` days, the two-week bars, the devices, browsers and networks it
// hit, its last reports, and its status with a note (CN-015 (3); ProblemStatusForm, `health.problems.manage`, the
// owner's steps `health.problems.approve`). Seeing needs `health.read`. No visitor id or personal detail is shown.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ProblemStatusForm } from '@/components/admin/settings/ProblemStatusForm';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { SEV_PILL, STATUS_PILL } from '@/lib/admin-problems/pills';
import { isProblemsError, NOTE_MAX, NOTE_NEEDED, OWNER_STATUSES, PROBLEM_STATUSES, problemDetail, type ProblemDetail } from '@/lib/admin-problems/service';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../../messages/admin-problems.bn.json';
import en from '../../../../../../../messages/admin-problems.en.json';
import '../../../../settings-cards.css';
import '../../health.css';
import '../problems.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/reports/health/problems';
const API = '/api/admin/health/problems';
const KEY = 'healthProblems';

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      ...((view.lang === 'bn' ? bn : en) as unknown as Dict),
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: t(view.dict, 'prb.metaTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function CustomerProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const deps = adminDeps();
  const [{ id }, plain, access] = await Promise.all([params, adminView(deps), pageAccess('health.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  const here = `${LIST}/${encodeURIComponent(id)}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="health.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `prb.${k}`, vars);
  let p: ProblemDetail;
  try {
    p = await problemDetail(
      {
        db: access.deps.db,
        resolver: access.deps.resolver,
        now: access.deps.now,
      },
      { actor: access.guard.actor, ctx: access.guard.ctx },
      id,
    );
  } catch (e) {
    if (isProblemsError(e) && e.code === 'NOT_FOUND')
      return (
        <div className="a2-z" data-testid="problem-missing">
          <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('d.notFound')} />
          <Link className="a2-btn" href={LIST}>
            {s('d.backToList')}
          </Link>
        </div>
      );
    throw e;
  }
  const r = p.row;
  const perms = access.guard.permissions;
  const canManage = perms?.has('health.problems.manage') ?? false;
  const canApprove = perms?.has('health.problems.approve') ?? false;
  const ownerStep = OWNER_STATUSES.includes(r.status);
  const num = (n: number) => formatNumber(n, view.locale);
  const at = (iso: string) =>
    new Intl.DateTimeFormat(view.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: view.timeZone,
    }).format(new Date(iso));
  const day = (ymd: string) =>
    new Intl.DateTimeFormat(view.locale, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(`${ymd}T00:00:00Z`));
  const peak = Math.max(1, ...p.trend.map((x) => x.records));
  const device = (x: string) => (x === 'phone' || x === 'tablet' || x === 'desktop' ? s(`d.devices.${x}`) : x || s('d.notSaid'));
  const plainName = (x: string) => x || s('d.notSaid');
  const by: [string, [string, number][], (x: string) => string][] = [
    ['device', p.by.device, device],
    ['browser', p.by.browser, plainName],
    ['network', p.by.network, plainName],
  ];
  const options = PROBLEM_STATUSES.map((x) => ({
    value: x,
    label: s(`status.${x}`),
  }));
  const statusTexts = {
    pick: s('d.statusPick'),
    note: s('d.note'),
    save: s('d.save'),
    saving: s('d.saving'),
    saved: s('d.saved'),
    err: Object.fromEntries(['NOTE_NEEDED', 'OWNER_ONLY', 'STALE', 'INVALID_INPUT', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`d.err.${c}`)])),
  };

  return (
    <div className="a2-z" data-testid="problem-page" data-severity={r.severity} data-status={r.status}>
      <PageHead view={view} place={locateKey(KEY)} title={s(`kind.${r.kind}`)} sub={s('where', { step: s(`step.${r.step}`), path: r.path })} />
      <SectionTabs view={view} current={KEY} />
      <p>
        <Link className="a2-btn" href={LIST} data-testid="problem-back">
          {s('d.backToList')}
        </Link>
      </p>

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{s('col.problem')}</div>
          <div className="a2-kv a2-sm a2-kvw">
            <span className={`a2-pill ${SEV_PILL[r.severity]}`}>{s(`sev.${r.severity}`)}</span>
          </div>
          <div className="a2-kf">
            <span className="a2-kn">{s('d.firstSeen', { at: at(r.firstSeenAt) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{s('col.who')}</div>
          <div className="a2-kv">{num(r.visitors)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('d.count', { n: num(r.records) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{s('col.last')}</div>
          <div className="a2-kv a2-kvw pb-kvt">{at(r.lastSeenAt)}</div>
          <div className="a2-kf">{r.back ? <span className="a2-kn pb-back">{s('back')}</span> : null}</div>
        </div>
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="pb-what-h">
        <h2 className="a2-h3" id="pb-what-h">
          {s('d.whatH')}
        </h2>
        <p className="a2-sm a2-mute a2-mt12">{s('d.detail')}</p>
        <p className="pb-detail" data-testid="problem-detail">
          {r.detail || s('d.noDetail')}
        </p>
        <ol className="pb-trend a2-mt12" data-testid="problem-trend">
          {p.trend.map((x) => (
            <li key={x.day} title={s('trendBar', { day: day(x.day), n: num(x.records) })}>
              <span className="pb-bar" style={{ height: `${Math.round((x.records / peak) * 100)}%` }} />
              <span className="hl-sr">{s('trendBar', { day: day(x.day), n: num(x.records) })}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="pb-by-h">
        <h2 className="a2-h3" id="pb-by-h">
          {s('d.byH', { days: num(p.showDays) })}
        </h2>
        <div className="pb-by a2-mt12" data-testid="problem-by">
          {by.map(([k, rows, name]) => (
            <div key={k}>
              <div className="a2-kl">{s(`d.${k}`)}</div>
              <ul>
                {rows.map(([x, n]) => (
                  <li key={x || '-'}>
                    <span>{name(x)}</span>
                    <span className="a2-sm a2-mute">{s('d.count', { n: num(n) })}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="pb-last-h">
        <h2 className="a2-h3" id="pb-last-h">
          {s('d.lastH')}
        </h2>
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl" data-testid="problem-last">
            <thead>
              <tr>
                <th>{s('d.at')}</th>
                <th>{s('d.device')}</th>
                <th>{s('d.browser')}</th>
                <th>{s('d.network')}</th>
                <th>{s('d.ms')}</th>
              </tr>
            </thead>
            <tbody>
              {p.last.map((x, i) => (
                <tr key={`${x.at}-${i}`}>
                  <td className="a2-sm">{at(x.at)}</td>
                  <td className="a2-sm">{device(x.device)}</td>
                  <td className="a2-sm">{plainName(x.browser)}</td>
                  <td className="a2-sm">{plainName(x.network ?? '')}</td>
                  <td className="a2-sm">{x.ms === null ? '—' : s('d.msValue', { ms: num(x.ms) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="pb-status-h" data-testid="problem-status-card">
        <h2 className="a2-h3" id="pb-status-h">
          {s('d.statusH')}
        </h2>
        <p className="a2-mt12">
          <span className={`a2-pill ${STATUS_PILL[r.status]}`}>{s('d.statusNow', { status: s(`status.${r.status}`) })}</span>
        </p>
        {p.statusAt ? <p className="a2-sm a2-mute">{s('d.statusSince', { at: at(p.statusAt) })}</p> : null}
        {r.statusNote ? <p className="pb-note">{r.statusNote}</p> : null}
        {ownerStep && !canApprove ? <p className="a2-sm a2-mute">{s('d.ownerHint')}</p> : null}
        {canManage ? (
          <ProblemStatusForm
            key={r.id}
            url={`${API}/${r.id}`}
            status={r.status}
            note={r.statusNote ?? ''}
            version={r.version}
            options={options}
            needsNote={NOTE_NEEDED}
            noteMax={NOTE_MAX}
            texts={statusTexts}
          />
        ) : (
          <p className="a2-sm a2-mute">{s('d.noManage')}</p>
        )}
      </section>
    </div>
  );
}
