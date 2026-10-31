// S21 · PR 420 (B7.3) — Reports › Site health › Fixes to approve at /admin/reports/health/fixes: the approval gate for
// agent auto-fixes and new skills. What waits for a decision (oldest first) or the last decisions; each fix with its
// finding (severity, page and screen, how to repeat it) and the run it came from, each skill with its first lines.
// Approve / Reject (`health.fixes.approve`) each have a confirm step; nobody decides their own proposal. The gate's
// switches (`health.fixGate`, `settings.write`): whether agents may propose at all (off as it ships) and when an
// undecided proposal expires. Seeing needs `health.read` (lib/admin-health/fixes.ts).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { ProposalDecide, type ProposalDecideTexts } from '@/components/admin/settings/ProposalDecide';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { fixesView, FIX_SHOWS, type ProposalRow } from '@/lib/admin-health/fixes';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import hbn from '../../../../../../messages/admin-health.bn.json';
import hen from '../../../../../../messages/admin-health.en.json';
import '../../../settings-cards.css';
import '../health.css';
import { SEV_TONE } from '../history/kinds';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/health/fixes';
const API = '/api/admin/health/fixes';
const HISTORY = '/admin/reports/health/history';
const KEY = 'healthFixes';
const STATUS_TONE: Record<string, string> = { APPROVED: 'ok', REJECTED: 'bad', EXPIRED: 'line', CANCELLED: 'line', PENDING: 'warn' };
const ERR_CODES = ['DECIDED', 'NOT_FOUND', 'OWN_PROPOSAL', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'];

function withScreen(view: AdminView): AdminView {
  const extra = (view.lang === 'bn' ? [hbn] : [hen]) as unknown as Dict[];
  return { ...view, dict: Object.assign({}, view.dict, ...extra) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'fxg.metaTitle'), robots: { index: false, follow: false } };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function FixesPage({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const deps = adminDeps();
  const q = await searchParams;
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
  const v = await fixesView({ db: access.deps.db, resolver: access.deps.resolver, now: access.deps.now }, { actor: access.guard.actor, ctx: access.guard.ctx }, { show: one(q.show) });
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `fxg.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const at = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const dialog = (k: 'approve' | 'reject', effects: string[]) => ({
    title: s(`${k}D.title`),
    effects: effects.map((e) => s(`${k}D.${e}`)),
    reason: s(`${k}D.reason`),
    cancel: s('dlg.cancel'),
    ok: s(`${k}D.ok`),
    working: s('dlg.working'),
    close: s('dlg.close'),
  });
  const err = Object.fromEntries(ERR_CODES.map((c) => [c, s(`err.${c}`)]));
  const fixTexts: ProposalDecideTexts = { approve: s('approve'), reject: s('reject'), approveDialog: dialog('approve', ['fix1', 'fix2', 'fix3']), rejectDialog: dialog('reject', ['fix1', 'fix2']), err };
  const skillTexts: ProposalDecideTexts = { approve: s('approve'), reject: s('reject'), approveDialog: dialog('approve', ['skill1', 'skill2']), rejectDialog: dialog('reject', ['skill1', 'skill2']), err };
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
    { kind: 'switch', path: 'proposals', label: s('card.proposals'), help: s('card.proposalsHelp') },
    { kind: 'number', path: 'expireDays', label: s('card.expireDays'), help: s('card.expireDaysHelp'), min: 0, max: 90 },
  ];
  const kindOf = (r: ProposalRow) => (r.kind === 'health.fix' ? 'fix' : r.skill?.isNew ? 'skillNew' : 'skillUpdate');
  const where = (r: ProposalRow) => (r.fix && (r.fix.page || r.fix.device) ? s('where', { page: r.fix.page ?? '—', screen: r.fix.device ? s(`screen.${r.fix.device}`) : '—' }) : null);

  return (
    <div className="a2-z" data-testid="fixes-page" data-proposals={String(v.gate.proposals)}>
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-note" role="note" data-testid="fixes-rule">
        <span>{s('rule')}</span>
      </div>
      {!v.gate.proposals ? (
        <div className="a2-note a2-mt12" role="note" data-testid="fixes-off">
          <span>{s('off')}</span>
        </div>
      ) : null}

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="fixes-kpi-fixes" data-n={v.waitingFixes}>
          <div className="a2-kl">{s('kpi.fixes')}</div>
          <div className="a2-kv">{num(v.waitingFixes)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.fixesFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="fixes-kpi-skills" data-n={v.waitingSkills}>
          <div className="a2-kl">{s('kpi.skills')}</div>
          <div className="a2-kv">{num(v.waitingSkills)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.skillsFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="fixes-kpi-approved">
          <div className="a2-kl">{s('kpi.approved', { days: num(v.recentDays) })}</div>
          <div className="a2-kv">{num(v.approvedRecent)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('kpi.approvedFoot')}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="fixes-kpi-gate" data-on={String(v.gate.proposals)}>
          <div className="a2-kl">{s('kpi.gate')}</div>
          <div className="a2-kv sp-kvt">{s(v.gate.proposals ? 'kpi.on' : 'kpi.off')}</div>
          <div className="a2-kf">
            <span className="a2-kn">{v.gate.expireDays ? s('kpi.expire', { days: num(v.gate.expireDays) }) : s('kpi.noExpire')}</span>
          </div>
        </div>
      </div>

      <nav className="a2-views sk-views a2-mt12" aria-label={s('views')}>
        {FIX_SHOWS.map((show) => (
          <Link key={show} className={`a2-view${v.show === show ? ' on' : ''}`} href={show === 'waiting' ? HERE : `${HERE}?show=${show}`} aria-current={v.show === show ? 'page' : undefined} data-testid={`fixes-show-${show}`}>
            {s(`show.${show}`)}
          </Link>
        ))}
      </nav>

      {v.rows.length ? (
        <ul className="hs-findings a2-mt12" data-testid="fixes-rows">
          {v.rows.map((r) => (
            <li key={r.id} className="a2-card hs-finding" data-testid="fix-row" data-kind={r.kind} data-status={r.status}>
              <div className="hs-pills">
                <span className="a2-pill info">{s(`kind.${kindOf(r)}`)}</span>
                {r.fix?.severity ? <span className={`a2-pill ${SEV_TONE[r.fix.severity] ?? 'line'}`}>{s(`sev.${r.fix.severity}`)}</span> : null}
                {r.status !== 'PENDING' ? <span className={`a2-pill ${STATUS_TONE[r.status] ?? 'line'}`}>{s(`status.${r.status}`)}</span> : null}
                {r.own ? <span className="a2-pill gold">{s('own')}</span> : null}
              </div>
              <div className="hs-title sk-wrap">{r.title}</div>
              {where(r) ? <div className="a2-sm a2-mute sk-wrap">{where(r)}</div> : null}
              {r.fix?.reproduce ? <div className="a2-sm sk-wrap">{s('repeat', { steps: r.fix.reproduce })}</div> : null}
              {r.fix ? (
                <div className="a2-sm hs-fix">
                  <b>{s('proposal')}</b> {r.summary}
                </div>
              ) : null}
              {r.skill ? (
                <>
                  <div className="a2-sm a2-mute sk-wrap">{s('skillKey', { key: r.skill.key, version: num(r.skill.version ?? 0) })}</div>
                  {r.summary ? <div className="a2-sm sk-wrap">{s('purpose', { purpose: r.summary })}</div> : null}
                  {r.skill.changeNote ? <div className="a2-sm sk-wrap">{s('change', { note: r.skill.changeNote })}</div> : null}
                  {r.skill.preview ? <pre className="hs-pre">{r.skill.preview}</pre> : null}
                </>
              ) : null}
              <div className="a2-sm a2-mute">
                {s('by', { agent: r.agentKey ?? s('noAgent'), when: at(r.createdAt) })}
                {r.status === 'PENDING' && r.expiresAt ? ` · ${s('expires', { when: at(r.expiresAt) })}` : ''}
              </div>
              {r.decidedAt ? (
                <div className="a2-sm sk-wrap">
                  {s('decided', { when: at(r.decidedAt) })}
                  {r.decisionNote ? ` · ${s('note', { note: r.decisionNote })}` : ''}
                </div>
              ) : null}
              {r.fix?.fixStatus && r.status !== 'PENDING' ? <div className="a2-sm">{s(`fixStatus.${r.fix.fixStatus}`)}</div> : null}
              {r.fix?.runId ? (
                <div className="a2-sm">
                  <Link className="sk-pic" href={`${HISTORY}/${r.fix.runId}`} data-testid="fix-run">
                    {s('openRun')}
                  </Link>
                </div>
              ) : null}
              {r.status === 'PENDING' ? (
                r.own ? (
                  <div className="a2-sm a2-mute">{s('ownNote')}</div>
                ) : v.canApprove ? (
                  <ProposalDecide url={API} id={r.id} texts={r.fix ? fixTexts : skillTexts} />
                ) : (
                  <div className="a2-sm a2-mute">{s('cannotDecide')}</div>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="a2-note a2-mt12" role="note" data-testid="fixes-none">
          <span>{s(`none.${v.show}`)}</span>
        </div>
      )}

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: v.cards.fixGate.key, value: v.cards.fixGate.value, version: v.cards.fixGate.version }} fields={fields} texts={cardTexts} canEdit={v.canEdit} testId="fixes-gate-card" />
      </div>
    </div>
  );
}
