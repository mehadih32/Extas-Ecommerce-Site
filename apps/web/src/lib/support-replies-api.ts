// S28 · PR 692 — the quick replies' admin API (Inbox › Quick replies; B4.4). Paths after /api/admin/support/replies:
//   GET   (none)            the quick replies: in use, archived, the most used (support.reply; off: enabled false)
//   POST  (none)            {id?, shortcut, bodyEn, bodyBn} add, or edit when `id` is given (support.settings)
//   POST  /:id/archive      {archive: boolean} hide from chats, or bring back; never a delete (support.settings)
//   POST  /:id/use          counts one use when a person picks it in a chat (support.reply)
//   POST  /settings         {value, before} the switch `support.savedReplies` (support.settings)
import * as sp from '@extas/support';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { notAllowed, notFound, saveV5Switch, v5Handle } from './admin-v5-api';

export async function savedRepliesRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, action] = path;
  if (id === 'settings' && path.length === 1) {
    if (m !== 'POST') return notAllowed();
    return v5Handle(request, deps, 'support.settings', (x) => saveV5Switch(request, x, ['support.savedReplies']));
  }
  if (id === undefined) {
    if (m === 'GET') return v5Handle(request, deps, 'support.reply', async (x) => ({ ...(await sp.listSavedReplies(x.sd, x.who)) }));
    if (m !== 'POST') return notAllowed();
    return v5Handle(request, deps, 'support.settings', async (x) => ({ reply: await sp.saveSavedReply(x.sd, x.who, await body(request)) }), 201);
  }
  if (!isUuid(id)) return fail(404, 'NOT_FOUND', ['id']);
  if (path.length !== 2 || m !== 'POST') return path.length === 2 ? notAllowed() : notFound();
  if (action === 'archive') {
    return v5Handle(request, deps, 'support.settings', async (x) => {
      const b = (await body(request)) as { archive?: unknown };
      return { reply: await sp.archiveSavedReply(x.sd, x.who, id, b.archive !== false) };
    });
  }
  if (action === 'use') return v5Handle(request, deps, 'support.reply', async (x) => ({ counted: await sp.useSavedReply(x.sd, x.who, id) }));
  return notFound();
}
