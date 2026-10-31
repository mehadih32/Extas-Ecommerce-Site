// S19 · PR 392 — Telegram alerts: the mock until the bot is connected; the live client against a stand-in Bot API; the
// token (part of the address) never in an answer; the Test reads the bot and the chat and sends nothing.
import { describe, expect, it } from 'vitest';
import {
  createTelegramClient,
  findConnection,
  mockTelegramOutbox,
  sendOwnerAlert,
  telegramAdapter,
  telegramConfig,
  TELEGRAM_MAX_TEXT,
  type TelegramSender,
} from '../src';

const TOKEN = '1234567:BBHdqTcvCH1vGWJxfSeofSAs0K5PALDsawZ';

function fakeBotApi(opts: { refuse?: string; chatTitle?: string } = {}) {
  const calls: { method: string; body: Record<string, unknown>; url: string }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = u.split('/').pop()!;
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ method, body, url: u });
    if (opts.refuse) return new Response(JSON.stringify({ ok: false, description: `${opts.refuse} for bot${TOKEN}` }), { status: 401 });
    const result = method === 'getMe' ? { username: 'extas_alerts_bot' } : method === 'getChat' ? { title: opts.chatTitle ?? 'EXTAS alerts' } : { message_id: 77 };
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}

describe('Telegram adapter (PR 392)', () => {
  it('is a Keys & connections row with the bot token as its only key', () => {
    const row = findConnection('telegram')!;
    expect(row.adapter).toBe(true);
    expect(row.secrets.map((s) => s.field)).toEqual(['botToken']);
    expect(row.config.map((c) => c.field)).toEqual(['chatId', 'baseUrl']);
    expect(telegramAdapter.secrets).toEqual(['botToken']);
  });

  it('accepts a numeric chat id, a channel id and @name; refuses anything else', () => {
    for (const ok of ['123456', '-1001234567890', '@extas_alerts']) expect(telegramConfig.safeParse({ chatId: ok }).success, ok).toBe(true);
    for (const bad of ['', 'hello world', '12a', '@ab', 'https://t.me/x']) expect(telegramConfig.safeParse({ chatId: bad }).success, bad).toBe(false);
    expect(telegramConfig.safeParse({ chatId: '1', baseUrl: 'http://insecure.example' }).success).toBe(false);
  });

  it('the mock sends nothing anywhere and keeps the alert in this process', async () => {
    mockTelegramOutbox.clear();
    const api = await telegramAdapter.mock({ mode: 'MOCK', config: { chatId: '1' }, storeId: null, secret: async () => null });
    expect(await api.send('ডিস্ক ভরে গেছে')).toEqual({ ok: true, messageId: null });
    expect(mockTelegramOutbox.all().map((m) => m.text)).toEqual(['ডিস্ক ভরে গেছে']);
    expect(await telegramAdapter.test(api, { mode: 'MOCK', config: { chatId: '1' }, storeId: null, secret: async () => null })).toMatchObject({ ok: true });
  });

  it('live: sends to the chat, cut to Telegram’s limit, no link previews', async () => {
    const { f, calls } = fakeBotApi();
    const c = createTelegramClient({ baseUrl: 'https://bot.test', token: TOKEN, chatId: '-1001', fetch: f });
    expect(await c.send('x'.repeat(TELEGRAM_MAX_TEXT + 50))).toEqual({ ok: true, messageId: 77 });
    expect(calls[0]!.url).toBe(`https://bot.test/bot${TOKEN}/sendMessage`);
    expect(calls[0]!.body).toMatchObject({ chat_id: '-1001', disable_web_page_preview: true });
    expect(String(calls[0]!.body.text)).toHaveLength(TELEGRAM_MAX_TEXT);
  });

  it('the Test reads the bot and the chat and sends no message', async () => {
    const { f, calls } = fakeBotApi({ chatTitle: 'Owner' });
    const c = createTelegramClient({ baseUrl: 'https://bot.test', token: TOKEN, chatId: '42', fetch: f });
    expect(await telegramAdapter.test(c, { mode: 'LIVE', config: { chatId: '42' }, storeId: null, secret: async () => TOKEN })).toEqual({
      ok: true,
      message: 'Telegram: @extas_alerts_bot can write to Owner',
    });
    expect(calls.map((x) => x.method)).toEqual(['getMe', 'getChat']);
  });

  it('a refusal says why, and the token never appears in what comes back', async () => {
    const { f } = fakeBotApi({ refuse: 'Unauthorized' });
    const c = createTelegramClient({ baseUrl: 'https://bot.test', token: TOKEN, chatId: '42', fetch: f });
    const sent = await c.send('hi');
    expect(sent.ok).toBe(false);
    expect(JSON.stringify(sent)).not.toContain(TOKEN.split(':')[1]);
    const t = await telegramAdapter.test(c, { mode: 'LIVE', config: { chatId: '42' }, storeId: null, secret: async () => TOKEN });
    expect(t.ok).toBe(false);
    expect(t.message).toMatch(/^Telegram refused \(401\): Unauthorized/);
    expect(t.message).not.toContain(TOKEN.split(':')[1]);
  });

  it('a network failure never names the address (which holds the token)', async () => {
    const f = (async () => {
      throw new TypeError(`fetch failed https://bot.test/bot${TOKEN}/sendMessage`);
    }) as typeof fetch;
    const c = createTelegramClient({ baseUrl: 'https://bot.test', token: TOKEN, chatId: '42', fetch: f });
    expect(await c.send('hi')).toEqual({ ok: false, error: 'Telegram did not answer' });
  });

  it('a token that is not one from @BotFather is refused before anything is sent', () => {
    expect(() => createTelegramClient({ baseUrl: 'https://bot.test', token: 'abc', chatId: '1' })).toThrow(/does not look like one/);
  });

  it('sendOwnerAlert never throws: an alert that cannot go out says so', async () => {
    const broken = { use: async () => { throw new Error('no TELEGRAM connection'); } };
    expect(await sendOwnerAlert(broken as never, 'x')).toEqual({ ok: false, error: 'no TELEGRAM connection', mode: 'MOCK' });
    mockTelegramOutbox.clear();
    const api: TelegramSender = await telegramAdapter.mock({ mode: 'MOCK', config: { chatId: '1' }, storeId: null, secret: async () => null });
    const link = { use: async () => ({ api, mode: 'MOCK' }) };
    expect(await sendOwnerAlert(link as never, 'ব্যাকআপ ঠিক আছে')).toEqual({ ok: true, messageId: null, mode: 'MOCK' });
  });
});
