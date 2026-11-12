// S15 · PR 319 (Blueprint C1.7 "AI diary" — "A plain-Bengali log of everything the AI did today, written for the
// owner — not a technical log. It includes the day's photoshoot activity.") — `AiDiaryEntry` (already in the full
// S00 schema, `@stage S15 · PR 319`, written for the first time here) is the one shared diary every agent writes
// to when it does something worth telling the owner about. Read back oldest-stays-in-the-database,
// newest-shown-first at `/admin/ai/diary` — the way a diary is actually read.
//
// As honest as PR 315's usage ledger about the one thing that has not changed: no job dispatcher or agent runner
// exists yet (PR 304-318 already say so of their own tables), so nothing in the real codebase calls
// `recordDiaryEntry` in production today. The write path and the read screen are both fully real and fully tested,
// ready for the first agent action that writes to it — including S24's own Photoshoot agent, which the Blueprint
// names by name (C7.20: "the AI diary includes the day's photoshoot activity in plain Bengali").
//
// `summaryBn` is one plain-Bengali line, written by the agent that acted, in the owner's own voice — "what it did,
// why, and what it changed" (the Blueprint's own three questions) folded into one honest sentence, never a
// technical log line (CLAUDE.md "talk to him only in simple everyday Bengali"). `refType`/`refId` point at the
// real row the entry is about (an order, a setting, a product) when there is one, so a later "show me" can jump
// straight to it; `details` is optional structured JSON for that same future screen — the summary line alone must
// always stand on its own without it.
import { ymdIn, dayStart } from '@extas/metrics';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import type { AppResolver } from '../settings';
import { isAiAgentKey, type AiAgentKey } from './agents';
import { ensureAgentRows } from './control-room';
import { AiError } from './errors';

/** A display window, not a retention policy — every entry stays in the database either way; this is only how far
 * back the screen looks by default. */
export const DIARY_DEFAULT_DAYS = 14; // hardcode-ok: a display window, not a business number
/** A display row cap for one screenful, not a business limit. */
export const DIARY_MAX_ROWS = 200; // hardcode-ok: a display row count, not a business number

type Db = Pick<PrismaClient, 'aiDiaryEntry' | 'aiAgent'>;

export interface DiaryDeps {
  db: Db;
  resolver: Pick<AppResolver, 'value'>;
  now?: () => Date;
}

export interface RecordDiaryEntryInput {
  /** Null for installation-wide work (Prohori's own server/security checks) — most entries follow one store. */
  storeId?: number | null;
  agentKey: AiAgentKey;
  /** One plain-Bengali line, written for the owner — never a technical log line. */
  summaryBn: string;
  details?: unknown;
  refType?: string | null;
  refId?: string | null;
  /** Defaults to now. Only ever backdated by a batch job genuinely catching up on an earlier day, never forward. */
  at?: Date;
}

/** Writes one diary line for one agent. Throws only for a caller bug (an unknown agent key, or an empty summary —
 * a real entry always has something to say) — never invents a summary when the caller gave none. */
export async function recordDiaryEntry(deps: DiaryDeps, input: RecordDiaryEntryInput): Promise<{ id: string }> {
  if (!isAiAgentKey(input.agentKey)) throw new AiError(422, 'UNKNOWN_AGENT', ['agentKey']);
  const summaryBn = input.summaryBn.trim();
  if (!summaryBn) throw new AiError(422, 'INVALID_INPUT', ['summaryBn']);
  await ensureAgentRows(deps.db);
  const agent = await deps.db.aiAgent.findUnique({ where: { key: input.agentKey } });
  if (!agent) throw new AiError(422, 'UNKNOWN_AGENT', ['agentKey']);
  const at = input.at ?? deps.now?.() ?? new Date();
  const timeZone = (await deps.resolver.value('store.timeZone', { storeId: input.storeId ?? MOTHER_STORE_ID })) as string;
  const date = dayStart(ymdIn(at, timeZone), timeZone);
  const row = await deps.db.aiDiaryEntry.create({
    data: {
      storeId: input.storeId ?? null,
      agentId: agent.id,
      date,
      summaryBn,
      details: input.details === undefined ? undefined : (input.details as Prisma.InputJsonValue),
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    },
  });
  return { id: row.id };
}

export interface DiaryRow {
  id: string;
  storeId: number | null;
  /** The raw key the entry was written under — almost always a real agent key (resolved through
   * `AI_AGENTS`/`aiAgentDef` for a name and emoji), kept as a plain string here rather than re-validated, the
   * same honest fallback `approvals.ts`'s `kindLabelOf` already uses for a kind it does not recognise. */
  agentKey: string;
  date: Date;
  summaryBn: string;
  details: unknown;
  refType: string | null;
  refId: string | null;
  createdAt: Date;
}

export interface DiaryFilter {
  /** An agent key to show only that agent's own lines — must be a real agent key when given. */
  agentKey?: string | null;
  /** How many days back to look. Falls back to `DIARY_DEFAULT_DAYS` when missing, zero or negative. */
  days?: number | null;
}

/** The owner's own diary screen: every entry for this store (plus installation-wide ones), newest first, within
 * the given window — oldest-first-reversed, the way a diary is actually read. Throws only for a caller bug (an
 * `agentKey` filter that is not a real agent key), never for an empty result, which is simply an honest "nothing
 * yet". */
export async function diaryView(deps: DiaryDeps, storeId: number, filter: DiaryFilter = {}): Promise<DiaryRow[]> {
  if (filter.agentKey != null && !isAiAgentKey(filter.agentKey)) throw new AiError(422, 'UNKNOWN_AGENT', ['agent']);
  const now = deps.now?.() ?? new Date();
  const days = filter.days && filter.days > 0 ? filter.days : DIARY_DEFAULT_DAYS;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const where: Prisma.AiDiaryEntryWhereInput = {
    OR: [{ storeId }, { storeId: null }],
    createdAt: { gte: since },
    ...(filter.agentKey ? { agent: { key: filter.agentKey } } : {}),
  };
  const rows = await deps.db.aiDiaryEntry.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: DIARY_MAX_ROWS,
    include: { agent: { select: { key: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    agentKey: r.agent.key,
    date: r.date,
    summaryBn: r.summaryBn,
    details: r.details,
    refType: r.refType,
    refId: r.refId,
    createdAt: r.createdAt,
  }));
}
