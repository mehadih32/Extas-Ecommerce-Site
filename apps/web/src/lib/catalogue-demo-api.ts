// S28 · PR 684 — /api/admin/demo-products: demo (sample) products.
//   GET    the categories with their demo and real counts and whether demo shows there now   `catalogue.read`
//   POST   {action: "seed", categoryId?}   one sample for every category that has none (or one category)   `catalogue.write`
//          {action: "catalogue"}                 the demo catalogue: the approved demo's 72 styles as demo products (idempotent)
//          {action: "reconcile"}           show or hide the demo products to match the switches
//          {action: "toDraft", productId}  turn one demo product into an ordinary draft to finish
// The switches themselves are the setting `catalogue.demo`, saved through /api/admin/products-v5-settings.
import * as cat from '@extas/catalogue';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './catalogue-api';

export function demoHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m === 'GET') return handle(request, deps, 'catalogue.read', async (c) => ({ demo: await cat.demoView(c.deps, c.who) }));
  if (m !== 'POST') return Promise.resolve(fail(405, 'method-not-allowed'));
  return handle(request, deps, 'catalogue.write', async (c) => {
    const b = (await body(request)) as { action?: unknown; categoryId?: unknown; productId?: unknown } | null;
    if (b?.action === 'seed') {
      if (b.categoryId !== undefined && b.categoryId !== null && !(typeof b.categoryId === 'string' && isUuid(b.categoryId))) return fail(400, 'INVALID_INPUT', ['categoryId']);
      const r = await cat.seedDemoProducts(c.deps, c.who, { categoryId: (b.categoryId as string | null | undefined) ?? null });
      const rec = await cat.reconcileDemo(c.deps, c.who);
      return { ...r, ...rec, demo: await cat.demoView(c.deps, c.who) };
    }
    if (b?.action === 'catalogue') {
      const r = await cat.addDemoCatalogue(c.deps, c.who);
      const rec = await cat.reconcileDemo(c.deps, c.who);
      return { ...r, ...rec, demo: await cat.demoView(c.deps, c.who) };
    }
    if (b?.action === 'reconcile') return { ...(await cat.reconcileDemo(c.deps, c.who)), demo: await cat.demoView(c.deps, c.who) };
    if (b?.action === 'toDraft') {
      if (typeof b.productId !== 'string' || !isUuid(b.productId)) return fail(400, 'INVALID_INPUT', ['productId']);
      await cat.demoToDraft(c.deps, c.who, b.productId);
      return { demo: await cat.demoView(c.deps, c.who) };
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  });
}
