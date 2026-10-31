#!/usr/bin/env node
// S11 · PR 234 (PR 10's targets, owner server spec 19 Oct) — the monthly lab measurement: the shop's home, a category
// and a product page loaded fresh on a phone over a slow 4G line from Dhaka (Lighthouse's own phone conditions: 150 ms
// round trip, 1.6 Mbit/s down, 750 kbit/s up, the processor 4× slower), and an admin page signed in as the read-only
// check account on a desktop. For each page: LCP, CLS, TTFB, the bytes it pulled and its load time. The admin judges
// them against `seo.vitals.targets` (lib/seo/vitals labMisses); this tool only measures.
//   BASE=https://… [SMOKE_HTTP_USER/SMOKE_HTTP_PASSWORD] [SMOKE_EMAIL/SMOKE_PASSWORD/SMOKE_TOTP_SECRET] LAB_OUT=file node tools/vitals-lab.mjs
// Run on the VM by infra/deploy/vitals-lab.sh (vitals-monthly.yml), which keeps the result as state/vitals-lab.json.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { previewCookie, signIn } from "./smoke.mjs";

const require = createRequire(import.meta.url);

/** The lab's phone and line (technical test conditions, the same as Lighthouse's phone run; not a target). */
export const PHONE_4G = { name: "phone, slow 4G (150 ms, 1.6 Mbit/s), 4x slower processor", width: 412, height: 915, latencyMs: 150, downKbps: 1600, upKbps: 750, cpu: 4 };
/** How long a page may keep drawing after its load event before it is read (a late picture still counts). */
const SETTLE_MS = 3000;
/** The pages measured on the phone; the product is the first one the category lists. */
export const LAB_PAGES = [
  { path: "/", kind: "home" },
  { path: "/collections/new-in", kind: "category" },
];
const PRODUCT_LINK = "a.pcard-lnk";
const ADMIN_PAGE = "/admin";

// Runs inside the page before anything else: keeps the largest paint and the layout shifts not caused by the visitor.
const OBSERVE = `(() => {
  const lab = (window.__lab = { lcp: 0, cls: 0 });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lab.lcp = Math.max(lab.lcp, e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) lab.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  } catch {}
})();`;

/** The numbers of one loaded page, from what the page and the network said. */
export function pageNumbers(seen, bytes) {
  const nav = seen.nav ?? {};
  const round = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : null);
  return {
    lcpMs: round(seen.lcp),
    cls: Number.isFinite(seen.cls) ? Math.round(seen.cls * 1000) / 1000 : null,
    ttfbMs: round(nav.responseStart),
    loadMs: round(nav.loadEventEnd),
    kb: bytes > 0 ? Math.round(bytes / 1024) : null,
  };
}

async function measure(browser, base, url, { profile, storageState }) {
  const ctx = await browser.newContext({
    viewport: { width: profile?.width ?? 1366, height: profile?.height ?? 900 },
    isMobile: !!profile,
    hasTouch: !!profile,
    storageState,
  });
  try {
    await ctx.addInitScript(OBSERVE);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (profile) {
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: profile.latencyMs, downloadThroughput: (profile.downKbps * 1024) / 8, uploadThroughput: (profile.upKbps * 1024) / 8 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
    }
    let bytes = 0;
    cdp.on("Network.loadingFinished", (e) => {
      bytes += e.encodedDataLength ?? 0;
    });
    const res = await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(SETTLE_MS);
    const seen = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return { ...window.__lab, nav: nav ? { responseStart: nav.responseStart, loadEventEnd: nav.loadEventEnd } : null };
    });
    const links = await page.$$eval(PRODUCT_LINK, (as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
    return { status: res?.status() ?? 0, ...pageNumbers(seen, bytes), links };
  } finally {
    await ctx.close();
  }
}

/** The whole run: every phone page, then the admin page. */
export async function runLab({ base, httpCredentials = null, creds = null, chromiumPath = null, at = new Date().toISOString(), sha = "" }) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
  const pages = [];
  try {
    const preview = httpCredentials ? await previewCookie(browser, base, httpCredentials) : null;
    const storageState = preview ?? undefined;
    let product = null;
    for (const p of LAB_PAGES) {
      const m = await measure(browser, base, base + p.path, { profile: PHONE_4G, storageState });
      if (p.kind === "category") product = m.links.find((h) => h && h.startsWith("/")) ?? null;
      pages.push({ path: p.path, kind: p.kind, status: m.status, lcpMs: m.lcpMs, cls: m.cls, ttfbMs: m.ttfbMs, kb: m.kb, loadMs: m.loadMs });
    }
    if (product) {
      const m = await measure(browser, base, base + product, { profile: PHONE_4G, storageState });
      pages.push({ path: product, kind: "product", status: m.status, lcpMs: m.lcpMs, cls: m.cls, ttfbMs: m.ttfbMs, kb: m.kb, loadMs: m.loadMs });
    }
    if (creds?.email) {
      const ctx = await browser.newContext(storageState ? { storageState } : {});
      await signIn(await ctx.newPage(), base, creds);
      const signedIn = await ctx.storageState();
      await ctx.close();
      const m = await measure(browser, base, base + ADMIN_PAGE, { profile: null, storageState: signedIn });
      pages.push({ path: ADMIN_PAGE, kind: "admin", status: m.status, lcpMs: m.lcpMs, cls: m.cls, ttfbMs: m.ttfbMs, kb: m.kb, loadMs: m.loadMs });
    }
  } finally {
    await browser.close();
  }
  return { at, sha, profile: PHONE_4G.name, pages };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
  const result = await runLab({
    base,
    httpCredentials: process.env.SMOKE_HTTP_USER ? { username: process.env.SMOKE_HTTP_USER, password: process.env.SMOKE_HTTP_PASSWORD ?? "" } : null,
    creds: process.env.SMOKE_EMAIL ? { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD, totpSecret: process.env.SMOKE_TOTP_SECRET } : null,
    chromiumPath: process.env.CHROMIUM_PATH || null,
    at: process.env.LAB_AT || new Date().toISOString(),
    sha: process.env.LAB_SHA || "",
  });
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (process.env.LAB_OUT) writeFileSync(process.env.LAB_OUT, text);
  process.stdout.write(text);
}
