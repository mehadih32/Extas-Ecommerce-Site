// S18 · PR 378 (Blueprint B6.1) — the gate the proxy puts in front of every API call, and the page protection header it
// adds to every page. Pure: no database and no heavy import (the proxy runs before any page code). The values come from
// the settings (registry-web-security.ts), which the server reads and leaves here (lib/security/edge-load.ts); until it
// has read them once, the gate still refuses cross-site changes but counts nothing and sends no page policy (Caddy's
// own short policy is always there underneath).
//
// 1. Cross-site check (CSRF) for every API call that changes something — the same rule each handler applies itself
//    (same-origin.ts), so a handler that forgot it is still covered. Only the callers that prove themselves another way
//    pass without it: signed webhooks, the payment gateways' callbacks, the ERP's signed calls, the deploy's internal
//    hook (closed by Caddy from outside, plus a token) and the browser's own policy reports (they change nothing).
// 2. Requests a minute per address, per kind (sign-in, checkout, other shop changes, reports, webhooks). In `observe`
//    (the default) an address over its limit is only logged; in `enforce` it is told to try again when its minute ends.
//    Counted per server copy (Cloudflare's rules, PR 386, are the shared layer in front). The admin's own calls are
//    never counted: they need a signed-in staff member with 2FA when the owner requires it.
import type { CspMode, RateBucket, RateLimitMode, RatePerMinute } from '@extas/settings';
import { isSafeMethod, sameOriginRequest, type OriginHeaders } from './same-origin';

/** An API address that proves itself without the cross-site check, and how its handler checks the caller. */
export interface ExemptRoute {
  prefix: string;
  /** What proves the caller (the route review test looks for it in the handler). */
  proof: string;
  why: string;
}

export const CSP_REPORT_PATH = '/api/security/csp-report';

/** Every exempt prefix. Adding one needs its proof in the handler (lib/security/route-review.test.ts checks it). */
export const EXEMPT_ROUTES: readonly ExemptRoute[] = [
  { prefix: '/api/erp/webhook', proof: 'signature', why: 'the ERP signs every message (PR 196)' },
  { prefix: '/api/whatsapp/webhook', proof: 'WHATSAPP_SIGNATURE_HEADER', why: 'Meta signs every message; the subscribe check needs the verify token (PR 292)' },
  { prefix: '/api/messenger/webhook', proof: 'MESSENGER_SIGNATURE_HEADER', why: 'Meta signs every Messenger message with the app secret; the subscribe check needs the verify token (PR 426)' },
  { prefix: '/api/payments/callback/', proof: 'receiveCallback', why: 'the gateway calls back from its own site; what it claims is checked with the gateway (PR 167)' },
  { prefix: '/api/internal/', proof: 'CACHE_HOOK_TOKEN', why: 'the deploy calls inside the server; Caddy answers 404 from outside (PR 602)' },
  { prefix: '/erp-api/', proof: 'signature', why: 'the ERP signs every call with its key (PR 620)' },
  { prefix: CSP_REPORT_PATH, proof: 'cspReportHandler', why: 'the browser reports what the page policy stopped; nothing is changed' },
];

/** PR 234: a real visitor's page sends its speed readings here (same-site, counted like the other reports). */
export const VITALS_REPORT_PATH = '/api/shop/vitals';

/** True when `path` is under `prefix`: the address itself or below it, never a longer name (`/api/erp/webhookx`). */
export function underPrefix(path: string, prefix: string): boolean {
  const base = prefix.replace(/\/$/, '');
  return path === base || path.startsWith(`${base}/`);
}

const exemptOf = (path: string): ExemptRoute | undefined => EXEMPT_ROUTES.find((r) => underPrefix(path, r.prefix));

/** Admin sign-in steps: counted as sign-in. Every other admin call is never counted. */
const ADMIN_SIGN_IN = ['/api/admin/auth/login', '/api/admin/auth/2fa', '/api/admin/auth/totp', '/api/admin/auth/password'];

/** Which limit a call counts against, or null when it is not counted. */
export function rateBucketOf(method: string, path: string): RateBucket | null {
  if (path === CSP_REPORT_PATH) return 'report';
  if (exemptOf(path)) return path.startsWith('/api/internal/') ? null : 'webhook';
  if (path === VITALS_REPORT_PATH) return 'report';
  if (isSafeMethod(method)) return null;
  if (ADMIN_SIGN_IN.some((p) => path === p)) return 'signIn';
  if (path.startsWith('/api/admin/')) return null;
  if (path.startsWith('/api/account/') && !path.startsWith('/api/account/review')) return 'signIn';
  if (path.startsWith('/api/checkout/') || path.startsWith('/api/pay/')) return 'checkout';
  if (path.startsWith('/api/')) return 'shopWrite';
  return null;
}

/** True when the API call needs the cross-site check (it changes something and proves nothing else). */
export const needsSameOrigin = (method: string, path: string): boolean => !isSafeMethod(method) && !exemptOf(path);

/** What the server read from the settings, as the gate uses it. */
export interface EdgePolicy {
  csp: { mode: CspMode; header: string | null };
  rate: { mode: RateLimitMode; perMinute: RatePerMinute; maxTracked: number };
}

const G = globalThis as unknown as { __extasEdgePolicy?: EdgePolicy; __extasRate?: RateCounter };

export const setEdgePolicy = (p: EdgePolicy): void => {
  G.__extasEdgePolicy = p;
};
export const edgePolicy = (): EdgePolicy | null => G.__extasEdgePolicy ?? null;

const WINDOW_MS = 60_000;

/** Fixed one-minute windows per kind and address; the oldest addresses are dropped first past `maxTracked`. */
export class RateCounter {
  private readonly seen = new Map<string, { start: number; count: number; logged: boolean }>();

  /** Counts one request; returns how many this address sent this minute, and when the minute ends. */
  hit(key: string, now: number, maxTracked: number): { count: number; resetAt: number; first: boolean } {
    let e = this.seen.get(key);
    if (!e || now - e.start >= WINDOW_MS) {
      if (e) this.seen.delete(key);
      e = { start: now, count: 0, logged: false };
      this.seen.set(key, e);
      if (this.seen.size > maxTracked) {
        const drop = Math.max(1, Math.ceil(maxTracked / 10));
        let i = 0;
        for (const k of this.seen.keys()) {
          if (k === key) continue;
          this.seen.delete(k);
          if (++i >= drop) break;
        }
      }
    }
    e.count += 1;
    const first = !e.logged;
    return { count: e.count, resetAt: e.start + WINDOW_MS, first };
  }

  /** Marks this minute's over-limit line as written (one line a minute per address). */
  logged(key: string): void {
    const e = this.seen.get(key);
    if (e) e.logged = true;
  }

  get size(): number {
    return this.seen.size;
  }
}

const counter = (): RateCounter => (G.__extasRate ??= new RateCounter());

/** A short, stable tag for an address in a log line (never the address itself). */
export function addressTag(ip: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The caller's address as Caddy hands it on (CF-Connecting-IP is Caddy's own answer; admin-auth.ts requestContext). */
export function clientAddress(h: OriginHeaders): string {
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
}

export type GateAnswer = { kind: 'pass' } | { kind: 'refuse'; status: 403 | 429; error: string; retryAfterSeconds?: number };

export interface GateRequest {
  method: string;
  path: string;
  url: string;
  headers: OriginHeaders;
}

/** The gate's answer for one API call. `log` hears the over-limit lines. */
export function apiGate(
  req: GateRequest,
  opts: { policy?: EdgePolicy | null; now?: number; counter?: RateCounter; log?: (line: string) => void } = {},
): GateAnswer {
  if (needsSameOrigin(req.method, req.path) && !sameOriginRequest(req.method, req.headers, req.url)) {
    return { kind: 'refuse', status: 403, error: 'cross-site-request' };
  }
  const policy = opts.policy === undefined ? edgePolicy() : opts.policy;
  if (!policy || policy.rate.mode === 'off') return { kind: 'pass' };
  const bucket = rateBucketOf(req.method, req.path);
  if (!bucket) return { kind: 'pass' };
  const now = opts.now ?? Date.now();
  const c = opts.counter ?? counter();
  const ip = clientAddress(req.headers);
  const key = `${bucket}:${ip}`;
  const limit = policy.rate.perMinute[bucket];
  const { count, resetAt, first } = c.hit(key, now, policy.rate.maxTracked);
  if (count <= limit) return { kind: 'pass' };
  if (first) {
    c.logged(key);
    (opts.log ?? console.warn)(`rate-limit (${policy.rate.mode}): ${bucket} over ${limit}/min from address ${addressTag(ip)}`);
  }
  if (policy.rate.mode === 'observe') return { kind: 'pass' };
  return { kind: 'refuse', status: 429, error: 'RATE_LIMITED', retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
}

/** The page protection header to send on a page, or null (off, or not read yet). */
export function pageCspHeader(policy: EdgePolicy | null = edgePolicy()): { name: string; value: string } | null {
  if (!policy || policy.csp.mode === 'off' || !policy.csp.header) return null;
  return {
    name: policy.csp.mode === 'enforce' ? 'content-security-policy' : 'content-security-policy-report-only',
    value: policy.csp.header,
  };
}
