// CSRF (Prohori R06 §2; PR 378 review): a state change must come from this site. The browser's Fetch Metadata header
// decides when it is there; otherwise the Origin header must name this host. A request with neither is refused. Pure
// (no database, no heavy import), so the proxy (lib/security/edge-gate.ts) and every route handler (admin-auth.ts
// `sameOrigin`) use the same rule.

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True for a method that only reads. */
export const isSafeMethod = (method: string): boolean => SAFE.has(method.toUpperCase());

/** The headers the rule reads. */
export interface OriginHeaders {
  get(name: string): string | null;
}

/** True when a request may change something: a reading method, or one that comes from this site. */
export function sameOriginRequest(method: string, headers: OriginHeaders, url: string): boolean {
  if (isSafeMethod(method)) return true;
  const site = headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const origin = headers.get('origin');
  if (!origin) return false;
  try {
    const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? new URL(url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
