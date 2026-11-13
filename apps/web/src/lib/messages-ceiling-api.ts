// S28 · PR 698 — Messages › Cost ceilings' API. Paths after /api/admin/messages/cost-ceiling:
//   GET   (none)       the month's spend against the ceilings (messages.channels.read)
//   POST  /settings    {value, before} the switch and numbers `messages.costCeiling` (the owner: rules.approve)
import * as ms from '@extas/messages';
import type { AdminDeps } from './admin-auth';
import { notAllowed, notFound, saveV5Switch, v5Handle } from './admin-v5-api';
import { messagesDeps } from './messages-api';

export async function ceilingRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a] = path;
  if (path.length > 1) return notFound();
  if (a === undefined) {
    if (m !== 'GET') return notAllowed();
    return v5Handle(request, deps, 'messages.channels.read', async (x) => ({ status: await ms.readCostCeilings(await messagesDeps(x.admin), x.who) }));
  }
  if (a !== 'settings') return notFound();
  if (m !== 'POST') return notAllowed();
  return v5Handle(request, deps, 'rules.approve', (x) => saveV5Switch(request, x, ['messages.costCeiling']));
}
