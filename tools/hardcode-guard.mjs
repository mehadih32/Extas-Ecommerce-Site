// PR 494 — the hardcode guard. Fails CI when code carries a key, a secret, owner data, a visible text or a business
// number that belongs in settings, the vault or a messages file (CLAUDE.md rules 1, 2 and 4). The rules live in
// tools/hardcode-guard.json. Comments are not scanned for "code" rules; secret rules scan everything.
//   node tools/hardcode-guard.mjs [paths…]     (no paths = the configured roots)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'tools/hardcode-guard.json'), 'utf8'));
const OPT_OUT = /hardcode-ok:\s*\S/;

/** Blank out comments, keeping line numbers (good enough for TS/JS; strings containing // are rare in our code). */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

export function compile(rules) {
  return rules.map((r) => ({
    ...r,
    re: new RegExp(r.pattern, (r.flags ?? '') + 'g'),
    allowRe: r.allow ? new RegExp(r.allow, 'i') : null,
    onlyRe: r.only ? new RegExp(r.only) : null,
  }));
}

/** Findings for one file's text. */
export function scan(file, text, rules) {
  const findings = [];
  const raw = text.split('\n');
  const code = stripComments(text).split('\n');
  const isJson = file.endsWith('.json');
  for (const rule of rules) {
    if (rule.onlyRe && !rule.onlyRe.test(file)) continue;
    if (rule.code && isJson) continue;
    const lines = rule.everywhere || isJson ? raw : code;
    lines.forEach((line, i) => {
      if (OPT_OUT.test(raw[i])) return;
      rule.re.lastIndex = 0;
      for (const m of line.matchAll(rule.re)) {
        if (rule.allowRe && rule.allowRe.test(m[0])) continue;
        findings.push({ file, line: i + 1, rule: rule.id, what: rule.what, text: m[0].trim().slice(0, 80) });
      }
    });
  }
  return findings;
}

function* walk(dir, cfg) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!cfg.skipDirs.includes(name)) yield* walk(p, cfg);
    } else if (cfg.extensions.includes(extname(name))) {
      const rel = relative(root, p);
      if (!cfg.skipFiles.some((s) => new RegExp(s).test(rel))) yield rel;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rules = compile(config.rules);
  const targets = process.argv.slice(2);
  const files = targets.length
    ? targets
    : config.scan.roots.filter((r) => { try { return statSync(join(root, r)).isDirectory(); } catch { return false; } })
        .flatMap((r) => [...walk(join(root, r), config.scan)]);
  const findings = files.flatMap((f) => scan(f, readFileSync(join(root, f), 'utf8'), rules));
  for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}] ${f.what}: ${f.text}`);
  console.log(`hardcode guard: ${files.length} files, ${findings.length} finding(s)`);
  process.exit(findings.length ? 1 : 0);
}
