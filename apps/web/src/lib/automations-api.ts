// S14 · PR 289 — Messages › Automations' API (customer journeys; @extas/customers journeys.ts). Every route signs the staff
// member in and checks the store; the service checks the permission again (seeing: `messages.journey.read`; building,
// switching, archiving and the settings: `messages.automations.write`), and every change is audited there.
//
//   GET   /api/admin/messages/automations                the journeys with their people and messages sent, the settings
//   PUT   /api/admin/messages/automations/settings       the page's settings card (`customers.journeys`)
//   POST  /api/admin/messages/automations                {name, trigger, plan} a new journey (saved off)
//   GET   /api/admin/messages/automations/:id            one journey with the templates and the pickers' lists
//   POST  /api/admin/messages/automations/:id            {name, trigger, plan, version} a change (STALE in between)
//   POST  /api/admin/messages/automations/:id/switch     {enabled} on or off
//   POST  /api/admin/messages/automations/:id/archive    {archived} archive (everyone on it stops) or restore; never deleted
import * as cu from '@extas/customers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { customersDeps } from './customers-api';

type Perm = typeof cu.JOURNEYS_READ | typeof cu.JOURNEYS_WRITE;

async function handle(request: Request, deps: AdminDeps | null, permission: Perm, fn: (d: cu.CustomersDeps, who: cu.Who) => Promise<Record<string, unknown>>, status = 200): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission, storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  try {
    return json({ ok: true, ...(await fn(customersDeps(deps!), { actor: g.actor, storeId: MOTHER_STORE_ID, ctx: g.ctx })) }, { status });
  } catch (e) {
    if (cu.isCustomersError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));

/** Every automations route: `path` is what comes after /api/admin/messages/automations. */
export async function automationsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, sub, more] = path;
  if (more !== undefined) return fail(404, 'not-found');
  if (!id) {
    if (m === 'GET') return handle(request, deps, cu.JOURNEYS_READ, async (d, who) => ({ screen: await cu.journeysScreen(d, who) }));
    if (m === 'POST') return handle(request, deps, cu.JOURNEYS_WRITE, async (d, who) => ({ editor: await cu.saveJourney(d, who, null, await body(request)) }), 201);
    return notAllowed();
  }
  if (id === 'settings' && !sub) return m === 'PUT' ? handle(request, deps, cu.JOURNEYS_WRITE, async (d, who) => ({ screen: await cu.saveJourneysSettings(d, who, await body(request)) })) : notAllowed();
  if (!sub) {
    if (m === 'GET')
      return handle(request, deps, cu.JOURNEYS_READ, async (d, who) => {
        const editor = await cu.journeyEditor(d, who, id);
        if (!editor) throw new cu.CustomersError('NOT_FOUND', 'no such journey', ['journeyId']);
        return { editor };
      });
    if (m === 'POST') return handle(request, deps, cu.JOURNEYS_WRITE, async (d, who) => ({ editor: await cu.saveJourney(d, who, id, await body(request)) }));
    return notAllowed();
  }
  if (m !== 'POST') return notAllowed();
  if (sub === 'switch') return handle(request, deps, cu.JOURNEYS_WRITE, async (d, who) => ({ editor: await cu.switchJourney(d, who, id, await body(request)) }));
  if (sub === 'archive') return handle(request, deps, cu.JOURNEYS_WRITE, async (d, who) => ({ result: await cu.archiveJourney(d, who, id, await body(request)) }));
  return fail(404, 'not-found');
}
