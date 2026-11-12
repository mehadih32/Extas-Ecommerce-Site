// S15 · PR 578 (C10.4; demo 89b-admin-agents.js) — AI › Agent reports at /admin/ai/reports: daily/weekly/monthly/
// yearly reports per agent, generated on demand from its own work log (`AiWorkLog`) and cost (`AiUsageLedger`) —
// what it did, bugs it found itself versus the owner's, rewards, cost, and the first-time-right rate; the honest
// "no report yet" state otherwise. Seeing the page needs `ai.read`; "Generate now" needs `ai.control`. Scheduled
// Telegram/e-mail sends and the full yearly appraisal (curriculum levels, the owner's own competency ratings) stay
// a later report on this same table — see `appraisal.ts`'s own header.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { GenerateAppraisalButton } from '@/components/admin/ai/GenerateAppraisalButton';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { appraisalAgentOptions, appraisalHistory, APPRAISAL_PERIODS, type AppraisalPeriod, type AppraisalRow } from '@/lib/admin-ai/appraisal';
import { isAiAgentKey, type AiAgentKey } from '@/lib/admin-ai/agents';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-ai-reports.bn.json';
import en from '../../../../../messages/admin-ai-reports.en.json';
import '../ai.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/ai/reports';
const KEY = 'aiReports';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiReports.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const agentOf = (v: string | undefined): AiAgentKey => (v && isAiAgentKey(v) ? v : appraisalAgentOptions()[0]!.key);
const periodOf = (v: string | undefined): AppraisalPeriod => ((APPRAISAL_PERIODS as readonly string[]).includes(v ?? '') ? (v as AppraisalPeriod) : 'daily');

export default async function AgentReportsPage({ searchParams }: { searchParams: Promise<{ key?: string; period?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="ai-reports">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const s = (k: string, v?: Record<string, string | number>) => t(d, `aiReports.${k}`, v);
  const agents = appraisalAgentOptions();
  const key = agentOf(sp.key);
  const period = periodOf(sp.period);
  const rows: AppraisalRow[] = await appraisalHistory({ db: access.deps.db }, key, period);
  const latest = rows[0] ?? null;
  const currency = await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID });
  const money = moneyOf(currency, view.locale);
  const n = (x: number) => formatNumber(x, view.locale);
  const canGenerate = access.guard.permissions?.has('ai.control') ?? false;
  const dateText = (iso: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(new Date(iso));

  return (
    <div className="a2-z lm-rp" data-lm-ready="" data-testid="ai-reports" data-agent={key} data-period={period}>
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="a2-views a2-mt12" aria-label={s('agent')} data-testid="ai-reports-agents">
        {agents.map((a) => (
          <Link key={a.key} className={`a2-view cr-tap${a.key === key ? ' on' : ''}`} href={`${HERE}?key=${a.key}&period=${period}`} aria-current={a.key === key ? 'page' : undefined}>
            {a.emoji} {view.lang === 'bn' ? a.nameBn : a.nameEn}
          </Link>
        ))}
      </nav>
      <nav className="a2-views a2-mt6" aria-label={s('period.label')} data-testid="ai-reports-periods">
        {APPRAISAL_PERIODS.map((p) => (
          <Link key={p} className={`a2-view cr-tap${p === period ? ' on' : ''}`} href={`${HERE}?key=${key}&period=${p}`} aria-current={p === period ? 'page' : undefined}>
            {s(`period.${p}`)}
          </Link>
        ))}
      </nav>

      <section className="a2-card a2-mt12" data-testid="ai-report-current">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3">{s('report.title')}</h2>
            {latest ? <div className="a2-cs">{s('report.generatedAt', { at: dateText(latest.updatedAt) })}</div> : null}
          </div>
          {canGenerate ? <GenerateAppraisalButton agentKey={key} period={period} texts={{ generate: s('generate'), generating: s('generating'), generated: s('generated'), err: (d.aiReports as { err: Record<string, string> }).err }} /> : null}
        </div>
        {latest ? (
          <>
            <div className="a2-k4 a2-mt12" data-testid="ai-report-kpis">
              <div className="a2-ki">
                <div className="a2-kv">{n(latest.kpis.tasksDone)}</div>
                <div className="a2-kl">{s('kpi.tasksDone')}</div>
              </div>
              <div className="a2-ki">
                <div className="a2-kv">{n(latest.kpis.bugsSelfFound)}</div>
                <div className="a2-kl">{s('kpi.bugsSelfFound')}</div>
              </div>
              <div className="a2-ki">
                <div className="a2-kv">{n(latest.kpis.bugsOwnerFound)}</div>
                <div className="a2-kl">{s('kpi.bugsOwnerFound')}</div>
              </div>
              <div className="a2-ki">
                <div className="a2-kv">{n(latest.kpis.rewards)}</div>
                <div className="a2-kl">{s('kpi.rewards')}</div>
              </div>
              <div className="a2-ki">
                <div className="a2-kv">{formatMoney(latest.kpis.costMinor, money)}</div>
                <div className="a2-kl">{s('kpi.costMinor')}</div>
              </div>
              <div className="a2-ki">
                <div className="a2-kv">{latest.kpis.firstTimeRightRate === null ? s('kpi.none') : `${n(latest.kpis.firstTimeRightRate)}%`}</div>
                <div className="a2-kl">{s('kpi.firstTimeRightRate')}</div>
              </div>
            </div>
            <pre className="a2-sm a2-mt12" data-testid="ai-report-text" style={{ whiteSpace: 'pre-wrap' }}>
              {latest.report}
            </pre>
          </>
        ) : (
          <p className="a2-sm a2-mute a2-mt6" data-testid="ai-report-none">
            {s('noneYet')}
          </p>
        )}
      </section>

      <section className="a2-card a2-mt12" data-testid="ai-report-history">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3">{s('history.title')}</h2>
            <div className="a2-cs">{s('history.sub')}</div>
          </div>
        </div>
        {rows.length > 1 ? (
          <div className="a2-tblw">
            <table className="a2-tbl" data-testid="ai-report-history-tbl">
              <thead>
                <tr>
                  <th>{s('history.col.period')}</th>
                  <th className="r">{s('history.col.tasks')}</th>
                  <th className="r">{s('history.col.rate')}</th>
                  <th>{s('history.col.generated')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((r) => (
                  <tr key={r.id} data-testid="ai-report-history-row">
                    <td className="a2-tdh">
                      <b>
                        {r.periodStart} – {r.periodEnd}
                      </b>
                    </td>
                    <td className="r" data-l={s('history.col.tasks')}>
                      {n(r.kpis.tasksDone)}
                    </td>
                    <td className="r" data-l={s('history.col.rate')}>
                      {r.kpis.firstTimeRightRate === null ? s('kpi.none') : `${n(r.kpis.firstTimeRightRate)}%`}
                    </td>
                    <td data-l={s('history.col.generated')}>{dateText(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{s('history.empty')}</p>
        )}
      </section>

      <p className="a2-xs a2-mute a2-mt12">{s('note')}</p>
    </div>
  );
}
