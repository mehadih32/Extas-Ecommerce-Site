// S15 · PR 319 (Blueprint C1.7 "AI diary" — "A plain-Bengali log of everything the AI did today, written for the
// owner — not a technical log. It includes the day's photoshoot activity.") — AI › Diary at `/admin/ai/diary`:
// every entry any agent wrote (`diaryView`, `lib/admin-ai/diary.ts`), newest first, with a day-window and an
// agent filter (both plain links, no client JS needed). Honest about the one thing every other AI 360 screen
// already says of itself: no job dispatcher or agent runner exists yet, so the list is empty on a fresh
// installation until the first agent action writes to it — including S24's own Photoshoot agent (C7.20). Read
// only — the owner reads this screen, never types into it; seeing it needs `ai.read`.
// Guide: docs/admin-guide/pages/ai/diary.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { AI_AGENTS, aiAgentDef, isAiAgentKey } from '@/lib/admin-ai/agents';
import { DIARY_DEFAULT_DAYS, diaryView, type DiaryRow } from '@/lib/admin-ai/diary';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-ai.bn.json';
import en from '../../../../../messages/admin-ai.en.json';
import '../ai.css';
import './diary.css';

export const dynamic = 'force-dynamic';

const KEY = 'aiDiary';
const HERE = '/admin/ai/diary';
// A fixed set of display windows, not a business limit — the owner picks one, nothing is computed from it besides
// how far back the list looks.
const DAY_OPTIONS = [7, 14, 30] as const; // hardcode-ok: display filter choices, not a business number

type Search = Promise<Record<string, string | string[] | undefined>>;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, aiDiary: (view.lang === 'bn' ? bn : en).aiDiary as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'aiDiary.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AiDiaryPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [sp, plain, access] = await Promise.all([searchParams, adminView(deps), pageAccess('ai.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="diary-page">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `aiDiary.${k}`, vars);

  const askedAgent = typeof sp.agent === 'string' && isAiAgentKey(sp.agent) ? sp.agent : null;
  const askedDays = typeof sp.days === 'string' ? Number(sp.days) : NaN;
  const days = (DAY_OPTIONS as readonly number[]).includes(askedDays) ? askedDays : DIARY_DEFAULT_DAYS;

  const entries = await diaryView({ db: access.deps.db, resolver: access.deps.resolver, now: access.deps.now }, MOTHER_STORE_ID, { agentKey: askedAgent, days });
  const at = (x: Date) => dateTime(x.toISOString(), view.locale, view.timeZone);

  const hrefFor = (next: { agent?: string | null; days?: number }) => {
    const params = new URLSearchParams();
    const agent = next.agent !== undefined ? next.agent : askedAgent;
    const d2 = next.days ?? days;
    if (agent) params.set('agent', agent);
    if (d2 !== DIARY_DEFAULT_DAYS) params.set('days', String(d2));
    const qs = params.toString();
    return qs ? `${HERE}?${qs}` : HERE;
  };

  const agentOf = (r: DiaryRow) => (isAiAgentKey(r.agentKey) ? aiAgentDef(r.agentKey) : null);
  const agentName = (r: DiaryRow) => {
    const a = agentOf(r);
    if (!a) return r.agentKey;
    return view.lang === 'bn' ? a.nameBn : a.nameEn;
  };
  const agentEmoji = (r: DiaryRow) => agentOf(r)?.emoji ?? '🤖';

  return (
    <div className="a2-z ai-page ai-dy" data-testid="diary-page">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="a2-fbar ai-dy-fbar" aria-label={c('filter.agentLabel')} data-testid="ai-dy-agents">
        <Link className={`a2-view${!askedAgent ? ' on' : ''}`} href={hrefFor({ agent: null })} aria-current={!askedAgent ? 'page' : undefined} scroll={false}>
          {c('filter.agentAll')}
        </Link>
        {AI_AGENTS.map((a) => (
          <Link key={a.key} className={`a2-view${askedAgent === a.key ? ' on' : ''}`} href={hrefFor({ agent: a.key })} aria-current={askedAgent === a.key ? 'page' : undefined} scroll={false}>
            {a.emoji} {view.lang === 'bn' ? a.nameBn : a.nameEn}
          </Link>
        ))}
      </nav>

      <nav className="a2-fbar ai-dy-fbar a2-mt12" aria-label={c('filter.daysLabel')} data-testid="ai-dy-days">
        {DAY_OPTIONS.map((n) => (
          <Link key={n} className={`a2-view${days === n ? ' on' : ''}`} href={hrefFor({ days: n })} aria-current={days === n ? 'page' : undefined} scroll={false}>
            {c(`filter.days${n}`)}
          </Link>
        ))}
      </nav>

      <section className="ai-dy-sec a2-mt12" aria-labelledby="ai-dy-list-h" data-testid="ai-dy-list">
        <h2 className="a2-h3" id="ai-dy-list-h">
          {c('windowNote', { days })}
        </h2>
        {entries.length ? (
          <ul className="ai-dy-rows">
            {entries.map((r) => (
              <li key={r.id} className="a2-card ai-dy-row" data-testid="ai-dy-entry">
                <div className="ai-dy-pills">
                  <span className="a2-pill info">
                    {agentEmoji(r)} {agentName(r)}
                  </span>
                  {r.storeId === null ? <span className="a2-pill line">{c('entry.wholeSystem')}</span> : null}
                  <span className="a2-xs a2-mute">{at(r.createdAt)}</span>
                </div>
                <div className="ai-dy-text">{r.summaryBn}</div>
                {r.refType && r.refId ? <div className="a2-xs a2-mute">{c('entry.ref', { type: r.refType, id: r.refId })}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="a2-note a2-mt12" role="note" data-testid="ai-dy-empty">
            <span>{c('empty')}</span>
          </div>
        )}
      </section>
    </div>
  );
}
