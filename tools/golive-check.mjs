// S19 · PR 587 (CN-035 step 4c) — the go-live check before the owner's "go live": read-only, on the VM by hand
// (infra/deploy/golive-check.sh, .github/workflows/golive-check.yml), signed in as the read-only check account through
// the preview login, against the staging host (BASE) ONLY — it never sends a request to any other host, so the old shop
// on the main domain is never touched:
//   1. the go-live checklist (GET /api/admin/go-live, Settings → System → Go-live): every row with its group ("Needed
//      before go-live" / "Soon after go-live") and its state — keys, titles and counts, never a value of the owner's;
//   2. the WordPress map of the redirect table (GET /api/admin/seo/redirects?view=wordpress): how many rows, whether the
//      map is live (`seo.redirects.wordpressMapLive`, switched on on go-live day), and every target opening with 200 on
//      the staging host without forwarding again (PR 590: no chains);
//   3. the sitemap: /sitemap.xml and every file it lists; every address's path is opened on the staging host (200, no
//      forward) — the host written in the file (the main domain once it is the store's primary domain) is never asked;
//   4. the domain switch dry run the shell wrote (SWITCH_JSON): the main domain's Caddy block, open, checked in a copy.
// Writes <GOLIVE_OUT>/result.json and README.md. Prints no password. Needs `playwright` (NODE_PATH), like tools/smoke.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { previewCookie, signIn } from "./smoke.mjs";

const require = createRequire(import.meta.url);

/** Every <loc> of a sitemap or a sitemap index, unescaped. */
export function sitemapLocs(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
  );
}

/** The same address on the staging host: only the path and query of `loc` are kept, the host is always BASE's. */
export function onBase(base, loc) {
  const u = new URL(loc, base);
  return new URL(`${u.pathname}${u.search}`, base).toString();
}

/** The go-live rows as the report shows them, "Needed before go-live" first; titles from the page's own words. */
export function goLiveRows(api, titles = {}) {
  const items = Array.isArray(api?.items) ? api.items : [];
  const rows = items.map((i) => ({
    key: i.key,
    pr: i.pr,
    kind: i.kind,
    when: i.when === "after" ? "after" : "before",
    ok: i.ok === true,
    at: i.at ?? null,
    title: titles[i.key] ?? i.key,
    vars: Object.fromEntries(Object.entries(i.vars ?? {}).filter(([, v]) => typeof v === "number" || (typeof v === "string" && v.length <= 200))),
  }));
  return [...rows.filter((r) => r.when === "before"), ...rows.filter((r) => r.when === "after")];
}

/** What is still open before the switch: the "Needed before go-live" rows that are not done. */
export function blockers(rows) {
  return rows.filter((r) => r.when === "before" && !r.ok);
}

/** A forward that ends somewhere other than a page: anything but 200 after at most this one hop. */
export function targetProblem(path, status, location) {
  if (status === 200) return null;
  if (status >= 300 && status < 400) return `${path} forwards again (${status} → ${location ?? "?"}): a chain`;
  return `${path} answers ${status}`;
}

const tick = (ok) => (ok ? "✅" : "❌");
const varsText = (v) =>
  Object.entries(v)
    .map(([k, x]) => `${k}: ${x}`)
    .join(" · ");

export function reportMarkdown(r) {
  const before = r.goLive.rows.filter((x) => x.when === "before");
  const after = r.goLive.rows.filter((x) => x.when === "after");
  const open = blockers(r.goLive.rows);
  const out = [
    "# Go-live check (PR 587) — before the owner's \"go live\"",
    "",
    `**সারকথা:** চালুর আগে দরকারি ${before.length}টার ${before.length - open.length}টা হয়ে গেছে, ${open.length}টা বাকি। রিডাইরেক্ট: ${r.redirects.rows}টা পুরনো লিংক${r.redirects.live ? " (চালু)" : " (এখনো বন্ধ — চালুর দিনে চালু হবে)"}। সাইটম্যাপ: ${r.sitemap.urls}টা ঠিকানা, ${r.sitemap.problems.length}টা সমস্যা। ডোমেইন বদলের মহড়া (শুধু কপিতে): ${r.switch.ok ? "ঠিক আছে" : "সমস্যা"}। কিছুই বদলানো হয়নি।`,
    "",
    `- Run: ${r.at} · version \`${r.sha || "?"}\` · host: the staging host only (read-only check account) · result **${r.ok ? "READY except the owner's steps" : "NOT READY"}**`,
    "- Nothing was changed: no setting, no sign-off, no server file. The main domain was never asked.",
    "",
    `## Needed before go-live (${before.length - open.length}/${before.length} done)`,
    "",
    "| | Row | PR | Kind | Detail |",
    "|---|---|---|---|---|",
    ...before.map((x) => `| ${tick(x.ok)} | ${x.title} (\`${x.key}\`) | ${x.pr} | ${x.kind} | ${varsText(x.vars) || "—"} |`),
    "",
    `## Soon after go-live (${after.filter((x) => x.ok).length}/${after.length} done; they never hold the switch back)`,
    "",
    "| | Row | PR | Kind | Detail |",
    "|---|---|---|---|---|",
    ...after.map((x) => `| ${x.ok ? "✅" : "🟡"} | ${x.title} (\`${x.key}\`) | ${x.pr} | ${x.kind} | ${varsText(x.vars) || "—"} |`),
    "",
    "## Redirects of the old shop (WordPress map, PR 235 / 587)",
    "",
    `- Rows: **${r.redirects.rows}** (the old sitemap listed ${r.redirects.expected} addresses on 19 Oct 2026, docs/owner/GOOGLE-TRAFFIC-PLAN.md F1) · map live: **${r.redirects.live ? "on" : "off — switched on on go-live day"}**`,
    `- Targets opened on the staging host: ${r.redirects.checked}, problems: ${r.redirects.problems.length}`,
    ...r.redirects.problems.slice(0, 50).map((p) => `  - ${p}`),
    "",
    "## Sitemap",
    "",
    `- /sitemap.xml: ${r.sitemap.indexStatus} · files: ${r.sitemap.files} · addresses: ${r.sitemap.urls} · written for host: ${r.sitemap.hosts.join(", ") || "—"}`,
    `- Every address's path opened on the staging host: ${r.sitemap.checked}, problems: ${r.sitemap.problems.length}`,
    ...r.sitemap.problems.slice(0, 50).map((p) => `  - ${p}`),
    "",
    "## Domain switch, dry run (nothing applied)",
    "",
    `- ${r.switch.ok ? "✅" : "❌"} ${r.switch.detail ?? "not run"}`,
    "",
    "## What only the owner gives",
    "",
    "- His \"go live\" for the day and the quiet hour; then `node tools/golive-switch.mjs --domain <main domain> --confirm \"GO LIVE <main domain>\"` (docs/golive/RUNBOOK.md, PR 587 section).",
    "- The DNS change in Cloudflare (runbook step 5) when the Cloudflare account is his alone.",
    "",
  ];
  return out.join("\n");
}

async function main() {
  const base = String(process.env.BASE || "").replace(/\/$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/.test(base)) throw new Error("BASE must be https://<the staging host>");
  const outDir = process.env.GOLIVE_OUT || "out";
  mkdirSync(outDir, { recursive: true });
  const titles = (() => {
    try {
      const m = JSON.parse(readFileSync(process.env.GOLIVE_TITLES || "", "utf8"));
      return Object.fromEntries(Object.entries(m.item ?? {}).map(([k, v]) => [k, v?.title ?? k]));
    } catch {
      return {};
    }
  })();
  const sw = process.env.SWITCH_JSON && existsSync(process.env.SWITCH_JSON) ? JSON.parse(readFileSync(process.env.SWITCH_JSON, "utf8")) : { ok: false, detail: "the dry run wrote nothing" };
  const httpCredentials = process.env.SMOKE_HTTP_USER ? { username: process.env.SMOKE_HTTP_USER, password: process.env.SMOKE_HTTP_PASSWORD ?? "" } : undefined;
  const creds = { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD, totpSecret: process.env.SMOKE_TOTP_SECRET };
  if (!creds.email || !creds.password) throw new Error("sign-in details missing (SMOKE_EMAIL/SMOKE_PASSWORD)");
  const { chromium } = require("playwright");
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const result = {
    at: process.env.GOLIVE_AT || new Date().toISOString(),
    sha: process.env.GOLIVE_SHA || "",
    ok: false,
    problems: [],
    goLive: { rows: [], blockers: [] },
    redirects: { rows: 0, live: false, expected: Number(process.env.GOLIVE_OLD_URLS || 49), checked: 0, problems: [] },
    sitemap: { indexStatus: 0, files: 0, urls: 0, hosts: [], checked: 0, problems: [] },
    switch: sw,
  };
  try {
    const preview = httpCredentials ? await previewCookie(browser, base, httpCredentials) : null;
    const ctx = await browser.newContext(preview ? { storageState: preview } : {});
    const page = await ctx.newPage();
    await signIn(page, base, creds);
    const get = (path, opts = {}) => ctx.request.get(onBase(base, path), { failOnStatusCode: false, ...opts });

    // 1. the go-live checklist
    const gl = await get("/api/admin/go-live");
    if (gl.status() !== 200) result.problems.push(`go-live list: ${gl.status()}`);
    else {
      result.goLive.rows = goLiveRows(await gl.json(), titles);
      result.goLive.blockers = blockers(result.goLive.rows).map((x) => x.key);
    }

    // 2. the WordPress map
    const rd = await get("/api/admin/seo/redirects?view=wordpress");
    if (rd.status() !== 200) result.problems.push(`redirects: ${rd.status()}`);
    else {
      const j = await rd.json();
      result.redirects.rows = j.wordpress?.rows ?? 0;
      result.redirects.live = j.wordpress?.live === true;
      const targets = [...new Set((j.redirects ?? []).filter((x) => x.enabled).map((x) => x.toPath))];
      for (const t of targets) {
        const res = await get(t, { maxRedirects: 0 });
        result.redirects.checked++;
        const p = targetProblem(t, res.status(), res.headers().location);
        if (p) result.redirects.problems.push(p);
      }
      if (result.redirects.rows === 0) result.redirects.problems.push("no WordPress row yet: load the old shop's addresses (Website › SEO › Redirects › Import, kind WordPress)");
    }

    // 3. the sitemap
    const idx = await get("/sitemap.xml", { maxRedirects: 0 });
    result.sitemap.indexStatus = idx.status();
    if (idx.status() !== 200) result.sitemap.problems.push(`/sitemap.xml answers ${idx.status()}`);
    else {
      const files = sitemapLocs(await idx.text());
      result.sitemap.files = files.length;
      const hosts = new Set();
      for (const f of files) {
        hosts.add(new URL(f).host);
        const fr = await get(f, { maxRedirects: 0 });
        if (fr.status() !== 200) {
          result.sitemap.problems.push(`${new URL(f).pathname} answers ${fr.status()}`);
          continue;
        }
        const locs = sitemapLocs(await fr.text());
        result.sitemap.urls += locs.length;
        for (const loc of locs) {
          hosts.add(new URL(loc).host);
          const res = await get(loc, { maxRedirects: 0 });
          result.sitemap.checked++;
          const p = targetProblem(new URL(loc).pathname, res.status(), res.headers().location);
          if (p) result.sitemap.problems.push(p);
        }
      }
      result.sitemap.hosts = [...hosts];
      if (files.length === 0) result.sitemap.problems.push("the sitemap index lists no file");
    }
    await ctx.close();
  } catch (e) {
    result.problems.push(e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
  }
  result.ok =
    result.problems.length === 0 &&
    result.goLive.rows.length > 0 &&
    result.redirects.problems.length === 0 &&
    result.sitemap.problems.length === 0 &&
    result.switch.ok === true;
  writeFileSync(join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(outDir, "README.md"), reportMarkdown(result) + (result.problems.length ? `\n## Problems\n\n${result.problems.map((p) => `- ${p}`).join("\n")}\n` : ""));
  console.log(`go-live check: ${result.goLive.rows.length} rows, ${result.goLive.blockers.length} before go-live still open; redirects ${result.redirects.rows}; sitemap ${result.sitemap.urls} addresses, ${result.sitemap.problems.length} problems; switch dry run ${result.switch.ok ? "ok" : "FAIL"}`);
  return result.problems.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`golive-check: FAILED — ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    },
  );
}
