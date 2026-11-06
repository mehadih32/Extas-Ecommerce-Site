// PR 414 follow-up (follow-up 668, CN-036) — the pure part of the 70-order simulation on the runner: which plan rows
// the shop can play today (a payment method or a courier the shop has switched off is a SKIP with its reason, never a
// FAIL), the plan's markdown tables read back (so plan.json cannot drift from docs/qa/SIMULATION-PLAN.md and the
// report's part 2), and the report in Bengali and English. No number of the shop is written here: amounts come from
// the shop's own order records, limits from server.conf.

export const PAY_LABEL = {
  cod: "cash on delivery",
  bkash: "bKash",
  nagad: "Nagad",
  card: "card",
  bank: "bank transfer / advance",
  "bkash-cod": "bKash, then cash on delivery",
};
export const PAY_BN = { cod: "ক্যাশ অন ডেলিভারি", bkash: "বিকাশ", nagad: "নগদ", card: "কার্ড", bank: "ব্যাংক / অগ্রিম", "bkash-cod": "বিকাশ, পরে ক্যাশ অন ডেলিভারি" };
export const COURIER_LABEL = { steadfast: "Steadfast", pathao: "Pathao", redx: "RedX", any: "the shop's choice" };
const AREA_LABEL = { city: "Dhaka city", sub: "Dhaka sub-area", outside: "Outside Dhaka" };

/** The plan's Pay column in one word (the final method; "COD + ৳… bKash outside" is a COD order with an advance). */
export function payOf(text) {
  const t = String(text ?? "").trim();
  if (/^COD\b/i.test(t)) return "cod";
  if (/→\s*COD/i.test(t)) return "bkash-cod";
  if (/bank|advance/i.test(t)) return "bank"; // a bank transfer or an advance (by bank or bKash) outside the checkout
  if (/bkash/i.test(t)) return "bkash";
  if (/nagad/i.test(t)) return "nagad";
  if (/card/i.test(t)) return "card";
  return null;
}

/** The plan's Courier column: a courier's key, null for "–" (the order never reaches a courier). */
export function courierOf(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t || t === "–" || t === "-") return null;
  return Object.keys(COURIER_LABEL).find((k) => k !== "any" && t.includes(k)) ?? t;
}

/** The rows of the first markdown table after `heading` (cells trimmed, the header and the --- line left out). */
export function tableRows(md, heading) {
  const lines = String(md).split("\n");
  const at = lines.findIndex((l) => l.startsWith(heading));
  if (at < 0) return [];
  const out = [];
  let inTable = false;
  for (const l of lines.slice(at + 1)) {
    if (l.startsWith("|")) {
      inTable = true;
      const cells = l.slice(1, l.trimEnd().endsWith("|") ? l.trimEnd().length - 1 : undefined).split(" | ").map((c) => c.trim());
      if (/^-+$/.test(cells[0]?.replace(/\|/g, "") ?? "")) continue;
      out.push(cells);
    } else if (inTable) break;
  }
  return out.slice(1); // the header row
}

/**
 * Can the run pay the row's way on the shop as it is set now? `sw` = the oracle's switches, `canPrepay` = why the run
 * cannot pay ahead on the mock (null when it can). A method the shop does not offer is a SKIP with its reason.
 */
export function payState(pay, sw, canPrepay = null) {
  const wallet = (m) => sw?.mobile?.enabled === true && (sw.mobile.list ?? []).includes(m);
  switch (pay) {
    case "cod":
      return { how: "cod" };
    case "bkash":
    case "nagad":
      if (!wallet(pay)) return { skip: `${PAY_LABEL[pay]} is switched off on the shop (Payments › mobile wallets)` };
      if (canPrepay) return { skip: canPrepay };
      return { how: pay };
    case "card":
      if (sw?.card !== true) return { skip: "card payment is switched off on the shop (Payments › cards)" };
      return { skip: "card payment is on, but the run pays only on the practice mobile-wallet page: a person plays a card order" };
    case "bank":
      return { skip: "a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders)" };
    case "bkash-cod":
      return { how: "cod", first: wallet("bkash") && !canPrepay ? "bkash" : null, firstSkip: wallet("bkash") ? canPrepay : `${PAY_LABEL.bkash} is switched off on the shop (Payments › mobile wallets)` };
    default:
      return { skip: `the plan's payment "${pay}" is not known to the run` };
  }
}

/**
 * Can the row's courier take the parcel? `facts` = the oracle's `couriers` answer ({providers: adapter keys, accounts:
 * [{provider, enabled}]}, the run's own account left out). A courier the shop has no connection for, or whose accounts
 * are all switched off, is a SKIP. A courier with no account yet (its keys come later, CN-035) books on the run's own
 * mock account, said in the row.
 */
export function courierState(courier, facts) {
  if (courier === null || courier === undefined) return { book: false, note: "the plan's order never reaches a courier" };
  if (courier === "any") return { book: true, note: "the shop's courier choice; booked on the run's own mock courier account" };
  const label = COURIER_LABEL[courier] ?? courier;
  if (!facts) return { book: true, note: `the shop's courier list could not be read; booked on the run's own mock courier account` };
  if (!(facts.providers ?? []).includes(courier)) return { skip: `the shop has no ${label} courier (no connection for it in this build)` };
  const mine = (facts.accounts ?? []).filter((a) => a.provider === courier);
  if (mine.length && !mine.some((a) => a.enabled)) return { skip: `${label} is switched off on the shop (Delivery › Couriers)` };
  return { book: true, note: mine.length ? `${label} is on; booked on the run's own mock courier account` : `the shop has no ${label} account yet (its keys come later); booked on the run's own mock courier account` };
}

/**
 * The check a row carries when the run played a person's step: a repeat buyer's new order waited in the
 * possible-duplicate review (PR 145) beside his own earlier test order, and the run, as the person who reviews, decided
 * "not a duplicate" through the review's own decision. The report names these rows in Bengali and English.
 */
export const PERSON_REVIEW = "held for a person's duplicate review; the run, as that person, decided \"not a duplicate\"";

/** The rows where the run acted as the person who reviews (PERSON_REVIEW passed). */
export const personReviewRows = (sum) => sum.table.filter((t) => t.checks.some((c) => c.id === PERSON_REVIEW && c.verdict === "PASS")).map((t) => t.plan.n);

const nn = (n) => String(n).padStart(2, "0");
export const rowTitle = (r) => `Order ${nn(r.n)} · ${r.persona} · ${r.place || AREA_LABEL[r.area] || r.area} · ${r.items} · ${PAY_LABEL[r.pay] ?? r.pay}${r.courier ? ` · ${COURIER_LABEL[r.courier] ?? r.courier}` : ""}`;

/** The run's rows with the plan's columns beside them, and the skip reasons grouped (the report's two tables). */
export function simulationSummary(rows, plan) {
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const table = plan.rows.map((p) => {
    const r = byId.get(String(p.n));
    return { plan: p, asked: !!r, verdict: r?.verdict ?? "NOT ASKED", orders: r?.orders ?? [], checks: r?.checks ?? [], shot: r?.shot ?? null };
  });
  const asked = table.filter((t) => t.asked);
  const n = (v) => asked.filter((t) => t.verdict === v).length;
  const reasons = new Map();
  for (const t of asked.filter((x) => x.verdict === "SKIP")) {
    const why = t.checks.find((c) => c.verdict === "SKIP")?.detail || "skipped";
    reasons.set(why, [...(reasons.get(why) ?? []), t.plan.n]);
  }
  return {
    planned: plan.rows.length,
    asked: asked.length,
    passed: n("PASS"),
    failed: n("FAIL"),
    skipped: n("SKIP"),
    orders: asked.reduce((s, t) => s + t.orders.length, 0),
    ok: asked.length > 0 && n("FAIL") === 0 && n("PASS") > 0,
    skipReasons: [...reasons.entries()].map(([why, ns]) => ({ why, rows: ns })).sort((a, b) => b.rows.length - a.rows.length),
    table,
  };
}

/** The owner's lines in plain Bengali (Western digits). */
export function bengaliSummary(sum, cleanupOk) {
  const L = [];
  if (!sum.asked) return ["এই রানে কোনো অর্ডার চালানো হয়নি।"];
  L.push(`পরিকল্পনার ${sum.planned}টা অর্ডারের মধ্যে ${sum.asked}টা চালানো হয়েছে: ${sum.passed}টা পাস, ${sum.failed}টা ফেল, ${sum.skipped}টা বাদ। মোট ${sum.orders}টা টেস্ট অর্ডার দেওয়া হয়েছে।`);
  if (sum.skipped) L.push("বাদ পড়া অর্ডারগুলো ফেল নয়: দোকানে ওই পেমেন্ট বা কুরিয়ার এখন বন্ধ (আপনার সিদ্ধান্ত: এখন শুধু ক্যাশ অন ডেলিভারি)। কারণ নিচের টেবিলে।");
  L.push(cleanupOk ? "সব টেস্ট অর্ডার বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়েছে; কিছু মোছা হয়নি, কোনো টাকা নড়েনি, কোনো আসল কাস্টমারকে মেসেজ যায়নি।" : "টেস্ট অর্ডার পরিষ্কার পুরো হয়নি — নিচে দেখুন; পরের রান শুরুতেই বাকিগুলো বাতিল করবে।");
  L.push("দরজার ঘটনা, কুরিয়ারের টাকা মেলানো, চ্যাট আর রিভিউ মেশিন খেলতে পারে না — সেগুলো নিচের \"মানুষের কাজ\" তালিকায়।");
  const held = personReviewRows(sum);
  if (held.length) L.push(`পুরনো কাস্টমারের আগের অর্ডার খোলা থাকায় নতুন অর্ডার "সম্ভাব্য ডুপ্লিকেট" রিভিউতে আটকেছে — এটা ঠিক আচরণ, একজন মানুষ সিদ্ধান্ত দেন। এই রান সেই মানুষের হয়ে অ্যাডমিনের নিজের বোতামে "ডুপ্লিকেট নয়" দিয়েছে, তারপর বুক করেছে (অর্ডার ${held.map(nn).join(", ")})।`);
  L.push(`ফলাফলটা Go-live পাতায় "simulation" লাইনের পাশে দেখা যাবে। নিশ্চিত করা (Confirm) একজন মানুষের কাজ — এই রান নিজে কিছু নিশ্চিত করে না।`);
  return L;
}

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const icon = (v) => (v === "PASS" ? "✅ PASS" : v === "FAIL" ? "❌ FAIL" : v === "SKIP" ? "⏭️ SKIP" : "— not asked");

/** README.md of the simulation run: Bengali first, then the English tables. `res` = the run's result.json. */
export function simulationMarkdown(res, sum, run = {}) {
  const L = [];
  L.push("# The 70-order real-life journey simulation — on the preview site");
  L.push("");
  L.push(`**সারকথা:** ${sum.failed ? "ফেল আছে" : sum.passed ? "কোনো ফেল নেই" : "কিছুই চলেনি"} — ${bengaliSummary(sum, res.cleanup?.ok)[0]}`);
  L.push("");
  for (const b of bengaliSummary(sum, res.cleanup?.ok).slice(1)) L.push(`- ${b}`);
  L.push("");
  L.push(`- Run: ${cell(res.at)}${res.sha ? ` · version \`${res.sha}\`` : ""} · host: the preview host of the server's settings · rows asked: ${cell(run.asked ?? "all")}`);
  L.push(`- Result: **${sum.ok && res.cleanup?.ok ? "PASS" : "FAIL"}** — of the plan's ${sum.planned} orders, ${sum.asked} asked: ${sum.passed} passed, ${sum.failed} failed, ${sum.skipped} skipped; ${sum.orders} test orders placed (every one cancelled at the end; nothing deleted).`);
  L.push("- Plan: docs/qa/SIMULATION-PLAN.md §3 (orders 1–50) and docs/qa/SIMULATION-REPORT.md P2.2 (orders 51–70), as tools/simulation/plan.json plays them: the GATE TEST shelf's pieces in the plan's basket sizes, the test addresses of tools/gate-orders, sample customers with made-up numbers. A row whose payment method or courier is switched off on the shop is a SKIP with the reason, never a FAIL.");
  if (res.providers) L.push(`- Providers: ${(res.providers.live ?? []).length ? `a real connection is switched on for ${res.providers.live.map((p) => `${p.kind} (${p.provider})`).join(", ")} — every check that would reach it is a SKIP` : "every payment, courier, message and ERP connection is on its mock; nothing left the server"}.`);
  if (res.payment) L.push(`- Payments: cash on delivery — ${cell(res.payment.cod)}; the practice wallet page — ${cell(res.payment.mockPay)}. No price, discount, COD amount or real payment key is touched.`);
  const held = personReviewRows(sum);
  if (held.length) L.push(`- A person's step played by the run: rows ${held.map(nn).join(", ")} — the repeat buyer's new order waited in the possible-duplicate review (PR 145) beside his own earlier test order, still open; the run, acting as the person who reviews, decided "not a duplicate" through the review's own decision (the admin's button, \`orders.risk.decide\`, its note on the decision log), then confirmed and booked. Any other review is left for a person.`);
  for (const p of res.problems ?? []) L.push(`- Problem: ${cell(p)}`);
  L.push("");
  if (sum.skipReasons.length) {
    L.push("## Why rows were skipped");
    L.push("");
    L.push("| Reason | Rows | Count |");
    L.push("|---|---|---:|");
    for (const s of sum.skipReasons) L.push(`| ${cell(s.why)} | ${s.rows.map(nn).join(", ")} | ${s.rows.length} |`);
    L.push("");
  }
  L.push("## The 70 orders");
  L.push("");
  L.push("| # | Day | Persona | Area | Items (plan) | Pay | Courier | Result | Test orders | Proved by the run | Not proved / failed |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const t of sum.table) {
    const p = t.plan;
    const proved = t.checks.filter((c) => c.verdict === "PASS").map((c) => c.id).join("; ");
    const not = t.checks.filter((c) => c.verdict !== "PASS").map((c) => `${c.verdict === "FAIL" ? "FAIL" : "skip"} ${c.id}${c.detail ? `: ${c.detail}` : ""}`).slice(0, 4).join("; ");
    const shot = t.shot ? ` ([picture](${t.shot}))` : "";
    L.push(`| ${nn(p.n)} | ${cell(p.day)} | ${cell(p.persona)} | ${cell(p.place || AREA_LABEL[p.area] || p.area)} | ${cell(p.items)} | ${cell(PAY_LABEL[p.pay] ?? p.pay)} | ${cell(p.courier ? (COURIER_LABEL[p.courier] ?? p.courier) : "–")} | ${icon(t.verdict)} | ${cell(t.orders.join(", ") || "—")} | ${cell(proved || "—")} | ${cell(not)}${shot} |`);
  }
  L.push("");
  L.push("## Left to a person (what the run cannot play on the mocks)");
  L.push("");
  L.push("The door (try-on, bargaining, partial, refusal), the courier's statement and settlement, chats, calls, reviews, refunds and the owner's money decisions stay with a person or a real courier: this list is the staging acceptance walk's part (docs/golive/ACCEPTANCE.md). The run never claims them.");
  L.push("");
  L.push("| # | Event | Run's row |");
  L.push("|---|---|---|");
  for (const t of sum.table.filter((x) => x.plan.person)) L.push(`| ${nn(t.plan.n)} | ${cell(t.plan.person)} | ${icon(t.verdict)} |`);
  L.push("");
  L.push("## Clean-up (nothing deleted)");
  L.push("");
  const c = res.cleanup;
  if (!c) L.push("- The clean-up did not run. The next run cancels every open test order first.");
  else {
    L.push(`- Test orders cancelled through the normal cancel path: ${c.cancelled ?? 0} now, ${c.alreadyClosed ?? 0} were already closed${c.failed?.length ? `; could not cancel: ${c.failed.map(cell).join(", ")}` : ""}.`);
    L.push(`- Test products archived: ${c.productsArchived ?? 0}; their colours, sizes and stock shelf: ${c.extrasArchived ?? 0}.${c.courierArchived ? " The test courier account the run added is archived." : ""}`);
    L.push(`- Sales (delivered only): ${c.salesOk ? "no test order counts as a sale" : "a test order counts as a sale — FAIL"} (${cell(c.salesDetail ?? "")}).`);
  }
  L.push("");
  L.push("Every order's address round trip (typed → stored → admin → courier → sticker) and the timings per device and network: [orders.md](orders.md).");
  L.push("");
  L.push("How to run: GitHub › Actions › **simulation** › Run workflow (by hand only). `orders`: all, or a list such as `1,13,55`. It places test orders only on the preview host and only on the mocks, never on a schedule. The go-live page shows the last run beside its \"simulation\" row; a person confirms that row.");
  L.push("");
  return L.join("\n");
}

