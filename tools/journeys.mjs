// S21 · PR 414 (Blueprint B7.3) — the saved browser journeys: a customer, the admin, an accountant and the warehouse,
// replayed step by step in a real browser on a phone and a desktop screen (docs/qa/journeys.json). Plain Playwright,
// AI not needed. Runs on the VM on the owner's schedule (infra/deploy/journeys.sh, Reports › Site health), signed in
// as the read-only check account for the staff journeys, like the smoke test (tools/smoke.mjs, whose sign-in and
// error watch it shares). A step fails on a 5xx, the error screen, a console or page error, a failed request, or a
// missing expected element; the rest of that journey still runs, so one run shows every broken step.
//   BASE=https://… SMOKE_EMAIL=… SMOKE_PASSWORD=… SMOKE_TOTP_SECRET=… [SMOKE_HTTP_USER=… SMOKE_HTTP_PASSWORD=…]
//   JOURNEYS_OUT=<dir> [JOURNEYS_ONLY=customer,admin] node tools/journeys.mjs
// Writes <JOURNEYS_OUT>/result.json, README.md and a screenshot of each failed step. Never prints or stores a password.
// PR 416 (B7.3): UI checks at the phone and desktop widths of the run (JOURNEYS_UI=layout,text,images,taps, from the
// owner's switches `health.uiChecks` through journeys-settings.env; empty = off): after every step that opens or changes
// a page, the device gate's own measures (tools/device-gate.mjs, docs/qa/device-matrix.js, the rules of
// docs/qa/device-gate.json) look for a broken layout (wider than the screen, sticking out, a squeezed tab), cut-off
// text and small form text, pictures that did not load, and buttons that cannot be reached (too small on a touch
// screen, on top of each other, or covered by something else). Each finding fails its step as `UI <KIND>: …`.
// PR 414 follow-up (CN-013 go-live gate, phase 2): journeys carry an optional `group`. A run takes the journeys of one
// group (JOURNEYS_GROUP=go-live-gate), or, with none named, only the journeys without a group (the saved journeys of the
// owner's schedule, unchanged). A step may name the SIM-F findings it proves (`sim`), shown in the report; `expect` may
// list several selectors that must all be there, `expectNone` the ones that must not be; an `open` may expect another
// answer than 200 (`status`, e.g. 404 for a page the owner's switch closes). The owner's switches are read once a run,
// as the read-only check account (GET /api/admin/settings, nothing changed): `when` / `unless` run a step only while
// the named switches are all on / all off (the step is skipped otherwise, and says so), and `switches` ties a
// selector to a switch — on, it must be on the page; off, it must not be. A switch is a setting key and the path in
// its value, e.g. `pdp.buy.callToOrder` or `checkout.gift.enabled`; a name that is no setting fails the step.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appChecks } from "./device-gate.mjs";
import { pageProblems, previewCookie, signIn, watched } from "./smoke.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STEP_KINDS = ["open", "follow", "click", "api"];

/** PR 416: the owner's UI check switches and the device gate's findings each one covers. */
export const UI_KINDS = {
  layout: ["PAGE-WIDER-THAN-PHONE", "HORIZONTAL-SCROLL", "STICKS-OUT-RIGHT", "STICKS-OUT-LEFT", "TAB-LABEL-SQUEEZED"],
  text: ["TEXT-CUT-OFF", "INPUT-FONT-UNDER-16"],
  images: ["IMAGE-NOT-LOADED"],
  taps: ["TAP-TOO-SMALL", "TAPS-OVERLAP", "TAP-COVERED"],
};

/** The UI checks asked for (`layout,text,…`); unknown names are left out, an empty list is off. */
export function uiKindsOf(list) {
  return [...new Set(String(list ?? "").split(",").map((x) => x.trim()).filter((x) => Object.hasOwn(UI_KINDS, x)))];
}

/** The findings the chosen checks cover (the measures return more; the rest are dropped). */
export function uiFilter(issues, kinds) {
  const keep = new Set(kinds.flatMap((k) => UI_KINDS[k]));
  return issues.filter((i) => keep.has(i.k));
}

/**
 * PR 416 — measured inside the page (serialised: no closures). IMAGE-NOT-LOADED: a shown picture the browser finished
 * and could not draw (a lazy one not yet asked for is not counted). TAP-COVERED: a shown button or link whose centre,
 * once scrolled into view, belongs to something else (a bar, a banner or a dialog over it), so nobody can press it.
 */
export function reachChecks(o) {
  const issues = [];
  const vis = (e) => {
    const s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const label = (e) => (e.getAttribute("data-testid") || e.getAttribute("aria-label") || e.getAttribute("alt") || e.id || (e.className && e.className.toString().split(" ").slice(0, 2).join(".")) || e.tagName).slice(0, 40);
  const list = (arr) => arr.slice(0, 5).join(", ") + (arr.length > 5 ? ` (+${arr.length - 5})` : "");
  if (o.images) {
    const broken = [...document.images].filter((i) => vis(i) && i.complete && i.currentSrc && i.naturalWidth === 0).map(label);
    if (broken.length) issues.push({ k: "IMAGE-NOT-LOADED", d: list(broken) });
  }
  if (o.taps) {
    const modal = [...document.querySelectorAll('[aria-modal="true"]')].filter(vis).pop() ?? null;
    const targets = [...document.querySelectorAll("a[href], button, [role=button], [role=tab], [role=switch]")]
      .filter((e) => vis(e) && !e.disabled && e.getAttribute("aria-hidden") !== "true" && getComputedStyle(e).pointerEvents !== "none" && !e.closest("[inert]"))
      .filter((e) => !modal || modal.contains(e))
      .slice(0, o.max);
    const covered = [];
    const y0 = scrollY;
    const x0 = scrollX;
    for (const e of targets) {
      const r0 = e.getBoundingClientRect();
      if (r0.right <= 0 || r0.left >= innerWidth) continue; // a skip link or a closed drawer, off to the side
      e.scrollIntoView({ block: "center", inline: "nearest" });
      const r = e.getBoundingClientRect();
      // still wholly off the screen after scrolling to it: a skip link shown only on focus, nothing to press
      if (r.bottom <= 0 || r.top >= innerHeight) continue;
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === e || e.contains(hit) || hit.contains(e)) continue;
      if (hit.tagName === "NEXTJS-PORTAL") continue; // the development server's own badge, never on the live site
      // a label for the control takes the tap for it
      const lab = hit.closest("label");
      if (lab && (lab.contains(e) || lab.control === e)) continue;
      covered.push(`${label(e)} under ${label(hit)}`);
    }
    scrollTo(x0, y0);
    if (covered.length) issues.push({ k: "TAP-COVERED", d: list(covered) });
  }
  return issues;
}

/** PR 416: the UI findings on the page as it is now, for the chosen checks, on this screen. */
export async function uiProblems(page, screen, kinds, rules, matrix) {
  if (!kinds.length) return [];
  const touch = screen.touch === true;
  await page.waitForTimeout(rules.settleMs ?? 400);
  const found = [];
  // layout first, taps last: the tap measures scroll the page
  found.push(...(await page.evaluate(matrix.pageChecks, screen.width)).issues);
  found.push(
    ...(await page.evaluate(appChecks, {
      inputFont: touch && kinds.includes("text"),
      taps: touch && kinds.includes("taps"),
      tapMinPx: rules.tapMinPx,
      inlineLinkMinPx: rules.inlineLinkMinPx,
      inputMinFontPx: rules.inputMinFontPx,
    })),
  );
  found.push(...(await page.evaluate(reachChecks, { images: kinds.includes("images"), taps: kinds.includes("taps"), max: rules.uiReachMax ?? 300 })));
  await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
  return uiFilter(found, kinds).map((i) => `UI ${i.k}: ${i.d}`);
}

/** A field that holds one name or a list of them, as a list. */
const listOf = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const SIM_ID = /^F-\d{3}$/;
const GROUP_NAME = /^[a-z0-9-]{1,40}$/;

/** What is wrong with the saved journeys (an empty list when nothing is). */
export function journeyProblems(config) {
  const out = [];
  if (!Array.isArray(config?.screens) || !config.screens.length)
    out.push("no screens");
  const ids = new Set();
  for (const j of config?.journeys ?? []) {
    if (!j.id || ids.has(j.id)) out.push(`journey id missing or repeated: ${j.id}`);
    ids.add(j.id);
    if (j.group !== undefined && !GROUP_NAME.test(String(j.group))) out.push(`${j.id}: a group is a short name of a-z, 0-9 and -`);
    if (!Array.isArray(j.steps) || !j.steps.length) out.push(`${j.id}: no steps`);
    (j.steps ?? []).forEach((s, i) => {
      const kinds = STEP_KINDS.filter((k) => k in s);
      if (kinds.length !== 1) out.push(`${j.id} step ${i + 1}: exactly one of ${STEP_KINDS.join(", ")}`);
      if ((s.open || s.api) && !String(s.open ?? s.api).startsWith("/"))
        out.push(`${j.id} step ${i + 1}: a path on this site starts with /`);
      if (s.api && !(Number.isInteger(s.status) && s.method))
        out.push(`${j.id} step ${i + 1}: an api step needs a method and the status it expects`);
      if (s.api && s.method && s.method !== "GET" && s.status !== 403)
        out.push(`${j.id} step ${i + 1}: a write may only be sent to prove it is refused (status 403)`);
      if (s.status !== undefined && !s.api && !(s.open && Number.isInteger(s.status)))
        out.push(`${j.id} step ${i + 1}: only an open or api step expects a status`);
      if (!listOf(s.sim).every((x) => SIM_ID.test(String(x))))
        out.push(`${j.id} step ${i + 1}: a finding is named F-### (SIM-F-###)`);
      const names = [...listOf(s.when), ...listOf(s.unless), ...Object.keys(s.switches ?? {})];
      if (!names.every((x) => typeof x === "string" && /^[A-Za-z0-9.]+$/.test(x)))
        out.push(`${j.id} step ${i + 1}: a switch is a setting key with the path in its value`);
    });
  }
  return out;
}

/**
 * The journeys to run: the ones of the group asked for (JOURNEYS_GROUP), or with none, the journeys without a group
 * (the saved journeys); of those, all or the ones named (JOURNEYS_ONLY, the owner's choice). Unknown names are left out.
 */
export function pickJourneys(config, only, group) {
  const want = (only ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const g = String(group ?? "").trim();
  return (config.journeys ?? []).filter((j) => (j.group ?? "") === g && (!want.length || want.includes(j.id)));
}

/**
 * A switch's value in the settings list of GET /api/admin/settings ([{key, value}]): the longest setting key the name
 * starts with, then the path in its value. `found` is false when no setting has that key.
 */
export function switchValue(settings, name) {
  let row = null;
  for (const r of settings ?? [])
    if ((name === r.key || name.startsWith(`${r.key}.`)) && (!row || r.key.length > row.key.length)) row = r;
  if (!row) return { found: false, on: false };
  let v = row.value;
  for (const part of name === row.key ? [] : name.slice(row.key.length + 1).split("."))
    v = v !== null && typeof v === "object" && Object.hasOwn(v, part) ? v[part] : undefined;
  return { found: true, on: v === true };
}

/** The step names one of the owner's switches (`when`, `unless` or `switches`). */
export const namesSwitch = (s) => listOf(s.when).length + listOf(s.unless).length + Object.keys(s.switches ?? {}).length > 0;

/**
 * Whether a step runs with the switches as they are: null = it runs; otherwise why it is skipped, or `problem` when a
 * switch it names could not be read.
 */
export function switchGate(s, settings) {
  if (!namesSwitch(s)) return null;
  const named = [...listOf(s.when), ...listOf(s.unless), ...Object.keys(s.switches ?? {})];
  if (!settings) return { problem: "the owner's switches could not be read (GET /api/admin/settings as the check account)" };
  const missing = named.filter((n) => !switchValue(settings, n).found);
  if (missing.length) return { problem: `no such setting on this site: ${missing.join(", ")}` };
  const off = listOf(s.when).filter((n) => !switchValue(settings, n).on);
  if (off.length) return { skip: `switch ${off.join(", ")} is off` };
  const on = listOf(s.unless).filter((n) => switchValue(settings, n).on);
  if (on.length) return { skip: `switch ${on.join(", ")} is on` };
  return null;
}

/** One step in words for the report. */
export function stepLabel(s) {
  const sim = listOf(s.sim).length ? ` · ${listOf(s.sim).map((x) => `SIM-${x}`).join(", ")}` : "";
  const cond = [...(listOf(s.when).length ? [`when ${listOf(s.when).join(" + ")}`] : []), ...(listOf(s.unless).length ? [`unless ${listOf(s.unless).join(" / ")}`] : [])];
  const tail = `${cond.length ? ` (${cond.join("; ")})` : ""}${sim}`;
  if (s.open) return `open ${s.open}${s.status ? ` → ${s.status}` : ""}${tail}`;
  if (s.follow) return `follow ${s.follow}${tail}`;
  if (s.click) return `click ${s.click}${tail}`;
  if (s.api) return `${s.method} ${s.api} → ${s.status}${tail}`;
  return "?";
}

/** The run's summary: every journey on every screen passed; the failed steps first. */
export function summarise(rows, uiKinds = []) {
  const problems = rows.flatMap((r) =>
    r.steps.filter((s) => !s.ok).map((s) => `${r.journey} (${r.screen}) step ${s.n} ${s.what}: ${s.problems[0] ?? "failed"}`),
  );
  const skipped = rows.reduce((n, r) => n + r.steps.filter((s) => s.skipped).length, 0);
  // PR 416: the UI findings counted apart, so the Site health page can say how many there were
  const uiIssues = rows.reduce((n, r) => n + r.steps.reduce((m, s) => m + s.problems.filter((p) => p.startsWith("UI ")).length, 0), 0);
  return {
    ok: problems.length === 0,
    ui: { kinds: uiKinds, issues: uiIssues },
    journeys: rows.length,
    failed: rows.filter((r) => !r.ok).length,
    steps: rows.reduce((n, r) => n + r.steps.length, 0),
    skipped,
    problems,
  };
}

export function reportMarkdown(result, meta) {
  const lines = [
    `# Journeys — ${result.ok ? "PASS" : "FAIL"}`,
    "",
    `${meta.at} · ${meta.base} · ${meta.kind}${meta.sha ? ` · ${meta.sha}` : ""}${meta.group ? ` · group ${meta.group}` : ""}`,
    "",
    `${result.journeys} journeys (journey × screen), ${result.failed} failed; ${result.steps} steps, ${result.skipped} skipped.`,
    "",
    result.ui?.kinds?.length ? `UI checks (${result.ui.kinds.join(", ")}): ${result.ui.issues} finding(s).` : "UI checks: off.",
    "",
  ];
  for (const r of result.rows) {
    lines.push(`## ${r.journey} · ${r.screen} — ${r.ok ? "pass" : "FAIL"}`, "");
    for (const s of r.steps)
      lines.push(`- ${s.ok ? (s.skipped ? "skip" : "ok") : "**FAIL**"} ${s.n}. ${s.what}${s.skipped ? ` (${s.skipped})` : ""}${s.problems.length ? ` — ${s.problems.join("; ")}` : ""}${s.screenshot ? ` ([picture](${s.screenshot}))` : ""}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * What is missing or should not be there: `expectAny` (one of them), `expect` (each of them), `expectNone` (none of
 * them), and `switches` (each selector there while its switch is on, absent while it is off).
 */
async function expectOn(page, s, settings) {
  const out = [];
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  if (s.expectAny?.length) {
    let found = false;
    for (const sel of s.expectAny) if (await has(sel)) found = true;
    if (!found) out.push(`${s.expectAny.join(" or ")} is not on the page`);
  }
  for (const sel of listOf(s.expect)) if (!(await has(sel))) out.push(`${sel} is not on the page`);
  for (const sel of listOf(s.expectNone)) if (await has(sel)) out.push(`${sel} is on the page and should not be`);
  for (const [name, sel] of Object.entries(s.switches ?? {})) {
    const on = switchValue(settings, name).on;
    if (on && !(await has(sel))) out.push(`switch ${name} is on, but ${sel} is not on the page`);
    if (!on && (await has(sel))) out.push(`switch ${name} is off, but ${sel} is on the page`);
  }
  return out;
}

/**
 * Runs one step; returns its row. `skip`: an earlier optional step found nothing, so this one is skipped. `settings`:
 * the owner's switches as read at the start of the run (null when they could not be read).
 */
async function runStep(page, base, ignore, s, n, skip, out, tag, ui, settings) {
  const row = { n, what: stepLabel(s), ok: true, skipped: null, problems: [], screenshot: null };
  if (skip) return { ...row, skipped: skip };
  const gate = switchGate(s, settings);
  if (gate?.skip) return { ...row, skipped: gate.skip, bySwitch: true };
  if (gate?.problem) return { ...row, ok: false, problems: [gate.problem] };
  let status = 0;
  // an api step's own answer is the expected refusal (checked below), not a failed request or a console error; an open
  // that expects another answer (a page the owner's switch closes: 404) is checked below the same way
  const known = s.api ? [...ignore, { path: new URL(s.api, base).pathname }] : s.open && s.status ? [...ignore, { path: new URL(s.open, base).pathname }] : ignore;
  const watch = await watched(page, base, known, async () => {
    if (s.api) {
      const got = await page.evaluate(
        async ([url, method, body]) => (await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" })).status,
        [s.api, s.method, s.body],
      );
      if (got !== s.status) row.problems.push(`answered ${got}, expected ${s.status}`);
      return;
    }
    if (s.open) {
      const r = await page.goto(`${base}${s.open}`, { waitUntil: "load" });
      status = r?.status() ?? 0;
    } else {
      const sel = s.follow ?? s.click;
      const el = page.locator(sel).filter({ visible: true }).first();
      if ((await el.count()) === 0) {
        if (s.optional) row.skipped = `nothing matches ${sel} (the shop has none yet)`;
        else row.problems.push(`nothing matches ${sel}`);
        return;
      }
      if (s.follow) {
        const href = await el.getAttribute("href");
        const r = await page.goto(new URL(href, page.url()).href, { waitUntil: "load" });
        status = r?.status() ?? 0;
      } else await el.click();
    }
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const path = new URL(page.url()).pathname;
    row.problems.push(...pageProblems(path, status, await page.innerText("body").catch(() => "")));
    if (s.open && s.status && status !== s.status) row.problems.push(`answered ${status}, expected ${s.status}`);
    if (s.open?.startsWith("/admin") && path.startsWith("/admin/login")) row.problems.push("sent back to the sign-in page");
    row.problems.push(...(await expectOn(page, s, settings)));
  });
  row.problems.push(...watch);
  // PR 416: the UI checks on the page the step opened or changed (an api step changes no page)
  if (ui?.kinds.length && !s.api && !row.skipped)
    row.problems.push(...(await uiProblems(page, ui.screen, ui.kinds, ui.rules, ui.matrix).catch((e) => [`UI checks could not run: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`])));
  row.ok = row.problems.length === 0;
  if (!row.ok && out) {
    row.screenshot = `${tag}-${n}.jpg`;
    await page.screenshot({ path: join(out, row.screenshot), type: "jpeg", quality: 60 }).catch(() => {});
  }
  return row;
}

/**
 * The owner's switches as they are now: GET /api/admin/settings, signed in as the read-only check account in a context
 * of its own (the signed-out journeys stay signed out). Null when they cannot be read; the steps that need them fail.
 */
async function readSwitches(browser, base, creds, preview) {
  const ctx = await browser.newContext(preview ? { storageState: preview } : {});
  try {
    const page = await ctx.newPage();
    await signIn(page, base, creds);
    const body = await page.evaluate(async () => {
      const r = await fetch("/api/admin/settings", { credentials: "same-origin", cache: "no-store" });
      return r.ok ? r.json() : null;
    });
    return Array.isArray(body?.settings) ? body.settings.map((r) => ({ key: r.key, value: r.value })) : null;
  } catch {
    return null;
  } finally {
    await ctx.close();
  }
}

export async function runJourneys(opts) {
  const { chromium } = require("playwright");
  const config = JSON.parse(readFileSync(opts.config ?? join(root, "docs/qa/journeys.json"), "utf8"));
  const bad = journeyProblems(config);
  if (bad.length) throw new Error(`docs/qa/journeys.json: ${bad.join("; ")}`);
  const smokeConfig = JSON.parse(readFileSync(join(root, "docs/qa/smoke.json"), "utf8"));
  const ignore = smokeConfig.ignoreRequests ?? [];
  const uiKinds = uiKindsOf(opts.ui);
  const uiRules = uiKinds.length ? JSON.parse(readFileSync(join(root, "docs/qa/device-gate.json"), "utf8")) : null;
  const matrix = uiKinds.length ? require(join(root, "docs/qa/device-matrix.js")) : null;
  if (opts.out) mkdirSync(opts.out, { recursive: true });
  const browser = await chromium.launch(opts.chromiumPath ? { executablePath: opts.chromiumPath } : {});
  const rows = [];
  try {
    const preview = opts.httpCredentials ? await previewCookie(browser, opts.base, opts.httpCredentials) : null;
    const picked = pickJourneys(config, opts.only, opts.group);
    if (!picked.length) throw new Error(`no journey to run${opts.group ? ` in the group ${opts.group}` : ""}`);
    // the owner's switches, read once as the check account, only when a step names one
    const settings = picked.some((j) => j.steps.some(namesSwitch)) ? await readSwitches(browser, opts.base, opts.creds, preview) : null;
    for (const j of picked) {
      for (const scr of config.screens) {
        // PR 416: a touch screen opens as a phone does (its viewport tag honoured, touch taps)
        const touch = scr.touch === true ? { isMobile: true, hasTouch: true } : {};
        const ctx = await browser.newContext({ viewport: { width: scr.width, height: scr.height }, ...touch, ...(preview ? { storageState: preview } : {}) });
        const page = await ctx.newPage();
        const steps = [];
        try {
          if (j.signedIn) await signIn(page, opts.base, opts.creds);
          let skip = null;
          for (const [i, s] of j.steps.entries()) {
            // only a follow or click that found nothing skips the follows and clicks after it; an `open` starts afresh
            if (s.open || s.api) skip = null;
            const row = await runStep(page, opts.base, ignore, s, i + 1, skip, opts.out, `${j.id}-${scr.id}`, { kinds: uiKinds, screen: scr, rules: uiRules, matrix }, settings);
            // a step the switches skip leaves the steps after it alone
            if (row.skipped && !row.bySwitch && !skip) skip = `step ${i + 1} found nothing`;
            delete row.bySwitch;
            steps.push(row);
          }
        } catch (e) {
          steps.push({ n: steps.length + 1, what: "sign in or run", ok: false, skipped: null, problems: [String(e instanceof Error ? e.message : e).slice(0, 200)], screenshot: null });
        } finally {
          await ctx.close();
        }
        rows.push({ journey: j.id, screen: scr.id, ok: steps.every((s) => s.ok), steps });
      }
    }
  } finally {
    await browser.close();
  }
  return { ...summarise(rows, uiKinds), rows };
}

async function main() {
  const base = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
  const creds = { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD, totpSecret: process.env.SMOKE_TOTP_SECRET };
  if (!creds.email || !creds.password) throw new Error("sign-in details missing (SMOKE_EMAIL/SMOKE_PASSWORD)");
  const httpCredentials = process.env.SMOKE_HTTP_USER ? { username: process.env.SMOKE_HTTP_USER, password: process.env.SMOKE_HTTP_PASSWORD ?? "" } : undefined;
  const out = process.env.JOURNEYS_OUT || null;
  const result = await runJourneys({ base, creds, httpCredentials, out, only: process.env.JOURNEYS_ONLY, group: process.env.JOURNEYS_GROUP, ui: process.env.JOURNEYS_UI, chromiumPath: process.env.CHROMIUM_PATH });
  for (const r of result.rows) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.journey.padEnd(10)} ${r.screen}`);
  if (out) {
    const meta = { at: process.env.JOURNEYS_AT || new Date().toISOString(), base, sha: process.env.JOURNEYS_SHA || "", kind: process.env.JOURNEYS_KIND || "run", group: process.env.JOURNEYS_GROUP || "" };
    const { rows, ...summary } = result;
    writeFileSync(join(out, "result.json"), `${JSON.stringify({ ...meta, ...summary, problems: summary.problems.slice(0, 20), rows }, null, 2)}\n`);
    writeFileSync(join(out, "README.md"), reportMarkdown(result, meta));
  }
  if (!result.ok) {
    console.error(`journeys: ${result.problems.length} failed step(s)\n  ${result.problems.join("\n  ")}`);
    return 1;
  }
  console.log(`journeys: every step passed (${result.steps} steps, ${result.skipped} skipped)`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`journeys: FAILED — ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    },
  );
}
