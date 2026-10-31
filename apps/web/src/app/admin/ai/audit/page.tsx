// S21 · PR 570 (B7.3 · Note 14/21, AIC-05) — AI › Checklist audit at /admin/ai/audit (owner only, `health.read`): the
// e-commerce checklist in the backend, group by group with each point and its newest QA mark; the last audit's result
// per group and its problems; the audits kept; "Run now" and the runner's switches (`health.audit`, `settings.write`,
// off as it ships). The server runs the audit (infra/deploy/audit.sh); fixes only through Fixes to approve (PR 420).
// lib/admin-health/audit.ts.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { JourneysRun } from '@/components/admin/settings/JourneysRun';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { AUDIT_MARKS, auditView, type AuditRun, type ChecklistGroup } from '@/lib/admin-health/audit';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import hbn from '../../../../../messages/admin-health.bn.json';
import hen from '../../../../../messages/admin-health.en.json';
import '../../settings-cards.css';
import '../../reports/health/health.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/ai/audit';
const API = '/api/admin/ai/audit';
const KEY = 'aiAudit';
const FIXES = '/admin/reports/health/fixes';

function withScreen(view: AdminView): AdminView {
  const extra = (view.lang === 'bn' ? [hbn] : [hen]) as unknown as Dict[];
  return { ...view, dict: Object.assign({}, view.dict, ...extra) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'aud.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ChecklistAuditPage() {
  const deps = adminDeps();
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
  const v = await auditView({ db: access.deps.db, resolver: access.deps.resolver, now: access.deps.now }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `aud.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const last = v.last;
  const resultOf = (g: ChecklistGroup): string => {
    if (!last) return 'none';
    const r = last.groups.find((x) => x.id === g.id);
    return r ? r.status : 'notChosen';
  };
  const pill = (r: string) => (r === 'pass' ? 'ok' : r === 'fail' ? 'bad' : '');
  const kind = (r: AuditRun) => (r.kind === 'scheduled' || r.kind === 'run now' ? s(`kind.${r.kind}`) : r.kind);

  const cardTexts: FieldsCardTexts = {
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
    { kind: 'switch', path: 'enabled', label: s('card.enabled'), help: s('card.enabledHelp') },
    { kind: 'select', path: 'every', label: s('card.every'), options: (['daily', 'weekly'] as const).map((e) => ({ value: e, label: s(`card.${e}`) })) },
    { kind: 'select', path: 'weekday', label: s('card.weekday'), numeric: true, options: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: s(`day.${n}`) })) },
    { kind: 'number', path: 'hour', label: s('card.hour'), help: s('card.hourHelp'), min: 0, max: 23 },
    { kind: 'checks', path: 'groups', label: s('card.groups'), options: v.groups.map((g) => ({ value: g.id, label: `${g.id === 'timing' ? 'L' : g.id}. ${g.title}` })) },
    { kind: 'number', path: 'agents', label: s('card.agents'), help: s('card.agentsHelp'), min: 1, max: 3 },
    { kind: 'switch', path: 'telegram', label: s('card.telegram'), help: s('card.telegramHelp') },
    { kind: 'number', path: 'keepRuns', label: s('card.keepRuns'), help: s('card.keepRunsHelp'), min: 1, max: 52 },
  ];
  const runTexts = { run: s('run.run'), running: s('run.running'), asked: s('run.asked'), waiting: s('run.waiting'), err: cardTexts.err };

  return (
    <div className="a2-z" data-testid="audit-page" data-on={String(v.settings.enabled)}>
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-note" role="note" data-testid="audit-rule">
        <span>
          {s('rule')}{' '}
          <Link className="sk-pic" href={FIXES}>
            {s('fixesLink')}
          </Link>
        </span>
      </div>
      {!v.settings.enabled ? (
        <div className="a2-note a2-mt12" role="note" data-testid="audit-off">
          <span>{s('off')}</span>
        </div>
      ) : null}
      <p className="a2-sm a2-mute a2-mt12" data-testid="audit-agents-mock">
        {s('agentsMock')}
      </p>

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="audit-kpi-points" data-n={v.points}>
          <div className="a2-kl">{s('kpi.points')}</div>
          <div className="a2-kv">{num(v.points)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.pointsFoot', { groups: num(v.groups.length) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="audit-kpi-last" data-ok={last ? String(last.ok) : 'none'}>
          <div className="a2-kl">{s('kpi.last')}</div>
          <div className={`a2-kv sp-kvt${last && !last.ok ? ' sp-bad' : ''}`}>{last ? s(last.ok ? 'kpi.ok' : 'kpi.fail') : s('kpi.lastNone')}</div>
          <div className="a2-kf">
            <span className="a2-kn">{last?.at ?? ''}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="audit-kpi-failed" data-n={last?.failedGroups ?? 0}>
          <div className="a2-kl">{s('kpi.failed')}</div>
          <div className={`a2-kv${last?.failedGroups ? ' sp-bad' : ''}`}>{num(last?.failedGroups ?? 0)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.failedFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="audit-kpi-agents" data-n={last?.agentGroups ?? 0}>
          <div className="a2-kl">{s('kpi.agents')}</div>
          <div className="a2-kv">{num(last?.agentGroups ?? 0)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.agentsFoot', { asked: num(last?.agentsAsked ?? v.settings.agents) })}</span>
          </div>
        </div>
      </div>

      <div className="a2-mt12">{v.canEdit ? <JourneysRun url={API} texts={runTexts} waiting={v.asked} testId="audit-run" /> : <p className="a2-sm a2-mute">{s('run.noPerm')}</p>}</div>

      {last?.problems.length ? (
        <section className="a2-sc a2-mt12" aria-labelledby="audit-problems-h" data-testid="audit-problems">
          <h2 className="a2-h3" id="audit-problems-h">
            {s('problemsH')}
          </h2>
          <ul className="hs-said a2-sm">
            {last.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="a2-h3 a2-mt12">{s('groupsH')}</h2>
      <div className="a2-tblw a2-mt12">
        <table className="a2-tbl sp-tbl" data-testid="audit-groups">
          <thead>
            <tr>
              <th>{s('col.group')}</th>
              <th>{s('col.points')}</th>
              <th>{s('col.marks')}</th>
              <th>{s('col.result')}</th>
            </tr>
          </thead>
          <tbody>
            {v.groups.map((g) => {
              const r = resultOf(g);
              const other = g.points.length - g.counts.pass - g.counts.fail;
              return (
                <tr key={g.id} data-group={g.id} data-result={r}>
                  <td className="a2-tdh">
                    <div>{`${g.id === 'timing' ? 'L' : g.id}. ${g.title}`}</div>
                    <details className="hs-fold">
                      <summary>{s('showPoints', { n: num(g.points.length) })}</summary>
                      <ul className="hs-points a2-sm">
                        {g.points.map((p) => (
                          <li key={p.id} data-mark={p.mark}>
                            <b>{p.id}</b> {p.text} <span className="a2-mute">({s(`mark.${(AUDIT_MARKS as readonly string[]).includes(p.mark) ? p.mark : 'notRun'}`)})</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td data-l={s('col.points')}>{num(g.points.length)}</td>
                  <td className="a2-sm" data-l={s('col.marks')}>
                    {s('marks', { pass: num(g.counts.pass), fail: num(g.counts.fail), other: num(other) })}
                  </td>
                  <td data-l={s('col.result')}>
                    <span className={`a2-pill ${pill(r)}`}>{s(`result.${r}`)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="audit-runs-h" data-testid="audit-runs">
        <h2 className="a2-h3" id="audit-runs-h">
          {s('runsH')}
        </h2>
        {v.runs.length ? (
          <ul className="hs-said a2-sm">
            {v.runs.map((r, i) => (
              <li key={i} data-ok={String(r.ok)}>
                {s('runLine', { at: r.at, kind: kind(r), passed: num(r.passedGroups), failed: num(r.failedGroups), agents: num(r.agentGroups) })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{s('runsNone')}</p>
        )}
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: v.cards.audit.key, value: v.cards.audit.value, version: v.cards.audit.version }} fields={fields} texts={cardTexts} canEdit={v.canEdit} testId="audit-card" />
      </div>
    </div>
  );
}
