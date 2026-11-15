// PR 815 (prototype v5 m-settings.js `renderSecurity`) — Settings › Security as the prototype draws it: the 2-step switch, failed
// sign-ins (24 h) and open sessions up top, then the sign-in history, who is signed in now (the owner can sign anyone else out) and
// the blocked addresses (the owner can block one, with the PIN, and unblock it). The numbers come from what the server already
// writes: `StaffLoginEvent` (every attempt), `StaffSession` (every open device) and the settings `security.blockedAddresses`.
//   - A block refuses the address at the same doors as the admin's address list (`addressRefused`, lib/admin-security/access.ts).
//     The owner can never block the address he is opening the page from (no one locks himself out).
//   - "Waiting" addresses are the ones the wrong-password pause holds right now (`security.loginMaxAttempts` wrong tries within
//     `security.loginLockoutMinutes`, per address): shown for information, they free themselves.
//   - Turning 2-step off needs the owner's PIN; turning it on does not. Signing a session out and unblocking need no PIN; a block does.
//   - Nothing is deleted: a session is ended (revokedAt), an unblock only takes the address off the list (the settings history keeps it).
import { z } from 'zod';
import { addressOnList, audit, isOwner, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { BLOCKED_ADDRESSES_MAX, INSTALLATION } from '@extas/settings';
import type { AppResolver } from '../settings';
import { requireOwnerPin } from '../owner-pin';
import { deviceName } from './device';

const HOUR = 3_600_000; // hardcode-ok: ms in an hour
const MINUTE = 60_000; // hardcode-ok: ms in a minute
/** The failed-sign-in window of the card ("24 h") and how many history and session rows the page lists. */
export const FAILED_WINDOW_HOURS = 24; // hardcode-ok: the card's own label says 24 h
export const HISTORY_ROWS = 20; // hardcode-ok: a page length, not a business number
export const SESSION_ROWS = 40; // hardcode-ok: a page length, not a business number

export interface BoardDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
}
export interface BoardWho {
  actor: Actor;
  ctx: RequestContext;
  /** The session the page is opened with (never signed out from here). */
  sessionId?: string;
}

export interface BoardView {
  twoFactorRequired: boolean;
  failed24: number;
  failedAddresses: number;
  sessions: { id: string; who: string; device: string; ip: string | null; since: string; me: boolean }[];
  history: { id: string; who: string | null; email: string; device: string; ip: string | null; at: string; ok: boolean; reason: string | null; blocked: boolean }[];
  blocked: { ip: string; why: string; at: string }[];
  waiting: { ip: string; until: string }[];
  maxAttempts: number;
  lockoutMinutes: number;
  isOwner: boolean;
  canEdit: boolean;
  yourIp: string | null;
}

export class BoardError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: string[] = [],
  ) {
    super(code);
  }
}

/** The addresses the wrong-password pause holds at `now`: `maxAttempts` or more wrong tries within `lockoutMinutes`. Pure. */
export function waitingAddresses(fails: readonly { ip: string | null; at: Date }[], maxAttempts: number, lockoutMinutes: number, now: Date): { ip: string; until: Date }[] {
  const from = now.getTime() - lockoutMinutes * MINUTE;
  const by = new Map<string, { n: number; last: number }>();
  for (const f of fails) {
    if (!f.ip || f.at.getTime() < from) continue;
    const c = by.get(f.ip) ?? { n: 0, last: 0 };
    c.n += 1;
    c.last = Math.max(c.last, f.at.getTime());
    by.set(f.ip, c);
  }
  return [...by.entries()].filter(([, c]) => c.n >= maxAttempts).map(([ip, c]) => ({ ip, until: new Date(c.last + lockoutMinutes * MINUTE) }));
}

export async function boardView(deps: BoardDeps, who: BoardWho): Promise<BoardView> {
  await requirePermission(deps.db, who.actor, 'security.read', { storeId: MOTHER_STORE_ID });
  const now = deps.now ? deps.now() : new Date();
  const since = new Date(now.getTime() - FAILED_WINDOW_HOURS * HOUR);
  const [twoFactorRequired, maxAttempts, lockoutMinutes, blockedSetting, failedRows, events, sessions, owner, perms] = await Promise.all([
    deps.resolver.value('security.staffTwoFactorRequired'),
    deps.resolver.value('security.loginMaxAttempts'),
    deps.resolver.value('security.loginLockoutMinutes'),
    deps.resolver.value('security.blockedAddresses'),
    deps.db.staffLoginEvent.findMany({ where: { success: false, createdAt: { gte: since } }, select: { ip: true, createdAt: true } }),
    deps.db.staffLoginEvent.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: HISTORY_ROWS, select: { id: true, staffUserId: true, email: true, success: true, reason: true, ip: true, userAgent: true, createdAt: true } }),
    deps.db.staffSession.findMany({ where: { revokedAt: null, expiresAt: { gt: now } }, orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take: SESSION_ROWS, select: { id: true, userAgent: true, ip: true, lastSeenAt: true, createdAt: true, staffUser: { select: { displayName: true } } } }),
    who.actor.staffUserId ? isOwner(deps.db, who.actor.staffUserId) : Promise.resolve(false),
    requirePermission(deps.db, who.actor, 'security.write', { storeId: MOTHER_STORE_ID }).then(() => true).catch(() => false),
  ]);
  const ids = [...new Set(events.map((e) => e.staffUserId).filter((x): x is string => !!x))];
  const names = new Map((ids.length ? await deps.db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : []).map((p) => [p.id, p.displayName]));
  const blockedIps = blockedSetting.list.map((b) => b.ip);
  return {
    twoFactorRequired,
    failed24: failedRows.length,
    failedAddresses: new Set(failedRows.map((f) => f.ip).filter(Boolean)).size,
    sessions: sessions.map((s) => ({ id: s.id, who: s.staffUser.displayName, device: deviceName(s.userAgent), ip: s.ip, since: (s.lastSeenAt ?? s.createdAt).toISOString(), me: s.id === who.sessionId })),
    history: events.map((e) => ({ id: e.id, who: e.staffUserId ? (names.get(e.staffUserId) ?? null) : null, email: e.email, device: deviceName(e.userAgent), ip: e.ip, at: e.createdAt.toISOString(), ok: e.success, reason: e.reason, blocked: !!e.ip && blockedIps.includes(e.ip) })),
    blocked: blockedSetting.list,
    waiting: waitingAddresses(failedRows.map((f) => ({ ip: f.ip, at: f.createdAt })), maxAttempts, lockoutMinutes, now).map((w) => ({ ip: w.ip, until: w.until.toISOString() })),
    maxAttempts,
    lockoutMinutes,
    isOwner: owner,
    canEdit: perms,
    yourIp: who.ctx.ip ?? null,
  };
}

const ipText = z.string().trim().min(2).max(64);
const input = {
  block: z.object({ action: z.literal('block'), ip: ipText, why: z.string().trim().max(200).optional(), pin: z.string() }).strict(),
  unblock: z.object({ action: z.literal('unblock'), ip: ipText }).strict(),
  signOut: z.object({ action: z.literal('signOut'), sessionId: z.uuid() }).strict(),
  twoFactor: z.object({ action: z.literal('twoFactor'), on: z.boolean(), pin: z.string().optional() }).strict(),
};
const anyInput = z.discriminatedUnion('action', [input.block, input.unblock, input.signOut, input.twoFactor]);

/** One action of the page (`security.write`). */
export async function boardAct(deps: BoardDeps, who: BoardWho, raw: unknown): Promise<void> {
  await requirePermission(deps.db, who.actor, 'security.write', { storeId: MOTHER_STORE_ID });
  const p = anyInput.safeParse(raw);
  if (!p.success) throw new BoardError(400, 'INVALID_INPUT', p.error.issues.map((i) => i.path.join('.')));
  const a = p.data;
  const actorId = who.actor.staffUserId ?? null;
  const now = deps.now ? deps.now() : new Date();
  if (a.action === 'twoFactor') {
    const cur = await deps.resolver.value('security.staffTwoFactorRequired');
    if (cur === a.on) return;
    if (!a.on) {
      if (!actorId || !(await isOwner(deps.db, actorId))) throw new BoardError(403, 'OWNER_ONLY');
      await requireOwnerPin(deps, who.actor, who.ctx, a.pin, 'security.twoFactor.off', MOTHER_STORE_ID);
    }
    await deps.resolver.set('security.staffTwoFactorRequired', a.on, INSTALLATION, { actorId, reason: 'Settings › Security: 2-step login required' });
    await audit(deps.db, who.actor, { action: 'security.twoFactor', entityType: 'Setting', entityId: 'security.staffTwoFactorRequired', before: { on: cur }, after: { on: a.on } }, who.ctx);
    return;
  }
  if (a.action === 'signOut') {
    if (!actorId || !(await isOwner(deps.db, actorId))) throw new BoardError(403, 'OWNER_ONLY');
    if (a.sessionId === who.sessionId) throw new BoardError(400, 'THIS_DEVICE');
    const r = await deps.db.staffSession.updateMany({ where: { id: a.sessionId, revokedAt: null }, data: { revokedAt: now } });
    if (r.count !== 1) throw new BoardError(404, 'NOT_FOUND');
    await audit(deps.db, who.actor, { action: 'security.session.signOut', entityType: 'StaffSession', entityId: a.sessionId, before: null, after: { revokedAt: now.toISOString() } }, who.ctx);
    return;
  }
  const cur = await deps.resolver.value('security.blockedAddresses');
  if (a.action === 'unblock') {
    if (!actorId || !(await isOwner(deps.db, actorId))) throw new BoardError(403, 'OWNER_ONLY');
    if (!cur.list.some((b) => b.ip === a.ip)) throw new BoardError(404, 'NOT_FOUND');
    await deps.resolver.set('security.blockedAddresses', { list: cur.list.filter((b) => b.ip !== a.ip) }, INSTALLATION, { actorId, reason: 'Settings › Security: address unblocked' });
    await audit(deps.db, who.actor, { action: 'security.address.unblock', entityType: 'Setting', entityId: 'security.blockedAddresses', before: { ip: a.ip }, after: null }, who.ctx);
    return;
  }
  // block
  if (!actorId || !(await isOwner(deps.db, actorId))) throw new BoardError(403, 'OWNER_ONLY');
  if (!addressOnList(a.ip.split('/')[0] ?? a.ip, [a.ip])) throw new BoardError(400, 'INVALID_ADDRESS', ['ip']);
  if (who.ctx.ip && addressOnList(who.ctx.ip, [a.ip])) throw new BoardError(400, 'YOUR_ADDRESS', ['ip']);
  await requireOwnerPin(deps, who.actor, who.ctx, a.pin, 'security.address.block', MOTHER_STORE_ID);
  if (cur.list.some((b) => b.ip === a.ip)) return;
  if (cur.list.length >= BLOCKED_ADDRESSES_MAX) throw new BoardError(400, 'LIST_FULL');
  const entry = { ip: a.ip, why: a.why || 'Blocked by the owner', at: now.toISOString() };
  await deps.resolver.set('security.blockedAddresses', { list: [entry, ...cur.list] }, INSTALLATION, { actorId, reason: 'Settings › Security: address blocked' });
  await audit(deps.db, who.actor, { action: 'security.address.block', entityType: 'Setting', entityId: 'security.blockedAddresses', before: null, after: { ip: a.ip } }, who.ctx);
}
