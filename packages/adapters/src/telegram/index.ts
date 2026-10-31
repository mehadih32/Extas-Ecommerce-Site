// S19 · PR 392 (PR 9) — Telegram alerts: the owner's one bot (Blueprint A2.9.13, PR 584 later adds the agents' identity
// line). The owner makes a bot with @BotFather, adds it to his chat or channel, and types the bot's token and the chat's
// id into Keys & connections. Until then, and whenever the test fails, the mock answers: it keeps the newest alerts in
// this process and sends nothing anywhere (A1.3).
//
// - The token lives only in the vault. It is part of the Bot API's address (`/bot<token>/…`), so no error, message or
//   log line ever carries the address: every failure is said in words, with Telegram's own description at most.
// - The Test button reads the bot (`getMe`) and the chat (`getChat`): it proves the token works and the bot may write
//   to that chat, without sending the owner a message.
// - The same bot and chat serve the server's own alerts (`infra/server/bin/extas-monitor`): `extas-vault-sync` copies
//   them to the server's root-only `telegram.env` once the connection is LIVE (packages/jobs/src/server-sync.ts).
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

export interface TelegramSender {
  provider: string;
  /** Sends one plain-text message (cut to Telegram's limit) to the connection's chat. */
  send(text: string): Promise<TelegramResult>;
  /** The Test button's round trip; absent on the mock. */
  check?(): Promise<{ ok: boolean; message: string }>;
}

export interface MockTelegramMessage {
  at: Date;
  text: string;
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
  return {
    provider,
    async send(text) {
      const all = outbox();
      all.push({ at: new Date(), text: cut(text) });
      if (all.length > MOCK_KEEP) all.splice(0, all.length - MOCK_KEEP);
      return { ok: true, messageId: null };
    },
  };
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
export function createTelegramClient(o: ClientOptions): TelegramSender & { check(): Promise<{ ok: boolean; message: string }> } {
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
    async send(text) {
      try {
        const r = await call('sendMessage', { chat_id: o.chatId, text: cut(text), disable_web_page_preview: true });
        return { ok: true, messageId: r.result?.message_id ?? null };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
  secrets: ['botToken'],
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
