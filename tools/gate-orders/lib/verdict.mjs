// PR 414 follow-up (CN-013 go-live gate phase 2) — the verdicts of a gate run. Pure. A scenario is a list of checks,
// each PASS, FAIL or SKIP with its reason; the scenario fails when one check fails, is skipped when every check is
// skipped (or it never ran), and passes otherwise. Timings are flagged against the Lighthouse budget of the repository
// (lighthouserc.json: the largest paint for a page that opens, the server's answer for a press that waits for one);
// a flag never fails a scenario, it is reported. No number of the budget is written here.

export const VERDICTS = ["PASS", "FAIL", "SKIP"];

/** One check: `ok` true → PASS, false → FAIL; a `skip` reason → SKIP. */
export function check(id, ok, detail = "", skip = null) {
  if (skip) return { id, verdict: "SKIP", detail: String(skip) };
  return { id, verdict: ok ? "PASS" : "FAIL", detail: String(detail ?? "") };
}

export const skip = (id, why) => check(id, false, "", why || "skipped");
export const pass = (id, detail = "") => check(id, true, detail);
export const fail = (id, detail = "") => check(id, false, detail);

/** The scenario's verdict from its checks. */
export function scenarioVerdict(checks) {
  if (!checks?.length) return "SKIP";
  if (checks.some((c) => c.verdict === "FAIL")) return "FAIL";
  if (checks.every((c) => c.verdict === "SKIP")) return "SKIP";
  return "PASS";
}

/** The timed steps of one order, in the order the customer meets them. `page` steps load a page; `press` steps wait for an answer. */
export const STEPS = [
  { key: "firstLoad", label: "First load", kind: "page" },
  { key: "productPage", label: "Product page", kind: "page" },
  { key: "addToBag", label: "Add to bag", kind: "press" },
  { key: "checkoutOpen", label: "Checkout open", kind: "page" },
  { key: "submit", label: "Submit → thank-you", kind: "press" },
];

/**
 * The budget of a gate step from lighthouserc.json's assertions: a page that opens against the largest contentful
 * paint, a press against the server response time. Null when the config has no such assertion.
 */
export function budgetOf(lhrc) {
  const a = lhrc?.ci?.assert?.assertions ?? {};
  const max = (k) => {
    const v = a[k];
    const n = Array.isArray(v) ? v[1]?.maxNumericValue : undefined;
    return Number.isFinite(n) ? n : null;
  };
  return { page: max("largest-contentful-paint"), press: max("server-response-time"), source: "lighthouserc.json ci.assert.assertions" };
}

/**
 * The flags of one timing row (`t` = {stepKey: {ms, lcpMs?, serverMs?}}): a page over the paint budget (its largest
 * paint, else its whole load), a press whose server answer took longer than the server budget. `counts` says whether
 * the network is one the budget is set for (4G, wifi); on 3G the flags are information only.
 */
export function overBudget(t, budget) {
  const out = [];
  for (const s of STEPS) {
    const m = t?.[s.key];
    if (!m) continue;
    const limit = budget?.[s.kind];
    if (!Number.isFinite(limit)) continue;
    const v = s.kind === "page" ? (m.lcpMs ?? m.ms) : (m.serverMs ?? null);
    if (Number.isFinite(v) && v > limit) out.push({ step: s.key, valueMs: Math.round(v), limitMs: limit });
  }
  return out;
}

/** The middle value (the lower middle for an even count), or null for none. */
export function median(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
}

/**
 * The timings table: for each network and each class (phone, desktop), the median of every step over the orders
 * timed there. `rows` = [{cls, network, timings: {step: {ms}}}].
 */
export function timingsTable(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.timings || !r.network || !r.cls) continue;
    const k = `${r.network}|${r.cls}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r.timings);
  }
  const out = [];
  for (const [k, list] of groups) {
    const [network, cls] = k.split("|");
    const steps = {};
    for (const s of STEPS) steps[s.key] = median(list.map((t) => t[s.key]?.ms));
    out.push({ network, cls, orders: list.length, steps });
  }
  const netOrder = ["slow-3g", "fast-3g", "4g", "wifi"];
  return out.sort((a, b) => netOrder.indexOf(a.network) - netOrder.indexOf(b.network) || a.cls.localeCompare(b.cls));
}

/** The run's summary from its scenario rows. */
export function summarise(rows) {
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  return { scenarios: rows.length, passed: n("PASS"), failed: n("FAIL"), skipped: n("SKIP"), ok: n("FAIL") === 0 && rows.length > 0, orders: rows.reduce((s, r) => s + (r.orders?.length ?? 0), 0) };
}
