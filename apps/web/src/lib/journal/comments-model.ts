// S12 · PR 251 (register "Comment handling, or the decision to run without comments") — the pure rules of a reader's
// comment under a journal article (`blog.comments`, off as shipped = the journal runs without comments): what a comment
// may hold, the name it is shown with, and how a status change and its Undo move. The database side is comments.ts.
//
// Statuses (ReviewStatus): PENDING waits for a person with `blog.publish`; APPROVED is shown under the article; HIDDEN
// was hidden again. A change keeps the status it replaced (prevStatus), so "back" (the toast's Undo) puts it back.
// Nothing is ever deleted, and nothing is shown without a person's press.

/** The statuses a comment moves between. */
export const COMMENT_STATES = ['PENDING', 'APPROVED', 'HIDDEN'] as const;
export type CommentState = (typeof COMMENT_STATES)[number];
/** What a person may ask: show, hide, or put back what the last change replaced. */
export const COMMENT_MOVES = ['APPROVED', 'HIDDEN', 'back'] as const;
export type CommentMove = (typeof COMMENT_MOVES)[number];

/** A comment shorter than this is not a comment (one emoji, a dot). */
export const BODY_MIN = 2; // hardcode-ok: a sanity floor on a text field, not a business number
/** The longest name a guest may give. */
export const NAME_MAX = 60; // hardcode-ok: a field length, not a business number

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // hardcode-ok: control characters, not a business value

/** The comment's words as kept: trimmed, without control characters, at most one empty line in a row; null = refused. */
export function cleanBody(raw: unknown, maxChars: number): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(/\n{3,}/g, '\n\n').trim();
  if ([...s].length < BODY_MIN || [...s].length > maxChars) return null;
  return s;
}

/** A guest's name as kept (one line, trimmed, at most NAME_MAX); null = none given. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  return s ? [...s].slice(0, NAME_MAX).join('') : null;
}

/** The name a comment is shown with: only the first word (a customer's full name is never printed); else the fallback. */
export function shownName(name: string | null | undefined, fallback: string): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first || fallback;
}

/** The status after a move, and the one it replaced (kept for Undo). "back" with nothing to go back to changes nothing. */
export function moved(current: CommentState, prev: CommentState | null, to: CommentMove): { status: CommentState; prevStatus: CommentState | null } | null {
  if (to === 'back') return prev && prev !== current ? { status: prev, prevStatus: current } : null;
  return to === current ? null : { status: to, prevStatus: current };
}
