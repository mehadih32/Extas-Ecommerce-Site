// S15 · PR 307 (C1.5) — per-agent model choice: which configured AI provider (PR 306) an agent's jobs use, with
// Claude's own pick recommended by default and an inline note whenever the owner picks something else. No AiModel
// catalogue row is read or written here — the per-model price table and the job-level Cost Book arrive with PR
// 312/580; until then "a model" is simply one of the four live AI_PROVIDER connections the owner has keyed and
// Tested in Keys & connections (PR 306), each carrying the owner's own `config.model` id (never a hard-coded one).
// An agent whose chosen provider is later disabled, un-Tested or removed quietly falls back to the practice writer
// — the same "AI is additive, nothing ever hard-stops" principle as every other AI feature (C1.4).
import type { PrismaClient } from '@extas/db/client';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { AiError } from './errors';
import { isAiAgentKey, type AiAgentKey } from './agents';

/** The writer providers PR 306 wired, in the order Claude recommends them — its own model first. */
export const WRITER_PROVIDERS = ['anthropic', 'openAi', 'googleAi', 'openRouter'] as const;
export type WriterProvider = (typeof WRITER_PROVIDERS)[number];

export function isWriterProvider(value: string): value is WriterProvider {
  return (WRITER_PROVIDERS as readonly string[]).includes(value);
}

export interface WriterOption {
  /** `null` is the practice writer (no key yet) — always listed, always ready. */
  provider: WriterProvider | null;
  /** The owner's own `config.model` text for this connection; `null` when not ready or not set. */
  modelId: string | null;
  /** Enabled AND its Test has passed (the connection is in `LIVE` mode) — the same bar PR 306 uses to go live. */
  ready: boolean;
}

export interface AgentModelPick {
  key: AiAgentKey;
  selectedProvider: WriterProvider | null;
  /** False when the stored pick exists but its connection is no longer ready — the agent is quietly on the practice
   * writer until the owner re-Tests it or picks again. */
  selectedReady: boolean;
}

type IntegrationRow = { provider: string; enabled: boolean; mode: string; config: unknown };

function readModelId(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const model = (config as Record<string, unknown>).model;
  return typeof model === 'string' && model.trim() ? model : null;
}

/** Every writer option the owner could pick from today, in a fixed order — the practice writer first, then the
 * four live providers (ready or not), so the admin page never has to guess the list shape. */
export async function listWriterOptions(db: Pick<PrismaClient, 'integration'>): Promise<WriterOption[]> {
  const rows: IntegrationRow[] = await db.integration.findMany({
    where: { kind: 'AI_PROVIDER', storeId: null, archivedAt: null, provider: { in: WRITER_PROVIDERS as unknown as string[] } },
    select: { provider: true, enabled: true, mode: true, config: true },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const live: WriterOption[] = WRITER_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    const ready = Boolean(row?.enabled && row.mode === 'LIVE');
    return { provider, modelId: ready ? readModelId(row!.config) : null, ready };
  });
  return [{ provider: null, modelId: null, ready: true }, ...live];
}

/** Claude's own pick: the first ready provider in `WRITER_PROVIDERS` order (Anthropic first), or the practice
 * writer when none has been keyed and Tested yet. */
export function recommendedWriterOf(options: readonly WriterOption[]): WriterProvider | null {
  const ready = options.find((o) => o.provider !== null && o.ready);
  return ready ? (ready.provider as WriterProvider) : null;
}

/** Reads every agent's stored pick alongside today's option list — used by `control-room.ts`'s screen and by
 * tests; the admin page itself gets the same shape through `controlRoomView`. */
export async function agentModelPicks(db: Pick<PrismaClient, 'integration' | 'aiAgent'>): Promise<{ options: WriterOption[]; recommended: WriterProvider | null; picks: AgentModelPick[] }> {
  const [options, rows] = await Promise.all([listWriterOptions(db), db.aiAgent.findMany({ where: { archivedAt: null }, select: { key: true, selectedProvider: true } })]);
  const recommended = recommendedWriterOf(options);
  const picks = rows
    .filter((r): r is typeof r & { key: AiAgentKey } => isAiAgentKey(r.key))
    .map((r) => {
      const selectedProvider = r.selectedProvider && isWriterProvider(r.selectedProvider) ? r.selectedProvider : null;
      const opt = options.find((o) => o.provider === selectedProvider);
      return { key: r.key, selectedProvider, selectedReady: Boolean(selectedProvider === null || opt?.ready) };
    });
  return { options, recommended, picks };
}

/**
 * Sets one agent's chosen writer provider (`null` = the practice writer). Refuses a provider that is not keyed and
 * Tested yet (`PROVIDER_NOT_READY`) — the owner can never silently point an agent at a connection that would only
 * fall back anyway. A no-op when it already is what was asked, so a double tap writes once.
 */
export async function setAgentModelProvider(deps: { db: PrismaClient }, who: { actor: Actor; ctx?: RequestContext }, key: string, provider: string | null): Promise<void> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  if (provider !== null && !isWriterProvider(provider)) throw new AiError(422, 'UNKNOWN_PROVIDER', ['provider']);
  if (provider !== null) {
    const options = await listWriterOptions(deps.db);
    const opt = options.find((o) => o.provider === provider);
    if (!opt?.ready) throw new AiError(422, 'PROVIDER_NOT_READY', ['provider']);
  }
  await deps.db.$transaction(async (tx) => {
    const row = await tx.aiAgent.findUnique({ where: { key } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    if (row.selectedProvider === provider) return;
    await tx.aiAgent.update({ where: { key }, data: { selectedProvider: provider } });
    await audit(tx, who.actor, { action: 'ai.agent.model', entityType: 'AiAgent', entityId: row.id, before: { selectedProvider: row.selectedProvider }, after: { selectedProvider: provider } }, who.ctx ?? {});
  });
}
