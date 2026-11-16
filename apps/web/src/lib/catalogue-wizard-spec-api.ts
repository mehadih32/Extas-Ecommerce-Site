// S28 · PR 1030 — /api/admin/catalogue/products/<id>/spec: the add-product wizard's own answers on a draft.
//   GET                          the answers (empty before the first save)           `catalogue.read`
//   POST {…answers}              saves only the answers sent                           `catalogue.write`
//   POST {action:'colourName', colourId, name}   the name a colour has on this draft's page                `catalogue.write`
//   POST {action:'publish', mode:'now'|'schedule', at?}   puts the draft on the shop (or at a time); {action:'unschedule'}   `catalogue.write` + `catalogue.publish`
//   POST {action:'price', priceMinor, compareAtMinor?, pin?}   sets the selling price on every kept variant and remembers the
//        confirmation; with `catalogue.prices.requirePin` on, the owner's PIN is checked first, as on the product screen.
// Nothing here puts anything on the shop.
import * as cat from '@extas/catalogue';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './catalogue-api';
import { requireOwnerPin } from './owner-pin';

export function productWizardSpecHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const m = request.method.toUpperCase();
  if (!isUuid(id)) return Promise.resolve(fail(400, 'INVALID_INPUT', ['id']));
  if (m === 'GET') return handle(request, deps, 'catalogue.read', async (c) => ({ spec: await cat.readWizardSpec(c.deps, c.who, id) }));
  if (m !== 'POST') return Promise.resolve(fail(405, 'method-not-allowed'));
  return handle(request, deps, 'catalogue.write', async (c) => {
    const b = (await body(request)) as Record<string, unknown>;
    if (b.action === 'price') {
      if ((await c.deps.settings.value('catalogue.prices.requirePin', { storeId: c.who.storeId })) === true) {
        await requireOwnerPin(deps!, c.who.actor, c.who.ctx!, b.pin, 'catalogue.prices.change', c.who.storeId);
      }
      return { price: await cat.setWizardPrice(c.deps, c.who, id, { priceMinor: b.priceMinor as number, compareAtMinor: b.compareAtMinor as number | null | undefined }) };
    }
    if (b.action === 'publish') return { published: await cat.wizardPublish(c.deps, c.who, id, { mode: b.mode, at: b.at }) };
    if (b.action === 'unschedule') return { ok: (await cat.wizardUnschedule(c.deps, c.who, id), true) };
    if (b.action === 'colourName') return { colour: await cat.setWizardColourName(c.deps, c.who, id, { colourId: b.colourId as string, name: (b.name as string | null) ?? null }) };
    return { spec: await cat.saveWizardSpec(c.deps, c.who, id, b) };
  });
}
