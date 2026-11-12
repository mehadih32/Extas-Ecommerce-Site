// S15 · PR 321 (Blueprint C1.7 "Skill library" + "Import a skill from outside"; the demo's own AIC-04 "Skills ›
// Library" screen) — AI › Skills at `/admin/ai/skills`: every `AiSkill` as a card — name, agent, version, status,
// and (once approved) an on/off switch — plus the owner's own "Import a skill" and a one-click "roll back" to the
// version before it. Deciding a skill's approval request stays `AI › Approvals`' own job
// (`health.fixes.approve`), never this page's — see `lib/admin-ai/skills.ts`'s own header comment for why.
// Guide: docs/admin-guide/pages/ai/skills.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SkillEnableSwitch } from '@/components/admin/ai/SkillEnableSwitch';
import { SkillImportDialog } from '@/components/admin/ai/SkillImportDialog';
import { SkillRollbackButton } from '@/components/admin/ai/SkillRollbackButton';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { aiAgentDef, isAiAgentKey } from '@/lib/admin-ai/agents';
import { SKILL_AGENT_OPTIONS, skillLibraryView, type SkillRow } from '@/lib/admin-ai/skills';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-ai.bn.json';
import en from '../../../../../messages/admin-ai.en.json';
import '../ai.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiSkills';
const HERE = '/admin/ai/skills';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiSkills: (view.lang === 'bn' ? bn : en).aiSkills as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiSkills.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiSkillsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="skills-page">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiSkills.${k}`, vars);
  const canWrite = access.guard.permissions?.has('ai.skills.write') ?? false;

  const rows = await skillLibraryView({ db: access.deps.db });
  const at = (x: Date) => dateTime(x.toISOString(), view.locale, view.timeZone);

  const agentNameOf = (key: string | null) => {
    if (!key || !isAiAgentKey(key)) return key ?? '—';
    const a = aiAgentDef(key);
    return view.lang === 'bn' ? a.nameBn : a.nameEn;
  };
  const agentEmojiOf = (key: string | null) => (key && isAiAgentKey(key) ? aiAgentDef(key).emoji : '🤖');

  const statusLabel = (r: SkillRow) => {
    if (r.status === 'proposed') return c('status.proposed');
    if (r.status === 'rejected') return c('status.rejected');
    if (r.status === 'expired') return c('status.expired');
    return r.enabled ? c('status.approvedOn') : c('status.approvedOff');
  };
  const statusTone = (r: SkillRow) => {
    if (r.status === 'proposed') return 'gold';
    if (r.status === 'rejected' || r.status === 'expired') return 'line';
    return r.enabled ? 'ok' : 'line';
  };

  const agentOptions = SKILL_AGENT_OPTIONS.map((a) => ({ key: a.key, label: `${a.emoji} ${view.lang === 'bn' ? a.nameBn : a.nameEn}` }));

  return (
    <div className="a2-z ai-page ai-sk" data-testid="skills-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={c('title')}
        sub={c('sub')}
        right={
          canWrite ? (
            <SkillImportDialog
              buttonLabel={c('import')}
              agents={agentOptions}
              texts={{
                title: c('dialog.title'),
                nameLabel: c('dialog.nameLabel'),
                namePlaceholder: c('dialog.namePlaceholder'),
                agentLabel: c('dialog.agentLabel'),
                cancel: c('dialog.cancel'),
                ok: c('dialog.ok'),
                working: c('dialog.working'),
                close: c('dialog.close'),
                effect1: c('dialog.effect1'),
                effect2: c('dialog.effect2'),
                toastOk: c('dialog.toastOk'),
                toastFailed: c('dialog.toastFailed'),
              }}
            />
          ) : undefined
        }
      />
      <SectionTabs view={view} current={KEY} />

      {!canWrite ? (
        <div className="a2-note a2-mt12" role="note" data-testid="ai-sk-readonly">
          <span>{c('needPermission')}</span>
        </div>
      ) : null}

      {rows.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl" data-testid="ai-sk-table">
            <thead>
              <tr>
                <th>{c('col.skill')}</th>
                <th>{c('col.version')}</th>
                <th>{c('col.status')}</th>
                <th>{c('col.updated')}</th>
                <th>{c('col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid={`ai-sk-row-${r.id}`} data-status={r.status}>
                  <td data-l={c('col.skill')}>
                    <span className="a2-cell">
                      <b>{r.name}</b>
                      <span>
                        {agentEmojiOf(r.agentKey)} {agentNameOf(r.agentKey)}
                      </span>
                    </span>
                  </td>
                  <td data-l={c('col.version')}>
                    {r.currentVersion > 0 ? `v${r.currentVersion}` : '—'}
                    {r.olderApprovedVersions ? <span className="a2-xs a2-mute"> · {c('older', { n: r.olderApprovedVersions })}</span> : null}
                  </td>
                  <td data-l={c('col.status')}>
                    <span className={`a2-pill ${statusTone(r)}`}>{statusLabel(r)}</span>
                  </td>
                  <td className="a2-xs" data-l={c('col.updated')}>
                    {at(r.updatedAt)}
                  </td>
                  <td data-l={c('col.action')}>
                    {canWrite && r.status === 'approved' ? (
                      <div className="ai-sk-actions">
                        <SkillEnableSwitch
                          id={r.id}
                          on={r.enabled}
                          label={c('col.status')}
                          onText={c('enable.toastOn')}
                          offText={c('enable.toastOff')}
                          failedText={c('enable.toastFailed')}
                        />
                        {canWrite && r.rollbackTo !== null ? (
                          <SkillRollbackButton
                            id={r.id}
                            buttonLabel={c('rollback.button', { version: r.rollbackTo })}
                            dialogTitle={c('rollback.dialogTitle')}
                            effect={c('rollback.effect', { from: r.currentVersion, to: r.rollbackTo })}
                            cancel={c('rollback.cancel')}
                            ok={c('rollback.ok')}
                            working={c('rollback.working')}
                            close={c('rollback.close')}
                            toastOk={c('rollback.toastOk')}
                            toastFailed={c('rollback.toastFailed')}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-note a2-mt12" role="note" data-testid="ai-sk-empty">
          <span>{c('empty')}</span>
        </div>
      )}
    </div>
  );
}
