// PR 4 follow-up (691) — the deploy's warm-up of the new version, before any traffic moves to it. After a deploy the
// first admin page views on a phone took about 4 s each (the smoke's views 50–250) against about 1 s later on. The web
// app runs as several replicas (the auto profile, PR 604), each a fresh Node process: the first request of a page on
// a replica loads that page's server code from disk and compiles it (and the shared admin code the first time), and
// that cost was paid by the smoke test and the owner, page by page and replica by replica.
//
// infra/deploy/deploy.sh pipes this file into every web replica of the new colour (`docker exec -i … node -`) once it
// is healthy, with the smoke page list (docs/qa/smoke.json) in WARM_CONFIG. Inside the replica it opens each page once
// at http://127.0.0.1:<port>, one after another, never following a redirect: a shop page renders; an admin page loads
// its code and sends the signed-out request to the sign-in page. Nothing is signed in, nothing is written, query
// strings are dropped (no search is counted), and a page that fails or is slow never fails the deploy. It stops at the
// time budget (DEPLOY_WARM_SECONDS, 0 = off) and prints one line: how many pages, how long, the slowest ones (so the
// deploy log shows what a cold page costs on the server).
//
// No dependencies: it runs with the replica's own Node.

/** The smoke list's pages, each once, without its query string, shop pages first (the visitors' pages). */
export function warmPaths(config) {
  const out = [];
  const seen = new Set();
  for (const list of [config?.storefront, config?.admin]) {
    for (const raw of Array.isArray(list) ? list : []) {
      if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) continue;
      const path = raw.split(/[?#]/)[0] || "/";
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/**
 * Opens each path once at `base`, in order, until `budgetMs` is spent. Returns how many were opened, how many failed
 * (no answer or a 5xx), the time taken and the slowest `top` pages.
 */
export async function warm(base, paths, opts = {}) {
  const fetchImpl = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const budgetMs = opts.budgetMs ?? 240_000;
  const top = opts.top ?? 5;
  const started = now();
  const times = [];
  let failed = 0;
  for (const path of paths) {
    if (now() - started >= budgetMs) break;
    const t0 = now();
    try {
      const r = await fetchImpl(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "extas-deploy-warm" } });
      // the whole answer is read, so a streamed page finishes rendering
      await r.arrayBuffer();
      if (r.status >= 500) failed += 1;
    } catch {
      failed += 1;
    }
    times.push({ path, ms: now() - t0 });
  }
  const slowest = [...times].sort((a, b) => b.ms - a.ms).slice(0, top);
  return { opened: times.length, of: paths.length, failed, ms: now() - started, slowest };
}

/** The deploy log's line for one replica. */
export function warmLine(name, r) {
  const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
  const slow = r.slowest.map((x) => `${x.path} ${s(x.ms)}`).join(", ");
  return `warm: ${name}: ${r.opened}/${r.of} pages in ${s(r.ms)}${r.failed ? `, ${r.failed} without an answer` : ""}${slow ? `; slowest: ${slow}` : ""}`;
}

// Run inside a replica: the page list and the limits come in the environment.
if (process.env.WARM_CONFIG) {
  const paths = warmPaths(JSON.parse(process.env.WARM_CONFIG));
  const budgetMs = Number(process.env.WARM_BUDGET_SECONDS ?? "240") * 1000;
  const r = await warm(`http://127.0.0.1:${process.env.WARM_PORT || "3000"}`, paths, { budgetMs });
  console.log(warmLine(process.env.WARM_NAME || "replica", r));
}
