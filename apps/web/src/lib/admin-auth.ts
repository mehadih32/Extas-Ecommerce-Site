// The admin's door (PR 15, 16, 495; B6.5): the session cookie, the same-origin check on every state change, and the
// guard every admin API route calls before it does anything. The guard checks the session (idle and total time,
// paused account), then — unless the route is the person's own password/2FA set-up — that the first password was
// changed and that 2FA is set up when the owner requires it, then the permission for that action and store. The
// functions in @extas/auth check the permission again themselves, so no action depends on the page alone.
import { getPrisma, type PrismaClient } from '@extas/db/client';
import {
  AuthError,
  authenticateStaff,
  httpStatus,
  requirePermission,
  securityPolicy,
  type Actor,
  type PermissionKey,
  type RequestContext,
  type StaffAuth,
  type StaffAuthDeps,
} from '@extas/auth';
import { isCatalogueError } from '@extas/catalogue';
import { createVault, type Vault } from '@extas/vault';
import { settingsResolver, settingsTimeoutMs, withTimeout, type AppResolver } from './settings';

/** Cookie names. `__Host-` makes the browser insist on Secure, Path=/ and no Domain (the cookie stays on this host). */
export const SESSION_COOKIE = '__Host-admin_sid';
export const CHALLENGE_COOKIE = '__Host-admin_2fa';

export interface AdminDeps {
  db: PrismaClient;
  resolver: AppResolver;
  /** The credential vault (PR 493): 2FA seeds here, the Keys & connections page (PR 500). Null without a master key. */
  vault: Vault | null;
  now?: () => Date;
}

const holder = globalThis as unknown as { __adminVault?: Vault | null };

/** The app's dependencies, or null when the server gave it no database (CI, `next build`). */
export function adminDeps(): AdminDeps | null {
  const resolver = settingsResolver();
  if (!resolver) return null;
  if (holder.__adminVault === undefined) {
    const key = process.env.VAULT_MASTER_KEY;
    holder.__adminVault = key && key.length >= 32 ? createVault(getPrisma(), key) : null;
  }
  return { db: getPrisma(), resolver, vault: holder.__adminVault };
}

export async function staffDeps(deps: AdminDeps): Promise<StaffAuthDeps> {
  const policy = await withTimeout(securityPolicy(deps.resolver), settingsTimeoutMs());
  return { db: deps.db, policy, vault: deps.vault, now: deps.now };
}

export function json(body: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

/** An error code the admin screens turn into text from their messages file. */
export function fail(status: number, error: string, details?: string[]): Response {
  return json({ ok: false, error, ...(details?.length ? { details } : {}) }, { status });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AuthError) return fail(httpStatus(e.code), e.code, e.details);
  if (isCatalogueError(e)) return fail(e.status, e.code, e.details);
  console.warn(`admin api: ${(e instanceof Error ? e.message : String(e)).split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error'}`);
  return fail(500, 'server-error');
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** An httpOnly, Secure, SameSite=Strict cookie until `expiresAt`. */
export function setCookie(name: string, value: string, expiresAt: Date, now: Date = new Date()): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}`;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Where the request came from, for the logs: Cloudflare's header, then the proxy's, then Caddy's. */
export function requestContext(request: Request): RequestContext {
  const h = request.headers;
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  return { ip: ip || null, userAgent: h.get('user-agent'), source: 'admin-api' };
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF (Prohori R06 §2): a state change must come from this site. The browser's Fetch Metadata header decides when it
 * is there; otherwise the Origin header must name this host. A request with neither is refused.
 */
export function sameOrigin(request: Request): boolean {
  if (SAFE.has(request.method.toUpperCase())) return true;
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export interface Guarded {
  auth: StaffAuth;
  actor: Actor;
  deps: StaffAuthDeps;
  ctx: RequestContext;
  /** Permissions held in the checked scope (when a permission was asked for). */
  permissions?: Set<PermissionKey>;
}

export interface GuardOptions {
  permission?: PermissionKey;
  /** The store the action touches; omitted = installation-wide. */
  storeId?: number | null;
  /** The person's own password change and 2FA set-up work before those are done. */
  selfService?: boolean;
}

/** Returns the signed-in staff member, or the refusal to send. */
export async function guardAdmin(request: Request, deps: AdminDeps | null, opts: GuardOptions = {}): Promise<Guarded | Response> {
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  try {
    const sd = await staffDeps(deps);
    const auth = await authenticateStaff(sd, readCookie(request, SESSION_COOKIE));
    if (!auth) return fail(401, 'UNAUTHENTICATED');
    if (!opts.selfService && auth.mustChangePassword) return fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (!opts.selfService && auth.mustSetUpTwoFactor) return fail(403, 'TWO_FACTOR_SETUP_REQUIRED');
    const actor: Actor = { staffUserId: auth.staff.id };
    const permissions = opts.permission ? await requirePermission(deps.db, actor, opts.permission, { storeId: opts.storeId }) : undefined;
    return { auth, actor, deps: sd, ctx: requestContext(request), permissions };
  } catch (e) {
    return errorResponse(e);
  }
}

/** Reads a JSON body; a missing or broken body is an empty object (the validation then names what is missing). */
export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const v = (await request.json()) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
