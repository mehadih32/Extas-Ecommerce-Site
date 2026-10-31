// S18 · PR 386, S17 · PR 362 — the shop's protection and cache rules at Cloudflare: every rule is limited to the shop's host names, a rule that
// is not the shop's is never changed or dropped, the admin challenge is the sign-in page only, and the live client
// writes only the phases that differ (a stand-in Cloudflare; sample host names and ids).
import { describe, expect, it } from "vitest";
import { createCloudflareClient, mockShieldLog, cloudflareAdapter } from "../src/cdn";
import { mergeRules, shieldDiff, shieldRules, type CfRule, type ShieldPlan } from "../src/cdn/shield";

const plan: ShieldPlan = {
  hosts: ["new.example.com"],
  securityLevel: "medium",
  browserCheck: true,
  sslStrict: true,
  probePaths: ["/wp-login.php", "/.env"],
  adminChallenge: null,
  adminLoginLimit: null,
};
const theirs: CfRule = { id: "r1", ref: "old-site", expression: '(http.host eq "old.example.com")', action: "block", version: "3" };

describe("PR 386 · the shop's rules", () => {
  it("limits every rule to the shop's hosts and never challenges the shop", () => {
    const r = shieldRules({ ...plan, adminChallenge: { path: "/admin/login" }, adminLoginLimit: { path: "/api/admin/auth/login", per10s: 5 } });
    const all = [...r.config, ...r.custom, ...r.rate];
    expect(all.map((x) => x.ref)).toEqual(["extas-shield", "extas-probes", "extas-admin", "extas-admin-login"]);
    for (const x of all) expect(x.expression.startsWith('(http.host in {"new.example.com"})')).toBe(true);
    expect(r.config[0]!.action_parameters).toEqual({ security_level: "medium", bic: true, ssl: "strict" });
    expect(r.custom[0]!.expression).toContain('starts_with(http.request.uri.path, "/wp-login.php") or starts_with(http.request.uri.path, "/.env")');
    const challenges = all.filter((x) => x.action.includes("challenge"));
    expect(challenges.map((x) => x.expression)).toEqual(['(http.host in {"new.example.com"}) and (http.request.uri.path eq "/admin/login")']);
    expect(r.rate[0]!.ratelimit).toMatchObject({ period: 10, requests_per_period: 5 });
  });

  it("makes no rule without a host, and refuses a value that is not a plain host or path", () => {
    expect(shieldRules({ ...plan, hosts: [], cache: { pagePrefixes: ["/p"], never: ["/admin"] } })).toEqual({ config: [], custom: [], rate: [], cache: [] });
    expect(() => shieldRules({ ...plan, probePaths: ['/x" or true or "'] })).toThrow();
  });

  it("keeps every other rule as it was and finds what differs", () => {
    const ours = shieldRules(plan);
    expect(mergeRules([theirs, { ...ours.custom[0]!, id: "o1", expression: "old" }], ours.custom)).toEqual([theirs, ours.custom[0]]);
    expect(shieldDiff({ config: [theirs], custom: [], rate: [{ ref: "extas-admin-login", expression: "x", action: "block" }] }, ours)).toEqual([
      { ref: "extas-shield", kind: "missing" },
      { ref: "extas-probes", kind: "missing" },
      { ref: "extas-admin-login", kind: "extra" },
    ]);
    expect(shieldDiff({ config: [{ ...ours.config[0]!, id: "x", version: "2" }], custom: ours.custom, rate: [] }, ours)).toEqual([]);
  });
});

describe("PR 362 · the shop's cache rules", () => {
  const cache = { pagePrefixes: ["/collections", "/p", "/bn/collections", "/bn/p"], never: ["/bag", "/checkout", "/admin", "/api"] };

  it("keeps product and category pages as long as each page says, and never the bag, checkout, account, admin or API", () => {
    const r = shieldRules({ ...plan, cache });
    expect(r.cache.map((x) => x.ref)).toEqual(["extas-cache-pages", "extas-cache-never"]);
    for (const x of r.cache) expect(x.expression.startsWith('(http.host in {"new.example.com"}) and (')).toBe(true);
    expect(r.cache[0]!.expression).toContain('starts_with(http.request.uri.path, "/bn/p")');
    // no time of Cloudflare's own: the page's CDN-Cache-Control (the Cache settings' minutes, no-store for a visitor's own page)
    expect(r.cache[0]!.action_parameters).toEqual({ cache: true, edge_ttl: { mode: "respect_origin" }, browser_ttl: { mode: "respect_origin" } });
    // last, so it wins over any rule before it
    expect(r.cache[1]!.action_parameters).toEqual({ cache: false });
    expect(r.cache[1]!.expression).toContain('starts_with(http.request.uri.path, "/checkout")');
  });

  it("with Cloudflare's page keeping off, only the never-kept rule; no cache plan, no cache rule", () => {
    expect(shieldRules({ ...plan, cache: { ...cache, pagePrefixes: [] } }).cache.map((x) => x.ref)).toEqual(["extas-cache-never"]);
    expect(shieldRules(plan).cache).toEqual([]);
  });

  it("writes the cache phase with the others, and keeps another site's cache rule", async () => {
    const other: CfRule = { id: "c1", ref: "old-site-cache", expression: '(http.host eq "old.example.com")', action: "set_cache_settings", action_parameters: { cache: true } };
    const zone: Record<string, CfRule[] | undefined> = { http_request_cache_settings: [other] };
    const fake: typeof fetch = async (input, init) => {
      const phase = /phases\/([a-z_]+)\/entrypoint/.exec(String(input))?.[1] ?? "";
      if (init?.method === "PUT") zone[phase] = (JSON.parse(String(init.body)) as { rules: CfRule[] }).rules;
      const rules = zone[phase];
      return rules ? new Response(JSON.stringify({ success: true, result: { rules } })) : new Response("{}", { status: 404 });
    };
    const c = createCloudflareClient({ baseUrl: "https://cf.example.test", zoneId: "a".repeat(32), hosts: ["new.example.com"], token: "sample-token", fetch: fake });
    expect(await c.shield.apply({ ...plan, cache })).toEqual({ ok: true, changed: ["config", "custom", "cache"] });
    expect(zone.http_request_cache_settings!.map((r) => r.ref)).toEqual(["old-site-cache", "extas-cache-pages", "extas-cache-never"]);
    expect(await c.shield.apply({ ...plan, cache: { ...cache, pagePrefixes: [] } })).toEqual({ ok: true, changed: ["cache"] });
    expect(zone.http_request_cache_settings!.map((r) => r.ref)).toEqual(["old-site-cache", "extas-cache-never"]);
  });
});

describe("PR 386 · the Cloudflare client", () => {
  it("reads the three phases (none yet is empty) and writes back only the phases that differ, keeping other rules", async () => {
    const zone: Record<string, CfRule[] | undefined> = { http_request_firewall_custom: [theirs] };
    const sent: { method: string; url: string; body: unknown }[] = [];
    const fake: typeof fetch = async (input, init) => {
      const url = String(input);
      const phase = /phases\/([a-z_]+)\/entrypoint/.exec(url)?.[1] ?? "";
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { rules: CfRule[] };
        sent.push({ method: "PUT", url, body });
        zone[phase] = body.rules;
        return new Response(JSON.stringify({ success: true, result: { rules: body.rules } }));
      }
      const rules = zone[phase];
      if (!rules) return new Response(JSON.stringify({ success: false, errors: [{ message: "not found" }] }), { status: 404 });
      return new Response(JSON.stringify({ success: true, result: { rules } }));
    };
    const c = createCloudflareClient({ baseUrl: "https://cf.example.test", zoneId: "a".repeat(32), hosts: ["new.example.com"], token: "sample-token", fetch: fake });
    expect(c.shield.hosts).toEqual(["new.example.com"]);
    expect(await c.shield.read()).toEqual({ config: [], custom: [theirs], rate: [], cache: [] });
    expect(await c.shield.apply(plan)).toEqual({ ok: true, changed: ["config", "custom"] });
    expect(sent.map((x) => x.url.replace("https://cf.example.test/zones/" + "a".repeat(32), ""))).toEqual([
      "/rulesets/phases/http_config_settings/entrypoint",
      "/rulesets/phases/http_request_firewall_custom/entrypoint",
    ]);
    // the old site's rule went back unchanged (without the fields Cloudflare fills in), the shop's after it
    const { version: _v, ...back } = theirs;
    expect((sent[1]!.body as { rules: CfRule[] }).rules).toEqual([back, shieldRules(plan).custom[0]]);
    expect(await c.shield.apply(plan)).toEqual({ ok: true, changed: [] });
  });

  it("says what Cloudflare refused, without the key", async () => {
    const fake: typeof fetch = async () => new Response(JSON.stringify({ success: false, errors: [{ message: "Authentication error" }] }), { status: 403 });
    const c = createCloudflareClient({ baseUrl: "https://cf.example.test", zoneId: "a".repeat(32), hosts: ["new.example.com"], token: "sample-token", fetch: fake });
    const r = await c.shield.apply(plan);
    expect(r).toEqual({ ok: false, error: "Cloudflare refused (403): Authentication error" });
  });

  it("the mock keeps its own zone, so the protection can be practised before the key is in", async () => {
    mockShieldLog.clear();
    const m = await cloudflareAdapter.mock!({} as never);
    expect(m.shield!.hosts).toBeNull();
    expect(await m.shield!.apply(plan)).toEqual({ ok: true, changed: ["config", "custom"] });
    expect(mockShieldLog.rules().custom.map((r) => r.ref)).toEqual(["extas-probes"]);
    expect(await m.shield!.apply({ ...plan, probePaths: [] })).toEqual({ ok: true, changed: ["custom"] });
    expect(mockShieldLog.rules().custom).toEqual([]);
  });
});
