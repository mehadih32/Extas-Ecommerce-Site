// PR 508 (PROGRESS follow-up 19; GitHub #21 rebuilt on main) — the admin session end to end, in a real browser:
//   1. the sign-in page opens (signed out);
//   2. signing in lands on the admin (a first password is replaced by the account's own one, as the form asks);
//   3. a page refresh keeps the session;
//   4. opening /access while signed in goes to the admin, never to a second sign-in;
//   5. "Log out" ends the session and shows the sign-in page;
//   6. a protected page then goes back to the sign-in page, and the session cookie from before the log-out no longer
//      opens the admin either (the server ended the session, not only the browser's cookie).
// On every step a console error, an uncaught page error or a failed request on this site (4xx/5xx, or a request that
// never finished) is a failure, as are a 5xx answer and the error screen. Request paths known to fail are the smoke
// test's list (docs/qa/smoke.json `ignoreRequests`), so both tests agree on what counts.
// Runs in CI on the web job's own build against a fresh installation on a throwaway database
// (tools/admin-session-e2e.sh, which makes the test-only account with a password generated at run time):
//   BASE=http://localhost:3200 E2E_EMAIL=… E2E_PASSWORD_FILE=<file> [E2E_SHOTS=<dir>] node tools/admin-session-e2e.mjs
// Never prints a password, a cookie or an e-mail. Needs the `playwright` package (NODE_PATH).
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pageProblems, requestCounts } from "./smoke.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN = "/access";

/** True for the sign-in page (with or without a "come back here" query). */
export function onLogin(url) {
  try {
    return new URL(url).pathname.startsWith(LOGIN);
  } catch {
    return false;
  }
}

/** True for a signed-in admin page: any /admin page that is not the sign-in page. */
export function onAdmin(url) {
  try {
    const p = new URL(url).pathname;
    return /^\/admin(\/|$)/.test(p) && !p.startsWith(LOGIN);
  } catch {
    return false;
  }
}

/** The log-out button's label in every admin language (messages/admin.<lang>.json, `frame.logout`). */
export function logoutLabels(dir = join(root, "apps/web/messages")) {
  return readdirSync(dir)
    .filter((f) => /^admin\.[a-z]{2}\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")).frame?.logout)
    .filter((v) => typeof v === "string" && v.trim() !== "");
}

/** A button name that is exactly one of the labels (the icon adds no text). */
export function logoutName(labels) {
  if (!labels.length) throw new Error("no frame.logout label in the admin messages");
  const esc = labels.map((l) => l.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^\\s*(${esc.join("|")})\\s*$`);
}

/** The session cookie(s) of a browser state: `__Host-admin_*` on this host. */
export function sessionCookies(cookies) {
  return cookies.filter((c) => /^__Host-admin_/.test(c.name));
}

/** Hides every secret (and anything that looks like an e-mail) from a message before it is printed. */
export function scrub(text, secrets) {
  let s = String(text);
  for (const v of secrets) if (v) s = s.split(v).join("<hidden>");
  return s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<e-mail>");
}

/**
 * Races `promise` against a plain timer: every Playwright *wait* in this file already has its own `timeout`, but a
 * bare `page.evaluate()` has none — a browser API it calls from inside the page (Cache Storage, a service worker's
 * `ready`) is never guaranteed to settle, and one that never settles blocks the `await` forever with no error, which
 * is what actually hung this script's own CI job for its whole budget with nothing printed (step 0 below, the admin
 * page never even reached). On time, this resolves to `fallback` instead of leaving the caller stuck; past `ms` it
 * calls `onTimeout(ms)` once (e.g. to file a problem) and resolves to `fallback`.
 */
export async function withDeadline(promise, ms, onTimeout, fallback = null) {
  const TIMED_OUT = Symbol("timed-out");
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    if (result === TIMED_OUT) {
      onTimeout(ms);
      return fallback;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Watches a page for the whole journey: console errors, page errors, failed requests and 4xx/5xx answers on this site.
 * `step()` names the step each problem is filed under.
 */
export function watchPage(page, base, ignore, step, problems, secrets) {
  const add = (what) => problems.push(`${step()}: ${scrub(what, secrets).slice(0, 240)}`);
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const at = m.location()?.url;
    // "Failed to load resource" names the resource only in its location; a known request is not an error.
    if (at && /Failed to load resource/.test(m.text()) && !requestCounts(at, base, ignore)) return;
    add(`console error: ${m.text()}${at ? ` (${at.replace(base, "")})` : ""}`);
  });
  page.on("pageerror", (e) => add(`page error: ${e.message ?? e}`));
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "";
    // A navigation that replaces the page cancels what the old page still had in flight; that is not a failure.
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(why)) return;
    if (requestCounts(r.url(), base, ignore)) add(`request failed: ${new URL(r.url()).pathname} (${why})`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && requestCounts(r.url(), base, ignore))
      add(`request ${r.status()}: ${new URL(r.url()).pathname}`);
  });
}

async function run() {
  const base = (process.env.BASE || "http://localhost:3200").replace(/\/$/, "");
  const email = process.env.E2E_EMAIL;
  const file = process.env.E2E_PASSWORD_FILE;
  if (!email || !file) throw new Error("E2E_EMAIL and E2E_PASSWORD_FILE are required");
  const password = readFileSync(file, "utf8").trim();
  const ownPassword = `e2e ${randomBytes(12).toString("hex")} passphrase`;
  const secrets = [email, password, ownPassword];
  const ignore = JSON.parse(readFileSync(join(root, "docs/qa/smoke.json"), "utf8")).ignoreRequests ?? [];
  const shots = process.env.E2E_SHOTS || null;
  if (shots) mkdirSync(shots, { recursive: true });

  const { chromium } = require("playwright");
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const problems = [];
  let step = "start";
  const here = (page) => new URL(page.url()).pathname;
  const shot = async (page, name) => {
    if (shots) await page.screenshot({ path: join(shots, `admin-session-${name}.png`) }).catch(() => {});
  };
  const settle = (page) => page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  // A page-side check capped the same way every page-side *wait* above already is (see `withDeadline`'s own doc).
  const capped = (promise, ms, label, fallback) => withDeadline(promise, ms, () => problems.push(`${step}: ${label} did not finish within ${ms}ms (a browser API never answered)`), fallback);
  // A second, whole-script safety net: whatever still hangs (browser.close() itself, a step nobody has capped yet)
  // must never again spend the CI job's full budget in silence. armWatchdog()/disarmWatchdog() bracket the run below.
  const WATCHDOG_MS = 5 * 60_000;
  let watchdog;
  const armWatchdog = () => {
    watchdog = setTimeout(() => {
      console.error(`admin session e2e: FAILED — stuck at "${step}" past the ${WATCHDOG_MS}ms watchdog; exiting so the job does not hang`);
      process.exit(1);
    }, WATCHDOG_MS);
  };
  const disarmWatchdog = () => clearTimeout(watchdog);
  armWatchdog();
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    watchPage(page, base, ignore, () => step, problems, secrets);
    const check = async (status) => problems.push(...pageProblems(step, status, await page.innerText("body")));

    step = "0 legacy browser state (CN-043)";
    // The owner's old everyday browser, which used the WordPress shop that ran on this domain before go-live, still
    // carries its cookies, a registered service worker and cached files when it first opens the admin. Simulate that:
    // a WooCommerce-style cookie, a large stored value, a cache entry and a service worker registration (at one of
    // our own legacy stand-in paths, apps/web/src/app/sw.js) — then the admin sign-in must still load.
    await page.goto(`${base}/`);
    await page.evaluate(() => {
      document.cookie = "woocommerce_cart_hash=legacy; path=/";
      document.cookie = "wp-settings-1=legacy; path=/";
      try {
        window.localStorage.setItem("legacy-wp-blob", "x".repeat(200_000));
      } catch {
        /* a browser that refuses storage is still fine to test against */
      }
    });
    // `navigator.serviceWorker.ready` only resolves once this registration reaches "activated" — a state Chromium
    // itself does not promise to reach in bounded time (e.g. a slow or contended host can leave the install/activate
    // handshake pending well past any sane test budget). Capped at 20s, the same budget this file already gives
    // every other page-side wait (the sign-in form, a navigation, a click).
    await capped(
      page.evaluate(async () => {
        try {
          const c = await caches.open("old-wp-cache");
          await c.put("/old-wp-asset.css", new Response("body{color:red}"));
        } catch {
          /* no Cache Storage in this context: the rest of the check still holds */
        }
        try {
          await navigator.serviceWorker.register("/sw.js");
          await navigator.serviceWorker.ready;
        } catch {
          /* no service-worker support in this context: the rest of the check still holds */
        }
      }),
      20_000,
      "the legacy service-worker/cache simulation",
    );
    console.log(`ok   ${step}`);

    step = "1 open the sign-in page";
    let r = await page.goto(`${base}${LOGIN}`);
    await page.waitForSelector("#ad-email", { timeout: 20_000 });
    await settle(page);
    await check(r?.status() ?? 0);
    await shot(page, "1-sign-in");
    console.log(`ok   ${step}`);

    step = "2 sign in";
    await page.fill("#ad-email", email);
    await page.fill("#ad-password", password);
    await page.click("button[type=submit]");
    const asked = await Promise.race([
      page.waitForSelector("#ad-pw1", { timeout: 30_000 }).then(() => "password"),
      page.waitForURL((u) => onAdmin(u.href), { timeout: 30_000 }).then(() => "in"),
    ]).catch(() => "stuck");
    if (asked === "password") {
      // The first password was made by the set-up, so the form asks for the account's own one first.
      if (await page.locator("#ad-cur").count()) await page.fill("#ad-cur", password);
      await page.fill("#ad-pw1", ownPassword);
      await page.fill("#ad-pw2", ownPassword);
      await page.click("button[type=submit]");
      await page.waitForURL((u) => onAdmin(u.href), { timeout: 30_000 }).catch(() => {});
    }
    if (!onAdmin(page.url())) {
      const text = (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 200);
      throw new Error(`still on ${here(page)} after signing in (${asked}): ${scrub(text, secrets)}`);
    }
    await settle(page);
    await check(200);
    const landed = here(page);
    const signedInCookies = sessionCookies((await context.storageState()).cookies);
    if (!signedInCookies.length) problems.push(`${step}: no admin session cookie after signing in`);
    await shot(page, "2-signed-in");
    console.log(`ok   ${step} → ${landed}${asked === "password" ? " (first password replaced)" : ""}`);

    step = "3 refresh keeps the session";
    r = await page.reload();
    await settle(page);
    if (!onAdmin(page.url())) problems.push(`${step}: the refresh went to ${here(page)}`);
    else if (here(page) !== landed) problems.push(`${step}: the refresh moved from ${landed} to ${here(page)}`);
    await check(r?.status() ?? 0);
    console.log(`ok   ${step} (${here(page)})`);

    step = "4 the sign-in page while signed in";
    r = await page.goto(`${base}${LOGIN}`);
    await settle(page);
    if (!onAdmin(page.url())) problems.push(`${step}: stayed on ${here(page)}: a second sign-in although signed in`);
    if (await page.locator("#ad-email, #ad-password").count())
      problems.push(`${step}: the sign-in form is shown although signed in`);
    await check(r?.status() ?? 0);
    await shot(page, "3-sign-in-page-while-signed-in");
    console.log(`ok   ${step} → ${here(page)}`);

    step = "5 log out";
    // The new shell (PR 12, demo V12.3) keeps "Sign out" in the account menu: open the visible account button (the
    // sidebar's on a computer, the top bar's avatar on a phone), then press the menu's sign-out item. A page still on
    // the old frame draws its own log-out button (messages/admin.<lang>.json `frame.logout`), pressed the same way.
    const me = page.locator("[data-testid=a2-me], [data-testid=a2-avatar]").filter({ visible: true });
    if (await me.count()) {
      await me.first().click({ timeout: 20_000 });
      await page.locator("[data-testid=a2-signout]").filter({ visible: true }).first().click({ timeout: 20_000 });
    } else {
      const button = page.getByRole("button", { name: logoutName(logoutLabels()) }).filter({ visible: true });
      if (!(await button.count())) throw new Error("no visible account menu or log-out button on the admin page");
      await button.first().click({ timeout: 20_000 });
    }
    await page.waitForURL((u) => onLogin(u.href), { timeout: 30_000 });
    await page.waitForSelector("#ad-email", { timeout: 20_000 });
    await settle(page);
    await check(200);
    if (sessionCookies((await context.storageState()).cookies).length)
      problems.push(`${step}: the session cookie is still in the browser after logging out`);
    await shot(page, "4-logged-out");
    console.log(`ok   ${step} → ${here(page)}`);

    step = "6 a protected page goes back to sign-in";
    r = await page.goto(`${base}${landed}`);
    await settle(page);
    if (!onLogin(page.url())) problems.push(`${step}: ${landed} opened at ${here(page)} after logging out`);
    await check(r?.status() ?? 0);
    console.log(`ok   ${step} (${landed} → ${here(page)})`);

    step = "6b the old session cookie is dead";
    // A second browser that still holds the cookie from before the log-out (as a copied or stolen cookie would).
    const replay = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      storageState: { cookies: signedInCookies, origins: [] },
    });
    try {
      const old = await replay.newPage();
      watchPage(old, base, ignore, () => step, problems, secrets);
      r = await old.goto(`${base}${landed}`);
      await settle(old);
      if (!onLogin(old.url())) problems.push(`${step}: the cookie from before the log-out still opens ${landed}`);
      problems.push(...pageProblems(step, r?.status() ?? 0, await old.innerText("body")));
      console.log(`ok   ${step} (${landed} → ${new URL(old.url()).pathname})`);
    } finally {
      await replay.close();
    }

    step = "7 /reset clears the legacy browser state (CN-043)";
    r = await page.goto(`${base}/reset`);
    await check(r?.status() ?? 0);
    const afterReset = await capped(
      page.evaluate(async () => ({
        cookies: document.cookie,
        storageLen: (() => {
          try {
            return window.localStorage.length;
          } catch {
            return 0;
          }
        })(),
        caches: await (async () => {
          try {
            return (await caches.keys()).length;
          } catch {
            return 0;
          }
        })(),
        registrations: await (async () => {
          try {
            return (await navigator.serviceWorker.getRegistrations()).length;
          } catch {
            return 0;
          }
        })(),
      })),
      20_000,
      "reading the browser state after /reset",
      { cookies: "", storageLen: 0, caches: 0, registrations: 0 },
    );
    if (/woocommerce_|wp-settings-/.test(afterReset.cookies)) problems.push(`${step}: a legacy cookie is still set after /reset`);
    if (afterReset.storageLen > 0) problems.push(`${step}: localStorage still has ${afterReset.storageLen} key(s) after /reset`);
    if (afterReset.caches > 0) problems.push(`${step}: ${afterReset.caches} cache(s) remain after /reset`);
    if (afterReset.registrations > 0) problems.push(`${step}: ${afterReset.registrations} service worker registration(s) remain after /reset`);
    await page.waitForURL((u) => onLogin(u.href), { timeout: 10_000 }).catch(() => problems.push(`${step}: did not reach the admin sign-in after /reset's own refresh`));
    console.log(`ok   ${step} → ${here(page)}`);
  } catch (e) {
    problems.push(`${step}: ${scrub(e instanceof Error ? e.message : String(e), secrets).split("\n")[0]}`);
  } finally {
    await browser.close();
    disarmWatchdog();
  }
  if (problems.length) {
    console.error(`admin session e2e: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    return 1;
  }
  console.log("admin session e2e: sign in → refresh → sign-in page while signed in → log out → closed again: all ok");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`admin session e2e: FAILED — ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    },
  );
}
