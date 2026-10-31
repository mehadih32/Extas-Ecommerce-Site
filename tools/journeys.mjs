// S21 · PR 414 (Blueprint B7.3) — the saved browser journeys: a customer, the admin, an accountant and the warehouse,
// replayed step by step in a real browser on a phone and a desktop screen (docs/qa/journeys.json). Plain Playwright,
// AI not needed. Runs on the VM on the owner's schedule (infra/deploy/journeys.sh, Reports › Site health), signed in
// as the read-only check account for the staff journeys, like the smoke test (tools/smoke.mjs, whose sign-in and
// error watch it shares). A step fails on a 5xx, the error screen, a console or page error, a failed request, or a
// missing expected element; the rest of that journey still runs, so one run shows every broken step.
//   BASE=https://… SMOKE_EMAIL=… SMOKE_PASSWORD=… SMOKE_TOTP_SECRET=… [SMOKE_HTTP_USER=… SMOKE_HTTP_PASSWORD=…]
//   JOURNEYS_OUT=<dir> [JOURNEYS_ONLY=customer,admin] node tools/journeys.mjs
// Writes <JOURNEYS_OUT>/result.json, README.md and a screenshot of each failed step. Never prints or stores a password.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pageProblems, previewCookie, signIn, watched } from "./smoke.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STEP_KINDS = ["open", "follow", "click", "api"];

/** What is wrong with the saved journeys (an empty list when nothing is). */
export function journeyProblems(config) {
  const out = [];
  if (!Array.isArray(config?.screens) || !config.screens.length)
    out.push("no screens");
  const ids = new Set();
  for (const j of config?.journeys ?? []) {
    if (!j.id || ids.has(j.id)) out.push(`journey id missing or repeated: ${j.id}`);
    ids.add(j.id);
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
    });
  }
  return out;
}

/** The journeys to run: all, or the ones named (JOURNEYS_ONLY, the owner's choice). Unknown names are left out. */
export function pickJourneys(config, only) {
  const want = (only ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return (config.journeys ?? []).filter((j) => !want.length || want.includes(j.id));
}

/** One step in words for the report. */
export function stepLabel(s) {
  if (s.open) return `open ${s.open}`;
  if (s.follow) return `follow ${s.follow}`;
  if (s.click) return `click ${s.click}`;
  if (s.api) return `${s.method} ${s.api} → ${s.status}`;
  return "?";
}

/** The run's summary: every journey on every screen passed; the failed steps first. */
export function summarise(rows) {
  const problems = rows.flatMap((r) =>
    r.steps.filter((s) => !s.ok).map((s) => `${r.journey} (${r.screen}) step ${s.n} ${s.what}: ${s.problems[0] ?? "failed"}`),
  );
  const skipped = rows.reduce((n, r) => n + r.steps.filter((s) => s.skipped).length, 0);
  return {
    ok: problems.length === 0,
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
    `${meta.at} · ${meta.base} · ${meta.kind}${meta.sha ? ` · ${meta.sha}` : ""}`,
    "",
    `${result.journeys} journeys (journey × screen), ${result.failed} failed; ${result.steps} steps, ${result.skipped} skipped.`,
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

async function expectOn(page, s) {
  const any = s.expectAny ?? (s.expect ? [s.expect] : []);
  if (!any.length) return [];
  for (const sel of any) if ((await page.locator(sel).count()) > 0) return [];
  return [`${any.join(" or ")} is not on the page`];
}

/** Runs one step; returns its row. `skip`: an earlier optional step found nothing, so this one is skipped. */
async function runStep(page, base, ignore, s, n, skip, out, tag) {
  const row = { n, what: stepLabel(s), ok: true, skipped: null, problems: [], screenshot: null };
  if (skip) return { ...row, skipped: skip };
  let status = 0;
  // an api step's own answer is the expected refusal (checked below), not a failed request or a console error
  const known = s.api ? [...ignore, { path: new URL(s.api, base).pathname }] : ignore;
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
    if (s.open?.startsWith("/admin") && path.startsWith("/admin/login")) row.problems.push("sent back to the sign-in page");
    row.problems.push(...(await expectOn(page, s)));
  });
  row.problems.push(...watch);
  row.ok = row.problems.length === 0;
  if (!row.ok && out) {
    row.screenshot = `${tag}-${n}.jpg`;
    await page.screenshot({ path: join(out, row.screenshot), type: "jpeg", quality: 60 }).catch(() => {});
  }
  return row;
}

export async function runJourneys(opts) {
  const { chromium } = require("playwright");
  const config = JSON.parse(readFileSync(opts.config ?? join(root, "docs/qa/journeys.json"), "utf8"));
  const bad = journeyProblems(config);
  if (bad.length) throw new Error(`docs/qa/journeys.json: ${bad.join("; ")}`);
  const smokeConfig = JSON.parse(readFileSync(join(root, "docs/qa/smoke.json"), "utf8"));
  const ignore = smokeConfig.ignoreRequests ?? [];
  if (opts.out) mkdirSync(opts.out, { recursive: true });
  const browser = await chromium.launch(opts.chromiumPath ? { executablePath: opts.chromiumPath } : {});
  const rows = [];
  try {
    const preview = opts.httpCredentials ? await previewCookie(browser, opts.base, opts.httpCredentials) : null;
    for (const j of pickJourneys(config, opts.only)) {
      for (const scr of config.screens) {
        const ctx = await browser.newContext({ viewport: { width: scr.width, height: scr.height }, ...(preview ? { storageState: preview } : {}) });
        const page = await ctx.newPage();
        const steps = [];
        try {
          if (j.signedIn) await signIn(page, opts.base, opts.creds);
          let skip = null;
          for (const [i, s] of j.steps.entries()) {
            // only a follow or click that found nothing skips the follows and clicks after it; an `open` starts afresh
            if (s.open || s.api) skip = null;
            const row = await runStep(page, opts.base, ignore, s, i + 1, skip, opts.out, `${j.id}-${scr.id}`);
            if (row.skipped && !skip) skip = `step ${i + 1} found nothing`;
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
  return { ...summarise(rows), rows };
}

async function main() {
  const base = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
  const creds = { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD, totpSecret: process.env.SMOKE_TOTP_SECRET };
  if (!creds.email || !creds.password) throw new Error("sign-in details missing (SMOKE_EMAIL/SMOKE_PASSWORD)");
  const httpCredentials = process.env.SMOKE_HTTP_USER ? { username: process.env.SMOKE_HTTP_USER, password: process.env.SMOKE_HTTP_PASSWORD ?? "" } : undefined;
  const out = process.env.JOURNEYS_OUT || null;
  const result = await runJourneys({ base, creds, httpCredentials, out, only: process.env.JOURNEYS_ONLY, chromiumPath: process.env.CHROMIUM_PATH });
  for (const r of result.rows) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.journey.padEnd(10)} ${r.screen}`);
  if (out) {
    const meta = { at: process.env.JOURNEYS_AT || new Date().toISOString(), base, sha: process.env.JOURNEYS_SHA || "", kind: process.env.JOURNEYS_KIND || "run" };
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
