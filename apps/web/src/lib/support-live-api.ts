// S28 · PR 694 — live selling's admin API (Inbox › Comments › Live selling). Paths after /api/admin/support/live:
//   GET   (none)            the board: the running (else the last) session, its captures read against today's stock (support.read)
//   POST  /start            {title, channelKind: messenger|instagram, codes: [{code: "P1", productId}]} (support.reply)
//   POST  /end              the running session ends; its captures stay (support.reply)
//   POST  /comment          {name?, text} a comment added by hand: practice, until the Page's keys are in (support.reply)
//   POST  /make             {captureId} that piece into the person's chat bag, or {all: true} every ready one (support.order)
//   POST  /skip             {captureId} not wanted (support.reply)
//   POST  /settings         {value, before} the switch `support.liveSelling` (support.settings)
// Nothing here makes an order: staff confirm by a call, then press "Create order" in the chat.
import * as sp from '@extas/support';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { notAllowed, notFound, saveV5Switch, v5Handle } from './admin-v5-api';
import { chatOrderDeps } from './support-api';

export async function liveRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a] = path;
  if (path.length > 1) return notFound();
  if (a === undefined) {
    if (m !== 'GET') return notAllowed();
    return v5Handle(request, deps, 'support.read', async (x) => ({ ...(await sp.liveBoard(x.sd, x.who)) }));
  }
  if (m !== 'POST') return notAllowed();
  if (a === 'settings') return v5Handle(request, deps, 'support.settings', (x) => saveV5Switch(request, x, ['support.liveSelling']));
  if (a === 'start') return v5Handle(request, deps, 'support.reply', async (x) => ({ ...(await sp.startLiveSession(x.sd, x.who, await body(request))) }), 201);
  if (a === 'end') return v5Handle(request, deps, 'support.reply', async (x) => (await sp.endLiveSession(x.sd, x.who), { ended: true }));
  if (a === 'comment') return v5Handle(request, deps, 'support.reply', async (x) => ({ ...(await sp.addLiveCommentByHand(x.sd, x.who, await body(request))) }), 201);
  if (a === 'skip') {
    return v5Handle(request, deps, 'support.reply', async (x) => {
      const b = (await body(request)) as { captureId?: unknown };
      if (!isUuid(b.captureId)) return fail(400, 'INVALID_INPUT', ['captureId']);
      await sp.skipLiveCapture(x.sd, x.who, b.captureId);
      return { skipped: true };
    });
  }
  if (a === 'make') {
    return v5Handle(request, deps, 'support.order', async (x) => {
      const b = (await body(request)) as { captureId?: unknown; all?: unknown };
      const cd = chatOrderDeps(x.admin);
      if (b.all === true) return { results: await sp.makeAllLiveDrafts(cd, x.who) };
      if (!isUuid(b.captureId)) return fail(400, 'INVALID_INPUT', ['captureId']);
      return { results: [await sp.makeLiveDraft(cd, x.who, b.captureId)] };
    });
  }
  return notFound();
}
