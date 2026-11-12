// PR 324 (Blueprint C1.4 "the AI-off principle" — "every AI-driven step has a rule-based or template-based fallback
// that runs when AI is off"; S15 AI 360, demo 97y-adm2-ai.js's "AI-off test" card) — a deterministic SOURCE SCAN, the
// same method as the hardcode guard (PR 494): never a live runtime test, never an invented pass count.
//
// What it actually proves, and what it does not: no AI job dispatcher exists yet (every S15 PR so far says so
// honestly — cost-book.ts, control-room.ts), so there is nothing to run live. What CAN be checked today, on the real
// source tree, is narrower and real: for a first set of named feature areas, the deterministic rule/template path
// the Blueprint requires is ALREADY MERGED CODE, named here with a file and the exact words that prove it (never a
// guess). Each check also claims the `JOB_CATALOG` (PR 312) job keys it covers, so the result is honest about scope:
// "ok/n checks passed, covering `coveredJobCount` of `totalJobCount` AI jobs" — the rest of the catalogue is real,
// open follow-up work, never silently claimed as covered.
//
// PR 506 extends this with "journey" checks (see `runGuard`'s own comment): the ordinary customer journey (a COD
// order, a size exchange, confirming an order and printing its invoice, the size finder and delivery band) has no
// AI job on its critical path at all — not merely a fallback, but a complete absence of dependency.
//
// The rules live in tools/ai-off-guard.json (rules as data, like hardcode-guard.json). This script:
//   node tools/ai-off-guard.mjs            scans, writes docs/reports/ai-off-guard.json, exit 1 on any failed check
//   node tools/ai-off-guard.mjs --check    scans, fails if the committed report is stale (never writes)
//
// The committed report is read at runtime by apps/web/src/lib/admin-ai/ai-off-guard.ts from the server's own copy of
// docs/ (EXTAS_DOCS_DIR, filled by every deploy — the same mechanism PR 594's build-register.ts and the admin guide
// panel already use) — never a live scan in production, since the deployed image carries no TypeScript source
// (apps/web/Dockerfile's `run` stage is `.next/standalone` + `.next/static` + `public` only).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPORT_PATH = 'docs/reports/ai-off-guard.json';

/** Every `textJob(...)`/`imageJob(...)`/`videoJob(...)` call in the JOB_CATALOG block, as `{ key, agentKey }`. Split
 * by call *start* (never by matching parens on the whole block, since a description may itself hold `)`), so a
 * malformed trailing call is simply the last slice — harmless, since only `key`/`agentKey` are read from each. */
export function parseJobCatalog(fileText, cfg) {
  const start = fileText.indexOf(cfg.startMarker);
  const end = fileText.indexOf(cfg.endMarker, start < 0 ? 0 : start);
  if (start < 0 || end < 0) return [];
  const block = fileText.slice(start, end);
  const callRe = /\b(?:textJob|imageJob|videoJob)\(/g;
  const starts = [];
  let m;
  while ((m = callRe.exec(block))) starts.push(m.index);
  const AGENTS = ['gyani', 'sawdagor', 'doot', 'tirondaj', 'prohori', 'bhandari', 'shilpi'];
  const agentRe = new RegExp(`,\\s*(null|'(${AGENTS.join('|')})')\\s*,`);
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const call = block.slice(starts[i], starts[i + 1] ?? block.length);
    const keyMatch = /\(\s*'([^']+)'/.exec(call);
    const agentMatch = agentRe.exec(call);
    if (!keyMatch || !agentMatch) continue; // malformed/trailing slice: skip rather than guess
    out.push({ key: keyMatch[1], agentKey: agentMatch[1] === 'null' ? null : agentMatch[2] });
  }
  return out;
}

/** The catalogue keys one check claims to cover — by exact key and/or prefix — intersected with the keys that
 * actually exist today, so a renamed/removed job is dropped rather than silently over-claimed. */
export function coveredKeys(check, catalog) {
  const all = catalog.map((j) => j.key);
  const exact = new Set(check.jobKeys ?? []);
  const prefixes = check.jobKeyPrefixes ?? [];
  return all.filter((k) => exact.has(k) || prefixes.some((p) => k.startsWith(p)));
}

/** One check's own proofs: every file must exist and hold every required substring. `readFile` is injected so tests
 * never touch the real filesystem. */
export function checkProofs(check, readFile) {
  const reasons = [];
  for (const proof of check.proofs) {
    let text;
    try {
      text = readFile(proof.file);
    } catch {
      reasons.push(`${proof.file}: not found`);
      continue;
    }
    for (const needle of proof.mustInclude) {
      if (!text.includes(needle)) reasons.push(`${proof.file}: missing "${needle}"`);
    }
  }
  return reasons;
}

/** The whole scan, pure given its inputs: never the system clock except for the report's own `at` (a fact about
 * when the scan ran, not a number the scan invents).
 *
 * PR 506 (Blueprint C1.4; `docs/agents/AGENT-PROTOCOL.md` "the whole site works with AI off (PR 506)", named beside
 * the master switch, PR 305, and the per-agent spend cap, PR 309, as the third safety pillar) adds a second KIND of
 * check, `journey: true`: it proves a step of the *ordinary customer journey* (placing a Cash-on-Delivery order, a
 * size exchange, confirming an order and printing its invoice, the size finder and the delivery band it prices with)
 * never touches an AI job at all — these steps predate AI entirely and stay exactly as they are with the master
 * switch off. Such a check claims no `JOB_CATALOG` coverage on purpose (an empty `jobKeys`/`jobKeyPrefixes`, same as
 * every other check), so it is never penalised as "stale" for matching zero jobs, and passes on its proofs alone —
 * the same honest, no-invented-pass-count method `checkProofs` already uses for every other check. A `journey` check
 * whose proofs fail still fails exactly like any other. */
export function runGuard({ cfg, readFile, catalogText, now = () => new Date() }) {
  const catalog = parseJobCatalog(catalogText, cfg.jobCatalog);
  const covered = new Set();
  const checks = cfg.checks.map((check) => {
    const journey = check.journey === true;
    const keys = coveredKeys(check, catalog);
    const reasons = checkProofs(check, readFile);
    const pass = reasons.length === 0 && (journey || keys.length > 0);
    if (!pass && !journey && keys.length === 0) reasons.push('no JOB_CATALOG entry matches this check any more — it is stale');
    if (pass) for (const k of keys) covered.add(k);
    return { id: check.id, nameEn: check.nameEn, nameBn: check.nameBn, fallbackEn: check.fallbackEn, fallbackBn: check.fallbackBn, journey, pass, jobKeys: keys, reasons };
  });
  const ok = checks.filter((c) => c.pass).length;
  const journeyChecks = checks.filter((c) => c.journey);
  const journeyOk = journeyChecks.filter((c) => c.pass).length;
  return { at: now().toISOString(), n: checks.length, ok, totalJobCount: catalog.length, coveredJobCount: covered.size, journeyN: journeyChecks.length, journeyOk, checks };
}

function realReadFile(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = JSON.parse(readFileSync(join(root, 'tools/ai-off-guard.json'), 'utf8'));
  const catalogText = realReadFile(cfg.jobCatalog.file);
  const result = runGuard({ cfg, readFile: realReadFile, catalogText });

  for (const c of result.checks) {
    const line = `${c.pass ? 'PASS' : 'FAIL'} ${c.id} (${c.jobKeys.length} job${c.jobKeys.length === 1 ? '' : 's'})`;
    console.log(c.reasons.length ? `${line} — ${c.reasons.join('; ')}` : line);
  }
  console.log(`ai-off guard: ${result.ok}/${result.n} checks passed, covering ${result.coveredJobCount}/${result.totalJobCount} AI jobs (${result.journeyOk}/${result.journeyN} whole-shop journey steps)`);

  const checkOnly = process.argv.includes('--check');
  const reportFile = join(root, REPORT_PATH);
  if (checkOnly) {
    const committed = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null;
    const fresh = { ...result, at: committed?.at ?? result.at }; // the timestamp is allowed to differ; nothing else may
    const stale = !committed || JSON.stringify(fresh) !== JSON.stringify(committed);
    if (stale) console.log(`::error::${REPORT_PATH} is out of date — run node tools/ai-off-guard.mjs and commit the result`);
    process.exit(stale || result.ok !== result.n ? 1 : 0);
  }
  writeFileSync(reportFile, JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok === result.n ? 0 : 1);
}
