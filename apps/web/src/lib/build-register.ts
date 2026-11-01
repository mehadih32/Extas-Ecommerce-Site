// S21 · PR 594 (HLP-02, CN-011) — the PR register inside the backend, read from the deploy's own copy of
// docs/MASTER-REGISTER.md (deploy.yml → docs-sync.sh, mounted read-only; in development the repository's file). Nothing is
// typed twice: every stage and PR comes from the register's tables, so a new PR or a new dated "Updated …" line shows on
// the next deploy by itself.
// - Stages: "## The stage table" (code, name, count, PR ranges, status; S26/S27 parked).
// - PRs: every "| PR | What it does |" table row: the bold lead is its title, the text before its first dated marker is
//   what it does, and each "**Updated <date> (…)**" (or "V2.1 final") marker after it is one entry of its scope history.
// - State: the newest "## Build status" row (merged or live, with its date and note); otherwise parked (a parked stage)
//   or to build.
// - PRs the register does not itemise (most of S16–S26 are stage scope only): the blueprint's "# Appendix A · Every PR"
//   row (its title, marked "(derived)" when it only names the stage's scope). Every PR also takes its owning agent there.
// - Change notes: each "> **CN-### · <date> (…)**" block that names the PR ("PR 594", "PRs 571–576", "PR 4/17").
// - Builds on: the other PR numbers its own text names.
// Read-only and pure apart from `readRegister`, which caches the parse per file version. Numbers below are bounds on text.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// hardcode-ok: text bounds — the longest excerpt of a change note kept on a PR card, the widest PR range read as a list
const NOTE_EXCERPT = 600;
const MAX_RANGE = 100; // hardcode-ok: see above

export type PrState = 'live' | 'merged' | 'todo' | 'parked';
export const PR_STATES: readonly PrState[] = ['live', 'merged', 'todo', 'parked'];

export interface RegStage {
  id: string;
  name: string;
  /** The count the table gives (0 for a stage not numbered yet). */
  count: number;
  range: string;
  status: string;
  parked: boolean;
  prs: number[];
  /** The italic line under the stage's own heading. */
  intro: string;
}

export interface RegUpdate {
  /** "20 Oct 01:30", "23 Oct 2026", or '' when the marker has no date. */
  date: string;
  /** Sort key: day × 1440 + minute (no date: last). */
  key: number;
  text: string;
}

export interface RegStatusRow {
  state: string;
  date: string;
  note: string;
}

export interface RegNote {
  id: string;
  head: string;
  text: string;
}

export interface RegPr {
  n: number;
  stage: string;
  title: string;
  /** What it does: the row's text before its first dated update. */
  text: string;
  updates: RegUpdate[];
  status: RegStatusRow[];
  state: PrState;
  /** The newest status row's date (YYYY-MM-DD), or ''. */
  stateDate: string;
  notes: RegNote[];
  buildsOn: number[];
  /** The owning agent (blueprint Appendix A), or ''. */
  owner: string;
  /** Only the blueprint's index line: the register keeps no row of its own for it. */
  derived: boolean;
}

export interface Register {
  /** "621 PRs · 28 stages · as of 25 October 2026". */
  asOf: string;
  /** The "**Progress: …**" line without its label. */
  progress: string;
  stages: RegStage[];
  prs: Map<number, RegPr>;
}

/** Markdown marks taken off (bold, code, links kept as their words); struck text stays, marked `~~`. */
export const plainMd = (s: string) =>
  s
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const cells = (line: string) => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
};
const isSeparator = (cs: string[]) => cs.every((c) => /^:?-+:?$/.test(c));

/** Rows of the first table after the line starting with `heading` (its header row left out). */
export function tableAfter(lines: string[], heading: string): string[][] {
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) return [];
  const rows: string[][] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) {
      inTable = true;
      const cs = cells(line);
      if (!isSeparator(cs)) rows.push(cs);
    } else if (inTable) break;
    else if (/^#{1,3}\s/.test(line)) break;
  }
  return rows.slice(1);
}

/** "1–10, 601, 604" → [1..10, 601, 604]. */
export function expandRange(text: string): number[] {
  const out: number[] = [];
  for (const tok of plainMd(text).split(',')) {
    const m = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(tok.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (b - a > MAX_RANGE) continue;
    for (let n = a; n <= b; n++) out.push(n);
  }
  return out;
}

/** PR numbers named in prose: "PR 4/17", "PR 1, 3–10, 13", "PR 148, 292 and 545", "PRs 571–576". */
export function prRefs(text: string, max = Number.MAX_SAFE_INTEGER): number[] {
  const out: number[] = [];
  const re = /\bPRs?\s+(\d+(?:\s*[–-]\s*\d+)?(?:\s*(?:,|\/|\band\b|&|\+)\s*\d+(?:\s*[–-]\s*\d+)?)*)/g;
  for (const m of plainMd(text).matchAll(re)) {
    for (const part of m[1]!.split(/\s*(?:,|\/|\band\b|&|\+)\s*/)) {
      const r = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(part);
      if (!r) continue;
      const a = Number(r[1]);
      const b = r[2] ? Number(r[2]) : a;
      if (b - a > MAX_RANGE) continue;
      for (let n = a; n <= b; n++) if (n >= 1 && n <= max && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The first date in a marker ("20 Oct 01:30", "23 Oct 2026") and its sort key. */
export function markerDate(text: string): { date: string; key: number } {
  const d = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b(?: (\d{4}))?/.exec(text);
  if (!d) return { date: '', key: Number.MAX_SAFE_INTEGER };
  const tail = text.slice(d.index + d[0].length);
  const tm = /^,?\s*(\d{1,2}):(\d{2})\b/.exec(tail);
  const month = MONTHS.indexOf(d[2]!);
  const day = (Number(d[3] ?? 2026) - 2000) * 400 + month * 32 + Number(d[1]); // hardcode-ok: a sort key, not a date rule
  const min = tm ? Number(tm[1]) * 60 + Number(tm[2]) : 0;
  return { date: `${d[1]} ${d[2]}${d[3] ? ` ${d[3]}` : ''}${tm ? ` ${tm[1]!.padStart(2, '0')}:${tm[2]}` : ''}`, key: day * 1440 + min };
}

/** A register cell's own text and its dated "Updated …" additions, in the order written. */
export function splitUpdates(text: string): { original: string; updates: RegUpdate[] } {
  const marks: number[] = [];
  for (const m of text.matchAll(/\*\*([^*]+?)\*\*/g)) {
    const content = m[1]!.trim();
    if (/^(~~)?(Updated|V2\.1 final)\b/.test(content)) marks.push(m.index!);
  }
  const original = (marks.length ? text.slice(0, marks[0]) : text).trim();
  const updates = marks.map((at, i) => {
    const t = text.slice(at, i + 1 < marks.length ? marks[i + 1] : text.length).trim();
    const lead = /^\*\*([^*]+?)\*\*/.exec(t)?.[1] ?? '';
    return { ...markerDate(lead), text: t };
  });
  return { original, updates };
}

/** A PR's title: its bold lead, else its first clause. */
export function titleOf(text: string): string {
  const lead = /^\s*\*\*([^*]+?)\*\*/.exec(text);
  if (lead) return plainMd(lead[1]!).replace(/[.:—–-]+$/, '').trim();
  const plain = plainMd(text.replace(/~~[^~]*~~/g, ''));
  return (plain.split(/ — |; |\. /)[0] ?? plain).trim();
}

function excerpt(text: string, max = NOTE_EXCERPT): string {
  const s = text.trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  cut = cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:(—–-]+$/, '');
  for (const mark of ['**', '~~', '`']) if ((cut.split(mark).length - 1) % 2) cut += mark;
  return `${cut} …`;
}

const stateRank: Record<string, number> = { live: 2, merged: 1 };

/** The whole register as stages and PRs; `blueprint` (BLUEPRINT.md) fills the PRs the register does not itemise. */
export function parseRegister(md: string, blueprint = ''): Register {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const asOf = plainMd(lines.find((l) => /^\*\*\d+ PRs · \d+ stages · as of/.test(l)) ?? '');
  const progress = plainMd(lines.find((l) => /^\*\*Progress:/.test(l.trim())) ?? '').replace(/^Progress:\s*/, '');

  const stages: RegStage[] = [];
  for (const [id, name, count, range, status] of tableAfter(lines, '## The stage table')) {
    if (!id || !/^S(0A|\d{2})$/.test(id)) continue;
    const st = status ?? '';
    stages.push({ id, name: plainMd(name ?? ''), count: /^\d+$/.test(plainMd(count ?? '')) ? Number(plainMd(count ?? '')) : 0, range: plainMd(range ?? ''), status: plainMd(st), parked: /parked/i.test(st), prs: expandRange(range ?? ''), intro: '' });
  }
  const stageOf = new Map<number, string>();
  for (const s of stages) {
    for (const n of s.prs) stageOf.set(n, s.id);
    const h = lines.findIndex((l) => l.startsWith(`## ${s.id} ·`));
    if (h >= 0) {
      const intro = lines.slice(h + 1).find((l) => l.trim())?.trim() ?? '';
      if (/^\*[^*]/.test(intro)) s.intro = intro.replace(/^\*|\*$/g, '');
    }
  }
  const max = Math.max(0, ...stageOf.keys());

  const status = new Map<number, RegStatusRow[]>();
  for (const [pr, , state, date, note] of tableAfter(lines, '## Build status')) {
    const n = Number(pr);
    if (!n) continue;
    if (!status.has(n)) status.set(n, []);
    status.get(n)!.push({ state: plainMd(state ?? '').toLowerCase(), date: date ?? '', note: note ?? '' });
  }

  const prs = new Map<number, RegPr>();
  let header: string[] | null = null;
  for (const line of lines) {
    if (!line.startsWith('|')) {
      header = null;
      continue;
    }
    const cs = cells(line);
    if (!header) {
      header = cs;
      continue;
    }
    if (isSeparator(cs) || header[0] !== 'PR' || header[1] !== 'What it does') continue;
    const n = Number(cs[0]);
    if (!n) continue;
    const text = cs.slice(1).filter(Boolean).join(' ');
    const prev = prs.get(n);
    if (prev) {
      // the same PR filed again under a later heading: its words join the first row's history
      prev.updates.push(...splitUpdates(text).updates);
      continue;
    }
    const { original, updates } = splitUpdates(text);
    const rows = status.get(n) ?? [];
    const best = [...rows].sort((a, b) => (stateRank[b.state] ?? 0) - (stateRank[a.state] ?? 0) || b.date.localeCompare(a.date))[0];
    const stage = stageOf.get(n) ?? '';
    const parked = stages.find((s) => s.id === stage)?.parked ?? false;
    const state: PrState = best && best.state in stateRank ? (best.state as PrState) : parked ? 'parked' : 'todo';
    prs.set(n, { n, stage, title: titleOf(original || text), text: original, updates, status: rows, state, stateDate: best?.date ?? '', notes: [], buildsOn: prRefs(text, max).filter((x) => x !== n), owner: '', derived: false });
  }

  // the blueprint's index of every PR: the owning agent, and the title of a PR the register does not itemise
  for (const [pr, title, , , owner] of tableAfter(blueprint.replace(/\r\n?/g, '\n').split('\n'), '# Appendix A')) {
    const n = Number(pr);
    const stage = stageOf.get(n);
    if (!n || !stage) continue;
    const known = prs.get(n);
    if (known) {
      known.owner = plainMd(owner ?? '');
      continue;
    }
    const rows = status.get(n) ?? [];
    const best = [...rows].sort((a, b) => (stateRank[b.state] ?? 0) - (stateRank[a.state] ?? 0) || b.date.localeCompare(a.date))[0];
    const parked = stages.find((s) => s.id === stage)?.parked ?? false;
    const derived = /\(derived\)/.test(title ?? '');
    const clean = (title ?? '').replace(/\s*\*\(derived\)\*/g, '').trim();
    prs.set(n, { n, stage, title: titleOf(clean), text: clean, updates: [], status: rows, state: best && best.state in stateRank ? (best.state as PrState) : parked ? 'parked' : 'todo', stateDate: best?.date ?? '', notes: [], buildsOn: [], owner: plainMd(owner ?? ''), derived });
  }

  // change notes: one "> **CN-### · …**" blockquote each, its paragraphs split by "> " blank lines
  for (let i = 0; i < lines.length; i++) {
    const m = /^> \*\*(CN-\d{3}) · ([^*]+?)\*\*\.?\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const paras: string[] = [m[3]!];
    for (let j = i + 1; j < lines.length && lines[j]!.startsWith('>'); j++) {
      const t = lines[j]!.replace(/^>\s?/, '').trim();
      if (t) paras.push(t);
    }
    const seen = new Set<number>();
    for (const p of paras) {
      for (const n of prRefs(p, max)) {
        const pr = prs.get(n);
        if (!pr || seen.has(n)) continue;
        seen.add(n);
        pr.notes.push({ id: m[1]!, head: plainMd(m[2]!).replace(/\.$/, ''), text: excerpt(p) });
      }
    }
  }
  return { asOf, progress, stages, prs };
}

/** A PR's words for a search: number, title, text and history. */
export function prMatches(pr: RegPr, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (/^\d+$/.test(s)) return pr.n === Number(s);
  const hay = `${pr.title} ${pr.text} ${pr.updates.map((u) => u.text).join(' ')}`.toLowerCase();
  return s.split(/\s+/).every((w) => hay.includes(w));
}

/** Counts by state for a set of PRs. */
export function stateCounts(list: Iterable<RegPr>): Record<PrState, number> {
  const out: Record<PrState, number> = { live: 0, merged: 0, todo: 0, parked: 0 };
  for (const p of list) out[p.state] += 1;
  return out;
}

/** The docs folder beside the page guides (the server's copy, or the repository's). */
export const docsRoot = (guides: string) => join(/*turbopackIgnore: true*/ guides, '..');

let cache: { path: string; mtime: number; reg: Register; bn: Record<string, string> } | null = null;

/** The register and the PRs' Bengali one-liners (docs/stages/bn.json), parsed once per version of the file. */
export async function readRegister(docs: string): Promise<{ reg: Register; bn: Record<string, string> } | null> {
  const path = join(/*turbopackIgnore: true*/ docs, 'MASTER-REGISTER.md');
  const st = await stat(path).catch(() => null);
  if (!st) return null;
  if (cache && cache.path === path && cache.mtime === st.mtimeMs) return { reg: cache.reg, bn: cache.bn };
  const [md, blueprint, bnText] = await Promise.all([
    readFile(path, 'utf8'),
    readFile(join(/*turbopackIgnore: true*/ docs, 'BLUEPRINT.md'), 'utf8').catch(() => ''),
    readFile(join(/*turbopackIgnore: true*/ docs, 'stages', 'bn.json'), 'utf8').catch(() => '{}'),
  ]);
  let bn: Record<string, string> = {};
  try {
    const parsed = JSON.parse(bnText) as { prs?: unknown };
    if (parsed.prs && typeof parsed.prs === 'object') bn = parsed.prs as Record<string, string>;
  } catch {
    bn = {};
  }
  const reg = parseRegister(md, blueprint);
  cache = { path, mtime: st.mtimeMs, reg, bn };
  return { reg, bn };
}
