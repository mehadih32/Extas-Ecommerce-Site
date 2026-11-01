// S22 · PR 434 (Blueprint B4.12, B4.14 item 10) — the block list, employee permissions and customer data privacy inside
// support.
//
// The block list (`support.blockList`, off as it ships): a person with `support.block` — no role has it but the owner's
// until he gives it, since blocking anyone is his decision (CLAUDE.md rule 6) — puts a chat's person (every channel of
// that person: the contact and the contacts joined to it, PR 427) on the list with a reason, or takes them off. Nothing
// is deleted: their messages are still received and kept, but their chats leave every working view for the "Blocked"
// view — no ticket, no follow-up, and the shop's reply is refused (BLOCKED). Each change is a line in the chat's log and
// an audit row. Switched off, nobody counts as blocked (the list is kept and counts again when it is switched on).
//
// Privacy (`support.privacy`, off as it ships): `ownChatsOnly` — an employee without `support.assign` sees only the chats
// given to them and the ones nobody took; `maskNumbersInText` — numbers customers type in their messages are masked by
// `customers.phoneMask` for anyone without `customers.phone`, like the chat's own number (PR 284).
import type { Prisma } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import { SUPPORT_BLOCK_REASON_MAX } from '@extas/settings';
import { z } from 'zod';
import { allow, logChange, nowOf, parse, setting, SupportError, TX, type Db, type SupportDeps, type Who } from './context';
import { maskPhonesInText } from './identity-pure';

export { SUPPORT_BLOCK_REASON_MAX } from '@extas/settings';

type Tx = Prisma.TransactionClient;

/** How one reader sees support: their own chats only, numbers in messages masked, the block list on. */
export interface SupportLens {
  /** Only chats given to this person or taken by nobody. */
  ownOnly: boolean;
  /** The block list is on: blocked people's chats live in the Blocked view. */
  blockOn: boolean;
  /** A message's words as this person may see them. */
  text: (s: string | null) => string | null;
}

/** The reader's lens from the two settings and what they hold. */
export async function supportLens(deps: Pick<SupportDeps, 'settings'>, who: Who, held: Set<PermissionKey>): Promise<SupportLens> {
  const [privacy, block] = await Promise.all([setting(deps, who.storeId, 'support.privacy'), setting(deps, who.storeId, 'support.blockList')]);
  const mask = privacy.maskNumbersInText && !held.has('customers.phone') ? await setting(deps, who.storeId, 'customers.phoneMask') : null;
  return {
    ownOnly: privacy.ownChatsOnly && !held.has('support.assign'),
    blockOn: block.enabled,
    text: (s) => (s && mask ? maskPhonesInText(s, mask) : s),
  };
}

/** The chats a reader may see at all (their own and nobody's, when `ownOnly`). */
export const visibleWhere = (lens: SupportLens, me: string | null): Prisma.ConversationWhereInput => (lens.ownOnly ? { OR: [{ assignedToId: null }, ...(me ? [{ assignedToId: me }] : [])] } : {});

/** Whether a reader may open this chat. */
export const mayOpen = (lens: SupportLens, me: string | null, assignedToId: string | null): boolean => !lens.ownOnly || !assignedToId || assignedToId === me;

/**
 * Own chats only on every action that names a chat (assign, status, drafts, follow-ups, the chat bag, identity): another
 * employee's chat is refused as if it did not exist (NOT_FOUND), like the inbox and the thread. One read, only when on.
 */
export async function ownChat(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who, held: Set<PermissionKey>, conversationId: string): Promise<void> {
  const lens = await supportLens(deps, who, held);
  if (!lens.ownOnly || !z.uuid().safeParse(conversationId).success) return;
  const c = await deps.db.conversation.findFirst({ where: { id: conversationId, storeId: who.storeId }, select: { assignedToId: true } });
  if (c && !mayOpen(lens, who.actor.staffUserId, c.assignedToId)) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
}

/** Whether the chat's person is on the block list now (the list switched on). */
export async function isBlocked(db: Db, storeId: number, conversationId: string): Promise<boolean> {
  const block = await db.conversation.findFirst({ where: { id: conversationId, storeId }, select: { contact: { select: { blockedAt: true } } } });
  return !!block?.contact.blockedAt;
}

// ------------------------------------------------------------------------------------------------------------ block

export const blockInput = z.object({ conversationId: z.uuid(), reason: z.string().trim().min(1).max(SUPPORT_BLOCK_REASON_MAX), version: z.string().max(40).optional() }).strict();
export const unblockInput = z.object({ conversationId: z.uuid(), version: z.string().max(40).optional() }).strict();

async function lockChat(tx: Tx, who: Who, id: string, version?: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Conversation" WHERE "id" = ${id}::uuid AND "storeId" = ${who.storeId} FOR UPDATE`;
  if (!rows.length) throw new SupportError('NOT_FOUND', 'no such conversation', ['id']);
  const c = await tx.conversation.findUniqueOrThrow({ where: { id }, select: { id: true, updatedAt: true, contact: { select: { id: true, mergedIntoId: true, blockedAt: true, blockReason: true } } } });
  if (version !== undefined && version !== c.updatedAt.toISOString()) throw new SupportError('STALE', 'the conversation changed; read it again', ['version'], { version: c.updatedAt.toISOString() });
  return c;
}

async function change(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, conversationId: string, version: string | undefined, reason: string | null): Promise<{ blocked: boolean; contacts: number }> {
  await allow(deps, who, 'support.block');
  if (!(await setting(deps, who.storeId, 'support.blockList')).enabled) throw new SupportError('BLOCK_OFF', 'the support block list is switched off in Support settings', ['support.blockList']);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const c = await lockChat(tx, who, conversationId, version);
    const root = c.contact.mergedIntoId ?? c.contact.id;
    // the whole person: every channel joined to the same first contact
    const people = await tx.supportContact.findMany({ where: { storeId: who.storeId, OR: [{ id: root }, { mergedIntoId: root }, { id: c.contact.id }] }, select: { id: true, blockedAt: true, blockReason: true } });
    const ids = people.map((p) => p.id);
    await tx.supportContact.updateMany({ where: { id: { in: ids } }, data: reason ? { blockedAt: now, blockedById: who.actor.staffUserId, blockReason: reason } : { blockedAt: null, blockedById: null, blockReason: null } });
    const name = who.actor.staffUserId ? ((await tx.staffUser.findUnique({ where: { id: who.actor.staffUserId }, select: { displayName: true } }))?.displayName ?? null) : null;
    await tx.conversationEvent.create({ data: { storeId: who.storeId, conversationId: c.id, kind: reason ? 'BLOCKED' : 'UNBLOCKED', actorType: 'STAFF', actorStaffId: who.actor.staffUserId, actorName: name, data: { contacts: ids.length, ...(reason ? { reason } : {}) }, createdAt: now } });
    // the chat's version moves so another screen reads it again
    await tx.conversation.update({ where: { id: c.id }, data: { updatedAt: now } });
    await logChange(tx, who, {
      action: reason ? 'support.block' : 'support.unblock',
      entityType: 'SupportContact',
      entityId: root,
      before: { contacts: people.map((p) => ({ id: p.id, blocked: !!p.blockedAt, reason: p.blockReason })) },
      after: { contacts: ids.map((id) => ({ id, blocked: !!reason, reason })) },
    });
    return { blocked: !!reason, contacts: ids.length };
  }, TX);
}

/** Put the chat's person on the support block list, with a reason (`support.block`; the list on). */
export async function blockChatPerson(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, input: unknown): Promise<{ blocked: boolean; contacts: number }> {
  const d = parse(blockInput, input, 'block');
  return change(deps, who, d.conversationId, d.version, d.reason);
}

/** Take the chat's person off the support block list (`support.block`; the list on). */
export async function unblockChatPerson(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, input: unknown): Promise<{ blocked: boolean; contacts: number }> {
  const d = parse(unblockInput, input, 'unblock');
  return change(deps, who, d.conversationId, d.version, null);
}
