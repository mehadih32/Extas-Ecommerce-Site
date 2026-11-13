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
import { isTelegramCommandsEnabled, telegramWebhookSecret } from '@/lib/admin-ai/telegram-routing';
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
  const canControl = access.guard.permissions?.has('ai.control') ?? false;

  const [agents, tgEnabled, tgSecret] = await Promise.all([
    agentProfileList({ db: access.deps.db }),
    isTelegramCommandsEnabled(access.deps),
    telegramWebhookSecret(access.deps),
  ]);
  const secretSet = tgSecret !== null;

  return (
    <div className="a2-z agents-page" data-testid="agents-team" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

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

      <div className="ag-grid a2-mt12" data-testid="agents-grid">
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
