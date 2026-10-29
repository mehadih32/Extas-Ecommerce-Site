// PR 425 — a customer's message arrives (B4.2: "the server attaches it to that customer's identity and conversation and
// shows it in the Support Inbox"). A channel's connector (PR 426) calls `receiveMessage` from its webhook; nothing else
// does. The same channel message twice is one message (its id is kept per conversation). A new person gets a contact
// (matched to a customer by the exact number when the channel gives one; the full matching across channels is PR 427);
// a person's next message joins their conversation on that channel, and a solved one opens again. Files are recorded
// with the channel's address and PENDING until they are copied to our storage (B4.8, with the connector). The log
// records every arrival. Nothing here sends anything or changes an order.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, SupportError, TX, type SupportDeps } from './context';
import { cleanFileName, PREVIEW_CHARS, previewOf, SUBJECT_CHARS } from './pure';

// the database's MediaKind values
const MEDIA_KINDS = ['IMAGE', 'VIDEO', 'AUDIO', 'PDF', 'DOCUMENT', 'OTHER'] as const;

export const receiveInput = z
  .object({
    storeId: z.int().min(1),
    channel: z.object({ kind: z.string().min(1).max(40), externalId: z.string().min(1).max(200) }).strict(),
    contact: z
      .object({
        externalId: z.string().min(1).max(200),
        name: z.string().trim().max(120).optional(),
        phone: z
          .string()
          .trim()
          .regex(/^\+?[0-9 ]{6,20}$/)
          .optional(),
      })
      .strict(),
    message: z
      .object({
        externalId: z.string().min(1).max(200),
        text: z.string().max(8000).optional(),
        sentAt: z.coerce.date().optional(),
        files: z
          .array(
            z
              .object({
                kind: z.enum(MEDIA_KINDS),
                sourceUrl: z.url().max(2000),
                fileName: z.string().max(300).optional(),
                contentType: z.string().max(120).optional(),
                sizeBytes: z.int().min(0).optional(),
              })
              .strict(),
          )
          .max(20)
          .default([]),
      })
      .strict(),
  })
  .strict();
export type ReceiveInput = z.input<typeof receiveInput>;

export interface ReceiveResult {
  conversationId: string;
  messageId: string;
  /** A new conversation was started. */
  started: boolean;
  /** A solved conversation opened again. */
  reopened: boolean;
  /** The channel sent this message before: nothing new was written. */
  duplicate: boolean;
}

/** A conversation's short reference (the `r=` code of a chat link, PR 429): 10 letters and digits, unique per store. */
const refCode = () => `C${randomBytes(8).toString('base64url').replace(/[-_]/g, '').slice(0, 9).toUpperCase()}`;

/** One message from a customer on a channel. Safe to call again with the same message. */
export async function receiveMessage(deps: SupportDeps, input: ReceiveInput): Promise<ReceiveResult> {
  const d = parse(receiveInput, input, 'message');
  checkStoreId(d.storeId);
  const at = d.message.sentAt ?? nowOf(deps);
  const text = d.message.text?.trim() ? d.message.text : null;
  if (!text && !d.message.files.length) throw new SupportError('EMPTY', 'a message needs words or a file', ['message']);
  const channel = await deps.db.supportChannel.findUnique({ where: { storeId_kind_externalId: { storeId: d.storeId, kind: d.channel.kind, externalId: d.channel.externalId } } });
  if (!channel || channel.archivedAt) throw new SupportError('NOT_FOUND', 'no such channel', ['channel']);

  return deps.db.$transaction(async (tx) => {
    // one person on one channel at a time, so two messages arriving together never start two conversations
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`support:${d.storeId}:${channel.id}:${d.contact.externalId}`}, 0))`;
    let contact = await tx.supportContact.findUnique({ where: { storeId_channelKind_externalId: { storeId: d.storeId, channelKind: channel.kind, externalId: d.contact.externalId } } });
    if (!contact) {
      const customer = d.contact.phone ? await tx.customer.findFirst({ where: { storeId: d.storeId, phone: d.contact.phone }, select: { id: true } }) : null;
      contact = await tx.supportContact.create({
        data: { storeId: d.storeId, channelKind: channel.kind, externalId: d.contact.externalId, displayName: d.contact.name ?? null, phone: d.contact.phone ?? null, customerId: customer?.id ?? null },
      });
    } else if ((d.contact.name && d.contact.name !== contact.displayName) || (d.contact.phone && d.contact.phone !== contact.phone)) {
      contact = await tx.supportContact.update({ where: { id: contact.id }, data: { displayName: d.contact.name ?? contact.displayName, phone: d.contact.phone ?? contact.phone } });
    }

    let conv = await tx.conversation.findFirst({ where: { storeId: d.storeId, channelId: channel.id, contactId: contact.id }, orderBy: { createdAt: 'desc' } });
    if (conv) {
      const seen = await tx.message.findUnique({ where: { conversationId_externalMessageId: { conversationId: conv.id, externalMessageId: d.message.externalId } }, select: { id: true } });
      if (seen) return { conversationId: conv.id, messageId: seen.id, started: false, reopened: false, duplicate: true };
    }
    const started = !conv;
    if (!conv) {
      for (let i = 0; !conv; i++) {
        const code = refCode();
        if (await tx.conversation.findUnique({ where: { storeId_refCode: { storeId: d.storeId, refCode: code } }, select: { id: true } })) {
          if (i > 5) throw new Error('could not make a conversation reference');
          continue;
        }
        conv = await tx.conversation.create({
          data: { storeId: d.storeId, channelId: channel.id, contactId: contact.id, customerId: contact.customerId, status: 'OPEN', refCode: code, tags: [], subject: previewOf(text, SUBJECT_CHARS), createdAt: at },
        });
      }
    }
    const reopened = conv.status === 'SOLVED';
    const message = await tx.message.create({
      data: {
        storeId: d.storeId,
        conversationId: conv.id,
        direction: 'IN',
        senderType: 'CUSTOMER',
        senderName: contact.displayName,
        body: text,
        externalMessageId: d.message.externalId,
        status: 'RECEIVED',
        sentAt: at,
      },
    });
    for (const f of d.message.files) {
      await tx.messageAttachment.create({
        data: {
          storeId: d.storeId,
          messageId: message.id,
          kind: f.kind,
          status: 'PENDING',
          sourceUrl: f.sourceUrl,
          fileName: cleanFileName(f.fileName),
          contentType: f.contentType ?? null,
          sizeBytes: f.sizeBytes ?? null,
        },
      });
    }
    await tx.conversation.update({
      where: { id: conv.id },
      data: {
        lastMessageAt: at,
        lastDirection: 'IN',
        lastPreview: previewOf(text, PREVIEW_CHARS) ?? previewOf(d.message.files.map((f) => cleanFileName(f.fileName) ?? f.kind.toLowerCase()).join(', '), PREVIEW_CHARS),
        waitingSince: conv.waitingSince ?? at,
        status: 'OPEN',
        ...(reopened ? { resolvedAt: null } : {}),
        ...(contact.customerId && !conv.customerId ? { customerId: contact.customerId } : {}),
      },
    });
    const actor = { actorType: 'CUSTOMER' as const, actorName: contact.displayName };
    if (reopened) await tx.conversationEvent.create({ data: { storeId: d.storeId, conversationId: conv.id, kind: 'REOPENED', ...actor, data: { from: 'SOLVED' }, createdAt: at } });
    await tx.conversationEvent.create({ data: { storeId: d.storeId, conversationId: conv.id, kind: 'RECEIVED', ...actor, messageId: message.id, data: { files: d.message.files.length }, createdAt: at } });
    return { conversationId: conv.id, messageId: message.id, started, reopened, duplicate: false };
  }, TX);
}
