// S28 · PR 693 — the comment desk's admin API (Inbox › Comments). Paths after /api/admin/support/comments:
//   GET   (none)            ?view=all|need|hidden|auto — the comments, with counts (support.read; off: enabled false)
//   POST  /:id/hide         {hide: boolean} hide the comment on the Page, or show it again (support.reply)
//   POST  /:id/private      {text?} one private message to the commenter; the desk's own text when none is given (support.reply)
//   POST  /settings         {value, before} the desk's rules `support.commentDesk` (support.settings)
// The Page's connector is a practice stand-in until its keys are typed in: nothing reaches Meta, and the answer says so.
import * as sp from '@extas/support';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { notAllowed, notFound, saveV5Switch, v5Handle } from './admin-v5-api';

export async function commentsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, action] = path;
  if (id === 'settings' && path.length === 1) {
    if (m !== 'POST') return notAllowed();
    return v5Handle(request, deps, 'support.settings', (x) => saveV5Switch(request, x, ['support.commentDesk']));
  }
  if (id === undefined) {
    if (m !== 'GET') return notAllowed();
    const view = new URL(request.url).searchParams.get('view') || undefined;
    return v5Handle(request, deps, 'support.read', async (x) => ({ ...(await sp.listComments(x.sd, x.who, { view })) }));
  }
  if (!isUuid(id)) return fail(404, 'NOT_FOUND', ['id']);
  if (path.length !== 2) return notFound();
  if (m !== 'POST') return notAllowed();
  if (action === 'hide') {
    return v5Handle(request, deps, 'support.reply', async (x) => {
      const b = (await body(request)) as { hide?: unknown };
      if (typeof b.hide !== 'boolean') return fail(400, 'INVALID_INPUT', ['hide']);
      if (b.hide) await sp.hideComment(x.sd, x.who, id);
      else await sp.unhideComment(x.sd, x.who, id);
      return { hidden: b.hide };
    });
  }
  if (action === 'private') return v5Handle(request, deps, 'support.reply', async (x) => ({ ...(await sp.messageCommenterPrivately(x.sd, x.who, { ...(await body(request)), messageId: id })) }));
  return notFound();
}
