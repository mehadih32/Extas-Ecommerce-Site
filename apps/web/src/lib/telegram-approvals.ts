// S28 · PR 703 (admin prototype v5, GAP-MAP part 3 X6 / N12; part 1 R-16) — urgent approvals on Telegram.
//   - A screen that needs the owner's OK calls `requestApproval` (a prepaid refund, a price change, a big COD order). The
//     request is saved (PENDING) and, when `telegram.approvals` is on, that kind is asked for and the amount is over the
//     "big COD" line, it goes to the owner's chat with Approve and Reject buttons. With the setting off the request still
//     waits in the ERP list, nothing goes out.
//   - Telegram side: the webhook (`/api/telegram/webhook/<secret>`, the secret is a keyed hash of the bot token, checked
//     in constant time; the mock has none, so nothing is accepted in mock mode) takes a tap on a button (the buttons stay
//     live `waitMinutes`; after that the request waits in the ERP) and says "type your PIN"; the next digits-only message
//     in the configured chat is the PIN: it is deleted at once, checked as the owner's PIN (the same check as every
//     money action) and only then the decision is saved. A 4-12 digit message nobody asked for is deleted and never
//     checked. Only the configured chat is heard.
//   - Wrong PINs asked for: from the `pinAlarmPerDay`-th in a day the owner is told; at the `pinLockPerDay`-th Telegram
//     approvals stop (`lockedAt`) until the owner unlocks them in the ERP with the PIN.
//   - Deciding only records the decision (status, who, how, when, audit): the screen that asked acts on it. The AI never
//     decides; nothing is deleted.
import { z } from 'zod';
import { audit, AuthError, isOwner, OWNER_ROLE_KEY, type Actor, type RequestContext } from '@extas/auth';
import { createConnections, telegramAdapters, type TelegramLink, type TelegramSender } from '@extas/adapters';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { storeTarget, type TelegramApprovalsSettings } from '@extas/settings';
import { timingSafeEqual } from 'node:crypto';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { requireOwnerPin } from './owner-pin';

type Db = PrismaClient;

export const APPROVAL_KINDS = ['refund', 'price', 'cod', 'other'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

/** The PIN a person types in the chat: digits only (never longer than a PIN can be). */
const PIN_TEXT = /^\d{4,12}$/;
/** How long a tapped button waits for its PIN. */
const INTENT_WAIT_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

/* ---------- pure ---------- */

/** Whether this request goes to Telegram now: on, not locked, the kind asked, and (COD) over the line. */
export function asksTelegram(cfg: TelegramApprovalsSettings, kind: ApprovalKind, amountMinor: number | null): boolean {
  if (!cfg.enabled || cfg.lockedAt) return false;
  if (kind === 'refund') return cfg.refund;
  if (kind === 'price') return cfg.price;
  if (kind === 'cod') return cfg.cod && amountMinor !== null && amountMinor > cfg.codOverMinor;
  return false;
}

/** Whether Telegram's buttons for a request asked at `askedAt` are still live. */
export const buttonsLive = (askedAt: Date | null, now: Date, waitMinutes: number): boolean => !!askedAt && now.getTime() - askedAt.getTime() <= waitMinutes * 60_000;

/** The plain line for the chat (no phone, no address: only what the owner needs to decide). */
export function approvalText(r: { kind: string; title: string; detail: string | null; amountMinor: number | null }, words: { heading: string; amount: (minor: number) => string }): string {
  return [`${words.heading}`, r.title, ...(r.amountMinor !== null ? [words.amount(r.amountMinor)] : []), ...(r.detail ? [r.detail] : [])].join('\n');
}

/** A constant-time compare of the address's secret with the real one. */
export function secretMatches(given: string, real: string | undefined): boolean {
  if (!real || given.length !== real.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(real));
}

/* ---------- the connection ---------- */

async function linkOf(deps: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>): Promise<TelegramLink> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  return createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: telegramAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 }) as unknown as TelegramLink;
}

async function senderOf(link: TelegramLink): Promise<{ api: TelegramSender; mode: string } | null> {
  try {
    return await link.use<TelegramSender>('TELEGRAM');
  } catch {
    return null;
  }
}

/** Words for the chat (Bengali: the owner's language). */
const WORDS = {
  heading: 'আপনার অনুমতি লাগবে',
  approve: 'অনুমোদন',
  reject: 'না',
  askPin: 'PIN লিখুন',
  late: 'এটা এখন ERP-র অনুমোদন তালিকায় অপেক্ষা করছে। সেখানে সিদ্ধান্ত নিন।',
  done: 'হয়েছে',
  wrongPin: 'PIN ঠিক নয়।',
  alarm: 'আজ {n}বার ভুল PIN দেওয়া হয়েছে।',
  locked: 'Telegram অনুমোদন বন্ধ আছে। ERP-তে PIN দিয়ে খুলুন।',
  gone: 'অনুরোধটা আর নেই বা আগেই সিদ্ধান্ত হয়ে গেছে।',
} as const;

/* ---------- requests ---------- */

export const requestInput = z
  .object({
    kind: z.enum(APPROVAL_KINDS),
    source: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    detail: z.string().trim().max(500).nullable().optional(),
    amountMinor: z.number().int().min(0).nullable().optional(),
    refType: z.string().trim().max(60).nullable().optional(),
    refId: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

export interface ApprovalRow {
  id: string;
  kind: string;
  source: string;
  title: string;
  detail: string | null;
  amountMinor: number | null;
  refType: string | null;
  refId: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedVia: string | null;
  decidedAt: string | null;
  createdAt: string;
  askedOnTelegram: boolean;
}

const rowOf = (r: { id: string; kind: string; source: string; title: string; detail: string | null; amountMinor: number | null; refType: string | null; refId: string | null; status: string; decidedVia: string | null; decidedAt: Date | null; createdAt: Date; askedAt: Date | null }): ApprovalRow => ({
  id: r.id,
  kind: r.kind,
  source: r.source,
  title: r.title,
  detail: r.detail,
  amountMinor: r.amountMinor,
  refType: r.refType,
  refId: r.refId,
  status: r.status as ApprovalRow['status'],
  decidedVia: r.decidedVia,
  decidedAt: r.decidedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  askedOnTelegram: r.askedAt !== null,
});

/**
 * Raises one approval. The caller is a server screen (price adjust, refund, COD check); it never raises one in the AI's
 * name and never waits on the answer. Returns the saved row and whether it went to Telegram.
 */
export async function requestApproval(deps: Pick<AdminDeps, 'db' | 'resolver' | 'vault' | 'now'>, storeId: number, raw: unknown, link?: TelegramLink): Promise<{ ok: true; row: ApprovalRow; sent: boolean } | { ok: false; error: string }> {
  const p = requestInput.safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT' };
  const d = p.data;
  const cfg = await deps.resolver.value('telegram.approvals', { storeId });
  const now = deps.now ? deps.now() : new Date();
  const created = await deps.db.approvalRequest.create({ data: { storeId, kind: d.kind, source: d.source, title: d.title, detail: d.detail ?? null, amountMinor: d.amountMinor ?? null, refType: d.refType ?? null, refId: d.refId ?? null } });
  let sent = false;
  if (asksTelegram(cfg, d.kind, d.amountMinor ?? null)) {
    const s = await senderOf(link ?? (await linkOf(deps)));
    if (s?.api.sendWithButtons) {
      const [currency, shop] = await Promise.all([deps.resolver.value('store.currency', { storeId }), deps.resolver.value('store.name', { storeId })]);
      const text = approvalText(created, { heading: `${shop ? `${shop} · ` : ''}${WORDS.heading}`, amount: (minor) => formatAmount(minor, currency) });
      const r = await s.api.sendWithButtons(text, [[{ text: WORDS.approve, data: `a:${created.id}` }, { text: WORDS.reject, data: `r:${created.id}` }]]);
      if (r.ok) {
        sent = true;
        await deps.db.approvalRequest.update({ where: { id: created.id }, data: { askedAt: now, telegramMessageId: r.messageId } });
      }
    }
  }
  const row = await deps.db.approvalRequest.findUniqueOrThrow({ where: { id: created.id } });
  return { ok: true, row: rowOf(row), sent };
}

const formatAmount = (minor: number, currency: string): string => `${(minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`; // hardcode-ok: minor units are hundredths for the currencies the store sells in; only the chat line

/** Wrong PINs asked for in the last day, counted from the owner's last unlock when that is newer. */
async function wrongToday(db: Db, storeId: number, now: Date): Promise<number> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const unlock = await db.auditLog.findFirst({ where: { storeId, action: 'telegram.approval.unlock', createdAt: { gte: dayAgo } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  return db.auditLog.count({ where: { storeId, action: 'telegram.approval.wrongPin', createdAt: { gt: unlock?.createdAt ?? dayAgo } } });
}

/** The owner as an actor (the one whose PIN is checked): the oldest active owner with a PIN. */
async function ownerActor(db: Db): Promise<Actor | null> {
  const o = await db.staffUser.findFirst({ where: { booksPinHash: { not: null }, status: 'ACTIVE', roleAssignments: { some: { storeId: null, revokedAt: null, role: { key: OWNER_ROLE_KEY, archivedAt: null } } } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return o ? { staffUserId: o.id } : null;
}

/** Records one decision (the PIN already checked). Only a PENDING request can be decided, once. */
async function decide(db: Db, actor: Actor, ctx: RequestContext, storeId: number, id: string, decision: 'APPROVED' | 'REJECTED', via: 'TELEGRAM' | 'ADMIN', now: Date): Promise<boolean> {
  const r = await db.approvalRequest.updateMany({ where: { id, storeId, status: 'PENDING' }, data: { status: decision, decidedAt: now, decidedVia: via, decidedById: actor.staffUserId, intent: null, intentAt: null } });
  if (r.count !== 1) return false;
  await audit(db, actor, { action: `approval.${decision === 'APPROVED' ? 'approve' : 'reject'}`, entityType: 'ApprovalRequest', entityId: id, before: { status: 'PENDING' }, after: { status: decision, via }, storeId }, ctx);
  return true;
}

export async function decideInAdmin(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, id: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = z.object({ decision: z.enum(['approve', 'reject']), pin: z.string() }).strict().safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!actor.staffUserId || !(await isOwner(deps.db, actor.staffUserId))) return { ok: false, error: 'OWNER_ONLY' };
  const exists = await deps.db.approvalRequest.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!exists) return { ok: false, error: 'NOT_FOUND' };
  if (exists.status !== 'PENDING') return { ok: false, error: 'ALREADY_DECIDED' };
  await requireOwnerPin(deps, actor, ctx, p.data.pin, 'approval.decide', storeId);
  const ok = await decide(deps.db, actor, ctx, storeId, id, p.data.decision === 'approve' ? 'APPROVED' : 'REJECTED', 'ADMIN', deps.now ? deps.now() : new Date());
  return ok ? { ok: true } : { ok: false, error: 'ALREADY_DECIDED' };
}

export async function unlockTelegram(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = z.object({ pin: z.string() }).strict().safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!actor.staffUserId || !(await isOwner(deps.db, actor.staffUserId))) return { ok: false, error: 'OWNER_ONLY' };
  await requireOwnerPin(deps, actor, ctx, p.data.pin, 'telegram.unlock', storeId);
  const cur = await deps.resolver.value('telegram.approvals', { storeId });
  await deps.resolver.set('telegram.approvals', { ...cur, lockedAt: null }, storeTarget(storeId), { actorId: actor.staffUserId, reason: 'Settings › Telegram approvals: unlock' });
  // the day's wrong-PIN count starts again from this moment (the rows stay: nothing is deleted)
  await audit(deps.db, actor, { action: 'telegram.approval.unlock', entityType: 'Setting', entityId: 'telegram.approvals', before: { lockedAt: cur.lockedAt }, after: { lockedAt: null }, storeId }, ctx);
  return { ok: true };
}

export async function saveApprovalSettings(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<{ ok: true } | { ok: false; error: string; details?: string[] }> {
  const p = z.object({ enabled: z.boolean(), refund: z.boolean(), price: z.boolean(), cod: z.boolean(), codOverMinor: z.number().int().min(0).max(100_000_000), waitMinutes: z.number().int().min(5).max(1440), pin: z.string() }).strict().safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT', details: p.error.issues.map((i) => i.path.join('.')) };
  if (!actor.staffUserId || !(await isOwner(deps.db, actor.staffUserId))) return { ok: false, error: 'OWNER_ONLY' };
  await requireOwnerPin(deps, actor, ctx, p.data.pin, 'telegram.approvals.settings', storeId);
  const before = await deps.resolver.value('telegram.approvals', { storeId });
  const { pin: _pin, ...rest } = p.data;
  void _pin;
  const next = { ...before, ...rest };
  await deps.resolver.set('telegram.approvals', next, storeTarget(storeId), { actorId: actor.staffUserId, reason: 'Settings › Telegram approvals' });
  await audit(deps.db, actor, { action: 'telegram.approval.settings', entityType: 'Setting', entityId: 'telegram.approvals', before, after: next, storeId }, ctx);
  return { ok: true };
}

export interface ApprovalsView {
  cfg: TelegramApprovalsSettings;
  mode: string;
  pending: ApprovalRow[];
  recent: ApprovalRow[];
  wrongPinsToday: number;
  isOwner: boolean;
}

export async function approvalsView(deps: AdminDeps, actor: Actor, storeId: number, link?: TelegramLink): Promise<ApprovalsView> {
  const now = deps.now ? deps.now() : new Date();
  const [cfg, rows, wrong, owner, s] = await Promise.all([
    deps.resolver.value('telegram.approvals', { storeId }),
    deps.db.approvalRequest.findMany({ where: { storeId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 60 }),
    wrongToday(deps.db, storeId, now),
    actor.staffUserId ? isOwner(deps.db, actor.staffUserId) : Promise.resolve(false),
    senderOf(link ?? (await linkOf(deps))),
  ]);
  return { cfg, mode: s?.mode ?? 'MOCK', pending: rows.filter((r) => r.status === 'PENDING').map(rowOf), recent: rows.filter((r) => r.status !== 'PENDING').slice(0, 20).map(rowOf), wrongPinsToday: wrong, isOwner: owner };
}

/** "Connect the buttons": tells Telegram where to send taps and messages (owner, PIN). */
export async function connectWebhook(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown, origin: string, link?: TelegramLink): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = z.object({ pin: z.string() }).strict().safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!actor.staffUserId || !(await isOwner(deps.db, actor.staffUserId))) return { ok: false, error: 'OWNER_ONLY' };
  await requireOwnerPin(deps, actor, ctx, p.data.pin, 'telegram.webhook', storeId);
  const s = await senderOf(link ?? (await linkOf(deps)));
  if (!s || s.mode !== 'LIVE' || !s.api.setWebhook || !s.api.webhookSecret) return { ok: false, error: 'NOT_CONNECTED' };
  const r = await s.api.setWebhook(`${origin}/api/telegram/webhook/${s.api.webhookSecret()}`);
  await audit(deps.db, actor, { action: 'telegram.approval.webhook', entityType: 'Setting', entityId: 'telegram.approvals', before: null, after: { ok: r.ok }, storeId }, ctx);
  return r.ok ? { ok: true } : { ok: false, error: 'TELEGRAM_REFUSED' };
}

/* ---------- the webhook ---------- */

interface Update {
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number | string } } };
  message?: { message_id?: number; text?: string; chat?: { id?: number | string } };
}

/**
 * POST /api/telegram/webhook/<secret>. Always answers 200 with `{ ok: true }` once the address is right (Telegram retries
 * on anything else); a wrong secret, a mock connection or no connection is a plain 404 and nothing is read.
 */
export async function telegramWebhook(request: Request, deps: AdminDeps | null, secret: string, link?: TelegramLink, storeId: number = MOTHER_STORE_ID): Promise<Response> {
  if (!deps || request.method.toUpperCase() !== 'POST') return fail(404, 'not-found');
  const s = await senderOf(link ?? (await linkOf(deps)));
  if (!s || s.mode !== 'LIVE' || !s.api.webhookSecret || !secretMatches(secret, s.api.webhookSecret())) return fail(404, 'not-found');
  let update: Update = {};
  try {
    update = (await request.json()) as Update;
  } catch {
    return json({ ok: true });
  }
  try {
    await handleUpdate(deps, s.api, update, storeId);
  } catch (e) {
    console.warn(`telegram approvals: ${(e instanceof Error ? e.message : String(e)).split('\n').filter(Boolean).slice(-1)[0] ?? 'error'}`);
  }
  return json({ ok: true });
}

const sameChat = (chat: number | string | undefined, api: TelegramSender) => chat !== undefined && !!api.chatId && String(chat) === api.chatId;

async function handleUpdate(deps: AdminDeps, api: TelegramSender, u: Update, storeId: number): Promise<void> {
  const now = deps.now ? deps.now() : new Date();
  const ctx: RequestContext = { source: 'telegram' };
  const cfg = await deps.resolver.value('telegram.approvals', { storeId });
  const say = (text: string) => api.send(text);
  const cb = u.callback_query;
  if (cb?.id && cb.data && sameChat(cb.message?.chat?.id, api)) {
    const m = /^([ar]):([0-9a-f-]{36})$/.exec(cb.data);
    if (!m || !isUuid(m[2])) return void (await api.answerCallback?.(cb.id));
    if (!cfg.enabled || cfg.lockedAt) {
      await api.answerCallback?.(cb.id, WORDS.locked);
      return;
    }
    const r = await deps.db.approvalRequest.findFirst({ where: { id: m[2], storeId } });
    if (!r || r.status !== 'PENDING') {
      await api.answerCallback?.(cb.id, WORDS.gone);
      return;
    }
    if (!buttonsLive(r.askedAt, now, cfg.waitMinutes)) {
      await api.answerCallback?.(cb.id, WORDS.late);
      return;
    }
    await deps.db.approvalRequest.update({ where: { id: r.id }, data: { intent: m[1] === 'a' ? 'APPROVE' : 'REJECT', intentAt: now } });
    await api.answerCallback?.(cb.id, WORDS.askPin);
    await say(`${WORDS.askPin}: ${r.title}`);
    return;
  }
  const msg = u.message;
  if (!msg?.text || !sameChat(msg.chat?.id, api)) return;
  const text = msg.text.trim();
  if (!PIN_TEXT.test(text)) return;
  // a number like a PIN is never left in the chat, asked for or not
  if (msg.message_id !== undefined) await api.deleteMessage?.(msg.message_id);
  if (!cfg.enabled) return;
  if (cfg.lockedAt) return void (await say(WORDS.locked));
  const open = await deps.db.approvalRequest.findFirst({ where: { storeId, status: 'PENDING', intent: { not: null }, intentAt: { gte: new Date(now.getTime() - INTENT_WAIT_MS) } }, orderBy: { intentAt: 'desc' } });
  if (!open) return; // nobody asked for a PIN: it is not checked
  const actor = await ownerActor(deps.db);
  if (!actor) return;
  try {
    await requireOwnerPin(deps, actor, ctx, text, 'approval.decide', storeId);
  } catch (e) {
    if (e instanceof AuthError && (e.code === 'WRONG_PIN' || e.code === 'PIN_LOCKED')) {
      await audit(deps.db, actor, { action: 'telegram.approval.wrongPin', entityType: 'ApprovalRequest', entityId: open.id, before: null, after: { code: e.code }, storeId }, ctx);
      const n = await wrongToday(deps.db, storeId, now);
      if (n >= cfg.pinLockPerDay) {
        await deps.resolver.set('telegram.approvals', { ...cfg, lockedAt: now.toISOString() }, storeTarget(storeId), { actorId: null, reason: 'Telegram approvals: too many wrong PINs' });
        await say(WORDS.locked);
      } else if (n >= cfg.pinAlarmPerDay) {
        await say(WORDS.alarm.replace('{n}', String(n)));
      } else await say(WORDS.wrongPin);
      return;
    }
    throw e;
  }
  const ok = await decide(deps.db, actor, ctx, storeId, open.id, open.intent === 'APPROVE' ? 'APPROVED' : 'REJECTED', 'TELEGRAM', now);
  await say(ok ? `${WORDS.done}: ${open.title}` : WORDS.gone);
}

/* ---------- route ---------- */

const STATUS: Record<string, number> = { OWNER_ONLY: 403, NOT_FOUND: 404, ALREADY_DECIDED: 409, NOT_CONNECTED: 409, TELEGRAM_REFUSED: 502, INVALID_INPUT: 422 };

/** GET '' (the page's data, `settings.read`) · POST decide/:id · POST unlock · POST settings · POST connect (owner, PIN). */
export async function telegramApprovalsRoute(request: Request, deps: AdminDeps | null, path: string[], link?: TelegramLink): Promise<Response> {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, 'invalid-store-id');
  const [a, id] = path;
  try {
    if (!a && m === 'GET') {
      const g = await guardAdmin(request, deps, { permission: 'settings.write', storeId });
      if (g instanceof Response) return g;
      return json({ ok: true, ...(await approvalsView(deps!, g.actor, storeId, link)) });
    }
    if (m !== 'POST') return fail(405, 'method-not-allowed');
    const g = await guardAdmin(request, deps, { permission: 'settings.write', storeId });
    if (g instanceof Response) return g;
    const answer = (r: { ok: true } | { ok: false; error: string; details?: string[] }) => (r.ok ? json({ ok: true }) : fail(STATUS[r.error] ?? 422, r.error, 'details' in r ? r.details : undefined));
    if (a === 'decide' && id && isUuid(id) && path.length === 2) return answer(await decideInAdmin(deps!, g.actor, g.ctx, storeId, id, await body(request)));
    if (a === 'unlock' && path.length === 1) return answer(await unlockTelegram(deps!, g.actor, g.ctx, storeId, await body(request)));
    if (a === 'settings' && path.length === 1) return answer(await saveApprovalSettings(deps!, g.actor, g.ctx, storeId, await body(request)));
    if (a === 'connect' && path.length === 1) return answer(await connectWebhook(deps!, g.actor, g.ctx, storeId, await body(request), url.origin, link));
    return fail(404, 'not-found');
  } catch (e) {
    return errorResponse(e);
  }
}
