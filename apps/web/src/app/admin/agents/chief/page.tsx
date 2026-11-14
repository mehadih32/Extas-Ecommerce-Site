// S15 · PR 583 (Blueprint C10.2; demo 89b-admin-agents.js "Ask the chief") — the chief's own page at
// `/admin/agents/chief` (Lumen, `data-lm-ready`): owner → জ্ঞানী Gyani → the other six (the chain of command itself,
// wired by `ensureAgentRows`), "Ask the chief" (routes a free-text question to the agent whose area it names, with
// real evidence and, when a real agent was found, a new assignment), the open investigations it has made, and the
// chief's own row of the PR 318 permission matrix (reused as-is — `PermissionLevelSelect` is the exact same
// component the full Permissions page uses). Seeing the page needs `ai.read`; asking, closing or warning needs
// `ai.control`.
// Guide: docs/admin-guide/pages/ai/agents-chief.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AskChiefForm } from '@/components/admin/ai/AskChiefForm';
import { InvestigationRowActions } from '@/components/admin/ai/InvestigationRowActions';
import { PermissionLevelSelect, type PermissionLevelOption } from '@/components/admin/ai/PermissionLevelSelect';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { agentProfileList } from '@/lib/admin-ai/agent-profile';
import { listInvestigations } from '@/lib/admin-ai/investigations';
import { LEVELS, permissionsView, resourceLabel } from '@/lib/admin-ai/permissions';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { dateTime } from '@/components/admin/stock/text';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-agents-chief.bn.json';
import en from '../../../../../messages/admin-agents-chief.en.json';
import '../agents.css';
import './chief.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiAgentsChief';
const HERE = '/admin/agents/chief';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiAgentsChief: (view.lang === 'bn' ? bn : en).aiAgentsChief as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiAgentsChief.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AgentsChiefPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="agents-chief">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiAgentsChief.${k}`, vars);
  const canControl = access.guard.permissions?.has('ai.control') ?? false;

  const [agents, investigations, perms, timeZone] = await Promise.all([
    agentProfileList({ db: access.deps.db }),
    listInvestigations({ db: access.deps.db }, { take: 20 }),
    permissionsView({ db: access.deps.db }),
    access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID }),
  ]);
  const chief = agents.find((a) => a.isChief) ?? null;
  const others = agents.filter((a) => !a.isChief);
  const chiefPerm = perms.agents.find((a) => a.isChief) ?? null;
  const nameOf = (key: string) => agents.find((a) => a.key === key) ?? null;
  const agentName = (key: string | null) => {
    if (!key) return null;
    const a = nameOf(key);
    return a ? (view.lang === 'bn' ? a.nameBn : a.nameEn) : key;
  };

  const options: PermissionLevelOption[] = LEVELS.map((lv) => ({ value: lv, label: c(`perm.level.${lv}`) }));

  return (
    <div className="a2-z agents-page ac-z" data-testid="agents-chief" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <Link href="/admin/agents" className="a2-xs a2-mt12" data-testid="chief-back">
        ← {c('backToTeam')}
      </Link>

      <section className="a2-card a2-mt12" data-testid="chief-orgchart">
        <h2>{c('org.heading')}</h2>
        <p className="a2-xs a2-mute">{c('org.note')}</p>
        <div className="ac-org">
          <div className="ac-org-owner">{c('org.owner')}</div>
          {chief ? (
            <div className="ac-org-chief" data-testid="chief-orgchart-chief">
              <span aria-hidden="true">{chief.emoji}</span>
              <b>{view.lang === 'bn' ? chief.nameBn : chief.nameEn}</b>
              <span className="a2-pill gold">{c('org.chiefTag')}</span>
            </div>
          ) : null}
          <div className="ac-org-row">
            {others.map((a) => (
              <Link key={a.key} href={`/admin/agents/${a.key}`} className="ac-org-n" data-testid={`chief-orgchart-${a.key}`}>
                <span aria-hidden="true">{a.emoji}</span>
                <span>{view.lang === 'bn' ? a.nameBn : a.nameEn}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="ac-g2 a2-mt12">
        <div className="ac-stack">
          <section className="a2-card" data-testid="chief-ask">
            <h2>{c('ask.heading')}</h2>
            <p className="a2-xs a2-mute">{c('ask.note')}</p>
            {canControl ? (
              <AskChiefForm placeholder={c('ask.placeholder')} label={c('ask.label')} askLabel={c('ask.submit')} askedText={c('ask.asked')} failedText={c('ask.failed')} />
            ) : (
              <p className="a2-xs a2-mute">{c('perm.readOnly')}</p>
            )}
          </section>

          <section className="a2-card" data-testid="chief-investigations">
            <h2>{c('inv.heading')}</h2>
            {investigations.length === 0 ? (
              <p className="a2-xs a2-mute" data-testid="chief-inv-none">
                {c('inv.none')}
              </p>
            ) : (
              <ul className="ac-inv-list">
                {investigations.map((inv) => {
                  const respName = agentName(inv.responsibleAgent);
                  const isSelf = inv.responsibleAgent === chief?.key;
                  return (
                    <li key={inv.id} className="ac-inv-row" data-testid={`chief-inv-${inv.id}`} data-status={inv.status}>
                      <div className="ac-inv-top">
                        <b>{inv.question}</b>
                        <span className={`a2-pill ${inv.status === 'open' ? 'warn' : 'line'}`}>{inv.status === 'open' ? c('inv.open') : c('inv.closed')}</span>
                      </div>
                      <div className="a2-xs a2-mute">{dateTime(inv.createdAt, view.locale, timeZone)}</div>
                      <div className="a2-xs">{isSelf ? c('inv.selfReview') : respName ? c('inv.responsible', { name: respName }) : null}</div>
                      {inv.findings ? <p className="a2-xs a2-mute">{inv.findings}</p> : null}
                      {inv.evidence.length > 0 ? (
                        <ul className="ac-ev">
                          <li className="a2-xs a2-mute">{c('inv.evidence')}:</li>
                          {inv.evidence.map((e, i) => (
                            <li key={i} className="a2-xs">
                              {e.label} — {e.detail}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {canControl ? (
                        <InvestigationRowActions
                          id={inv.id}
                          agentKey={!isSelf ? inv.responsibleAgent : null}
                          why={inv.findings ?? inv.question}
                          closed={inv.status !== 'open'}
                          closeLabel={c('inv.close')}
                          warnLabel={c('inv.warn', { name: respName ?? '' })}
                          closedText={c('inv.closedToast')}
                          warnedText={c('inv.warned', { name: respName ?? '' })}
                          failedText={c('inv.failed')}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="a2-card" data-testid="chief-permissions">
          <h2>{c('perm.heading')}</h2>
          <p className="a2-xs a2-mute">{c('perm.note')}</p>

          <div className="a2-mt12">
            <div className="a2-xs a2-mute">{c('perm.freeHeading')}</div>
            <ul className="ac-free">
              <li>{c('perm.freeResearch')}</li>
              <li>{c('perm.freeReports')}</li>
              <li>{c('perm.freeAssign')}</li>
              <li>{c('perm.freeReview')}</li>
              <li>{c('perm.freeWarn')}</li>
            </ul>
          </div>

          {chiefPerm ? (
            <div className="a2-mt12">
              <div className="a2-xs a2-mute">{c('perm.resourceHeading')}</div>
              <div className="ac-pm-rows">
                {chiefPerm.cells.map((cell) => {
                  const rLabel = resourceLabel(cell.resource, view.lang);
                  return (
                    <div key={cell.resource} className="ac-pm-row" data-testid={`chief-pm-${cell.resource}`} data-level={cell.level}>
                      <span>
                        {rLabel}
                        {cell.isDefault ? <span className="a2-pill line">{c('perm.defaultBadge')}</span> : null}
                      </span>
                      {canControl ? (
                        <PermissionLevelSelect
                          agentKey={chiefPerm.key}
                          resource={cell.resource}
                          level={cell.level}
                          options={options}
                          label={c('perm.selectLabel', { resource: rLabel })}
                          changedText={c('perm.toastChanged')}
                          failedText={c('perm.toastFailed')}
                        />
                      ) : (
                        <span className="a2-pill line">{c(`perm.level.${cell.level}`)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <Link href="/admin/ai/permissions" className="a2-xs a2-mt12" data-testid="chief-pm-viewall">
            {c('perm.viewAll')}
          </Link>
        </section>
      </div>
    </div>
  );
}
