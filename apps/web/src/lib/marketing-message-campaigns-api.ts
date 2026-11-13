// S28 · PR 697 — Marketing › Message campaigns' API. Paths after /api/admin/marketing/message-campaigns:
//   GET   (none)    every send in one list, newest first; `?channel=SMS|WHATSAPP|EMAIL` filters (messages.journey.read)
//   POST  /test     {templateId, to} one test message of a shop template to the typed address (messages.campaigns.write)
// A campaign itself is made and run in the Messages pages (consent, approved template, schedule, throttle checks there).
import * as cu from '@extas/customers';
import * as ms from '@extas/messages';
import { body, type AdminDeps } from './admin-auth';
import { customersDeps } from './customers-api';
import { messagesDeps } from './messages-api';
import { notAllowed, notFound, v5Handle } from './admin-v5-api';

export async function messageCampaignsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a] = path;
  if (path.length > 1) return notFound();
  if (a === undefined) {
    if (m !== 'GET') return notAllowed();
    return v5Handle(request, deps, 'messages.journey.read', async (x) => ({ ...(await cu.campaignOverview(customersDeps(x.admin), x.who, new URL(request.url).searchParams.get('channel') ?? undefined)) }));
  }
  if (a === 'test' && m === 'POST') return v5Handle(request, deps, 'messages.campaigns.write', async (x) => ({ result: await ms.sendCampaignTest(await messagesDeps(x.admin), x.who, await body(request)) }));
  return a === 'test' ? notAllowed() : notFound();
}
