// S15 · PR 315 (Blueprint C1.6/C2.6 — "one shared ai_usage_ledger for every AI spend in the business") — the single
// shared writer every future AI job dispatcher is meant to call to record one real run, so every money figure that
// already reads `AiUsageLedger` (PR 309's `agentCapState`/`checkAgentCapAlerts` by `agentId`+`costMinor`, PR 313's
// `actualOf` by `jobTypeKey`+`costUsdMicros`) is fed from exactly one place, with one cost computation, instead of
// each future dispatcher writing its own ad hoc row and the two currencies silently drifting apart.
//
// Reuses the Cost Book's own cost model (`estimateMicrosFor`/`modelOf`/`microsToUsdMinor`, PR 312) rather than a
// second pricing table, so a real run's cost is computed exactly the way the book's own estimate already is — the
// two can never disagree about what one run of a given model costs.
//
// As honest as every other AI 360 module about the one thing that has not changed: no job dispatcher exists yet
// (PR 306/307/308/309/312/313 already say so of this same table) — nothing in the real codebase calls this
// function in production. It exists, fully tested, ready for the job dispatcher that is not this PR's scope.
// `costMinor` (the store's own currency — what PR 309's cap check and Control room's today/month totals already
// sum) is never invented when no USD rate has been typed yet (CLAUDE.md rule 1, CN-016 "nothing reaches the owner
// broken"): rather than writing a guessed figure into a column PR 309/304 already trust, `recordAiUsage` honestly
// refuses with `NO_EXCHANGE_RATE` — a real job dispatcher is expected to hold the usage and retry once the owner
// has typed a rate, never to guess one.
//
// Idempotent on `idempotencyKey` (already a unique column in the full S00 schema, tagged for exactly this): a
// caller that retries after a timeout, or a job runner that re-delivers the same message, writes the same row
// once — the second call returns the first call's own result with `idempotent: true`, never a duplicate charge.
// A race between two concurrent callers with the same key is caught the same way (the unique constraint, not a
// read-then-write check, is what actually prevents the duplicate).
import { Prisma, type PrismaClient } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import type { AppResolver } from '../settings';
import { pricerFor } from '../exchange-rate';
import { isAiAgentKey, type AiAgentKey } from './agents';
import { ensureAgentRows } from './control-room';
import { estimateMicrosFor, isModelKey, microsToUsdMinor, modelOf, type JobUsage } from './cost-book';
import { AiError } from './errors';

export interface RecordAiUsageInput {
  /** Unique per real call (the job run's own id is the natural choice). A retry with the same key never
   * double-writes or double-charges. */
  idempotencyKey: string;
  storeId: number;
  agentKey?: AiAgentKey | null;
  jobTypeKey?: string | null;
  modelKey: string;
  usage: JobUsage;
  refType?: string | null;
  refId?: string | null;
}

export type RecordAiUsageResult =
  | { ok: true; id: string; idempotent: boolean; costUsdMicros: bigint; costMinor: number }
  | { ok: false; error: 'NO_EXCHANGE_RATE' };

type Db = Pick<PrismaClient, 'aiUsageLedger' | 'aiAgent' | 'exchangeRate' | 'adSpendDaily'>;

export interface UsageLedgerDeps {
  db: Db;
  resolver: Pick<AppResolver, 'value'>;
  now?: () => Date;
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** The one write path for a real AI call's cost. Throws only for a programmer error on the caller's own side (an
 * unknown model key, a model whose kind does not match the usage shape given, or an unknown agent key) — never for
 * "no exchange rate yet", which is an honest, expected, retryable state this early in the build, not a bug. */
export async function recordAiUsage(deps: UsageLedgerDeps, input: RecordAiUsageInput): Promise<RecordAiUsageResult> {
  const existing = await deps.db.aiUsageLedger.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { ok: true, id: existing.id, idempotent: true, costUsdMicros: existing.costUsdMicros, costMinor: existing.costMinor };

  if (!isModelKey(input.modelKey)) throw new AiError(422, 'UNKNOWN_MODEL', ['modelKey']);
  const model = modelOf(input.modelKey);
  if (model.kind !== input.usage.kind) throw new AiError(422, 'WRONG_KIND', ['usage']);
  if (input.agentKey != null && !isAiAgentKey(input.agentKey)) throw new AiError(422, 'UNKNOWN_AGENT', ['agentKey']);

  const now = deps.now?.() ?? new Date();
  const timeZone = await deps.resolver.value('store.timeZone', { storeId: input.storeId });
  const price = await pricerFor(deps.db, deps.resolver, input.storeId);
  const day = ymdIn(now, timeZone);
  const costUsdMicros = BigInt(estimateMicrosFor(input.usage, model));
  const usdMinor = microsToUsdMinor(Number(costUsdMicros));
  const priced = price(usdMinor, 'USD', day);
  if (!priced) return { ok: false, error: 'NO_EXCHANGE_RATE' };

  let agentId: string | null = null;
  if (input.agentKey) {
    await ensureAgentRows(deps.db);
    agentId = (await deps.db.aiAgent.findUnique({ where: { key: input.agentKey } }))?.id ?? null;
  }

  const data = {
    storeId: input.storeId,
    agentId,
    jobTypeKey: input.jobTypeKey ?? null,
    providerKey: model.providerKey,
    modelKey: model.modelKey,
    idempotencyKey: input.idempotencyKey,
    inputTokens: input.usage.kind === 'text' ? input.usage.inputTokens : 0,
    outputTokens: input.usage.kind === 'text' ? input.usage.outputTokens : 0,
    images: input.usage.kind === 'image' ? input.usage.images : 0,
    videoSeconds: input.usage.kind === 'video' ? input.usage.seconds : 0,
    costUsdMicros,
    costMinor: priced.storeMinor,
    exchangeRateId: priced.exchangeRateId,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
  };

  try {
    const row = await deps.db.aiUsageLedger.create({ data });
    return { ok: true, id: row.id, idempotent: false, costUsdMicros: row.costUsdMicros, costMinor: row.costMinor };
  } catch (e) {
    // Two concurrent callers with the same key: the unique constraint, not our own read-then-write check above,
    // is what actually stops the duplicate — the loser reads back the winner's own row.
    if (!isUniqueViolation(e)) throw e;
    const row = await deps.db.aiUsageLedger.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    return { ok: true, id: row.id, idempotent: true, costUsdMicros: row.costUsdMicros, costMinor: row.costMinor };
  }
}
