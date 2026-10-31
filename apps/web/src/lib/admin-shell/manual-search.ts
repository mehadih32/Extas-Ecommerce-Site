// S18 · PR 389 (Blueprint B7.5, §5 HLP-01) — the Site manual's search and "What's new".
// Search: every word typed must appear in a page guide (or a section overview) of a section the person sees; a word in
// the title counts more; each hit links to its place in the manual with a short piece of the text around the word. The
// guides are read from the server's copy of the docs, so the search knows a page guide from the deploy it came with.
// What's new: the newest built PRs from the master register's status rows (docs/MASTER-REGISTER.md, copied to the
// server with the docs) with their plain Bengali line from docs/stages/bn.json (English: the register's own title).
// Read-only, no database. Numbers below are technical bounds on reading text, not shop rules.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdminSectionId } from '@extas/settings';
import { guideDir, readPageGuide, type Block, type Inline } from './guide';
import { sectionPages } from './help-pages';
import { manualAnchor, manualSections } from './manual';
import type { ShellViewer } from './sections';

// hardcode-ok: search bounds (shortest query, words used, hits shown, letters of text around a hit)
export const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_WORDS = 6; // hardcode-ok: see above
export const SEARCH_MAX_HITS = 30; // hardcode-ok: see above
const SNIPPET = 80; // hardcode-ok: see above
// hardcode-ok: how many built PRs "What's new" lists, and the longest English line taken from a register row
export const WHATS_NEW_MAX = 25;
const LINE_MAX = 160; // hardcode-ok: see above

export interface ManualHit {
  /** `<section>/<page>`, or `<section>/index` for the section overview. */
  id: string;
  section: AdminSectionId;
  title: string;
  snippet: string;
  /** The anchor inside the chapter (`man-top` for an overview). */
  anchor: string;
}

const inlineText = (c: Inline[]): string => c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : inlineText(x.c))).join('');

/** A guide's plain text: every heading, paragraph, list item, table cell and box, one line each. */
export function blocksText(blocks: Block[]): string {
  const out: string[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.t === 'h' || b.t === 'p') out.push(inlineText(b.c));
      else if (b.t === 'pre') out.push(b.v);
      else if (b.t === 'box') walk(b.blocks);
      else if (b.t === 'table') for (const row of [b.head, ...b.rows]) out.push(row.map(inlineText).join(' · '));
      else if (b.t === 'ul' || b.t === 'ol')
        for (const it of b.items) {
          out.push(inlineText(it.c));
          walk(it.sub);
        }
    }
  };
  walk(blocks);
  return out.join('\n');
}

/** The words of a query (lower case, at most a few), or none when it is too short. */
export function queryWords(q: string): string[] {
  const t = q.trim().toLowerCase();
  if (t.length < SEARCH_MIN_CHARS) return [];
  return [...new Set(t.split(/\s+/).filter(Boolean))].slice(0, SEARCH_MAX_WORDS);
}

const count = (hay: string, w: string) => {
  let n = 0;
  for (let i = hay.indexOf(w); i >= 0; i = hay.indexOf(w, i + w.length)) n++;
  return n;
};

/** A short piece of `text` around the first word found, on one line. */
export function snippetOf(text: string, words: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const low = flat.toLowerCase();
  const at = Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0), flat.length);
  if (at >= flat.length) return flat.slice(0, SNIPPET * 2) + (flat.length > SNIPPET * 2 ? '…' : '');
  // Cut at spaces, so a Bengali letter never loses its vowel sign.
  let from = Math.max(0, at - SNIPPET);
  let to = Math.min(flat.length, at + SNIPPET);
  if (from > 0) {
    const sp = flat.indexOf(' ', from);
    from = sp >= 0 && sp < at ? sp + 1 : at;
  }
  if (to < flat.length) {
    const sp = flat.lastIndexOf(' ', to);
    if (sp > at) to = sp;
  }
  return `${from > 0 ? '…' : ''}${flat.slice(from, to).trim()}${to < flat.length ? '…' : ''}`;
}

/** How well one guide matches: null unless every word is in it; a word in the title counts five times. */
export function scoreOf(title: string, text: string, words: string[]): number | null {
  const t = title.toLowerCase();
  const x = text.toLowerCase();
  let score = 0;
  for (const w of words) {
    const inTitle = count(t, w);
    const inText = count(x, w);
    if (!inTitle && !inText) return null;
    score += inTitle * 5 + inText;
  }
  return score;
}

/** Search every guide the person may read; best first, at most SEARCH_MAX_HITS. */
export async function searchManual(q: string, viewer: ShellViewer, dir: string | null = guideDir()): Promise<ManualHit[]> {
  const words = queryWords(q);
  if (!dir || !words.length) return [];
  const ids = manualSections(viewer).flatMap((s) => [`${s}/index`, ...sectionPages(s).map((p) => p.id)]);
  const guides = await Promise.all(ids.map((id) => readPageGuide(id, dir)));
  const hits: (ManualHit & { score: number })[] = [];
  ids.forEach((id, i) => {
    const g = guides[i];
    if (!g) return;
    const text = blocksText(g.blocks);
    const score = scoreOf(g.title, text, words);
    if (score === null) return;
    const section = id.split('/')[0] as AdminSectionId;
    hits.push({ id, section, title: g.title, snippet: snippetOf(text, words), anchor: id.endsWith('/index') ? 'man-top' : manualAnchor(id), score });
  });
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, SEARCH_MAX_HITS).map(({ score: _score, ...h }) => h);
}

/* ---------- What's new ---------- */

export interface WhatsNewItem {
  pr: number;
  stage: string;
  /** YYYY-MM-DD, as the register writes it. */
  date: string;
  text: string;
}

const STATUS_ROW = /^\|\s*(\d{1,4})\s*\|\s*(S\d{2}[A-Z]?)\s*\|\s*(merged|live)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.*)$/;
const TITLE_ROW = /^\|\s*(\d{1,4})\s*\|\s*\*\*(.+?)\*\*/;

/** A register row's opening words as a one-line English description. */
function shortLine(s: string): string {
  const plain = s.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();
  const cut = plain.split(/ \(|; | — |: /)[0]!.replace(/[.|\s]+$/, '');
  return cut.length > LINE_MAX ? `${cut.slice(0, LINE_MAX).trim()}…` : cut;
}

/** The built PRs of the register (status rows, merged or live), newest first, with their Bengali or English line. */
export function parseWhatsNew(register: string, bnLines: Record<string, string>, lang: 'bn' | 'en', limit = WHATS_NEW_MAX): WhatsNewItem[] {
  const titles = new Map<number, string>();
  const rows = new Map<number, WhatsNewItem>();
  for (const line of register.split('\n')) {
    const s = STATUS_ROW.exec(line);
    if (s) {
      const pr = Number(s[1]);
      const prev = rows.get(pr);
      if (!prev || prev.date < s[4]!) rows.set(pr, { pr, stage: s[2]!, date: s[4]!, text: shortLine(s[5]!) });
      continue;
    }
    const t = TITLE_ROW.exec(line);
    if (t && !titles.has(Number(t[1]))) titles.set(Number(t[1]), shortLine(t[2]!));
  }
  const out = [...rows.values()].map((r) => {
    const bn = bnLines[String(r.pr)];
    const text = lang === 'bn' && typeof bn === 'string' && bn.trim() ? bn.trim() : (titles.get(r.pr) ?? r.text);
    return { ...r, text };
  });
  out.sort((a, b) => b.date.localeCompare(a.date) || b.pr - a.pr);
  return out.slice(0, limit);
}

/** What's new from the docs beside the guides (the server's copy, or the repository's); empty when they are missing. */
export async function readWhatsNew(lang: 'bn' | 'en', dir: string | null = guideDir()): Promise<WhatsNewItem[]> {
  if (!dir) return [];
  const docs = join(/*turbopackIgnore: true*/ dir, '..');
  const [register, bn] = await Promise.all([
    readFile(join(/*turbopackIgnore: true*/ docs, 'MASTER-REGISTER.md'), 'utf8').catch(() => ''),
    readFile(join(/*turbopackIgnore: true*/ docs, 'stages', 'bn.json'), 'utf8').catch(() => '{}'),
  ]);
  let lines: Record<string, string> = {};
  try {
    const parsed = JSON.parse(bn) as { prs?: unknown };
    if (parsed.prs && typeof parsed.prs === 'object') lines = parsed.prs as Record<string, string>;
  } catch {
    lines = {};
  }
  return parseWhatsNew(register, lines, lang);
}
