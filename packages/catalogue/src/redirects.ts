// PR 590 (with PR 235/527/587 of S11) — a changed link never breaks. When a product's or a category's link changes, the
// old path is kept in the Redirect table and forwards (301, setting `naming.redirectStatusCode`) to the new one, so
// Google rank and sales carry over. There are never chains: every older link that pointed at the old path is moved to
// point at the new one in the same transaction, and a link that comes back into use stops forwarding (the row is
// switched off, never deleted). The same table holds the WordPress migration map (PR 587).
import { CatalogueError } from './errors';
import { normalizePath } from './text';
import { logChange, type Tx, type Who } from './context';

export type RedirectSource = 'product-slug' | 'category-slug';

export interface MovedLink {
  from: string;
  to: string;
  /** Older links that now point straight at the new path (no chains). */
  repointed: number;
}

/**
 * Records `oldPath → newPath`. Returns null when nothing moves. Refuses when the new path is an old link that forwards
 * somewhere else (another page's history must not be taken over silently).
 */
export async function moveLink(tx: Tx, who: Who, oldPath: string, newPath: string, source: RedirectSource, statusCode: number, now: Date): Promise<MovedLink | null> {
  const from = normalizePath(oldPath);
  const to = normalizePath(newPath);
  if (from === to) return null;
  const storeId = who.storeId;

  // The new path may have been an old link of this same page: it is in use again, so it stops forwarding.
  const reused = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: to } } });
  if (reused && reused.enabled && reused.toPath !== from) {
    throw new CatalogueError('SLUG_TAKEN', 'this link is an old link that forwards to another page', [`${to} → ${reused.toPath}`]);
  }
  if (reused?.enabled) {
    await tx.redirect.update({ where: { id: reused.id }, data: { enabled: false } });
    await log(tx, who, 'redirect.disable', reused.id, { enabled: true, toPath: reused.toPath }, { enabled: false, reason: 'link in use again' });
  }

  // No chains: everything that pointed at the old path now points at the new one.
  const older = await tx.redirect.findMany({ where: { storeId, toPath: from, enabled: true, archivedAt: null, fromPath: { not: to } } });
  for (const r of older) {
    await tx.redirect.update({ where: { id: r.id }, data: { toPath: to } });
    await log(tx, who, 'redirect.repoint', r.id, { toPath: from }, { toPath: to });
  }

  const existing = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: from } } });
  if (existing) {
    await tx.redirect.update({ where: { id: existing.id }, data: { toPath: to, enabled: true, statusCode, source, archivedAt: null } });
    await log(tx, who, 'redirect.update', existing.id, { toPath: existing.toPath, enabled: existing.enabled }, { toPath: to, enabled: true });
  } else {
    const row = await tx.redirect.create({ data: { storeId, fromPath: from, toPath: to, statusCode, source, enabled: true } });
    await log(tx, who, 'redirect.create', row.id, null, { fromPath: from, toPath: to, statusCode, source, at: now.toISOString() });
  }
  return { from, to, repointed: older.length };
}

/** An enabled redirect whose old path is `path` and that points elsewhere: the path belongs to another page's history. */
export async function forwardingElsewhere(tx: Tx, storeId: number, path: string, ownPath: string | null): Promise<string | null> {
  const r = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: normalizePath(path) } } });
  if (!r || !r.enabled || r.archivedAt) return null;
  return ownPath && normalizePath(r.toPath) === normalizePath(ownPath) ? null : r.toPath;
}

const log = (tx: Tx, who: Who, action: string, id: string, before: unknown, after: unknown) => logChange(tx, who, action, 'Redirect', id, before, after);
