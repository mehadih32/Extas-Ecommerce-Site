// Review R1 m4 / R2 (security) — the status page (`/status`) and the health answer's detail (commit, blue/green colour)
// are for the preview site and the server's own checks, never for the open shop. The decision is on the request's Host
// header (what Caddy passes on unchanged; never X-Forwarded-Host, which a client can send through the CDN) against the
// host settings the shop already has — nothing is hardcoded here:
//   - the preview host `system.stagingHost` shows them;
//   - a store's own domain (StoreDomain, set at go-live) never does, and once the preview host is set no other public
//     host name does either;
//   - an internal address (a Docker service name such as the deploy's `app-blue:3000`, localhost, an IP literal) does:
//     those are reached only inside the server, never through Caddy's public site blocks.
// A host that cannot be read, or settings that do not answer, count as "not the preview" (the page is not shown).
import { headers } from 'next/headers';
import { getPrisma } from '@extas/db/client';
import { settingsResolver, settingsTimeoutMs, withTimeout } from './settings';

const HOST = /^[a-z0-9.-]+(:\d+)?$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
/** How long this process keeps the store domains it read (a new domain counts within this time). */
const DOMAINS_MEMO_MS = 60_000;

/** The host name of a Host header, lower case, without its port and trailing dot; null when it is not a plain host. */
export function hostOf(raw: string | null | undefined): string | null {
  const h = raw?.split(',')[0]?.trim().toLowerCase();
  if (!h) return null;
  if (/^\[[0-9a-f:]+\](:\d+)?$/.test(h)) return h.replace(/(:\d+)$/, '');
  if (!HOST.test(h)) return null;
  return h.replace(/:\d+$/, '').replace(/\.$/, '') || null;
}

/** Reached only inside the server: a single-label name (Docker service, localhost) or an IP literal. */
export function isInternalHost(host: string): boolean {
  return !host.includes('.') || IPV4.test(host) || host.startsWith('[');
}

/** Whether this host may see the status page and the health detail (see the file header). Pure, for the tests. */
export function showsDetail(host: string | null, o: { stagingHost: string | null; shopDomains: readonly string[] }): boolean {
  if (!host) return false;
  if (isInternalHost(host)) return true;
  const staging = hostOf(o.stagingHost);
  if (staging && host === staging) return true;
  if (o.shopDomains.some((d) => hostOf(d) === host)) return false;
  return staging === null;
}

const memo = globalThis as unknown as { __statusDomains?: { list: string[]; at: number } };

async function shopDomains(now = Date.now()): Promise<string[] | null> {
  if (!process.env.DATABASE_URL) return [];
  const hit = memo.__statusDomains;
  if (hit && now - hit.at < DOMAINS_MEMO_MS) return hit.list;
  try {
    const rows = await withTimeout(getPrisma().storeDomain.findMany({ where: { archivedAt: null }, select: { hostname: true } }), settingsTimeoutMs());
    const list = rows.map((r) => r.hostname);
    memo.__statusDomains = { list, at: now };
    return list;
  } catch {
    return hit?.list ?? null;
  }
}

/** The status page and the health detail for a request with this Host header (settings read with their timeout). */
export async function detailForHost(rawHost: string | null | undefined): Promise<boolean> {
  const host = hostOf(rawHost);
  if (!host) return false;
  if (isInternalHost(host)) return true;
  const r = settingsResolver();
  let stagingHost: string | null = null;
  if (r) {
    try {
      stagingHost = (await withTimeout(r.value('system.stagingHost'), settingsTimeoutMs())) ?? null;
    } catch {
      return false;
    }
  }
  const domains = await shopDomains();
  if (domains === null) return false;
  return showsDetail(host, { stagingHost, shopDomains: domains });
}

/** For a page: the request's own Host header. */
export async function pageShowsDetail(): Promise<boolean> {
  return detailForHost((await headers()).get('host'));
}
