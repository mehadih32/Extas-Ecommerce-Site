// PR 414 follow-up (CN-013 phase 2, owner 1 Nov 2026) — the go-live gate's customer 360° run: one test customer walked
// through the whole life cycle on the preview, in a real browser, on a mid Android phone, an iPhone and a 1366 desktop,
// in English and /bn (tools/gate-c360/gate-c360.json). Before ordering (an ad link with its tags, the Facebook and
// Messenger in-app browsers, search in English, Bengali and misspelt, a category's filter, a product page, the size
// guide, a sold-out size's "tell me", the wishlist, the bag, a checkout he leaves, leaving and coming back), ordering
// (a guest order, then the same number signing in with the mock SMS code, the guest order in his account), every
// option of his account, support (each channel the shop offers, and staff finding him by his number however it is
// written, his orders and their history), and after ordering (the confirmation messages on the mocks with their words,
// the order in the admin at once, a delivered order counted as a sale, his history). Each step is PASS, FAIL or SKIP
// with its reason and its time; a SKIP names what is missing (a product, an owner's switch, a part not built, a key).
//   BASE=https://<preview> SMOKE_EMAIL=… SMOKE_PASSWORD=… SMOKE_TOTP_SECRET=… [SMOKE_HTTP_USER=… SMOKE_HTTP_PASSWORD=…]
//   GATE_PHONE=01… GATE_RUN=<id> GATE_SCENARIOS=all GATE_OUT=<dir> GATE_BRIDGE=<dir> | GATE_HELPER_CMD=<script>
//   node tools/gate-c360/run.mjs
// The database side (the mock SMS inbox, moving the order on the mocks, the stored facts, the messages' words, the
// clean-up) is tools/gate-c360/helper.ts, asked through GATE_BRIDGE (files the server's loop answers, infra/deploy/
// gate-c360.sh) or, on a developer's machine, GATE_HELPER_CMD. Staff pages are read as the read-only check account.
// Never a real provider: the run stops at once if the sign-in code was not sent by the mock. Nothing it prints or
// writes holds a password, a code, a cookie or a key (lib.mjs redact).
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { uiProblems } from "../journeys.mjs";
import { pageProblems, previewCookie, signIn, watched } from "../smoke.mjs";
import * as L from "./lib.mjs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errText = (e) => L.redact(String(e instanceof Error ? e.message : e).split("\n")[0]).slice(0, 220);

/** Why the run stops at once (a real provider answered, or the host is wrong). */
class Stop extends Error {}

// ------------------------------------------------------------------------------------------------ the database side

let seq = 0;
/** One question to helper.ts: through the bridge folder (the server) or the local command (a developer's machine). */
export async function askHelper(action, args, env = process.env, waitSec = 90) {
  const bridge = env.GATE_BRIDGE;
  if (bridge) {
    const n = `${process.pid}-${++seq}`;
    writeFileSync(join(bridge, `.req-${n}.json`), JSON.stringify({ action, args }));
    renameSync(join(bridge, `.req-${n}.json`), join(bridge, `req-${n}.json`));
    const res = join(bridge, `res-${n}.json`);
    for (let i = 0; i < waitSec * 2; i++) {
      if (existsSync(res)) {
        await sleep(100);
        try {
          return JSON.parse(readFileSync(res, "utf8"));
        } catch {
          return { ok: false, error: "the helper's answer was not JSON" };
        }
      }
      await sleep(500);
    }
    return { ok: false, error: `the helper did not answer ${action} within ${waitSec} s` };
  }
  if (env.GATE_HELPER_CMD) {
    return new Promise((resolve) => {
      execFile(env.GATE_HELPER_CMD, [action, JSON.stringify(args)], { timeout: waitSec * 1000 }, (_e, stdout) => {
        const last = String(stdout ?? "").trim().split("\n").pop() ?? "";
        try {
          resolve(JSON.parse(last));
        } catch {
          resolve({ ok: false, error: `the helper said: ${L.redact(last).slice(0, 160)}` });
        }
      });
    });
  }
  return { ok: false, error: "no helper (GATE_BRIDGE or GATE_HELPER_CMD)" };
}

// ------------------------------------------------------------------------------------------------------- the run

export async function runGate(o) {
  const { chromium } = require("playwright");
  const cfg = o.cfg ?? JSON.parse(readFileSync(join(here, "gate-c360.json"), "utf8"));
  const smokeCfg = JSON.parse(readFileSync(join(root, "docs/qa/smoke.json"), "utf8"));
  const ignore = smokeCfg.ignoreRequests ?? [];
  const uiRules = JSON.parse(readFileSync(join(root, "docs/qa/device-gate.json"), "utf8"));
  const matrix = require(join(root, "docs/qa/device-matrix.js"));
  const base = o.base;
  const want = new Set(o.scenarios);
  const rows = [];
  const out = o.out;
  const phone = L.localPhone(o.phone);
  if (!phone) throw new Error("GATE_PHONE is not a mobile number");
  const run = o.run;
  const name = L.gateLabel("customer", run);
  const screens = Object.fromEntries(cfg.screens.map((s) => [s.id, s]));
  const st = { products: null, number: null, orderId: null, customerId: null, signedIn: null, delivered: false, cancelled: false, factsAtOrder: null, conversation: null };
  const helper = (a, args) => askHelper(a, args, o.env ?? process.env, cfg.waits.helperSec);
  const log = (s) => console.log(L.redact(s));

  const browser = await chromium.launch(o.chromiumPath ? { executablePath: o.chromiumPath } : {});
  const preview = o.httpCredentials ? await previewCookie(browser, base, o.httpCredentials) : null;
  const contexts = [];

  async function newPage(scr, { ua, state, lang } = {}) {
    const ctx = await browser.newContext({
      viewport: { width: scr.width, height: scr.height },
      ...(scr.touch ? { isMobile: true, hasTouch: true } : {}),
      ...(ua || scr.ua ? { userAgent: ua || scr.ua } : {}),
      locale: lang === "bn" ? "bn-BD" : "en-GB",
      ...(state ? { storageState: state } : preview ? { storageState: preview } : {}),
    });
    contexts.push(ctx);
    return ctx.newPage();
  }

  /** One step: runs `fn`, keeps its time and its row; a throw is a FAIL with its reason (a Stop ends the run). */
  async function step(meta, fn) {
    const t0 = Date.now();
    let r;
    try {
      r = (await fn()) ?? { status: "PASS" };
    } catch (e) {
      if (e instanceof Stop) throw e;
      r = { status: "FAIL", reason: errText(e) };
    }
    let shot = null;
    if (r.status === "FAIL" && r.page && out) {
      shot = `${meta.scenario}-${meta.id}-${meta.screen ?? "x"}-${meta.lang ?? "x"}.jpg`.replace(/[^a-z0-9.-]/gi, "-");
      await r.page.screenshot({ path: join(out, shot), type: "jpeg", quality: 55 }).catch(() => (shot = null));
    }
    const x = L.row({ ...meta, ...r, ms: r.ms ?? Date.now() - t0, shot });
    rows.push(x);
    log(`${x.status.padEnd(4)} ${x.scenario}/${x.id}${x.screen ? ` ${x.screen}` : ""}${x.lang ? ` ${x.lang}` : ""} ${x.ms ?? "-"} ms ${x.reason}`);
    return r;
  }

  /** The page's own quality on this screen: English left on a Bengali page, and a broken layout on a phone. */
  async function quality(page, scr, lang) {
    const problems = [];
    if (lang === "bn") {
      const texts = await page
        .$$eval("main button, main a, main label, main h1, main h2, main h3, header button, header a, [role=tab], [role=dialog] button", (els) =>
          els.filter((e) => !e.closest(".pcard-w, [translate=no], [data-no-translate]") && e.getBoundingClientRect().width > 0).map((e) => e.innerText || e.getAttribute("aria-label") || ""),
        )
        .catch(() => []);
      for (const s of L.untranslated(texts, cfg.allowLatin)) problems.push(`untranslated: "${s.slice(0, 60)}"`);
    }
    if (scr.touch) problems.push(...(await uiProblems(page, scr, ["layout", "text"], uiRules, matrix).catch((e) => [`layout check could not run: ${errText(e)}`])));
    return problems;
  }

  /** Same-site links on the page that answer 4xx or 5xx (a dead button the customer would press). */
  async function deadLinks(page) {
    const hrefs = await page.$$eval("main a[href]", (as) => [...new Set(as.map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/") && !h.startsWith("//")))].slice(0, 20)).catch(() => []);
    const dead = [];
    for (const h of hrefs) {
      const r = await page.request.get(`${base}${h}`, { maxRedirects: 3, timeout: 15_000 }).catch(() => null);
      if (!r || r.status() >= 400) dead.push(`dead link ${h} (${r ? r.status() : "no answer"})`);
    }
    const unnamed = await page
      .$$eval("main button", (bs) =>
        bs.filter((b) => b.getBoundingClientRect().width > 0 && !(b.innerText || "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("aria-labelledby") && !b.getAttribute("title")).map((b) => `.${String(b.className).split(" ").slice(0, 2).join(".")}`),
      )
      .catch(() => []);
    if (unnamed.length) dead.push(`${unnamed.length} button(s) with no name, a screen reader says nothing (${[...new Set(unnamed)].slice(0, 3).join(", ")})`);
    return dead;
  }

  /** Opens a shop or admin path: its answer, its time, its errors, and (shop pages) its quality on this screen. */
  async function visit(page, path, { scr, lang, expect, links = false, raw = false } = {}) {
    let status = 0;
    const t0 = Date.now();
    const watch = await watched(page, base, ignore, async () => {
      const r = await page.goto(`${base}${path}`, { waitUntil: "load", timeout: cfg.waits.pageMs });
      status = r?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    });
    const ms = Date.now() - t0;
    const at = new URL(page.url()).pathname;
    const problems = [...pageProblems(at, status, await page.innerText("body").catch(() => "")), ...watch];
    if (status >= 400 && !raw) problems.push(`${at}: answered ${status}`);
    if (path.startsWith("/admin") && at.startsWith("/admin/login")) problems.push("sent back to the staff sign-in");
    if (expect && !(await page.locator(expect).count())) problems.push(`${expect} is not on the page`);
    if (scr && !path.startsWith("/admin")) problems.push(...(await quality(page, scr, lang)));
    if (links) problems.push(...(await deadLinks(page)));
    return { ms, status, at, problems };
  }

  const fromPage = (v, extra = {}) => ({ status: v.problems.length ? "FAIL" : "PASS", reason: v.problems[0] ?? "", problems: v.problems.slice(1), ms: v.ms, ...extra });

  /** A same-site call from inside the page (the shop's own cookies), its status and JSON. */
  const call = (page, path, method = "GET", body) =>
    page.evaluate(
      async ([p, m, b]) => {
        const r = await fetch(p, { method: m, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b), credentials: "same-origin" });
        let j = null;
        try {
          j = await r.json();
        } catch {
          /* not JSON */
        }
        return { status: r.status, json: j };
      },
      [path, method, body],
    );

  /** The first link of a product card on the page (the cards are the shop's own; no product name is assumed). */
  /** An attribute of the first match, without waiting when there is none. */
  const attr = async (loc, name) => ((await loc.count()) ? loc.first().getAttribute(name, { timeout: 5_000 }).catch(() => null) : null);
  const firstProduct = (page) => attr(page.locator(".pcard-w a[href]"), "href");

  /** Signs the gate's customer in by the mock SMS code; stops the run if the code did not go through the mock. */
  async function otpSignIn(page, lang) {
    await visit(page, L.inLang(lang, "/account/login"), {});
    await page.fill("[data-testid=login-phone]", phone);
    const answer = page.waitForResponse((r) => r.url().endsWith("/api/account/code"), { timeout: 20_000 });
    await page.click("[data-testid=login-send]");
    const res = await answer;
    const j = await res.json().catch(() => ({}));
    if (res.status() !== 200) return { ok: false, why: `asking for the code answered ${res.status()} (${j.error ?? "?"})` };
    if (j.mock !== true) throw new Stop("the sign-in code went out through a real SMS gateway: the gate stops (A1.3)");
    await page.waitForSelector("[data-testid=login-code]", { timeout: 15_000 });
    const notice = (await page.locator("[data-testid=login-nosms]").count()) > 0;
    const code = String(Math.floor(Math.random() * 10 ** (j.length ?? 6))).padStart(j.length ?? 6, "0");
    const set = await helper("otp", { phone, code });
    if (!set.ok) return { ok: false, why: `the mock SMS inbox: ${set.reason ?? set.error}` };
    await page.fill("[data-testid=login-code]", code);
    await page.click("[data-testid=login-submit]");
    const inside = await page.waitForURL((u) => !u.pathname.includes("/account/login"), { timeout: 20_000 }).then(() => true).catch(() => false);
    if (!inside) return { ok: false, why: `signed in did not happen: ${(await page.locator("[data-testid=login-error]").innerText().catch(() => "no message")).slice(0, 120)}` };
    return { ok: true, notice };
  }

  let staff = null;
  /** The check account's page (desktop), signed in once; null with the reason when it cannot sign in. */
  async function staffPage() {
    if (staff) return staff;
    const page = await newPage(screens["desktop-1366"] ?? cfg.screens[cfg.screens.length - 1], {});
    try {
      await signIn(page, base, o.creds);
      staff = { page };
    } catch (e) {
      staff = { page: null, why: errText(e) };
    }
    return staff;
  }

  try {
    // ============================================================================================ before ordering
    if (want.has("before")) {
      for (const scr of cfg.screens) {
        for (const lang of cfg.langs) {
          const m = { scenario: "before", screen: scr.id, lang };
          const page = await newPage(scr, { lang });
          const interactive = cfg.interactive.some((x) => x.screen === scr.id && x.lang === lang);
          await step({ ...m, id: "landing-ad", title: "Lands from an ad link (UTM tags kept)" }, async () => {
            const v = await visit(page, L.withUtm(L.inLang(lang, "/"), cfg.utm), { scr, lang, links: interactive });
            const kept = await page.evaluate((campaign) => {
              const all = [document.cookie, ...Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`), ...Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`)].join(" ");
              return all.includes(campaign) || /(^|;\s*)_fbc=/.test(document.cookie);
            }, cfg.utm.utm_campaign);
            st.products ??= (await page.locator(".pcard-w a[href]").count()) > 0;
            if (v.problems.length) return { ...fromPage(v), page };
            if (!kept) return { status: "FAIL", ms: v.ms, page, reason: "the ad link's tags are not kept: no cookie or storage holds the campaign, and no _fbc is made from fbclid, so the order cannot say which ad brought him", where: "apps/web/src/lib/tracking/model.ts:72 only reads _fbc; nothing writes Order.utmSource/utmCampaign (packages/orders/src/export.ts:59 exports them)" };
            return { status: "PASS", ms: v.ms };
          });
          for (const app of cfg.inApp.filter((x) => x.screen === scr.id)) {
            await step({ ...m, id: app.id, title: `Opens in the ${app.id.replace("-in-app", "")} in-app browser` }, async () => {
              const p2 = await newPage(scr, { ua: app.ua, lang });
              const v = await visit(p2, L.withUtm(L.inLang(lang, "/"), cfg.utm), { scr, lang });
              const bag = await visit(p2, L.inLang(lang, "/bag"), { scr, lang });
              const cookies = await p2.evaluate(() => navigator.cookieEnabled);
              const problems = [...v.problems, ...bag.problems, ...(cookies ? [] : ["cookies are off in this browser: the bag would not be kept"])];
              return { status: problems.length ? "FAIL" : "PASS", reason: problems[0] ?? "", problems: problems.slice(1), ms: v.ms, page: p2 };
            });
          }
          for (const q of cfg.search) {
            await step({ ...m, id: `search-${q.id}`, title: `Searches (${q.id}: "${q.q}")` }, async () => {
              const v = await visit(page, L.inLang(lang, `/search?q=${encodeURIComponent(q.q)}`), { scr, lang });
              if (v.problems.length) return { ...fromPage(v), page };
              const found = await page.locator("[data-testid=search-grid] .pcard-w a[href]").count();
              if (!st.products) return { status: "SKIP", ms: v.ms, reason: `the page works (${v.ms} ms), but the shop has no products yet: nothing to find` };
              if (!found && q.mustFind) return { status: "FAIL", ms: v.ms, page, reason: `found nothing for "${q.q}" while the shop has products` };
              return { status: "PASS", ms: v.ms, reason: `${found} result(s)` };
            });
          }
          let productHref = null;
          await step({ ...m, id: "category-filter", title: "Opens a category and uses its filter" }, async () => {
            const home = await visit(page, L.inLang(lang, "/"), { scr, lang });
            const cat = await attr(page.locator('a[href*="/collections/"]'), "href");
            if (!cat) return { status: "SKIP", ms: home.ms, reason: "no category link on the home page" };
            const v = await visit(page, cat, { scr, lang, links: interactive });
            if (v.problems.length) return { ...fromPage(v), page };
            productHref = await firstProduct(page);
            const btn = page.locator("[data-testid=cat-filter-btn]").filter({ visible: true }).first();
            // a computer shows the filters beside the products; a phone opens them from the button
            const side = page.locator("aside").filter({ has: page.locator("input[type=checkbox], [aria-pressed], [role=switch]") }).filter({ visible: true }).first();
            let panel = side;
            if (await btn.count()) {
              await btn.click();
              panel = page.locator('[role=dialog], [aria-modal="true"]').filter({ visible: true }).first();
              const opened = await panel.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
              if (!opened) return { status: "FAIL", ms: v.ms, page, reason: "the filter button opened nothing" };
            } else if (!(await side.count())) return { status: st.products ? "FAIL" : "SKIP", ms: v.ms, page, reason: st.products ? "the category has products but no filter (no button, no side panel)" : "no products in the category yet, so no filter to use" };
            const before = page.url();
            const choice = panel.locator('label:has(input[type=checkbox]:not([disabled])), button[aria-pressed]:not([disabled]), [role=checkbox], .chip').filter({ visible: true }).first();
            if (await choice.count()) await choice.click({ timeout: 5_000 }).catch(() => {});
            const apply = panel.locator("button[type=submit], [data-testid*=apply], [data-testid=cat-show]").filter({ visible: true }).first();
            if (await apply.count()) await apply.click().catch(() => {});
            await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
            return { status: "PASS", ms: v.ms, reason: page.url() === before ? "a choice was made (the address keeps no filter)" : "filtered" };
          });
          await step({ ...m, id: "product-page", title: "Opens a product and its size guide" }, async () => {
            if (!productHref) return { status: "SKIP", reason: "the shop has no products yet" };
            const v = await visit(page, productHref, { scr, lang, links: interactive });
            if (v.problems.length) return { ...fromPage(v), page };
            const guide = page.locator("[data-testid=open-chart]").filter({ visible: true }).first();
            if (!(await guide.count())) return { status: "PASS", ms: v.ms, reason: "no size guide on this product" };
            await guide.click({ timeout: 10_000 });
            const shown = await page.locator('[role=dialog], [aria-modal="true"]').filter({ visible: true }).first().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
            if (!shown) return { status: "FAIL", ms: v.ms, page, reason: "the size guide button opened nothing" };
            await page.keyboard.press("Escape").catch(() => {});
            const closed = await page.locator('[role=dialog], [aria-modal="true"]').filter({ visible: true }).count();
            return closed ? { status: "FAIL", ms: v.ms, page, reason: "the size guide does not close with the Escape key" } : { status: "PASS", ms: v.ms, reason: "size guide opens and closes" };
          });
          await step({ ...m, id: "back-in-stock", title: "A sold-out size: \"tell me when it is back\"" }, async () => {
            if (!productHref) return { status: "SKIP", reason: "the shop has no products yet" };
            const out = page.locator(".size-pill.out").filter({ visible: true }).first();
            if (!(await out.count())) return { status: "SKIP", reason: "no sold-out size on this product" };
            if (await out.isDisabled()) return { status: "SKIP", reason: "a sold-out size cannot be pressed: the owner's \"tell me when it is back\" switch is off (pdp.size.notifyBack)" };
            await out.click({ timeout: 10_000 });
            const form = page.locator("[data-testid=pdp-notify]").filter({ visible: true }).first();
            if (!(await form.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false))) return { status: "FAIL", page, reason: "a sold-out size offers no \"tell me when it is back\"" };
            if (!interactive) return { status: "PASS", reason: "the form shows" };
            const field = form.locator("input[type=tel], input[inputmode=tel], input[inputmode=numeric], input[name=phone]").first();
            if (!(await field.count())) return { status: "FAIL", page, reason: "the form has no phone field" };
            await field.fill(phone);
            const sent = page.waitForResponse((r) => r.url().includes("/api/back-in-stock"), { timeout: 15_000 }).catch(() => null);
            await form.locator("button[type=submit], button").last().click();
            const r = await sent;
            return !r || r.status() >= 400 ? { status: "FAIL", page, reason: `"tell me" was refused (${r ? r.status() : "no answer"})` } : { status: "PASS", reason: "signup kept (the clean-up archives it)" };
          });
          if (interactive) {
            await step({ ...m, id: "wishlist", title: "Saves to the wishlist" }, async () => {
              if (!productHref) return { status: "SKIP", reason: "the shop has no products yet" };
              await visit(page, productHref, {});
              const heart = page.locator("[data-testid=pdp-wish]").filter({ visible: true }).first();
              if (!(await heart.count())) return { status: "FAIL", page, reason: "no heart on the product page" };
              await heart.click();
              await sleep(800);
              const v = await visit(page, L.inLang(lang, "/account/wishlist"), { scr, lang, expect: "[data-testid=wish-page]" });
              const items = await page.locator("[data-testid=wish-item]").count();
              if (v.problems.length) return { ...fromPage(v), page };
              return items ? { status: "PASS", ms: v.ms, reason: `${items} saved` } : { status: "FAIL", ms: v.ms, page, reason: "the heart was pressed but the wishlist is empty" };
            });
            await step({ ...m, id: "bag", title: "Puts a size in the bag" }, async () => {
              if (!productHref) return { status: "SKIP", reason: "the shop has no products yet" };
              await visit(page, productHref, {});
              const size = page.locator(".size-pill:not(.out):not(.gone)").filter({ visible: true }).first();
              if (!(await size.count())) return { status: "SKIP", page, reason: "every size of this product is sold out" };
              await size.click();
              await page.locator("[data-testid=add-to-bag], [data-testid=bar-add], [data-testid=dkb-add]").filter({ visible: true }).first().click();
              await sleep(1200);
              const v = await visit(page, L.inLang(lang, "/bag"), { scr, lang, expect: "[data-testid=bag-page]", links: true });
              const lines = await page.locator("[data-testid=bag-line]").count();
              if (v.problems.length) return { ...fromPage(v), page };
              return lines ? { status: "PASS", ms: v.ms, reason: `${lines} line(s)` } : { status: "FAIL", ms: v.ms, page, reason: "added, but the bag is empty" };
            });
            await step({ ...m, id: "abandoned-checkout", title: "Starts the checkout and leaves (what the shop keeps)" }, async () => {
              const v = await visit(page, L.inLang(lang, "/checkout"), { scr, lang });
              if (v.problems.length) return { ...fromPage(v), page };
              if (!(await page.locator("#co-phone, input[name=phone]").count())) return { status: "SKIP", ms: v.ms, reason: "the bag is empty, so the checkout has no form (no products yet)" };
              const draft = page.waitForResponse((r) => r.url().includes("/api/checkout/draft"), { timeout: 15_000 }).catch(() => null);
              await page.fill("#co-name, input[name=name]", L.gateLabel("abandoned", run));
              await page.fill("#co-phone, input[name=phone]", phone);
              await page.locator("#co-address, textarea[name=address]").first().click().catch(() => {});
              const r = await draft;
              const j = r ? await r.json().catch(() => ({})) : null;
              if (!r) return { status: "SKIP", ms: v.ms, reason: "the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up" };
              if (j?.kept === false) return { status: "SKIP", ms: v.ms, reason: "the shop answered that it keeps no draft (the owner's follow-up switch is off)" };
              return { status: "PASS", ms: v.ms, reason: "what he typed is kept for the team's follow-up; any message waits for his consent and the owner's timer (checked after ordering)" };
            });
            await step({ ...m, id: "leaves-and-returns", title: "Leaves without ordering and comes back (the bag waits)" }, async () => {
              const state = await page.context().storageState();
              const p2 = await newPage(scr, { state, lang });
              const v = await visit(p2, L.inLang(lang, "/bag"), { scr, lang });
              const lines = await p2.locator("[data-testid=bag-line]").count();
              if (v.problems.length) return { ...fromPage(v), page: p2 };
              if (!st.products) return { status: "SKIP", ms: v.ms, reason: "nothing was in the bag (no products yet)" };
              return lines ? { status: "PASS", ms: v.ms, reason: "the bag still holds his line" } : { status: "FAIL", ms: v.ms, page: p2, reason: "coming back, the bag is empty" };
            });
          }
          await page.context().close().catch(() => {});
        }
      }
    }

    // ================================================================================================== ordering
    const oscr = screens[cfg.order.screen];
    const olang = cfg.order.lang;
    let cust = null;
    if (want.has("order") || want.has("account") || want.has("support") || want.has("after")) {
      const m = { scenario: "order", screen: oscr.id, lang: olang };
      cust = await newPage(oscr, { lang: olang });
      if (want.has("order")) {
        await step({ ...m, id: "guest-order", title: "Places one order as a guest (cash on delivery)" }, async () => {
          await visit(cust, L.inLang(olang, "/"), {});
          const href = await firstProduct(cust);
          if (!href) return { status: "SKIP", reason: "the shop has no products yet: the order and every step that needs it wait until the owner adds one" };
          await visit(cust, href, {});
          const size = cust.locator(".size-pill:not(.out):not(.gone)").filter({ visible: true }).first();
          if (!(await size.count())) return { status: "SKIP", page: cust, reason: "the first product has no size in stock" };
          await size.click();
          await cust.locator("[data-testid=add-to-bag], [data-testid=bar-add]").filter({ visible: true }).first().click();
          await sleep(1200);
          const v = await visit(cust, L.inLang(olang, "/checkout"), { scr: oscr, lang: olang });
          if (v.problems.length) return { ...fromPage(v), page: cust };
          await cust.fill("#co-name, input[name=name]", name);
          await cust.fill("#co-phone, input[name=phone]", phone);
          await cust.locator("#co-address, textarea[name=address]").first().fill(cfg.order.address);
          await cust.locator("#co-address, textarea[name=address]").first().blur();
          await sleep(2500);
          const pick = cust.locator("[data-testid=co-zone-pick] button, [data-testid=co-zone-pick] [role=option], [data-testid=co-zone-pick] li").filter({ visible: true }).first();
          if (await pick.count()) {
            await pick.click().catch(() => {});
            await sleep(1500);
          }
          // cash on delivery when the shop offers it here (most BD orders); otherwise the first way to pay, on its mock
          const cod = cust.locator("[data-testid=co-po-cod] .co-po-hd").filter({ visible: true }).first();
          const byCod = (await cod.count()) > 0;
          if (byCod && (await cod.getAttribute("aria-pressed")) !== "true") await cod.click();
          await sleep(800);
          const placed = cust.waitForResponse((r) => r.url().includes("/api/checkout/orders") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
          const t0 = Date.now();
          const confirm = cust.locator("[data-testid=co-confirm]").filter({ visible: true }).first();
          if (await confirm.isDisabled()) return { status: "FAIL", page: cust, reason: `the confirm button stays off: ${(await cust.locator("[data-testid^=co-ask]").first().innerText().catch(() => "nothing says why")).slice(0, 120)}` };
          await confirm.click();
          const r = await placed;
          if (!r) return { status: "FAIL", page: cust, reason: `the order was not sent: ${(await cust.locator("[role=alert]").first().innerText().catch(() => "the confirm button did nothing")).slice(0, 120)}` };
          const j = await r.json().catch(() => ({}));
          if (r.status() >= 400) return { status: "FAIL", page: cust, reason: `the shop refused the order (${r.status()} ${j.error ?? ""})` };
          await cust.waitForURL((u) => /\/checkout\/(thanks|pay)\//.test(u.pathname), { timeout: 30_000 });
          st.number = decodeURIComponent(new URL(cust.url()).pathname.split("/").pop() ?? "");
          if (/\/checkout\/pay\//.test(cust.url())) {
            if (byCod) return { status: "FAIL", ms: Date.now() - t0, page: cust, reason: "a cash-on-delivery order was sent to the payment page" };
            // no cash on delivery here: the practice gateway's approve (never a real one: the guard checked every provider)
            const approve = cust.locator("[data-testid=co-pay-approve]").filter({ visible: true }).first();
            if (!(await approve.count())) return { status: "FAIL", ms: Date.now() - t0, page: cust, reason: "the payment page is not the practice gateway's (no approve button): stopped before any real payment" };
            await approve.click();
            await cust.waitForURL((u) => /\/checkout\/thanks\//.test(u.pathname), { timeout: 30_000 });
          }
          return { status: "PASS", ms: Date.now() - t0, reason: `order ${st.number}${byCod ? " (cash on delivery)" : " (prepaid on the practice gateway: no cash on delivery offered here)"}` };
        });
        await step({ ...m, id: "thanks-page", title: "Sees the thank-you page with his order" }, async () => {
          if (!st.number) return { status: "SKIP", reason: "no order was placed" };
          const v = await visit(cust, L.inLang(olang, `/checkout/thanks/${encodeURIComponent(st.number)}`), { scr: oscr, lang: olang, expect: "[data-testid=ty-page]", links: true });
          const shown = await cust.locator("[data-testid=ty-id]").innerText().catch(() => "");
          if (!L.toAsciiDigits(shown).includes(st.number)) v.problems.push("the order number is not on the thank-you page");
          st.factsAtOrder = await helper("facts", { number: st.number });
          return { ...fromPage(v), page: cust };
        });
      }
      if (!st.number) {
        // no order made him a customer: the account and support still need someone to sign in as
        const made = await helper("customer", { phone, name });
        if (!made.ok) log(`gate customer: ${made.error ?? made.reason}`);
      }
      await step({ ...m, id: "otp-sign-in", title: "The same phone signs in with the SMS code (mock)" }, async () => {
        const t0 = Date.now();
        const r = await otpSignIn(cust, olang);
        if (!r.ok) return { status: "FAIL", page: cust, reason: r.why };
        st.signedIn = await cust.context().storageState();
        return { status: "PASS", ms: Date.now() - t0, reason: r.notice ? "signed in; the page says the SMS is a practice one" : "signed in" };
      });
      if (want.has("order")) {
        await step({ ...m, id: "guest-order-in-account", title: "The guest order shows in his account" }, async () => {
          if (!st.number) return { status: "SKIP", reason: "no order was placed" };
          if (!st.signedIn) return { status: "SKIP", reason: "he could not sign in" };
          const v = await visit(cust, L.inLang(olang, "/account/orders"), { scr: oscr, lang: olang });
          const text = L.toAsciiDigits(await cust.locator("main").innerText().catch(() => ""));
          if (!text.includes(st.number)) v.problems.unshift(`order ${st.number} is not in My orders`);
          return { ...fromPage(v), page: cust };
        });
      }
    }

    // ============================================================================================ his account
    if (want.has("account")) {
      const ready = !!st.signedIn;
      for (const scr of cfg.screens) {
        for (const lang of cfg.langs) {
          const m = { scenario: "account", screen: scr.id, lang };
          if (!ready) {
            rows.push(L.row({ ...m, id: "pages", title: "Every page of his account", status: "SKIP", reason: "he could not sign in" }));
            continue;
          }
          const page = await newPage(scr, { state: st.signedIn, lang });
          const pages = [...cfg.accountPages, ...(st.number ? [{ id: "order-detail", path: `/account/orders/${encodeURIComponent(st.number)}`, expect: "[data-testid=order-page]" }, { id: "invoice", path: `/account/orders/${encodeURIComponent(st.number)}/invoice`, expect: "[data-testid=invoice-page]" }] : [])];
          for (const p of pages) {
            await step({ ...m, id: `page-${p.id}`, title: `Opens ${p.path.replace(st.number ?? "#", "<order>")}` }, async () => {
              const v = await visit(page, L.inLang(lang, p.path), { scr, lang, expect: p.expect, links: true });
              if (v.at.includes("/account/login")) v.problems.unshift("sent to the sign-in page while signed in");
              return { ...fromPage(v), page };
            });
          }
          await page.context().close().catch(() => {});
        }
      }
      // every option once, on the order's phone and language
      const m = { scenario: "account", screen: oscr.id, lang: olang };
      const page = ready ? await newPage(oscr, { state: st.signedIn, lang: olang }) : null;
      const needOrder = (fn) => async () => (!ready ? { status: "SKIP", reason: "he could not sign in" } : !st.number ? { status: "SKIP", reason: "no order (the shop has no products yet)" } : fn());
      const orderPath = () => L.inLang(olang, `/account/orders/${encodeURIComponent(st.number)}`);
      await step({ ...m, id: "order-status", title: "Order detail: live status and tracking link" }, needOrder(async () => {
        const v = await visit(page, orderPath(), { scr: oscr, lang: olang, expect: "[data-testid=order-page]" });
        const life = await page.locator("[data-testid=order-life]").count();
        const track = await page.locator("[data-testid=order-track] a[href], a[data-testid=order-track], [data-testid=order-courier] a[href]").count();
        if (!life) v.problems.push("no status line (order-life) on the order page");
        return { ...fromPage(v), page, reason: v.problems[0] ?? (track ? "status and tracking link shown" : "status shown; no tracking link until a courier has the parcel") };
      }));
      await step({ ...m, id: "invoice-download", title: "Downloads the invoice" }, needOrder(async () => {
        const t0 = Date.now();
        const r = await page.request.get(`${base}${L.inLang(olang, `/account/orders/${encodeURIComponent(st.number)}/invoice/file`)}`);
        const type = r.headers()["content-type"] ?? "";
        const size = (await r.body()).length;
        if (r.status() !== 200) return { status: "FAIL", ms: Date.now() - t0, reason: `the invoice file answered ${r.status()}` };
        if (size < 500) return { status: "FAIL", ms: Date.now() - t0, reason: `the invoice file is almost empty (${size} bytes)` };
        return { status: "PASS", ms: Date.now() - t0, reason: `${type.split(";")[0]}, ${Math.round(size / 1024)} KB` };
      }));
      await step({ ...m, id: "cancel-window", title: "Cancels within the window" }, needOrder(async () => {
        await visit(page, orderPath(), {});
        const s = await call(page, "/api/account/cancel-state", "POST", { number: st.number, lang: olang });
        const mode = s.json?.mode ?? "?";
        const button = await page.locator('[data-testid*=cancel], button:has-text("Cancel"), button:has-text("বাতিল")').filter({ visible: true }).count();
        if ((mode === "tap" || mode === "request") && !button)
          return { status: "FAIL", page, reason: `the shop would let him cancel now (${mode}), but the order page has no cancel button`, where: "no page calls POST /api/account/cancel (apps/web/src/lib/shop/account-api.ts:11, :155); apps/web/src/components/shop/account/OrderPage.tsx has no cancel control" };
        if (mode === "none") return { status: "SKIP", reason: "the owner's cancel window is closed for this order (or off)" };
        return { status: "PASS", reason: `cancel offered (${mode})` };
      }));
      await step({ ...m, id: "deliver-on-mocks", title: "The order is moved to delivered on the mocks" }, needOrder(async () => {
        const t0 = Date.now();
        const r = await helper("deliver", { number: st.number });
        st.delivered = r.ok === true;
        if (r.needsPerson) return { status: "SKIP", ms: Date.now() - t0, reason: `moved to ${r.status} on the mocks (${(r.done ?? []).join(" → ")}); then ${r.needsPerson}, so the steps that need a delivered order wait for a person` };
        return r.ok ? { status: "PASS", ms: Date.now() - t0, reason: (r.done ?? []).join(" → ") } : { status: "FAIL", ms: Date.now() - t0, reason: `could not move it on: ${r.error ?? r.status}` };
      }));
      await step({ ...m, id: "tracking-after-delivery", title: "His page says delivered" }, needOrder(async () => {
        if (!st.delivered) return { status: "SKIP", reason: "needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered" };
        const v = await visit(page, orderPath(), { scr: oscr, lang: olang, expect: "[data-testid=order-life]" });
        const text = await page.locator("[data-testid=order-life], [data-testid=acc-status]").first().innerText().catch(() => "");
        if (!/deliver|পৌঁছ|ডেলিভার/i.test(text)) v.problems.push(`the status line does not say delivered ("${text.slice(0, 60)}")`);
        return { ...fromPage(v), page };
      }));
      await step({ ...m, id: "review", title: "Writes the review after delivery" }, needOrder(async () => {
        if (!st.delivered) return { status: "SKIP", reason: "needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered" };
        await visit(page, orderPath(), {});
        const open = page.locator("[data-testid=order-review-open]").filter({ visible: true }).first();
        if (!(await open.count())) return { status: "FAIL", page, reason: "a delivered order offers no review" };
        await open.click();
        await page.locator("[data-testid=order-review-star-5]").first().click();
        await page.locator("[data-testid=order-review-form] textarea").first().fill(`${L.gateLabel("review", run)} — please ignore`);
        await page.locator("[data-testid=order-review-submit]").first().click();
        const sent = await page.locator("[data-testid=order-review-sent], [data-testid=order-review-state]").first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
        return sent ? { status: "PASS", reason: "sent (the clean-up archives it)" } : { status: "FAIL", page, reason: "the review was not taken" };
      }));
      await step({ ...m, id: "exchange", title: "Asks for a size exchange or a return" }, needOrder(async () => {
        if (!st.delivered) return { status: "SKIP", reason: "needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered" };
        await visit(page, orderPath(), {});
        const btn = page.locator("[data-testid=order-exchange-btn], [data-testid=order-line-exchange]").filter({ visible: true }).first();
        if (!(await btn.count())) return { status: "FAIL", page, reason: "a delivered order offers no exchange or return (or the owner's exchange switch is off)" };
        const v = await visit(page, L.inLang(olang, `/account/orders/${encodeURIComponent(st.number)}/exchange`), { scr: oscr, lang: olang, expect: "[data-testid=exchange-page]" });
        const options = await page.locator("[data-testid=exc-option], [data-testid=exc-line]").count();
        if (!options) v.problems.push("the exchange page offers nothing to choose");
        return { ...fromPage(v), page, reason: v.problems[0] ?? "walked to the choice; not sent (it would open a real case for staff)" };
      }));
      await step({ ...m, id: "reorder", title: "Orders the same again" }, needOrder(async () => {
        await visit(page, orderPath(), {});
        const n = await page.locator('[data-testid*=reorder], [data-testid*=again], button:has-text("again"), button:has-text("আবার")').filter({ visible: true }).count();
        return n ? { status: "PASS" } : { status: "FAIL", page, reason: "no \"order again\" on his order", where: "apps/web/src/components/shop/account/OrderPage.tsx (no reorder control)" };
      }));
      const prof = L.inLang(olang, "/account/profile");
      await step({ ...m, id: "addresses", title: "Adds and edits an address, sets the default" }, async () => {
        if (!ready) return { status: "SKIP", reason: "he could not sign in" };
        const v = await visit(page, prof, { scr: oscr, lang: olang, expect: "[data-testid=acc-addrs]" });
        if (v.problems.length) return { ...fromPage(v), page };
        const line = L.gateLabel("address", run);
        await page.click("[data-testid=acc-addr-add]");
        await page.locator("[data-testid=acc-addrs] textarea").last().fill(line);
        await page.locator("[data-testid=acc-details] button[type=submit]").first().click();
        await sleep(1500);
        await visit(page, prof, {});
        const kept = await page.locator("[data-testid=acc-addrs] textarea").evaluateAll((ts, want) => ts.some((t) => t.value === want), line);
        if (!kept) return { status: "FAIL", page, reason: "a new address was saved but is not there after a reload" };
        await page.locator("[data-testid=acc-addrs] textarea").last().fill(`${line} edited`);
        await page.locator("[data-testid=acc-details] button[type=submit]").first().click();
        await sleep(1500);
        await visit(page, prof, {});
        const edited = await page.locator("[data-testid=acc-addrs] textarea").evaluateAll((ts, want) => ts.some((t) => t.value === want), `${line} edited`);
        if (!edited) return { status: "FAIL", page, reason: "an edited address did not stay" };
        const def = await page.locator('[data-testid=acc-addrs] [data-testid*=default], [data-testid=acc-addrs] :text-matches("default|ডিফল্ট|প্রধান", "i")').count();
        return def ? { status: "PASS", ms: v.ms } : { status: "FAIL", ms: v.ms, page, reason: "add and edit work, but there is no way to choose the default address", where: "apps/web/src/components/shop/account/ProfileForms.tsx:92 (the list has no default)" };
      });
      await step({ ...m, id: "profile", title: "Changes his name and his phone" }, async () => {
        if (!ready) return { status: "SKIP", reason: "he could not sign in" };
        await visit(page, prof, {});
        await page.fill("#pf-name", `${name} edited`);
        await page.locator("[data-testid=acc-details] button[type=submit]").first().click();
        await sleep(1500);
        await visit(page, prof, {});
        const now = await page.inputValue("#pf-name").catch(() => "");
        if (now !== `${name} edited`) return { status: "FAIL", page, reason: "the new name did not stay" };
        const ro = await page.locator("#pf-phone").evaluate((e) => e.readOnly || e.disabled).catch(() => true);
        return ro ? { status: "FAIL", page, reason: "the name changes, but the phone cannot be changed from the account (read-only, no verified change)", where: "apps/web/src/components/shop/account/ProfileForms.tsx:87" } : { status: "PASS" };
      });
      await step({ ...m, id: "consent", title: "Turns SMS and WhatsApp offers on and off" }, async () => {
        if (!ready) return { status: "SKIP", reason: "he could not sign in" };
        await visit(page, prof, {});
        const problems = [];
        for (const k of ["sms", "whatsapp"]) {
          const sw = page.locator(`[data-testid=acc-cons-${k}] button.switch`).first();
          if (!(await sw.count())) {
            problems.push(`no ${k} switch`);
            continue;
          }
          const before = await sw.getAttribute("aria-pressed");
          const saved = page.waitForResponse((r) => r.url().endsWith("/api/account/consent"), { timeout: 10_000 }).catch(() => null);
          await sw.click();
          const r = await saved;
          if (!r || r.status() !== 200) problems.push(`the ${k} switch did not save (${r ? r.status() : "no answer"})`);
          else if ((await sw.getAttribute("aria-pressed")) === before) problems.push(`the ${k} switch did not move`);
        }
        const f = await helper("facts", { phone });
        if (f.ok && f.customer && (f.customer.sms === null || f.customer.whatsapp === null)) problems.push("the choice was not stored on him");
        return problems.length ? { status: "FAIL", page, reason: problems[0], problems: problems.slice(1) } : { status: "PASS", reason: "both saved and stored" };
      });
      await step({ ...m, id: "privacy-request", title: "Asks for his data or its erasure" }, async () => {
        if (!ready) return { status: "SKIP", reason: "he could not sign in" };
        await visit(page, prof, {});
        const own = await page.locator('main [data-testid*=privacy], main [data-testid*=erase], main [data-testid*=data-request], main a:text-matches("my data|delete my|erase|আমার তথ্য|অ্যাকাউন্ট মুছ", "i"), main button:text-matches("my data|delete my|erase|আমার তথ্য|অ্যাকাউন্ট মুছ", "i")').count();
        if (own) return { status: "PASS" };
        const help = await visit(page, L.inLang(olang, "/help/privacy"), { scr: oscr, lang: olang });
        const form = await page.locator("main form").count();
        return form ? { status: "PASS", reason: "on the privacy page" } : { status: "FAIL", ms: help.ms, page, reason: "neither his account nor the privacy page lets him ask for his data or its erasure (staff have the requests screen)", where: "apps/web/src/components/admin/settings/PrivacyRequests.tsx exists; nothing on the shop side" };
      });
      await step({ ...m, id: "sign-out-in", title: "Signs out and signs in again" }, async () => {
        if (!ready) return { status: "SKIP", reason: "he could not sign in" };
        await visit(page, L.inLang(olang, "/account"), {});
        const out = page.locator("[data-testid=account-logout]").filter({ visible: true }).first();
        if (!(await out.count())) return { status: "FAIL", page, reason: "no sign-out button" };
        await out.click();
        await page.waitForURL((u) => !u.pathname.endsWith("/account"), { timeout: 15_000 }).catch(() => {});
        await visit(page, L.inLang(olang, "/account/orders"), {});
        const prompt = await page.locator("[data-testid=account-prompt], [data-testid=login-page]").count();
        if (!prompt) return { status: "FAIL", page, reason: "after signing out, My orders still shows his orders" };
        const again = await otpSignIn(page, olang);
        return again.ok ? { status: "PASS" } : { status: "FAIL", page, reason: `signing in again: ${again.why}` };
      });
    }

    // ================================================================================================= support
    if (want.has("support")) {
      const m = { scenario: "support", screen: oscr.id, lang: olang };
      const page = await newPage(oscr, { state: st.signedIn ?? undefined, lang: olang });
      await visit(page, L.inLang(olang, "/"), {});
      await step({ ...m, id: "live-chat", title: "Writes in the shop's chat" }, async () => {
        const open = page.locator("[data-testid=live-chat-open]").filter({ visible: true }).first();
        if (!(await open.count())) return { status: "SKIP", reason: "the live chat is switched off (support.liveChat, off as shipped)" };
        await open.click();
        await page.fill("[data-testid=live-chat-text]", `${L.gateLabel("chat", run)}: where is my order? ${phone}`);
        const sent = page.waitForResponse((r) => r.url().includes("/api/shop/support-chat") && r.request().method() === "POST", { timeout: 15_000 }).catch(() => null);
        await page.click("[data-testid=live-chat-send]");
        const r = await sent;
        return r && r.status() < 400 ? { status: "PASS" } : { status: "FAIL", page, reason: `the chat did not take the message (${r ? r.status() : "no answer"})` };
      });
      await step({ ...m, id: "whatsapp-button", title: "Finds the WhatsApp button" }, async () => {
        const href = await attr(page.locator('#wa-fab, [data-testid=hdr-wa], a[href*="wa.me/"]'), "href");
        if (!href) return { status: "SKIP", reason: "the owner keeps the WhatsApp button off, or has not typed the number (shell.fab, contact.whatsapp)" };
        return /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href) ? { status: "PASS", reason: "opens WhatsApp (not followed: a real chat)" } : { status: "FAIL", page, reason: `the WhatsApp button goes to ${href.slice(0, 60)}` };
      });
      await step({ ...m, id: "messenger-button", title: "Finds a Messenger button" }, async () => {
        await visit(page, L.inLang(olang, "/help/contact"), {});
        const n = await page.locator('a[href*="m.me/"], a[href*="messenger.com"]').count();
        return n ? { status: "PASS" } : { status: "FAIL", page, reason: "no Messenger link on the shop, though most orders come from Facebook (the inbox can take Messenger, PR 426)" };
      });
      await step({ ...m, id: "contact-form", title: "Uses the contact form" }, async () => {
        const v = await visit(page, L.inLang(olang, "/help/contact"), { scr: oscr, lang: olang, links: true });
        if (v.problems.length) return { ...fromPage(v), page };
        const form = await page.locator("main form textarea, main form input[type=text]").count();
        return form ? { status: "PASS", ms: v.ms } : { status: "FAIL", ms: v.ms, page, reason: "the contact page lists ways to reach the shop but has no form, so nothing lands in the support inbox from it" };
      });
      // staff, as the read-only check account
      const sm = { scenario: "support", screen: "desktop-1366", lang: "en" };
      const s = await staffPage();
      const facts = await helper("facts", st.number ? { number: st.number } : { phone });
      st.customerId = facts.customer?.id ?? null;
      const staffOk = () => (!s.page ? { status: "FAIL", reason: `the check account could not sign in: ${s.why}` } : null);
      await step({ ...sm, id: "inbox", title: "Opens the support inbox" }, async () => staffOk() ?? fromPage(await visit(s.page, "/admin/support", { links: true }), { page: s.page }));
      await step({ ...sm, id: "find-by-phone", title: "Finds him by his number in any format (01…, +880…, Bengali digits)" }, async () => {
        if (staffOk()) return staffOk();
        if (!st.customerId) return { status: "SKIP", reason: "no customer to find" };
        const miss = [];
        for (const f of L.phoneForms(phone)) {
          const r = await call(s.page, `/api/admin/customers/by-phone?phone=${encodeURIComponent(f.value)}`);
          const id = r.json?.match?.id ?? r.json?.match?.customer?.id ?? r.json?.match?.personId ?? null;
          if (r.status !== 200 || !r.json?.match) miss.push(`${f.id} (${r.status})`);
          else if (id && id !== st.customerId && !JSON.stringify(r.json.match).includes(st.customerId)) miss.push(`${f.id} found someone else`);
        }
        return miss.length ? { status: "FAIL", reason: `not found by: ${miss.join(", ")}` } : { status: "PASS", reason: "every format finds him" };
      });
      await step({ ...sm, id: "inbox-search-by-phone", title: "Finds his conversation by his number in any format" }, async () => {
        if (staffOk()) return staffOk();
        const any = await call(s.page, `/api/admin/support?view=all&q=${encodeURIComponent(phone)}`);
        if (any.status !== 200) return { status: "FAIL", reason: `the inbox search answered ${any.status}` };
        st.conversation = any.json?.rows?.[0]?.id ?? null;
        if (!st.conversation) return { status: "SKIP", reason: "he has no conversation (the chat is off and no channel is connected): nothing to find; by reading the code, a number in Bengali digits is never searched as a number", where: "packages/support/src/inbox.ts:85 strips non-ASCII digits (\\D) before the phone search" };
        const miss = [];
        for (const f of L.phoneForms(phone)) {
          const r = await call(s.page, `/api/admin/support?view=all&q=${encodeURIComponent(f.value)}`);
          if (!(r.json?.rows ?? []).some((x) => x.id === st.conversation)) miss.push(f.id);
        }
        return miss.length ? { status: "FAIL", reason: `his conversation is not found by: ${miss.join(", ")}`, where: "packages/support/src/inbox.ts:85" } : { status: "PASS" };
      });
      await step({ ...sm, id: "context-panel", title: "Sees his orders, status and parcel beside the conversation" }, async () => {
        if (staffOk()) return staffOk();
        if (!st.conversation) return { status: "SKIP", reason: "no conversation to open; the order side panel is PR 428, not built yet (packages/support/src/inbox.ts:5)" };
        const v = await visit(s.page, `/admin/support/c/${st.conversation}`, {});
        const txt = await s.page.locator("main").innerText().catch(() => "");
        if (st.number && !txt.includes(st.number)) v.problems.push("his order is not shown beside the conversation (PR 428 not built)");
        return { ...fromPage(v), page: s.page };
      });
      await step({ ...sm, id: "trace-orders", title: "Traces his order by his number (any format) and opens it" }, async () => {
        if (staffOk()) return staffOk();
        if (!st.number) return { status: "SKIP", reason: "no order" };
        const miss = [];
        let id = null;
        for (const f of L.phoneForms(phone)) {
          const r = await call(s.page, `/api/admin/orders?view=all&q=${encodeURIComponent(f.value)}`);
          const hit = (r.json?.rows ?? r.json?.orders ?? []).find((x) => x.number === st.number);
          if (!hit) miss.push(`${f.id} (${r.status})`);
          id ??= hit?.id ?? null;
        }
        if (!id) return { status: "FAIL", reason: `his order is not found by: ${miss.join(", ")}` };
        const v = await visit(s.page, `/admin/orders/${id}`, {});
        const detail = await call(s.page, `/api/admin/orders/${id}`);
        // OrderDetail.timeline (packages/orders/src/list.ts:250): one row per status change, note or message.
        const timeline = detail.json?.order?.timeline ?? detail.json?.timeline ?? [];
        const events = Array.isArray(timeline) ? timeline.length : 0;
        if (miss.length) v.problems.unshift(`not found by: ${miss.join(", ")}`);
        if (!events) v.problems.push("the order shows no history");
        return { ...fromPage(v), page: s.page, reason: v.problems[0] ?? `found and opened; ${events} history line(s)` };
      });
      await step({ ...sm, id: "customer-page", title: "Opens his customer page (orders and support tabs)" }, async () => {
        if (staffOk()) return staffOk();
        if (!st.customerId) return { status: "SKIP", reason: "no customer" };
        const v = await visit(s.page, `/admin/customers/${st.customerId}`, { links: true });
        const sup = await call(s.page, `/api/admin/customers/${st.customerId}/support`);
        if (sup.status !== 200) v.problems.push(`his support tab answered ${sup.status}`);
        return { ...fromPage(v), page: s.page };
      });
      await step({ ...sm, id: "product-card", title: "Sends him a product card from the inbox" }, async () => {
        if (staffOk()) return staffOk();
        if (!st.conversation) return { status: "SKIP", reason: "no conversation; sending a product card from the inbox is not built yet (S22)" };
        await visit(s.page, `/admin/support/c/${st.conversation}`, {});
        const n = await s.page.locator('[data-testid*=product-card], [data-testid*=send-product], button:text-matches("product", "i")').count();
        return n ? { status: "PASS", reason: "the control is there (read-only account: not sent)" } : { status: "SKIP", reason: "sending a product card is not built yet (S22)" };
      });
    }

    // ============================================================================================= after ordering
    if (want.has("after")) {
      const m = { scenario: "after", screen: null, lang: olang };
      const s = await staffPage();
      await step({ ...m, id: "admin-sees-order", title: "The admin sees the order at once" }, async () => {
        if (!st.number) return { status: "SKIP", reason: "no order (the shop has no products yet)" };
        if (!s.page) return { status: "FAIL", reason: `the check account could not sign in: ${s.why}` };
        const t0 = Date.now();
        const r = await call(s.page, `/api/admin/orders?view=all&q=${encodeURIComponent(st.number)}`);
        const hit = (r.json?.rows ?? r.json?.orders ?? []).some((x) => x.number === st.number);
        return hit ? { status: "PASS", ms: Date.now() - t0 } : { status: "FAIL", ms: Date.now() - t0, reason: `the order list does not show ${st.number} (${r.status})` };
      });
      await step({ ...m, id: "attribution", title: "The order says which ad brought him" }, async () => {
        if (!st.number) return { status: "SKIP", reason: "no order" };
        const f = await helper("facts", { number: st.number });
        const a = f.order?.attribution ?? {};
        return a.utmCampaign || a.adPlatform ? { status: "PASS" } : { status: "FAIL", reason: "the order stores no source, campaign or platform: the ad's sales cannot be counted", where: "Order.utmSource/utmCampaign/adPlatform are never written (only read in packages/orders/src/export.ts:59)" };
      });
      // the confirmation messages, as the message engine planned and drew them (on the mocks)
      let msgs = null;
      await step({ ...m, id: "messages-planned", title: "Confirmation messages are planned (mock senders)" }, async () => {
        if (!st.number) return { status: "SKIP", reason: "no order" };
        const t0 = Date.now();
        for (let i = 0; i * cfg.waits.messagesPollSec <= cfg.waits.messagesSec; i++) {
          msgs = await helper("messages", { number: st.number });
          if ((msgs.rows ?? []).some((r) => r.status !== "QUEUED")) break;
          await sleep(cfg.waits.messagesPollSec * 1000);
        }
        const list = msgs?.rows ?? [];
        if (!msgs?.ok) return { status: "FAIL", reason: `could not read them: ${msgs?.error}` };
        if (!list.length) return { status: "FAIL", ms: Date.now() - t0, reason: `no message was planned within ${cfg.waits.messagesSec} s (is the worker running and the owner's messages switch on?)` };
        const live = list.filter((r) => r.mode && r.mode !== "MOCK");
        if (live.length) return { status: "FAIL", reason: `${live.length} message(s) went through a real provider` };
        return { status: "PASS", ms: Date.now() - t0, reason: list.map((r) => `${r.channel}/${r.step}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`).join("; ").slice(0, 300) };
      });
      const order = st.number ? (await helper("facts", { number: st.number })).order : null;
      for (const ch of ["SMS", "WHATSAPP", "EMAIL"]) {
        await step({ ...m, id: `message-${ch.toLowerCase()}`, title: `The ${ch === "EMAIL" ? "e-mail" : ch === "SMS" ? "SMS" : "WhatsApp"} message: right order, amount and language` }, async () => {
          if (!st.number || !order) return { status: "SKIP", reason: "no order" };
          const list = (msgs?.rows ?? []).filter((r) => r.channel === ch);
          if (!list.length) return { status: "SKIP", reason: `no ${ch} message for this order (the owner's journey does not use it, or no address for it)` };
          const problems = list.flatMap((r) => L.messageProblems(r, order).map((p) => `${r.step}: ${p}`));
          const drawn = list.filter((r) => r.text);
          if (problems.length) return { status: "FAIL", reason: problems[0], problems: problems.slice(1) };
          return { status: "PASS", reason: drawn.length ? `${drawn.length} drawn: "${L.redact(drawn[0].text).slice(0, 120)}"` : `planned (${list.map((r) => r.status).join(", ")}); words drawn when sent` };
        });
      }
      await step({ ...m, id: "delivered-is-sale", title: "A delivered order counts as a sale" }, async () => {
        if (!st.number) return { status: "SKIP", reason: "no order" };
        if (!st.delivered) return { status: "SKIP", reason: "needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered" };
        const f = await helper("facts", { number: st.number });
        const before = st.factsAtOrder?.customer?.lifetimeValueMinor ?? 0;
        const after = f.customer?.lifetimeValueMinor ?? 0;
        const problems = [];
        if ((f.customer?.deliveredCount ?? 0) < 1) problems.push("his delivered count did not move");
        if (after - before !== (f.order?.totalMinor ?? -1) && after !== f.order?.totalMinor) problems.push(`his sales moved by ${after - before}, the order is ${f.order?.totalMinor}`);
        if (s.page && st.customerId) {
          const c = await call(s.page, `/api/admin/customers/${st.customerId}`);
          if (c.status !== 200) problems.push(`his admin page answered ${c.status}`);
        }
        return problems.length ? { status: "FAIL", reason: problems[0], problems: problems.slice(1) } : { status: "PASS", reason: "delivered count and sales moved by the order's total" };
      });
      await step({ ...m, id: "history", title: "His history in the admin, in order (journey view)" }, async () => {
        if (!st.number) return { status: "SKIP", reason: "no order" };
        const f = await helper("facts", { number: st.number });
        const ev = f.events ?? [];
        const want2 = ["PLACED", ...(st.delivered ? ["DELIVERED"] : [])];
        const missing = want2.filter((x) => !ev.some((e) => e.includes(x) || e.toUpperCase().includes(x)));
        if (missing.length) return { status: "FAIL", reason: `the order's history misses ${missing.join(", ")} (${ev.join(", ").slice(0, 120)})` };
        if (!s.page || !st.customerId) return { status: "PASS", reason: `order history: ${ev.length} lines` };
        await visit(s.page, `/admin/customers/${st.customerId}`, {});
        const tab = await s.page.locator('[role=tab]:text-matches("journey|timeline|activity", "i"), a:text-matches("journey|timeline", "i")').count();
        return tab ? { status: "PASS" } : { status: "SKIP", reason: `the order's own history is right (${ev.length} lines); the customer journey view (every visit, bag and message in one line) is PR 288, not built yet` };
      });
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    rows.push(L.row({ scenario: "order", id: "stopped", title: "The run stopped", status: "FAIL", reason: e.message }));
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  return { ...L.summarise(rows), rows, number: st.number, phone };
}

async function main() {
  const env = process.env;
  const base = (env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
  const picked = L.pickScenarios(env.GATE_SCENARIOS);
  if (picked.problems.length) throw new Error(picked.problems.join("; "));
  // a run away from this machine must be the preview host itself (gate-c360.sh checked it against the settings first)
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
    const why = L.hostGuard({ base, previewHost: env.GATE_PREVIEW_HOST, extraHosts: env.GATE_EXTRA_HOSTS, mainOpen: env.GATE_MAIN_OPEN });
    if (why) throw new Error(`refused: ${why}`);
  }
  const creds = { email: env.SMOKE_EMAIL, password: env.SMOKE_PASSWORD, totpSecret: env.SMOKE_TOTP_SECRET };
  const httpCredentials = env.SMOKE_HTTP_USER ? { username: env.SMOKE_HTTP_USER, password: env.SMOKE_HTTP_PASSWORD ?? "" } : undefined;
  const out = env.GATE_OUT || null;
  if (out) mkdirSync(out, { recursive: true });
  const run = (env.GATE_RUN || new Date().toISOString().replace(/\D/g, "").slice(0, 12)).replace(/[^A-Za-z0-9-]/g, "").slice(0, 24);
  // GATE_SCREENS (by hand, e.g. android-mid): only those screens of gate-c360.json
  const cfg = JSON.parse(readFileSync(join(here, "gate-c360.json"), "utf8"));
  const only = String(env.GATE_SCREENS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (only.length) cfg.screens = cfg.screens.filter((s) => only.includes(s.id) || s.id === cfg.order.screen || s.id === "desktop-1366");
  const result = await runGate({ cfg, base, creds, httpCredentials, out, phone: env.GATE_PHONE, run, scenarios: picked.list, chromiumPath: env.CHROMIUM_PATH });
  const cleanup = env.GATE_NO_CLEANUP === "1" ? "skipped by hand" : await askHelper("cleanup", { phone: result.phone }, env).then((c) => (c.ok ? `cancelled ${c.cancelled}, archived ${c.archivedOrders} order(s), ${c.archivedReviews} review(s), ${c.archivedBackInStock} back-in-stock request(s), the customer${c.archivedCustomer ? "" : " (already)"}; nothing deleted` : `FAILED: ${c.error}`));
  const meta = { at: env.GATE_AT || new Date().toISOString(), base, sha: env.GATE_SHA || "", kind: env.GATE_KIND || "run", scenarios: picked.list, customer: L.gateLabel("customer", run), cleanup };
  if (out) {
    const { rows, ...summary } = result;
    delete summary.phone;
    writeFileSync(join(out, "result.json"), `${JSON.stringify({ ...meta, ...summary, rows }, null, 2)}\n`);
    writeFileSync(join(out, "README.md"), L.reportMarkdown(result, meta));
  }
  console.log(`gate-c360: ${result.pass} PASS, ${result.fail} FAIL, ${result.skip} SKIP; clean-up: ${cleanup}`);
  return result.ok && !cleanup.startsWith("FAILED") ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`gate-c360: FAILED — ${errText(e)}`);
      process.exit(1);
    },
  );
}
