// S21 · PR 594 (HLP-02, CN-011) — Blueprint & files: the blueprint, the master register and every supporting Markdown
// file (owner notes, plans, QA reports, agent protocol and lessons, page guides) as the deploy copied them to the server
// (docs-sync.sh: $EXTAS_ROOT/docs/<commit>/docs, `current` pointing at the newest; in development the repository's
// docs/). Read-only: list, search inside every file, read one section at a time, download, and each file's earlier
// versions from the copies the server keeps (DOCS_KEEP_VERSIONS). Never the third-party skill copies (agents/skills/),
// never anything but `.md`; a file is opened only when it is one the listing would give: a plain path, no hidden or
// skipped folder, and a real file inside the docs folder (no path from outside is trusted).
// Nothing here is personal: the repository holds sample data only (CLAUDE.md rule 4).
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';

/** Folders never listed: copies of other people's skills, and generated pictures. */
const SKIP = [`agents${sep}skills`, `reports${sep}smoke`];
/** The files the owner reads most, listed first. */
export const CORE_FILES = ['BLUEPRINT.md', 'MASTER-REGISTER.md', 'LAUNCH-TRACK.md', 'ADMIN-ARCHITECTURE.md', 'BACKEND-ARCHITECTURE.md', 'README.md'];
// hardcode-ok: technical bounds — the most search hits counted in one file, the shortest search
const MAX_COUNT = 999;
export const MIN_SEARCH = 2; // hardcode-ok: see above
const VERSION_DIR = /^[0-9a-f]{12}$/;

export interface DocFile {
  /** Path inside docs/, with forward slashes ("owner/ROUND15.md"): the file's id everywhere. */
  path: string;
  title: string;
  size: number;
  /** First 12 hex of the content's sha256. */
  hash: string;
  core: boolean;
}

interface Cached {
  mtime: number;
  size: number;
  text: string;
  /** The text in lower case, made on the first search. */
  low?: string;
  file: DocFile;
}
const contents = new Map<string, Cached>();

const titleOf = (md: string, path: string) => {
  const h = /^#\s+(.+)$/m.exec(md);
  return h ? h[1]!.replace(/[*`]/g, '').trim() : basename(path);
};
const hashOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const it of items) {
    if (it.name.startsWith('.')) continue;
    const full = join(/*turbopackIgnore: true*/ dir, it.name);
    const rel = relative(root, full);
    if (SKIP.some((s) => rel === s || rel.startsWith(`${s}${sep}`))) continue;
    if (it.isDirectory()) await walk(root, full, out);
    else if (it.isFile() && it.name.endsWith('.md')) out.push(rel);
  }
}

async function load(docs: string, rel: string): Promise<Cached | null> {
  const full = join(/*turbopackIgnore: true*/ docs, rel);
  const st = await stat(full).catch(() => null);
  if (!st?.isFile()) return null;
  const key = full;
  const hit = contents.get(key);
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit;
  const text = await readFile(full, 'utf8');
  const path = rel.split(sep).join('/');
  const c: Cached = { mtime: st.mtimeMs, size: st.size, text, file: { path, title: titleOf(text, path), size: st.size, hash: hashOf(text), core: CORE_FILES.includes(path) } };
  contents.set(key, c);
  return c;
}

/** How long one listing is reused before the folder is walked again (a deploy swaps the whole copy, so a short wait is fine). */
const LIST_TTL_MS = 30_000; // hardcode-ok: a cache lifetime, not a business number
const listings = new Map<string, { at: number; files: DocFile[] }>();

/** Every Markdown file of the docs copy: the core files first, then by folder and name. */
export async function listDocs(docs: string): Promise<DocFile[]> {
  const key = (await realpath(docs).catch(() => docs)) || docs;
  const hit = listings.get(key);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.files;
  const rels: string[] = [];
  await walk(docs, docs, rels);
  const files = (await Promise.all(rels.map((r) => load(docs, r)))).filter((x): x is Cached => !!x).map((c) => c.file);
  const core = (p: string) => CORE_FILES.indexOf(p);
  files.sort((a, b) => {
    const ca = core(a.path);
    const cb = core(b.path);
    if (ca >= 0 || cb >= 0) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb); // hardcode-ok: sort order only
    return a.path.localeCompare(b.path);
  });
  listings.set(key, { at: Date.now(), files });
  return files;
}

export interface DocFolder {
  /** The top folder inside docs/ ("owner"). */
  dir: string;
  count: number;
  size: number;
}

/** The top folder of a docs path, or '' for a file at the top. */
export const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : '');

/** The top folders of a listing, by name, each with how many files it holds. */
export function docFolders(files: DocFile[]): DocFolder[] {
  const m = new Map<string, DocFolder>();
  for (const f of files) {
    const dir = folderOf(f.path);
    if (!dir) continue;
    const row = m.get(dir) ?? { dir, count: 0, size: 0 };
    row.count++;
    row.size += f.size;
    m.set(dir, row);
  }
  return [...m.values()].sort((a, b) => a.dir.localeCompare(b.dir));
}

/** One file's text, only when it is a file the listing would give. */
export async function readDoc(docs: string, path: string): Promise<{ file: DocFile; text: string } | null> {
  if (!/^[A-Za-z0-9._\-/]+\.md$/.test(path) || path.split('/').some((p) => p === '..' || p === '' || p.startsWith('.'))) return null;
  const rel = path.split('/').join(sep);
  if (SKIP.some((s) => rel === s || rel.startsWith(`${s}${sep}`))) return null;
  // the same file the listing would give: a real file inside the docs folder, never through a link out of it
  const [root, real] = await Promise.all([realpath(docs).catch(() => null), realpath(join(/*turbopackIgnore: true*/ docs, rel)).catch(() => null)]);
  if (!root || !real || !real.startsWith(`${root}${sep}`)) return null;
  const c = await load(docs, rel);
  return c ? { file: c.file, text: c.text } : null;
}

/** How many times `q` appears in `text` (letter case ignored). */
export function countIn(text: string, q: string, low?: string): number {
  const s = q.trim().toLowerCase();
  if (s.length < MIN_SEARCH) return 0;
  const hay = low ?? text.toLowerCase();
  let n = 0;
  for (let i = hay.indexOf(s); i >= 0 && n < MAX_COUNT; i = hay.indexOf(s, i + s.length)) n++;
  return n;
}

export interface DocHit {
  file: DocFile;
  count: number;
}

/** The files whose name, title or text has `q`, most hits first. */
export async function searchDocs(docs: string, q: string): Promise<DocHit[]> {
  const s = q.trim();
  if (s.length < MIN_SEARCH) return [];
  const list = await listDocs(docs);
  const out: DocHit[] = [];
  for (const f of list) {
    const c = await load(docs, f.path.split('/').join(sep));
    if (!c) continue;
    c.low ??= c.text.toLowerCase();
    const count = countIn(c.text, s, c.low);
    if (count || `${f.path} ${f.title}`.toLowerCase().includes(s.toLowerCase())) out.push({ file: f, count });
  }
  return out.sort((a, b) => b.count - a.count || a.file.path.localeCompare(b.file.path));
}

export interface DocSection {
  title: string;
  /** The section's Markdown, its heading line included. */
  md: string;
}

/** The most lines one part holds before it is cut again (the register's build table is ~700 rows: one page of it). */
export const PART_LINES = 150; // hardcode-ok: a page-size bound, not a business number

/**
 * A file cut at its level-1 and level-2 headings (outside code blocks); the text before the first is "the start". A part
 * longer than `max` lines is cut again at a line boundary outside a code block, titled "<heading> (2)", "(3)"…; a cut
 * inside a table repeats the table's header and separator rows, so every piece still draws as a table.
 */
export function docSections(md: string, start: string, max = PART_LINES): DocSection[] {
  const out: DocSection[] = [];
  let title = start;
  let piece = 1;
  let lines: string[] = [];
  let fence = false;
  let head: string[] = []; // the open table's header and separator, while inside one
  const push = () => {
    if (lines.join('\n').trim()) out.push({ title: piece > 1 ? `${title} (${piece})` : title, md: `${lines.join('\n')}\n` });
  };
  const all = md.replace(/\r\n?/g, '\n').split('\n');
  for (let k = 0; k < all.length; k++) {
    const line = all[k]!;
    const inCode = fence; // inside a code block before this line (a cut may come before its opening line, never inside)
    if (/^```/.test(line)) fence = !fence;
    const h = !fence && /^#{1,2}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      push();
      title = h[1]!.replace(/[*`]/g, '').replace(/~~/g, '').trim();
      piece = 1;
      lines = [line];
      head = [];
      continue;
    }
    const row = !inCode && /^\s*\|/.test(line);
    if (!row) head = [];
    else if (!head.length && /^\s*\|[\s:|-]+\|?\s*$/.test(all[k + 1] ?? '')) head = [line, all[k + 1]!];
    // cut before this line when the part is full, never inside a code block, nor before a table's first row
    const inTable = row && head.length > 0 && k > 0 && line !== head[0];
    if (lines.length >= max && !inCode && !(inTable && (all[k - 1] === head[0] || all[k - 1] === head[1]))) {
      push();
      piece++;
      lines = inTable ? [...head] : [];
    }
    lines.push(line);
  }
  push();
  return out;
}

export interface DocVersion {
  /** The copy's folder: the first 12 hex of its commit. */
  id: string;
  /** "2026-10-31 14:05" (the commit's own time), or ''. */
  committed: string;
  hash: string;
  size: number;
  current: boolean;
}

/** The copy root (README.md, docs/, COMMIT) and the folder that holds every kept copy, when the docs are a server copy. */
async function copies(docs: string): Promise<{ root: string; all: string; currentId: string } | null> {
  const root = await realpath(dirname(docs)).catch(() => null);
  if (!root || !VERSION_DIR.test(basename(root))) return null;
  return { root, all: dirname(root), currentId: basename(root) };
}

const commitTime = async (dir: string) => {
  const text = await readFile(join(/*turbopackIgnore: true*/ dir, 'COMMIT'), 'utf8').catch(() => '');
  return /^committed=(.+)$/m.exec(text)?.[1]?.trim() ?? /^copied=(.+)$/m.exec(text)?.[1]?.trim() ?? '';
};

/** The earlier versions of one file among the copies the server keeps, newest first; one line per change. */
export async function docVersions(docs: string, path: string): Promise<DocVersion[]> {
  const c = await copies(docs);
  if (!c || !(await readDoc(docs, path))) return [];
  const dirs = (await readdir(c.all, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory() && VERSION_DIR.test(d.name));
  const rows: DocVersion[] = [];
  for (const d of dirs) {
    const dir = join(/*turbopackIgnore: true*/ c.all, d.name);
    const text = await readFile(join(/*turbopackIgnore: true*/ dir, 'docs', ...path.split('/')), 'utf8').catch(() => null);
    if (text === null) continue;
    rows.push({ id: d.name, committed: await commitTime(dir), hash: hashOf(text), size: Buffer.byteLength(text), current: d.name === c.currentId });
  }
  rows.sort((a, b) => b.committed.localeCompare(a.committed) || Number(b.current) - Number(a.current));
  // one line per change: copies in a row with the same content are one version, dated from the oldest of them
  const out: DocVersion[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.hash === r.hash) {
      last.committed = r.committed || last.committed;
      last.current ||= r.current;
    } else out.push({ ...r });
  }
  return out;
}

/** One kept version's text, only for a version `docVersions` lists. */
export async function readDocVersion(docs: string, path: string, id: string): Promise<string | null> {
  if (!VERSION_DIR.test(id)) return null;
  const c = await copies(docs);
  if (!c || !(await docVersions(docs, path)).some((v) => v.id === id)) return null;
  return readFile(join(/*turbopackIgnore: true*/ c.all, id, 'docs', ...path.split('/')), 'utf8').catch(() => null);
}
