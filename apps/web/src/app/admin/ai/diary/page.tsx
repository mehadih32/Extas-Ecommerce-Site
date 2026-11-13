// S15 · PR 319/320 (Blueprint C1.7 "AI diary" + the demo's own AIC-09 "AI diary & bug box") — AI › Diary at
// `/admin/ai/diary`: one screen, two segments, exactly matching the demo's "all / what they did / bug box" tabs
// with their own counts. "What they did" (PR 319, `diaryView`) — a plain-Bengali log of everything the AI did
// today, written for the owner. "Bug box — could not do" (PR 320, `bugBoxView`) — what an agent could not do, and
// why; the demo shows no owner-facing composer here, only an agent's own report, so neither does this page. Both
// share one day-window and agent filter (plain links, no client JS needed). Honest about the one thing every
// other AI 360 screen already says of itself: no job dispatcher or agent runner exists yet, so both lists are
// empty on a fresh installation until the first agent action writes to one — including S24's own Photoshoot
// agent (C7.20). Read only — the owner reads this screen, never types into it; seeing it needs `ai.read`.
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
import { bugBoxView, type BugReportRow } from '@/lib/admin-ai/bugbox';
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
// The demo's own three segments (AIC-09): everything, what agents did, and the bug box. Not a business number.
const VIEWS = ['all', 'did', 'bug'] as const; // hardcode-ok: a fixed set of display segments
type ViewKey = (typeof VIEWS)[number];
type Row = { kind: 'did'; at: Date; row: DiaryRow } | { kind: 'couldnot'; at: Date; row: BugReportRow };

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
  const askedView = typeof sp.view === 'string' && (VIEWS as readonly string[]).includes(sp.view) ? (sp.view as ViewKey) : 'all';

  const diaryDeps = { db: access.deps.db, resolver: access.deps.resolver, now: access.deps.now };
  const [entries, bugReports] = await Promise.all([
    diaryView(diaryDeps, MOTHER_STORE_ID, { agentKey: askedAgent, days }),
    bugBoxView(diaryDeps, MOTHER_STORE_ID, { agentKey: askedAgent, days }),
  ]);
  const at = (x: Date) => dateTime(x.toISOString(), view.locale, view.timeZone);

  const didRows: Row[] = entries.map((row) => ({ kind: 'did', at: row.createdAt, row }));
  const bugRows: Row[] = bugReports.map((row) => ({ kind: 'couldnot', at: row.createdAt, row }));
  const byView: Record<ViewKey, Row[]> = {
    all: [...didRows, ...bugRows].sort((a, b) => b.at.getTime() - a.at.getTime()),
    did: didRows,
    bug: bugRows,
  };
  const shown = byView[askedView];

  const hrefFor = (next: { agent?: string | null; days?: number; view?: ViewKey }) => {
    const params = new URLSearchParams();
    const agent = next.agent !== undefined ? next.agent : askedAgent;
    const d2 = next.days ?? days;
    const v = next.view ?? askedView;
    if (agent) params.set('agent', agent);
    if (d2 !== DIARY_DEFAULT_DAYS) params.set('days', String(d2));
    if (v !== 'all') params.set('view', v);
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
  const agentOfKey = (key: string) => (isAiAgentKey(key) ? aiAgentDef(key) : null);
  const agentNameOfKey = (key: string) => {
    const a = agentOfKey(key);
    if (!a) return key;
    return view.lang === 'bn' ? a.nameBn : a.nameEn;
  };
  const agentEmojiOfKey = (key: string) => agentOfKey(key)?.emoji ?? '🤖';

  return (
    <div className="a2-z ai-page ai-dy" data-testid="diary-page">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="a2-views" aria-label={c('view.label')} data-testid="ai-dy-views">
        {VIEWS.map((v) => (
          <Link key={v} className={`a2-view${askedView === v ? ' on' : ''}`} href={hrefFor({ view: v })} aria-current={askedView === v ? 'page' : undefined} scroll={false}>
            {c(`view.${v}`)}
            <span className="a2-cnt">{byView[v].length}</span>
          </Link>
        ))}
      </nav>

      <nav className="a2-fbar ai-dy-fbar a2-mt12" aria-label={c('filter.agentLabel')} data-testid="ai-dy-agents">
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
        {shown.length ? (
          <ul className="ai-dy-rows">
            {shown.map((x) =>
              x.kind === 'did' ? (
                <li key={`d-${x.row.id}`} className="a2-card ai-dy-row" data-testid="ai-dy-entry">
                  <div className="ai-dy-pills">
                    <span className="a2-pill info">
                      {agentEmoji(x.row)} {agentName(x.row)}
                    </span>
                    {x.row.storeId === null ? <span className="a2-pill line">{c('entry.wholeSystem')}</span> : null}
                    <span className="a2-pill ok">{c('view.doneTag')}</span>
                    <span className="a2-xs a2-mute">{at(x.row.createdAt)}</span>
                  </div>
                  <div className="ai-dy-text">{x.row.summaryBn}</div>
                  {x.row.refType && x.row.refId ? <div className="a2-xs a2-mute">{c('entry.ref', { type: x.row.refType, id: x.row.refId })}</div> : null}
                </li>
              ) : (
                <li key={`b-${x.row.id}`} className="a2-card ai-dy-row" data-testid="ai-dy-bug">
                  <div className="ai-dy-pills">
                    <span className="a2-pill info">
                      {agentEmojiOfKey(x.row.agentKey)} {agentNameOfKey(x.row.agentKey)}
                    </span>
                    {x.row.storeId === null ? <span className="a2-pill line">{c('entry.wholeSystem')}</span> : null}
                    <span className="a2-pill warn">{c('view.couldNotTag')}</span>
                    <span className="a2-xs a2-mute">{at(x.row.createdAt)}</span>
                  </div>
                  <div className="ai-dy-text">
                    <b>{x.row.title}</b>
                  </div>
                  <div className="a2-xs a2-mute">{c('bug.why', { why: x.row.description })}</div>
                </li>
              ),
            )}
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
