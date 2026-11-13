// S15 · PR 331 — the API side of Marketing › Studio's future "Draft a caption with AI" button, for the
// render-queue form's own reel/short caption field: POST /api/admin/marketing/studio/ai-caption {templateId,
// locale?} — `studio.generate`, the exact permission `catalogue.ts`'s own note already names for this ("run a
// generate job, which may spend on AI captions once the owner turns that on"), the same permission `render.queue`
// and `render.run` already need. Loads the template's own real, already-saved name/kind/notes straight off
// `studioTemplate` (the same direct-Prisma-read convention `@extas/studio`'s own `queueSocialRender` already uses
// once `studio.generate` is granted, `render.ts` line ~143 — never a second `studio.read` check), never anything a
// client posts, and hands only those to `socialReelCaptionDraft`. The answer is `{ok: true, result}`; `result` is
// either `{ok: true, body}` (a draft for the staff member to review and place in the caption field themselves —
// nothing here ever queues a render) or `{ok: false, reason}`, so the client can show a plain notice instead of
// treating a routine "feature off"/"AI off"/"cap reached" as an error.
//
// The button itself is not wired into `StudioForms.tsx` in this PR — see `social-caption-dispatch.ts`'s own header
// comment for why (three concurrent S23 branches were rewriting that exact component at the time this PR was
// built). This route is complete, tested and reachable today by any `studio.generate` caller, including the button
// a small follow-up PR adds.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { socialReelCaptionDraft } from './social-caption-dispatch';

const S = MOTHER_STORE_ID;

export async function studioAiCaptionHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'studio.generate', storeId: S });
  if (g instanceof Response) return g;
  try {
    const input = await body(request);
    const templateId = typeof input.templateId === 'string' ? input.templateId : '';
    const locale = input.locale === 'bn' ? 'bn' : 'en';
    const template = await deps!.db.studioTemplate.findFirst({ where: { id: templateId, storeId: S, archivedAt: null } });
    if (!template || (template.kind !== 'reel' && template.kind !== 'short')) return json({ ok: true, result: { ok: false, reason: 'NOT_READY' } });
    const spec = template.spec as { notes?: string };
    const result = await socialReelCaptionDraft({ db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, now: deps!.now }, S, template.id, locale, { templateName: template.name, notes: spec.notes ?? null });
    return json({ ok: true, result });
  } catch (e) {
    return errorResponse(e);
  }
}
