// S15 · PR 577 (C10.4; demo 89b-admin-agents.js) — one agent's 360° profile at `/admin/agents/:key` (Lumen,
// `data-lm-ready`): role, owned stages, never-touches and current plan read straight from its own
// docs/agents/<key>.md (never copied into code — `agent-profile.ts`'s own header explains why); skills it has and
// is learning, the same way; its real work log and assignments (honestly empty until a later job-runner PR or the
// owner himself writes to them); rewards; and, for someone who holds `ai.control`, an editor for the owner's own
// identity fields (bio, photo URL, joining date, the verified star — never the agent's fixed name/role), a "give a
// reward" form and an "assign a task" form. Seeing the page needs `ai.read`.
// Guide: docs/admin-guide/pages/ai/agents.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AgentAssignmentForm } from '@/components/admin/agents/AgentAssignmentForm';
import { AgentProfileEditor } from '@/components/admin/agents/AgentProfileEditor';
import { AgentRewardForm } from '@/components/admin/agents/AgentRewardForm';
import { CompleteAssignmentButton } from '@/components/admin/agents/CompleteAssignmentButton';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { agentProfileView, type AgentProfileAssignment } from '@/lib/admin-ai/agent-profile';
import { isAiError } from '@/lib/admin-ai/errors';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-agents.bn.json';
import en from '../../../../../messages/admin-agents.en.json';
import '../agents.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiAgents';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiAgents: (view.lang === 'bn' ? bn : en).aiAgents as unknown as Dict } };
}

function dateOnly(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const view = withScreen(await adminView());
  const deps = adminDeps();
  const name = deps ? await agentProfileView({ db: deps.db }, key).then((p) => p.nameEn).catch(() => key) : key;
  return { title: `${name} · ${t(view.dict, 'aiAgents.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AgentProfilePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const here = `/admin/agents/${key}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="agent-profile">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiAgents.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;

  let profile;
  try {
    profile = await agentProfileView({ db: access.deps.db }, key);
  } catch (e) {
    if (isAiError(e) && e.code === 'NOT_FOUND') {
      return (
        <div className="a2-z agent-page" data-testid="agent-profile" data-lm-ready="">
          <PageHead view={view} place={locateKey(KEY)} title={c('notFound')} sub="" />
          <Link className="a2-lnk" href="/admin/agents">
            {c('backToTeam')}
          </Link>
        </div>
      );
    }
    throw e;
  }

  const name = view.lang === 'bn' ? profile.nameBn : profile.nameEn;
  const assignmentRow = (a: AgentProfileAssignment, done: boolean) => (
    <div key={a.id} className="ag-li" data-testid={`agent-task-${a.id}`}>
      <div style={{ minWidth: 0 }}>
        <div className="a2-sm">{a.title}</div>
        <div className="a2-xs a2-mute">
          {done ? c('assignments.completedOn', { date: a.completedAt ? dateOnly(a.completedAt, view.locale) : '' }) : a.dueAt ? c('assignments.dueOn', { date: dateOnly(a.dueAt, view.locale) }) : c('assignments.noDue')}
          {' · '}
          {c('assignments.from', { source: a.source })}
        </div>
      </div>
      {!done && canControl ? <CompleteAssignmentButton agentKey={key} assignmentId={a.id} label={c('assignments.markDone')} doneText={c('assignments.done')} failedText={c('assignments.completeFailed')} /> : null}
    </div>
  );

  return (
    <div className="a2-z agent-page" data-testid="agent-profile" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={name} sub={profile.role} />
      <Link className="a2-lnk" href="/admin/agents">
        <ShellIcon name="cl" size={14} />
        {c('backToTeam')}
      </Link>

      <section className="a2-card ag-hero" data-testid="agent-hero">
        <span className="ag-av lg" aria-hidden="true">
          {profile.photoUrl ? <img src={profile.photoUrl} alt="" loading="lazy" /> : profile.emoji}
        </span>
        <div className="ag-heron">
          <div className="ag-row">
            <b style={{ fontSize: 17 }}>{name}</b>
            {profile.verified ? <span className="a2-pill line">{c('verified')}</span> : null}
          </div>
          <span className="a2-xs a2-mute">{profile.code}</span>
          {profile.bio ? <p className="a2-sm">{profile.bio}</p> : null}
          <span className="a2-xs a2-mute">{profile.joinedOn ? c('joined', { date: dateOnly(profile.joinedOn, view.locale) }) : c('notJoinedYet')}</span>
        </div>
      </section>

      <div className="ag-grid2">
        <div>
          <section className="a2-card" data-testid="agent-catalogue">
            <h2 className="a2-h3">{c('role')}</h2>
            <p className="a2-sm">{profile.catalogue.role}</p>
            <h2 className="a2-h3 ag-mt">{c('owns')}</h2>
            <p className="a2-sm a2-mute">{profile.catalogue.owns || c('noPlan')}</p>
            <h2 className="a2-h3 ag-mt">{c('neverTouches')}</h2>
            <p className="a2-sm a2-mute">{profile.catalogue.neverTouches || c('noPlan')}</p>
            <h2 className="a2-h3 ag-mt">{c('plan')}</h2>
            {profile.catalogue.plan.length ? (
              <ul>
                {profile.catalogue.plan.map((p, i) => (
                  <li key={i} className="a2-sm">
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('noPlan')}</p>
            )}
          </section>

          <section className="a2-card ag-mt" data-testid="agent-skills">
            <h2 className="a2-h3">{c('skillsHas')}</h2>
            {profile.catalogue.skillsHas.length ? (
              <ul>
                {profile.catalogue.skillsHas.map((s, i) => (
                  <li key={i} className="a2-sm">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('noSkills')}</p>
            )}
            <h2 className="a2-h3 ag-mt">{c('skillsLearning')}</h2>
            {profile.catalogue.skillsLearning.length ? (
              <ul>
                {profile.catalogue.skillsLearning.map((s, i) => (
                  <li key={i} className="a2-sm">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('noSkills')}</p>
            )}
          </section>

          <section className="a2-card ag-mt" data-testid="agent-worklog">
            <h2 className="a2-h3">{c('workLog.heading')}</h2>
            {profile.recentWork.length ? (
              profile.recentWork.map((w) => (
                <div key={w.id} className="ag-li">
                  <div style={{ minWidth: 0 }}>
                    <div className="a2-sm">{w.summary}</div>
                    <div className="a2-xs a2-mute">{dateOnly(w.createdAt, view.locale)}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="a2-sm a2-mute">{c('workLog.none')}</p>
            )}
          </section>
        </div>

        <div>
          {canControl ? (
            <section className="a2-card" data-testid="agent-editor">
              <h2 className="a2-h3">{c('edit.heading')}</h2>
              <AgentProfileEditor
                agentKey={key}
                bio={profile.bio}
                photoUrl={profile.photoUrl}
                joinedOn={profile.joinedOn}
                verified={profile.verified}
                labels={{
                  bio: c('edit.bio'),
                  photo: c('edit.photo'),
                  joined: c('edit.joined'),
                  verified: c('edit.verified'),
                  save: c('edit.save'),
                  saved: c('edit.saved'),
                  failed: c('edit.failed'),
                  invalid: c('edit.invalid'),
                }}
              />
            </section>
          ) : (
            <section className="a2-card" data-testid="agent-editor-ro">
              <p className="a2-xs a2-mute">{c('readOnly')}</p>
            </section>
          )}

          <section className="a2-card ag-mt" data-testid="agent-rewards">
            <h2 className="a2-h3">{c('rewards.heading')}</h2>
            {profile.rewards.length ? (
              profile.rewards.map((r) => (
                <div key={r.id} className="ag-li">
                  <div style={{ minWidth: 0 }}>
                    <div className="a2-sm">
                      <ShellIcon name="spark" size={13} /> {r.label}
                    </div>
                    {r.note ? <div className="a2-xs a2-mute">{r.note}</div> : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="a2-sm a2-mute">{c('rewards.none')}</p>
            )}
            {canControl ? (
              <AgentRewardForm agentKey={key} labels={{ label: c('rewards.label'), note: c('rewards.note'), give: c('rewards.give'), given: c('rewards.given'), failed: c('rewards.failed') }} />
            ) : null}
          </section>

          <section className="a2-card ag-mt" data-testid="agent-assignments">
            <h2 className="a2-h3">{c('assignments.heading')}</h2>
            <h3 className="a2-sm bold ag-mt">{c('assignments.openHeading')}</h3>
            {profile.openAssignments.length ? profile.openAssignments.map((a) => assignmentRow(a, false)) : <p className="a2-sm a2-mute">{c('assignments.noneOpen')}</p>}
            <h3 className="a2-sm bold ag-mt">{c('assignments.doneHeading')}</h3>
            {profile.doneAssignments.length ? profile.doneAssignments.map((a) => assignmentRow(a, true)) : <p className="a2-sm a2-mute">{c('assignments.noneDone')}</p>}
            {canControl ? (
              <AgentAssignmentForm
                agentKey={key}
                labels={{ title: c('assignments.title'), description: c('assignments.description'), due: c('assignments.due'), assign: c('assignments.assign'), assigned: c('assignments.assigned'), failed: c('assignments.failed') }}
              />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
