// S19 · PR 393 (CN-031) — the go-live checklist's admin API (Settings → System → Go-live). `path` is what comes after
// /api/admin/go-live:
//   GET   /api/admin/go-live            every item now (lib/go-live.ts), with who confirmed the signed-off ones
//                                       (system.read)
//   POST  /api/admin/go-live/signoff    {key, done} confirm an item a person checks, or take the confirmation back
//                                       (system.golive); audited as `golive.signoff`
// It only reports and records confirmations: nothing is switched, opened or blocked by it.
import { audit } from '@extas/auth';
import { INSTALLATION } from '@extas/settings';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { backupGateNow } from './backups-api';
import { goLiveChecks, SIGNOFF_KEYS } from './go-live';
import { runtimeState } from './status';

type Deps = Pick<AdminDeps, 'db' | 'resolver' | 'now'>;

/** Something typed in: a non-empty text, list or number; a text in two languages counts when one is there. */
const filled = (v: unknown): boolean =>
  v == null
    ? false
    : typeof v === 'string'
      ? v.trim() !== ''
      : Array.isArray(v)
        ? v.length > 0
        : typeof v === 'object'
          ? Object.values(v as Record<string, unknown>).some(filled)
          : true;

/**
 * PR 399: the stores that go live (the mother store and every live or paused one), each with the owner's fields of
 * `golive.ownerData` still empty there and its switched-on delivery bands. Only names and counts leave here.
 */
async function ownerDataNow(deps: Deps) {
  const want = await deps.resolver.value('golive.ownerData');
  const stores = await deps.db.store.findMany({
    where: { archivedAt: null, OR: [{ isPrimary: true }, { status: { in: ['LIVE', 'PAUSED'] } }] },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  return Promise.all(
    stores.map(async (s) => {
      const missing: string[] = [];
      for (const key of want.keys) {
        let v: unknown = null;
        try {
          v = await (deps.resolver.value as (k: string, o: { storeId: number }) => Promise<unknown>)(key, { storeId: s.id });
        } catch {
          v = null; // a name the registry does not know counts as missing, so it is seen and fixed
        }
        if (!filled(v)) missing.push(key);
      }
      const bands = want.deliveryBand ? await deps.db.deliveryBand.count({ where: { storeId: s.id, enabled: true, archivedAt: null } }) : null;
      return { name: s.name, missing, bands };
    }),
  );
}

/** The checklist now, and the names of the people who confirmed items. */
export async function goLiveNow(deps: Deps) {
  const [state, checks, signoff] = await Promise.all([runtimeState(), deps.resolver.value('golive.checks'), deps.resolver.value('golive.signoff')]);
  const [wanted, seo] = await Promise.all([deps.resolver.value('golive.connections'), deps.resolver.value('seo.indexing', { storeId: MOTHER_STORE_ID })]); // the mother store's value, as Website → SEO saves it
  const [gate, domains, ownerData, on] = await Promise.all([
    backupGateNow(deps, state),
    deps.db.storeDomain.findMany({ where: { isPrimaryHost: true, archivedAt: null }, select: { hostname: true } }),
    ownerDataNow(deps),
    // PR 400: the switched-on connections of the kinds that must be live (any store's or the installation's)
    deps.db.integration.findMany({
      where: { enabled: true, archivedAt: null, kind: { in: [...wanted.kinds] } },
      select: { kind: true, provider: true, mode: true, lastTestOk: true },
    }),
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
    ownerData,
    connections: { kinds: wanted.kinds, on },
    searchEngines: seo.searchEngines,
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
