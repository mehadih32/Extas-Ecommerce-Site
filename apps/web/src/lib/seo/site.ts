// S11 · PR 220 — the shop's own address for canonical links, hreflang and JSON-LD (Blueprint C12.1: absolute https
// addresses). The domain is data, never code: the store's primary domain (StoreDomain, set at go-live), else the
// preview host the server was given (`system.stagingHost`), else the host the request came in on. Whether the request
// came in on the primary domain decides if the shop may be listed at all (lib/seo/indexing robotsOf): the preview is
// never open to search engines. Read once per request; the domain row is kept a minute in this process.
import { cache } from 'react';
import { headers } from 'next/headers';
import { getPrisma } from '@extas/db/client';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';

export interface SiteAddress {
  /** The origin every absolute shop link uses; undefined when none is known (no host at all). */
  origin: URL | undefined;
  /** The request came in on the store's primary domain. */
  onPrimary: boolean;
}

const HOST = /^[a-z0-9.-]+(:\d+)?$/i;
/** How long this process keeps the primary domain it read (a new domain shows within this time). */
const DOMAIN_MEMO_MS = 60_000;

const memo = globalThis as unknown as { __seoPrimary?: Map<number, { host: string | null; at: number }> };

/** The store's primary domain (lower case), or null; null as well when the database does not answer in time. */
export async function primaryDomain(storeId: number, now = Date.now()): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  const map = (memo.__seoPrimary ??= new Map());
  const hit = map.get(storeId);
  if (hit && now - hit.at < DOMAIN_MEMO_MS) return hit.host;
  try {
    const row = await withTimeout(
      getPrisma().storeDomain.findFirst({ where: { storeId, isPrimaryHost: true, archivedAt: null }, select: { hostname: true }, orderBy: { createdAt: 'asc' } }),
      settingsTimeoutMs(),
    );
    const host = row?.hostname.trim().toLowerCase() || null;
    map.set(storeId, { host, at: now });
    return host;
  } catch {
    return hit?.host ?? null;
  }
}

async function stagingHost(storeId: number): Promise<string | null> {
  const r = settingsResolver();
  if (!r) return null;
  try {
    return (await withTimeout(r.value('system.stagingHost', { storeId }), settingsTimeoutMs())) ?? null;
  } catch {
    return null;
  }
}

/** The request's own host (as the proxy in front sent it), when it is a plain host name. */
async function requestHost(): Promise<string | null> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host'))?.split(',')[0]?.trim().toLowerCase();
  return host && HOST.test(host) ? host : null;
}

const local = (host: string) => /^(localhost|127\.)/.test(host);

/** The shop's address for this request (see the file header). */
export const siteAddress = cache(async (storeId: number): Promise<SiteAddress> => {
  const [primary, staging, asked] = await Promise.all([primaryDomain(storeId), stagingHost(storeId), requestHost()]);
  const host = primary ?? staging ?? asked;
  if (!host) return { origin: undefined, onPrimary: false };
  const plain = !primary && !staging && asked !== null && (local(asked) || (await headers()).get('x-forwarded-proto') === 'http');
  return { origin: new URL(`${plain ? 'http' : 'https'}://${host}`), onPrimary: primary !== null && asked === primary };
});
