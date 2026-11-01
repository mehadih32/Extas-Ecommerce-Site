// PR 414 follow-up (CN-013 go-live gate phase 2) — the report writer of the gate runs: README.md (a Bengali summary
// line for the owner, then the tables in simple English) and result.json, both safe to commit. Pure apart from the two
// writes. Nothing secret reaches it: the run passes only test data, order numbers and timings, and `scrub` takes out any
// value the caller names (a password, a token) and anything shaped like a credential before a line is written.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NETWORKS, DEVICES } from "./profiles.mjs";
import { STEPS, summarise, timingsTable } from "./verdict.mjs";

const SECRET_SHAPES = [
  /[a-z]+:\/\/[^\s:@/"']+:[^\s@/"']+@/gi, // a connection string with a password
  /\b(bearer|token|password|passwd|secret)\b\s*[:=]\s*\S+/gi,
  /__Host-[A-Za-z_]+=[^;\s]+/g, // a cookie with its value
];

/** The text without the named secret values and without anything shaped like a credential. */
export function scrub(text, secrets = []) {
  let s = String(text ?? "");
  for (const v of secrets) if (v && String(v).length >= 4) s = s.split(String(v)).join("[hidden]");
  for (const re of SECRET_SHAPES) s = s.replace(re, "[hidden]");
  return s;
}

/** Everything in a value (deep), scrubbed. */
export function scrubDeep(v, secrets = []) {
  if (typeof v === "string") return scrub(v, secrets);
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x, secrets));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x, secrets)]));
  return v;
}

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const ms = (v) => (Number.isFinite(v) ? (v >= 10_000 ? `${(v / 1000).toFixed(0)} s` : `${(v / 1000).toFixed(1)} s`) : "—");
const icon = (v) => (v === "PASS" ? "✅ PASS" : v === "FAIL" ? "❌ FAIL" : "⏭️ SKIP");

/** The owner's one line in plain Bengali (Western digits, as the stage pages use). */
export function bengaliLine(sum, cleanup) {
  if (!sum.scenarios) return "এই রানে কোনো পরীক্ষা চলেনি।";
  const cleaned = cleanup?.ok ? "সব টেস্ট অর্ডার বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়েছে।" : "টেস্ট অর্ডার পরিষ্কার পুরো হয়নি — নিচে দেখুন।";
  if (sum.failed) return `${sum.scenarios}টা পরীক্ষার মধ্যে ${sum.failed}টা ফেল, ${sum.passed}টা পাস, ${sum.skipped}টা বাদ। ${cleaned}`;
  if (!sum.passed) return `${sum.scenarios}টা পরীক্ষাই বাদ পড়েছে (কারণ নিচে)। ${cleaned}`;
  return `${sum.scenarios}টা পরীক্ষার ${sum.passed}টা পাস, ${sum.skipped}টা বাদ, কোনো ফেল নেই। ${cleaned}`;
}

/** The result.json the workflow commits (and the summary state reads). */
export function resultJson(run) {
  const sum = summarise(run.rows);
  return {
    kind: "gate-orders",
    at: run.at,
    sha: run.sha ?? "",
    host: run.host ?? "",
    ...sum,
    // passed only when no scenario failed AND the clean-up finished (after the spread: the summary's own `ok` knows only
    // the scenarios)
    ok: sum.ok && (run.cleanup?.ok ?? false),
    // the run made test data or orders (the server's safety net cleans up after a run that did and did not finish)
    started: !!run.started,
    // live run 2: false in the report written after each scenario; true once the run (and its clean-up) ended
    finished: run.finished !== false,
    providers: run.providers ?? null,
    payment: run.payment ?? null,
    budget: run.budget ?? null,
    rows: run.rows.map((r) => ({ id: r.id, title: r.title, device: r.device, network: r.network, verdict: r.verdict, orders: r.orders ?? [], addresses: r.addresses ?? [], timings: r.timings ?? null, over: r.over ?? [], checks: r.checks, shot: r.shot ?? null })),
    gateChecks: run.gateChecks ?? [],
    addressRows: run.addressRows ?? [],
    timings: timingsTable(run.rows.flatMap((r) => r.timed ?? [])),
    cleanup: run.cleanup ?? null,
    problems: run.problems ?? [],
  };
}

/** README.md: the summary, the scenarios, the gate checks, the timings, the addresses and the clean-up. */
export function reportMarkdown(run) {
  const res = resultJson(run);
  const L = [];
  L.push("# Go-live gate — test orders on the preview site");
  L.push("");
  L.push(`**সারকথা:** ${bengaliLine(res, run.cleanup)}`);
  L.push("");
  L.push(`- Run: ${run.at}${run.sha ? ` · version \`${run.sha}\`` : ""} · host: the preview host of the server's settings · scenarios asked: ${run.asked ?? "all"}`);
  L.push(`- Result: **${res.ok ? "PASS" : "FAIL"}** — ${res.passed} passed, ${res.failed} failed, ${res.skipped} skipped, ${res.orders} test orders placed.`);
  if (run.providers) {
    const live = run.providers.live ?? [];
    L.push(`- Providers: ${live.length ? `a real connection is switched on for ${live.map((p) => `${p.kind} (${p.provider})`).join(", ")} — every check that would reach it is a SKIP` : "every payment, courier, message and ERP connection is on its mock; nothing left the server"}.`);
  }
  if (run.payment) L.push(`- Payments: the mock bKash page — ${run.payment.mockPay}; cash on delivery — ${run.payment.cod}. No real payment key, price, discount or COD amount is touched.`);
  if (run.budget) L.push(`- Speed budget (${run.budget.source}): a page's largest paint ≤ ${ms(run.budget.page)}, a press's server answer ≤ ${ms(run.budget.press)}; counted on 4G and wifi, shown on 3G.`);
  if (run.finished === false) L.push(`- Written after scenario ${cell(run.rows.at(-1)?.id ?? "—")}: the run had not finished yet (a later report replaces this one; if none came, the run stopped here).`);
  for (const p of run.problems ?? []) L.push(`- Problem: ${cell(p)}`);
  L.push("");
  L.push("## Scenarios");
  L.push("");
  L.push("| # | Scenario | Device | Network | Addresses | Result | Orders | Timings (load · product · add · checkout · submit) | Why |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of run.rows) {
    const t = r.timings;
    const times = t ? STEPS.map((s) => ms(t[s.key]?.ms)).join(" · ") : "—";
    const why = r.checks.filter((c) => c.verdict !== "PASS" && c.detail).map((c) => `${c.verdict === "FAIL" ? "FAIL" : "skip"} ${c.id}: ${c.detail}`).slice(0, 4).join("; ");
    const over = (r.over ?? []).length ? ` ⚠ over budget: ${r.over.map((o) => `${o.step} ${ms(o.valueMs)}`).join(", ")}` : "";
    const shot = r.shot ? ` ([picture](${r.shot}))` : "";
    L.push(`| ${cell(r.id)} | ${cell(r.title)} | ${cell(DEVICES[r.device]?.label ?? r.device ?? "—")} | ${cell(NETWORKS[r.network]?.label ?? r.network ?? "—")} | ${cell((r.addresses ?? []).join(", ") || "—")} | ${icon(r.verdict)} | ${cell((r.orders ?? []).join(", ") || "—")} | ${times}${over} | ${cell(why)}${shot} |`);
  }
  L.push("");
  if (run.gateChecks?.length) {
    L.push("## The six gate checks that need an order (GATE-phase2 plan rows 1, 4, 7, 21, 23, 24)");
    L.push("");
    L.push("| Check | What | Result | How it was proved |");
    L.push("|---|---|---|---|");
    for (const g of run.gateChecks) L.push(`| ${cell(g.id)} | ${cell(g.what)} | ${icon(g.verdict)} | ${cell(g.detail)} |`);
    L.push("");
  }
  L.push("## Timings: phone vs desktop per network (median per step)");
  L.push("");
  L.push(`| Network | Screen | Orders | ${STEPS.map((s) => s.label).join(" | ")} |`);
  L.push(`|---|---|---|${STEPS.map(() => "---").join("|")}|`);
  for (const t of res.timings) L.push(`| ${NETWORKS[t.network]?.label ?? t.network} | ${t.cls} | ${t.orders} | ${STEPS.map((s) => ms(t.steps[s.key])).join(" | ")} |`);
  if (!res.timings.length) L.push("| — | — | 0 | " + STEPS.map(() => "—").join(" | ") + " |");
  L.push("");
  if (run.addressRows?.length) {
    L.push("## Addresses: typed → stored → admin → courier → sticker");
    L.push("");
    L.push("Every order used its own address. A row fails when a word, a digit or the phone number arrives changed at any stage (spacing and line breaks are forgiven). `Place` is how the shop read the area: OK, WIDER (only the district), OTHER (another area of the same district), UNREAD (not read; the order still went through, PR 563), WRONG (another district: a fail).");
    L.push("");
    L.push("| Order | Address (test data) | Quirk | Phone typed as | Stored | Admin | Courier | Sticker | Place | Band · charge | Result | Differences |");
    L.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const a of run.addressRows) {
      const st = (k) => (a.stages?.[k] === undefined || a.stages?.[k] === null ? "skip" : a.diffs.some((d) => d.stage === k) ? "✗" : "✓");
      L.push(`| ${cell(a.number)} | ${cell(a.addressId)} | ${cell(a.quirk ?? "")} | ${cell(a.phoneFormat)} | ${st("stored")} | ${st("admin")} | ${st("courier")} | ${st("sticker")} | ${cell(a.place)} | ${cell(a.band ?? "—")} | ${icon(a.verdict)} | ${cell(a.diffs.map((d) => `${d.stage}.${d.field}`).join(", "))} |`);
    }
    if (run.coverage) L.push("", `Coverage: ${run.coverage.divisions.length} divisions (${run.coverage.divisions.join(", ")}); ${run.coverage.outsideDistricts.length} districts outside Dhaka.`);
    L.push("");
  }
  L.push("## Clean-up (nothing deleted)");
  L.push("");
  const c = run.cleanup;
  if (!c) L.push("- The clean-up did not run. The next run cancels every open test order first.");
  else {
    L.push(`- Test orders cancelled through the normal cancel path: ${c.cancelled ?? 0} now, ${c.alreadyClosed ?? 0} were already closed${c.failed?.length ? `; could not cancel: ${c.failed.map(cell).join(", ")}` : ""}.`);
    L.push(`- Test products archived: ${c.productsArchived ?? 0}; their colours, sizes and stock shelf: ${c.extrasArchived ?? 0}.${c.courierArchived ? " The test courier account the run added is archived." : ""}`);
    L.push(`- Sales (delivered only): ${c.salesOk ? "no test order counts as a sale" : "a test order counts as a sale — FAIL"} (${cell(c.salesDetail ?? "")}).`);
    L.push(`- Marked as tests: ${cell(c.tagged ?? "")}`);
    if (c.refundRequests) L.push(`- Refund requests the cancels recorded for the mock-paid test orders: ${c.refundRequests} (requests only, no money moved; the mock never took any). The owner may close them on Money › Refunds.`);
    for (const n of c.notes ?? []) L.push(`- ${cell(n)}`);
  }
  L.push("");
  L.push("How to run: GitHub › Actions › **gate-orders** › Run workflow (by hand only). `scenarios`: all, or a list such as `1,5,7`; `allow_cod` (off unless the owner says so) switches cash on delivery on for the run only and puts it back. The run places real orders only on the preview host and only on the mocks; it never runs on a schedule.");
  L.push("");
  return L.join("\n");
}

/** Writes README.md and result.json into `dir`, scrubbed of `secrets`. */
export function writeReport(dir, run, secrets = []) {
  mkdirSync(dir, { recursive: true });
  const clean = scrubDeep(run, secrets);
  writeFileSync(join(dir, "result.json"), `${JSON.stringify(resultJson(clean), null, 2)}\n`);
  writeFileSync(join(dir, "README.md"), scrub(reportMarkdown(clean), secrets));
}
