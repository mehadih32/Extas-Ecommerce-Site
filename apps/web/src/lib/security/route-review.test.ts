// S18 · PR 378 — the end-to-end review of the API's doors, kept as a test so a new route cannot skip it:
// 1. every route that changes something is either behind the cross-site check (the proxy's, and its own) or on the
//    exempt list — and an exempt route's handler really checks its caller (its proof is in the code);
// 2. the proxy sees every API call and every admin page (its matcher), and the internal hook stays closed in Caddy;
// 3. the security headers Caddy adds to every answer are there, with the short page policy that is always on.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../../proxy';
import { EXEMPT_ROUTES, needsSameOrigin, underPrefix } from './edge-gate';

const APP = join(__dirname, '..', '..', 'app');
const SRC = join(__dirname, '..', '..');
const REPO = join(SRC, '..', '..', '..');

function* routes(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* routes(p);
    else if (name === 'route.ts') yield p;
  }
}

/** `app/api/payments/callback/[provider]/route.ts` → `/api/payments/callback/x`. */
const urlOf = (file: string) =>
  '/' +
  relative(APP, file)
    .replace(/\/route\.ts$/, '')
    .split('/')
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => (s.startsWith('[') ? 'x' : s))
    .join('/');

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const MUTATING = /export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE)\b/g;

/** The route file and the app modules it imports (`@/lib/…`), comments removed. */
function codeOf(file: string): string {
  const text = readFileSync(file, 'utf8');
  const mods = [...text.matchAll(/from\s+'@\/(lib\/[^']+)'/g)].map((m) => m[1]!);
  const parts = [strip(text)];
  for (const m of mods) {
    for (const ext of ['.ts', '/index.ts']) {
      try {
        parts.push(strip(readFileSync(join(SRC, m + ext), 'utf8')));
        break;
      } catch {
        /* try the next form */
      }
    }
  }
  return parts.join('\n');
}

const all = [...routes(APP)].map((f) => ({ file: f, url: urlOf(f), methods: [...readFileSync(f, 'utf8').matchAll(MUTATING)].map((m) => m[1]!) }));

describe('PR 378 route review', () => {
  it('finds the routes (sanity)', () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all.some((r) => r.url === '/api/checkout/orders' && r.methods.includes('POST'))).toBe(true);
  });

  it('every route that changes something is behind the cross-site check, or exempt with its proof in the code', () => {
    const problems: string[] = [];
    for (const r of all) {
      for (const m of r.methods) {
        if (needsSameOrigin(m, r.url)) continue; // the proxy refuses a cross-site call before the handler runs
        const ex = EXEMPT_ROUTES.find((e) => underPrefix(r.url, e.prefix));
        if (!ex) problems.push(`${m} ${r.url}: exempt but not listed`);
        else if (!codeOf(r.file).includes(ex.proof)) problems.push(`${m} ${r.url}: exempt (${ex.why}) but its handler never checks "${ex.proof}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every exempt prefix still names a route that exists', () => {
    for (const e of EXEMPT_ROUTES) expect(all.some((r) => underPrefix(r.url, e.prefix)), e.prefix).toBe(true);
  });

  it('the proxy sees every API call and every admin page', () => {
    const m = config.matcher as string[];
    for (const p of ['/api/:path*', '/erp-api/:path*', '/admin', '/admin/:path*']) expect(m).toContain(p);
  });

  it('Caddy adds the security headers and the short page policy to every answer, and keeps the internal hook closed', () => {
    const caddy = readFileSync(join(REPO, 'infra/stack/caddy/Caddyfile'), 'utf8');
    const block = caddy.slice(caddy.indexOf('(security_headers)'), caddy.indexOf('}', caddy.indexOf('header {', caddy.indexOf('(security_headers)'))));
    for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options "nosniff"', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'X-Permitted-Cross-Domain-Policies "none"', '-Server']) {
      expect(block, h).toContain(h);
    }
    expect(block).toMatch(/\?Content-Security-Policy "object-src 'none'; base-uri 'self'; frame-ancestors 'self'"/);
    expect(block).toContain('geolocation=(self)'); // the checkout's location share (GpsShare) needs it
    expect(caddy).toMatch(/@internal path \/api\/internal \/api\/internal\/\*\s+respond @internal 404/);
  });
});
