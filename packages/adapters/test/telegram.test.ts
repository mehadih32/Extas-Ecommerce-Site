// S19 · PR 392 — Telegram alerts: the mock until the bot is connected; the live client against a stand-in Bot API; the
// token (part of the address) never in an answer; the Test reads the bot and the chat and sends nothing.
// S15 · PR 584 adds the agents' identity line, the Approve/Reject/Ask-why keyboard and its callback parsing, and the
// inbound update parser — covered below, pure and provider-neutral (the fixed agent catalogue and the actual routing
// decision are `apps/web`'s own `lib/admin-ai/telegram-routing.ts`, tested there).
import { describe, expect, it } from 'vitest';
import {
  approvalKeyboard,
  createTelegramClient,
  findConnection,
  mockTelegramOutbox,
  mockTelegramSender,
  parseApprovalCallback,
  parseTelegramUpdate,
  sendAsAgent,
  sendOwnerAlert,
  telegramAdapter,
  telegramConfig,
  telegramIdentityLine,
  telegramWebhookSecret,
  TELEGRAM_MAX_TEXT,
  TELEGRAM_SECRET_HEADER,
  type TelegramSender,
} from '../src';

const TOKEN = '1234567:BBHdqTcvCH1vGWJxfSeofSAs0K5PALDsawZ';
const AGENT = { key: 'gyani', code: 'A360-01', tag: 'gyani', emoji: '🧠', nameEn: 'Gyani', nameBn: 'জ্ঞানী', isChief: true } as const;

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
  it('is a Keys & connections row with the bot token and the optional webhook secret (PR 584)', () => {
    const row = findConnection('telegram')!;
    expect(row.adapter).toBe(true);
    expect(row.secrets.map((s) => s.field)).toEqual(['botToken', 'webhookSecret']);
    expect(row.secrets.find((s) => s.field === 'webhookSecret')?.optional).toBe(true);
    expect(row.config.map((c) => c.field)).toEqual(['chatId', 'baseUrl']);
    expect(telegramAdapter.secrets).toEqual(['botToken', 'webhookSecret']);
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

  // S28 · PR 703 — the approvals' parts of the client.
  it('live: buttons go out as an inline keyboard, a message is deleted, a tap is answered, the webhook is set', async () => {
    const { f, calls } = fakeBotApi();
    const c = createTelegramClient({ baseUrl: 'https://bot.test', token: TOKEN, chatId: '42', fetch: f });
    expect(await c.sendWithButtons!('OK?', [[{ text: 'Approve', data: 'a:1' }, { text: 'Reject', data: 'r:1' }]])).toEqual({ ok: true, messageId: 77 });
    expect(calls[0]!.body.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Approve', callback_data: 'a:1' }, { text: 'Reject', callback_data: 'r:1' }]] });
    expect(await c.deleteMessage!(9)).toBe(true);
    await c.answerCallback!('cb1', 'Type your PIN');
    expect(calls.map((x) => x.method)).toEqual(['sendMessage', 'deleteMessage', 'answerCallbackQuery']);
    expect(calls[1]!.body).toEqual({ chat_id: '42', message_id: 9 });
    expect(await c.setWebhook!('https://erp.test/api/telegram/webhook/abc')).toMatchObject({ ok: true });
    expect(c.chatId).toBe('42');
  });

  it('the webhook secret is a keyed hash of the token, never the token, and differs per token', () => {
    const a = telegramWebhookSecret(TOKEN);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain(TOKEN.split(':')[1]);
    expect(telegramWebhookSecret('7654321:CCHdqTcvCH1vGWJxfSeofSAs0K5PALDsawZ')).not.toBe(a);
    const { f } = fakeBotApi();
    expect(createTelegramClient({ baseUrl: 'https://bot.test', token: TOKEN, chatId: '42', fetch: f }).webhookSecret()).toBe(a);
  });

  it('the mock keeps a message with its buttons and has no webhook secret (nothing can reach it)', async () => {
    mockTelegramOutbox.clear();
    const api = await telegramAdapter.mock({ mode: 'MOCK', config: { chatId: '1' }, storeId: null, secret: async () => null });
    await api.sendWithButtons!('OK?', [[{ text: 'Approve', data: 'a:1' }]]);
    expect(mockTelegramOutbox.all()[0]!.buttons).toEqual([[{ text: 'Approve', data: 'a:1' }]]);
    expect(api.webhookSecret).toBeUndefined();
  });
});

describe('Telegram identity, keyboard and update parsing (PR 584)', () => {
  it('telegramIdentityLine formats emoji, both names, code and tag', () => {
    expect(telegramIdentityLine(AGENT)).toBe('🧠 Gyani জ্ঞানী · A360-01 · gyani');
  });

  it('sendAsAgent always leads with the identity line, even through the mock', async () => {
    mockTelegramOutbox.clear();
    const api = mockTelegramSender();
    const link = { use: async () => ({ api, mode: 'MOCK' }) };
    expect(await sendAsAgent(link as never, AGENT, 'Got it — assigned.')).toEqual({ ok: true, messageId: null, mode: 'MOCK' });
    expect(mockTelegramOutbox.all()[0]!.text).toBe(`${telegramIdentityLine(AGENT)}\n\nGot it — assigned.`);
  });

  it('sendAsAgent passes an approval keyboard through to the sender', async () => {
    mockTelegramOutbox.clear();
    const api = mockTelegramSender();
    const link = { use: async () => ({ api, mode: 'MOCK' }) };
    const keyboard = approvalKeyboard('appr_1', { approve: 'Approve', reject: 'Reject', askWhy: 'Ask why' });
    await sendAsAgent(link as never, AGENT, 'Needs a decision', { keyboard });
    expect(mockTelegramOutbox.all()[0]!.keyboard).toEqual(keyboard);
  });

  it('approvalKeyboard builds one row of Approve / Reject / Ask-why, each carrying the approval id', () => {
    const kb = approvalKeyboard('appr_9', { approve: 'Approve', reject: 'Reject', askWhy: 'Ask why' });
    expect(kb.inline_keyboard).toEqual([
      [
        { text: 'Approve', callback_data: 'appr:appr_9:approve' },
        { text: 'Reject', callback_data: 'appr:appr_9:reject' },
        { text: 'Ask why', callback_data: 'appr:appr_9:why' },
      ],
    ]);
  });

  it('parseApprovalCallback reads a button press back, and null for anything else', () => {
    expect(parseApprovalCallback('appr:appr_9:approve')).toEqual({ approvalId: 'appr_9', action: 'approve' });
    expect(parseApprovalCallback('appr:appr_9:why')).toEqual({ approvalId: 'appr_9', action: 'why' });
    for (const bad of [undefined, null, '', 'appr:appr_9:delete', 'not-a-callback', 'appr::approve']) expect(parseApprovalCallback(bad)).toBeNull();
  });

  it('TELEGRAM_SECRET_HEADER is the header Telegram carries its setWebhook secret_token back on', () => {
    expect(TELEGRAM_SECRET_HEADER).toBe('x-telegram-bot-api-secret-token');
  });

  it('parseTelegramUpdate accepts a message update and a callback_query update, and null for anything unshaped', () => {
    const msg = { update_id: 1, message: { message_id: 2, chat: { id: 42 }, text: '@gyani check orders' } };
    expect(parseTelegramUpdate(msg)).toEqual(msg);
    const cb = { update_id: 2, callback_query: { id: 'cb1', data: 'appr:appr_9:approve', message: { chat: { id: 42 } } } };
    expect(parseTelegramUpdate(cb)).toEqual(cb);
    for (const bad of [null, undefined, 'x', 42, {}, { message: {} }]) expect(parseTelegramUpdate(bad)).toBeNull();
  });
});
