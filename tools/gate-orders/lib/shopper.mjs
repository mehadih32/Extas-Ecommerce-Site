// PR 414 follow-up (CN-013 go-live gate phase 2) — one test shopper in a real browser: a device (screen, touch, a slower
// CPU) on a network (DevTools throttling), who opens the shop, picks a GATE TEST piece, adds it to the bag, opens the
// checkout, types his details and places the order the way a customer does — through the storefront's own buttons, never
// its API. Each step is timed: a page that opens (its whole load and its largest paint) and a press that waits for the
// shop's answer (the time to the answer, and the shop's own share of it: the answer's wait minus the network's added
// round trip). The selectors are the storefront's own test ids (apps/web/src/components/shop).
import { contextOf, deviceOf, networkOf, offline, slowFactor, throttle } from "./profiles.mjs";

const ORDERS_PATH = "/api/checkout/orders";
const BAG_LINES_PATH = "/api/bag/lines";

/** The page's largest contentful paint so far (ms from the navigation's start), or null. */
export async function lcpOf(page) {
  return page
    .evaluate(
      () =>
        new Promise((resolve) => {
          let v = null;
          try {
            new PerformanceObserver((l) => {
              const e = l.getEntries();
              if (e.length) v = e[e.length - 1].startTime;
            }).observe({ type: "largest-contentful-paint", buffered: true });
          } catch {
            /* an old browser: no paint figure */
          }
          setTimeout(() => resolve(v === null ? null : Math.round(v)), 60);
        }),
    )
    .catch(() => null);
}

/** The shop's share of a press: the wait for the answer less the round trip the throttled network adds. */
export function serverShare(timing, latencyMs) {
  if (!timing || !(timing.responseStart >= 0) || !(timing.requestStart >= 0)) return null;
  return Math.max(0, Math.round(timing.responseStart - timing.requestStart - (latencyMs ?? 0)));
}

/** A new shopper: its own browser context (cookies, bag), the device's screen and the network's throttling. */
export async function openShopper(browser, { device, network, storageState = null, httpCredentials = null, locale = "en-GB", cookies = [] }) {
  const ctx = await browser.newContext({ ...contextOf(device), ...(storageState ? { storageState } : {}), ...(httpCredentials ? { httpCredentials } : {}), locale, serviceWorkers: "block" });
  // the run's own mock-payment cookie (lib/run-grant.mjs), never one the shop set
  if (cookies.length) await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const session = await throttle(page, device, network);
  const factor = slowFactor(device, network);
  page.setDefaultTimeout(Math.min(180_000, 20_000 * factor));
  page.setDefaultNavigationTimeout(Math.min(240_000, 30_000 * factor));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message ?? e).split("\n")[0].slice(0, 200)));
  return { ctx, page, session, device, network, factor, latencyMs: networkOf(network).latencyMs, kind: deviceOf(device).kind, errors, close: () => ctx.close() };
}

/** Opens a page and times it (load event; largest paint). */
export async function timedGoto(sh, url) {
  const t0 = Date.now();
  const r = await sh.page.goto(url, { waitUntil: "load" });
  const ms = Date.now() - t0;
  return { ms, lcpMs: await lcpOf(sh.page), status: r?.status() ?? null };
}

const visible = (page, sel) => page.locator(sel.split(",").map((s) => `${s.trim()}:visible`).join(", ")).first();

/** The path of a page in the customer's language (the shop's Bengali pages live under /bn). */
export const inLang = (lang, path) => (lang === "bn" ? `/bn${path === "/" ? "" : path}` : path);

/**
 * Opens the product page and adds one piece (its colour, its size) to the bag with the page's own button. Returns the
 * page's timing, the press's timing and the bag's answer ({ok, error}).
 */
export async function addItem(sh, base, { path, colour, size }, lang = "en") {
  const page = sh.page;
  const pdp = await timedGoto(sh, `${base}${inLang(lang, path)}`);
  if (pdp.status && pdp.status >= 400) return { pdp, ok: false, error: `the product page answered ${pdp.status}` };
  // a tap that lands before the page has woken up (its script still loading on a slow phone) does nothing, as for a
  // customer: the shopper taps again, and the report counts the taps that were lost
  let lostTaps = 0;
  const sw = visible(page, `.swatch[data-c="${colour}"]`);
  if (await sw.count()) lostTaps += await tapUntil(sh, sw, page.locator(`.swatch[data-c="${colour}"][aria-checked="true"]`));
  const pill = visible(page, `.size-pill[data-s="${size}"]`);
  if (!(await pill.count())) return { pdp, ok: false, error: "the size is not on the product page" };
  if (await pill.isDisabled()) return { pdp, ok: false, error: "the size shows as sold out on the product page" };
  await waitAwake(sh, `.size-pill[data-s="${size}"]`);
  const chosen = visible(page, '[data-testid="add-to-bag"][data-variant], [data-testid="bar-add"][data-variant], [data-testid="dkb-add"][data-variant]');
  lostTaps += await tapUntil(sh, pill, chosen);
  const button = chosen;
  const answer = page.waitForResponse((r) => r.url().includes(BAG_LINES_PATH) && r.request().method() === "POST");
  const t0 = Date.now();
  await button.click();
  const res = await answer;
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => ({}));
  return { pdp, lostTaps, press: { ms, serverMs: serverShare(res.request().timing(), sh.latencyMs) }, ok: res.ok() && body.ok === true, error: body.error ?? (res.ok() ? null : `the bag answered ${res.status()}`) };
}

/**
 * Waits until the page's script has taken over `selector` (React marks the element it runs), as a customer waits for
 * a page to answer his taps. False when it did not within the time (the run then goes on and its taps say what happens).
 */
export async function waitAwake(sh, selector) {
  return sh.page
    .waitForFunction((s) => {
      const el = document.querySelector(s);
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    }, selector, { timeout: Math.min(60_000, 10_000 * (sh.factor ?? 1)) })
    .then(() => true)
    .catch(() => false);
}

/** Taps `target` until `done` shows (at most `tries` taps); the number of taps that did nothing. */
export async function tapUntil(sh, target, done, { tries = 5 } = {}) {
  const waitMs = Math.min(30_000, 3000 * (sh.factor ?? 1));
  for (let i = 0; i < tries; i++) {
    await target.click();
    const ok = await done
      .first()
      .waitFor({ state: "visible", timeout: waitMs })
      .then(() => true)
      .catch(() => false);
    if (ok) return i;
  }
  throw new Error(`a tap did nothing ${tries} times in a row (the page never woke up)`);
}

/** From the bag to the checkout with the bag's own button (or the checkout's address for a gift, `?gift=1`). */
export async function openCheckout(sh, base, lang = "en", { gift = false } = {}) {
  const page = sh.page;
  await page.goto(`${base}${inLang(lang, "/bag")}`, { waitUntil: "load" });
  const t0 = Date.now();
  const go = visible(page, gift ? '[data-testid="bag-gift"]' : 'a[data-testid="bag-checkout"]');
  if (await go.count()) await go.click();
  else await page.goto(`${base}${inLang(lang, "/checkout")}${gift ? "?gift=1" : ""}`);
  await page.locator('[data-testid="co-form"]').waitFor({ state: "visible" });
  await page.waitForLoadState("load");
  await waitAwake(sh, "#co-name");
  return { ms: Date.now() - t0, lcpMs: await lcpOf(page) };
}

/** The checkout's quantity of one line (the checkout's own + button, one press at a time). */
export async function setQuantity(sh, n) {
  const page = sh.page;
  // on a phone the lines sit in the summary panel, closed until he opens it ("Show the order")
  const panel = visible(page, '[data-testid="co-msum"]');
  if ((await panel.count()) && (await panel.getAttribute("aria-expanded")) !== "true") await tapUntil(sh, panel, page.locator('[data-testid="co-msum"][aria-expanded="true"]'));
  for (let i = 0; i < 20; i++) {
    const q = Number((await visible(page, '[data-testid="co-qty"]').innerText()).replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/\D/g, ""));
    if (q >= n) return q;
    const more = visible(page, '[data-testid="co-qty-more"]');
    if (await more.isDisabled()) return q;
    const done = page.waitForResponse((r) => r.url().includes("/api/") && r.request().method() !== "GET").catch(() => null);
    await more.click();
    await done;
    await page.waitForTimeout(300);
  }
  return null;
}

/** Types the details into the checkout's own boxes (a pasted address keeps its line breaks). */
export async function fillDetails(sh, { name, phone, address }) {
  const page = sh.page;
  await page.locator("#co-name").fill(name);
  await page.locator("#co-phone").fill(phone);
  await page.locator("#co-address").fill(address);
  await page.locator("#co-address").blur();
}

/**
 * After the address: the shop reads the place and shows the delivery charge, or asks the customer to pick the area.
 * Picks `band` when asked (else the first choice). Returns {asked, picked}.
 */
export async function pickZone(sh, band) {
  const page = sh.page;
  const shown = '[data-testid="co-zone-ask"], [data-testid="co-charge"], [data-testid="co-charge-later"], [data-testid="co-zone"], [data-testid="co-free"]';
  await page.locator(shown).first().waitFor({ state: "visible", timeout: Math.min(60_000, 8_000 * sh.factor) }).catch(() => null);
  await page.waitForTimeout(400);
  const ask = page.locator('[data-testid="co-zone-ask"]');
  if (!(await ask.isVisible().catch(() => false))) return { asked: false, picked: null };
  const want = band ? ask.locator(`[data-testid="co-zone-pick"][data-band="${band}"]`) : null;
  const pick = want && (await want.count()) ? want.first() : ask.locator('[data-testid="co-zone-pick"]').first();
  if (!(await pick.count())) return { asked: true, picked: null };
  const picked = await pick.getAttribute("data-band");
  await pick.click();
  await page.waitForTimeout(500);
  return { asked: true, picked };
}

/** Chooses how he pays: `cod` or `bkash` (a mobile wallet tile). Returns null, or why it is not offered. */
export async function choosePay(sh, pay) {
  const page = sh.page;
  const method = pay === "cod" ? "cod" : "mobile";
  const box = page.locator(`[data-testid="co-po-${method}"]`).first();
  if (!(await box.count())) return pay === "cod" ? "cash on delivery is not offered at the checkout" : "mobile wallets are not offered at the checkout";
  const head = box.locator(".co-po-hd");
  if ((await head.getAttribute("aria-pressed")) !== "true") await tapUntil(sh, head, box.locator('.co-po-hd[aria-pressed="true"]'));
  if (pay !== "cod") {
    const tiles = `[data-testid="co-po-${method}"] [data-testid="co-pay-tile"][data-v="${pay}"]`;
    const tile = visible(page, tiles);
    if (!(await tile.count())) return `${pay} is not offered at the checkout`;
    if ((await tile.getAttribute("aria-pressed")) !== "true") await tapUntil(sh, tile, page.locator(`${tiles}[aria-pressed="true"]`));
  }
  await page.waitForTimeout(300);
  return null;
}

/** The order number in a thank-you or payment page's address (/checkout/thanks/<n>, /checkout/pay/<n>), or null. */
export function numberOf(url) {
  const m = /\/checkout\/(?:thanks|pay)\/([^/?#]+)/.exec(String(url ?? ""));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Presses "Confirm order" (twice in a row with `double`) and waits for the next page (thank-you or the payment page).
 * Returns the shop's answer, the press's timing and where the browser landed.
 */
export async function submit(sh, { double = false, waitNext = true } = {}) {
  const page = sh.page;
  const answers = [];
  // recorded at once (the body is read beside it: a page that has already moved on to the thank-you or payment page may
  // no longer hand the body over, and then the page it landed on names the order)
  const onRes = (r) => {
    if (r.url().includes(ORDERS_PATH) && r.request().method() === "POST") answers.push({ status: r.status(), body: r.json().catch(() => null), timing: r.request().timing() });
  };
  page.on("response", onRes);
  const button = visible(page, '[data-testid="co-confirm"]');
  const t0 = Date.now();
  try {
    if (double) await button.dblclick({ delay: 40 });
    else await button.click();
    if (waitNext) await page.waitForURL(/\/checkout\/(thanks|pay)\//, { waitUntil: "load" });
    else await page.waitForTimeout(1500 * sh.factor);
  } catch {
    /* the answer below says what happened */
  } finally {
    await page.waitForTimeout(300);
    page.off("response", onRes);
  }
  const ms = Date.now() - t0;
  for (const a of answers) a.body = await a.body;
  const landed = numberOf(page.url());
  const unread = answers.find((a) => a.status >= 200 && a.status < 300 && !a.body);
  if (unread && landed) unread.body = { ok: true, number: landed, next: page.url().replace(/^https?:\/\/[^/]+/, ""), read: "from the page it landed on" };
  // no answer at all: say what the customer saw (the Confirm button off, the box the form points at)
  const unanswered = answers.length ? null : await page.evaluate(() => ({ off: !!document.querySelector("[data-testid=co-confirm]")?.disabled, field: document.querySelector("[aria-invalid=true]")?.id ?? null })).catch(() => null);
  const first = answers[0] ?? null;
  const placed = answers.find((a) => a.body?.ok) ?? first;
  return {
    ms,
    serverMs: first ? serverShare(first.timing, sh.latencyMs) : null,
    lcpMs: await lcpOf(page),
    answer: placed?.body ?? null,
    presses: answers.length,
    numbers: [...new Set(answers.filter((a) => a.body?.number).map((a) => a.body.number))],
    url: page.url(),
    unanswered,
  };
}

const FAILED_SHOWN = '[data-testid="co-pay-failed"], [data-testid="ty-pay"][data-pay="failed"]';
const RETRY_SHOWN = '[data-testid="co-pay-retry"], [data-testid="ty-retry"]';

/**
 * On the test payment page: `approve` or `fail` with its own buttons; `retry` with the "Try again" the customer is shown
 * after a failure (on the payment page, or on the thank-you page the failure leads to). Returns the state it reached
 * (where he is, whether the failure and a retry are shown), or a reason it could not be done.
 */
export async function payPage(sh, action) {
  const page = sh.page;
  const path = () => page.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const seen = async (sel) => visible(page, sel).isVisible().catch(() => false);
  let sel;
  if (action === "retry") {
    await visible(page, RETRY_SHOWN).waitFor({ state: "visible" }).catch(() => null);
    if (!(await seen(RETRY_SHOWN))) return { skip: `no "Try again" is shown after the failure (on ${path()})` };
    sel = (await seen('[data-testid="ty-retry"]')) ? '[data-testid="ty-retry"]' : '[data-testid="co-pay-retry"]';
  } else {
    const open = await page
      .locator('[data-testid="co-pay-page"]')
      .waitFor({ state: "visible" })
      .then(() => true)
      .catch(() => false);
    if (!open) throw new Error(`the payment page did not open for "${action}" (the browser is on ${path()})`);
    if (await seen('[data-testid="co-pay-unavailable"]')) return { skip: "the test payment page is closed (the owner's test payments are off)" };
    if (await seen('[data-testid="co-pay-start"]')) return { skip: "a payment gateway's own page would open: the test page is not shown" };
    sel = `[data-testid="co-pay-${action}"]`;
    if (!(await seen(sel))) return { skip: `the payment page shows no "${action}" button` };
  }
  await waitAwake(sh, sel);
  await visible(page, sel).click();
  // what the customer waits for: the thank-you page after a payment, the failure (with its retry) after a failed one,
  // the payment page's buttons again after "Try again"
  const settled = {
    approve: () => page.waitForURL((u) => !/\/checkout\/pay\//.test(String(u)), { waitUntil: "load" }),
    fail: () => visible(page, FAILED_SHOWN).waitFor({ state: "visible" }),
    retry: () => page.locator('[data-testid="co-pay-approve"]').waitFor({ state: "visible" }),
  }[action];
  await settled().catch(() => null);
  await page.waitForLoadState("load").catch(() => null);
  await page.waitForTimeout(300);
  return { url: page.url(), failedShown: await seen(FAILED_SHOWN), retryShown: await seen(RETRY_SHOWN) };
}

/** The customer's own cancel on his order (by this browser: a guest's order is his by the bag's cookie). */
export async function customerCancel(sh, base, number) {
  return sh.page.evaluate(
    async ({ number }) => {
      const post = async (path, body) => {
        const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
        return { status: r.status, body: await r.json().catch(() => null) };
      };
      const state = await post("/api/account/cancel-state", { number });
      const mode = state.body?.mode ?? null;
      const reason = state.body?.reasons?.[0]?.key ?? state.body?.reasons?.[0] ?? null;
      if (mode !== "tap" && mode !== "request") return { mode, done: false };
      const done = await post("/api/account/cancel", { number, reasonKey: typeof reason === "string" ? reason : reason?.key });
      return { mode, done: done.body?.ok === true, outcome: done.body?.outcome ?? null, error: done.body?.error ?? null };
    },
    { number },
  );
}

/** The network down for the next order press only: the shop gets it and answers, the browser never hears the answer. */
export async function loseNextAnswer(sh) {
  let lost = false;
  await sh.page.route(`**${ORDERS_PATH}`, async (route) => {
    if (lost) return route.continue();
    lost = true;
    try {
      await route.fetch(); // the shop places the order
    } catch {
      /* the answer is lost either way */
    }
    await offline(sh.session, true);
    await route.abort("internetdisconnected");
  });
  return async () => {
    await offline(sh.session, false);
    await sh.page.unroute(`**${ORDERS_PATH}`);
  };
}
