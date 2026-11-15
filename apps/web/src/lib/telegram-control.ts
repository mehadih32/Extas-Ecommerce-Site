// PR 817 (prototype v5 m-settings.js `renderTelegram`) — Settings › Telegram control, the half above "Urgent approvals": the daily business
// report (on/off, the time, also by e-mail, the weekly deeper audit on Sunday, a preview), the five alert switches (the big-order line
// is a number the owner types), the allowed Telegram accounts (a phone is added with a one-time pairing code and removed with the
// PIN), the commands the bot knows and "Send test message". Words: messages/admin-telegram-control.*.json.
//   - Where it lives: the report switch and the e-mail tick are the digest's own settings (`reports.digest.telegramOn` / `emailOn`);
//     the time, the weekly audit, the alerts, the big-order line and the accounts are `telegram.control` (registry-parity-e2.ts).
//   - Only the owner changes any of it (the page is owner only). Adding a phone and removing one need the owner's PIN: they decide
//     who may talk to the bot. The pairing code is six digits, kept only as a hash, good for `PAIR_MINUTES` minutes, used once; the
//     bot takes it from a chat that is not yet allowed and adds that chat (webhook, lib/telegram-approvals.ts). The PIN is never
//     stored. Everything is audited. Nothing here moves money or sends anything to a customer; the test message goes to the owner's
//     own chat (the mock while the bot is not connected).
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { audit, isOwner, type Actor, type RequestContext } from '@extas/auth';
import { createConnections, telegramAdapters, type TelegramLink, type TelegramSender } from '@extas/adapters';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { kpi, lastDays } from '@extas/metrics';
import { INSTALLATION, storeTarget, TELEGRAM_ACCOUNTS_MAX, TELEGRAM_ALERTS, telegramControlSchema, type TelegramControlSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { requireOwnerPin } from './owner-pin';

/** How long a pairing code works (minutes). The prototype says "within 10 minutes". */
export const PAIR_MINUTES = 10; // hardcode-ok: the prototype's own wording; a code lives only this long
const PAIR_DIGITS = 6; // hardcode-ok: the code's length
const MINUTE = 60_000; // hardcode-ok: ms in a minute
/** The role a paired phone starts with; the owner's own chat shows as Owner. */
export const PAIRED_ROLE = 'Staff'; // hardcode-ok: a label, not a business rule

export const hashCode = (code: string): string => createHash('sha256').update(`telegram-pair:${code}`).digest('hex');

/** Is `code` the pairing code kept as `hash`, still good at `now`? Constant-time compare. */
export function pairMatches(cfg: Pick<TelegramControlSettings, 'pairHash' | 'pairUntil'>, code: string, now: Date): boolean {
  if (!cfg.pairHash || !cfg.pairUntil || !new RegExp(`^\\d{${PAIR_DIGITS}}$`).test(code)) return false;
  if (new Date(cfg.pairUntil).getTime() < now.getTime()) return false;
  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(cfg.pairHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A new account list with `acc` added (a chat already on the list is not added twice; the list has a top). */
export function withAccount(list: TelegramControlSettings['accounts'], acc: { id: string; who: string; role: string }): TelegramControlSettings['accounts'] {
  if (list.some((x) => x.id === acc.id)) return list;
  return [...list, acc].slice(0, TELEGRAM_ACCOUNTS_MAX);
}

export class ControlError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: string[] = [],
  ) {
    super(code);
  }
}

const controlInput = z
  .object({
    reportOn: z.boolean().optional(),
    emailOn: z.boolean().optional(),
    reportTime: telegramControlSchema.shape.reportTime.optional(),
    weeklyAudit: z.boolean().optional(),
    alerts: z.object(Object.fromEntries(TELEGRAM_ALERTS.map((a) => [a, z.boolean().optional()]))).strict().optional(),
    bigOrderOverMinor: telegramControlSchema.shape.bigOrderOverMinor.optional(),
  })
  .strict();
export type ControlChange = z.output<typeof controlInput>;

/** Reads the changes out of a request body (any of the fields, at least one). */
export function parseControl(input: unknown): ControlChange {
  const r = controlInput.safeParse(input);
  if (!r.success) throw new ControlError(400, 'INVALID_INPUT', r.error.issues.map((i) => i.path.join('.')));
  if (!Object.keys(r.data).length) throw new ControlError(400, 'INVALID_INPUT', ['body']);
  return r.data;
}

export interface ControlView {
  isOwner: boolean;
  mode: string;
  reportOn: boolean;
  emailOn: boolean;
  reportTime: string;
  weeklyAudit: boolean;
  alerts: Record<(typeof TELEGRAM_ALERTS)[number], boolean>;
  bigOrderOverMinor: number;
  /** The owner's own chat (the bot's configured chat), when the bot is connected. */
  ownerChat: string | null;
  accounts: { id: string; who: string; role: string }[];
  /** A pairing code is waiting (its hash is never sent to the page), and until when. */
  pairUntil: string | null;
}

type Deps = Pick<AdminDeps, 'db' | 'resolver' | 'vault' | 'now'>;

async function linkOf(deps: Deps): Promise<TelegramLink> {
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

export async function controlView(deps: Deps, actor: Actor, storeId: number, link?: TelegramLink): Promise<ControlView> {
  const now = deps.now ? deps.now() : new Date();
  const [c, reportOn, emailOn, owner, s] = await Promise.all([
    deps.resolver.value('telegram.control'),
    deps.resolver.value('reports.digest.telegramOn', { storeId }),
    deps.resolver.value('reports.digest.emailOn', { storeId }),
    actor.staffUserId ? isOwner(deps.db, actor.staffUserId) : Promise.resolve(false),
    senderOf(link ?? (await linkOf(deps))),
  ]);
  return {
    isOwner: owner,
    mode: s?.mode ?? 'MOCK',
    reportOn,
    emailOn,
    reportTime: c.reportTime,
    weeklyAudit: c.weeklyAudit,
    alerts: c.alerts,
    bigOrderOverMinor: c.bigOrderOverMinor,
    ownerChat: s?.api.chatId ?? null,
    accounts: c.accounts,
    pairUntil: c.pairHash && c.pairUntil && new Date(c.pairUntil).getTime() >= now.getTime() ? c.pairUntil : null,
  };
}

async function needOwner(deps: Deps, actor: Actor): Promise<string> {
  if (!actor.staffUserId || !(await isOwner(deps.db, actor.staffUserId))) throw new ControlError(403, 'OWNER_ONLY');
  return actor.staffUserId;
}

/** Saves one or more of the report and alert choices (owner; no PIN: it only says what reaches the owner's own Telegram). */
export async function controlSave(deps: Deps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<void> {
  const owner = await needOwner(deps, actor);
  const ch = parseControl(raw);
  const reason = 'Settings › Telegram control';
  if (ch.reportOn !== undefined) await deps.resolver.set('reports.digest.telegramOn', ch.reportOn, storeTarget(storeId), { actorId: owner, reason });
  if (ch.emailOn !== undefined) await deps.resolver.set('reports.digest.emailOn', ch.emailOn, storeTarget(storeId), { actorId: owner, reason });
  if (ch.reportTime !== undefined || ch.weeklyAudit !== undefined || ch.alerts !== undefined || ch.bigOrderOverMinor !== undefined) {
    const before = await deps.resolver.value('telegram.control');
    const next: TelegramControlSettings = {
      ...before,
      ...(ch.reportTime !== undefined ? { reportTime: ch.reportTime } : {}),
      ...(ch.weeklyAudit !== undefined ? { weeklyAudit: ch.weeklyAudit } : {}),
      ...(ch.bigOrderOverMinor !== undefined ? { bigOrderOverMinor: ch.bigOrderOverMinor } : {}),
      alerts: { ...before.alerts, ...(ch.alerts ?? {}) },
    };
    await deps.resolver.set('telegram.control', next, INSTALLATION, { actorId: owner, reason });
  }
  await audit(deps.db, actor, { action: 'telegram.control.save', entityType: 'Setting', entityId: 'telegram.control', before: null, after: ch, storeId }, ctx);
}

/** Makes a pairing code (owner, PIN). The code is returned once; only its hash is kept. */
export async function pairStart(deps: Deps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<{ code: string; until: string }> {
  const owner = await needOwner(deps, actor);
  const p = z.object({ pin: z.string() }).strict().safeParse(raw);
  if (!p.success) throw new ControlError(400, 'INVALID_INPUT', ['pin']);
  await requireOwnerPin(deps, actor, ctx, p.data.pin, 'telegram.pair', storeId);
  const now = deps.now ? deps.now() : new Date();
  const code = String(randomInt(10 ** (PAIR_DIGITS - 1), 10 ** PAIR_DIGITS));
  const until = new Date(now.getTime() + PAIR_MINUTES * MINUTE).toISOString();
  const before = await deps.resolver.value('telegram.control');
  await deps.resolver.set('telegram.control', { ...before, pairHash: hashCode(code), pairUntil: until }, INSTALLATION, { actorId: owner, reason: 'Settings › Telegram control: pairing code made' });
  await audit(deps.db, actor, { action: 'telegram.control.pair', entityType: 'Setting', entityId: 'telegram.control', before: null, after: { until }, storeId }, ctx);
  return { code, until };
}

/** Takes a phone off the list (owner, PIN). A removed chat can no longer use the bot; nothing is deleted from the chat itself. */
export async function accountRemove(deps: Deps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<void> {
  const owner = await needOwner(deps, actor);
  const p = z.object({ id: telegramControlSchema.shape.accounts.element.shape.id, pin: z.string() }).strict().safeParse(raw);
  if (!p.success) throw new ControlError(400, 'INVALID_INPUT', p.error.issues.map((i) => i.path.join('.')));
  await requireOwnerPin(deps, actor, ctx, p.data.pin, 'telegram.account.remove', storeId);
  const before = await deps.resolver.value('telegram.control');
  const gone = before.accounts.find((a) => a.id === p.data.id);
  if (!gone) throw new ControlError(404, 'NOT_FOUND');
  await deps.resolver.set('telegram.control', { ...before, accounts: before.accounts.filter((a) => a.id !== p.data.id) }, INSTALLATION, { actorId: owner, reason: 'Settings › Telegram control: account removed' });
  await audit(deps.db, actor, { action: 'telegram.control.accountRemove', entityType: 'Setting', entityId: 'telegram.control', before: { id: gone.id, who: gone.who }, after: null, storeId }, ctx);
}

/**
 * The bot took a pairing code from a chat that is not on the list yet: when it is the live code, the chat is added and the
 * code is used up. True when added. Called by the webhook (lib/telegram-approvals.ts); no staff session, so no PIN here: the PIN
 * was asked when the owner made the code.
 */
export async function pairFromChat(deps: Deps, chat: { id: string; who: string }, code: string, now: Date): Promise<boolean> {
  const before = await deps.resolver.value('telegram.control');
  if (!pairMatches(before, code, now)) return false;
  const accounts = withAccount(before.accounts, { id: chat.id, who: chat.who.slice(0, 80) || chat.id, role: PAIRED_ROLE });
  await deps.resolver.set('telegram.control', { ...before, accounts, pairHash: null, pairUntil: null }, INSTALLATION, { actorId: null, reason: 'Telegram: a phone paired with the code' });
  return true;
}

/** "Send test message": one plain line to the owner's own chat (the mock while the bot is not connected). */
export async function sendTest(deps: Deps, actor: Actor, ctx: RequestContext, storeId: number, text: string, link?: TelegramLink): Promise<{ mode: string; sent: boolean }> {
  await needOwner(deps, actor);
  const s = await senderOf(link ?? (await linkOf(deps)));
  if (!s) return { mode: 'MOCK', sent: false };
  const r = await s.api.send(text);
  await audit(deps.db, actor, { action: 'telegram.control.test', entityType: 'Setting', entityId: 'telegram.control', before: null, after: { mode: s.mode, ok: r.ok }, storeId }, ctx);
  return { mode: s.mode, sent: r.ok };
}

export interface ReportPreview {
  date: string;
  time: string;
  orders: number;
  salesMinor: number;
  orderedMinor: number;
  waiting: number;
}

/** Tonight's report as it stands now, from the same figures the Dashboard reads (never an AI guess). */
export async function reportPreview(deps: Deps, storeId: number): Promise<ReportPreview> {
  const now = deps.now ? deps.now() : new Date();
  const tz = await deps.resolver.value('store.timeZone', { storeId });
  const today = lastDays(1, now, tz);
  const [k, c, waiting] = await Promise.all([kpi(deps.db, storeId, today.period), deps.resolver.value('telegram.control'), deps.db.order.count({ where: { storeId, status: { in: ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING'] } } }).catch(() => 0)]);
  return { date: today.to, time: c.reportTime, orders: k.ordered.orders, salesMinor: k.sales.itemsMinor, orderedMinor: k.ordered.valueMinor, waiting };
}

/** GET preview (settings.write) · POST save · POST pair · POST remove · POST test. The page reads the view itself. */
export async function telegramControlRoute(request: Request, deps: AdminDeps | null, path: string[], link?: TelegramLink): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a] = path;
  try {
    const g = await guardAdmin(request, deps, { permission: 'settings.write', storeId: MOTHER_STORE_ID });
    if (g instanceof Response) return g;
    if (m === 'GET' && a === 'preview' && path.length === 1) return json({ ok: true, ...(await reportPreview(deps!, MOTHER_STORE_ID)) });
    if (m !== 'POST') return fail(405, 'method-not-allowed');
    if (a === 'save' && path.length === 1) {
      await controlSave(deps!, g.actor, g.ctx, MOTHER_STORE_ID, await body(request));
      return json({ ok: true });
    }
    if (a === 'pair' && path.length === 1) return json({ ok: true, ...(await pairStart(deps!, g.actor, g.ctx, MOTHER_STORE_ID, await body(request))) });
    if (a === 'remove' && path.length === 1) {
      await accountRemove(deps!, g.actor, g.ctx, MOTHER_STORE_ID, await body(request));
      return json({ ok: true });
    }
    if (a === 'test' && path.length === 1) {
      const b = await body(request);
      const text = typeof b.text === 'string' && b.text.trim() ? b.text.trim().slice(0, 500) : 'EXTAS · test'; // hardcode-ok: a test line, the page sends its own words
      return json({ ok: true, ...(await sendTest(deps!, g.actor, g.ctx, MOTHER_STORE_ID, text, link)) });
    }
    return fail(404, 'not-found');
  } catch (e) {
    if (e instanceof ControlError) return fail(e.status, e.code, e.details.length ? e.details : undefined);
    return errorResponse(e);
  }
}
