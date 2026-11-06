#!/usr/bin/env node
// PR 393 follow-up (CN-036) — the acceptance run's one summary (infra/deploy/acceptance.sh; .github/workflows/
// acceptance.yml, by hand only). The run is the four go-live runs that already exist, one after the other on the live
// version: the smoke test of every page, the go-live gate journeys, the go-live test orders and the customer 360°. Each
// keeps its own report (committed to its usual folder); this reads their result.json files and writes one README.md
// (Bengali first) and result.json beside them. It never re-runs or re-judges a part: a part passes when its own report
// says ok and its script ended 0.
//   node tools/acceptance/summary.mjs <out-dir> <time text> <iso time> [<commit sha>]
// <out-dir> holds smoke/, journeys/, gate-orders/, gate-c360/ (each with result.json when it ran) and exits.json
// ({part: exit code}). Pure functions are exported for the tests.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The parts in the order they run, each with the folder its own workflow commits its report to. */
export const PARTS = [
  { key: "smoke", title: "Smoke test: every built page, signed out and as the admin, phone and desktop", bn: "স্মোক টেস্ট (সব পাতা)", report: "docs/reports/smoke/latest/" },
  { key: "journeys", title: "Go-live gate journeys (journeys group go-live-gate: orders and changes nothing)", bn: "go-live gate journeys", report: "docs/reports/journeys/go-live-gate/latest/" },
  { key: "gate-orders", title: "Go-live test orders: 18 scenarios on the mocks, every order cancelled after", bn: "টেস্ট অর্ডার (18টা পরিস্থিতি)", report: "docs/reports/gate-orders/latest/" },
  { key: "gate-c360", title: "Customer 360°: one test customer's whole life cycle", bn: "কাস্টমারের পুরো যাত্রা (360°)", report: "docs/reports/gate-c360/latest/" },
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** One part's line from its own result.json (null when it wrote none) and its script's exit code. */
export function partResult(key, res, exit) {
  const code = Number.isInteger(exit) ? exit : null;
  if (!res) return { key, ran: false, ok: false, exit: code, line: `no report (the script ended ${code ?? "without an exit code"} before it wrote one)` };
  let line;
  switch (key) {
    case "smoke":
      line = `${num(res.pages)} page views, ${num(res.failed)} failed`;
      break;
    case "journeys":
      line = `${num(res.journeys)} journeys, ${num(res.steps)} steps: ${num(res.failed)} failed, ${num(res.skipped)} skipped`;
      break;
    case "gate-orders":
      line = `${num(res.scenarios)} scenarios: ${num(res.passed)} passed, ${num(res.failed)} failed, ${num(res.skipped)} skipped; ${num(res.orders)} test orders, clean-up ${res.cleanup?.ok ? "done" : "NOT finished"}`;
      break;
    case "gate-c360":
      line = `${num(res.steps)} steps: ${num(res.pass)} pass, ${num(res.fail)} fail, ${num(res.skip)} skip`;
      break;
    default:
      line = res.ok ? "ok" : "not ok";
  }
  const ok = res.ok === true && code === 0;
  if (res.ok === true && code !== 0) line += ` (its report says ok, but the script ended ${code ?? "without an exit code"})`;
  return { key, ran: true, ok, exit: code, line, at: res.at ?? null };
}

/** The whole run: ok only when every part ran and passed. */
export function acceptanceResult(parts, { at, iso, sha = "" }) {
  const ok = parts.length === PARTS.length && parts.every((p) => p.ok);
  return { kind: "acceptance", at, iso, sha, ok, passed: parts.filter((p) => p.ok).length, total: PARTS.length, parts };
}

/** README.md: the owner's lines in Bengali (Western digits), then the table with each part's own report. */
export function acceptanceMarkdown(r) {
  const failed = r.parts.filter((p) => !p.ok);
  const L = [];
  L.push("# The acceptance run on the preview site");
  L.push("");
  L.push(`**সারকথা:** ${r.ok ? `${r.total}টা অংশের সবগুলো পাস।` : `${r.total}টা অংশের ${r.passed}টা পাস; ${failed.length}টা পাস হয়নি: ${failed.map((p) => PARTS.find((x) => x.key === p.key)?.bn ?? p.key).join(", ")}।`}`);
  L.push("");
  L.push("- এই রান নতুন কিছু পরীক্ষা বানায় না: আগের চারটা পরীক্ষা (সব পাতা, journeys, টেস্ট অর্ডার, কাস্টমারের পুরো যাত্রা) একসাথে, লাইভ ভার্সনে চালায়। প্রতিটার নিজের রিপোর্ট নিচের লিংকে।");
  L.push("- টেস্ট অর্ডার সব বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়; কিছু মোছা হয় না, কোনো টাকা নড়ে না, আসল কাস্টমারকে কোনো মেসেজ যায় না।");
  L.push(`- ফলাফলটা Go-live পাতায় "acceptance" লাইনের পাশে দেখা যাবে। docs/golive/ACCEPTANCE.md-এর যে লাইনগুলো মানুষকে দেখতে হয়, সেগুলো দেখে নিশ্চিত করা (Confirm) একজন মানুষের কাজ — এই রান নিজে কিছু নিশ্চিত করে না।`);
  L.push("");
  L.push(`- Run: ${r.at}${r.sha ? ` · version \`${r.sha}\`` : ""} · host: the preview host of the server's settings`);
  L.push(`- Result: **${r.ok ? "PASS" : "FAIL"}** — ${r.passed} of ${r.total} parts passed.`);
  L.push("");
  L.push("| # | Part | Result | What it found | Its own report |");
  L.push("|---|---|---|---|---|");
  PARTS.forEach((def, i) => {
    const p = r.parts.find((x) => x.key === def.key);
    L.push(`| ${i + 1} | ${def.title} | ${p?.ok ? "✅ PASS" : p?.ran ? "❌ FAIL" : "❌ did not run"} | ${String(p?.line ?? "—").replace(/\|/g, "\\|")} | [${def.report}](../../../../${def.report}README.md) |`);
  });
  L.push("");
  L.push("Each part keeps its own rules: the smoke test signs in with the server-only check account; the journeys order and change nothing; the test orders and the customer 360° run only on the preview host and only on the mocks, cancel every test order and archive the test products, and put the owner's cash-on-delivery setting back as it was. A part that a switched-off method or courier cannot play is a SKIP inside that part, never a failure.");
  L.push("");
  L.push("How to run: GitHub › Actions › **acceptance** › Run workflow (by hand only). The person's part of docs/golive/ACCEPTANCE.md (real phones, the admin's own walk) is confirmed on Settings → System → Go-live.");
  L.push("");
  return L.join("\n");
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Reads the parts in `dir`, writes README.md and result.json there, and returns the result. */
export function writeAcceptance(dir, { at, iso, sha }) {
  const exits = readJson(join(dir, "exits.json")) ?? {};
  const parts = PARTS.map((p) => partResult(p.key, existsSync(join(dir, p.key, "result.json")) ? readJson(join(dir, p.key, "result.json")) : null, exits[p.key]));
  const r = acceptanceResult(parts, { at, iso, sha });
  writeFileSync(join(dir, "result.json"), `${JSON.stringify(r, null, 2)}\n`);
  writeFileSync(join(dir, "README.md"), acceptanceMarkdown(r));
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, at, iso, sha] = process.argv.slice(2);
  if (!dir || !at || !iso) {
    console.error("usage: summary.mjs <out-dir> <time text> <iso time> [<commit sha>]");
    process.exit(2);
  }
  const r = writeAcceptance(dir, { at, iso, sha: sha ?? "" });
  console.log(`acceptance: ${r.ok ? "PASS" : "FAIL"} — ${r.passed} of ${r.total} parts`);
  process.exit(r.ok ? 0 : 1);
}
