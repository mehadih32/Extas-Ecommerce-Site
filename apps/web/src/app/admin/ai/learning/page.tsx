// S15 · PR 585 (register "Continuous learning engine — Tirondaj (ads) and Doot (SEO/marketing) are the two power
// agents… When stuck: research all sources → solve → the solution becomes a skill in its basket. Quality gate (no
// shortcut learning)… Practice tasks with deadlines… Paid data tools… proposed with cost and reason") — AI ›
// Learning engine at `/admin/ai/learning`: the master switch and the quality gate's own source count (`ai.read` to
// see, `ai.control` to save), every learning source and its on/off (`ai.control`), every tip from candidate through
// the quality gate to the skill basket or "doesn't work for us" (`ai.skills.write` — the tip lands in the exact
// same `ai.skill` approval queue as any other skill proposal, decided from `AI › Approvals`, never a second
// decision path here), every practice task and its grade (`ai.control`, read into the agent's own appraisal), and
// paid-tool proposals (`ai.control` — the owner approves and pays from `AI › Approvals`, nothing here ever charges
// anything). lib/admin-ai/learning-engine.ts. Guide: docs/admin-guide/pages/ai/learning.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { MIN_INDEPENDENT_SOURCES_MAX, MIN_INDEPENDENT_SOURCES_MIN } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import {
  LearningSourceArchiveButton,
  LearningSourceForm,
  LearningSourceSwitch,
  LearningTipForm,
  LearningTipPromoteForm,
  LearningTipVerifyForm,
  PaidToolProposalForm,
  PracticeTaskForm,
  PracticeTaskGradeForm,
} from '@/components/admin/ai/LearningEngineControls';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { aiAgentDef } from '@/lib/admin-ai/agents';
import {
  LEARNING_SOURCE_KINDS,
  learningEngineCard,
  learningSourcesView,
  learningTipsView,
  POWER_AGENT_OPTIONS,
  practiceTasksView,
  type LearningSourceRow,
  type LearningTipRow,
  type PowerAgentKey,
  type PracticeTaskRow,
} from '@/lib/admin-ai/learning-engine';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-ai-learning.bn.json';
import en from '../../../../../messages/admin-ai-learning.en.json';
import '../ai.css';
import './learning.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiLearning';
const HERE = '/admin/ai/learning';
const API = '/api/admin/ai/learning';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiLearning: (view.lang === 'bn' ? bn : en).aiLearning as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiLearning.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiLearningPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="learning-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiLearning.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;
  const canSkills = access.guard.permissions?.has('ai.skills.write') ?? false;

  const settings = await access.deps.resolver.value('ai.learningEngine');
  const [sources, tips, tasks] = await Promise.all([learningSourcesView({ db: access.deps.db }), learningTipsView({ db: access.deps.db }), practiceTasksView({ db: access.deps.db })]);
  const card = learningEngineCard(settings);
  const at = (x: Date) => dateTime(x.toISOString(), view.locale, view.timeZone);

  const agentLabel = (key: PowerAgentKey) => {
    const a = aiAgentDef(key);
    return `${a.emoji} ${view.lang === 'bn' ? a.nameBn : a.nameEn}`;
  };
  const agentOptions = POWER_AGENT_OPTIONS.map((a) => ({ key: a.key, label: view.lang === 'bn' ? `${a.emoji} ${a.nameBn}` : `${a.emoji} ${a.nameEn}` }));
  const kindOptions = LEARNING_SOURCE_KINDS.map((k) => ({ key: k, label: c(`sources.kind.${k}`) }));
  // Every source, across both power agents — the form's own agent select picks who the tip is for; the server
  // refuses a source that belongs to a different agent, so a source from the "wrong" agent here is harmless.
  const tipSourceOptions = sources.map((s) => ({ key: s.id, label: `${agentLabel(s.agentKey)} · ${c(`sources.kind.${s.kind}`)} · ${s.url}` }));

  const cardTexts: FieldsCardTexts = {
    h: c('card.h'),
    d: c('card.d'),
    save: c('card.save'),
    saving: c('card.saving'),
    saved: c('card.saved'),
    discard: c('card.discard'),
    unsaved: c('card.unsaved'),
    readOnly: c('card.readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'STALE', 'BUSY', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, c(`card.err.${k}`)])),
  };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: c('card.on'), help: c('card.onHelp') },
    { kind: 'number', path: 'minIndependentSources', label: c('card.minIndependentSources'), help: c('card.minIndependentSourcesHelp'), min: MIN_INDEPENDENT_SOURCES_MIN, max: MIN_INDEPENDENT_SOURCES_MAX },
  ];

  const sourceStatus = (s: LearningSourceRow) => (s.enabled ? c('sources.status.on') : c('sources.status.off'));
  const tipStatusTone = (t2: LearningTipRow) => (t2.status === 'verified' || t2.status === 'promoted' ? 'ok' : t2.status === 'failed' ? 'bad' : 'gold');
  const taskStatusTone = (p: PracticeTaskRow) => (p.status === 'done' ? 'ok' : p.status === 'missed' ? 'bad' : 'gold');

  return (
    <div className="a2-z ai-page" data-testid="learning-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!canControl ? (
        <div className="a2-note a2-mt12" role="note" data-testid="learning-readonly">
          <span>{c('needPermission')}</span>
        </div>
      ) : null}

      <div className="a2-mt12">
        <FieldsCard url={API} screen={card} fields={cardFields} texts={cardTexts} canEdit={canControl} testId="learning-card" />
      </div>

      <section className="a2-sc lrn-sc" aria-labelledby="lrn-sources-h" data-testid="learning-sources">
        <div className="lrn-sc-h">
          <h2 className="a2-h3" id="lrn-sources-h">
            {c('sources.h')}
          </h2>
        </div>
        <p className="a2-sm a2-mute">{c('sources.d')}</p>
        {sources.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="learning-sources-table">
              <thead>
                <tr>
                  <th>{c('sources.col.agent')}</th>
                  <th>{c('sources.col.kind')}</th>
                  <th>{c('sources.col.url')}</th>
                  <th>{c('sources.col.status')}</th>
                  <th>{c('sources.col.tips')}</th>
                  <th>{c('sources.col.updated')}</th>
                  <th>{c('sources.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} data-testid={`learning-source-row-${s.id}`}>
                    <td data-l={c('sources.col.agent')}>{agentLabel(s.agentKey)}</td>
                    <td data-l={c('sources.col.kind')}>{c(`sources.kind.${s.kind}`)}</td>
                    <td className="a2-sm" data-l={c('sources.col.url')}>
                      {s.url}
                    </td>
                    <td data-l={c('sources.col.status')}>
                      {canControl ? (
                        <LearningSourceSwitch id={s.id} on={s.enabled} label={c('sources.col.status')} onText={c('sources.status.on')} offText={c('sources.status.off')} failedText={c('sources.form.failed')} />
                      ) : (
                        <span className={`a2-pill ${s.enabled ? 'ok' : 'line'}`}>{sourceStatus(s)}</span>
                      )}
                    </td>
                    <td data-l={c('sources.col.tips')}>{s.tipCount}</td>
                    <td className="a2-xs" data-l={c('sources.col.updated')}>
                      {at(s.updatedAt)}
                    </td>
                    <td data-l={c('sources.col.action')}>
                      {canControl ? <LearningSourceArchiveButton id={s.id} label={c('sources.archive')} doneText={c('sources.archived')} failedText={c('sources.form.failed')} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="learning-sources-empty">
            {c('sources.empty')}
          </p>
        )}
        {canControl ? (
          <LearningSourceForm
            agentOptions={agentOptions}
            kindOptions={kindOptions}
            texts={{ agent: c('sources.form.agent'), kind: c('sources.form.kind'), url: c('sources.form.url'), add: c('sources.form.add'), added: c('sources.form.added'), failed: c('sources.form.failed') }}
          />
        ) : null}
      </section>

      <section className="a2-sc lrn-sc" aria-labelledby="lrn-tips-h" data-testid="learning-tips">
        <h2 className="a2-h3" id="lrn-tips-h">
          {c('tips.h')}
        </h2>
        <p className="a2-sm a2-mute">{c('tips.d')}</p>
        {tips.length ? (
          <div className="a2-mt12" data-testid="learning-tips-list">
            {tips.map((tp) => (
              <div key={tp.id} className="lrn-row" data-testid={`learning-tip-row-${tp.id}`} data-status={tp.status}>
                <div className="lrn-row-h">
                  <span className="a2-sm">
                    {agentLabel(tp.agentKey)} · {tp.tip}
                  </span>
                  <span className={`a2-pill ${tipStatusTone(tp)}`}>{c(`tips.status.${tp.status}`)}</span>
                </div>
                <div className="lrn-meta a2-xs a2-mute">
                  {tp.sourceUrl ? <span>{tp.sourceUrl}</span> : null}
                  {tp.confidence ? <span>{c(`tips.verify.confidenceOptions.${tp.confidence}`)}</span> : null}
                  <span>{at(tp.updatedAt)}</span>
                </div>
                {tp.status === 'candidate' && canSkills ? (
                  <LearningTipVerifyForm
                    tipId={tp.id}
                    texts={{
                      testNote: c('tips.verify.testNote'),
                      confidence: c('tips.verify.confidence'),
                      confidenceOptions: [
                        { key: 'low', label: c('tips.verify.confidenceOptions.low') },
                        { key: 'medium', label: c('tips.verify.confidenceOptions.medium') },
                        { key: 'high', label: c('tips.verify.confidenceOptions.high') },
                      ],
                      supporting: c('tips.verify.supporting'),
                      run: c('tips.verify.run'),
                      verified: c('tips.verify.verified'),
                      failedGate: c('tips.verify.failedGate'),
                      failed: c('tips.verify.failed'),
                    }}
                  />
                ) : null}
                {tp.status === 'verified' && canSkills ? (
                  <LearningTipPromoteForm
                    tipId={tp.id}
                    texts={{ name: c('tips.promote.name'), purpose: c('tips.promote.purpose'), promote: c('tips.promote.promote'), promoted: c('tips.promote.promoted'), failed: c('tips.promote.failed') }}
                  />
                ) : null}
                {tp.status === 'failed' && tp.verification?.note ? <p className="a2-sm a2-mute lrn-note">{tp.verification.note}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="learning-tips-empty">
            {c('tips.empty')}
          </p>
        )}
        {canSkills ? (
          <LearningTipForm
            agentOptions={agentOptions}
            sourceOptions={tipSourceOptions}
            texts={{ agent: c('tips.form.agent'), source: c('tips.form.source'), sourceNone: c('tips.form.sourceNone'), tip: c('tips.form.tip'), propose: c('tips.form.propose'), proposed: c('tips.form.proposed'), failed: c('tips.form.failed') }}
          />
        ) : null}
      </section>

      <section className="a2-sc lrn-sc" aria-labelledby="lrn-practice-h" data-testid="learning-practice">
        <h2 className="a2-h3" id="lrn-practice-h">
          {c('practice.h')}
        </h2>
        <p className="a2-sm a2-mute">{c('practice.d')}</p>
        {tasks.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="learning-practice-table">
              <thead>
                <tr>
                  <th>{c('practice.col.agent')}</th>
                  <th>{c('practice.col.title')}</th>
                  <th>{c('practice.col.deadline')}</th>
                  <th>{c('practice.col.status')}</th>
                  <th>{c('practice.col.grade')}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((p) => (
                  <tr key={p.id} data-testid={`learning-practice-row-${p.id}`}>
                    <td data-l={c('practice.col.agent')}>{agentLabel(p.agentKey)}</td>
                    <td data-l={c('practice.col.title')}>
                      <span className="a2-cell">
                        <b>{p.title}</b>
                        <span className="a2-xs a2-mute">{p.goal}</span>
                      </span>
                    </td>
                    <td className="a2-xs" data-l={c('practice.col.deadline')}>
                      {p.deadline ? at(p.deadline) : '—'}
                    </td>
                    <td data-l={c('practice.col.status')}>
                      {p.status === 'open' && canControl ? (
                        <PracticeTaskGradeForm
                          taskId={p.id}
                          texts={{
                            status: c('practice.gradeForm.status'),
                            statusOptions: [
                              { key: 'done', label: c('practice.gradeForm.statusOptions.done') },
                              { key: 'missed', label: c('practice.gradeForm.statusOptions.missed') },
                            ],
                            grade: c('practice.gradeForm.grade'),
                            gradeOptions: [
                              { key: 'pass', label: c('practice.gradeForm.gradeOptions.pass') },
                              { key: 'partial', label: c('practice.gradeForm.gradeOptions.partial') },
                              { key: 'fail', label: c('practice.gradeForm.gradeOptions.fail') },
                            ],
                            save: c('practice.gradeForm.save'),
                            saved: c('practice.gradeForm.saved'),
                            failed: c('practice.gradeForm.failed'),
                          }}
                        />
                      ) : (
                        <span className={`a2-pill ${taskStatusTone(p)}`}>{c(`practice.status.${p.status}`)}</span>
                      )}
                    </td>
                    <td data-l={c('practice.col.grade')}>{p.grade ? c(`practice.grade.${p.grade}`) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="learning-practice-empty">
            {c('practice.empty')}
          </p>
        )}
        {canControl ? (
          <PracticeTaskForm
            agentOptions={agentOptions}
            texts={{ agent: c('practice.form.agent'), title: c('practice.form.title'), goal: c('practice.form.goal'), deadline: c('practice.form.deadline'), create: c('practice.form.create'), created: c('practice.form.created'), failed: c('practice.form.failed') }}
          />
        ) : null}
      </section>

      <section className="a2-sc lrn-sc" aria-labelledby="lrn-paid-h" data-testid="learning-paid-tool">
        <h2 className="a2-h3" id="lrn-paid-h">
          {c('paidTool.h')}
        </h2>
        <p className="a2-sm a2-mute">{c('paidTool.d')}</p>
        {canControl ? (
          <PaidToolProposalForm
            agentOptions={agentOptions}
            texts={{
              agent: c('paidTool.form.agent'),
              toolName: c('paidTool.form.toolName'),
              cost: c('paidTool.form.cost'),
              currency: c('paidTool.form.currency'),
              reason: c('paidTool.form.reason'),
              propose: c('paidTool.form.propose'),
              proposed: c('paidTool.form.proposed'),
              failed: c('paidTool.form.failed'),
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
