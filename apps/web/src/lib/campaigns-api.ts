// S14 · PR 300 — Messages › Campaigns' API (win-back campaigns; @extas/customers winback.ts). Every route signs the staff
// member in and checks the store; the service checks the permission again (seeing: `messages.journey.read`; drafts and
// the settings: `messages.campaigns.write`; schedule, pause, resume and cancel: `messages.campaigns.send`), and every
// change is audited there.
//
//   GET   /api/admin/messages/campaigns                   the campaigns and the settings
//   PUT   /api/admin/messages/campaigns/settings          the page's settings card (`customers.winback`)
//   POST  /api/admin/messages/campaigns/items             {name, channel, templateId, segmentId, rule} a draft
//   GET   /api/admin/messages/campaigns/items/:id         one campaign with its audience and results
//   POST  /api/admin/messages/campaigns/items/:id         {…, version} a change of a draft
//   POST  /api/admin/messages/campaigns/items/:id/state   {action: schedule|pause|resume|cancel, at?, version?}
import * as cu from '@extas/customers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { customersDeps } from './customers-api';

type Perm = typeof cu.CAMPAIGN_READ | typeof cu.CAMPAIGN_WRITE | typeof cu.CAMPAIGN_SEND;

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

/** Every campaign route: `path` is what comes after /api/admin/messages/campaigns. */
export async function campaignsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [what, id, sub, more] = path;
  if (more !== undefined) return fail(404, 'not-found');
  if (!what) return m === 'GET' ? handle(request, deps, cu.CAMPAIGN_READ, async (d, who) => ({ screen: await cu.campaignsScreen(d, who) })) : notAllowed();
  if (what === 'settings' && !id) return m === 'PUT' ? handle(request, deps, cu.CAMPAIGN_WRITE, async (d, who) => ({ screen: await cu.saveCampaignSettings(d, who, await body(request)) })) : notAllowed();
  if (what === 'items') {
    if (!id) return m === 'POST' ? handle(request, deps, cu.CAMPAIGN_WRITE, async (d, who) => ({ editor: await cu.saveCampaign(d, who, null, await body(request)) }), 201) : notAllowed();
    if (!sub) {
      if (m === 'GET')
        return handle(request, deps, cu.CAMPAIGN_READ, async (d, who) => {
          const editor = await cu.campaignEditor(d, who, id);
          if (!editor?.campaign) throw new cu.CustomersError('NOT_FOUND', 'no such campaign', ['campaignId']);
          return { editor };
        });
      if (m === 'POST') return handle(request, deps, cu.CAMPAIGN_WRITE, async (d, who) => ({ editor: await cu.saveCampaign(d, who, id, await body(request)) }));
      return notAllowed();
    }
    if (sub === 'state') return m === 'POST' ? handle(request, deps, cu.CAMPAIGN_SEND, async (d, who) => ({ editor: await cu.changeCampaign(d, who, id, await body(request)) })) : notAllowed();
  }
  return fail(404, 'not-found');
}
