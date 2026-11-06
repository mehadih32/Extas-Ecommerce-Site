// S12 · PR 240, 241 (demo 73-blog.js bfBlocks) — an article's words as blocks, pure: the editor's preview and the shop's
// article page draw the same blocks, so what the writer sees is what the reader gets.
//
// The writing format (the editor's hint lists it): a blank line between paragraphs; `## ` a heading, `### ` a
// sub-heading; `- ` a bullet, `1. ` a numbered line; `> tip: …` or `> note: …` a box; `[products]` the product block
// (once; the first one counts); inside a line `**bold**` and `[words](/link)` (a link inside the shop, or https).
export type Inline = { t: 'text'; s: string } | { t: 'b'; s: string } | { t: 'a'; s: string; href: string };
export type Block =
  | { t: 'p'; s: Inline[] }
  | { t: 'h2'; s: string; id: string }
  | { t: 'h3'; s: string }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'box'; k: 'tip' | 'note'; s: Inline[] }
  | { t: 'products' };

/** A link the article may carry: a path inside the shop, or an https address (never javascript:, data: or http:). */
export const safeHref = (h: string) => (/^\/(?!\/)[^\s]*$/.test(h) || /^https:\/\/[^\s/]+\.[^\s]+$/.test(h) ? h : null);

export function inline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let at = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > at) out.push({ t: 'text', s: src.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ t: 'b', s: m[1] });
    else {
      const href = safeHref(m[3] ?? '');
      out.push(href ? { t: 'a', s: m[2] ?? '', href } : { t: 'text', s: m[2] ?? '' });
    }
    at = re.lastIndex;
  }
  if (at < src.length) out.push({ t: 'text', s: src.slice(at) });
  return out;
}

/** A heading's anchor (contents and share links): Latin letters and digits, else its position. */
const anchor = (s: string, n: number) => {
  const a = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48); // hardcode-ok: the length of an anchor
  return a || `part-${n}`;
};

export function blocks(src: string): Block[] {
  const out: Block[] = [];
  const para: string[] = [];
  const seen = new Set<string>();
  let products = false;
  const flush = () => {
    if (para.length) out.push({ t: 'p', s: inline(para.join(' ')) });
    para.length = 0;
  };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const l = raw.trim();
    let m: RegExpMatchArray | null;
    if (!l) {
      flush();
      continue;
    }
    if ((m = l.match(/^###\s+(.+)/))) {
      flush();
      out.push({ t: 'h3', s: m[1]! });
    } else if ((m = l.match(/^##\s+(.+)/))) {
      flush();
      let id = anchor(m[1]!, out.length);
      while (seen.has(id)) id = `${id}-${out.length}`;
      seen.add(id);
      out.push({ t: 'h2', s: m[1]!, id });
    } else if ((m = l.match(/^>\s*(tip|note):\s*(.+)/i))) {
      flush();
      out.push({ t: 'box', k: m[1]!.toLowerCase() === 'tip' ? 'tip' : 'note', s: inline(m[2]!) });
    } else if (/^\[products\]$/i.test(l)) {
      flush();
      if (!products) out.push({ t: 'products' });
      products = true;
    } else if ((m = l.match(/^(\d+\.|-)\s+(.+)/))) {
      flush();
      const kind = m[1] === '-' ? 'ul' : 'ol';
      const last = out[out.length - 1];
      if (last && last.t === kind) last.items.push(inline(m[2]!));
      else out.push({ t: kind, items: [inline(m[2]!)] });
    } else para.push(l);
  }
  flush();
  return out;
}

/** The contents list: every main heading with its anchor. */
export const contents = (b: Block[]) => b.flatMap((x) => (x.t === 'h2' ? [{ id: x.id, s: x.s }] : []));
