// S15 · PR 317 (Blueprint C3.2 "the single approval queue") — AI › Approvals at `/admin/ai/approvals`: everything an
// AI 360 agent wants to do but may not do alone, in one place, oldest first, so the owner clears it "in one pass".
// Reads across every kind (`approvalsView`, `lib/admin-ai/approvals.ts`) — including the two kinds S21 · PR 420's
// "Fixes to approve" screen already owns (`health.fix`, `ai.skill`) — but decides each row through the one owner
// that row actually has: a fix/skill row posts to `fixes.decideProposal` (needs `health.fixes.approve`) and every
// other kind posts to this file's own `decideApproval` (needs `ai.control`), both through the same
// `POST /api/admin/ai/approvals` (`approvals-api.ts` routes by kind). A decision here is permanent — no Undo,
// same as CLAUDE.md's "never without the owner's written OK" for money, refunds, COD, prices, discounts, blocking
// and deletion; this tap *is* that written OK. Seeing the queue needs only `ai.read`.
// Guide: docs/admin-guide/pages/ai/approvals.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ApprovalDecideButtons } from '@/components/admin/ai/ApprovalDecideButtons';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { aiAgentDef, isAiAgentKey } from '@/lib/admin-ai/agents';
import { approvalsView, kindLabelOf, type ApprovalRow } from '@/lib/admin-ai/approvals';
import { GATE_KINDS } from '@/lib/admin-health/fixes';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-ai.bn.json';
import en from '../../../../../messages/admin-ai.en.json';
import stripBn from '../../../../../messages/admin-ai-strip.bn.json';
import stripEn from '../../../../../messages/admin-ai-strip.en.json';
import { AiStrip } from '@/components/admin/ai/AiStrip';
import '@/components/admin/ai/ai-strip.css';
import '../ai.css';
import './approvals.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiApprovals';
const HERE = '/admin/ai/approvals';
const STATUS_TONE: Record<string, string> = { APPROVED: 'ok', REJECTED: 'bad', EXPIRED: 'line', CANCELLED: 'line' };

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? stripBn : stripEn) as unknown as Dict), aiApprovals: (view.lang === 'bn' ? bn : en).aiApprovals as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiApprovals.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiApprovalsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="approvals-page">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiApprovals.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;
  const canApproveFixes = access.guard.permissions?.has('health.fixes.approve') ?? false;

  const [o, aiOn] = await Promise.all([approvalsView({ db: access.deps.db, now: access.deps.now }, MOTHER_STORE_ID), access.deps.resolver.value('ai.enabled')]);
  // prototype v5 (m-ai.js renderApprovals): four numbers above the queue
  const MONEY_KINDS = ['money', 'refund', 'cod', 'price', 'discount', 'adBudget'];
  const moneyN = o.pending.filter((r) => MONEY_KINDS.includes(r.kind)).length;
  const oldest = o.pending.reduce<Date | null>((a, r) => (!a || r.createdAt < a ? r.createdAt : a), null);
  const dayAgo = (access.deps.now?.() ?? new Date()).getTime() - 864e5;
  const todayN = o.decided.filter((r) => r.decidedAt && r.decidedAt.getTime() >= dayAgo).length;
  const approvedN = o.decided.filter((r) => r.status === 'APPROVED').length;
  const rate = o.decided.length ? Math.round((approvedN / o.decided.length) * 100) : 0;
  const at = (iso: Date) => dateTime(iso.toISOString(), view.locale, view.timeZone);
  const isGate = (r: ApprovalRow) => (GATE_KINDS as readonly string[]).includes(r.kind);
  const canDecide = (r: ApprovalRow) => (isGate(r) ? canApproveFixes : canControl);
  const agentNameOf = (key: string | null) => {
    if (!key) return c('pending.noAgent');
    if (!isAiAgentKey(key)) return key;
    const a = aiAgentDef(key);
    return view.lang === 'bn' ? a.nameBn : a.nameEn;
  };

  return (
    <div className="a2-z ai-page ai-ap" data-testid="approvals-page">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <AiStrip dict={d} on={Boolean(aiOn)} canControl={canControl} />

      <div className="a2-kpis a2-mt12" data-testid="ai-ap-kpis">
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{t(d, 'aiKpi.waiting')}</div>
          <div className="a2-kv">{o.pending.length}</div>
          <div className="a2-kf">
            <span className="a2-kn">{oldest ? t(d, 'aiKpi.oldest', { when: at(oldest) }) : t(d, 'aiKpi.clear')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{t(d, 'aiKpi.money')}</div>
          <div className="a2-kv">{moneyN}</div>
          <div className="a2-kf">
            <span className="a2-kn">{t(d, 'aiKpi.moneySub')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{t(d, 'aiKpi.today')}</div>
          <div className="a2-kv">{todayN}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{t(d, 'aiKpi.rate')}</div>
          <div className="a2-kv">{rate}%</div>
          <div className="a2-kf">
            <span className="a2-kn">{t(d, 'aiKpi.rateSub')}</span>
          </div>
        </div>
      </div>

      <section className="ai-ap-sec a2-mt12" aria-labelledby="ai-ap-pending-h" data-testid="ai-ap-pending">
        <h2 className="a2-h3" id="ai-ap-pending-h">
          {c('pending.label')} ({o.pending.length})
        </h2>
        {o.pending.length ? (
          <ul className="ai-ap-list">
            {o.pending.map((r) => (
              <li key={r.id} className="a2-card ai-ap-card" data-testid="ai-ap-row" data-kind={r.kind}>
                <div className="ai-ap-pills">
                  <span className="a2-pill info">{kindLabelOf(r.kind, view.lang)}</span>
                  <span className="a2-xs a2-mute">{c('pending.agent')}: {agentNameOf(r.agentKey)}</span>
                </div>
                <div className="ai-ap-title">{r.title}</div>
                {r.summary ? <div className="a2-sm a2-mute">{r.summary}</div> : null}
                <div className="a2-xs a2-mute">
                  {c('pending.requested', { when: at(r.createdAt) })}
                  {r.expiresAt ? ` · ${c('pending.expires', { when: at(r.expiresAt) })}` : ''}
                </div>
                {canDecide(r) ? (
                  <ApprovalDecideButtons
                    id={r.id}
                    noteLabel={c('pending.noteLabel')}
                    notePlaceholder={c('pending.notePlaceholder')}
                    approveLabel={c('pending.approve')}
                    rejectLabel={c('pending.reject')}
                    approvedText={c('pending.toastApproved')}
                    rejectedText={c('pending.toastRejected')}
                    failedText={c('pending.toastFailed')}
                  />
                ) : (
                  <div className="a2-xs a2-mute">{c('pending.needPermission')}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="a2-note a2-mt12" role="note" data-testid="ai-ap-pending-none">
            <span>{c('pending.empty')}</span>
          </div>
        )}
      </section>

      <section className="ai-ap-sec a2-mt12" aria-labelledby="ai-ap-decided-h" data-testid="ai-ap-decided">
        <h2 className="a2-h3" id="ai-ap-decided-h">
          {c('decided.label')}
        </h2>
        <p className="a2-xs a2-mute">{c('decided.sub', { n: o.decided.length })}</p>
        {o.decided.length ? (
          <ul className="ai-ap-list">
            {o.decided.map((r) => (
              <li key={r.id} className="a2-card ai-ap-card" data-testid="ai-ap-decided-row" data-status={r.status}>
                <div className="ai-ap-pills">
                  <span className="a2-pill info">{kindLabelOf(r.kind, view.lang)}</span>
                  <span className={`a2-pill ${STATUS_TONE[r.status] ?? 'line'}`}>{c(`decided.status.${r.status}`)}</span>
                </div>
                <div className="ai-ap-title">{r.title}</div>
                <div className="a2-xs a2-mute">
                  {r.decidedAt ? c('decided.decidedBy', { name: r.decidedByName ?? agentNameOf(null), when: at(r.decidedAt) }) : r.expiresAt ? c('decided.expiredAt', { when: at(r.expiresAt) }) : ''}
                </div>
                {r.decisionNote ? <div className="a2-xs a2-mute">{c('decided.note', { note: r.decisionNote })}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="a2-note a2-mt12" role="note" data-testid="ai-ap-decided-none">
            <span>{c('decided.empty')}</span>
          </div>
        )}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="ai-never-h" data-testid="ai-never">
        <h2 className="a2-h3" id="ai-never-h">
          {t(d, 'aiNever.h')}
        </h2>
        <ul className="ai-never">
          {['money', 'budget', 'message', 'block', 'delete'].map((k) => (
            <li key={k}>
              <span>{t(d, `aiNever.items.${k}`)}</span>
              <span className="a2-pill line">{t(d, 'aiNever.waits')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
