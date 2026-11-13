// S28 · PR 703 — Telegram approvals on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL), with a stand-in bot:
// off as shipped (a request waits in the ERP list, nothing goes out); the owner turns it on with the PIN; a refund and a big
// COD order go out with buttons, a small COD order does not; the webhook is a 404 for a wrong secret and ignores another chat;
// a tap asks for the PIN, the typed PIN is deleted and checked, a wrong one is counted and told, the right one decides once;
// a number nobody asked for is deleted and never checked; late buttons send the owner to the ERP; too many wrong PINs lock
// Telegram until the owner unlocks it with the PIN; the ERP can decide too. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TelegramLink, TelegramSender } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, setOwnerPin, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { requestApproval, telegramApprovalsRoute, telegramWebhook } from './telegram-approvals';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PIN = '4821';
const SECRET = 'a'.repeat(64);

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.78' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

function bot() {
  const log = { sent: [] as string[], buttons: [] as { text: string; rows: unknown }[], deleted: [] as number[], answers: [] as string[] };
  const api: TelegramSender = {
    provider: 'telegram',
    chatId: '42',
    send: async (text) => (log.sent.push(text), { ok: true, messageId: 1 }),
    sendWithButtons: async (text, rows) => (log.buttons.push({ text, rows }), { ok: true, messageId: 500 + log.buttons.length }),
    deleteMessage: async (id) => (log.deleted.push(id), true),
    answerCallback: async (_id, text) => void log.answers.push(text ?? ''),
    webhookSecret: () => SECRET,
  };
  const link: TelegramLink = { use: (async () => ({ api, mode: 'LIVE' })) as TelegramLink['use'] };
  return { log, link };
}

describe.skipIf(!HAS_TEST_DB)('Telegram approvals on PostgreSQL (PR 703)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  const b = bot();
  const route = async (method: string, path: string[], body?: unknown) => {
    const res = await telegramApprovalsRoute(call(method, `/api/admin/telegram-approvals${path.length ? `/${path.join('/')}` : ''}?storeId=${A}`, { body, cookie: owner }), deps, path, b.link);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const hook = async (update: unknown, secret = SECRET) => telegramWebhook(call('POST', `/api/telegram/webhook/${secret}`, { body: update }), deps, secret, b.link, A);
  const tap = (data: string, chat = 42) => ({ callback_query: { id: 'cb', data, message: { chat: { id: chat } } } });
  const say = (text: string, chat = 42, id = 900) => ({ message: { message_id: id, text, chat: { id: chat } } });
  const ask = (over: Record<string, unknown> = {}) => requestApproval(deps, A, { kind: 'refund', source: 'test', title: 'Refund of order #1042', amountMinor: 450000, ...over }, b.link);
  const row = (id: string) => t.prisma.approvalRequest.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('tgappr');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const ownerRow = await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    await setOwnerPin(t.prisma, { staffUserId: ownerRow.id }, { password: OWNER_PW, pin: PIN }, { minLength: 4, maxLength: 12, maxAttempts: 9, lockMinutes: 15 }, new Date());
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('is off as shipped: the request waits in the ERP list and nothing goes to Telegram', async () => {
    const r = await ask();
    expect(r).toMatchObject({ ok: true, sent: false });
    expect(b.log.buttons).toHaveLength(0);
    const v = await route('GET', []);
    expect(v.body.cfg.enabled).toBe(false);
    expect(v.body.pending).toHaveLength(1);
    expect(v.body.isOwner).toBe(true);
  });

  it('the owner turns it on with the PIN; a refund and a big COD order go out with buttons, a small COD does not', async () => {
    const set = { enabled: true, refund: true, price: true, cod: true, codOverMinor: 800000, waitMinutes: 30 };
    expect((await route('POST', ['settings'], { ...set, pin: '0000' })).body.error).toBe('WRONG_PIN');
    expect((await route('POST', ['settings'], { ...set, pin: PIN })).status).toBe(200);
    const a = await ask();
    expect(a).toMatchObject({ ok: true, sent: true });
    expect(b.log.buttons[0]!.text).toContain('Refund of order #1042');
    expect(JSON.stringify(b.log.buttons[0]!.rows)).toContain(`a:${(a as any).row.id}`);
    expect(await ask({ kind: 'cod', title: 'COD #1', amountMinor: 700000 })).toMatchObject({ sent: false });
    expect(await ask({ kind: 'cod', title: 'COD #2', amountMinor: 950000 })).toMatchObject({ sent: true });
    expect(await ask({ kind: 'bogus' })).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('the webhook: a wrong secret is a 404, another chat is ignored', async () => {
    expect((await hook({}, 'b'.repeat(64))).status).toBe(404);
    const r = (await t.prisma.approvalRequest.findFirstOrThrow({ where: { status: 'PENDING', askedAt: { not: null } } })).id;
    expect((await hook(tap(`a:${r}`, 7))).status).toBe(200);
    expect((await row(r)).intent).toBeNull();
    expect(b.log.answers).toHaveLength(0);
  });

  it('a tap asks for the PIN; a wrong PIN is deleted, counted and told; the right one decides once', async () => {
    const r = (await t.prisma.approvalRequest.findFirstOrThrow({ where: { status: 'PENDING', askedAt: { not: null }, kind: 'refund' } })).id;
    await hook(tap(`a:${r}`));
    expect((await row(r)).intent).toBe('APPROVE');
    expect(b.log.answers.at(-1)).toBe('PIN লিখুন');
    await hook(say('0000', 42, 901));
    expect(b.log.deleted).toContain(901);
    expect((await row(r)).status).toBe('PENDING');
    expect(await t.prisma.auditLog.count({ where: { action: 'telegram.approval.wrongPin' } })).toBe(1);
    await hook(say(PIN, 42, 902));
    expect(b.log.deleted).toContain(902);
    expect(await row(r)).toMatchObject({ status: 'APPROVED', decidedVia: 'TELEGRAM', intent: null });
    expect(await t.prisma.auditLog.count({ where: { action: 'approval.approve' } })).toBe(1);
    await hook(tap(`r:${r}`));
    expect(b.log.answers.at(-1)).toContain('আগেই');
    expect((await row(r)).status).toBe('APPROVED');
  });

  it('a number nobody asked for is deleted and never checked; late buttons send the owner to the ERP', async () => {
    const wrongBefore = await t.prisma.auditLog.count({ where: { action: 'telegram.approval.wrongPin' } });
    await hook(say('123456', 42, 903));
    expect(b.log.deleted).toContain(903);
    expect(await t.prisma.auditLog.count({ where: { action: 'telegram.approval.wrongPin' } })).toBe(wrongBefore);
    const r = (await t.prisma.approvalRequest.findFirstOrThrow({ where: { status: 'PENDING', askedAt: { not: null } } })).id;
    await t.prisma.approvalRequest.update({ where: { id: r }, data: { askedAt: new Date(Date.now() - 3 * 3600_000) } });
    await hook(tap(`r:${r}`));
    expect(b.log.answers.at(-1)).toContain('ERP');
    expect((await row(r)).intent).toBeNull();
  });

  it('too many wrong PINs lock Telegram until the owner unlocks it with the PIN; the ERP can decide too', async () => {
    await deps.resolver.set('telegram.approvals', { enabled: true, refund: true, price: true, cod: true, codOverMinor: 800000, waitMinutes: 30, pinAlarmPerDay: 3, pinLockPerDay: 4, lockedAt: null }, storeTarget(A), { actorId: null, reason: 'test' });
    const fresh = (await ask({ title: 'Refund #2' })) as any;
    const r = fresh.row.id as string;
    await hook(tap(`r:${r}`));
    await hook(say('1111', 42, 910)); // 2nd wrong today (1 before)
    await hook(say('2222', 42, 911)); // 3rd: alarm
    expect(b.log.sent.at(-1)).toContain('3');
    await hook(say('3333', 42, 912)); // 4th: lock
    expect((await route('GET', [])).body.cfg.lockedAt).not.toBeNull();
    expect(b.log.sent.at(-1)).toContain('Telegram');
    await hook(say(PIN, 42, 913));
    expect((await row(r)).status).toBe('PENDING'); // locked: not even the right PIN decides
    expect(b.log.deleted).toContain(913);
    expect((await route('POST', ['unlock'], { pin: '0000' })).body.error).toBe('WRONG_PIN');
    expect((await route('POST', ['unlock'], { pin: PIN })).status).toBe(200);
    expect((await route('GET', [])).body.cfg.lockedAt).toBeNull();
    expect((await route('GET', [])).body.wrongPinsToday).toBe(0);
    // decide in the ERP: needs the PIN, once
    expect((await route('POST', ['decide', r], { decision: 'reject', pin: '0000' })).body.error).toBe('WRONG_PIN');
    expect((await route('POST', ['decide', r], { decision: 'reject', pin: PIN })).status).toBe(200);
    expect(await row(r)).toMatchObject({ status: 'REJECTED', decidedVia: 'ADMIN' });
    expect((await route('POST', ['decide', r], { decision: 'approve', pin: PIN })).body.error).toBe('ALREADY_DECIDED');
  });
});
