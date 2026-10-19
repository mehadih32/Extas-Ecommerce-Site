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

/** A security event for the alerting PRs (Telegram, PR 9) to send on. */
export async function securityEvent(
  db: Db,
  kind: string,
  severity: 'info' | 'warning' | 'critical',
  details: Record<string, unknown>,
  storeId: number | null = null,
): Promise<void> {
  await db.securityEvent.create({ data: { kind, severity, details: json(details), storeId } });
}
