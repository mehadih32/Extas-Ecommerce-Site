// S15 · PR 304 (C1.1, C1.2; AIC-01 Control room, Blueprint C1.2; demo 97y-adm2-ai.js) — AI › Control room at
// `/admin/ai` (Lumen, `data-lm-ready`): the AI 360 home screen. Four tiles (agents running now, today's cost, this
// month's cost, the monthly cap), and a card per fixed agent with its status, what it last did and its own pause
// button (`ai.control`). Nothing here is invented: with no AI provider wired yet (PR 306) and no job run, the cost
// is honestly 0 and "last activity" is honestly empty. Seeing the page needs `ai.read`.
//
// S15 · PR 305 (C1.3) — the master-switch banner now turns `ai.enabled` on or off itself (MasterSwitch, `ai.control`,
// AIC-01's own big switch), with a money-safety note while no monthly cap is set yet. Each agent card also carries
// "keep running even when AI is off" (KeepOnSwitch, `AiAgent.keepOnWhenMasterOff`) — a property of every agent, not
// a special case — and the status pill says so when that is why an agent is working while the master is off.
//
// S15 · PR 307 (C1.5) — each card also carries its own model pick (ModelPickSelect, `AiAgent.selectedProvider`):
// the practice writer plus the four PR 306 connections, an un-Tested one shown but disabled. A "Recommended" pill
// marks Claude's own pick (the first ready provider, Anthropic first); the note beside the select always explains
// the effect — matches the recommendation, or honestly says cost/quality comparisons wait for the AI Cost Book
// (PR 312) — never a number this page has not actually measured.
//
// S15 · PR 308 (C1.6) — each card also carries its own schedule (ScheduleEditor, `AiAgent.schedule`): always (the
// default — no time restriction) or a daily/weekly clock time, with a plain preview of when it would next fire.
// Nothing runs on it yet (no job runner reads a schedule); it is honestly a preview, same as a pause switch or a
// model pick before any AI key existed.
//
// S15 · PR 309 (C1.6) — each card also carries its own monthly spend cap (CapInput, `AiAgent.monthlyCapMinor`):
// this month's spend against the cap, with a status pill (none/ok/warned/paused). Crossing 80% or 100% sends the
// owner's Telegram warning (checkAgentCapAlerts, inside `controlRoomView` itself) — real and live, not a preview.
//
// S15 · PR 310 (A5.2, A5.6) — a new "Which data may reach which model" card states the Locked policy itself
// (personal and business data: paid connections only; public/draft work: a free-capable connection is allowed),
// and each agent card's model row now also names its own data class and, only when the policy actually moved the
// owner's pick (`routingDowngraded`), an honest note naming what runs instead and why — never a second number this
// page has not measured, same spirit as PR 307's model note.
// Guide: docs/admin-guide/pages/ai/control.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AgentSwitch } from '@/components/admin/ai/AgentSwitch';
import { KeepOnSwitch } from '@/components/admin/ai/KeepOnSwitch';
import { MasterSwitch } from '@/components/admin/ai/MasterSwitch';
import { ModelPickSelect, type ModelPickOption } from '@/components/admin/ai/ModelPickSelect';
import { ScheduleEditor, type ScheduleDraft } from '@/components/admin/ai/ScheduleEditor';
import { CapInput } from '@/components/admin/ai/CapInput';
import type { CountFormat } from '@/lib/admin-lumen/model';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { controlRoomView } from '@/lib/admin-ai/control-room';
import { DATA_CLASSES } from '@/lib/admin-ai/data-classes';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../messages/admin-ai.bn.json';
import en from '../../../../messages/admin-ai.en.json';
import './ai.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiControl';
const HERE = '/admin/ai';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiControl: (view.lang === 'bn' ? bn : en).aiControl as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiControl.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiControlRoomPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="ai-control" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiControl.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;

  const { view: o, agents } = await controlRoomView({ db: access.deps.db, resolver: access.deps.resolver, vault: access.deps.vault }, MOTHER_STORE_ID);
  const money = moneyOf(o.currency, view.locale);
  const amount = (minor: number) => formatMoney(minor, money);
  const fmt: CountFormat = { kind: 'money', locale: view.locale, currency: o.currency, digits: money.digits };
  const numFmt: CountFormat = { kind: 'number', locale: view.locale };

  const tiles: SummaryTile[] = [
    { key: 'running', label: c('tiles.running'), value: o.runningNow, shown: formatNumber(o.runningNow, view.locale), format: numFmt, vs: c('tiles.runningOf', { n: formatNumber(o.agentCount, view.locale) }), icon: 'spark' },
    { key: 'today', label: c('tiles.today'), value: o.todayMinor, shown: amount(o.todayMinor), format: fmt, icon: 'wallet' },
    { key: 'month', label: c('tiles.month'), value: o.monthMinor, shown: amount(o.monthMinor), format: fmt, icon: 'trend' },
    { key: 'cap', label: c('tiles.cap'), value: o.monthlyCapMinor ?? 0, shown: o.monthlyCapMinor === null ? c('tiles.capNone') : amount(o.monthlyCapMinor), format: fmt, word: o.monthlyCapMinor === null, icon: 'shield' },
  ];

  const statusOf = (a: (typeof agents)[number]) => {
    if (a.workingNow) return { tone: 'ok', text: !o.masterOn && a.keepOnWhenMasterOff ? c('agents.statusWorkingKeptOn') : c('agents.statusWorking') };
    return a.enabled ? { tone: 'line', text: c('agents.statusPaused') } : { tone: 'line', text: c('agents.statusOff') };
  };

  // S15 · PR 307 — one shared option list (the practice writer plus the four PR 306 connections) for every agent's
  // picker; an un-Tested connection stays listed, disabled, labelled as not ready.
  const providerLabel = (p: string | null) => (p === null ? c('agents.model.practice') : c(`agents.model.providers.${p}`));
  const modelOptions: ModelPickOption[] = o.modelOptions.map((opt) => ({
    value: opt.provider,
    ready: opt.ready,
    label: opt.ready ? providerLabel(opt.provider) : c('agents.model.notReady', { provider: providerLabel(opt.provider) }),
  }));
  const modelNoteOf = (a: (typeof agents)[number], name: string) => {
    if (a.selectedProvider !== null && !a.selectedReady) return c('agents.model.noteFallback', { provider: providerLabel(a.selectedProvider), name });
    if (a.routingDowngraded) return c('agents.model.noteRouted', { name, effective: providerLabel(a.effectiveProvider) });
    return a.selectedProvider === o.recommendedProvider ? c('agents.model.noteSame') : c('agents.model.noteChanged');
  };
  // S15 · PR 310 — each data class's own name and, in the policy card, whether a free-capable connection may ever
  // serve it (Blueprint A5.2, Locked — never the owner's choice, so this reads the fixed catalogue, not a setting).
  const dataClassLabel = (key: string) => c(`routing.classes.${key}.name`);

  // S15 · PR 308 — the schedule's own plain-text line (always / daily / weekly) and, separately, the next-run
  // preview; both honest, never claiming a job runner that does not exist yet.
  const dayLabels = [0, 1, 2, 3, 4, 5, 6].map((i) => c(`agents.schedule.days.${i}`));
  const modeLabels = { always: c('agents.schedule.mode.always'), daily: c('agents.schedule.mode.daily'), weekly: c('agents.schedule.mode.weekly') };
  const scheduleTextOf = (s: (typeof agents)[number]['schedule']) => {
    if (s.mode === 'always') return c('agents.schedule.always');
    if (s.mode === 'daily') return c('agents.schedule.daily', { time: s.time ?? '' });
    const days = (s.days ?? []).map((d) => dayLabels[d]).join(', ');
    return c('agents.schedule.weekly', { days, time: s.time ?? '' });
  };
  const scheduleDraftOf = (s: (typeof agents)[number]['schedule']): ScheduleDraft => ({ mode: s.mode, time: s.time, days: s.days });

  // S15 · PR 309 — the cap's own status pill: a tone per state, text from the dict, never invented here.
  const capToneOf = (state: (typeof agents)[number]['capState']) => (state === 'paused' ? 'bad' : state === 'warned' ? 'warn' : state === 'ok' ? 'ok' : 'line');

  return (
    <div className="a2-z ai-page" data-testid="ai-control" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-card tight ai-master" data-testid="ai-master" data-on={o.masterOn ? 'yes' : 'no'}>
        <div className="ai-mh">
          <div className="ai-mht">
            <span className="a2-xs a2-mute a2-b">{c('master.label')}</span>
            <h2 className="a2-h3 ai-mt">{o.masterOn ? c('master.onTitle') : c('master.offTitle')}</h2>
            <p className="a2-sm a2-mute">{o.masterOn ? c('master.onBody', { n: formatNumber(o.runningNow, view.locale) }) : c('master.offBody')}</p>
          </div>
          {canControl ? (
            <MasterSwitch on={o.masterOn} label={c('master.switchLabel')} onText={c('master.toastOn')} offText={c('master.toastOff')} failedText={c('master.toastFailed')} />
          ) : (
            <span className="a2-pill line">{c('master.ownerOnly')}</span>
          )}
        </div>
        {o.monthlyCapMinor === null ? (
          <div className="a2-note warn" data-testid="ai-master-nocap">
            <ShellIcon name="alert" size={15} />
            <span>{c('master.capWarn')}</span>
          </div>
        ) : null}
      </section>

      <div className="a2-mt12 ai-tiles">
        <SummaryTiles tiles={tiles} label={c('tiles.label')} testId="ai-tiles" />
      </div>

      <section className="ai-agents" aria-labelledby="ai-agents-h" data-testid="ai-agents">
        <h2 className="a2-h3" id="ai-agents-h">
          {c('agents.title')}
        </h2>
        <p className="a2-cs">{c('agents.sub')}</p>
        {!canControl ? <p className="a2-xs a2-mute">{c('agents.readOnly')}</p> : null}
        <div className="ai-grid">
          {agents.map((a) => {
            const st = statusOf(a);
            const name = view.lang === 'bn' ? a.nameBn : a.nameEn;
            return (
              <article key={a.key} className="a2-card tight ai-ac" data-testid={`ai-agent-${a.key}`} data-working={a.workingNow ? 'yes' : 'no'}>
                <div className="ai-ach">
                  <span className="ai-av" aria-hidden="true">
                    {a.emoji}
                  </span>
                  <div className="ai-acn">
                    <b>{view.lang === 'bn' ? a.nameBn : a.nameEn}</b>
                    <span className="a2-xs a2-mute">{a.role}</span>
                  </div>
                  {canControl ? (
                    <AgentSwitch agentKey={a.key} on={a.enabled} label={c('agents.switchLabel', { name: view.lang === 'bn' ? a.nameBn : a.nameEn })} pausedText={c('toast.paused', { name: view.lang === 'bn' ? a.nameBn : a.nameEn })} resumedText={c('toast.resumed', { name: view.lang === 'bn' ? a.nameBn : a.nameEn })} failedText={c('toast.failed', { name: view.lang === 'bn' ? a.nameBn : a.nameEn })} />
                  ) : null}
                </div>
                <div className="ai-acs">
                  <span className={`a2-pill ${st.tone}`}>{st.text}</span>
                  <span className="a2-xs a2-mute">{a.lastActivity ? `${a.lastActivity.summaryBn} · ${dateTime(a.lastActivity.at, view.locale, view.timeZone)}` : c('agents.lastNone')}</span>
                </div>
                <div className="a2-xs a2-mute ai-acf">
                  <span>
                    {c('agents.today')}: {amount(a.todayMinor)}
                  </span>
                  <span>
                    {c('agents.month')}: {amount(a.monthMinor)}
                  </span>
                </div>
                <div className="ai-keep">
                  {canControl ? (
                    <>
                      <KeepOnSwitch agentKey={a.key} on={a.keepOnWhenMasterOff} label={c('agents.keepOn.switchLabel', { name: view.lang === 'bn' ? a.nameBn : a.nameEn })} onText={c('agents.keepOn.toastOn', { name: view.lang === 'bn' ? a.nameBn : a.nameEn })} offText={c('agents.keepOn.toastOff', { name: view.lang === 'bn' ? a.nameBn : a.nameEn })} failedText={c('agents.keepOn.toastFailed', { name: view.lang === 'bn' ? a.nameBn : a.nameEn })} />
                      <span className="a2-xs a2-mute">{c('agents.keepOn.label')}</span>
                    </>
                  ) : a.keepOnWhenMasterOff ? (
                    <span className="a2-pill line">{c('agents.keepOn.pillOn')}</span>
                  ) : null}
                </div>
                <div className="ai-model" data-testid={`ai-agent-model-row-${a.key}`}>
                  <span className="a2-xs a2-mute">{c('agents.model.label')}</span>
                  <span className="a2-pill line" data-testid={`ai-agent-dataclass-${a.key}`}>
                    {dataClassLabel(a.dataClass)}
                  </span>
                  {canControl ? (
                    <ModelPickSelect
                      agentKey={a.key}
                      selected={a.selectedProvider}
                      options={modelOptions}
                      label={c('agents.model.selectLabel', { name })}
                      changedText={c('agents.model.toastChanged', { name })}
                      failedText={c('agents.model.toastFailed', { name })}
                      notReadyText={c('agents.model.toastNotReady')}
                    />
                  ) : (
                    <span className="a2-xs">{providerLabel(a.selectedProvider)}</span>
                  )}
                  {a.selectedProvider === o.recommendedProvider ? <span className="a2-pill line">{c('agents.model.recommendedBadge')}</span> : null}
                  <span className="a2-xs a2-mute ai-model-note">{modelNoteOf(a, name)}</span>
                </div>
                <div className="ai-sched-wrap" data-testid={`ai-agent-schedule-row-${a.key}`}>
                  <span className="a2-xs a2-mute">{c('agents.schedule.label')}</span>
                  {canControl ? (
                    <ScheduleEditor
                      agentKey={a.key}
                      value={scheduleDraftOf(a.schedule)}
                      dayLabels={dayLabels}
                      modeLabels={modeLabels}
                      selectLabel={c('agents.schedule.selectLabel', { name })}
                      timeLabel={c('agents.schedule.timeLabel', { name })}
                      daysLabel={c('agents.schedule.daysLabel', { name })}
                      saveLabel={c('agents.schedule.saveLabel')}
                      savedText={c('agents.schedule.toastChanged', { name })}
                      failedText={c('agents.schedule.toastFailed', { name })}
                      invalidText={c('agents.schedule.toastInvalid')}
                    />
                  ) : (
                    <span className="a2-xs">{scheduleTextOf(a.schedule)}</span>
                  )}
                  <span className="a2-xs a2-mute">{a.nextRunAt ? c('agents.schedule.nextRun', { when: dateTime(a.nextRunAt, view.locale, view.timeZone) }) : c('agents.schedule.nextRunNone')}</span>
                </div>
                <div className="ai-cap-wrap" data-testid={`ai-agent-cap-row-${a.key}`}>
                  <span className="a2-xs a2-mute">{c('agents.cap.label')}</span>
                  {canControl ? (
                    <CapInput agentKey={a.key} capMinor={a.monthlyCapMinor} money={money} label={c('agents.cap.inputLabel', { name })} saveLabel={c('agents.cap.saveLabel')} savedText={c('agents.cap.toastChanged', { name })} failedText={c('agents.cap.toastFailed', { name })} invalidText={c('agents.cap.toastInvalid')} />
                  ) : (
                    <span className="a2-xs">{a.monthlyCapMinor === null ? c('agents.cap.none') : amount(a.monthlyCapMinor)}</span>
                  )}
                  <span className={`a2-pill ${capToneOf(a.capState)}`}>{c(`agents.cap.${a.capState}`)}</span>
                  {a.capState !== 'none' ? <span className="a2-xs a2-mute">{c('agents.cap.spentOfCap', { spent: amount(a.monthMinor), cap: amount(a.monthlyCapMinor ?? 0) })}</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="a2-card tight ai-routing" aria-labelledby="ai-routing-h" data-testid="ai-routing">
        <h2 className="a2-h3" id="ai-routing-h">
          {c('routing.title')}
        </h2>
        <p className="a2-cs">{c('routing.sub')}</p>
        <ul className="ai-routing-list">
          {DATA_CLASSES.map((dc) => (
            <li key={dc.key} className="ai-routing-row" data-testid={`ai-routing-${dc.key}`}>
              <span className="a2-pill line">{c(`routing.classes.${dc.key}.name`)}</span>
              <span className="a2-xs">{c(`routing.classes.${dc.key}.rule`)}</span>
            </li>
          ))}
        </ul>
        <p className="a2-xs a2-mute">{c('routing.note')}</p>
      </section>
    </div>
  );
}
