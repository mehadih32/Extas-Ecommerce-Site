// S14 · PR 297 — customer tags and internal notes (demo 97u-adm2-customers.js "Tags & notes": one box, "Note or #tag").
//
// - `tagsAndNotes` (`customers.read`): a person's tags (over the profile he stays under and the profiles merged into it)
//   and his notes, pinned first and then newest first, each with who wrote it; the store's tags for suggestions.
// - `addNoteOrTag` (`customers.notes`): words starting with "#" put that tag on him (made the first time the store uses
//   the name; a tag taken off earlier is put back), anything else is a note for the team, optionally pinned.
// - `untagCustomer`, `pinNote`, `archiveNote` (`customers.notes`): a tag taken off and a note put away are archived,
//   never deleted. Every change is audited in its own transaction.
// A note is for the team only: it never reaches the customer, and an erasure clears its words (erasure.ts).
import { audit, requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, nowOf, parse, TX, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { familyOf, profilesOf } from './family';

/** The longest tag name and note (the box's own limits). */
export const TAG_MAX = 40;
export const NOTE_MAX = 2_000;
/** How many of the store's tags are offered as suggestions. */
const SUGGESTIONS = 50;

export interface CustomerTagView {
  id: string;
  name: string;
}

export interface CustomerNoteView {
  id: string;
  body: string;
  pinned: boolean;
  by: string | null;
  at: Date;
}

export interface TagsAndNotes {
  tags: CustomerTagView[];
  notes: CustomerNoteView[];
  /** The store's live tags, by name (for the box's suggestions). */
  storeTags: CustomerTagView[];
  canWrite: boolean;
}

/** The person (survivor and merged profiles) behind a profile id, or NOT_FOUND. */
async function personOf(deps: CustomersDeps, who: Who, customerId: string) {
  const found = await familyOf(deps.db, who.storeId, customerId);
  if (!found) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  return { survivorId: found.family.root.id, ids: profilesOf(found.family).map((p) => p.id) };
}

/** A person's tags and notes (see the file header). */
export async function tagsAndNotes(deps: CustomersDeps, who: Who, customerId: string): Promise<TagsAndNotes> {
  await allow(deps, who, 'customers.read');
  const held = await requirePermission(deps.db, who.actor, 'customers.read', { storeId: who.storeId });
  const p = await personOf(deps, who, customerId);
  const [links, notes, storeTags] = await Promise.all([
    deps.db.customerTagLink.findMany({ where: { storeId: who.storeId, customerId: { in: p.ids }, archivedAt: null, tag: { archivedAt: null } }, select: { tag: { select: { id: true, name: true } } } }),
    deps.db.customerNote.findMany({ where: { storeId: who.storeId, customerId: { in: p.ids }, archivedAt: null }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], select: { id: true, body: true, pinned: true, authorId: true, createdAt: true } }),
    deps.db.customerTag.findMany({ where: { storeId: who.storeId, archivedAt: null }, orderBy: { name: 'asc' }, take: SUGGESTIONS, select: { id: true, name: true } }),
  ]);
  const authors = [...new Set(notes.map((n) => n.authorId).filter((x): x is string => !!x))];
  const names = new Map((authors.length ? await deps.db.staffUser.findMany({ where: { id: { in: authors } }, select: { id: true, displayName: true } }) : []).map((s) => [s.id, s.displayName]));
  const tags = [...new Map(links.map((l) => [l.tag.id, l.tag])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    tags,
    notes: notes.map((n) => ({ id: n.id, body: n.body, pinned: n.pinned, by: n.authorId ? (names.get(n.authorId) ?? null) : null, at: n.createdAt })),
    storeTags,
    canWrite: held.has('customers.notes'),
  };
}

const addInput = z.object({ text: z.string().trim().min(1).max(NOTE_MAX), pinned: z.boolean().optional() }).strict();

/** "Note or #tag" (see the file header); answers with what was added. */
export async function addNoteOrTag(deps: CustomersDeps, who: Who, customerId: string, input: unknown): Promise<{ kind: 'tag'; tag: CustomerTagView } | { kind: 'note'; note: CustomerNoteView }> {
  await allow(deps, who, 'customers.notes');
  const d = parse(addInput, input, 'note');
  const p = await personOf(deps, who, customerId);
  const now = nowOf(deps);
  if (d.text.startsWith('#')) {
    const name = d.text.slice(1).trim().replace(/\s+/g, ' ');
    if (!name || name.length > TAG_MAX || name.includes('#')) throw new CustomersError('INVALID_INPUT', `a tag is 1–${TAG_MAX} characters after "#"`, ['text']);
    const run = () =>
      deps.db.$transaction(async (tx) => {
        const tag =
          (await tx.customerTag.findFirst({ where: { storeId: who.storeId, name: { equals: name, mode: 'insensitive' } }, select: { id: true, name: true, archivedAt: true } })) ??
          (await tx.customerTag.create({ data: { storeId: who.storeId, name }, select: { id: true, name: true, archivedAt: true } }));
        if (tag.archivedAt) await tx.customerTag.update({ where: { id: tag.id }, data: { archivedAt: null } });
        await tx.customerTagLink.upsert({
          where: { customerId_tagId: { customerId: p.survivorId, tagId: tag.id } },
          create: { storeId: who.storeId, customerId: p.survivorId, tagId: tag.id, addedById: who.actor.staffUserId },
          update: { archivedAt: null, addedById: who.actor.staffUserId },
        });
        await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.tag.add', entityType: 'Customer', entityId: p.survivorId, after: { tag: tag.name } }, who.ctx);
        return { kind: 'tag' as const, tag: { id: tag.id, name: tag.name } };
      }, TX);
    try {
      return await run();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return run(); // the same new tag at the same moment
      throw e;
    }
  }
  return deps.db.$transaction(async (tx) => {
    const n = await tx.customerNote.create({ data: { storeId: who.storeId, customerId: p.survivorId, body: d.text, pinned: d.pinned ?? false, authorId: who.actor.staffUserId, createdAt: now }, select: { id: true, body: true, pinned: true, createdAt: true } });
    await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.note.add', entityType: 'CustomerNote', entityId: n.id, after: { customerId: p.survivorId, pinned: n.pinned } }, who.ctx);
    return { kind: 'note' as const, note: { id: n.id, body: n.body, pinned: n.pinned, by: null, at: n.createdAt } };
  }, TX);
}

/** Takes a tag off the person (archived, never deleted). */
export async function untagCustomer(deps: CustomersDeps, who: Who, customerId: string, tagId: string): Promise<{ removed: number }> {
  await allow(deps, who, 'customers.notes');
  const p = await personOf(deps, who, customerId);
  return deps.db.$transaction(async (tx) => {
    const r = await tx.customerTagLink.updateMany({ where: { storeId: who.storeId, customerId: { in: p.ids }, tagId, archivedAt: null }, data: { archivedAt: nowOf(deps) } });
    if (!r.count) throw new CustomersError('NOT_FOUND', 'this tag is not on this customer', ['tagId']);
    await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.tag.remove', entityType: 'Customer', entityId: p.survivorId, before: { tagId } }, who.ctx);
    return { removed: r.count };
  }, TX);
}

/** One of the person's live notes, or NOT_FOUND. */
async function noteOf(deps: CustomersDeps, who: Who, customerId: string, noteId: string) {
  const p = await personOf(deps, who, customerId);
  const n = await deps.db.customerNote.findFirst({ where: { id: noteId, storeId: who.storeId, customerId: { in: p.ids }, archivedAt: null }, select: { id: true, pinned: true } });
  if (!n) throw new CustomersError('NOT_FOUND', 'no such note', ['noteId']);
  return n;
}

/** Pins a note to the top, or unpins it. */
export async function pinNote(deps: CustomersDeps, who: Who, customerId: string, noteId: string, pinned: boolean): Promise<{ pinned: boolean }> {
  await allow(deps, who, 'customers.notes');
  if (typeof pinned !== 'boolean') throw new CustomersError('INVALID_INPUT', 'pinned is true or false', ['pinned']);
  const n = await noteOf(deps, who, customerId, noteId);
  if (n.pinned === pinned) return { pinned };
  await deps.db.$transaction(async (tx) => {
    await tx.customerNote.update({ where: { id: n.id }, data: { pinned } });
    await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.note.pin', entityType: 'CustomerNote', entityId: n.id, before: { pinned: n.pinned }, after: { pinned } }, who.ctx);
  }, TX);
  return { pinned };
}

/** Puts a note away (archived, never deleted). */
export async function archiveNote(deps: CustomersDeps, who: Who, customerId: string, noteId: string): Promise<{ archived: true }> {
  await allow(deps, who, 'customers.notes');
  const n = await noteOf(deps, who, customerId, noteId);
  await deps.db.$transaction(async (tx) => {
    await tx.customerNote.update({ where: { id: n.id }, data: { archivedAt: nowOf(deps) } });
    await audit(tx, who.actor, { storeId: who.storeId, action: 'customer.note.archive', entityType: 'CustomerNote', entityId: n.id }, who.ctx);
  }, TX);
  return { archived: true };
}
