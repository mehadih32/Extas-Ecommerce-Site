// S28 · PR 680 — the pure parts of the photo manager: which kind a new photo is, moving a photo in the order, and the
// notes (with whether one click can fix them). No screen code here, so the tests need no browser.
import type { QualityIssue } from '@extas/media';

/** The kind a new photo gets by its place in the colour's row: front, back, detail, on model, then other. */
const ORDER = ['FRONT', 'BACK', 'DETAIL', 'ON_MODEL'] as const;
export const roleForNext = (count: number): string => ORDER[count] ?? 'OTHER';

/** The list with `id` moved by `delta` places (never past either end); the same list when it cannot move. */
export function move(ids: readonly string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const out = [...ids];
  out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}

/** Drag and drop: `id` takes the place of `onto`. */
export function dropOnto(ids: readonly string[], id: string, onto: string): string[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(onto);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const out = [...ids];
  out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}

export const NOTE_TONE: Record<QualityIssue, 'bad' | 'warn'> = {
  small: 'bad',
  blurry: 'bad',
  cut: 'bad',
  dark: 'warn',
  ratio: 'warn',
};
export const FIXABLE_NOTES: readonly QualityIssue[] = ['ratio', 'dark'];

/** Image files taken from a drop or a paste, in the order given (anything else is left out). */
export function imageFiles(list: ArrayLike<{ type: string }> | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/')) as File[];
}

/** The photos of one colour group, in order, from a flat gallery. */
export function groupOf<T extends { colourId: string | null; sortOrder: number }>(photos: readonly T[], colourId: string | null): T[] {
  return photos.filter((p) => p.colourId === colourId).sort((a, b) => a.sortOrder - b.sortOrder);
}
