// S18 · PR 386 (Blueprint B6.1, B6.3) — the shop's protection at Cloudflare, as rules. Pure: no network.
//
// Cloudflare's own DDoS protection is always on for every zone; what the shop adds are a few rules of its own, each
// limited to the shop's host names. The zone may serve other sites too (the old shop on the main domain stays live
// until go-live day and must not be touched), so nothing is set zone-wide: every rule starts with
// `http.host in {…}`, and when the rules are written back, every rule that is not the shop's (its `ref` does not start
// with `extas-`) is kept exactly as it was, in its place.
//
//   http_config_settings        `extas-shield`  the security level and the browser check for the shop's hosts, and
//                                               SSL Full (strict) to the server (the Origin certificate, PR 7)
//   http_request_firewall_custom `extas-probes` refuses the addresses robots try on every site (/wp-login.php, /.env …)
//                                `extas-admin`  a managed challenge on the admin's sign-in page only — never on the
//                                               shop (B6.3: no challenge, no CAPTCHA for customers); off by default
//   http_ratelimit              `extas-admin-login` refuses an address for a short while above N admin sign-in tries
//                                               in 10 seconds (the free plan's window); off by default, owner only
//
// The security level is never "I'm under attack": that shows every customer a waiting page.
export const SHIELD_REF_PREFIX = "extas-";

export const SHIELD_PHASES = {
  config: "http_config_settings",
  custom: "http_request_firewall_custom",
  rate: "http_ratelimit",
} as const;
export type ShieldPhase = keyof typeof SHIELD_PHASES;
export const SHIELD_PHASE_IDS = Object.keys(SHIELD_PHASES) as ShieldPhase[];

export const SECURITY_LEVELS = ["essentially_off", "low", "medium", "high"] as const;
export type SecurityLevel = (typeof SECURITY_LEVELS)[number];

/** Cloudflare's free plan counts rate limits over 10 seconds and refuses for 10 seconds. */
export const RATE_PERIOD_S = 10; // hardcode-ok: Cloudflare's own fixed counting window on the free plan, not a shop number

export interface ShieldPlan {
  /** The shop's host names (validated host names: no quotes, no spaces). */
  hosts: readonly string[];
  securityLevel: SecurityLevel;
  browserCheck: boolean;
  /** SSL Full (strict) to the server for the shop's hosts. */
  sslStrict: boolean;
  /** Address beginnings refused at Cloudflare (each starts with "/"; empty: no rule). */
  probePaths: readonly string[];
  /** The admin's sign-in page, with a managed challenge; null: no rule. */
  adminChallenge: { path: string } | null;
  /** Admin sign-in tries per 10 seconds from one address; null: no rule. */
  adminLoginLimit: { path: string; per10s: number } | null;
}

/** A Cloudflare ruleset rule, as the API reads and writes it (other fields are kept as they come). */
export interface CfRule {
  id?: string;
  ref?: string;
  description?: string;
  expression: string;
  action: string;
  action_parameters?: Record<string, unknown>;
  ratelimit?: Record<string, unknown>;
  enabled?: boolean;
  [other: string]: unknown;
}

export type ShieldRules = Record<ShieldPhase, CfRule[]>;

const SAFE = /^[A-Za-z0-9._~\-/]+$/;
const quote = (s: string): string => {
  if (!SAFE.test(s)) throw new Error(`not a plain host or path: ${s}`);
  return `"${s}"`;
};
const hostExpr = (hosts: readonly string[]) => `(http.host in {${hosts.map((h) => quote(h.toLowerCase())).join(" ")}})`;

export const isShopRule = (r: Pick<CfRule, "ref">): boolean => typeof r.ref === "string" && r.ref.startsWith(SHIELD_REF_PREFIX);

/** The shop's rules per phase for a plan. No host: no rule at all (nothing can be limited to the shop). */
export function shieldRules(plan: ShieldPlan): ShieldRules {
  const out: ShieldRules = { config: [], custom: [], rate: [] };
  if (!plan.hosts.length) return out;
  const host = hostExpr(plan.hosts);
  out.config.push({
    ref: "extas-shield",
    description: "Shop: security level, browser check and SSL (PR 386)",
    expression: host,
    action: "set_config",
    action_parameters: { security_level: plan.securityLevel, bic: plan.browserCheck, ...(plan.sslStrict ? { ssl: "strict" } : {}) },
    enabled: true,
  });
  if (plan.probePaths.length)
    out.custom.push({
      ref: "extas-probes",
      description: "Shop: addresses robots try on every site (PR 386)",
      expression: `${host} and (${plan.probePaths.map((p) => `starts_with(http.request.uri.path, ${quote(p)})`).join(" or ")})`,
      action: "block",
      enabled: true,
    });
  if (plan.adminChallenge)
    out.custom.push({
      ref: "extas-admin",
      description: "Shop admin sign-in page only, never the shop (B6.3, PR 386)",
      expression: `${host} and (http.request.uri.path eq ${quote(plan.adminChallenge.path)})`,
      action: "managed_challenge",
      enabled: true,
    });
  if (plan.adminLoginLimit)
    out.rate.push({
      ref: "extas-admin-login",
      description: "Shop admin sign-in tries per address (PR 386)",
      expression: `${host} and (http.request.uri.path eq ${quote(plan.adminLoginLimit.path)}) and (http.request.method eq "POST")`,
      action: "block",
      ratelimit: {
        characteristics: ["cf.colo.id", "ip.src"],
        period: RATE_PERIOD_S,
        requests_per_period: plan.adminLoginLimit.per10s,
        mitigation_timeout: RATE_PERIOD_S,
      },
      enabled: true,
    });
  return out;
}

/** What a rule does, for comparing (ids, versions and dates left out). */
const shape = (r: CfRule) =>
  JSON.stringify({ e: r.expression, a: r.action, p: r.action_parameters ?? null, l: r.ratelimit ?? null, on: r.enabled !== false });

/** A phase's rules with the shop's replaced: every other rule kept as it was, in its place; the shop's at the end. */
export function mergeRules(existing: readonly CfRule[], ours: readonly CfRule[]): CfRule[] {
  return [...existing.filter((r) => !isShopRule(r)), ...ours];
}

export interface ShieldDifference {
  ref: string;
  /** missing: in the plan, not at Cloudflare; changed: there but different; extra: at Cloudflare, not in the plan. */
  kind: "missing" | "changed" | "extra";
}

/** How the shop's rules at Cloudflare differ from the plan's (other rules are not the shop's business). */
export function shieldDiff(current: ShieldRules, wanted: ShieldRules): ShieldDifference[] {
  const out: ShieldDifference[] = [];
  for (const phase of SHIELD_PHASE_IDS) {
    const have = new Map(current[phase].filter(isShopRule).map((r) => [r.ref!, r]));
    for (const w of wanted[phase]) {
      const h = have.get(w.ref!);
      if (!h) out.push({ ref: w.ref!, kind: "missing" });
      else if (shape(h) !== shape(w)) out.push({ ref: w.ref!, kind: "changed" });
      have.delete(w.ref!);
    }
    for (const ref of have.keys()) out.push({ ref, kind: "extra" });
  }
  return out;
}

/** A rule as it is written back: what Cloudflare fills in by itself is left out. */
export function writable(r: CfRule): CfRule {
  const { version, last_updated, ...rest } = r;
  return rest;
}

export type ShieldResult = { ok: true; changed: ShieldPhase[] } | { ok: false; error: string };

/** What the CDN adapter offers for the protection (both the live client and the mock). */
export interface EdgeShield {
  /** The host names the connection names (live only; the mock has none). */
  hosts: readonly string[] | null;
  /** Every rule of the three phases at Cloudflare (the shop's and any other). */
  read(): Promise<ShieldRules>;
  /** Writes the shop's rules for the plan into each phase that differs, keeping every other rule. */
  apply(plan: ShieldPlan): Promise<ShieldResult>;
}
