#!/usr/bin/env node
// PR 88 — V8's explicit compile hint on the shop's script chunks, run by the web build right after `next build`
// (apps/web package.json), so CI, the device gate and the Docker image all serve the same files.
//
// Why: the bundler wraps every module in a function, and V8 compiles a function only when it is first called — on the
// main thread. On a first visit the page's modules (React, the router, the page's own parts) are all called while the
// page hydrates, so ~140 ms of a slow phone's main thread (the seeded Lighthouse run, 4× CPU) went to compiling them
// in one long task: most of the product page's Total Blocking Time. The magic comment `//# allFunctionsCalledOnLoad`
// on a script's first line (Chrome 136+, "explicit compile hints") makes V8 compile the whole file while it streams
// in, on a background thread. Browsers without it ignore a comment; nothing the page does changes.
//
// usage: node tools/compile-hints.mjs <dir of chunks, e.g. apps/web/.next/static/chunks>
// Every .js file under the dir gets the hint once (idempotent); a source map beside it is shifted by the added line.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HINT = '//# allFunctionsCalledOnLoad';

/** The script with the hint as its first line (unchanged when it has one). */
export function withHint(src) {
  return src.startsWith(`${HINT}\n`) ? src : `${HINT}\n${src}`;
}

/** A source map moved one generated line down (plain maps and index maps with sections). */
export function shiftMap(json) {
  const m = JSON.parse(json);
  if (Array.isArray(m.sections)) for (const s of m.sections) s.offset = { ...s.offset, line: (s.offset?.line ?? 0) + 1 };
  else if (typeof m.mappings === 'string') m.mappings = `;${m.mappings}`;
  return JSON.stringify(m);
}

function* scripts(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* scripts(p);
    else if (name.endsWith('.js')) yield p;
  }
}

/** Hints every chunk under `dir`; returns how many files changed. */
export function hintChunks(dir) {
  let n = 0;
  for (const file of scripts(dir)) {
    const src = readFileSync(file, 'utf8');
    const out = withHint(src);
    if (out === src) continue;
    writeFileSync(file, out);
    n++;
    const ref = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(src)?.[1];
    const map = ref && !ref.startsWith('data:') ? join(dirname(file), ref) : null;
    if (map && existsSync(map)) writeFileSync(map, shiftMap(readFileSync(map, 'utf8')));
  }
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  if (!dir || !existsSync(dir)) {
    console.error(`compile-hints: no chunk folder at ${dir ?? '(none given)'}`);
    process.exit(1);
  }
  console.log(`compile-hints: ${hintChunks(dir)} script chunk(s) marked for eager compiling`);
}
