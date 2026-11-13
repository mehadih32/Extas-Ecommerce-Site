// S15 · PR 584 (Blueprint C10.3) — Telegram identity and command routing, on the one bot every agent shares
// (PR 392). Two directions on the one webhook (`/api/telegram/webhook`):
//
// - **Outbound**: any agent message to the owner starts with its identity line ("🏹 Tirondaj তীরন্দাজ · A360-07 ·
//   Ads", `telegramIdentityLine` in `@extas/adapters`) — `sendAgentMessage` below is the one place that sends such a
//   message, so the line is never forgotten on a new call site.
// - **Inbound**: the owner's own message is read for an agent's name, Bengali name or employee code
//   (`resolveAgentForCommand`, pure and tested on its own); the match becomes a real `AiAgentAssignment`
//   (`source: 'telegram'`, PR 577's own table) on that agent's profile, or on Gyani (the chief, PR 583's `isChief`)
//   when nothing names one — exactly C10.3's "no name → Gyani routes it". A short confirmation goes back in the
//   same chat, from whichever agent took it.
// - **Approvals**: a button press (`callback_query`) on an `AiApprovalRequest` already sent with
//   `approvalKeyboard` decides it the same way `/admin/ai/approvals` would (`decideApproval`, PR 317) — "Ask why"
//   only replies with the request's own summary, deciding nothing.
//
// Both directions are gated the same way, twice over (A1.3 "mock until a real key"): the owner's own switch
// (`ai.telegram.commands.enabled`, off as shipped) AND the Telegram connection's own `webhookSecret` actually being
// set (so an update that cannot be verified is never processed, whatever the switch says). Either gate missing, the
// webhook still answers Telegram 200 OK — so Telegram does not retry forever — but does nothing with the update.
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  approvalKeyboard,
  createConnections,
  parseApprovalCallback,
  parseTelegramUpdate,
  sendAsAgent,
  telegramAdapters,
  type TelegramInlineKeyboard,
  type TelegramUpdate,
} from '@extas/adapters';
import { audit, SYSTEM, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { INSTALLATION } from '@extas/settings';
import type { Vault } from '@extas/vault';
import type { AppResolver } from '../settings';
import { AI_AGENTS, aiAgentDef, isAiAgentKey, type AiAgentDef, type AiAgentKey } from './agents';
import { assignAgentTask, DESCRIPTION_MAX, TITLE_MAX } from './agent-profile';
import { approvalsView, decideApproval, kindLabelOf, type ApprovalRow } from './approvals';
import { isAiError } from './errors';

export interface TelegramRoutingDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value' | 'set'>;
  vault: Vault | null;
  now?: () => Date;
}

/** `ai.telegram.commands` — `enabled` off on every installation until the owner turns it on (CLAUDE.md rule: every
 * AI feature ships off; this never touches the outbound alert bot of PR 392, only the inbound routing of PR 584). */
export async function telegramCommandsSetting(deps: Pick<TelegramRoutingDeps, 'resolver'>): Promise<{ enabled: boolean; maxBodyKb: number }> {
  return deps.resolver.value('ai.telegram.commands', { storeId: MOTHER_STORE_ID });
}

export async function isTelegramCommandsEnabled(deps: Pick<TelegramRoutingDeps, 'resolver'>): Promise<boolean> {
  return (await telegramCommandsSetting(deps)).enabled;
}

/** The largest webhook body the route reads (one bot, one address serves the whole installation). */
export async function telegramWebhookMaxBytes(deps: Pick<TelegramRoutingDeps, 'resolver'>): Promise<number> {
  return (await telegramCommandsSetting(deps)).maxBodyKb * 1024;
}

/** A no-op when it already is what was asked, so a double tap writes once (the same shape as `setModelAutoSuggestEnabled`). */
export async function setTelegramCommandsEnabled(deps: Pick<TelegramRoutingDeps, 'resolver'>, who: { actor: Actor; ctx?: RequestContext }, enabled: boolean): Promise<void> {
  const current = await telegramCommandsSetting(deps);
  if (current.enabled === enabled) return;
  await deps.resolver.set('ai.telegram.commands', { ...current, enabled }, INSTALLATION, {
    actorId: who.actor.staffUserId ?? null,
    reason: enabled ? 'AI 360 › Agents: Telegram commands turned on' : 'AI 360 › Agents: Telegram commands turned off',
  });
}

async function connectionsFor(deps: Pick<TelegramRoutingDeps, 'db' | 'vault' | 'resolver'>) {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  return createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: telegramAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
}

/** The webhook secret the owner typed into Keys & connections, or `null` while it is not set — the second, stronger
 * gate (A1.3): a switch turned on with no secret set still routes nothing. */
export async function telegramWebhookSecret(deps: Pick<TelegramRoutingDeps, 'db' | 'vault' | 'resolver'>): Promise<string | null> {
  const c = await connectionsFor(deps);
  const found = await c.secretOf('TELEGRAM', 'webhookSecret');
  return found?.value ?? null;
}

/** One message from a named agent, with the identity line it must always carry (C10.3). Never throws — the same
 * "an alert must not stop what raised it" shape as `sendOwnerAlert`. */
export async function sendAgentMessage(
  deps: Pick<TelegramRoutingDeps, 'db' | 'vault' | 'resolver'>,
  agentKey: string,
  text: string,
  opts?: { keyboard?: TelegramInlineKeyboard },
): Promise<{ ok: boolean; mode: string }> {
  const agent = aiAgentDef(isAiAgentKey(agentKey) ? agentKey : 'gyani');
  const c = await connectionsFor(deps);
  const r = await sendAsAgent(c, agent, text, opts);
  return { ok: r.ok, mode: r.mode };
}

/* ───────────────────────────────────────────── inbound: resolve who a command is for ───────────────────────────────────────────── */

/** Which agent an owner's Telegram message is for (C10.3): the employee code first (least ambiguous), then an
 * `@key` or either name, else the chief (Gyani) — "no name → Gyani routes it". Pure and exported for its own tests;
 * never throws for any real message (always returns some agent, since `AI_AGENTS` always has a chief) — only an
 * empty `agents` list, never passed in production, is refused rather than guessed. */
export function resolveAgentForCommand(text: string, agents: readonly AiAgentDef[] = AI_AGENTS): AiAgentDef {
  const fallback = agents[0];
  if (!fallback) throw new Error('resolveAgentForCommand: no agents given');
  const chief = agents.find((a) => a.isChief) ?? fallback;
  for (const a of agents) if (new RegExp(`\\b${a.code}\\b`, 'i').test(text)) return a;
  const lower = text.toLowerCase();
  for (const a of agents) {
    if (lower.includes(`@${a.key}`)) return a;
    if (lower.includes(a.nameEn.toLowerCase())) return a;
    if (text.includes(a.nameBn)) return a;
  }
  return chief;
}

const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/** Same constant-time compare `support-connect.ts`'s Messenger webhook already uses for its own secret — never a
 * plain `===`, which would let a byte-by-byte timing probe guess the secret. */
const sameSecret = (a: string, b: string): boolean => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/**
 * One inbound Telegram message, naming an agent or not: resolves it (`resolveAgentForCommand`), writes a real
 * `AiAgentAssignment` with `source: 'telegram'` on that agent's own profile (PR 577's table), and sends a short
 * confirmation back in the agent's own identity. Every command is kept, even one Telegram re-delivers — a double
 * webhook call simply makes two assignments, the same honest behaviour the dashboard's own form has (no idempotency
 * key exists on a chat message); nothing here is money, a price or anything irreversible, so this is a safe default.
 */
export async function routeTelegramCommand(deps: TelegramRoutingDeps, text: string): Promise<{ agentKey: string; assignmentId: string }> {
  const agent = resolveAgentForCommand(text);
  const created = await assignAgentTask(deps, { actor: SYSTEM }, agent.key, {
    title: cut(text.trim(), TITLE_MAX),
    description: text.length > TITLE_MAX ? cut(text.trim(), DESCRIPTION_MAX) : null,
    source: 'telegram',
  });
  await audit(deps.db, SYSTEM, { action: 'ai.agent.telegramAssigned', entityType: 'AiAgentAssignment', entityId: created.id, before: null, after: { agentKey: agent.key, source: 'telegram' } }, {});
  return { agentKey: agent.key, assignmentId: created.id };
}

/* ───────────────────────────────────────────── inbound: approval buttons ───────────────────────────────────────────── */

/** A pressed Approve / Reject / Ask-why button: decides the request the same way the dashboard would (PR 317's own
 * `decideApproval`, refusing a gated kind — site-health fixes and new skills stay `/admin/ai/approvals`'s own flow),
 * or, for "Ask why", changes nothing and only hands back the request's own summary to show the owner. Returns `null`
 * for a callback that does not name a request this installation still has pending (an old button, a double tap
 * after it was already decided elsewhere) — handled, never thrown. */
export async function decideTelegramApproval(deps: Pick<TelegramRoutingDeps, 'db' | 'now'>, approvalId: string, action: 'approve' | 'reject' | 'why'): Promise<{ row: ApprovalRow; replyText: string } | null> {
  try {
    if (action === 'why') {
      const view = await approvalsView({ db: deps.db, now: deps.now }, MOTHER_STORE_ID);
      const row = [...view.pending, ...view.decided].find((r) => r.id === approvalId);
      if (!row) return null;
      return { row, replyText: `${kindLabelOf(row.kind, 'en')}: ${row.title}${row.summary ? `\n${row.summary}` : ''}` };
    }
    const row = await decideApproval({ db: deps.db, now: deps.now }, { actor: SYSTEM }, approvalId, action, 'Decided by Telegram button');
    return { row, replyText: action === 'approve' ? `Approved: ${row.title}` : `Rejected: ${row.title}` };
  } catch (e) {
    if (isAiError(e)) return null;
    throw e;
  }
}

/** Sends a pending approval to Telegram with its buttons (PR 584), from Gyani (the chief routes every approval that
 * names no agent of its own, C10.2) — called once, right after `requestApproval` creates it, never on a re-read. */
export async function notifyTelegramApproval(deps: Pick<TelegramRoutingDeps, 'db' | 'vault' | 'resolver'>, row: Pick<ApprovalRow, 'id' | 'kind' | 'title' | 'summary' | 'agentKey'>): Promise<void> {
  const agentKey = row.agentKey && AI_AGENTS.some((a) => a.key === row.agentKey) ? row.agentKey : 'gyani';
  const text = `${kindLabelOf(row.kind, 'en')}\n${row.title}${row.summary ? `\n${row.summary}` : ''}`;
  await sendAgentMessage(deps, agentKey, text, { keyboard: approvalKeyboard(row.id, { approve: 'Approve', reject: 'Reject', askWhy: 'Ask why' }) });
}

/* ───────────────────────────────────────────── the webhook's one entry point ───────────────────────────────────────────── */

export type TelegramWebhookResult = { status: 200; code: 'OK' | 'NOT_CONNECTED' | 'IGNORED' };

/**
 * The whole webhook, both directions, behind both gates (the switch and the webhook secret). Always answers 200 —
 * refusing or erroring would make Telegram retry the same update forever — `code` says what actually happened for
 * the caller's own log line. `secretHeader` is the raw `X-Telegram-Bot-Api-Secret-Token` the request carried.
 */
export async function handleTelegramWebhook(deps: TelegramRoutingDeps, body: unknown, secretHeader: string | null): Promise<TelegramWebhookResult> {
  const [enabled, secret] = await Promise.all([isTelegramCommandsEnabled(deps), telegramWebhookSecret(deps)]);
  if (!enabled || !secret) return { status: 200, code: 'NOT_CONNECTED' };
  if (!secretHeader || !sameSecret(secretHeader, secret)) return { status: 200, code: 'IGNORED' };
  const update = parseTelegramUpdate(body);
  if (!update) return { status: 200, code: 'IGNORED' };
  await processTelegramUpdate(deps, update);
  return { status: 200, code: 'OK' };
}

async function processTelegramUpdate(deps: TelegramRoutingDeps, update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    const c = await connectionsFor(deps);
    const api = (await c.use<{ answerCallback?(id: string): Promise<void> }>('TELEGRAM')).api;
    await api.answerCallback?.(update.callback_query.id);
    const press = parseApprovalCallback(update.callback_query.data);
    if (!press) return;
    const decided = await decideTelegramApproval(deps, press.approvalId, press.action);
    // Gyani, never the originating agent: the chief routes every approval decision, same as C10.2's chain of command.
    if (decided) await sendAgentMessage(deps, 'gyani', decided.replyText);
    return;
  }
  const text = update.message?.text?.trim();
  if (!text) return;
  const { agentKey } = await routeTelegramCommand(deps, text);
  await sendAgentMessage(deps, agentKey, 'Got it — assigned.');
}
