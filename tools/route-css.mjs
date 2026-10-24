#!/usr/bin/env node
// PR 573 (follow-up 358) — a route's own cut of a big shared stylesheet, so the route does not wait for rules it can
// never use before its first paint.
//
// Why: the combo page (/combo/<link>) used to import the whole bag page stylesheet (bag.css, ~430 rules) and the whole
// product page stylesheet (pdp.css, ~810 rules, most of them under `.pdp-page`, a class the combo page never has) for
// about 70 rules it really draws with (the swatches, size pills, the segmented switch, the phone's sticky bar, the
// crumbs, the size chart window, "Add to bag" …). On the seeded Lighthouse box (4G, 4× CPU) every stylesheet of a page
// shares the line with its scripts and fonts before the first paint, and every rule is matched against the page while
// it is first laid out: those two files held the combo page's first paint (its largest paint, the set's title) about
// 0.5 s back, at the 2.5 s budget's edge.
//
// What: for each cut in CUTS, the rules of its source stylesheets that the route can match, in the sources' order (the
// cascade is unchanged), written to one generated file the route imports in their place. A rule is kept when one of
// its selectors names only classes the route's own code can put on the page: every class name found in a string of a
// file the route's page and layouts import (followed through `@/…` and relative imports, like tools/lh-pages.mjs), or
// one built from such a string's prefix (`cb-${x}` keeps every `cb-…` class). Strings that are CSS selectors (they
// carry a dot, a brace or a colon) are not class names. Classes inside `:not(…)` are never required. A media or
// supports block keeps the rules it holds that are kept; a keyframes block is kept when a kept rule names it.
// Anything else (an at-rule without rules, a rule without a class) is kept as it is.
//
// The product and bag pages keep importing their whole files; nothing is edited by hand in the generated file. The
// test beside this tool fails when a source changed and the cut was not written again:
//   node tools/route-css.mjs          writes every cut
//   node tools/route-css.mjs --check  exits 1 when a cut is not current
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closureOf, routeFilesOf } from './lh-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The cuts: a route (its page file), the stylesheets it takes rules from (in the order it imported them), the output. */
export const CUTS = [
  {
    page: 'apps/web/src/app/(shop)/(store)/combo/[slug]/page.tsx',
    sources: ['apps/web/src/components/shop/bag/bag.css', 'apps/web/src/components/shop/product/pdp.css'],
    out: 'apps/web/src/components/shop/combo/combo-shared.css',
  },
];

// ------------------------------------------------------------------------------------------------ the route's classes

/** The string literals of a TS/JS source (template literal parts too), with the `prefix-${…}` ends of template parts. */
export function stringsOf(src) {
  const out = [];
  const prefixes = [];
  let i = 0;
  const n = src.length;
  /** Template depth: each entry is the brace depth inside the `${…}` it opened. */
  const tpl = [];
  let braces = 0;
  const readQuoted = (q) => {
    let s = '';
    i++;
    while (i < n && src[i] !== q && src[i] !== '\n') {
      if (src[i] === '\\') {
        s += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      s += src[i++];
    }
    i++;
    out.push(s);
  };
  const readTemplatePart = () => {
    // at the character after ` or after the } that closed a ${…}
    let s = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') {
        s += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '`') {
        i++;
        out.push(s);
        return;
      }
      if (c === '$' && src[i + 1] === '{') {
        i += 2;
        out.push(s);
        const m = /([A-Za-z_][\w-]*-)$/.exec(s);
        if (m) prefixes.push(m[1]);
        tpl.push(braces);
        return;
      }
      s += c;
      i++;
    }
    out.push(s);
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      readQuoted(c);
      continue;
    }
    if (c === '`') {
      i++;
      readTemplatePart();
      continue;
    }
    if (c === '{') braces++;
    if (c === '}') {
      if (tpl.length && tpl[tpl.length - 1] === braces) {
        tpl.pop();
        i++;
        readTemplatePart();
        continue;
      }
      braces--;
    }
    i++;
  }
  // `'cb-' + x` builds a class from a prefix too
  for (const m of src.matchAll(/['"]([A-Za-z_][\w-]*-)['"]\s*\+/g)) prefixes.push(m[1]);
  return { strings: out, prefixes };
}

/** The class names a source can put on the page: words of its strings that are not CSS selectors. */
export function classWordsOf(src) {
  const { strings, prefixes } = stringsOf(src);
  const words = new Set();
  for (const s of strings) {
    if (/[.{}:]/.test(s)) continue;
    for (const w of s.match(/-?[A-Za-z_][\w-]*/g) ?? []) words.add(w);
  }
  return { words, prefixes: new Set(prefixes) };
}

/** Every class the route's page and layouts (and all they import) can draw. */
export function routeVocabulary(page, io) {
  const { files } = closureOf(routeFilesOf(page, io.isFile), io);
  const words = new Set();
  const prefixes = new Set();
  for (const f of [...files].sort()) {
    if (!/\.(tsx?|jsx?|mjs)$/.test(f)) continue;
    const v = classWordsOf(io.read(f) ?? '');
    v.words.forEach((w) => words.add(w));
    v.prefixes.forEach((p) => prefixes.add(p));
  }
  return { words, prefixes, files };
}

// ---------------------------------------------------------------------------------------------------- the stylesheets

/** Splits CSS into its top-level statements: `{ head, body, text }` for a block, `{ text }` for a bare at-rule. */
export function blocksOf(css) {
  const out = [];
  let i = 0;
  const n = css.length;
  let start = 0;
  let head = '';
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const e = css.indexOf(c, i + 1);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (c === ';' && !head) {
      out.push({ text: css.slice(start, i + 1) });
      start = i + 1;
      i++;
      continue;
    }
    if (c === '{') {
      head = css.slice(start, i);
      let depth = 1;
      let j = i + 1;
      while (j < n && depth) {
        if (css[j] === '/' && css[j + 1] === '*') {
          const e = css.indexOf('*/', j + 2);
          j = e < 0 ? n : e + 2;
          continue;
        }
        if (css[j] === '"' || css[j] === "'") {
          const e = css.indexOf(css[j], j + 1);
          j = e < 0 ? n : e + 1;
          continue;
        }
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      out.push({ head, body: css.slice(i + 1, j - 1), text: css.slice(start, j) });
      start = j;
      head = '';
      i = j;
      continue;
    }
    i++;
  }
  const rest = css.slice(start);
  if (rest.trim()) out.push({ text: rest });
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** Splits a selector list at its top-level commas. */
export function selectorParts(sel) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of sel) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The classes a selector needs ( `:not(…)` left out). */
export function neededClasses(sel) {
  let s = sel;
  // :not(...) may nest parentheses: remove innermost first
  for (let k = 0; k < 10 && /:not\(/.test(s); k++) s = s.replace(/:not\(([^()]*)\)/g, '');
  s = s.replace(/\[[^\]]*\]/g, '');
  return [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

/** May this selector match on the route? */
export function possible(sel, vocab) {
  return neededClasses(sel).every((c) => vocab.words.has(c) || [...vocab.prefixes].some((p) => c.startsWith(p)));
}

/** The rules of a stylesheet the route can use, as CSS text, in order (comments dropped). */
export function cut(css, vocab, keyframesUsed = new Set()) {
  const blocks = blocksOf(css);
  const kept = [];
  const frames = [];
  for (const b of blocks) {
    const head = b.head === undefined ? null : stripComments(b.head).trim();
    if (head === null) {
      const t = stripComments(b.text).trim();
      if (t) kept.push(t);
      continue;
    }
    if (/^@(media|supports|container|layer)\b/.test(head)) {
      const inner = cut(b.body, vocab, keyframesUsed);
      if (inner.trim()) kept.push(`${head} {\n${inner.replace(/^/gm, '  ')}\n}`);
      continue;
    }
    if (/^@(-webkit-)?keyframes\b/.test(head)) {
      frames.push({ name: head.split(/\s+/)[1], at: kept.length, text: `${head} {${stripComments(b.body).trim()}}` });
      kept.push(null);
      continue;
    }
    if (head.startsWith('@')) {
      kept.push(`${head} {${stripComments(b.body).trim()}}`);
      continue;
    }
    const parts = selectorParts(head);
    const ok = parts.filter((p) => possible(p, vocab));
    if (!ok.length) continue;
    const body = stripComments(b.body).trim();
    for (const m of body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) for (const w of m[1].split(/[\s,]+/)) keyframesUsed.add(w);
    kept.push(`${ok.join(', ')} { ${body} }`);
  }
  for (const f of frames) kept[f.at] = keyframesUsed.has(f.name) ? f.text : null;
  return kept.filter((x) => x !== null).join('\n');
}

/** The generated file of one cut. */
export function cutFile(c, io) {
  const vocab = routeVocabulary(c.page, io);
  const used = new Set();
  // two passes: a keyframes block before the rule that names it is still kept
  for (const s of c.sources) cut(io.read(s) ?? '', vocab, used);
  const parts = c.sources.map((s) => `/* ---- from ${s.replace(/^apps\/web\/src\//, '')} ---- */\n${cut(io.read(s) ?? '', vocab, used)}`);
  const head = [
    `/* GENERATED by tools/route-css.mjs (PR 573, follow-up 358) — do not edit by hand: run \`node tools/route-css.mjs\`.`,
    ` * The rules of ${c.sources.map((s) => s.split('/').pop()).join(' and ')} that ${c.page.replace(/^apps\/web\/src\/app\//, '')} can draw with, in their own order,`,
    ` * so the route loads these instead of the whole files (its first paint no longer waits for rules it never uses). */`,
  ].join('\n');
  return `${head}\n${parts.join('\n')}\n`;
}

function repoIo() {
  const cache = new Map();
  const isFile = (f) => {
    try {
      return statSync(join(root, f)).isFile();
    } catch {
      return false;
    }
  };
  const read = (f) => {
    if (!cache.has(f)) cache.set(f, isFile(f) ? readFileSync(join(root, f), 'utf8') : null);
    return cache.get(f);
  };
  return { isFile, read };
}

/** Each cut with its file now and what it should be. */
export function cutsNow(io = repoIo()) {
  return CUTS.map((c) => ({ ...c, want: cutFile(c, io), have: io.read(c.out) }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const c of cutsNow()) {
    if (c.want === c.have) continue;
    stale++;
    if (check) console.error(`route-css: ${c.out} is not current — run node tools/route-css.mjs`);
    else {
      writeFileSync(join(root, c.out), c.want);
      console.log(`route-css: wrote ${c.out}`);
    }
  }
  if (check && stale) process.exit(1);
  if (!stale) console.log('route-css: every cut is current');
}
