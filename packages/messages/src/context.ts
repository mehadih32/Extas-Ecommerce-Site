// What the message engine gets: the database, the settings (through the two-tier resolver, PR 492), the senders (the
// connection layer of PR 18 with the SMS, WhatsApp and e-mail adapters: each the mock until its key is entered) and a
// clock for tests. Staff actions (the journey's settings, the log, a retry) check their permission like every admin
// service (B6.5) and scope every row by `storeId` (A4.1).
import type { AdapterMode, Prisma, PrismaClient } from '@extas/db/client';
import { audit, can, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { Connections, EmailSender, SmsSender, WhatsAppSender, WhatsAppTemplateDraft, WhatsAppTemplateRef, WhatsAppTemplateState, WhatsAppTemplateStatus } from '@extas/adapters';
import { storeTarget, type Key, type MessageChannel, type Value } from '@extas/settings';
import type { z } from 'zod';

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** The resolver's write side, for the journey screen's save. */
export interface SettingsWriter {
  set<K extends Key>(key: K, value: Value<K>, target: ReturnType<typeof storeTarget>, opts?: { actorId?: string | null; reason?: string | null }): Promise<unknown>;
}

/** A database handle or an open transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;
export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export interface OutgoingMessage {
  to: string;
  text: string;
  /** E-mail only. */
  subject: string | null;
  /** What it is for (`order.placed` …); never the text. */
  purpose: string;
  /** PR 291 — SMS only: the shop's approved masking name, or null for the gateway's own number. */
  senderId?: string | null;
  /** PR 292 — WhatsApp only: the provider's approved template (name, language, the body's values in order). */
  template?: WhatsAppTemplateRef | null;
}

export type SendResult =
  | { ok: true; messageId: string; /** PR 291: the provider's own price for it (minor units), when it says */ costMinor?: number | null }
  | { ok: false; error: string; /** this channel cannot reach the number at all */ unreachable?: boolean };

/** PR 291 — the credit left with a provider (an amount in minor units, or a count of messages), when it says. */
export interface SenderBalance {
  amountMinor: number | null;
  count: number | null;
}

/** One channel's sender in a store, as the connection layer picked it. */
export interface Sender {
  provider: string;
  mode: AdapterMode;
  send(m: OutgoingMessage): Promise<SendResult>;
  /** PR 291 — the credit left on the provider's account (absent or null when the provider does not say). */
  balance?(): Promise<SenderBalance | null>;
  /** PR 292 — WhatsApp: the provider's word on every template, and sending one for approval. */
  templates?(): Promise<WhatsAppTemplateStatus[]>;
  submitTemplate?(t: WhatsAppTemplateDraft): Promise<{ id: string; status: WhatsAppTemplateState }>;
}

export interface MessagesDeps {
  db: PrismaClient;
  settings: SettingsReader;
  sender(storeId: number, channel: MessageChannel): Promise<Sender>;
  now?: () => Date;
}

export const nowOf = (deps: Pick<MessagesDeps, 'now'>): Date => deps.now?.() ?? new Date();

export const setting = <K extends Key>(deps: Pick<MessagesDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** The senders from the connection layer (built with `messageAdapters`): the store's connection, else the mock. */
export function sendersFrom(connections: Pick<Connections, 'use'>): MessagesDeps['sender'] {
  return async (storeId, channel) => {
    if (channel === 'SMS') {
      const c = await connections.use<SmsSender>('SMS', { storeId });
      return {
        provider: c.provider,
        mode: c.mode,
        send: (m) => c.api.send({ to: m.to, text: m.text, purpose: m.purpose, senderId: m.senderId ?? null }),
        // PR 291: the gateway's credit (the mock has none)
        async balance() {
          const b = c.api.balance ? await c.api.balance() : null;
          return b ? { amountMinor: b.amountMinor, count: b.sms } : null;
        },
      };
    }
    if (channel === 'WHATSAPP') {
      const c = await connections.use<WhatsAppSender>('WHATSAPP', { storeId });
      return {
        provider: c.provider,
        mode: c.mode,
        send: async (m) => {
          const r = await c.api.send({ to: m.to, text: m.text, purpose: m.purpose, template: m.template ?? null });
          return r.ok ? r : { ok: false, error: r.error, unreachable: r.notOnWhatsApp === true };
        },
        // PR 292: the templates' approval (the practice sender plays the provider)
        ...(c.api.templates ? { templates: () => c.api.templates!() } : {}),
        ...(c.api.submitTemplate ? { submitTemplate: (t: WhatsAppTemplateDraft) => c.api.submitTemplate!(t) } : {}),
      };
    }
    const c = await connections.use<EmailSender>('EMAIL', { storeId });
    return { provider: c.provider, mode: c.mode, send: (m) => c.api.send({ to: m.to, subject: m.subject ?? '', text: m.text, purpose: m.purpose }) };
  };
}

export class MessagesError extends Error {
  constructor(
    public readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'STALE' | 'NOT_RETRYABLE' | 'IDEMPOTENCY_MISMATCH' | 'PROVIDER_ERROR',
    message: string,
    public readonly details: string[] = [],
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MessagesError';
  }

  get status(): number {
    // PR 292: the provider refused or did not answer (its words are in the details)
    return this.code === 'NOT_FOUND' ? 404 : this.code === 'INVALID_INPUT' ? 400 : this.code === 'PROVIDER_ERROR' ? 502 : 409;
  }
}

export const isMessagesError = (e: unknown): e is MessagesError => e instanceof MessagesError;

/** A staff member acting in one store. */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

/** The message permissions (packages/auth/src/catalogue.ts; BACKEND-ARCHITECTURE §5.7). */
export const MESSAGE_PERMISSIONS = [
  'messages.journey.read',
  'messages.journey.write',
  'messages.selfConfirm.reply',
  'messages.log.view',
  'messages.log.retry',
  // PR 291: Messages › Channels & limits
  'messages.channels.read',
  'messages.channels.write',
] as const;
export type MessagesPermission = (typeof MESSAGE_PERMISSIONS)[number];

export async function allow(deps: Pick<MessagesDeps, 'db'>, who: Who, permission: MessagesPermission): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new MessagesError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new MessagesError('NOT_FOUND', 'no such store', ['storeId']);
}

/** Does the actor hold the permission in the store (no throw)? */
export const holds = (deps: Pick<MessagesDeps, 'db'>, who: Who, permission: MessagesPermission): Promise<boolean> => can(deps.db, who.actor, permission, { storeId: who.storeId });

/** An audit row (in the same transaction as the change when `db` is one). */
export function logChange(db: Db, who: Who, entry: { action: string; entityType: string; entityId: string; before: unknown; after: unknown }): Promise<void> {
  return audit(db, who.actor, { ...entry, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new MessagesError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}
