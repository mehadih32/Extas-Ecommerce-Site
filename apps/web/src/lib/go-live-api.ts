// S19 · PR 393 (CN-031) — the go-live checklist's admin API (Settings → System → Go-live). `path` is what comes after
// /api/admin/go-live:
//   GET   /api/admin/go-live            every item now (lib/go-live.ts), with who confirmed the signed-off ones
//                                       (system.read)
//   POST  /api/admin/go-live/signoff    {key, done} confirm an item a person checks, or take the confirmation back
//                                       (system.golive); audited as `golive.signoff`
// It only reports and records confirmations: nothing is switched, opened or blocked by it.
import { audit } from '@extas/auth';
import { INSTALLATION } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { backupGateNow } from './backups-api';
import { goLiveChecks, SIGNOFF_KEYS } from './go-live';
import { runtimeState } from './status';

type Deps = Pick<AdminDeps, 'db' | 'resolver' | 'now'>;

/** The checklist now, and the names of the people who confirmed items. */
export async function goLiveNow(deps: Deps) {
  const [state, checks, signoff] = await Promise.all([runtimeState(), deps.resolver.value('golive.checks'), deps.resolver.value('golive.signoff')]);
  const [gate, domains] = await Promise.all([
    backupGateNow(deps, state),
    deps.db.storeDomain.findMany({ where: { isPrimaryHost: true, archivedAt: null }, select: { hostname: true } }),
  ]);
  const result = goLiveChecks({
    now: deps.now ? deps.now() : new Date(),
    checks,
    signoff,
    smoke: state.smoke,
    health: state.health,
    backups: { ready: gate.ready, todo: gate.checks.filter((c) => !c.ok).length },
    serverSetup: state.serverSetup,
    originCert: state.originCert,
    primaryHosts: domains.map((d) => d.hostname),
  });
  const ids = [...new Set(result.items.map((i) => i.by).filter((v): v is string => Boolean(v)))];
  const people = ids.length
    ? await deps.db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })
    : [];
  return { ...result, people: Object.fromEntries(people.map((p) => [p.id, p.displayName])) as Record<string, string> };
}

export async function goLiveRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const where = path.join('/');
  if (where !== '' && where !== 'signoff') return fail(404, 'not-found');
  if ((where === '' && m !== 'GET') || (where === 'signoff' && m !== 'POST')) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: where === '' ? 'system.read' : 'system.golive' });
  if (g instanceof Response) return g;
  try {
    if (where === '') return json({ ok: true, ...(await goLiveNow(deps!)) });
    const b = await body(request);
    const key = typeof b.key === 'string' ? b.key : '';
    if (!SIGNOFF_KEYS.includes(key) || typeof b.done !== 'boolean') {
      return json({ ok: false, error: 'golive.INVALID_INPUT', details: [`key: ${SIGNOFF_KEYS.join(', ')}; done: true or false`] }, { status: 400 });
    }
    const before = await deps!.resolver.value('golive.signoff');
    const next = { ...before };
    const now = (deps!.now ? deps!.now() : new Date()).toISOString();
    if (b.done) next[key] = { at: now, by: g.actor.staffUserId ?? null };
    else delete next[key];
    if (JSON.stringify(next) !== JSON.stringify(before)) {
      await deps!.resolver.set('golive.signoff', next, INSTALLATION, { actorId: g.actor.staffUserId ?? null, reason: 'Settings › System › Go-live' });
      await audit(
        deps!.db,
        g.actor,
        { action: 'golive.signoff', entityType: 'Setting', entityId: 'golive.signoff', before: { [key]: before[key] ?? null }, after: { [key]: next[key] ?? null }, storeId: null },
        g.ctx,
      );
    }
    return json({ ok: true, ...(await goLiveNow(deps!)) });
  } catch (e) {
    return errorResponse(e);
  }
}
