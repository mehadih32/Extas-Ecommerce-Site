// S15 · PR 580 (Blueprint C2.4; AIC-0x "Model picks · free models" — demo 89b-admin-agents.js's `za_modelsTab`) —
// AI › Model picks at `/admin/ai/models` (`ai.read`; off by default behind `ai.modelAutoSuggest.enabled`,
// `ai.control`): for every Cost Book job, a suggested model with its reason. Free models sit in the same
// candidate pool as every paid one and are scored the same way — the cheapest tested model that clears the job's
// own quality bar is suggested, so cost only ever falls when quality holds. See
// `lib/admin-ai/model-qualification.ts` for the honesty note on how "quality" is measured today.
// Guide: docs/admin-guide/pages/ai/models.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CostBookModelSelect, type CostBookModelOption } from '@/components/admin/ai/CostBookModelSelect';
import { CostBookSearch } from '@/components/admin/ai/CostBookSearch';
import { ModelAutoSuggestSwitch } from '@/components/admin/ai/ModelAutoSuggestSwitch';
import { ModelsActionButton } from '@/components/admin/ai/ModelsActionButton';
import { QualityBarChips } from '@/components/admin/ai/QualityBarChips';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { aiAgentDef } from '@/lib/admin-ai/agents';
import { SECTION_NAMES } from '@/lib/admin-ai/cost-book';
import { QUALITY_BAR_OPTIONS, modelSuggestionsView, type JobModelSuggestion, type ScoredCandidate } from '@/lib/admin-ai/model-qualification';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-ai.bn.json';
import en from '../../../../../messages/admin-ai.en.json';
import '../ai.css';
import './models.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiModels';
const HERE = '/admin/ai/models';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiModels: (view.lang === 'bn' ? bn : en).aiModels as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiModels.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiModelPicksPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="models-page">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiModels.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;

  const o = await modelSuggestionsView({ db: access.deps.db, resolver: access.deps.resolver }, MOTHER_STORE_ID);
  const money = moneyOf('USD', view.locale);
  const amount = (minor: number) => formatMoney(minor, money);
  const num = (n: number) => formatNumber(n, view.locale);
  const nameOf = (j: JobModelSuggestion) => (view.lang === 'bn' ? j.nameBn : j.nameEn);
  const sectionNameOf = (id: JobModelSuggestion['section']) => (view.lang === 'bn' ? SECTION_NAMES[id].bn : SECTION_NAMES[id].en);
  const modelLabel = (ch: Pick<ScoredCandidate, 'providerName' | 'displayName' | 'isFree'>) => `${ch.providerName} ${ch.displayName}${ch.isFree ? ` (${c('job.freeBadge')})` : ''}`;

  const optionsFor = (j: JobModelSuggestion): CostBookModelOption[] =>
    j.candidates
      .filter((ch) => !ch.blocked)
      .map((ch) => ({ modelKey: ch.modelKey, label: modelLabel(ch), isRecommended: ch.modelKey === j.selectedModelKey && j.isOptimal, perRunText: '', perMonthText: amount(ch.perMonthUsdMinor) }));

  const whyOf = (j: JobModelSuggestion) => {
    if (!j.testedAt) return c('why.notTested');
    if (!j.suggested) return c('why.none');
    if (j.isOptimal) return c('why.same', { model: modelLabel(j.suggested) });
    const current = j.candidates.find((ch) => ch.modelKey === j.selectedModelKey);
    const notPassing = current && current.passed !== true ? c('why.currentNotPassing') : '';
    return (
      c('why.switch', {
        model: modelLabel(j.suggested),
        score: j.suggested.score,
        bar: j.bar,
        pct: j.barPercent,
        best: j.best,
        cost: amount(j.suggested.costPer100RunsUsdMinor),
        curCost: amount(current?.costPer100RunsUsdMinor ?? 0),
      }) + notPassing
    );
  };

  return (
    <div className="a2-z" data-testid="models-page">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!o.enabled ? (
        <section className="a2-card tight models-off" data-testid="models-off">
          <div className="models-off-h">
            <div>
              <h2 className="a2-h3">{c('off.title')}</h2>
              <p className="a2-sm a2-mute">{c('off.body')}</p>
            </div>
            {canControl ? (
              <ModelAutoSuggestSwitch on={false} label={c('off.switchLabel')} onText={c('off.toastOn')} offText={c('off.toastOff')} failedText={c('off.toastFailed')} />
            ) : (
              <span className="a2-pill line">{c('off.ownerOnly')}</span>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="a2-note models-note a2-mt12" role="note" data-testid="models-honest-note">
            <ShellIcon name="info" size={15} />
            <span>{c('honestNote')}</span>
          </div>

          <div className="row models-switch-row a2-mt12">
            {canControl ? <ModelAutoSuggestSwitch on={true} label={c('off.switchLabel')} onText={c('off.toastOn')} offText={c('off.toastOff')} failedText={c('off.toastFailed')} /> : null}
            <span className="a2-xs a2-mute">{c('off.switchLabel')}</span>
          </div>

          <div className="a2-kpis a2-mt12">
            <div className="a2-card a2-kpi" data-testid="models-kpi-jobs">
              <div className="a2-kl">{c('kpis.jobs')}</div>
              <div className="a2-kv">{num(o.jobs.length)}</div>
              <div className="a2-xs a2-mute">{c('kpis.jobsSub')}</div>
            </div>
            <div className="a2-card a2-kpi" data-testid="models-kpi-waiting">
              <div className="a2-kl">{c('kpis.waiting')}</div>
              <div className="a2-kv">{num(o.betterPicksWaiting)}</div>
              <div className="a2-xs a2-mute">{c('kpis.waitingSub')}</div>
            </div>
            <div className="a2-card a2-kpi" data-testid="models-kpi-saving">
              <div className="a2-kl">{c('kpis.saving')}</div>
              <div className="a2-kv">{amount(o.monthlySavingUsdMinor)}</div>
              <div className="a2-xs a2-mute">{c('kpis.savingSub')}</div>
            </div>
            <div className="a2-card a2-kpi" data-testid="models-kpi-free">
              <div className="a2-kl">{c('kpis.free')}</div>
              <div className="a2-kv">{num(o.freeModelCount)}</div>
              <div className="a2-xs a2-mute">{c('kpis.freeSub')}</div>
            </div>
          </div>

          {canControl ? (
            <div className="row models-bulk a2-mt12" data-testid="models-bulk-actions">
              {o.betterPicksWaiting > 0 ? (
                <ModelsActionButton payload={{ acceptAll: true }} label={c('actions.acceptAll', { n: o.betterPicksWaiting })} busyLabel={c('actions.acceptAllBusy')} toastText={c('actions.acceptAllDone', { n: o.betterPicksWaiting, saving: amount(o.monthlySavingUsdMinor) })} failedText={c('actions.acceptAllFailed')} variant="primary" testId="models-accept-all" />
              ) : (
                <span className="a2-xs a2-mute">{c('actions.acceptAllNone')}</span>
              )}
              <ModelsActionButton payload={{ retestAll: true }} label={c('actions.retestAll')} busyLabel={c('actions.retestAllBusy')} toastText={c('actions.retestAllDone')} failedText={c('actions.retestAllFailed')} variant="secondary" testId="models-retest-all" />
            </div>
          ) : null}

          <div className="a2-mt12">
            <CostBookSearch label={c('search.label')} placeholder={c('search.placeholder')} noneText={c('search.none')} rowsId="models-rows" noneId="models-none" />
          </div>

          <div className="models-grid a2-mt12" id="models-rows">
            {o.jobs.map((j) => {
              const text = [j.nameEn, j.nameBn, sectionNameOf(j.section), j.agentKey].join(' ').toLowerCase();
              const ag = aiAgentDef(j.agentKey);
              return (
                <article key={j.key} className="a2-card tight models-job" data-cb-text={text} data-job={j.key} data-testid={`models-job-${j.key}`}>
                  <div className="models-job-h">
                    <div className="models-job-title">
                      <b>{nameOf(j)}</b>
                      <span className="a2-xs a2-mute">{sectionNameOf(j.section)}</span>
                    </div>
                    <span className="a2-pill line models-agent">
                      {ag.emoji} {view.lang === 'bn' ? ag.nameBn : ag.nameEn}
                    </span>
                  </div>

                  <div className="models-now-sug a2-xs">
                    <span>
                      {c('job.now')}: <b>{modelLabel(j.candidates.find((ch) => ch.modelKey === j.selectedModelKey) ?? j.candidates[0]!)}</b>
                    </span>
                    <span>
                      {c('job.suggested')}: <b>{j.suggested ? modelLabel(j.suggested) : c('job.none')}</b>
                    </span>
                    <span className="a2-mute">{j.testedAt ? c('job.testedAt', { when: dateTime(j.testedAt, view.locale, view.timeZone) }) : c('job.notTested')}</span>
                  </div>

                  <div className={`models-why${j.isOptimal ? ' same' : ''}`} data-testid={`models-why-${j.key}`}>
                    <ShellIcon name="spark" size={15} />
                    <div>
                      <span>{whyOf(j)}</span>
                      {j.suggested && !j.isOptimal && j.monthlySavingUsdMinor > 0 ? <div className="a2-sm a2-b models-saving">{c('saving.line', { amount: amount(j.monthlySavingUsdMinor) })}</div> : null}
                    </div>
                  </div>

                  <div className="models-actions" data-testid={`models-actions-${j.key}`}>
                    {canControl && j.suggested && !j.isOptimal ? (
                      <ModelsActionButton payload={{ jobKey: j.key, accept: true }} label={c('accept.label')} busyLabel={c('accept.busyLabel')} toastText={c('accept.toastDone', { job: nameOf(j), model: modelLabel(j.suggested) })} failedText={c('accept.toastFailed')} variant="primary" testId={`models-accept-${j.key}`} />
                    ) : null}
                    {canControl ? (
                      <CostBookModelSelect jobKey={j.key} selected={j.selectedModelKey} options={optionsFor(j)} label={c('pick.label', { job: nameOf(j) })} changedText={c('pick.toastChanged')} failedText={c('pick.toastFailed')} recommendedText={c('pick.recommended')} />
                    ) : null}
                    {canControl ? (
                      <ModelsActionButton payload={{ jobKey: j.key, retest: true }} label={c('retest.label')} busyLabel={c('retest.busyLabel')} toastText={c('retest.toastDone')} failedText={c('retest.toastFailed')} variant="ghost" testId={`models-retest-${j.key}`} />
                    ) : null}
                  </div>

                  <details className="models-scores">
                    <summary className="a2-xs">{c('allScores')}</summary>
                    {canControl ? <QualityBarChips jobKey={j.key} value={j.barPercent} options={QUALITY_BAR_OPTIONS} label={c('bar.label', { job: nameOf(j) })} changedText={(pct) => c('bar.toastChanged', { pct })} failedText={c('bar.toastFailed')} /> : null}
                    <div className="a2-tblw">
                      <table className="a2-tbl models-cand-tbl">
                        <thead>
                          <tr>
                            <th>{c('col.model')}</th>
                            <th>{c('col.quality')}</th>
                            <th>{c('col.cost')}</th>
                            <th>{c('col.note')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...j.candidates]
                            .sort((a, b) => b.score - a.score)
                            .map((ch) => (
                              <tr key={ch.modelKey} data-testid={`models-cand-${j.key}-${ch.modelKey}`}>
                                <td>
                                  {modelLabel(ch)}
                                  {ch.modelKey === j.selectedModelKey ? <span className="a2-xs a2-mute"> · {c('job.now')}</span> : null}
                                </td>
                                <td>
                                  {ch.blocked ? '—' : ch.score}
                                  <span className={`a2-pill ${ch.blocked ? 'line' : ch.passed ? 'ok' : 'bad'}`}>{ch.blocked ? c('status.blocked') : ch.passed ? c('status.pass') : c('status.fail')}</span>
                                </td>
                                <td>{amount(ch.costPer100RunsUsdMinor)}</td>
                                <td className="a2-xs a2-mute">{ch.blocked ? c('blockedNote') : ''}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </article>
              );
            })}
            <p className="a2-sm a2-mute" id="models-none" style={{ display: 'none' }}>
              {c('search.none')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
