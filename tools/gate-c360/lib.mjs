// PR 414 follow-up (CN-013 phase 2, owner 1 Nov 2026) — the pure parts of the customer 360° run (tools/gate-c360/run.mjs):
// which scenarios run, the gate's own number in every way people write it, the guard that keeps the run on the preview,
// the checks on a message's words, the untranslated-text check, what may never reach a report, and the report itself.
// No browser, no database, no network here; tested beside it (lib.test.mjs).
// Live run 1 Nov: the words of a SKIP that is not a fault (an owner's switch that is off, a gap registered as a planned
// PR, what is so by design), and the check of the ad link's tags in the shop's own HttpOnly cookie.
import { COD_OFF } from "../gate-orders/lib/run-grant.mjs";

export { COD_OFF };

/** A step whose feature exists but the owner keeps switched off: a SKIP, never a FAIL. */
export const ownerOff = (key) => `off — the owner's switch (${key})`;
/** A step whose gap is already registered as a planned PR (CN-034): a SKIP naming it. */
export const planned = (pr) => `planned in PR ${pr}`;
/** A step that is so on purpose today (the demo's behaviour); the change is a proposal for the owner. */
export const BY_DESIGN = "by design — proposal in the final analysis";
/**
 * A computer's category of few styles with no filter on: the shop drops its filter rail on purpose (demo D-012,
 * docs/owner/DESKTOP-REVIEW.md; `category.page.fewStyles`, CatListing.tsx). A SKIP naming why, never a FAIL.
 */
export const fewStyles = (n) => `the category shows ${n} style(s), no more than category.page.fewStyles: a computer drops the filter rail for so few, by design (demo D-012)`;

/**
 * Whether an ad link's tags were kept, from the browser's cookie jar (`jar`: what the browser context holds, HttpOnly
 * cookies too) and what page scripts can see (`scriptSide`: document.cookie and storage). The shop keeps them in its
 * own HttpOnly cookie (`name`, PR 257 follow-up): url-safe base64 JSON with the link's tags and the fbc made from
 * fbclid — only the link's tags, no name, number or address. A `_fbc` cookie (the pixel's) also counts for fbclid.
 * Returns { ok, how, why }.
 */
export function campaignKept(jar, scriptSide, utm, name) {
  const cookies = Array.isArray(jar) ? jar : [];
  const side = String(scriptSide ?? "");
  const own = cookies.find((c) => c?.name === name);
  let kept = null;
  if (own) {
    try {
      kept = JSON.parse(Buffer.from(String(own.value), "base64url").toString("utf8"));
    } catch {
      kept = null;
    }
  }
  const want = String(utm?.utm_campaign ?? "");
  const fbclid = utm?.fbclid ? String(utm.fbclid) : null;
  const pixelFbc = cookies.some((c) => c?.name === "_fbc") || /(^|;\s*)_fbc=/.test(side);
  const campaign = !!want && (kept?.utmCampaign === want || side.includes(want));
  const fbc = !fbclid || pixelFbc || (typeof kept?.fbc === "string" && kept.fbc.endsWith(`.${fbclid}`));
  if (!own && !campaign) return { ok: false, how: null, why: `no cookie or storage holds the campaign (the browser's own cookie jar, HttpOnly cookies included, has no ${name})${fbclid && !pixelFbc ? ", and no fbc is made from fbclid" : ""}, so the order cannot say which ad brought him` };
  if (!campaign) return { ok: false, how: null, why: `the shop's cookie ${name} is there but does not hold the link's campaign` };
  if (!fbc) return { ok: false, how: null, why: "the campaign is kept, but no fbc is made from fbclid (the Conversions API has nothing to match the click on)" };
  const tags = [kept?.utmSource, kept?.utmMedium, kept?.utmCampaign, kept?.adPlatform].filter(Boolean).join(" / ");
  return { ok: true, why: null, how: own ? `kept in the shop's own cookie (${name}, HttpOnly: page scripts cannot read it, by design): ${tags}${fbclid ? "; fbc made from fbclid" : ""}` : "kept where page scripts see it" };
}

/** The life cycle in order. `before` needs nothing; `account`, `support` and `after` follow one customer. */
export const SCENARIOS = ["before", "order", "account", "support", "after"];

/** A step's result. */
export const STATUS = ["PASS", "FAIL", "SKIP"];

/** The mark on every row the gate makes, so staff and reports can tell it from a real customer. */
export const GATE_MARK = "GATE TEST";

/** The scenarios asked for ("" or "all" = every one), in life-cycle order; unknown names are problems. */
export function pickScenarios(input) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw || raw === "all") return { list: [...SCENARIOS], problems: [] };
  const asked = raw.split(/[\s,]+/).filter(Boolean);
  const problems = asked.filter((x) => !SCENARIOS.includes(x)).map((x) => `no such scenario: ${x.slice(0, 20)}`);
  return { list: SCENARIOS.filter((s) => asked.includes(s)), problems };
}

const BN = "০১২৩৪৫৬৭৮৯";
export const toBengaliDigits = (s) => String(s).replace(/\d/g, (d) => BN[Number(d)]);
export const toAsciiDigits = (s) => String(s).replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));

/** A Bangladeshi mobile number in its local form (01XXXXXXXXX), or null. */
export function localPhone(raw) {
  let d = toAsciiDigits(raw).replace(/\D/g, "");
  if (d.startsWith("880")) d = `0${d.slice(3)}`;
  if (d.length === 10 && /^1[3-9]/.test(d)) d = `0${d}`;
  return /^01[3-9]\d{8}$/.test(d) ? d : null;
}

/** The gate's number from a three-digit operator prefix and eight digits (the shell picks them fresh each run). */
export function gatePhone(prefix, digits) {
  const p = String(prefix ?? "");
  const d = String(digits ?? "").replace(/\D/g, "").padStart(8, "0").slice(-8);
  return localPhone(`${p}${d}`);
}

/** Every way a customer or a staff member writes the same number: what support must still find. */
export function phoneForms(raw) {
  const local = localPhone(raw);
  if (!local) return [];
  const intl = `+88${local}`;
  return [
    { id: "local", value: local },
    { id: "intl", value: intl },
    { id: "intl-no-plus", value: intl.slice(1) },
    { id: "spaced", value: `+880 ${local.slice(1, 5)}-${local.slice(5)}` },
    { id: "bengali-digits", value: toBengaliDigits(local) },
    { id: "bengali-intl", value: toBengaliDigits(intl) },
  ];
}

/** A name the gate gives a row: GATE TEST <what> <run>. */
export const gateLabel = (what, run) => `${GATE_MARK} ${what} ${run}`.replace(/\s+/g, " ").trim().slice(0, 80);
export const isGateLabel = (s) => typeof s === "string" && s.startsWith(GATE_MARK);

/** A shop path with the ad link's tags added (the tags are the gate's own: its campaign says GATE TEST). */
export function withUtm(path, utm) {
  const u = new URL(path, "http://x");
  for (const [k, v] of Object.entries(utm ?? {})) u.searchParams.set(k, String(v));
  return `${u.pathname}${u.search}`;
}

/** The shop path in the language asked for (Bengali lives under /bn). */
export const inLang = (lang, path) => (lang === "bn" ? (path === "/" ? "/bn" : `/bn${path}`) : path);

/**
 * Null when the run may go on: BASE is https on the preview host of server.conf (EXTAS_STAGING_HOST), that host is not
 * one of the extra hosts (the main domain on go-live day), and the main domain is not open yet (after go-live the
 * preview and the real shop share one database: test orders would sit among real ones). Otherwise why it stops.
 */
export function hostGuard({ base, previewHost, extraHosts = "", mainOpen = "no" }) {
  let u;
  try {
    u = new URL(String(base ?? ""));
  } catch {
    return "BASE is not an address";
  }
  const preview = String(previewHost ?? "").trim().toLowerCase();
  if (!preview) return "no preview host in the settings (EXTAS_STAGING_HOST)";
  if (u.protocol !== "https:" || u.hostname.toLowerCase() !== preview) return `BASE is not the preview host (${preview})`;
  const extra = String(extraHosts ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (extra.includes(preview)) return "the preview host is also a public host";
  if (String(mainOpen).toLowerCase() === "yes") return "the main domain is open (go-live happened): the gate never orders beside real customers";
  return null;
}

/** Text that may never reach a report or a log: passwords, codes, cookies, tokens, keys and connection strings. */
export function redact(text) {
  return String(text ?? "")
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s:@/"']+:[^\s@/"']+@\S*/gi, "<connection>")
    .replace(/\b(password|passwd|secret|token|api[_-]?key|totp|seed|cookie|authorization|code)\b(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&"']+)/gi, "$1$2<hidden>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <hidden>")
    .replace(/__Host-[A-Za-z0-9_]+=[^;\s]+/g, "<cookie>")
    .replace(/\b[A-Fa-f0-9]{40,}\b/g, "<hex>")
    .replace(/\b[A-Za-z0-9+/_-]{48,}={0,2}/g, "<long>");
}

/**
 * Words on a Bengali page that are still English: each UI string with a Latin word of three letters or more that is
 * not on the allow list (brand and channel names, sizes, units). Numbers and order references are fine.
 */
export function untranslated(strings, allow = []) {
  const ok = new Set(allow.map((x) => x.toLowerCase()));
  const out = [];
  for (const raw of strings ?? []) {
    const s = String(raw).replace(/\s+/g, " ").trim();
    if (!s || s.length > 120) continue;
    const words = s.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? [];
    const bad = words.filter((w) => !ok.has(w.toLowerCase()) && !/^[A-Z0-9-]{2,}\d/.test(w));
    if (bad.length && !/[ঀ-৿]/.test(s.replace(/[A-Za-z]/g, ""))) out.push(s);
    else if (bad.length >= 3) out.push(s);
  }
  return [...new Set(out)].slice(0, 12);
}

/** The money amounts a text names (a number beside the Taka sign, Tk, BDT or টাকা), in whole Taka. */
export function amountsIn(text) {
  const out = [];
  const re = /(?:৳|\btk\.?|\bbdt)\s*([\d][\d,]*(?:\.\d+)?)|([\d][\d,]*(?:\.\d+)?)\s*(?:৳|টাকা|\btk\b|\bbdt\b)/gi;
  for (const m of toAsciiDigits(text).matchAll(re)) out.push(Math.round(Number((m[1] ?? m[2]).replace(/,/g, ""))));
  return out.filter((n) => Number.isFinite(n));
}

const MONEY_ASK =/\b(pay|payment|bkash|nagad|advance|send money|due)\b|পরিশোধ|পেমেন্ট|বিকাশ|নগদ|অগ্রিম|টাকা পাঠান|বাকি/i;

/** Share of letters that are Bengali (0…1). */
export function bengaliShare(text) {
  const letters = String(text ?? "").match(/[A-Za-zঀ-৿]/g) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => c >= "ঀ" && c <= "৿").length / letters.length;
}

/**
 * What is wrong with one confirmation message for an order (empty = right): it went through a mock, to the order's
 * phone, names the order, says the amount still due (in either digits), in the order's language, and asks for no money
 * when nothing is due (a prepaid order).
 */
export function messageProblems(msg, order) {
  const out = [];
  if (msg.mode && msg.mode !== "MOCK") out.push(`sent through ${msg.mode}, not the mock`);
  if (msg.toOrderPhone === false) out.push("not addressed to the order's phone");
  if (msg.text === null || msg.text === undefined) {
    if (msg.status === "SENT") out.push("sent, but its words could not be drawn again");
    return out;
  }
  const text = String(msg.text);
  const ascii = toAsciiDigits(text);
  if (!ascii.includes(order.number)) out.push("does not name the order number");
  const due = Math.round((order.dueMinor ?? 0) / 100);
  const total = Math.round((order.totalMinor ?? 0) / 100);
  const said = amountsIn(ascii);
  if (said.length && !said.some((a) => a === due || a === total)) out.push(`says ${said.join(", ")}; the order's due is ${due} (total ${total})`);
  if (due === 0 && MONEY_ASK.test(text) && !/paid|পরিশোধিত|পেয়েছি/i.test(text)) out.push("asks for money on an order with nothing due");
  const want = order.lang === "en" ? "en" : order.lang === "bn" ? "bn" : null;
  if (want && msg.locale && msg.locale !== want) out.push(`in ${msg.locale}, the order was placed in ${want}`);
  const share = bengaliShare(text);
  if ((msg.locale ?? want) === "bn" && share < 0.3) out.push("meant to be Bengali, but mostly English");
  if ((msg.locale ?? want) === "en" && share > 0.3) out.push("meant to be English, but mostly Bengali");
  return out;
}

/** One step's row. */
export function row(fields) {
  const status = STATUS.includes(fields.status) ? fields.status : "FAIL";
  return {
    id: String(fields.id ?? "?"),
    scenario: String(fields.scenario ?? "?"),
    title: String(fields.title ?? fields.id ?? "?"),
    screen: fields.screen ?? null,
    lang: fields.lang ?? null,
    status,
    reason: redact(fields.reason ?? (status === "PASS" ? "" : "no reason given")).slice(0, 400),
    ms: Number.isFinite(fields.ms) ? Math.round(fields.ms) : null,
    problems: (fields.problems ?? []).map((p) => redact(p).slice(0, 240)).slice(0, 12),
    where: fields.where ?? null,
    shot: fields.shot ?? null,
  };
}

/** The run's summary: counts per status and per scenario, and every failed step in one line. */
export function summarise(rows) {
  const count = (list, s) => list.filter((r) => r.status === s).length;
  const by = {};
  for (const sc of SCENARIOS) {
    const list = rows.filter((r) => r.scenario === sc);
    if (list.length) by[sc] = { pass: count(list, "PASS"), fail: count(list, "FAIL"), skip: count(list, "SKIP") };
  }
  const failed = rows.filter((r) => r.status === "FAIL");
  return {
    ok: failed.length === 0,
    steps: rows.length,
    pass: count(rows, "PASS"),
    fail: failed.length,
    skip: count(rows, "SKIP"),
    scenarios: by,
    problems: failed.map((r) => `${r.scenario}/${r.id}${r.screen ? ` (${r.screen}${r.lang ? `, ${r.lang}` : ""})` : ""}: ${r.reason || r.problems[0] || "failed"}`).slice(0, 40),
  };
}

const TITLES = { before: "Before ordering", order: "Ordering", account: "The customer's account", support: "Support", after: "After ordering" };

export function reportMarkdown(result, meta) {
  const s = result;
  const lines = [
    `# Customer 360° gate — ${s.ok ? "PASS" : "FAIL"}`,
    "",
    `${meta.at} · ${meta.base} · ${meta.kind ?? "run"}${meta.sha ? ` · ${meta.sha}` : ""} · scenarios: ${(meta.scenarios ?? []).join(", ")}`,
    "",
    `${s.steps} steps: ${s.pass} PASS, ${s.fail} FAIL, ${s.skip} SKIP. Every provider ran on its mock; the test customer is "${meta.customer ?? GATE_MARK}".`,
    "",
    "Each step says what was tried, how long it took, and why it failed or was skipped. A SKIP is never a pass: it names what is",
    "missing (a product, a switch the owner keeps off, a part not built yet, or a real key).",
    "",
  ];
  if (meta.cleanup) lines.push(`Clean-up: ${meta.cleanup}`, "");
  for (const sc of SCENARIOS) {
    const list = s.rows.filter((r) => r.scenario === sc);
    if (!list.length) continue;
    const c = s.scenarios[sc];
    lines.push(`## ${TITLES[sc]} — ${c.pass} pass, ${c.fail} fail, ${c.skip} skip`, "", "| Step | Screen | Result | Time | Why / what was seen |", "|---|---|---|---|---|");
    for (const r of list) {
      const why = [r.reason, ...r.problems].filter(Boolean).join("; ").replace(/\|/g, "/");
      const shot = r.shot ? ` ([picture](${r.shot}))` : "";
      const where = r.where ? ` — ${r.where}` : "";
      lines.push(`| ${r.title} | ${r.screen ? `${r.screen}${r.lang ? ` · ${r.lang}` : ""}` : "—"} | ${r.status === "PASS" ? "PASS" : `**${r.status}**`} | ${r.ms === null ? "—" : `${r.ms} ms`} | ${why || "—"}${where}${shot} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
