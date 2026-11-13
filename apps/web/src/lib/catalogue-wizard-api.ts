// S28 · PR 685 — /api/admin/products/<id>/wizard: where the add-product wizard stands on a draft.
//   GET    the steps done, the step to resume   `catalogue.read`
//   POST   {step: 2-8}  remembers the step the person opened (drafts only)   `catalogue.write`
// The wizard itself changes no figure: every save is the product screen's own save.
import * as cat from '@extas/catalogue';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './catalogue-api';

export function productWizardHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const m = request.method.toUpperCase();
  if (!isUuid(id)) return Promise.resolve(fail(400, 'INVALID_INPUT', ['id']));
  if (m === 'GET')
    return handle(request, deps, 'catalogue.read', async (c) => ({
      wizard: await cat.wizardView(c.deps, c.who, id),
    }));
  if (m !== 'POST') return Promise.resolve(fail(405, 'method-not-allowed'));
  return handle(request, deps, 'catalogue.write', async (c) => {
    const b = (await body(request)) as { step?: unknown } | null;
    return { state: await cat.rememberWizardStep(c.deps, c.who, id, b?.step) };
  });
}
