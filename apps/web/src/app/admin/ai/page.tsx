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
// Guide: docs/admin-guide/pages/ai/control.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AgentSwitch } from '@/components/admin/ai/AgentSwitch';
import { KeepOnSwitch } from '@/components/admin/ai/KeepOnSwitch';
import { MasterSwitch } from '@/components/admin/ai/MasterSwitch';
import type { CountFormat } from '@/lib/admin-lumen/model';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { controlRoomView } from '@/lib/admin-ai/control-room';
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

  const { view: o, agents } = await controlRoomView({ db: access.deps.db, resolver: access.deps.resolver }, MOTHER_STORE_ID);
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
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
