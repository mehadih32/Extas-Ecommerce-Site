// PR 6 (follow-up 84) and PR 12 — SH-05, the guide side panel "এই সেকশনে কী করা যায়": the Bengali section guides of
// docs/admin-guide/ (CN-014), read from the server's copy of the docs (EXTAS_DOCS_DIR, filled by every deploy:
// infra/deploy/docs-sync.sh) or, on a developer's machine and in CI, from the repository. The Markdown is turned into
// a small tree of blocks here (headings, paragraphs, lists, tables, code) and drawn by React on the page: no HTML from
// a file ever reaches the page. A link to another guide opens that guide in the panel; a web link opens in a new tab.
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'guide'; slug: string; c: Inline[] }
  | { t: 'a'; href: string; c: Inline[] };

export interface ListItem {
  c: Inline[];
  sub: Block[];
}

export type Block =
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: ListItem[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'pre'; v: string }
  | { t: 'hr' };

export interface Guide {
  slug: string;
  title: string;
  blocks: Block[];
}

/** A guide's name: the file name without `.md` (README is the index). Nothing else is ever read. */
export const GUIDE_SLUG = /^(README|[a-z0-9][a-z0-9-]{0,40})$/;

/** The folder that holds the guides: the deployed copy first, else the repository's docs. */
// The paths are worked out when the server runs (the docs are copied beside it on deploy, CN-011), so the build must not
// trace them: `turbopackIgnore` keeps the whole repository out of the server bundle.
export function guideDir(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | null {
  const roots = [env.EXTAS_DOCS_DIR, cwd, join(/*turbopackIgnore: true*/ cwd, '..'), join(/*turbopackIgnore: true*/ cwd, '..', '..')].filter((x): x is string => Boolean(x));
  for (const r of roots) {
    const dir = resolve(/*turbopackIgnore: true*/ r, 'docs', 'admin-guide');
    if (existsSync(join(/*turbopackIgnore: true*/ dir, 'README.md'))) return dir;
  }
  return null;
}

/* ---------- inline ---------- */
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|~~([^~]+)~~/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    if (m.index! > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'b', c: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
    else if (m[3] !== undefined) {
      const href = m[4]!;
      const guide = /^([A-Za-z0-9-]+)\.md(#.*)?$/.exec(href);
      if (guide && GUIDE_SLUG.test(guide[1]!)) out.push({ t: 'guide', slug: guide[1]!, c: parseInline(m[3]) });
      else if (/^https:\/\//.test(href)) out.push({ t: 'a', href, c: parseInline(m[3]) });
      else out.push(...parseInline(m[3]));
    } else if (m[5] !== undefined) out.push({ t: 'text', v: m[5] });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

/* ---------- blocks ---------- */
const LIST = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      blocks.push({ t: 'pre', v: body.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ t: 'h', level: h[1]!.length, c: parseInline(h[2]!.trim()) });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]!)) {
      flush();
      const head = cells(line);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (LIST.test(line)) {
      flush();
      const [list, next] = parseList(lines, i, LIST.exec(line)![1]!.length);
      blocks.push(list);
      i = next;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return blocks;
}

/** A list from line `i` at `indent`; deeper items become the item's own list, a plain line continues the item. */
function parseList(lines: string[], start: number, indent: number): [Block, number] {
  const first = LIST.exec(lines[start]!)!;
  const kind: 'ul' | 'ol' = /\d/.test(first[2]!) ? 'ol' : 'ul';
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      const nextLine = lines[i + 1];
      if (nextLine !== undefined && LIST.test(nextLine) && LIST.exec(nextLine)![1]!.length >= indent) {
        i++;
        continue;
      }
      break;
    }
    const m = LIST.exec(line);
    if (m) {
      const ind = m[1]!.length;
      if (ind < indent) break;
      if (ind > indent && items.length) {
        const [sub, next] = parseList(lines, i, ind);
        items[items.length - 1]!.sub.push(sub);
        i = next;
        continue;
      }
      items.push({ c: parseInline(m[3]!.trim()), sub: [] });
      i++;
      continue;
    }
    const lead = /^(\s*)/.exec(line)![1]!.length;
    if (lead > indent && items.length && !/^\s*[#|]/.test(line)) {
      const it = items[items.length - 1]!;
      it.c.push({ t: 'text', v: ' ' }, ...parseInline(line.trim()));
      i++;
      continue;
    }
    break;
  }
  return [{ t: kind, items }, i];
}

const plain = (c: Inline[]): string => c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : plain(x.c))).join('');

/** One guide, or null when there is no such file. */
export async function readGuide(slug: string, dir: string | null = guideDir()): Promise<Guide | null> {
  if (!dir || !GUIDE_SLUG.test(slug)) return null;
  const files = new Set(await readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[]));
  if (!files.has(`${slug}.md`)) return null;
  const md = await readFile(join(/*turbopackIgnore: true*/ dir, `${slug}.md`), 'utf8');
  const blocks = parseMarkdown(md);
  const first = blocks.find((b): b is Extract<Block, { t: 'h' }> => b.t === 'h');
  return { slug, title: first ? plain(first.c) : slug, blocks: first ? blocks.filter((b) => b !== first) : blocks };
}
