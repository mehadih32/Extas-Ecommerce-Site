// S15 · PR 577 (C10.4; demo 89b-admin-agents.js) — the team page at `/admin/agents` (Lumen, `data-lm-ready`): every
// fixed agent as a card (photo or initial, name, role, open/done assignment counts, the verified star), each
// linking to its own 360° profile. Seeing the page needs `ai.read`, the same permission as the Control room this
// page sits beside.
// PR 584 adds the "Telegram commands" card above the grid (off by default; `ai.control` to flip it) — the one
// switch for C10.3's inbound routing; see `lib/admin-ai/telegram-routing.ts`.
// Guide: docs/admin-guide/pages/ai/agents.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { TelegramCommandsSwitch } from '@/components/admin/agents/TelegramCommandsSwitch';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { agentProfileList } from '@/lib/admin-ai/agent-profile';
import { approvalsView } from '@/lib/admin-ai/approvals';
import { controlRoomView } from '@/lib/admin-ai/control-room';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { isTelegramCommandsEnabled, telegramWebhookSecret } from '@/lib/admin-ai/telegram-routing';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../messages/admin-agents.bn.json';
import en from '../../../../messages/admin-agents.en.json';
import stripBn from '../../../../messages/admin-ai-strip.bn.json';
import stripEn from '../../../../messages/admin-ai-strip.en.json';
import { AiStrip } from '@/components/admin/ai/AiStrip';
import { AgentSwitch } from '@/components/admin/ai/AgentSwitch';
import { KeepOnFeatures } from '@/components/admin/ai/KeepOnFeatures';
import { KeepOnSwitch } from '@/components/admin/ai/KeepOnSwitch';
import { ModelPickSelect, type ModelPickOption } from '@/components/admin/ai/ModelPickSelect';
import { ScheduleEditor } from '@/components/admin/ai/ScheduleEditor';
import { AI_KEEP_ON_FEATURES } from '@extas/settings';
import aiBn from '../../../../messages/admin-ai.bn.json';
import aiEn from '../../../../messages/admin-ai.en.json';
import '@/components/admin/ai/ai-strip.css';
import './agents.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiAgents';
const HERE = '/admin/agents';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? stripBn : stripEn) as unknown as Dict), aiAgents: (view.lang === 'bn' ? bn : en).aiAgents as unknown as Dict, aiControl: (view.lang === 'bn' ? aiBn : aiEn).aiControl as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiAgents.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AgentsTeamPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="agents-team" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiAgents.${k}`, vars);
  const cc = (k: string, vars?: Record<string, string | number>) => t(d, `aiControl.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;

  const [aiOn, offText, keepOn] = await Promise.all([
    access.deps.resolver.value('ai.enabled'),
    access.deps.resolver.value('ai.offText', { storeId: MOTHER_STORE_ID }),
    access.deps.resolver.value('ai.keepOnFeatures', { storeId: MOTHER_STORE_ID }),
  ]);
  const [agents, tgEnabled, tgSecret] = await Promise.all([
    agentProfileList({ db: access.deps.db }),
    isTelegramCommandsEnabled(access.deps),
    telegramWebhookSecret(access.deps),
  ]);
  const secretSet = tgSecret !== null;
  // prototype v5 (m-ai.js renderAgents): four numbers above the cards and, on each card, running or paused with today's and this month's spend
  const [room, queue] = await Promise.all([
    controlRoomView({ db: access.deps.db, resolver: access.deps.resolver, vault: access.deps.vault }, MOTHER_STORE_ID),
    approvalsView({ db: access.deps.db, now: access.deps.now }, MOTHER_STORE_ID),
  ]);
  const money = moneyOf(room.view.currency, view.locale);
  const amount = (minor: number) => formatMoney(minor, money);
  // the same controls the Control room draws, one set inside each card (prototype v5 m-ai.js renderAgents): pause, company, when it runs, keep on
  const providerLabel = (p: string | null) => (p === null ? cc('agents.model.practice') : cc(`agents.model.providers.${p}`));
  const modelOptions: ModelPickOption[] = room.view.modelOptions.map((opt) => ({
    value: opt.provider,
    ready: opt.ready,
    label: opt.ready ? providerLabel(opt.provider) : cc('agents.model.notReady', { provider: providerLabel(opt.provider) }),
  }));
  const dayLabels = [0, 1, 2, 3, 4, 5, 6].map((i) => cc(`agents.schedule.days.${i}`));
  const modeLabels = { always: cc('agents.schedule.mode.always'), daily: cc('agents.schedule.mode.daily'), weekly: cc('agents.schedule.mode.weekly') };
  const scheduleText = (sc: { mode: string; time?: string | null; days?: number[] | null }) =>
    sc.mode === 'always' ? cc('agents.schedule.always') : sc.mode === 'daily' ? cc('agents.schedule.daily', { time: sc.time ?? '' }) : cc('agents.schedule.weekly', { days: (sc.days ?? []).map((x) => dayLabels[x]).join(', '), time: sc.time ?? '' });
  const features = AI_KEEP_ON_FEATURES.map((k) => ({ key: k, label: c(`keepOn.features.${k}`) }));

  return (
    <div className="a2-z agents-page" data-testid="agents-team" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <AiStrip dict={d} on={Boolean(aiOn)} canControl={canControl} offText={offText} lang={view.lang} />

      {!tgEnabled ? (
        <section className="a2-card tight ag-tg-off" data-testid="agents-telegram-off">
          <div className="ag-tg-h">
            <div>
              <h2 className="a2-h3">{c('telegram.title')}</h2>
              <p className="a2-sm a2-mute">{c('telegram.offBody')}</p>
            </div>
            {canControl ? (
              <TelegramCommandsSwitch on={false} label={c('telegram.switchLabel')} onText={c('telegram.toastOn')} offText={c('telegram.toastOff')} failedText={c('telegram.toastFailed')} />
            ) : (
              <span className="a2-pill line">{c('telegram.ownerOnly')}</span>
            )}
          </div>
        </section>
      ) : (
        <section className="a2-card tight ag-tg-on a2-mt12" data-testid="agents-telegram-on">
          <div className="ag-tg-h">
            <div>
              <h2 className="a2-h3">{c('telegram.title')}</h2>
              <p className="a2-sm a2-mute">{c('telegram.onBody')}</p>
              <span className={`a2-pill ${secretSet ? 'ok' : 'bad'}`} data-testid="agents-telegram-secret">
                {secretSet ? c('telegram.secretSet') : c('telegram.secretMissing')}
              </span>
            </div>
            {canControl ? (
              <TelegramCommandsSwitch on={true} label={c('telegram.switchLabel')} onText={c('telegram.toastOn')} offText={c('telegram.toastOff')} failedText={c('telegram.toastFailed')} />
            ) : null}
          </div>
        </section>
      )}

      <div className="a2-kpis a2-mt12" data-testid="agents-kpis">
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('kpi.running')}</div>
          <div className="a2-kv">
            {formatNumber(room.view.runningNow, view.locale)} / {formatNumber(room.view.agentCount, view.locale)}
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('kpi.today')}</div>
          <div className="a2-kv">{amount(room.view.todayMinor)}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('kpi.month')}</div>
          <div className="a2-kv">{amount(room.view.monthMinor)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{room.view.monthlyCapMinor === null ? c('kpi.noCeiling') : c('kpi.ofCeiling', { cap: amount(room.view.monthlyCapMinor) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('kpi.waiting')}</div>
          <div className="a2-kv">{formatNumber(queue.pending.length, view.locale)}</div>
          <div className="a2-kf">
            <Link className="a2-kn" href="/admin/ai/approvals">
              {c('kpi.approvals')} →
            </Link>
          </div>
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt12" data-testid="agents-controls-note">
        {c('controlsNote')} <Link href="/admin/ai">{c('controlsLink')}</Link>
      </p>

      <div className="ag-grid a2-mt12" data-testid="agents-grid">
        {agents.map((a) => {
          const name = view.lang === 'bn' ? a.nameBn : a.nameEn;
          const live = room.agents.find((r) => r.key === a.key);
          return (
            <div key={a.key} className="a2-card tight ag-card" data-testid={`agents-card-${a.key}`}>
              <Link href={`/admin/agents/${a.key}`} className="ag-link" data-testid={`agents-link-${a.key}`}>
              <div className="ag-ch">
                <span className="ag-av" aria-hidden="true">
                  {a.photoUrl ? <img src={a.photoUrl} alt="" loading="lazy" /> : a.emoji}
                </span>
                <div className="ag-cn">
                  <b>
                    {name}
                    {a.verified ? <span title={c('verified')}> ✓</span> : null}{' '}
                    <span className={`a2-pill ${live?.workingNow ? 'ok' : 'line'}`} data-testid={`agents-state-${a.key}`}>
                      {live?.workingNow ? c('state.running') : c('state.paused')}
                    </span>
                  </b>
                  <span className="a2-xs a2-mute">{a.role}</span>
                </div>
              </div>
              <div className="ag-counts a2-xs a2-mute">
                <span>{c('team.open', { n: a.openCount })}</span>
                <span>{c('team.done', { n: a.doneCount })}</span>
              </div>
              </Link>
              <div className="ag-counts a2-xs a2-mute">
                <span>
                  {c('card.today')}: {amount(live?.todayMinor ?? 0)}
                </span>
                <span>
                  {c('card.month')}: {amount(live?.monthMinor ?? 0)}
                </span>
              </div>
              {live ? (
                <div className="ag-ctl" data-testid={`agents-controls-${a.key}`}>
                  <div className="ag-ctl-row">
                    <span className="a2-xs a2-mute">{cc('agents.switchLabel', { name })}</span>
                    {canControl ? (
                      <AgentSwitch agentKey={a.key} on={live.enabled} label={cc('agents.switchLabel', { name })} pausedText={cc('toast.paused', { name })} resumedText={cc('toast.resumed', { name })} failedText={cc('toast.failed', { name })} />
                    ) : null}
                  </div>
                  <div className="ag-ctl-row">
                    <span className="a2-xs a2-mute">{cc('agents.model.label')}</span>
                    {canControl ? (
                      <ModelPickSelect agentKey={a.key} selected={live.selectedProvider} options={modelOptions} label={cc('agents.model.selectLabel', { name })} changedText={cc('agents.model.toastChanged', { name })} failedText={cc('agents.model.toastFailed', { name })} notReadyText={cc('agents.model.toastNotReady')} />
                    ) : (
                      <span className="a2-xs">{providerLabel(live.selectedProvider)}</span>
                    )}
                  </div>
                  <div className="ag-ctl-row">
                    <span className="a2-xs a2-mute">{cc('agents.schedule.label')}</span>
                    {canControl ? (
                      <ScheduleEditor
                        agentKey={a.key}
                        value={{ mode: live.schedule.mode, time: live.schedule.time, days: live.schedule.days }}
                        dayLabels={dayLabels}
                        modeLabels={modeLabels}
                        selectLabel={cc('agents.schedule.selectLabel', { name })}
                        timeLabel={cc('agents.schedule.timeLabel', { name })}
                        daysLabel={cc('agents.schedule.daysLabel', { name })}
                        saveLabel={cc('agents.schedule.saveLabel')}
                        savedText={cc('agents.schedule.toastChanged', { name })}
                        failedText={cc('agents.schedule.toastFailed', { name })}
                        invalidText={cc('agents.schedule.toastInvalid')}
                      />
                    ) : (
                      <span className="a2-xs">{scheduleText(live.schedule)}</span>
                    )}
                  </div>
                  <div className="ag-ctl-row">
                    <span className="a2-xs a2-mute">{cc('agents.keepOn.label')}</span>
                    {canControl ? (
                      <KeepOnSwitch agentKey={a.key} on={live.keepOnWhenMasterOff} label={cc('agents.keepOn.switchLabel', { name })} onText={cc('agents.keepOn.toastOn', { name })} offText={cc('agents.keepOn.toastOff', { name })} failedText={cc('agents.keepOn.toastFailed', { name })} />
                    ) : live.keepOnWhenMasterOff ? (
                      <span className="a2-pill line">{cc('agents.keepOn.pillOn')}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="ag-kf-h" data-testid="agents-keepon-card">
        <h2 className="a2-h3" id="ag-kf-h">
          {c('keepOn.h')}
        </h2>
        <p className="a2-xs a2-mute">{c('keepOn.sub')}</p>
        <KeepOnFeatures value={keepOn as unknown as Record<string, boolean>} features={features} canControl={canControl} texts={{ saved: c('keepOn.saved'), failed: c('keepOn.failed') }} />
        <p className="a2-xs a2-mute a2-mt12">{c('keepOn.hint')}</p>
      </section>
    </div>
  );
}
