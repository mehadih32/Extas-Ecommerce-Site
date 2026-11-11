// S15 · PR 318 (Blueprint C3.2 "Permission matrix") — AI › Permissions at `/admin/ai/permissions`: per agent, over
// the Blueprint's own seven resources (orders, stock, prices, courier, money, customer data, code), what that
// agent may decide alone, must only propose (lands in the single approval queue, PR 317), or may not touch at
// all. Every cell the owner has never set shows "Must ask first" (`permissions.ts`'s `DEFAULT_LEVEL`) — the safe
// starting point, never "decide alone" by default (CLAUDE.md rule 1). Nothing in the codebase executes a real
// agent action yet (same honesty as PR 304–317), so this matrix is the rule itself, ready for the first agent
// that reads it. Seeing the page needs `ai.read`; changing a cell needs `ai.control`.
// Guide: docs/admin-guide/pages/ai/permissions.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PermissionLevelSelect, type PermissionLevelOption } from '@/components/admin/ai/PermissionLevelSelect';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { LEVELS, permissionsView, resourceLabel } from '@/lib/admin-ai/permissions';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-ai.bn.json';
import en from '../../../../../messages/admin-ai.en.json';
import '../ai.css';
import './permissions.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiPermissions';
const HERE = '/admin/ai/permissions';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiPermissions: (view.lang === 'bn' ? bn : en).aiPermissions as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiPermissions.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiPermissionsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="permissions-page">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiPermissions.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;

  const o = await permissionsView({ db: access.deps.db });
  const options: PermissionLevelOption[] = LEVELS.map((lv) => ({ value: lv, label: c(`level.${lv}`) }));
  const levelTone: Record<string, string> = { alone: 'ok', propose: 'warn', none: 'bad' };

  return (
    <div className="a2-z ai-page ai-pm" data-testid="permissions-page">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-note a2-mt12" role="note" data-testid="ai-pm-intro">
        <span>{c('intro')}</span>
      </div>
      {!canControl ? <p className="a2-xs a2-mute a2-mt12">{c('readOnly')}</p> : null}

      <ul className="ai-pm-list a2-mt12" data-testid="ai-pm-agents">
        {o.agents.map((a) => {
          const name = view.lang === 'bn' ? a.nameBn : a.nameEn;
          return (
            <li key={a.key} className="a2-card ai-pm-card" data-testid={`ai-pm-agent-${a.key}`}>
              <div className="ai-pm-head">
                <span className="ai-pm-av" aria-hidden="true">
                  {a.emoji}
                </span>
                <div className="ai-pm-name">
                  <b>{name}</b>
                  <span className="a2-xs a2-mute">{a.role}</span>
                </div>
              </div>
              <div className="ai-pm-rows">
                {a.cells.map((cell) => {
                  const rLabel = resourceLabel(cell.resource, view.lang);
                  return (
                    <div key={cell.resource} className="ai-pm-row" data-testid={`ai-pm-row-${a.key}-${cell.resource}`} data-level={cell.level}>
                      <span className="ai-pm-rlabel">
                        {rLabel}
                        {cell.isDefault ? <span className="a2-pill line ai-pm-default">{c('defaultBadge')}</span> : null}
                      </span>
                      {canControl ? (
                        <PermissionLevelSelect
                          agentKey={a.key}
                          resource={cell.resource}
                          level={cell.level}
                          options={options}
                          label={c('selectLabel', { resource: rLabel, name })}
                          changedText={c('toastChanged')}
                          failedText={c('toastFailed')}
                        />
                      ) : (
                        <span className={`a2-pill ${levelTone[cell.level] ?? 'line'}`}>{c(`level.${cell.level}`)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
