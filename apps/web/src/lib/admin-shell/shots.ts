// S18 · PR 388 (Blueprint B7.5) — the Site manual's pictures with numbered marks. docs/admin-guide/marks.json names, for
// a page guide, the admin address and the parts of the page to mark; the smoke test (tools/smoke.mjs) opens each one on
// the phone and the computer screen after every deploy and every night, takes the picture and writes where each part
// sat as fractions of the screen (marks.json beside the pictures). Review R1 (security M1): admin pictures go only to
// the server's private smoke folder, never to docs/reports/smoke/latest/, so this folder has none and the manual shows
// no picture until they are taken on sample data (follow-up). This reads that file as data: every field is checked, a
// mark off the screen is dropped and the rest numbered 1, 2, 3 …; only a picture named in it is ever served
// (`shotFile`). No React, no database.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { guideDir } from './guide';
import { PAGE_GUIDE_ID } from './help-pages';

export type ShotScreen = 'phone' | 'desktop';
export const SHOT_SCREENS: readonly ShotScreen[] = ['desktop', 'phone'];

export interface ShotMark {
  n: number;
  label: string;
  /** Left, top, width and height as fractions (0–1) of the picture. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageShot {
  screen: ShotScreen;
  /** The picture's file name in the smoke folder (served by GET /api/admin/help/shot/<file>). */
  file: string;
  marks: ShotMark[];
}

export interface ShotBook {
  /** When the pictures were taken (the smoke run's time), or null. */
  at: string | null;
  byGuide: Record<string, PageShot[]>;
}

/** A picture's name as the smoke test writes it (`admin-help-manual-c-orders-desktop.jpg`). */
export const SHOT_FILE = /^[a-z0-9][a-z0-9-]{0,200}-(phone|desktop)\.jpg$/i;
// hardcode-ok: the longest mark label kept (a short name of a button), a technical bound on data read from a file
const LABEL_MAX = 80;

/** The smoke test's latest folder beside the guides (the server's copy of docs/, or the repository's). */
export const smokeDir = (dir: string | null = guideDir()) => (dir ? join(/*turbopackIgnore: true*/ dir, '..', 'reports', 'smoke', 'latest') : null);

const frac = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 2 ? v : null);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** One mark from the file, or null when it is not on the picture or is not well formed. */
function markOf(raw: unknown): Omit<ShotMark, 'n'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.shown !== true || typeof m.label !== 'string' || !m.label.trim() || m.label.length > LABEL_MAX) return null;
  const [x, y, w, h] = [frac(m.x), frac(m.y), frac(m.w), frac(m.h)];
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
  const left = clamp(x);
  const top = clamp(y);
  if (left >= 1 || top >= 1) return null;
  return { label: m.label.trim(), x: left, y: top, w: Math.min(w, 1 - left), h: Math.min(h, 1 - top) };
}

/** The file's content, checked: pictures by guide id, desktop first, each with its marks numbered from 1. */
export function parseShots(raw: unknown): ShotBook {
  const book: ShotBook = { at: null, byGuide: {} };
  if (!raw || typeof raw !== 'object') return book;
  const r = raw as Record<string, unknown>;
  if (typeof r.at === 'string' && r.at.length <= 40) book.at = r.at;
  if (!Array.isArray(r.shots)) return book;
  for (const s of r.shots as unknown[]) {
    if (!s || typeof s !== 'object') continue;
    const e = s as Record<string, unknown>;
    if (typeof e.guide !== 'string' || !PAGE_GUIDE_ID.test(e.guide)) continue;
    if (typeof e.screen !== 'string' || !(SHOT_SCREENS as readonly string[]).includes(e.screen)) continue;
    if (typeof e.screenshot !== 'string' || !SHOT_FILE.test(e.screenshot)) continue;
    const marks = (Array.isArray(e.marks) ? e.marks : []).map(markOf).filter((m): m is Omit<ShotMark, 'n'> => m !== null);
    const list = (book.byGuide[e.guide] ??= []);
    if (list.some((x) => x.screen === e.screen)) continue;
    list.push({ screen: e.screen as ShotScreen, file: e.screenshot, marks: marks.map((m, i) => ({ n: i + 1, ...m })) });
  }
  for (const list of Object.values(book.byGuide)) list.sort((a, b) => SHOT_SCREENS.indexOf(a.screen) - SHOT_SCREENS.indexOf(b.screen));
  return book;
}

/** The pictures of the latest smoke run, or an empty book when there is none yet. */
export async function readShots(dir: string | null = smokeDir()): Promise<ShotBook> {
  if (!dir) return { at: null, byGuide: {} };
  const text = await readFile(join(/*turbopackIgnore: true*/ dir, 'marks.json'), 'utf8').catch(() => null);
  if (text === null) return { at: null, byGuide: {} };
  try {
    return parseShots(JSON.parse(text));
  } catch {
    return { at: null, byGuide: {} };
  }
}

/** A picture the manual may show: named in marks.json, read from the smoke folder; null otherwise. */
export async function shotFile(file: string, dir: string | null = smokeDir()): Promise<Buffer | null> {
  if (!dir || !SHOT_FILE.test(file)) return null;
  const book = await readShots(dir);
  const listed = Object.values(book.byGuide).some((list) => list.some((s) => s.file === file));
  if (!listed) return null;
  return readFile(join(/*turbopackIgnore: true*/ dir, file)).catch(() => null);
}
