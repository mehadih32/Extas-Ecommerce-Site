// S19 · PR 392 (PR 9) — Telegram alerts: the owner's one bot (Blueprint A2.9.13). The owner makes a bot with
// @BotFather, adds it to his chat or channel, and types the bot's token and the chat's id into Keys & connections.
// Until then, and whenever the test fails, the mock answers: it keeps the newest alerts in this process and sends
// nothing anywhere (A1.3).
//
// - The token lives only in the vault. It is part of the Bot API's address (`/bot<token>/…`), so no error, message or
//   log line ever carries the address: every failure is said in words, with Telegram's own description at most.
// - The Test button reads the bot (`getMe`) and the chat (`getChat`): it proves the token works and the bot may write
//   to that chat, without sending the owner a message.
// - The same bot and chat serve the server's own alerts (`infra/server/bin/extas-monitor`): `extas-vault-sync` copies
//   them to the server's root-only `telegram.env` once the connection is LIVE (packages/jobs/src/server-sync.ts).
//
// S15 · PR 584 (Blueprint C10.3) adds the agents' identity line and inbound command routing on the same one bot:
// - `telegramIdentityLine` formats the sender line every agent message starts with — "🏹 Tirondaj তীরন্দাজ · A360-07 ·
//   Ads" — a pure formatter; which agent, and the actual routing of an owner's command to it, is `apps/web`'s own job
//   (`lib/admin-ai/telegram-routing.ts`), since the fixed agent catalogue lives there, not in this provider-neutral
//   package.
// - `approvalKeyboard` builds the Approve / Reject / Ask-why inline keyboard for an `AiApprovalRequest`; the button
//   press comes back to the webhook as a `callback_query` update, decided the same way a tap on `/admin/ai/approvals`
//   already is.
// - A second, optional secret, `webhookSecret`: the value the owner also gives Telegram when registering the webhook
//   URL (`setWebhook`'s own `secret_token`, done once outside this app — `docs/admin-guide/pages/ai/agents.md`).
//   Telegram sends it back on every update as `X-Telegram-Bot-Api-Secret-Token`; the webhook refuses anything that
//   does not match (never processes an unverifiable call, the same care `support-connect.ts`'s Messenger webhook
//   takes with its own signature). Without it typed in, inbound commands stay off no matter the feature switch.
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';

export const TELEGRAM_PROVIDER = 'telegram';

/** The Bot API's address; another one can be set on the connection (a test server). */
export const TELEGRAM_DEFAULT_BASE_URL = 'https://api.telegram.org';

/** Telegram's own limit for one message. */
export const TELEGRAM_MAX_TEXT = 4096;

/** A bot token as @BotFather gives it: the bot's number, a colon, then letters, digits, `_` and `-`. */
export const TELEGRAM_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;
/** A chat id: a number (a person, a group, `-100…` a channel) or a public channel's `@name`. */
export const TELEGRAM_CHAT = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

export type TelegramResult = { ok: true; messageId: number | null } | { ok: false; error: string };

/** One row of Telegram's own inline keyboard (PR 584): a button that comes back as a `callback_query` update
 * carrying this same `callback_data` (Telegram's own 64-byte limit — an approval id plus one short action word stays
 * well inside it). */
export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}
export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineButton[][];
}

export interface TelegramSendOptions {
  /** Approve / Reject / Ask-why buttons under the message (PR 584); absent for a plain alert. */
  keyboard?: TelegramInlineKeyboard;
}

/** One inline button: its words and the data Telegram hands back when it is tapped (at most 64 bytes). */
export interface TelegramButton {
  text: string;
  data: string;
}

export interface TelegramSender {
  provider: string;
  /** Sends one plain-text message (cut to Telegram's limit) to the connection's chat, optionally with buttons. */
  send(text: string, opts?: TelegramSendOptions): Promise<TelegramResult>;
  /** The Test button's round trip; absent on the mock. */
  check?(): Promise<{ ok: boolean; message: string }>;
  /** Clears a pressed button's loading spinner (PR 584); a no-op where it is not needed (the mock). */
  answerCallback?(callbackQueryId: string, text?: string): Promise<void>;
  // S28 · PR 703 — the approvals: buttons, a reply to the chat, deleting a message (the typed PIN), the webhook.
  /** The configured chat (the only chat an inbound update is accepted from). */
  chatId?: string;
  /** One message with rows of inline buttons. */
  sendWithButtons?(text: string, rows: readonly (readonly TelegramButton[])[]): Promise<TelegramResult>;
  /** Removes one message from the chat (the PIN the owner typed). True when it is gone. */
  deleteMessage?(messageId: number): Promise<boolean>;
  /** The secret part of the webhook's address: a keyed hash of the token, never the token. Live client only. */
  webhookSecret?(): string;
  /** Tells Telegram where to send updates (`https://…/api/telegram/webhook/<secret>`). */
  setWebhook?(url: string): Promise<{ ok: boolean; message: string }>;
}

export interface MockTelegramMessage {
  at: Date;
  text: string;
  keyboard?: TelegramInlineKeyboard;
  buttons?: readonly (readonly TelegramButton[])[];
}

const G = globalThis as unknown as { __extasMockTelegram?: MockTelegramMessage[] };
const outbox = (): MockTelegramMessage[] => (G.__extasMockTelegram ??= []);
/** The mock keeps this many messages (the newest). */
const MOCK_KEEP = 200;

/** What the mock was asked to send in this process (tests). */
export const mockTelegramOutbox = {
  all: (): readonly MockTelegramMessage[] => [...outbox()],
  clear: (): void => {
    outbox().length = 0;
  },
};

const cut = (text: string) => (text.length > TELEGRAM_MAX_TEXT ? `${text.slice(0, TELEGRAM_MAX_TEXT - 1)}…` : text);

export function mockTelegramSender(provider = TELEGRAM_PROVIDER): TelegramSender {
  const keep = (text: string, buttons?: readonly (readonly TelegramButton[])[], keyboard?: TelegramInlineKeyboard) => {
    const all = outbox();
    all.push({ at: new Date(), text: cut(text), ...(buttons ? { buttons } : {}), ...(keyboard ? { keyboard } : {}) });
    if (all.length > MOCK_KEEP) all.splice(0, all.length - MOCK_KEEP);
    return { ok: true, messageId: null } as const;
  };
  // The mock has no webhook secret and no way to delete: it sends nothing anywhere, so no update can come back to it.
  return {
    provider,
    async send(text, opts) {
      return keep(text, undefined, opts?.keyboard);
    },
    async sendWithButtons(text, rows) {
      return keep(text, rows);
    },
    async answerCallback() {
      // nothing to clear: no real button exists in the mock
    },
  };
}

/** The sender's identity line every agent message starts with (Blueprint C10.3) — "🏹 Tirondaj তীরন্দাজ · A360-07 ·
 * Ads" — so the owner always knows who sent it. A pure formatter: which agent is this app's own job
 * (`apps/web/src/lib/admin-ai/telegram-routing.ts`), not this provider-neutral package's. */
export function telegramIdentityLine(agent: { emoji: string; nameEn: string; nameBn: string; code: string; tag: string }): string {
  return `${agent.emoji} ${agent.nameEn} ${agent.nameBn} · ${agent.code} · ${agent.tag}`;
}

/** The owner's own Telegram header name the webhook secret comes back on (Bot API's `setWebhook` `secret_token`). */
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/** The Approve / Reject / Ask-why keyboard under an approval request sent to Telegram (Blueprint C10.3). */
export function approvalKeyboard(approvalId: string, labels: { approve: string; reject: string; askWhy: string }): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: labels.approve, callback_data: `appr:${approvalId}:approve` },
        { text: labels.reject, callback_data: `appr:${approvalId}:reject` },
        { text: labels.askWhy, callback_data: `appr:${approvalId}:why` },
      ],
    ],
  };
}

/** One pressed button's payload, parsed back out of its `callback_data` — `null` for anything not this shape
 * (a stale button from before an upgrade, or noise), so the webhook can ignore it rather than guess. */
export interface TelegramApprovalAction {
  approvalId: string;
  action: 'approve' | 'reject' | 'why';
}
export function parseApprovalCallback(data: string | undefined | null): TelegramApprovalAction | null {
  if (!data) return null;
  const m = /^appr:([^:]+):(approve|reject|why)$/.exec(data);
  if (!m || !m[1] || !m[2]) return null;
  return { approvalId: m[1], action: m[2] as TelegramApprovalAction['action'] };
}

/** The small, loosely-typed slice of a Telegram `Update` this app actually reads (Bot API's own shape is much
 * larger); anything else in the payload is ignored, never refused — Telegram adds fields over time. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number | string };
    text?: string;
    from?: { id: number; username?: string; first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number | string } };
    from?: { id: number; username?: string };
  };
}

/** Reads a webhook POST body as a `TelegramUpdate`, or `null` for anything not shaped like one (never throws on
 * whatever Telegram's own payload turns out to carry). */
export function parseTelegramUpdate(body: unknown): TelegramUpdate | null {
  if (!body || typeof body !== 'object') return null;
  const u = body as Record<string, unknown>;
  if (typeof u.update_id !== 'number') return null;
  return u as unknown as TelegramUpdate;
}

/** The webhook's secret: HMAC-SHA256 of a fixed label keyed by the bot token, in hex (the token never leaves the vault). */
export function telegramWebhookSecret(token: string): string {
  return createHmac('sha256', token).update('extas-telegram-webhook').digest('hex');
}

export const telegramConfig = z.object({
  /** Where the alerts go: the chat's id (a number, `-100…` for a channel) or a public channel's `@name`. */
  chatId: z.string().trim().regex(TELEGRAM_CHAT, 'a chat id is a number (like -1001234567890) or @channelname'),
  /** Only to point at another address than Telegram's own (a test server). HTTPS only. */
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type TelegramConfig = z.output<typeof telegramConfig>;

interface ClientOptions {
  baseUrl: string;
  token: string;
  chatId: string;
  fetch?: typeof fetch;
}

interface BotBody {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number; username?: string; title?: string; first_name?: string; type?: string };
}

/** The Bot API client. Never puts its address (which holds the token) into an error. */
export function createTelegramClient(o: ClientOptions): TelegramSender & { check(): Promise<{ ok: boolean; message: string }>; chatId: string; webhookSecret(): string } {
  if (!TELEGRAM_TOKEN.test(o.token)) throw new Error('the bot token does not look like one from @BotFather (123456789:ABC…)');
  const doFetch = o.fetch ?? fetch;
  const base = `${o.baseUrl.replace(/\/+$/, '')}/bot${o.token}`;

  async function call(method: string, body: Record<string, unknown>): Promise<BotBody> {
    let res: Response;
    try {
      res = await doFetch(`${base}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new Error('Telegram did not answer');
    }
    let parsed: BotBody = {};
    try {
      parsed = (await res.json()) as BotBody;
    } catch {
      // not JSON: the status code speaks
    }
    if (!res.ok || parsed.ok !== true) {
      const why = (parsed.description ?? '').replaceAll(o.token, '…').slice(0, 200);
      throw new Error(`Telegram refused (${res.status})${why ? `: ${why}` : ''}`);
    }
    return parsed;
  }

  return {
    provider: TELEGRAM_PROVIDER,
    chatId: o.chatId,
    async send(text, opts) {
      try {
        const r = await call('sendMessage', { chat_id: o.chatId, text: cut(text), disable_web_page_preview: true, ...(opts?.keyboard ? { reply_markup: opts.keyboard } : {}) });
        return { ok: true, messageId: r.result?.message_id ?? null };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async sendWithButtons(text, rows) {
      try {
        const r = await call('sendMessage', { chat_id: o.chatId, text: cut(text), disable_web_page_preview: true, reply_markup: { inline_keyboard: rows.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } });
        return { ok: true, messageId: r.result?.message_id ?? null };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async deleteMessage(messageId) {
      try {
        await call('deleteMessage', { chat_id: o.chatId, message_id: messageId });
        return true;
      } catch {
        return false;
      }
    },
    async answerCallback(callbackId, text) {
      try {
        await call('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 200) } : {}) });
      } catch {
        // the spinner stops by itself
      }
    },
    webhookSecret: () => telegramWebhookSecret(o.token),
    async setWebhook(url) {
      try {
        await call('setWebhook', { url, allowed_updates: ['callback_query', 'message'], drop_pending_updates: true });
        return { ok: true, message: 'Telegram will send the bot\'s button taps and messages to the ERP' };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
    async check() {
      const me = await call('getMe', {});
      const chat = await call('getChat', { chat_id: o.chatId });
      const name = chat.result?.title ?? chat.result?.first_name ?? chat.result?.username ?? o.chatId;
      return { ok: true, message: `Telegram: @${me.result?.username ?? 'the bot'} can write to ${name}` };
    },
  };
}

export const telegramAdapter = defineAdapter<TelegramSender, TelegramConfig>({
  kind: 'TELEGRAM',
  provider: TELEGRAM_PROVIDER,
  modes: ['LIVE'],
  // `webhookSecret` (PR 584): never read by `create()` below — sending alerts needs only the bot token — but listed
  // here so the connection layer lets Keys & connections store it and the webhook route read it back with
  // `connections.secretOf('TELEGRAM', 'webhookSecret', …)`.
  secrets: ['botToken', 'webhookSecret'],
  configSchema: telegramConfig,
  async create(ctx) {
    return createTelegramClient({
      baseUrl: ctx.config.baseUrl ?? TELEGRAM_DEFAULT_BASE_URL,
      token: await requireSecret(ctx, 'botToken'),
      chatId: ctx.config.chatId,
    });
  },
  async mock() {
    return mockTelegramSender();
  },
  async test(api) {
    if (!api.check) return { ok: true, message: 'mock Telegram: nothing is sent' };
    try {
      return await api.check();
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
});

export const telegramAdapters = [telegramAdapter] as const;

/** Anything that can hand out the Telegram connection in use (createConnections(...).use). */
export interface TelegramLink {
  use<Api>(kind: 'TELEGRAM'): Promise<{ api: Api; mode: string }>;
}

/**
 * One alert to the owner's Telegram (the mock while the bot is not connected). Never throws: an alert that cannot go
 * out must not stop what raised it; the answer says whether it went and why not.
 */
export async function sendOwnerAlert(link: TelegramLink, text: string): Promise<TelegramResult & { mode: string }> {
  try {
    const { api, mode } = await link.use<TelegramSender>('TELEGRAM');
    return { ...(await api.send(text)), mode };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), mode: 'MOCK' };
  }
}

/**
 * One message from a named agent (Blueprint C10.3, PR 584): the identity line, a blank line, then the text —
 * optionally with an approval's buttons. Same never-throws shape as `sendOwnerAlert`.
 */
export async function sendAsAgent(
  link: TelegramLink,
  agent: { emoji: string; nameEn: string; nameBn: string; code: string; tag: string },
  text: string,
  opts?: TelegramSendOptions,
): Promise<TelegramResult & { mode: string }> {
  try {
    const { api, mode } = await link.use<TelegramSender>('TELEGRAM');
    return { ...(await api.send(`${telegramIdentityLine(agent)}\n\n${text}`, opts)), mode };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), mode: 'MOCK' };
  }
}
