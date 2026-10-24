// PR 602 — the CDN in front of the shop (Cloudflare): dropping what it keeps. The cache's purge rules (@extas/cache)
// ask it to drop some addresses (a product's page and its categories after a price change) or everything ("Clear all",
// a setting changed, a new version deployed). The owner types the API token (a token with the zone's "Cache Purge"
// right only) into Keys & connections, with the zone id and the host names the shop answers on (the domain is his
// setting, never code). Until then, and whenever the test fails, the mock answers: it remembers what it was asked to
// drop in this process and sends nothing anywhere (A1.3).
import { z } from "zod";
import { defineAdapter, requireSecret } from "../define";

export const CLOUDFLARE_PROVIDER = "cloudflare";

/** Cloudflare's API address; another one can be set on the connection (a test server). */
export const CLOUDFLARE_DEFAULT_BASE_URL =
  "https://api.cloudflare.com/client/v4";

/** How many addresses Cloudflare takes in one purge request on every plan. */
export const CLOUDFLARE_PURGE_BATCH = 30;

export type CdnResult =
  | { ok: true; sent: number }
  | { ok: false; error: string };

export interface CdnPurger {
  provider: string;
  /** Drops these paths (`/p/linen-shirt`) on every host the shop answers on. */
  purgePaths(paths: readonly string[]): Promise<CdnResult>;
  /** Drops everything the CDN keeps for the shop. */
  purgeEverything(): Promise<CdnResult>;
}

export interface MockCdnCall {
  at: Date;
  everything: boolean;
  paths: string[];
}

const G = globalThis as unknown as { __extasMockCdn?: MockCdnCall[] };
const calls = (): MockCdnCall[] => (G.__extasMockCdn ??= []);
/** The mock remembers this many requests (the newest). */
const MOCK_KEEP = 200;

/** What the mock was asked to drop in this process (tests; the Cache page shows the last one). */
export const mockCdnLog = {
  all: (): readonly MockCdnCall[] => [...calls()],
  clear: (): void => {
    calls().length = 0;
  },
};

function mockPurger(provider: string): CdnPurger {
  const keep = (c: MockCdnCall) => {
    const all = calls();
    all.push(c);
    if (all.length > MOCK_KEEP) all.splice(0, all.length - MOCK_KEEP);
  };
  return {
    provider,
    async purgePaths(paths) {
      keep({ at: new Date(), everything: false, paths: [...paths] });
      return { ok: true, sent: paths.length };
    },
    async purgeEverything() {
      keep({ at: new Date(), everything: true, paths: [] });
      return { ok: true, sent: 0 };
    },
  };
}

const HOST =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const cloudflareConfig = z.object({
  /** The zone's id (Cloudflare dashboard → the domain → Overview → API → Zone ID). */
  zoneId: z
    .string()
    .regex(/^[a-f0-9]{32}$/, "a zone id is 32 letters and digits (0–9, a–f)"),
  /** The host names the shop answers on, separated by commas (new.extas.com.bd now; the main domain on go-live day). */
  hosts: z
    .string()
    .max(1_000)
    .refine(
      (s) =>
        s
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean)
          .every((h) => HOST.test(h)),
      "host names only, separated by commas",
    )
    .refine(
      (s) => s.split(",").some((h) => h.trim()),
      "at least one host name",
    ),
  /** Only to point at another address than Cloudflare's own (a test server). HTTPS only. */
  baseUrl: z
    .url({ protocol: /^https$/, message: "not an https address" })
    .max(500)
    .optional(),
});
export type CloudflareConfig = z.output<typeof cloudflareConfig>;

interface ClientOptions {
  baseUrl: string;
  zoneId: string;
  hosts: readonly string[];
  token: string;
  fetch?: typeof fetch;
}

interface CfBody {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: { name?: string; status?: string };
}

/** The Cloudflare client: purge by address, purge everything, and read the zone (the Test button). */
export function createCloudflareClient(
  o: ClientOptions,
): CdnPurger & { zone(): Promise<{ ok: boolean; message: string }> } {
  const doFetch = o.fetch ?? fetch;
  const base = o.baseUrl.replace(/\/+$/, "");
  const zone = `${base}/zones/${encodeURIComponent(o.zoneId)}`;

  async function call(
    method: "GET" | "POST",
    url: string,
    body?: unknown,
  ): Promise<CfBody> {
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${o.token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(
        `Cloudflare did not answer: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    let parsed: CfBody = {};
    try {
      parsed = (await res.json()) as CfBody;
    } catch {
      // not JSON: the status code speaks
    }
    if (!res.ok || parsed.success === false) {
      const why = (parsed.errors ?? [])
        .map((e) => e.message)
        .filter(Boolean)
        .join("; ");
      throw new Error(
        `Cloudflare refused (${res.status})${why ? `: ${why}` : ""}`.slice(
          0,
          300,
        ),
      );
    }
    return parsed;
  }

  const safe = async (fn: () => Promise<number>): Promise<CdnResult> => {
    try {
      return { ok: true, sent: await fn() };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  return {
    provider: CLOUDFLARE_PROVIDER,
    purgePaths: (paths) =>
      safe(async () => {
        const urls = o.hosts.flatMap((h) =>
          paths.map((p) => `https://${h}${p.startsWith("/") ? p : `/${p}`}`),
        );
        for (let i = 0; i < urls.length; i += CLOUDFLARE_PURGE_BATCH)
          await call("POST", `${zone}/purge_cache`, {
            files: urls.slice(i, i + CLOUDFLARE_PURGE_BATCH),
          });
        return urls.length;
      }),
    purgeEverything: () =>
      safe(async () => {
        await call("POST", `${zone}/purge_cache`, { purge_everything: true });
        return 0;
      }),
    async zone() {
      const r = await call("GET", zone);
      return {
        ok: true,
        message: `Cloudflare: the key works for ${r.result?.name ?? "the zone"}`,
      };
    },
  };
}

export const hostsOf = (s: string | undefined): string[] =>
  (s ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

export const cloudflareAdapter = defineAdapter<
  CdnPurger & { zone?: () => Promise<{ ok: boolean; message: string }> },
  CloudflareConfig
>({
  kind: "CDN",
  provider: CLOUDFLARE_PROVIDER,
  modes: ["LIVE"],
  secrets: ["apiToken"],
  configSchema: cloudflareConfig,
  async create(ctx) {
    const token = await requireSecret(ctx, "apiToken");
    return createCloudflareClient({
      baseUrl: ctx.config.baseUrl ?? CLOUDFLARE_DEFAULT_BASE_URL,
      zoneId: ctx.config.zoneId,
      hosts: hostsOf(ctx.config.hosts),
      token,
    });
  },
  async mock() {
    return mockPurger(CLOUDFLARE_PROVIDER);
  },
  async test(api) {
    if (!api.zone)
      return { ok: true, message: "mock CDN: nothing is sent to Cloudflare" };
    try {
      return await api.zone();
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
});

export const cdnAdapters = [cloudflareAdapter] as const;
