// The admin API handlers (PR 15, 16, 495). Each route file under app/api/admin/ is one line that hands the request
// and the app's dependencies to a handler here, so the handlers are tested end to end on a real database
// (admin-api.db.test.ts). Every handler goes through guardAdmin first; the @extas/auth functions check the permission
// again. Answers carry stable codes, never text: the admin screens show text from their messages files.
import { MOTHER_STORE_ID } from '@extas/db/client';
import {
  assignRole,
  authLabel,
  beginTotpSetup,
  changeStaffPassword,
  createRole,
  createStaff,
  disableTotp,
  enableTotp,
  listRoles,
  listStaff,
  listStaffSessions,
  loginStaff,
  logoutEverywhere,
  logoutStaff,
  permissionCatalogue,
  permissionsFor,
  publicStaff,
  resetStaffTwoFactor,
  revokeRole,
  revokeStaffSession,
  setRoleArchived,
  updateRole,
  updateStaff,
  verifyStaffTwoFactor,
  type LoginResult,
  type NewStaffInput,
  type RoleInput,
  type RolePatch,
  type StaffPatch,
} from '@extas/auth';
import {
  body,
  CHALLENGE_COOKIE,
  clearCookie,
  errorResponse,
  fail,
  guardAdmin,
  isUuid,
  json,
  readCookie,
  requestContext,
  sameOrigin,
  SESSION_COOKIE,
  setCookie,
  staffDeps,
  type AdminDeps,
} from './admin-auth';
import { adminSettingsResponse } from './settings';
import { noteBotSignals } from './security/bot-check';
import { addressRefused } from './admin-security/access';

const str =(v: unknown) => (typeof v === 'string' ? v : '');
const isResponse = (v: unknown): v is Response => v instanceof Response;

function loginAnswer(r: LoginResult, now: Date): Response {
  switch (r.kind) {
    case 'session': {
      const res = json({ ok: true, staff: r.staff, expiresAt: r.expiresAt });
      res.headers.append('set-cookie', setCookie(SESSION_COOKIE, r.token, r.expiresAt, now));
      res.headers.append('set-cookie', clearCookie(CHALLENGE_COOKIE));
      return res;
    }
    case 'two-factor': {
      const res = json({ ok: true, twoFactor: true, expiresAt: r.expiresAt });
      res.headers.append('set-cookie', setCookie(CHALLENGE_COOKIE, r.challenge, r.expiresAt, now));
      return res;
    }
    case 'locked':
      return json({ ok: false, error: 'locked', retryAt: r.retryAt }, { status: 429, headers: { 'retry-after': String(Math.max(1, Math.ceil((r.retryAt.getTime() - now.getTime()) / 1000))) } });
    default:
      return fail(401, 'invalid-credentials');
  }
}

const nowOf = (deps: AdminDeps) => (deps.now ? deps.now() : new Date());

/** POST /api/admin/auth/login {email, password} */
export async function loginHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  try {
    // PR 380: the owner's optional address list (off by default) is checked before the password
    if (await addressRefused(deps.resolver, requestContext(request).ip)) return fail(403, 'ADDRESS_NOT_ALLOWED');
    const b = await body(request);
    // PR 379: the quiet bot check on the staff sign-in (a note in the security log, never a refusal)
    await noteBotSignals({ db: deps.db, settings: deps.resolver }, { form: 'adminSignIn', sent: b.human, storeId: null, ip: requestContext(request).ip ?? null });
    const r = await loginStaff(await staffDeps(deps), { email: str(b.email), password: str(b.password) }, requestContext(request));
    return loginAnswer(r, nowOf(deps));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/admin/auth/2fa {code} — the second step; the challenge is in its own cookie. */
export async function twoFactorHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  try {
    if (await addressRefused(deps.resolver, requestContext(request).ip)) return fail(403, 'ADDRESS_NOT_ALLOWED');
    const b = await body(request);
    const r = await verifyStaffTwoFactor(await staffDeps(deps), { challenge: readCookie(request, CHALLENGE_COOKIE) ?? '', code: str(b.code) }, requestContext(request));
    return loginAnswer(r, nowOf(deps));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/admin/auth/logout */
export async function logoutHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  try {
    await logoutStaff(await staffDeps(deps), readCookie(request, SESSION_COOKIE));
    const res = json({ ok: true });
    res.headers.append('set-cookie', clearCookie(SESSION_COOKIE));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/admin/auth/me — who is signed in, what is still to do, and what they may do in every store. */
export async function meHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const g = await guardAdmin(request, deps, { selfService: true });
  if (isResponse(g)) return g;
  try {
    const permissions = [...(await permissionsFor(g.deps.db, g.auth.staff.id))].sort();
    return json({ ok: true, staff: publicStaff(g.auth.staff), mustChangePassword: g.auth.mustChangePassword, mustSetUpTwoFactor: g.auth.mustSetUpTwoFactor, permissions });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/admin/auth/password {current, next} — every session ends; this device gets a fresh one. */
export async function passwordHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const g = await guardAdmin(request, deps, { selfService: true });
  if (isResponse(g)) return g;
  try {
    const b = await body(request);
    const r = await changeStaffPassword(g.deps, g.auth, { current: str(b.current), next: str(b.next) }, g.ctx);
    return loginAnswer(r, nowOf(deps!));
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/admin/auth/sessions — the device list. POST {sessionId} ends one; POST {all: true} logs out everywhere else. */
export async function sessionsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const g = await guardAdmin(request, deps, { selfService: true });
  if (isResponse(g)) return g;
  try {
    if (request.method === 'GET') return json({ ok: true, sessions: await listStaffSessions(g.deps, g.auth.staff.id, g.auth.session.id) });
    const b = await body(request);
    if (b.all === true) {
      const revoked = await logoutEverywhere(g.deps, g.auth.staff.id, { keepSessionId: g.auth.session.id }, g.ctx);
      return json({ ok: true, revoked });
    }
    if (!isUuid(b.sessionId)) return fail(400, 'INVALID_INPUT', ['sessionId']);
    await revokeStaffSession(g.deps, g.auth.staff.id, b.sessionId, g.ctx);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/admin/auth/totp {action: setup | enable | disable, code?} — the person's own two-step login. */
export async function totpHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const g = await guardAdmin(request, deps, { selfService: true });
  if (isResponse(g)) return g;
  try {
    const b = await body(request);
    if (b.action === 'setup') {
      // The authenticator app shows the shop's name (owner data, read on the server only) or a neutral label.
      const name = await deps!.resolver.value('store.name', { storeId: MOTHER_STORE_ID });
      const issuer = name ?? authLabel('totp.issuerFallback').en;
      return json({ ok: true, ...(await beginTotpSetup(g.deps, g.auth, { issuer }, g.ctx)) });
    }
    if (b.action === 'enable') {
      await enableTotp(g.deps, g.auth, str(b.code), g.ctx);
      return json({ ok: true });
    }
    if (b.action === 'disable') {
      await disableTotp(g.deps, g.auth, str(b.code), g.ctx);
      return json({ ok: true });
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/admin/permissions — the catalogue with its labels, for the role builder. */
export async function permissionsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'roles.read' });
  if (isResponse(g)) return g;
  return json({ ok: true, permissions: permissionCatalogue() });
}

/** GET /api/admin/roles[?archived=1] — POST {key?, nameEn, nameBn, descriptionEn?, descriptionBn?, permissions[]} */
export async function rolesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const isGet = request.method === 'GET';
  const g = await guardAdmin(request, deps, { permission: isGet ? 'roles.read' : 'roles.manage' });
  if (isResponse(g)) return g;
  try {
    if (isGet) {
      const includeArchived = new URL(request.url).searchParams.get('archived') === '1';
      return json({ ok: true, roles: await listRoles(g.deps.db, { includeArchived }) });
    }
    const b = await body(request);
    return json({ ok: true, role: await createRole(g.deps.db, g.actor, b as unknown as RoleInput, g.ctx) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** PATCH /api/admin/roles/:id {nameEn?, nameBn?, descriptionEn?, descriptionBn?, permissions?, archived?} */
export async function roleHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'roles.manage' });
  if (isResponse(g)) return g;
  if (!isUuid(id)) return fail(404, 'NOT_FOUND');
  try {
    const { archived, ...patch } = await body(request);
    let role = Object.keys(patch).length ? await updateRole(g.deps.db, g.actor, id, patch as RolePatch, g.ctx) : undefined;
    if (typeof archived === 'boolean') role = await setRoleArchived(g.deps.db, g.actor, id, archived, g.ctx);
    if (!role) return fail(400, 'INVALID_INPUT', ['(empty change)']);
    return json({ ok: true, role });
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/admin/staff — POST {email, displayName, password, phone?} adds an account (first password to change). */
export async function staffHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const isGet = request.method === 'GET';
  const g = await guardAdmin(request, deps, { permission: isGet ? 'staff.read' : 'staff.manage' });
  if (isResponse(g)) return g;
  try {
    if (isGet) return json({ ok: true, staff: await listStaff(g.deps.db, g.actor) });
    const b = await body(request);
    return json({ ok: true, staff: await createStaff(g.deps.db, g.deps.policy, g.actor, b as unknown as NewStaffInput, g.ctx) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** PATCH /api/admin/staff/:id {displayName?, status?, resetTwoFactor?: true} */
export async function staffMemberHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'staff.manage' });
  if (isResponse(g)) return g;
  if (!isUuid(id)) return fail(404, 'NOT_FOUND');
  try {
    const { resetTwoFactor, ...patch } = await body(request);
    if (resetTwoFactor === true) await resetStaffTwoFactor(g.deps.db, g.actor, id, g.ctx);
    const staff = Object.keys(patch).length ? await updateStaff(g.deps.db, g.actor, id, patch as StaffPatch, g.ctx) : undefined;
    return json({ ok: true, ...(staff && { staff }) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/admin/staff/:id/roles {action: 'assign', roleId, storeId: number | null} | {action: 'revoke', assignmentId}
 * The permission is checked for the store concerned inside assignRole / revokeRole.
 */
export async function staffRolesHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const g = await guardAdmin(request, deps);
  if (isResponse(g)) return g;
  if (!isUuid(id)) return fail(404, 'NOT_FOUND');
  try {
    const b = await body(request);
    if (b.action === 'assign') {
      const storeId = b.storeId === null || b.storeId === undefined ? null : b.storeId;
      if (!isUuid(b.roleId) || (storeId !== null && (typeof storeId !== 'number' || !Number.isInteger(storeId) || storeId < 1))) {
        return fail(400, 'INVALID_INPUT', ['roleId', 'storeId']);
      }
      return json({ ok: true, ...(await assignRole(g.deps.db, g.actor, { staffUserId: id, roleId: b.roleId, storeId: storeId as number | null }, g.ctx)) });
    }
    if (b.action === 'revoke') {
      if (!isUuid(b.assignmentId)) return fail(400, 'INVALID_INPUT', ['assignmentId']);
      const a = await g.deps.db.staffRoleAssignment.findUnique({ where: { id: b.assignmentId }, select: { staffUserId: true } });
      if (!a || a.staffUserId !== id) return fail(404, 'NOT_FOUND');
      await revokeRole(g.deps.db, g.actor, b.assignmentId, g.ctx);
      return json({ ok: true });
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/admin/settings[?storeId=n] — needs `settings.read` in that store (PR 491/492/510). */
export async function settingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'settings.read', storeId });
  if (isResponse(g)) return g;
  return adminSettingsResponse(request.url, deps!.resolver);
}
