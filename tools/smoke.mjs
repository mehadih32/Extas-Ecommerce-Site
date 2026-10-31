// CN-016 / PR 4 — the smoke test: a real browser opens every built storefront page signed out (like a customer), then
// signs in to the admin and opens every page in the admin's menu, each on a phone and a desktop screen. A page fails
// on a 5xx, the error screen ("This page couldn't load"), a console error, an uncaught page error or a failed request
// (4xx/5xx on this site, or a request that never finished). Runs in three places:
// - after every deploy and every night on the runner against new.extas.com.bd (infra/deploy/smoke.sh), signed in
//   with the read-only check account (SMOKE_EMAIL / SMOKE_PASSWORD / SMOKE_TOTP_SECRET, made on the server);
// - in CI on the production images against a fresh installation (tools/admin-login-e2e.sh), signed in as the first
//   owner with the generated first password (E2E_EMAIL / E2E_PASSWORD_FILE), which it then changes.
//   BASE=https://… [SMOKE_HTTP_USER=… SMOKE_HTTP_PASSWORD=…] SMOKE_OUT=<dir> node tools/smoke.mjs
// Then, signed in, the extra checks of docs/qa/smoke.json `checks` (PR 6: the background worker's heartbeat is fresh
// on the Server page).
// S11 · PR 236: on the first screen, every storefront page that names a language pair (hreflang) is checked with its
// twin (tools/hreflang-check.mjs): complete, absolute, itself included, and named back.
// Writes <SMOKE_OUT>/result.json, README.md and one screenshot per storefront page and screen; admin pages' screenshots
// go only to SMOKE_PRIVATE_OUT when it is set (kept on the server, never committed: review R1 security M1). Never
// prints or stores a password.
// What it opens and the known exceptions are in docs/qa/smoke.json. Needs the `playwright` package (NODE_PATH).
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pagePairProblems } from "./hreflang-check.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ERROR_TEXT = /couldn.t load|a server error occurred|application error/i;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PREVIEW_COOKIE = "extas_preview"; // set by the preview gate (infra/stack/caddy/auth-block.sh)

/** Problems on a loaded page: a 5xx answer or the error screen. */
export function pageProblems(path, status, text) {
  const out = [];
  if (status >= 500) out.push(`${path}: answered ${status}`);
  if (ERROR_TEXT.test(text)) out.push(`${path}: shows the error screen`);
  return out;
}

/** The admin pages to open: every distinct /admin/… link in the menu, without the sign-in page or query strings. */
export function adminLinks(hrefs) {
  const seen = new Set();
  for (const h of hrefs) {
    const path = h.split(/[?#]/)[0];
    if (
      /^\/admin(\/|$)/.test(path) &&
      !path.startsWith("/admin/login") &&
      !path.startsWith("/api/")
    )
      seen.add(path);
  }
  return [...seen].sort();
}

/**
 * PR 12 (CN-022) — the signed-in pages to open: the Dashboard, then the menu's links, then smoke.json `admin` (every
 * built admin page and placeholder: the new sidebar links only each section's first page), each once, in that order.
 */
export function adminPaths(links, listed = []) {
  return [...new Set(["/admin", ...links, ...listed])];
}

/**
 * PR 49 — pages found on a built page (smoke.json `discover`): the first `take` distinct links of this site, without
 * query strings. The product pages are the owner's own products, so the smoke test finds them from New in rather than
 * naming one; a shop with no product yet has none to open.
 */
export function discovered(hrefs, take) {
  const seen = [];
  for (const h of hrefs) {
    const path = (h ?? "").split(/[?#]/)[0];
    if (!path.startsWith("/") || path.startsWith("//") || seen.includes(path)) continue;
    seen.push(path);
    if (seen.length >= take) break;
  }
  return seen;
}

/**
 * PR 155 (CN-022) — a page that shows the KPI pair (smoke.json `figures`) must show each figure once, in its own
 * element, with a value: "Sales" and "Ordered value" side by side, never one standing in for the other.
 * `found[i]` is what the browser found for `selectors[i]`: one { label, value } per matching element.
 */
export function figureProblems(path, selectors, found) {
  const out = [];
  const labels = [];
  selectors.forEach((sel, i) => {
    const hits = found[i] ?? [];
    if (hits.length === 0) out.push(`${path}: ${sel} is missing`);
    else if (hits.length > 1) out.push(`${path}: ${sel} shows ${hits.length} times`);
    else if (!hits[0].value) out.push(`${path}: ${sel} shows no figure`);
    else if (!hits[0].label) out.push(`${path}: ${sel} has no label`);
    else labels.push(hits[0].label);
  });
  if (new Set(labels).size !== labels.length)
    out.push(`${path}: the figures carry the same label (${labels.join(" / ")}): Sales and Ordered value must be separate`);
  return out;
}

/** A failed request counts unless its path is on the known list (each entry names the PR that removes it). */
export function requestCounts(url, base, ignore) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  if (u.origin !== new URL(base).origin) return true;
  return !ignore.some((i) => u.pathname === i.path);
}

/**
 * One extra check (docs/qa/smoke.json `checks`), signed in, after the pages: either a page's element must carry a
 * value (`page` + `selector` + `attribute` + `equals`, after the key `press` when given), or a request must get a given
 * answer (`request` + `status`).
 * A request check goes through the browser context's own request client (its cookies, never a page), so an answer
 * the check expects to be a refusal is not counted as a failed request of a page. Returns the problem, or null.
 * Follow-up 80: a request check with `anonymous: true` goes out with no cookie and no preview login at all (like an
 * outside system's call), and `field` names a key the app's own JSON answer must carry, so a refusal by the preview
 * gate (same status, no JSON) is told apart from the app's own refusal.
 */
export function checkProblem(check, observed) {
  const name = `check (PR ${check.pr}): ${check.what}`;
  if (observed.error) return `${name}: ${observed.error}`;
  if (check.request) {
    if (observed.status !== check.status) return `${name}: answered ${observed.status}, expected ${check.status}`;
    if (check.field && !(observed.json && typeof observed.json === "object" && check.field in observed.json))
      return `${name}: the answer is not the app's own (no "${check.field}" in it${observed.gate ? "; the preview login was asked for" : ""})`;
    return null;
  }
  return observed.value === check.equals ? null : `${name}: ${check.selector} ${check.attribute} is "${observed.value ?? "missing"}", expected "${check.equals}"`;
}

/**
 * R2 ops review (M2, PR 402) — does a check run on this host? A check with `host` ("staging" or "extra") runs only on
 * that kind of host; one without runs everywhere. The first-week watch smokes the main domain (an extra host), where
 * the preview-only noindex check (PR 220) is wrong by design once search engines are let in.
 */
export function checkApplies(check, hostKind = "staging") {
  return !check.host || check.host === hostKind;
}

/** Runs the extra checks with the signed-in page; returns their problems. `bare` makes a request client with no cookie. */
async function runChecks(page, base, checks, bare, hostKind) {
  const out = [];
  for (const check of checks.filter((c) => checkApplies(c, hostKind))) {
    let observed;
    try {
      if (check.request) {
        const client = check.request.anonymous ? await bare() : page.request;
        try {
          const r = await client.fetch(`${base}${check.request.path}`, {
            method: check.request.method ?? "GET",
            data: check.request.body,
            headers: check.request.headers ?? {},
            failOnStatusCode: false,
          });
          const json = await r.json().catch(() => null);
          const gate = /^basic/i.test(r.headers()["www-authenticate"] ?? "");
          observed = { status: r.status(), json, gate };
        } finally {
          if (client !== page.request) await client.dispose();
        }
      } else {
        await page.goto(`${base}${check.page}`, { waitUntil: "load" });
        // PR 12: `press` is a key pressed once the page has loaded (Control+K opens the command palette).
        if (check.press) {
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          await page.keyboard.press(check.press);
        }
        // PR 220: a tag in the page's head (meta robots, Open Graph) is never visible, so such a check says `"state": "attached"`.
        const el = await page.waitForSelector(check.selector, { state: check.state ?? "visible", timeout: 15_000 });
        observed = { value: await el.getAttribute(check.attribute) };
      }
    } catch (e) {
      observed = { error: e instanceof Error ? e.message.split("\n")[0] : String(e) };
    }
    const p = checkProblem(check, observed);
    if (p) out.push(p);
  }
  return out;
}

/** RFC 6238 code (HMAC-SHA1, 6 digits, 30 s), as packages/auth/src/totp.ts checks it. */
export function totpCode(secret, time = Date.now()) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secret.replace(/[\s=-]/g, "").toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const mac = createHmac("sha1", Buffer.from(bytes)).update(msg).digest();
  const offset = mac[mac.length - 1] & 0xf;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1e6)
    .toString()
    .padStart(6, "0");
}

const slug = (path, screen) =>
  `${(path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home").replace(/-+$/, "")}-${screen}.jpg`;

/** Watches one page for console errors, page errors and failed requests while `fn` runs (PR 414: the journeys too). */
export async function watched(page, base, ignore, fn) {
  const found = [];
  const onConsole = (m) => {
    if (m.type() !== "error") return;
    // "Failed to load resource" names the resource only in its location; a known request is not an error.
    const at = m.location()?.url;
    if (
      at &&
      /Failed to load resource/.test(m.text()) &&
      !requestCounts(at, base, ignore)
    )
      return;
    found.push(
      `console error: ${m.text().slice(0, 200)}${at ? ` (${at.replace(base, "")})` : ""}`,
    );
  };
  const onError = (e) =>
    found.push(`page error: ${String(e.message ?? e).slice(0, 200)}`);
  const onFailed = (r) => {
    const why = r.failure()?.errorText ?? "";
    // A navigation that replaces the page cancels what the old page still had in flight; that is not a failure.
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(why)) return;
    if (requestCounts(r.url(), base, ignore))
      found.push(`request failed: ${new URL(r.url()).pathname} (${why})`);
  };
  const onResponse = (r) => {
    if (r.status() >= 400 && requestCounts(r.url(), base, ignore))
      found.push(`request ${r.status()}: ${new URL(r.url()).pathname}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onError);
  page.on("requestfailed", onFailed);
  page.on("response", onResponse);
  try {
    await fn();
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onError);
    page.off("requestfailed", onFailed);
    page.off("response", onResponse);
  }
  return found;
}

/**
 * PR 500 (owner, 20 Oct 15:20): an e-mail without an "@" (the owner typed "admin") gets the "write the full e-mail
 * address" hint under the field once the field is left. Returns the problem, if any; the real address is typed after.
 */
async function emailHintProblems(page) {
  await page.fill("#ad-email", "admin");
  await page.focus("#ad-password");
  const shown = await page
    .waitForSelector("#ad-email-hint", { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  return shown
    ? []
    : ['an e-mail without "@" got no "write the full e-mail address" hint'];
}

/** Signs in through the form; returns the sign-in page's own problems (the e-mail hint). */
export async function signIn(page, base, creds) {
  await page.goto(`${base}/admin/login`);
  const problems = await emailHintProblems(page);
  await page.fill("#ad-email", creds.email);
  await page.fill("#ad-password", creds.password);
  await page.click("button[type=submit]");
  for (let i = 0; i < 3; i++) {
    const step = await Promise.race([
      page.waitForSelector("#ad-code", { timeout: 20_000 }).then(() => "code"),
      page
        .waitForSelector("#ad-pw1", { timeout: 20_000 })
        .then(() => "password"),
      page
        .waitForURL((u) => !u.pathname.startsWith("/admin/login"), {
          timeout: 20_000,
        })
        .then(() => "in"),
    ]).catch(() => "stuck");
    if (step === "in") return problems;
    if (step === "code") {
      if (!creds.totpSecret)
        throw new Error(
          "the account asks for a two-step code and no seed was given",
        );
      await page.fill("#ad-code", totpCode(creds.totpSecret));
      await page.click("button[type=submit]");
      // A code is good only once: wait for this step to go before looking at the next one.
      await page
        .waitForSelector("#ad-code", { state: "detached", timeout: 20_000 })
        .catch(() => {});
    } else if (step === "password") {
      // A first password is someone else's choice, so the form asks for the account's own one.
      const own = `smoke ${randomBytes(12).toString("hex")} passphrase`;
      await page.fill("#ad-pw1", own);
      await page.fill("#ad-pw2", own);
      await page.click("button[type=submit]");
      await page
        .waitForSelector("#ad-pw1", { state: "detached", timeout: 20_000 })
        .catch(() => {});
    } else {
      const text = (await page.innerText("body"))
        .replace(/\s+/g, " ")
        .slice(0, 200);
      throw new Error(`still on the sign-in page after signing in: ${text}`);
    }
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), {
    timeout: 20_000,
  });
  return problems;
}

/**
 * Review R1 (security M1) — where a page's picture may go: a storefront page into the report folder (committed to
 * docs/reports/smoke/latest/), an admin page only into SMOKE_PRIVATE_OUT (kept on the server, never in Git: after
 * go-live the admin shows real customers' names, phones and addresses). No private folder: no admin picture at all.
 */
export function shotDir(path, out, privateOut) {
  return /^\/admin(\/|$)/.test(path) ? privateOut || null : out || null;
}

/** Opens one path on one screen; returns its row for the report. `dirs` is {out, privateOut} (null: no picture). */
async function visit(page, base, ignore, path, screen, dirs) {
  let status = 0;
  let landed = path;
  let problems = [];
  const watch = await watched(page, base, ignore, async () => {
    const r = await page.goto(`${base}${path}`, { waitUntil: "load" });
    status = r?.status() ?? 0;
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});
    landed = new URL(page.url()).pathname;
    problems = pageProblems(path, status, await page.innerText("body"));
  });
  problems.push(...watch.map((w) => `${path}: ${w}`));
  if (path.startsWith("/admin") && landed.startsWith("/admin/login"))
    problems.push(`${path}: sent back to the sign-in page`);
  const dir = dirs ? shotDir(path, dirs.out, dirs.privateOut) : null;
  const shot = dir ? slug(path, screen) : null;
  if (dir)
    await page
      .screenshot({
        path: join(dir, shot),
        type: "jpeg",
        quality: 60,
        fullPage: false,
      })
      .catch(() => {});
  return {
    path,
    screen,
    status,
    landed,
    ok: problems.length === 0,
    problems,
    // only a picture in the report folder is linked from the committed report
    screenshot: dir && dir === dirs?.out ? shot : null,
  };
}

/**
 * Answers the preview login once and returns the browser state holding its cookie, or null when none was set.
 * PR 234: the monthly lab run passes the preview login the same way.
 */
export async function previewCookie(browser, base, httpCredentials) {
  const ctx = await browser.newContext({ httpCredentials });
  try {
    await (await ctx.newPage()).goto(`${base}/`);
    const state = await ctx.storageState();
    return state.cookies.some((c) => c.name === PREVIEW_COOKIE)
      ? {
          cookies: state.cookies.filter((c) => c.name === PREVIEW_COOKIE),
          origins: [],
        }
      : null;
  } finally {
    await ctx.close();
  }
}

export async function runSmoke(opts) {
  const { chromium, request: requestApi } = require("playwright");
  const config = JSON.parse(
    readFileSync(opts.config ?? join(root, "docs/qa/smoke.json"), "utf8"),
  );
  // PR 228: a page an owner's switch may close (smoke.json `mayBeOff`) may answer 404; a 5xx still fails (pageProblems)
  const ignore = [...(config.ignoreRequests ?? []), ...(config.mayBeOff?.paths ?? []).map((path) => ({ path }))];
  if (opts.out) mkdirSync(opts.out, { recursive: true });
  if (opts.privateOut) mkdirSync(opts.privateOut, { recursive: true });
  const browser = await chromium.launch(
    opts.chromiumPath ? { executablePath: opts.chromiumPath } : {},
  );
  const rows = [];
  const problems = [];
  try {
    // The preview login is answered once, like the owner does in Chrome; after that only its cookie goes along. A page
    // or request that asks for the preview login again fails (401), as it did for the owner's admin sign-in (PR 7).
    const preview = opts.httpCredentials
      ? await previewCookie(browser, opts.base, opts.httpCredentials)
      : null;
    if (opts.httpCredentials && !preview)
      problems.push(
        "the preview login did not give the extas_preview cookie: every request would ask for it again",
      );
    let signedIn = null;
    for (const vp of config.viewports) {
      const screen = {
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
      };
      // As a customer: signed out.
      const guest = await browser.newContext(
        preview ? { ...screen, storageState: preview } : screen,
      );
      const gp = await guest.newPage();
      // PR 236: the language pair of a shop page, once (it is the server's answer, not the screen's)
      const withPair = async (row) => {
        if (vp === config.viewports[0] && row.ok) {
          row.problems.push(...(await pagePairProblems(gp, opts.base, row.path)));
          row.ok = row.problems.length === 0;
        }
        return row;
      };
      for (const path of config.storefront)
        rows.push(await withPair(await visit(gp, opts.base, ignore, path, vp.name, opts)));
      // PR 49: the pages a built page links to (the product pages New in shows).
      for (const d of config.discover ?? []) {
        const from = await visit(gp, opts.base, ignore, d.from, vp.name, null);
        const hrefs = from.ok
          ? await gp
              .$$eval(d.selector, (els) => els.map((e) => e.getAttribute("href") ?? ""))
              .catch(() => [])
          : [];
        for (const path of discovered(hrefs, d.take))
          rows.push(await withPair(await visit(gp, opts.base, ignore, path, vp.name, opts)));
      }
      // Signed out, an admin page sends you to the sign-in page (never an error).
      const out = await visit(
        gp,
        opts.base,
        ignore,
        "/admin/products",
        vp.name,
        null,
      );
      if (!out.landed.startsWith("/admin/login"))
        problems.push(
          `signed out, /admin/products did not go to the sign-in page (${out.landed})`,
        );
      problems.push(
        ...out.problems
          .filter((p) => !p.endsWith("sent back to the sign-in page"))
          .map((p) => `${p} (${vp.name})`),
      );
      await guest.close();
      // As admin: the sign-in itself once (a two-step code is good only once), then its session on every screen.
      const state = signedIn ?? preview;
      const admin = await browser.newContext(
        state ? { ...screen, storageState: state } : screen,
      );
      const page = await admin.newPage();
      if (!signedIn) {
        let formProblems = [];
        const signInProblems = await watched(page, opts.base, ignore, async () => {
          formProblems = await signIn(page, opts.base, opts.creds);
        });
        problems.push(
          ...[...formProblems, ...signInProblems].map(
            (p) => `sign-in (${vp.name}): ${p}`,
          ),
        );
        signedIn = await admin.storageState();
        const landing = new URL(page.url()).pathname;
        rows.push(
          await visit(page, opts.base, ignore, landing, vp.name, opts),
        );
      } else {
        await page.goto(`${opts.base}/admin`);
      }
      const links = adminLinks(
        await page.$$eval("a[href]", (as) =>
          as.map((a) => a.getAttribute("href") ?? ""),
        ),
      );
      if (!links.length)
        problems.push(`the admin menu has no links (${vp.name})`);
      const seen = new Set(
        rows.filter((r) => r.screen === vp.name).map((r) => r.path),
      );
      for (const path of adminPaths(links, config.admin ?? []))
        if (!seen.has(path))
          rows.push(
            await visit(page, opts.base, ignore, path, vp.name, opts),
          );
      // Follow-up 200: admin pages found on a built admin page, signed in (one order's page from the order list; a
      // shop with no order yet opens none).
      for (const d of config.adminDiscover ?? []) {
        const from = await visit(page, opts.base, ignore, d.from, vp.name, null);
        const hrefs = from.ok
          ? await page
              .$$eval(d.selector, (els) => els.map((e) => e.getAttribute("href") ?? ""))
              .catch(() => [])
          : [];
        for (const path of discovered(hrefs, d.take))
          if (!seen.has(path))
            rows.push(await visit(page, opts.base, ignore, path, vp.name, opts));
      }
      // The extra checks once (they test the server, not the screen size).
      if (vp === config.viewports[0])
        problems.push(
          ...(await runChecks(page, opts.base, config.checks ?? [], () => requestApi.newContext(), opts.hostKind)),
        );
      // PR 155: the pages that show Sales and Ordered value load, and show the two as separate figures.
      for (const f of config.figures ?? []) {
        const row = await visit(page, opts.base, ignore, f.path, vp.name, opts);
        const found = row.ok
          ? await Promise.all(
              f.selectors.map((sel) =>
                page
                  .$$eval(
                    sel,
                    (els, v) =>
                      els.map((e) => ({
                        label: (e.firstElementChild?.textContent ?? "").trim(),
                        value: (e.querySelector(v)?.textContent ?? "").trim(),
                      })),
                    f.value ?? "b",
                  )
                  .catch(() => []),
              ),
            )
          : [];
        if (row.ok) row.problems.push(...figureProblems(f.path, f.selectors, found));
        row.ok = row.problems.length === 0;
        rows.push(row);
      }
      await admin.close();
    }
  } finally {
    await browser.close();
  }
  for (const r of rows)
    problems.push(...r.problems.map((p) => `${p} (${r.screen})`));
  return {
    ok: problems.length === 0,
    pages: rows.length,
    failed: rows.filter((r) => !r.ok).length,
    problems,
    rows,
  };
}

/** The report file: Bengali summary first, then the table (docs/reports/smoke/latest/README.md). */
export function reportMarkdown(result, meta) {
  const lines = [
    `# Smoke test · ${meta.at}`,
    "",
    result.ok
      ? `> **বাংলায়:** সব পাতা ঠিকমতো খুলেছে (${result.pages}টা পাতা, ফোন আর কম্পিউটারে)। কোনো সমস্যা নেই।`
      : `> **বাংলায়:** ${result.failed}টা পাতায় সমস্যা পাওয়া গেছে। ${meta.rolledBack ? "সাইট নিজে থেকে আগের ভালো ভার্সনে ফিরে যাচ্ছে; " : ""}ঠিক করার কাজ সবার আগে হচ্ছে।`,
    "",
    `Site: ${meta.base} · commit \`${meta.sha || "—"}\` · ${meta.kind} · result **${result.ok ? "PASS" : "FAIL"}** (${result.pages} page views, ${result.failed} failed)`,
    "",
    "| Page | Screen | Answer | Landed on | Result | Screenshot |",
    "|---|---|:-:|---|---|---|",
    ...result.rows.map(
      (r) =>
        `| \`${r.path}\` | ${r.screen} | ${r.status} | \`${r.landed}\` | ${r.ok ? "ok" : `**FAIL**: ${r.problems.join("; ").replace(/\|/g, "/")}`} | ${r.screenshot ? `[picture](${r.screenshot})` : "—"} |`,
    ),
  ];
  const other = result.problems.filter(
    (p) => !result.rows.some((r) => r.problems.some((q) => p.startsWith(q))),
  );
  if (other.length)
    lines.push("", "Other problems:", "", ...other.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}

async function main() {
  const base = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
  const e2eFile = process.env.E2E_PASSWORD_FILE;
  const creds = e2eFile
    ? {
        email: process.env.E2E_EMAIL,
        password: readFileSync(e2eFile, "utf8").trim(),
      }
    : {
        email: process.env.SMOKE_EMAIL,
        password: process.env.SMOKE_PASSWORD,
        totpSecret: process.env.SMOKE_TOTP_SECRET,
      };
  if (!creds.email || !creds.password)
    throw new Error(
      "sign-in details missing (SMOKE_EMAIL/SMOKE_PASSWORD or E2E_EMAIL/E2E_PASSWORD_FILE)",
    );
  const httpCredentials = process.env.SMOKE_HTTP_USER
    ? {
        username: process.env.SMOKE_HTTP_USER,
        password: process.env.SMOKE_HTTP_PASSWORD ?? "",
      }
    : undefined;
  const out = process.env.SMOKE_OUT || null;
  const result = await runSmoke({
    base,
    creds,
    httpCredentials,
    out,
    privateOut: process.env.SMOKE_PRIVATE_OUT || null,
    chromiumPath: process.env.CHROMIUM_PATH,
    // R2 ops review (M2): staging (the preview host, the default) or extra (the main domain, infra/deploy/smoke.sh)
    hostKind: process.env.SMOKE_HOST_KIND === "extra" ? "extra" : "staging",
  });
  for (const r of result.rows)
    console.log(
      `${r.ok ? "ok  " : "FAIL"} ${r.screen.padEnd(7)} ${r.path} → ${r.landed} (${r.status})`,
    );
  if (out) {
    const meta = {
      at: process.env.SMOKE_AT || new Date().toISOString(),
      base,
      sha: process.env.SMOKE_SHA || "",
      kind: process.env.SMOKE_KIND || "run",
      rolledBack: process.env.SMOKE_ROLLS_BACK === "1",
    };
    writeFileSync(
      join(out, "result.json"),
      `${JSON.stringify({ ...meta, ok: result.ok, pages: result.pages, failed: result.failed, problems: result.problems }, null, 2)}\n`,
    );
    writeFileSync(join(out, "README.md"), reportMarkdown(result, meta));
  }
  if (!result.ok) {
    console.error(
      `smoke: ${result.problems.length} problem(s)\n  ${result.problems.join("\n  ")}`,
    );
    return 1;
  }
  console.log(`smoke: every page opened (${result.pages} page views)`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`smoke: FAILED — ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    },
  );
}
