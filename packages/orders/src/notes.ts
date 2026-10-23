// PR 147 — notes and internal flags on an order. A note is the team's (internal by default; never shown to the
// customer, B5); it is archived, never deleted (CLAUDE.md rule 3), and every add or archive leaves a timeline row and an
// audit row. A note does not change the order, so it does not make another person's screen stale. The flags are keys of
// the owner's list `orders.flags.list` ("call first", "check the size" …); setting them is an order command (lock,
// version, timeline, audit) through the one order service.
import { z } from 'zod';
import { allow, nowOf, parse, setting, TX, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { auditRow, eventRow, execute, lockOrder, staffBy, type CommandOptions, type CommandResult } from './service';

export interface OrderNoteView {
  id: string;
  body: string;
  isInternal: boolean;
  authorId: string | null;
  authorName: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

const uuid = z.uuid();
const checkId = (id: string, what: string) => {
  if (!uuid.safeParse(id).success) throw new OrdersError('NOT_FOUND', `no such ${what}`, [what === 'order' ? 'orderId' : 'noteId']);
};

/** Adds a note to the order (internal unless the caller says otherwise). */
export async function addNote(deps: OrdersDeps, who: Who, orderId: string, input: unknown): Promise<OrderNoteView> {
  await allow(deps, who, 'orders.notes');
  checkId(orderId, 'order');
  const max = await setting(deps, who.storeId, 'orders.notes.maxChars');
  const d = parse(z.object({ body: z.string().trim().min(1), isInternal: z.boolean().default(true) }).strict(), input, 'note');
  if ([...d.body].length > max) throw new OrdersError('INVALID_INPUT', 'the note is too long', ['body'], { maxChars: max });
  const by = staffBy(who.actor, who.ctx);
  const row = await deps.db.$transaction(async (tx) => {
    // the lock keeps the note in order with the order's commands on the timeline
    const o = await lockOrder(tx, who.storeId, orderId);
    const n = await tx.orderNote.create({ data: { storeId: o.storeId, orderId: o.id, body: d.body, isInternal: d.isInternal, authorId: who.actor.staffUserId } });
    await eventRow(tx, by, { storeId: o.storeId, orderId: o.id, type: 'order.note', data: { noteId: n.id, isInternal: n.isInternal } });
    await auditRow(tx, by, { storeId: o.storeId, action: 'order.note.add', entityType: 'OrderNote', entityId: n.id, before: null, after: { orderId: o.id, isInternal: n.isInternal, chars: [...n.body].length } });
    return n;
  }, TX);
  return { ...view(row), authorName: null };
}

/** Archives a note (it stays in the database and in the timeline). */
export async function archiveNote(deps: OrdersDeps, who: Who, orderId: string, noteId: string): Promise<OrderNoteView> {
  await allow(deps, who, 'orders.notes');
  checkId(orderId, 'order');
  checkId(noteId, 'note');
  const by = staffBy(who.actor, who.ctx);
  const now = nowOf(deps);
  const row = await deps.db.$transaction(async (tx) => {
    const o = await lockOrder(tx, who.storeId, orderId);
    const n = await tx.orderNote.findFirst({ where: { id: noteId, storeId: o.storeId, orderId: o.id } });
    if (!n) throw new OrdersError('NOT_FOUND', 'no such note', ['noteId']);
    if (n.archivedAt) return n;
    const after = await tx.orderNote.update({ where: { id: n.id }, data: { archivedAt: now } });
    await eventRow(tx, by, { storeId: o.storeId, orderId: o.id, type: 'order.note.archived', data: { noteId: n.id } });
    await auditRow(tx, by, { storeId: o.storeId, action: 'order.note.archive', entityType: 'OrderNote', entityId: n.id, before: { archivedAt: null }, after: { archivedAt: now } });
    return after;
  }, TX);
  return { ...view(row), authorName: null };
}

/** The order's notes, newest first; archived ones only when asked for. */
export async function listNotes(deps: OrdersDeps, who: Who, orderId: string, opts: { archived?: boolean } = {}): Promise<OrderNoteView[]> {
  await allow(deps, who, 'orders.read');
  checkId(orderId, 'order');
  return notesOf(deps, who.storeId, orderId, opts);
}

/** The notes with their authors' names (no permission check: the caller has checked `orders.read`). */
export async function notesOf(deps: OrdersDeps, storeId: number, orderId: string, opts: { archived?: boolean } = {}): Promise<OrderNoteView[]> {
  const rows = await deps.db.orderNote.findMany({ where: { storeId, orderId, ...(opts.archived ? {} : { archivedAt: null }) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const ids = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
  const names = new Map((await deps.db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({ ...view(r), authorName: r.authorId ? (names.get(r.authorId) ?? null) : null }));
}

const view = (r: { id: string; body: string; isInternal: boolean; authorId: string | null; archivedAt: Date | null; createdAt: Date }): Omit<OrderNoteView, 'authorName'> => ({
  id: r.id,
  body: r.body,
  isInternal: r.isInternal,
  authorId: r.authorId,
  archivedAt: r.archivedAt,
  createdAt: r.createdAt,
});

export const flagsInput = z.object({ flags: z.array(z.string().trim().min(1).max(60)).max(50) }).strict();

/** Sets the order's internal flags to exactly this list (each a key of `orders.flags.list`). */
export async function setFlags(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.notes');
  checkId(orderId, 'order');
  const d = parse(flagsInput, input, 'flags');
  const list = await setting(deps, who.storeId, 'orders.flags.list');
  const known = new Set(list.map((f) => f.key));
  const unknown = d.flags.filter((f) => !known.has(f));
  if (unknown.length) throw new OrdersError('INVALID_INPUT', 'a flag is not on the list', unknown.map((f) => `flags: ${f}`));
  const flags = [...new Set(d.flags)];
  return execute(deps, { storeId: who.storeId, orderId }, staffBy(who.actor, who.ctx), {
    command: 'setFlags',
    input: { flags },
    effect: async (_tx, o) => ({
      data: { internalFlags: flags },
      eventData: { added: flags.filter((f) => !o.internalFlags.includes(f)), removed: o.internalFlags.filter((f) => !flags.includes(f)) },
    }),
  }, opts);
}
