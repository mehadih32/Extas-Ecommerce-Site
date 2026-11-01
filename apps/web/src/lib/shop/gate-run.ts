// S07 · PR 170 follow-up (the go-live gate's first live run, 1 Nov) — the go-live gate runs (tools/gate-orders,
// tools/gate-c360; the owner's OK of 1 Nov 2026 for test orders on the preview) pay on the practice gateway for their
// own run only. The live run skipped every order: cash on delivery is the owner's switch (off) and the practice
// gateway's page is closed while `payments.testPayments` is off (follow-up 50, the go-live guard) — rightly, for every
// real visitor. The gate never switches that setting on for everyone; instead:
//
// - the gate's server side (tools/gate-orders/lib/test-shop.ts) opens a grant for one run: a row of the
//   IdempotencyKey table with scope `gate-run.mock-pay`, the run's id as key, the SHA-256 of a random token of this run
//   (the token itself is never stored), the preview host it was opened for and a short expiry; written with an audit
//   line as the system actor, and closed again at the end of the run (on failure and on a signal too: the shell's trap);
// - only the gate's own browser holds the token, in this cookie (`<run id>.<token>`), added to its browser contexts by
//   the gate itself — the shop never sets it, so a real visitor never has it;
// - while the cookie matches an open grant, on the host the grant names (the preview host, never a host the shop sells
//   on), this request reads `payments.testPayments` as on: the practice gateway's page, its callback and the mobile
//   wallet tiles answer as on a test server. Nothing else changes: no real gateway is touched (a connected gateway
//   still wins, follow-up 50), and no price, discount, charge or cash-on-delivery amount moves.
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getPrisma } from '@extas/db/client';
import type { Key, Value } from '@extas/settings';

export const GATE_RUN_COOKIE = 'extas_gate_run';
/** The IdempotencyKey scope of a gate run's grant (tools/gate-orders/lib/test-shop.ts writes it). */
export const GATE_RUN_SCOPE = 'gate-run.mock-pay';
/** The one setting a grant answers for. */
const TEST_PAYMENTS = 'payments.testPayments';

const RUN_ID = /^[A-Za-z0-9-]{1,24}$/;
const TOKEN = /^[a-f0-9]{64}$/;
/** A grant read is kept this long per cookie (a closed grant stops answering within it). */
const KEEP_MS = 5_000; // hardcode-ok: a cache window of the gate's own check, not a business number

/** The run id and the token of a gate cookie, or null when it is not one. */
export function parseGateCookie(raw: string | null | undefined): { runId: string; token: string } | null {
  const v = String(raw ?? '');
  const dot = v.indexOf('.');
  if (dot < 1) return null;
  const runId = v.slice(0, dot);
  const token = v.slice(dot + 1);
  return RUN_ID.test(runId) && TOKEN.test(token) ? { runId, token } : null;
}

/** The SHA-256 of a token, in hex (what the grant keeps). */
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

/** The request's host as a plain lower-case name (the proxy's forwarded host first; no port). */
export function plainHost(forwarded: string | null | undefined, host: string | null | undefined): string {
  return String(forwarded || host || '')
    .split(',')[0]!
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

/** A grant as the table holds it (only the fields read here). */
export interface GateGrant {
  requestHash: string;
  responseBody: unknown;
  expiresAt: Date;
  completedAt: Date | null;
}

/**
 * Whether a grant lets this request use the practice gateway: open (not closed, not expired), for this host, and the
 * token's hash is the grant's. `stagingHost` is the shop's saved preview host (`system.stagingHost`): when saved, the
 * host must be it; `storeHosts` the hosts the shop sells on, never allowed.
 */
export function grantAllows(grant: GateGrant | null, o: { token: string; host: string; now: Date; stagingHost: string | null; storeHosts: readonly string[] }): boolean {
  if (!grant || grant.completedAt || grant.expiresAt.getTime() <= o.now.getTime()) return false;
  const body = grant.responseBody as { host?: unknown } | null;
  const host = typeof body?.host === 'string' ? body.host.toLowerCase() : '';
  if (!o.host || host !== o.host) return false;
  if (o.stagingHost && o.stagingHost.toLowerCase() !== o.host) return false;
  if (o.storeHosts.some((h) => h.toLowerCase() === o.host)) return false;
  const want = Buffer.from(grant.requestHash, 'utf8');
  const got = Buffer.from(tokenHash(o.token), 'utf8');
  return want.length === got.length && timingSafeEqual(want, got);
}

/** What reads the settings (the app's resolver, or a wrapper of it). */
export interface Reader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

const kept = new Map<string, { ok: boolean; at: number }>();

/** Reads the grant a cookie names and checks it (false on any doubt, and outside a request). */
async function checkCookie(raw: string, host: string, settings: Reader): Promise<boolean> {
  const c = parseGateCookie(raw);
  if (!c) return false;
  const memo = `${raw}@${host}`;
  const hit = kept.get(memo);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.ok;
  let ok = false;
  try {
    const db = getPrisma();
    const [grant, stagingHost, domains] = await Promise.all([
      db.idempotencyKey.findUnique({ where: { scope_key: { scope: GATE_RUN_SCOPE, key: c.runId } }, select: { requestHash: true, responseBody: true, expiresAt: true, completedAt: true } }),
      settings.value('system.stagingHost'),
      db.storeDomain.findMany({ where: { archivedAt: null }, select: { hostname: true } }),
    ]);
    ok = grantAllows(grant, { token: c.token, host, now: new Date(), stagingHost: stagingHost ?? null, storeHosts: domains.map((d) => d.hostname) });
  } catch {
    ok = false;
  }
  if (kept.size > 50) kept.clear(); // hardcode-ok: a memory bound of the gate's own check
  kept.set(memo, { ok, at: Date.now() });
  return ok;
}

/** Whether this request is the gate's own browser with an open grant of its run (never a real visitor). */
export async function gateRunOn(settings: Reader): Promise<boolean> {
  let raw: string | undefined;
  let host = '';
  try {
    raw = (await cookies()).get(GATE_RUN_COOKIE)?.value;
    if (!raw) return false;
    const h = await headers();
    host = plainHost(h.get('x-forwarded-host'), h.get('host'));
  } catch {
    return false; // outside a request (a worker, a build): never
  }
  return checkCookie(raw, host, settings);
}

/**
 * The settings as they are, except that `payments.testPayments` reads as on for the gate's own browser while its run's
 * grant is open (the checkout's and the shop payments' dependencies; the admin's are never wrapped).
 */
export function gateRunSettings(settings: Reader, on: (s: Reader) => Promise<boolean> = gateRunOn): Reader {
  return {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const v = await settings.value(key, opts);
      if (key !== TEST_PAYMENTS || v === true) return v;
      return ((await on(settings)) ? true : v) as Value<K>;
    },
  };
}
