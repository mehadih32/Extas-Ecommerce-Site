// S03 · PR 90 (with 571, 99, 575, 104) — the combo admin API. The combos page (`/admin/combos`) and the combo report
// (`/admin/combos/report`) call these routes. Every route signs the person in (guardAdmin), checks the permission in
// the store it touches (`?storeId=`, default the mother store), then calls @extas/combos, which checks the permission
// again (and `combos.prices` for a set price, the owner's decision) and writes the audit log. Answers are
// `{ ok: true, … }` or `{ ok: false, error: CODE, details }`. One catch-all route (app/api/admin/combos/[[...path]])
// hands every path to `combosRoute`.
//
//   GET   /api/admin/combos                 the fixed combos
//   POST  /api/admin/combos                 {combo} a new fixed combo (a draft)
//   POST  /api/admin/combos/preview         {combo} the editor's live preview (nothing saved)
//   GET   /api/admin/combos/:id             one combo
//   PUT   /api/admin/combos/:id             {combo, version} change it
//   POST  /api/admin/combos/:id/price       {setPriceMinor, version?} the card's price box (combos.prices)
//   POST  /api/admin/combos/:id/flags       {autoApply?, sameColour?}
//   POST  /api/admin/combos/:id/active      {on} switch on, or off to the archive (combos.publish)
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cb from '@extas/combos';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

export type CombosPerm = cb.CombosPermission;

export interface Ctx {
  deps: cb.CombosDeps;
  who: cb.Who;
  url: URL;
  admin: AdminDeps;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export const combosDeps = (deps: AdminDeps): cb.CombosDeps => ({ db: deps.db, settings: deps.resolver, now: deps.now });

export async function handle(request: Request, deps: AdminDeps | null, permission: CombosPerm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: combosDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, url, admin: deps! });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

export const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
export const notFound = () => Promise.resolve(fail(404, 'not-found'));
const asRecord = (v: unknown) => v as unknown as Record<string, unknown>;
const versionOf = (b: Record<string, unknown>) => (typeof b.version === 'number' ? b.version : undefined);

/** Every combo admin route: `path` is what comes after /api/admin/combos. */
export async function combosRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b] = path;
  if (path.length > 2) return notFound();

  if (a === undefined) {
    if (m === 'GET') return handle(request, deps, 'combos.read', async (x) => ({ combos: await cb.listCombos(x.deps, x.who) }));
    if (m === 'POST') return handle(request, deps, 'combos.write', async (x) => ({ combo: await cb.createCombo(x.deps, x.who, (await body(request)).combo as cb.FixedComboInput) }), 201);
    return notAllowed();
  }
  if (a === 'preview') {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'combos.read', async (x) => ({ combo: await cb.previewCombo(x.deps, x.who, (await body(request)).combo as cb.FixedComboInput) }));
  }
  if (!isUuid(a)) return notFound();
  if (b === undefined) {
    if (m === 'GET') return handle(request, deps, 'combos.read', async (x) => ({ combo: asRecord(await cb.getCombo(x.deps, x.who, a)) }));
    if (m === 'PUT')
      return handle(request, deps, 'combos.write', async (x) => {
        const bd = await body(request);
        return { combo: await cb.updateCombo(x.deps, x.who, a, bd.combo as cb.FixedComboInput, versionOf(bd)) };
      });
    return notAllowed();
  }
  if (m !== 'POST') return notAllowed();
  if (b === 'price')
    return handle(request, deps, 'combos.write', async (x) => {
      const bd = await body(request);
      const v = bd.setPriceMinor === null ? null : Number(bd.setPriceMinor);
      return { combo: await cb.setComboPrice(x.deps, x.who, a, v === null || Number.isFinite(v) ? v : Number.NaN, versionOf(bd)) };
    });
  if (b === 'flags')
    return handle(request, deps, 'combos.write', async (x) => {
      const bd = await body(request);
      return { combo: await cb.setComboFlags(x.deps, x.who, a, { autoApply: typeof bd.autoApply === 'boolean' ? bd.autoApply : undefined, sameColour: typeof bd.sameColour === 'boolean' ? bd.sameColour : undefined }) };
    });
  if (b === 'active')
    return handle(request, deps, 'combos.publish', async (x) => {
      const bd = await body(request);
      if (typeof bd.on !== 'boolean') return fail(400, 'INVALID_INPUT', ['on']);
      return { combo: await cb.setComboActive(x.deps, x.who, a, bd.on) };
    });
  return notFound();
}
