// S28 · PR 692 (CN-048) — Inbox › Quick replies. A person with `support.reply` lists and uses them (the reply box's "/"
// picker); `support.settings` adds, edits, archives and restores them. A quick reply is never deleted (archive hides it
// from chats; restore brings it back). The shop's first visit makes the 8 starters, once (they are the shop's to edit).
// Off as shipped (`support.savedReplies`): while off, nothing is listed or changed. Every change is audited. Nothing
// here sends a message: a quick reply only puts text in the box, and a person presses Send.
import { z } from 'zod';
import { allow, logChange, nowOf, parse, setting, SupportError, type SupportDeps, type Who } from './context';
import { savedReplyInput, STARTER_REPLIES } from './saved-replies-pure';

export interface SavedReplyRow {
  id: string;
  shortcut: string;
  bodyEn: string;
  bodyBn: string;
  usedCount: number;
  archivedAt: Date | null;
}

const select = { id: true, shortcut: true, bodyEn: true, bodyBn: true, usedCount: true, archivedAt: true } as const;

async function rules(deps: Pick<SupportDeps, 'settings'>, storeId: number) {
  const r = await setting(deps, storeId, 'support.savedReplies');
  if (!r.enabled) throw new SupportError('SAVED_REPLIES_OFF', 'quick replies are switched off');
  return r;
}

/** The starters, once: only a store with no quick reply at all (archived ones count) gets them. */
async function ensureStarters(deps: Pick<SupportDeps, 'db'>, storeId: number): Promise<void> {
  if ((await deps.db.supportSavedReply.count({ where: { storeId } })) > 0) return;
  await deps.db.supportSavedReply.createMany({ data: STARTER_REPLIES.map((r) => ({ storeId, ...r })), skipDuplicates: true });
}

export interface SavedReplyList {
  enabled: boolean;
  maxChars: number;
  active: SavedReplyRow[];
  archived: SavedReplyRow[];
  /** The most used active one, or null while none was used. */
  top: SavedReplyRow | null;
}

/** The list for the page (both views) and the reply box (active). `support.reply`. Off: empty, `enabled` false. */
export async function listSavedReplies(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who): Promise<SavedReplyList> {
  await allow(deps, who, 'support.reply');
  const r = await setting(deps, who.storeId, 'support.savedReplies');
  if (!r.enabled) return { enabled: false, maxChars: r.maxChars, active: [], archived: [], top: null };
  await ensureStarters(deps, who.storeId);
  const rows = await deps.db.supportSavedReply.findMany({ where: { storeId: who.storeId }, select, orderBy: [{ shortcut: 'asc' }] });
  const active = rows.filter((x) => x.archivedAt === null);
  const top = active.filter((x) => x.usedCount > 0).sort((a, b) => b.usedCount - a.usedCount)[0] ?? null;
  return { enabled: true, maxChars: r.maxChars, active, archived: rows.filter((x) => x.archivedAt !== null), top };
}

const editInput = z.object({ id: z.string().uuid().optional() }).passthrough();

/** Adds a quick reply, or edits one when `id` is given. `support.settings`. A short name already used is refused. */
export async function saveSavedReply(deps: SupportDeps, who: Who, input: unknown): Promise<SavedReplyRow> {
  await allow(deps, who, 'support.settings');
  const set = await rules(deps, who.storeId);
  const { id, ...rest } = parse(editInput, input, 'quick reply');
  const data = parse(savedReplyInput(set.maxChars), rest, 'quick reply');
  const staffId = who.actor.staffUserId ?? null;
  return deps.db.$transaction(async (tx) => {
    const clash = await tx.supportSavedReply.findFirst({ where: { storeId: who.storeId, shortcut: data.shortcut, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
    if (clash) throw new SupportError('SHORTCUT_TAKEN', 'this short name is already used', ['shortcut']);
    if (!id) {
      const row = await tx.supportSavedReply.create({ data: { storeId: who.storeId, ...data, createdById: staffId }, select });
      await logChange(tx, who, { action: 'support.savedReply.add', entityType: 'SupportSavedReply', entityId: row.id, before: null, after: { shortcut: row.shortcut } });
      return row;
    }
    const before = await tx.supportSavedReply.findFirst({ where: { id, storeId: who.storeId }, select });
    if (!before) throw new SupportError('NOT_FOUND', 'no such quick reply');
    const row = await tx.supportSavedReply.update({ where: { id }, data, select });
    await logChange(tx, who, { action: 'support.savedReply.edit', entityType: 'SupportSavedReply', entityId: id, before: { shortcut: before.shortcut, bodyEn: before.bodyEn, bodyBn: before.bodyBn }, after: { shortcut: row.shortcut, bodyEn: row.bodyEn, bodyBn: row.bodyBn } });
    return row;
  });
}

/** Archive (hide from chats) or restore. Never a delete. `support.settings`. */
export async function archiveSavedReply(deps: SupportDeps, who: Who, id: string, archive: boolean): Promise<SavedReplyRow> {
  await allow(deps, who, 'support.settings');
  await rules(deps, who.storeId);
  return deps.db.$transaction(async (tx) => {
    const before = await tx.supportSavedReply.findFirst({ where: { id, storeId: who.storeId }, select });
    if (!before) throw new SupportError('NOT_FOUND', 'no such quick reply');
    const row = await tx.supportSavedReply.update({ where: { id }, data: { archivedAt: archive ? nowOf(deps) : null }, select });
    await logChange(tx, who, { action: archive ? 'support.savedReply.archive' : 'support.savedReply.restore', entityType: 'SupportSavedReply', entityId: id, before: { archived: before.archivedAt !== null }, after: { archived: archive } });
    return row;
  });
}

/** Counts one use (a person picked it in a chat). Never fails the reply: an unknown or archived one counts nothing. `support.reply`. */
export async function useSavedReply(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who, id: string): Promise<boolean> {
  await allow(deps, who, 'support.reply');
  const r = await setting(deps, who.storeId, 'support.savedReplies');
  if (!r.enabled) return false;
  const done = await deps.db.supportSavedReply.updateMany({ where: { id, storeId: who.storeId, archivedAt: null }, data: { usedCount: { increment: 1 } } });
  return done.count > 0;
}
