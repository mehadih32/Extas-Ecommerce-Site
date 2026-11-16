// D10 · PR 1004–1006 — the three small saves of the System screens, as prototype v5 draws them:
//   POST /api/admin/system-settings  {action:'schedule', everyHours, keepOnServer}        (`system.backup`)  → `backups.schedule`
//                                    {action:'healthChecks', telegramAlerts, auditEvery}  (`settings.write`) → `health.checks`
//                                    {action:'updatesAuto', auto}                         (`settings.write`) → `updates.auto`
// Each is one setting written through the resolver (so the change is in the audit log with who and when); nothing else moves.
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { backupsScheduleSchema, healthChecksSchema, INSTALLATION, updatesAutoSchema } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

export async function systemSettingsRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'system.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!deps) return fail(503, 'unavailable');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  try {
    const b = await body(request);
    const meta = (reason: string) => ({ actorId: g.actor.staffUserId ?? null, reason });
    if (b.action === 'schedule') {
      await requirePermission(deps.db, g.actor, 'system.backup', { storeId: MOTHER_STORE_ID });
      const v = backupsScheduleSchema.safeParse({ everyHours: b.everyHours, keepOnServer: b.keepOnServer });
      if (!v.success) return fail(400, 'INVALID_INPUT', v.error.issues.map((i) => i.path.join('.')));
      await deps.resolver.set('backups.schedule', v.data, INSTALLATION, meta('Settings › Backups & restore: schedule'));
      return json({ ok: true, schedule: v.data });
    }
    if (b.action === 'healthChecks') {
      await requirePermission(deps.db, g.actor, 'settings.write', { storeId: MOTHER_STORE_ID });
      const v = healthChecksSchema.safeParse({ telegramAlerts: b.telegramAlerts, auditEvery: b.auditEvery });
      if (!v.success) return fail(400, 'INVALID_INPUT', v.error.issues.map((i) => i.path.join('.')));
      await deps.resolver.set('health.checks', v.data, INSTALLATION, meta('Settings › Site health: alerts and checks'));
      return json({ ok: true, checks: v.data });
    }
    if (b.action === 'updatesAuto') {
      await requirePermission(deps.db, g.actor, 'settings.write', { storeId: MOTHER_STORE_ID });
      const v = updatesAutoSchema.safeParse({ auto: b.auto });
      if (!v.success) return fail(400, 'INVALID_INPUT', v.error.issues.map((i) => i.path.join('.')));
      await deps.resolver.set('updates.auto', v.data, INSTALLATION, meta('Settings › Updates & versions: how updates arrive'));
      return json({ ok: true, auto: v.data.auto });
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
