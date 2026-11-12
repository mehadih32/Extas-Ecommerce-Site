// S15 · PR 577 (C10.4; demo 89b-admin-agents.js) — the team page at `/admin/agents` (Lumen, `data-lm-ready`): every
// fixed agent as a card (photo or initial, name, role, open/done assignment counts, the verified star), each
// linking to its own 360° profile. Seeing the page needs `ai.read`, the same permission as the Control room this
// page sits beside.
// Guide: docs/admin-guide/pages/ai/agents.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { agentProfileList } from '@/lib/admin-ai/agent-profile';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../messages/admin-agents.bn.json';
import en from '../../../../messages/admin-agents.en.json';
import './agents.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiAgents';
const HERE = '/admin/agents';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiAgents: (view.lang === 'bn' ? bn : en).aiAgents as unknown as Dict } };
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

  const agents = await agentProfileList({ db: access.deps.db });

  return (
    <div className="a2-z agents-page" data-testid="agents-team" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="ag-grid" data-testid="agents-grid">
        {agents.map((a) => {
          const name = view.lang === 'bn' ? a.nameBn : a.nameEn;
          return (
            <Link key={a.key} href={`/admin/agents/${a.key}`} className="a2-card tight ag-card" data-testid={`agents-card-${a.key}`}>
              <div className="ag-ch">
                <span className="ag-av" aria-hidden="true">
                  {a.photoUrl ? <img src={a.photoUrl} alt="" loading="lazy" /> : a.emoji}
                </span>
                <div className="ag-cn">
                  <b>
                    {name}
                    {a.verified ? <span title={c('verified')}> ✓</span> : null}
                  </b>
                  <span className="a2-xs a2-mute">{a.role}</span>
                </div>
              </div>
              <div className="ag-counts a2-xs a2-mute">
                <span>{c('team.open', { n: a.openCount })}</span>
                <span>{c('team.done', { n: a.doneCount })}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
