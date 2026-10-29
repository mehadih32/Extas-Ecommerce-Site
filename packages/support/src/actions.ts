// PR 425 — what the team does in a conversation (B4.4): reply, write an internal note the customer never sees, take
// it or give it to someone, mark it solved, waiting or open. Every action writes one line in the who-did-what log
// (ConversationEvent, append-only) with the person's name as it was, so "who replied" is never lost. A reply goes to
// the channel's adapter after it is saved; with no adapter (PR 426 not connected) it stays in the thread marked
// NOT_SENT. One press of Send carries a key: pressed twice, it is one message. Nothing here sends money, changes an
// order, a price, a discount or COD, or blocks anyone.
import { permissionsFor } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import type { OutgoingSupportMessage } from './channels';
import { allow, nowOf, parse, setting, SupportError, TX, type Db, type SupportDeps, type Who } from './context';
import { CONVERSATION_STATUSES, fileKindOf, PREVIEW_CHARS, previewOf, type ConversationStatus } from './pure';

type Tx = Prisma.TransactionClient;

async function nameOf(db: Db, staffUserId: string | null): Promise<string | null> {
  if (!staffUserId) return null;
  return (await db.staffUser.findUnique({ where: { id: staffUserId }, select: { displayName: true } }))?.displayName ?? null;
}

/** The conversation, locked for this change; a stale version (its updatedAt) is refused. */
async function lockConversation(tx: Tx, who: Who, id: string, version?: string) {
  if (!z.uuid().safeParse(id).success) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Conversation" WHERE "id" = ${id}::uuid AND "storeId" = ${who.storeId} FOR UPDATE`;
  if (!rows.length) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  const c = await tx.conversation.findUniqueOrThrow({ where: { id }, include: { channel: true, contact: true } });
  if (version !== undefined && version !== c.updatedAt.toISOString()) throw new SupportError('STALE', 'the conversation changed; read it again', ['version'], { version: c.updatedAt.toISOString() });
  return c;
}

const staffEvent = (who: Who, name: string | null) => ({ actorType: 'STAFF' as const, actorStaffId: who.actor.staffUserId, actorName: name });

// ------------------------------------------------------------------------------------------------------------ reply

export const replyInput = z
  .object({
    conversationId: z.uuid(),
    body: z.string().max(10_000).default(''),
    /** An internal note: kept in the thread for the team, never sent. */
    note: z.boolean().default(false),
    /** Our stored copies of the files (uploaded first). */
    assetIds: z.array(z.uuid()).max(10).default([]),
    requestKey: z.string().min(8).max(80),
    version: z.string().max(40).optional(),
  })
  .strict();

export interface ReplyResult {
  messageId: string;
  /** null for a note. */
  delivery: 'SENT' | 'NOT_SENT' | 'FAILED' | null;
  failReason: string | null;
  /** The same press arrived again: the first one's message. */
  replay: boolean;
}

/** A reply to the customer, or an internal note (`support.reply`). */
export async function replyToConversation(deps: SupportDeps, who: Who, input: unknown): Promise<ReplyResult> {
  await allow(deps, who, 'support.reply');
  const d = parse(replyInput, input, 'reply');
  const storeId = who.storeId;
  const [inbox, files] = await Promise.all([setting(deps, storeId, 'support.inbox'), setting(deps, storeId, 'support.attachments')]);
  const body = d.body.trim();
  if (!body && !d.assetIds.length) throw new SupportError('EMPTY', 'write something or add a file', ['body']);
  if (body.length > inbox.replyMaxChars) throw new SupportError('TOO_LONG', 'the message is too long', ['body'], { max: inbox.replyMaxChars });
  const assetIds = [...new Set(d.assetIds)];
  if (assetIds.length && !files.enabled) throw new SupportError('FILES_OFF', 'files are switched off in Support settings', ['assetIds']);
  if (assetIds.length > files.maxPerMessage) throw new SupportError('TOO_MANY_FILES', 'too many files for one message', ['assetIds'], { max: files.maxPerMessage });

  const prior = await deps.db.message.findUnique({ where: { conversationId_requestKey: { conversationId: d.conversationId, requestKey: d.requestKey } } });
  if (prior) {
    if (prior.storeId !== storeId || (prior.body ?? '') !== body || prior.isInternalNote !== d.note) throw new SupportError('IDEMPOTENCY_MISMATCH', 'this key was used for another message', ['requestKey']);
    return { messageId: prior.id, delivery: d.note ? null : (prior.status as ReplyResult['delivery']), failReason: prior.failReason, replay: true };
  }

  const assets = assetIds.length
    ? await deps.db.mediaAsset.findMany({ where: { id: { in: assetIds }, storeId, archivedAt: null }, select: { id: true, kind: true, mimeType: true, bytes: true, originalFileName: true } })
    : [];
  const maxBytes = files.maxMb * 1024 * 1024;
  for (const id of assetIds) {
    const a = assets.find((x) => x.id === id);
    const kind = a ? fileKindOf(a.kind) : null;
    if (!a || !kind || !files.kinds[kind] || Number(a.bytes) > maxBytes) throw new SupportError('FILE_NOT_ALLOWED', 'this file cannot be attached', [id]);
  }

  const now = nowOf(deps);
  const saved = await deps.db.$transaction(async (tx) => {
    const c = await lockConversation(tx, who, d.conversationId, d.version);
    const name = await nameOf(tx, who.actor.staffUserId);
    const m = await tx.message.create({
      data: {
        storeId,
        conversationId: c.id,
        direction: d.note ? 'NOTE' : 'OUT',
        senderType: 'STAFF',
        senderStaffId: who.actor.staffUserId,
        senderName: name,
        body: body || null,
        isInternalNote: d.note,
        requestKey: d.requestKey,
        status: d.note ? null : 'QUEUED',
        sentAt: now,
      },
    });
    const made = [];
    for (const id of assetIds) {
      const a = assets.find((x) => x.id === id)!;
      made.push(
        await tx.messageAttachment.create({
          data: { storeId, messageId: m.id, kind: a.kind, assetId: a.id, status: 'STORED', fileName: a.originalFileName, contentType: a.mimeType, sizeBytes: Number(a.bytes) },
        }),
      );
    }
    const take = !d.note && inbox.assignOnReply && !c.assignedToId && who.actor.staffUserId;
    if (!d.note) {
      await tx.conversation.update({
        where: { id: c.id },
        data: {
          lastMessageAt: now,
          lastDirection: 'OUT',
          lastPreview: previewOf(body, PREVIEW_CHARS) ?? previewOf(made.map((f) => f.fileName ?? f.kind.toLowerCase()).join(', '), PREVIEW_CHARS),
          waitingSince: null,
          firstResponseAt: c.firstResponseAt ?? now,
          ...(inbox.waitingOnReply && c.status === 'OPEN' ? { status: 'WAITING' } : {}),
          ...(take ? { assignedToId: who.actor.staffUserId, assignedAt: now } : {}),
        },
      });
    } else {
      // a note changes nothing the customer sees; the conversation's version moves so a stale screen reads it again
      await tx.conversation.update({ where: { id: c.id }, data: { updatedAt: now } });
    }
    await tx.conversationEvent.create({
      data: { storeId, conversationId: c.id, kind: d.note ? 'NOTED' : 'REPLIED', ...staffEvent(who, name), messageId: m.id, data: { files: made.length, chars: body.length }, createdAt: now },
    });
    if (!d.note && inbox.waitingOnReply && c.status === 'OPEN') {
      await tx.conversationEvent.create({ data: { storeId, conversationId: c.id, kind: 'STATUS', ...staffEvent(who, name), data: { from: 'OPEN', to: 'WAITING', auto: true }, createdAt: now } });
    }
    if (take) {
      await tx.conversationEvent.create({ data: { storeId, conversationId: c.id, kind: 'ASSIGNED', ...staffEvent(who, name), data: { from: null, to: who.actor.staffUserId, toName: name, auto: true }, createdAt: now } });
    }
    return { c, m, made };
  }, TX);

  if (d.note) return { messageId: saved.m.id, delivery: null, failReason: null, replay: false };

  // out to the channel, after the reply is safely kept
  const adapter = deps.channels?.[saved.c.channel.kind as keyof NonNullable<SupportDeps['channels']>];
  let delivery: 'SENT' | 'NOT_SENT' | 'FAILED';
  let failReason: string | null = null;
  let externalMessageId: string | null = null;
  if (!saved.c.channel.enabled || !adapter) {
    delivery = 'NOT_SENT';
    failReason = adapter ? 'CHANNEL_OFF' : 'CHANNEL_NOT_CONNECTED';
  } else {
    const out: OutgoingSupportMessage = {
      storeId,
      conversationId: saved.c.id,
      messageId: saved.m.id,
      channel: { id: saved.c.channel.id, kind: saved.c.channel.kind, externalId: saved.c.channel.externalId },
      contact: { externalId: saved.c.contact.externalId, phone: saved.c.contact.phone },
      text: body || null,
      files: saved.made.map((f) => ({ attachmentId: f.id, assetId: f.assetId!, fileName: f.fileName, contentType: f.contentType })),
    };
    try {
      const r = await adapter.send(out);
      if (r.ok) {
        delivery = 'SENT';
        externalMessageId = r.externalMessageId;
      } else {
        delivery = 'FAILED';
        failReason = r.error.slice(0, 200);
      }
    } catch (e) {
      delivery = 'FAILED';
      failReason = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 200);
    }
  }
  await deps.db.message.update({ where: { id: saved.m.id }, data: { status: delivery, failReason, externalMessageId } });
  return { messageId: saved.m.id, delivery, failReason, replay: false };
}

// ------------------------------------------------------------------------------------------------------------ assign

export const assignInput = z.object({ conversationId: z.uuid(), staffId: z.uuid().nullable(), version: z.string().max(40).optional() }).strict();

/**
 * Take a conversation, let it go, or give it to someone. Taking it yourself, or letting go of your own, needs
 * `support.reply`; giving it to another person or taking it from them needs `support.assign`. Only an active person
 * who may reply in this store can be given one.
 */
export async function assignConversation(deps: SupportDeps, who: Who, input: unknown): Promise<{ changed: boolean }> {
  const held = await allow(deps, who, 'support.reply');
  const d = parse(assignInput, input, 'assignment');
  const me = who.actor.staffUserId;
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const c = await lockConversation(tx, who, d.conversationId, d.version);
    if (c.assignedToId === d.staffId) return { changed: false };
    const self = (d.staffId === me && !c.assignedToId) || (d.staffId === null && c.assignedToId === me);
    if (!self && !held.has('support.assign')) await allow(deps, who, 'support.assign');
    let toName: string | null = null;
    if (d.staffId) {
      const s = await tx.staffUser.findUnique({ where: { id: d.staffId }, select: { status: true, archivedAt: true, displayName: true } });
      if (!s || s.status !== 'ACTIVE' || s.archivedAt || !(await permissionsFor(tx, d.staffId, { storeId: who.storeId })).has('support.reply')) {
        throw new SupportError('NOT_ASSIGNABLE', 'this person cannot take conversations in this store', ['staffId']);
      }
      toName = s.displayName;
    }
    const name = await nameOf(tx, me);
    await tx.conversation.update({ where: { id: c.id }, data: { assignedToId: d.staffId, assignedAt: d.staffId ? now : null } });
    await tx.conversationEvent.create({
      data: {
        storeId: who.storeId,
        conversationId: c.id,
        kind: d.staffId ? 'ASSIGNED' : 'UNASSIGNED',
        ...staffEvent(who, name),
        data: { from: c.assignedToId, to: d.staffId, toName },
        createdAt: now,
      },
    });
    return { changed: true };
  }, TX);
}

// ------------------------------------------------------------------------------------------------------------ status

export const statusInput = z.object({ conversationId: z.uuid(), status: z.enum(CONVERSATION_STATUSES), version: z.string().max(40).optional() }).strict();

/** Mark a conversation solved, waiting for the customer, or open again (`support.reply`). */
export async function setConversationStatus(deps: SupportDeps, who: Who, input: unknown): Promise<{ changed: boolean; status: ConversationStatus }> {
  await allow(deps, who, 'support.reply');
  const d = parse(statusInput, input, 'status');
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const c = await lockConversation(tx, who, d.conversationId, d.version);
    const from = c.status as ConversationStatus;
    if (from === d.status) return { changed: false, status: from };
    const name = await nameOf(tx, who.actor.staffUserId);
    await tx.conversation.update({
      where: { id: c.id },
      data: {
        status: d.status,
        ...(d.status === 'SOLVED' ? { resolvedAt: now, waitingSince: null } : {}),
        ...(from === 'SOLVED' ? { resolvedAt: null } : {}),
      },
    });
    await tx.conversationEvent.create({ data: { storeId: who.storeId, conversationId: c.id, kind: 'STATUS', ...staffEvent(who, name), data: { from, to: d.status }, createdAt: now } });
    return { changed: true, status: d.status };
  }, TX);
}

// ------------------------------------------------------------------------------------------------------------ staff

/** The people who may take conversations in this store (active, holding `support.reply`), for the "Give to" list. */
export async function supportStaff(deps: Pick<SupportDeps, 'db'>, who: Who): Promise<{ id: string; name: string }[]> {
  await allow(deps, who, 'support.read');
  const people = await deps.db.staffUser.findMany({ where: { status: 'ACTIVE', archivedAt: null }, orderBy: { displayName: 'asc' }, select: { id: true, displayName: true } });
  const out: { id: string; name: string }[] = [];
  for (const p of people) if ((await permissionsFor(deps.db, p.id, { storeId: who.storeId })).has('support.reply')) out.push({ id: p.id, name: p.displayName });
  return out;
}
