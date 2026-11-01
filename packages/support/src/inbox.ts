// PR 425 — what the team reads: the inbox (every channel in one list, B4.2) and one conversation's thread with its
// files, internal notes and the who-did-what log (B4.4). Both need `support.read`. A customer's number is shown the way
// the rest of the admin shows it (B4.12, Note 24.1): whole to a person with `customers.phone`, otherwise masked by
// `customers.phoneMask` (PR 284, @extas/customers/pure `maskPhone`). PR 428: the thread carries the customer scan
// (`context`, @extas/customers chatContextOf) while `support.context` is on — counts and risk only with `customers.read`.
import type { Prisma } from '@extas/db/client';
import { actorPermissions } from '@extas/auth';
import { z } from 'zod';
import { allow, parse, setting, SupportError, type SupportDeps, type Who } from './context';
import { chatContextOf, type ChatContext } from '@extas/customers';
import { maskPhone } from '@extas/customers/pure';
import { personOf, type Person } from './identity';
import { INBOX_VIEWS, type ConversationStatus, type InboxView } from './pure';
import { inboxPhoneDigits } from './search-pure';

async function phoneShown(deps: Pick<SupportDeps, 'settings'>, who: Who, held: Set<string>): Promise<(p: string | null) => string | null> {
  if (held.has('customers.phone')) return (p) => p;
  const mask = await setting(deps, who.storeId, 'customers.phoneMask');
  return (p) => (p ? maskPhone(p, mask) : null);
}

async function staffNames(deps: Pick<SupportDeps, 'db'>, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await deps.db.staffUser.findMany({ where: { id: { in: want } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

// ------------------------------------------------------------------------------------------------------------ inbox

export const inboxInput = z
  .object({
    view: z.enum(INBOX_VIEWS).default('open'),
    q: z.string().trim().max(80).optional(),
    channel: z.string().max(40).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

export interface InboxRow {
  id: string;
  refCode: string;
  status: ConversationStatus;
  channel: { kind: string; name: string };
  contact: { name: string | null; phone: string | null };
  subject: string | null;
  lastPreview: string | null;
  lastDirection: string | null;
  lastMessageAt: Date | null;
  waitingSince: Date | null;
  assignedTo: { id: string; name: string } | null;
  customerId: string | null;
}

export interface Inbox {
  view: InboxView;
  rows: InboxRow[];
  counts: Record<InboxView, number>;
  page: number;
  pages: number;
  /** The store's channels, for the filter. */
  channels: { kind: string; name: string; enabled: boolean }[];
}

function viewWhere(view: InboxView, me: string | null): Prisma.ConversationWhereInput {
  if (view === 'open') return { status: 'OPEN' };
  if (view === 'waiting') return { status: 'WAITING' };
  if (view === 'solved') return { status: 'SOLVED' };
  if (view === 'mine') return { assignedToId: me ?? '00000000-0000-0000-0000-000000000000', status: { not: 'SOLVED' } };
  if (view === 'unassigned') return { assignedToId: null, status: { not: 'SOLVED' } };
  return {};
}

/** The inbox: one view, searched by name, number, reference or subject, optionally one channel kind; one page. */
export async function supportInbox(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who, input: unknown): Promise<Inbox> {
  const held = await allow(deps, who, 'support.read');
  const q = parse(inboxInput, input, 'inbox');
  const storeId = who.storeId;
  const me = who.actor.staffUserId;
  const { pageSize } = await setting(deps, storeId, 'support.inbox');
  // PR 425 follow-up: Bengali digits, +880 and the leading 0 are read too (search-pure.ts)
  const digits = q.q ? inboxPhoneDigits(q.q) : '';
  const search: Prisma.ConversationWhereInput = q.q
    ? {
        OR: [
          { refCode: { contains: q.q, mode: 'insensitive' } },
          { subject: { contains: q.q, mode: 'insensitive' } },
          { contact: { displayName: { contains: q.q, mode: 'insensitive' } } },
          // a number is searched by its digits; a masked number is still found, never shown
          ...(digits ? [{ contact: { phone: { contains: digits } } }] : []),
        ],
      }
    : {};
  const chan: Prisma.ConversationWhereInput = q.channel ? { channel: { kind: q.channel } } : {};
  const base: Prisma.ConversationWhereInput = { storeId, ...chan };
  const where: Prisma.ConversationWhereInput = { AND: [base, search, viewWhere(q.view, me)] };
  // the oldest waiting customer first in the working views; the latest first in the others
  const working = q.view === 'open' || q.view === 'mine' || q.view === 'unassigned';
  const orderBy: Prisma.ConversationOrderByWithRelationInput[] = working ? [{ waitingSince: { sort: 'asc', nulls: 'last' } }, { lastMessageAt: { sort: 'desc', nulls: 'last' } }] : [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }];
  const counted = await Promise.all(INBOX_VIEWS.map((v) => deps.db.conversation.count({ where: { AND: [base, search, viewWhere(v, me)] } })));
  const counts = Object.fromEntries(INBOX_VIEWS.map((v, i) => [v, counted[i]!])) as Record<InboxView, number>;
  const pages = Math.max(1, Math.ceil(counts[q.view] / pageSize));
  const page = Math.min(q.page, pages);
  const [rows, channels, shown] = await Promise.all([
    deps.db.conversation.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { channel: { select: { kind: true, name: true } }, contact: { select: { displayName: true, phone: true } } },
    }),
    deps.db.supportChannel.findMany({ where: { storeId, archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { kind: true, name: true, enabled: true } }),
    phoneShown(deps, who, held),
  ]);
  const names = await staffNames(deps, rows.map((r) => r.assignedToId));
  return {
    view: q.view,
    page,
    pages,
    counts,
    channels,
    rows: rows.map((r) => ({
      id: r.id,
      refCode: r.refCode,
      status: r.status as ConversationStatus,
      channel: r.channel,
      contact: { name: r.contact.displayName, phone: shown(r.contact.phone) },
      subject: r.subject,
      lastPreview: r.lastPreview,
      lastDirection: r.lastDirection,
      lastMessageAt: r.lastMessageAt,
      waitingSince: r.waitingSince,
      assignedTo: r.assignedToId ? { id: r.assignedToId, name: names.get(r.assignedToId) ?? '' } : null,
      customerId: r.customerId,
    })),
  };
}

// ------------------------------------------------------------------------------------------------------------ thread

export interface ThreadFile {
  id: string;
  kind: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  /** STORED: our copy can be opened. PENDING: the channel's copy is still being saved. */
  status: string;
  ready: boolean;
}

export interface ThreadMessage {
  id: string;
  direction: 'IN' | 'OUT' | 'NOTE';
  sender: { type: string; name: string | null };
  body: string | null;
  isNote: boolean;
  /** Replies: QUEUED, SENT, NOT_SENT, FAILED; a customer's message: RECEIVED; a note: null. */
  status: string | null;
  failReason: string | null;
  sentAt: Date;
  files: ThreadFile[];
  /** PR 429: a product card sent from the drawer — its reference, when the customer opened it, the order it brought. */
  share: { productId: string; refCode: string; openedAt: Date | null; order: { id: string; number: string } | null } | null;
}

export interface ThreadEvent {
  id: string;
  kind: string;
  actor: { type: string; name: string | null };
  data: Record<string, unknown> | null;
  at: Date;
}

export interface Thread {
  id: string;
  refCode: string;
  status: ConversationStatus;
  subject: string | null;
  /** The thread's version: a change made in between is refused as STALE. */
  version: string;
  channel: { id: string; kind: string; name: string; enabled: boolean };
  contact: { name: string | null; phone: string | null };
  customer: { id: string; name: string | null; orderCount: number } | null;
  order: { id: string; number: string; status: string } | null;
  assignedTo: { id: string; name: string } | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  waitingSince: Date | null;
  createdAt: Date;
  messages: ThreadMessage[];
  events: ThreadEvent[];
  /** PR 427: the same person's other chats (other channels, earlier chats). */
  person: Person;
  /** PR 428 (B4.5): the person's orders beside the chat; null while `support.context` is off. */
  context: ChatContext | null;
  /** What the person reading may do here (`identity`: set the number, unlink the customer, "not the same person"). */
  you: { id: string | null; reply: boolean; assign: boolean; identity: boolean; catalogue: boolean };
}

/** One conversation with every message, file, note and log line, oldest first. */
export async function supportThread(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who, conversationId: string): Promise<Thread> {
  const held = await allow(deps, who, 'support.read');
  if (!z.uuid().safeParse(conversationId).success) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  const c = await deps.db.conversation.findFirst({
    where: { id: conversationId, storeId: who.storeId },
    include: {
      channel: { select: { id: true, kind: true, name: true, enabled: true } },
      contact: { select: { displayName: true, phone: true } },
      messages: { orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }], include: { attachments: { orderBy: { createdAt: 'asc' } } } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!c) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  const [ctxOn, catOn, shares] = await Promise.all([
    setting(deps, who.storeId, 'support.context'),
    setting(deps, who.storeId, 'support.catalogue'),
    deps.db.supportProductShare.findMany({ where: { storeId: who.storeId, conversationId: c.id, messageId: { not: null } }, select: { messageId: true, productId: true, refCode: true, clickedAt: true, orderId: true } }),
  ]);
  const shareOrderIds = [...new Set(shares.flatMap((s) => (s.orderId ? [s.orderId] : [])))];
  const [shown, customer, order, names, perms, person, context, shareOrders] = await Promise.all([
    phoneShown(deps, who, held),
    c.customerId ? deps.db.customer.findFirst({ where: { id: c.customerId, storeId: who.storeId }, select: { id: true, name: true, orderCount: true } }) : null,
    c.orderId ? deps.db.order.findFirst({ where: { id: c.orderId, storeId: who.storeId }, select: { id: true, number: true, status: true } }) : null,
    staffNames(deps, [c.assignedToId]),
    actorPermissions(deps.db, who.actor, { storeId: who.storeId }),
    personOf(deps.db, who.storeId, c.contactId, c.id),
    ctxOn.enabled ? chatContextOf(deps, who, { customerId: c.customerId, phone: c.contact.phone }, { recent: ctxOn.recentOrders }) : null,
    shareOrderIds.length ? deps.db.order.findMany({ where: { storeId: who.storeId, id: { in: shareOrderIds } }, select: { id: true, number: true } }) : [],
  ]);
  const shareOf = new Map(shares.map((s) => [s.messageId!, s]));
  const numberOf = new Map(shareOrders.map((o) => [o.id, o.number]));
  return {
    id: c.id,
    refCode: c.refCode,
    status: c.status as ConversationStatus,
    subject: c.subject,
    version: c.updatedAt.toISOString(),
    channel: c.channel,
    contact: { name: c.contact.displayName, phone: shown(c.contact.phone) },
    customer: customer ? { id: customer.id, name: customer.name, orderCount: customer.orderCount } : null,
    order: order ? { id: order.id, number: order.number, status: order.status } : null,
    assignedTo: c.assignedToId ? { id: c.assignedToId, name: names.get(c.assignedToId) ?? '' } : null,
    firstResponseAt: c.firstResponseAt,
    resolvedAt: c.resolvedAt,
    waitingSince: c.waitingSince,
    createdAt: c.createdAt,
    messages: c.messages.map((m) => ({
      id: m.id,
      direction: (m.isInternalNote ? 'NOTE' : m.direction === 'IN' ? 'IN' : 'OUT') as ThreadMessage['direction'],
      sender: { type: m.senderType, name: m.senderName },
      body: m.body,
      isNote: m.isInternalNote,
      status: m.status,
      failReason: m.failReason,
      sentAt: m.sentAt,
      files: m.attachments.map((a) => ({ id: a.id, kind: a.kind, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes, status: a.status, ready: !!a.assetId && !a.removedAt })),
      share: (() => {
        const s = shareOf.get(m.id);
        if (!s) return null;
        const number = s.orderId ? numberOf.get(s.orderId) : undefined;
        return { productId: s.productId, refCode: s.refCode, openedAt: s.clickedAt, order: s.orderId && number ? { id: s.orderId, number } : null };
      })(),
    })),
    events: c.events.map((e) => ({ id: e.id, kind: e.kind, actor: { type: e.actorType, name: e.actorName }, data: (e.data as Record<string, unknown> | null) ?? null, at: e.createdAt })),
    person,
    context,
    you: { id: who.actor.staffUserId, reply: perms.has('support.reply'), assign: perms.has('support.assign'), identity: perms.has('support.identity'), catalogue: catOn.enabled && perms.has('support.reply') },
  };
}

// ------------------------------------------------------------------------------------------------------------ files

export interface StoredFile {
  assetId: string;
  fileName: string | null;
  contentType: string;
  storage: string;
  storageKey: string;
}

/** Where one file of a conversation is stored, for the screen to open it (`support.read`). */
export async function supportFile(deps: Pick<SupportDeps, 'db'>, who: Who, attachmentId: string): Promise<StoredFile> {
  await allow(deps, who, 'support.read');
  if (!z.uuid().safeParse(attachmentId).success) throw new SupportError('NOT_FOUND', 'no such file', ['id']);
  const a = await deps.db.messageAttachment.findFirst({ where: { id: attachmentId, storeId: who.storeId } });
  if (!a || a.removedAt) throw new SupportError('NOT_FOUND', 'no such file', ['id']);
  if (!a.assetId) throw new SupportError('FILE_PENDING', 'the file is still being copied from the channel', ['id']);
  const asset = await deps.db.mediaAsset.findFirst({ where: { id: a.assetId, storeId: who.storeId }, select: { id: true, mimeType: true, storage: true, storageKey: true, originalFileName: true } });
  if (!asset) throw new SupportError('NOT_FOUND', 'no such file', ['id']);
  return { assetId: asset.id, fileName: a.fileName ?? asset.originalFileName, contentType: asset.mimeType, storage: asset.storage, storageKey: asset.storageKey };
}
