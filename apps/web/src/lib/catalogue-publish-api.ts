// PR 21, 26, 29, 35 — the product admin's own routes: the publish checklist (health score), publish / unpublish behind
// it, the edit form's save, bulk actions and the publish queue. Same door as the rest of the catalogue API
// (catalogue-api.ts `handle`: guardAdmin with the permission in `?storeId=`); @extas/catalogue checks again.
import * as cat from '@extas/catalogue';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './catalogue-api';

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const badId = () => fail(400, 'INVALID_INPUT', ['id']);
const isPost = (r: Request) => r.method.toUpperCase() === 'POST';

/** GET — the checklist checked now (and stored on the product for the list and the queue). */
export function productReadinessHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return notAllowed();
  return handle(request, deps, 'catalogue.read', async (c) => (isUuid(id) ? { readiness: await cat.checkProduct(c.deps, c.who, id) } : badId()));
}

/** POST {action: 'publish' | 'unpublish'} — CHECKLIST_FAILED (details: the blocking checks) while it does not pass. */
export function productPublishHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (!isPost(request)) return notAllowed();
  return handle(request, deps, 'catalogue.publish', async (c) => {
    if (!isUuid(id)) return badId();
    const { action } = await body(request);
    if (action === 'publish') return { result: await cat.publishProduct(c.deps, c.who, id) };
    if (action === 'unpublish') return { result: await cat.unpublishProduct(c.deps, c.who, id) };
    return fail(400, 'INVALID_INPUT', ['action']);
  });
}

/** POST — everything the edit form changed, applied in order (product, naming, retire, variants, colours, create). */
export function productFormHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (!isPost(request)) return notAllowed();
  return handle(request, deps, 'catalogue.write', async (c) => {
    if (!isUuid(id)) return badId();
    const saved = await cat.saveProductForm(c.deps, c.who, id, (await body(request)) as cat.ProductFormInput);
    // The form starts again from what was written: the product, its names and titles, and the checklist.
    return { ...saved, naming: await cat.namingView(c.deps, c.who, id) };
  });
}

/** POST {action, productIds} — each product on its own; the answer lists every result. */
export function productsBulkHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (!isPost(request)) return notAllowed();
  return handle(request, deps, 'catalogue.read', async (c) => ({ bulk: await cat.bulkProducts(c.deps, c.who, (await body(request)) as cat.BulkInput) }));
}

/** GET ?filter=all|ready|waiting|live&page= — the "Ready to publish" queue. */
export function publishQueueHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  return handle(request, deps, 'catalogue.read', async (c) => {
    const filter = c.url.searchParams.get('filter') ?? undefined;
    const page = c.url.searchParams.get('page');
    return { queue: await cat.publishQueue(c.deps, c.who, { filter: filter as cat.QueueFilter | undefined, page: page ? Number(page) : undefined }) };
  });
}
