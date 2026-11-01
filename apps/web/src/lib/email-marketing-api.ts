// S14 · PR 290 — Messages › E-mail's API (e-mail marketing; @extas/customers email-marketing.ts). Every route signs the
// staff member in and checks the store; the service checks the permission again (seeing: `messages.journey.read`;
// templates, drafts and the settings: `messages.email.write`; schedule, pause, resume and cancel: `messages.email.send`),
// and every change is audited there.
//
//   GET   /api/admin/messages/email                       the sends and the templates, the settings
//   PUT   /api/admin/messages/email/settings              the page's settings card (`customers.email`)
//   POST  /api/admin/messages/email/templates             {name, locale, subject, body} a new template
//   POST  /api/admin/messages/email/templates/:id         {…, version} a change (STALE in between)
//   POST  /api/admin/messages/email/templates/:id/archive {archived} archive or restore; never deleted
//   POST  /api/admin/messages/email/sends                 {name, segmentId, templateId, locale, subject, body} a draft
//   GET   /api/admin/messages/email/sends/:id             one send with its audience and results
//   POST  /api/admin/messages/email/sends/:id             {…, version} a change of a draft
//   POST  /api/admin/messages/email/sends/:id/state       {action: schedule|pause|resume|cancel, at?, version?}
import * as cu from '@extas/customers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { customersDeps } from './customers-api';

type Perm = typeof cu.EMAIL_READ | typeof cu.EMAIL_WRITE | typeof cu.EMAIL_SEND;

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

/** Every e-mail route: `path` is what comes after /api/admin/messages/email. */
export async function emailMarketingRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [what, id, sub, more] = path;
  if (more !== undefined) return fail(404, 'not-found');
  if (!what) return m === 'GET' ? handle(request, deps, cu.EMAIL_READ, async (d, who) => ({ screen: await cu.emailScreen(d, who) })) : notAllowed();
  if (what === 'settings' && !id) return m === 'PUT' ? handle(request, deps, cu.EMAIL_WRITE, async (d, who) => ({ screen: await cu.saveEmailSettings(d, who, await body(request)) })) : notAllowed();
  if (what === 'templates') {
    if (m !== 'POST') return notAllowed();
    if (!id) return handle(request, deps, cu.EMAIL_WRITE, async (d, who) => ({ editor: await cu.saveEmailTemplate(d, who, null, await body(request)) }), 201);
    if (!sub) return handle(request, deps, cu.EMAIL_WRITE, async (d, who) => ({ editor: await cu.saveEmailTemplate(d, who, id, await body(request)) }));
    if (sub === 'archive') return handle(request, deps, cu.EMAIL_WRITE, async (d, who) => ({ result: await cu.archiveEmailTemplate(d, who, id, await body(request)) }));
    return fail(404, 'not-found');
  }
  if (what === 'sends') {
    if (!id) return m === 'POST' ? handle(request, deps, cu.EMAIL_WRITE, async (d, who) => ({ editor: await cu.saveEmailSend(d, who, null, await body(request)) }), 201) : notAllowed();
    if (!sub) {
      if (m === 'GET')
        return handle(request, deps, cu.EMAIL_READ, async (d, who) => {
          const editor = await cu.emailSendEditor(d, who, id);
          if (!editor?.send) throw new cu.CustomersError('NOT_FOUND', 'no such send', ['sendId']);
          return { editor };
        });
      if (m === 'POST') return handle(request, deps, cu.EMAIL_WRITE, async (d, who) => ({ editor: await cu.saveEmailSend(d, who, id, await body(request)) }));
      return notAllowed();
    }
    if (sub === 'state') return m === 'POST' ? handle(request, deps, cu.EMAIL_SEND, async (d, who) => ({ editor: await cu.changeEmailSend(d, who, id, await body(request)) })) : notAllowed();
  }
  return fail(404, 'not-found');
}
