// PR 414 follow-up (follow-up 668, CN-036) — the simulation run's report, written in place of the gate's own (shop.mjs
// run.save with GATE_PLAN=simulation): README.md (Bengali first, then the 70 rows in English), result.json (the gate's
// result plus `kind: "simulation"`, the plan's columns per row and the counts the go-live page shows) and orders.md (the
// gate's own detail: every order's address round trip and the timings). Scrubbed of the run's secrets like the gate's.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reportMarkdown, resultJson, scrub, scrubDeep } from "../gate-orders/lib/report.mjs";
import { simulationMarkdown, simulationSummary } from "./lib.mjs";
import { PLAN_DATA } from "./scenarios.mjs";

/** result.json of a simulation run (the gate's fields stay, so gate-orders.sh reads it the same way). */
export function simulationResult(run, plan = PLAN_DATA) {
  const res = resultJson(run);
  const sum = simulationSummary(res.rows, plan);
  const meta = new Map(plan.rows.map((p) => [String(p.n), p]));
  return {
    ...res,
    kind: "simulation",
    // passed only with no failed row, at least one passed row and the clean-up finished
    ok: sum.ok && (run.cleanup?.ok ?? false),
    simulation: { version: plan.version, planned: sum.planned, asked: sum.asked, passed: sum.passed, failed: sum.failed, skipped: sum.skipped, orders: sum.orders, skipReasons: sum.skipReasons },
    rows: res.rows.map((r) => {
      const p = meta.get(String(r.id));
      return p ? { ...r, plan: { day: p.day, persona: p.persona, area: p.area, items: p.items, pay: p.pay, courier: p.courier, person: p.person } } : r;
    }),
  };
}

/** The gate's detail report under the simulation's own heading (orders.md). */
export function ordersMarkdown(run) {
  return reportMarkdown(run)
    .replace(/^# .*$/m, "# The 70-order simulation — every order's details")
    .replace(/\nHow to run: GitHub › Actions › \*\*gate-orders\*\*[^\n]*\n?/, "\n");
}

/** Writes README.md, result.json and orders.md into `dir`, scrubbed of `secrets`. */
export function writeSimulationReport(dir, run, secrets = []) {
  mkdirSync(dir, { recursive: true });
  const clean = scrubDeep(run, secrets);
  const res = simulationResult(clean);
  const sum = simulationSummary(res.rows, PLAN_DATA);
  writeFileSync(join(dir, "result.json"), `${JSON.stringify(res, null, 2)}\n`);
  writeFileSync(join(dir, "README.md"), scrub(simulationMarkdown(res, sum, clean), secrets));
  writeFileSync(join(dir, "orders.md"), scrub(ordersMarkdown(clean), secrets));
}
