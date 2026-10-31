// S21 · PR 423 (REP-07c, CN-015) — Reports › Site health › Customer problems at /admin/reports/health/problems: what
// went wrong for visitors on the shop's pages, found by the privacy-safe recorder (components/shop/ProblemProbe.tsx),
// one line per cause, Urgent first, for today, yesterday, the last 7 days, the last `showDays` days or one day; the
// two-week trend; the short glitches apart; and the recorder's numbers (`health.problems`, `settings.write`).
// Seeing needs `health.read`. No name, phone, address or payment detail exists to show; visitor ids are never shown.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { parseWhen, VIEWS } from '@/lib/admin-problems/days';
import { SEV_PILL, STATUS_PILL } from '@/lib/admin-problems/pills';
import { problemsView, type ProblemRow } from '@/lib/admin-problems/service';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import hbn from '../../../../../../messages/admin-health.bn.json';
import hen from '../../../../../../messages/admin-health.en.json';
import bn from '../../../../../../messages/admin-problems.bn.json';
import en from '../../../../../../messages/admin-problems.en.json';
import '../../../settings-cards.css';
import '../health.css';
import './problems.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/health/problems';
const API = '/api/admin/health/problems';
const KEY = 'healthProblems';

function withScreen(view: AdminView): AdminView {
  const extra = (view.lang === 'bn' ? [hbn, bn] : [hen, en]) as unknown as Dict[];
  return { ...view, dict: Object.assign({}, view.dict, ...extra) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: t(view.dict, 'prb.metaTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function CustomerProblemsPage({ searchParams }: { searchParams: Promise<{ when?: string | string[] }> }) {
  const deps = adminDeps();
  const raw = (await searchParams).when;
  const when = parseWhen(Array.isArray(raw) ? raw[0] : raw);
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
  const v = await problemsView(
    {
      db: access.deps.db,
      resolver: access.deps.resolver,
      now: access.deps.now,
    },
    { actor: access.guard.actor, ctx: access.guard.ctx },
    when,
  );
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `prb.${k}`, vars);
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
  const current = typeof when === 'object' ? 'day' : when;
  const peak = Math.max(1, ...v.trend.map((x) => x.records));

  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: t(d, 'hlt.save'),
    saving: t(d, 'hlt.saving'),
    saved: t(d, 'hlt.saved'),
    discard: t(d, 'hlt.discard'),
    unsaved: t(d, 'hlt.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: t(d, 'hlt.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, t(d, `hlt.err.${c}`)])),
  };
  const fields: FieldsCardField[] = [
    {
      kind: 'switch',
      path: 'enabled',
      label: s('card.enabled'),
      help: s('card.enabledHelp'),
    },
    {
      kind: 'number',
      path: 'slowRequestMs',
      label: s('card.slowRequestMs'),
      min: 500,
      max: 60_000,
    },
    {
      kind: 'number',
      path: 'slowLoadMs',
      label: s('card.slowLoadMs'),
      min: 1_000,
      max: 60_000,
    },
    {
      kind: 'number',
      path: 'rageClicks',
      label: s('card.rageClicks'),
      min: 3,
      max: 10,
    },
    {
      kind: 'number',
      path: 'formErrorRepeats',
      label: s('card.formErrorRepeats'),
      min: 2,
      max: 10,
    },
    {
      kind: 'number',
      path: 'maxPerPage',
      label: s('card.maxPerPage'),
      min: 1,
      max: 50,
    },
    {
      kind: 'number',
      path: 'urgentVisitors',
      label: s('card.urgentVisitors'),
      help: s('card.urgentVisitorsHelp'),
      min: 1,
      max: 1_000,
    },
    {
      kind: 'number',
      path: 'showDays',
      label: s('card.showDays'),
      min: 1,
      max: 365,
    },
    {
      kind: 'number',
      path: 'glitchMinutes',
      label: s('card.glitchMinutes'),
      min: 1,
      max: 1_440,
    },
  ];

  const table = (rows: ProblemRow[], testId: string) => (
    <div className="a2-tblw a2-mt12">
      <table className="a2-tbl" data-testid={testId}>
        <thead>
          <tr>
            <th>{s('col.problem')}</th>
            <th>{s('col.who')}</th>
            <th>{s('col.status')}</th>
            <th>{s('col.last')}</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-severity={r.severity} data-status={r.status}>
              <td className="pb-what">
                <span className={`a2-pill ${SEV_PILL[r.severity]}`}>{s(`sev.${r.severity}`)}</span>
                <div className="pb-kind">{s(`kind.${r.kind}`)}</div>
                <div className="a2-sm a2-mute pb-path">{s('where', { step: s(`step.${r.step}`), path: r.path })}</div>
                {r.detail ? <div className="a2-sm pb-detail">{r.detail}</div> : null}
                {r.back ? <div className="a2-sm pb-back">{s('back')}</div> : null}
              </td>
              <td className="a2-sm">
                {s('whoLine', {
                  visitors: num(r.visitors),
                  records: num(r.records),
                })}
              </td>
              <td>
                <span className={`a2-pill ${STATUS_PILL[r.status]}`}>{s(`status.${r.status}`)}</span>
              </td>
              <td className="a2-sm">{at(r.lastSeenAt)}</td>
              <td>
                <Link className="a2-btn" href={`${HERE}/${r.id}`}>
                  {s('open')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="a2-z" data-testid="problems-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="a2-views pb-views" aria-label={s('title')}>
        {VIEWS.map((w) => (
          <Link key={w} className={`a2-view${current === w ? ' on' : ''}`} href={`${HERE}?when=${w}`} aria-current={current === w ? 'page' : undefined} data-testid={`problems-view-${w}`}>
            {s(`views.${w}`, { days: num(v.cards.problems.value.showDays) })}
          </Link>
        ))}
      </nav>
      <form className="pb-day" action={HERE} method="get">
        <label className="a2-sm" htmlFor="pb-day">
          {s('dayPick')}
        </label>
        <input id="pb-day" className="a2-inp" type="date" name="when" defaultValue={typeof when === 'object' ? when.day : ''} />
        <button className="a2-btn" type="submit">
          {s('dayGo')}
        </button>
      </form>
      {typeof when === 'object' ? <p className="a2-sm a2-mute a2-mt12">{s('dayShown', { day: day(when.day) })}</p> : null}

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="problems-kpi-open" data-urgent={v.open.urgent}>
          <div className="a2-kl">{s('kpi.open')}</div>
          <div className="a2-kv">{num(v.open.total)}</div>
          <div className="a2-kf">
            <span className="a2-kn">
              {s('kpi.openFoot', {
                urgent: num(v.open.urgent),
                important: num(v.open.important),
              })}
            </span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="problems-kpi-visitors">
          <div className="a2-kl">{s('kpi.visitors')}</div>
          <div className="a2-kv">{num(v.visitors)}</div>
          <div className="a2-kf">
            <span className="a2-kn">
              {s('kpi.visitorsFoot', {
                from: day(v.firstDay),
                to: day(v.lastDay),
              })}
            </span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="problems-kpi-recorder" data-on={v.enabled ? 'yes' : 'no'}>
          <div className="a2-kl">{s('kpi.recorder')}</div>
          <div className="a2-kv a2-sm a2-kvw">{s(v.enabled ? 'kpi.on' : 'kpi.off')}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.recorderFoot')}</span>
          </div>
        </div>
      </div>

      {!v.enabled ? (
        <div className="a2-note a2-mt12" role="note" data-testid="problems-off">
          <span>{s('offNote')}</span>
        </div>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="pb-trend-h">
        <h2 className="a2-h3" id="pb-trend-h">
          {s('trendH')}
        </h2>
        <ol className="pb-trend a2-mt12" data-testid="problems-trend">
          {v.trend.map((x) => (
            <li key={x.day} title={s('trendBar', { day: day(x.day), n: num(x.records) })}>
              <span className="pb-bar" style={{ height: `${Math.round((x.records / peak) * 100)}%` }} />
              <span className="hl-sr">{s('trendBar', { day: day(x.day), n: num(x.records) })}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="pb-list-h">
        <h2 className="a2-h3" id="pb-list-h">
          {s('listH')}
        </h2>
        {v.rows.length ? (
          table(v.rows, 'problems-rows')
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="problems-none">
            {s('none')}
          </p>
        )}
      </section>

      {v.glitches.length ? (
        <section className="a2-sc a2-mt12" aria-labelledby="pb-glitch-h">
          <h2 className="a2-h3" id="pb-glitch-h">
            {s('glitchesH')}
          </h2>
          {table(v.glitches, 'problems-glitches')}
        </section>
      ) : null}

      <FieldsCard
        url={API}
        screen={{
          key: v.cards.problems.key,
          value: v.cards.problems.value,
          version: v.cards.problems.version,
        }}
        fields={fields}
        texts={texts}
        canEdit={canEdit}
        testId="problems-recorder"
      />
    </div>
  );
}
