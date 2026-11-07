// B6.5 — the append-only audit log: every change to roles, permissions and staff accounts records who, when and from
// where, in the same transaction as the change. Rows are only ever inserted. Passwords, hashes and 2FA seeds never go
// into `before`/`after`.
import { Prisma, type PrismaClient } from '@extas/db/client';

export type Db = PrismaClient | Prisma.TransactionClient;

/** Where a request came from. Both are trimmed: they are logged, not trusted. */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  /** What made the change: `admin-api`, `cli` … */
  source?: string;
}

export const clip = (s: string | null | undefined, max = 512): string | null => (s ? s.slice(0, max) : null);

/** Who acts. `null` id = the system (the deploy's sync, the owner set-up command). */
export interface Actor {
  staffUserId: string | null;
}

export const SYSTEM: Actor = { staffUserId: null };

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  storeId?: number | null;
}

const json = (v: unknown) => (v === undefined || v === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

export async function audit(db: Db, actor: Actor, entry: AuditEntry, ctx: RequestContext = {}): Promise<void> {
  await db.auditLog.create({
    data: {
      storeId: entry.storeId ?? null,
      actorType: actor.staffUserId ? 'STAFF' : 'SYSTEM',
      actorId: actor.staffUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: json(entry.before),
      after: json(entry.after),
      ip: clip(ctx.ip, 64),
      userAgent: clip(ctx.userAgent),
      source: ctx.source ?? null,
    },
  });
}

/**
 * Follow-up 586 (PR 382): an internet address as its short mark (FNV-1a, eight hex characters) — the same mark the
 * security page, the bot notes and the rate limits show (apps/web lib/security/edge-gate.ts `addressTag`). Security
 * events are append-only and kept for ever, so they keep this mark, never the address itself.
 */
export function addressMark(ip: string | null | undefined): string | null {
  if (ip == null) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Follow-up 609: the network an address belongs to, for the sign-in pause counted per network — an IPv4 address by its
 * /24 (`a.b.c`), an IPv6 address by its /48 (the first three groups, written out in full, lower case), an IPv4 address
 * written inside IPv6 (`::ffff:a.b.c.d`) as that IPv4 address. No address is `?`; anything else is kept as it is.
 */
export function networkOf(ip: string | null | undefined): string {
  const raw = (ip ?? '').trim().toLowerCase();
  if (!raw) return '?';
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(raw);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`;
  if (!raw.includes(':') || !/^[0-9a-f:]+$/.test(raw)) return raw;
  const [head = '', tail] = raw.split('::');
  const left = head ? head.split(':') : [];
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return groups.slice(0, 3).map((g) => g.padStart(4, '0')).join(':');
}

/** Follow-up 586: a security event's details with `ip` swapped for its mark (`address`); every other field kept. */
export function withAddressMark(details: Record<string, unknown>): Record<string, unknown> {
  if (!('ip' in details)) return details;
  const { ip, ...rest } = details;
  return { ...rest, address: addressMark(typeof ip === 'string' ? ip : null) };
}

/** A security event for the alerting PRs (Telegram, PR 9) to send on; an address is kept as its mark (follow-up 586). */
export async function securityEvent(
  db: Db,
  kind: string,
  severity: 'info' | 'warning' | 'critical',
  details: Record<string, unknown>,
  storeId: number | null = null,
): Promise<void> {
  await db.securityEvent.create({ data: { kind, severity, details: json(withAddressMark(details)), storeId } });
}
