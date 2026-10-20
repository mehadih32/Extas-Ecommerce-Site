// S01 · PR 19, 20, 30, 31, 590 — the catalogue's admin API. The screens are PR 21; they call these routes. Every
// route signs the person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the
// mother store), then calls @extas/catalogue, which checks the permission again, scopes everything by store and
// writes the audit log. Answers are `{ ok: true, … }` or `{ ok: false, error: CODE, details }`; the screens turn the
// codes into text from their messages file.
//
//   GET/POST    /api/admin/catalogue/colours                  list (?includeArchived=1) · add a colour
//   PATCH       /api/admin/catalogue/colours/:id               change or archive a colour
//   GET/POST    /api/admin/catalogue/sizes                    · PATCH /sizes/:id
//   GET/POST    /api/admin/catalogue/brands                   · PATCH /brands/:id
//   GET/POST    /api/admin/catalogue/garment-types            · PATCH /garment-types/:id
//   GET/POST    /api/admin/catalogue/categories               the tree · add · GET/PATCH /categories/:id
//   GET/POST    /api/admin/catalogue/fabrics                  · GET/PATCH /fabrics/:id
//   GET/POST    /api/admin/catalogue/products                 list (?q, categoryId, brandId, status, take, skip) · add
//   GET/PATCH   /api/admin/catalogue/products/:id             one product with colours and variants · change
//   PUT         /api/admin/catalogue/products/:id/colours      the product's colours, in order, with notes
//   GET         /api/admin/catalogue/products/:id/facts        plain facts (?lang=en|bn)
//   GET/PATCH   /api/admin/catalogue/products/:id/naming       names, link, titles and where each comes from · save
//   GET/POST    /api/admin/catalogue/variants                 by SKU (?sku=) or a product's (?productId=) · add (?upsert=1)
//   GET/PATCH   /api/admin/catalogue/variants/:id             one variant · change, retire or restore
//   GET         /api/admin/catalogue/naming                   the naming table (?q, categoryId, brandId)
//   POST        /api/admin/catalogue/naming/preview           the edit form's Google and feed preview (nothing saved)
//   POST        /api/admin/catalogue/naming/templates         {action: 'preview'|'apply', input, hash}
//   POST        /api/admin/catalogue/naming/bulk-rename       {action: 'preview'|'apply', input, hash}
//   GET/POST    /api/admin/catalogue/naming/redirects         old links (?q, includeDisabled) · add a forward
//   PATCH       /api/admin/catalogue/naming/redirects/:id      switch off/on or point elsewhere (never deleted)
//   GET         /api/admin/catalogue/naming/renames           rename history (?productId)
//   GET         /api/admin/catalogue/naming/renames/:id       before/after report of one rename
//
//
// PR 21, 26, 29, 35 (catalogue-publish-api.ts):
//   GET         /api/admin/catalogue/products/:id/readiness    the publish checklist and health score (checked now)
//   POST        /api/admin/catalogue/products/:id/publish      {action: 'publish'|'unpublish'} — publish only when it passes
//   POST        /api/admin/catalogue/products/:id/form         the edit form's save, in order (product-form.ts)
//   POST        /api/admin/catalogue/products/bulk            {action, productIds} — publish, unpublish, recheck, archive, restore
//   GET         /api/admin/catalogue/publish-queue            the "Ready to publish" queue (?filter=all|ready|waiting|live, page)
//
// PR 33, 36, 39 (catalogue-tools-api.ts):
//   GET/POST    /api/admin/catalogue/link-import              import from a link: the screen · preview · draft
//   GET         /api/admin/catalogue/back-in-stock            waiting requests per product
//   GET/POST    /api/admin/catalogue/back-in-stock/requests   the requests with contacts · mark told / archive / restore
//   GET         /api/admin/catalogue/audit                    the product audit report
//   POST        /api/back-in-stock                            public "tell me when it is back"
//
// The shop-wide templates are settings (`naming.*`): the settings page and its API (PR 491) save them.
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

export type Perm = 'catalogue.read' | 'catalogue.write' | 'catalogue.publish' | 'catalogue.import' | 'catalogue.interest';
interface Ctx {
  deps: cat.CatalogueDeps;
  who: cat.Who;
  url: URL;
}

/** The store the request acts in: `?storeId=n`, else the mother store. Null when it is not a valid id. */
export function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const flag = (url: URL, k: string) => ['1', 'true'].includes(url.searchParams.get(k) ?? '');
const str = (url: URL, k: string) => url.searchParams.get(k) ?? undefined;
const int = (url: URL, k: string) => {
  const v = url.searchParams.get(k);
  return v === null || v === '' ? undefined : Number(v);
};

export async function handle(request: Request, deps: AdminDeps | null, permission: Perm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: { db: deps!.db, settings: deps!.resolver, now: deps!.now }, who: { actor: g.actor, storeId, ctx: g.ctx }, url });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

const badId = () => fail(400, 'INVALID_INPUT', ['id']);
const withId = (id: string, fn: () => Promise<Record<string, unknown>>) => (isUuid(id) ? fn() : Promise.resolve(badId()));
const method = (request: Request) => request.method.toUpperCase();
const notAllowed = () => fail(405, 'method-not-allowed');

// --- dictionaries: colours, sizes, brands, garment types, fabrics ---------------------------------------------

type ListFn<T> = (d: cat.CatalogueDeps, w: cat.Who, o: { includeArchived?: boolean }) => Promise<T>;

function collection<L, C>(name: string, list: ListFn<L>, create: (d: cat.CatalogueDeps, w: cat.Who, input: never) => Promise<C>) {
  return (request: Request, deps: AdminDeps | null): Promise<Response> =>
    method(request) === 'GET'
      ? handle(request, deps, 'catalogue.read', async (c) => ({ [name]: await list(c.deps, c.who, { includeArchived: flag(c.url, 'includeArchived') }) }))
      : handle(request, deps, 'catalogue.write', async (c) => ({ created: await create(c.deps, c.who, (await body(request)) as never) }), 201);
}

function member<U>(update: (d: cat.CatalogueDeps, w: cat.Who, id: string, patch: never) => Promise<U>, get?: (d: cat.CatalogueDeps, w: cat.Who, id: string) => Promise<unknown>) {
  return (request: Request, deps: AdminDeps | null, id: string): Promise<Response> => {
    if (method(request) === 'GET') {
      if (!get) return Promise.resolve(notAllowed());
      return handle(request, deps, 'catalogue.read', (c) => withId(id, async () => ({ item: await get(c.deps, c.who, id) })));
    }
    return handle(request, deps, 'catalogue.write', (c) => withId(id, async () => ({ item: await update(c.deps, c.who, id, (await body(request)) as never) })));
  };
}

export const coloursHandler = collection('colours', cat.listColours, cat.createColour);
export const colourHandler = member(cat.updateColour);
export const sizesHandler = collection('sizes', cat.listSizes, cat.createSize);
export const sizeHandler = member(cat.updateSize);
export const brandsHandler = collection('brands', cat.listBrands, cat.createBrand);
export const brandHandler = member(cat.updateBrand);
export const garmentTypesHandler = collection('garmentTypes', cat.listGarmentTypes, cat.createGarmentType);
export const garmentTypeHandler = member(cat.updateGarmentType);
export const categoriesHandler = collection('categories', cat.categoryTree, cat.createCategory);
export const categoryHandler = member(cat.updateCategory, cat.getCategory);
export const fabricsHandler = collection('fabrics', cat.listFabrics, cat.createFabric);
export const fabricHandler = member(cat.updateFabric, cat.getFabric);

// --- products and variants -----------------------------------------------------------------------------------

export function productsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET') {
    return handle(request, deps, 'catalogue.read', async (c) =>
      cat.listProducts(c.deps, c.who, {
        q: str(c.url, 'q'),
        categoryId: str(c.url, 'categoryId'),
        brandId: str(c.url, 'brandId'),
        status: str(c.url, 'status') as cat.ProductListQuery['status'],
        includeArchived: flag(c.url, 'includeArchived') || undefined,
        take: int(c.url, 'take'),
        skip: int(c.url, 'skip'),
      }) as unknown as Promise<Record<string, unknown>>,
    );
  }
  return handle(request, deps, 'catalogue.write', async (c) => ({ created: await cat.createProduct(c.deps, c.who, (await body(request)) as cat.ProductInput) }), 201);
}

export const productHandler = member(cat.updateProduct, cat.getProduct);

export function productColoursHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'PUT') return Promise.resolve(notAllowed());
  return handle(request, deps, 'catalogue.write', (c) => withId(id, async () => ({ item: await cat.setProductColours(c.deps, c.who, id, (await body(request)) as cat.ProductColoursInput) })));
}

export function productFactsHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  return handle(request, deps, 'catalogue.read', (c) =>
    withId(id, async () => {
      const lang = str(c.url, 'lang') ?? 'en';
      if (lang !== 'en' && lang !== 'bn') return badLang();
      return { facts: await cat.productFacts(c.deps, c.who, id, lang) };
    }),
  );
}
const badLang = (): never => {
  throw new cat.CatalogueError('INVALID_INPUT', 'lang is en or bn', ['lang']);
};

export function productNamingHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) === 'GET') return handle(request, deps, 'catalogue.read', (c) => withId(id, async () => ({ naming: await cat.namingView(c.deps, c.who, id) })));
  return handle(request, deps, 'catalogue.write', (c) => withId(id, async () => ({ ...(await cat.saveNaming(c.deps, c.who, id, (await body(request)) as cat.NamingPatch)) })));
}

export function variantsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET') {
    return handle(request, deps, 'catalogue.read', async (c) => {
      const sku = str(c.url, 'sku');
      const productId = str(c.url, 'productId');
      if (sku) return { variant: await cat.variantBySku(c.deps, c.who, sku) };
      if (productId && isUuid(productId)) return { variants: await cat.listVariants(c.deps, c.who, productId, { includeArchived: flag(c.url, 'includeArchived') }) };
      return fail(400, 'INVALID_INPUT', ['sku', 'productId']);
    });
  }
  return handle(
    request,
    deps,
    'catalogue.write',
    async (c) => {
      const input = (await body(request)) as cat.VariantInput;
      return flag(c.url, 'upsert') ? { ...(await cat.upsertVariantBySku(c.deps, c.who, input)) } : { created: await cat.createVariant(c.deps, c.who, input) };
    },
    201,
  );
}

export const variantHandler = member(cat.updateVariant, cat.getVariant);

// --- naming ---------------------------------------------------------------------------------------------------

export function namingListHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  return handle(request, deps, 'catalogue.read', async (c) => ({
    products: await cat.listNaming(c.deps, c.who, { q: str(c.url, 'q'), categoryId: str(c.url, 'categoryId'), brandId: str(c.url, 'brandId'), includeArchived: flag(c.url, 'includeArchived') }),
  }));
}

export function namingPreviewHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return Promise.resolve(notAllowed());
  // A preview saves nothing, but it is a POST with a body: it needs the right to edit names.
  return handle(request, deps, 'catalogue.write', async (c) => ({ preview: await cat.previewNaming(c.deps, c.who, (await body(request)) as cat.NamingDraft) }));
}

function previewApply<I>(preview: (d: cat.CatalogueDeps, w: cat.Who, input: I) => Promise<cat.ChangePreview>, apply: (d: cat.CatalogueDeps, w: cat.Who, input: I, hash: string) => Promise<cat.ApplyResult>) {
  return (request: Request, deps: AdminDeps | null): Promise<Response> => {
    if (method(request) !== 'POST') return Promise.resolve(notAllowed());
    return handle(request, deps, 'catalogue.write', async (c) => {
      const b = await body(request);
      const input = (b.input ?? {}) as I;
      if (b.action === 'preview') return { preview: await preview(c.deps, c.who, input) };
      if (b.action === 'apply') {
        if (typeof b.hash !== 'string' || !b.hash) return fail(400, 'INVALID_INPUT', ['hash']);
        return { result: await apply(c.deps, c.who, input, b.hash) };
      }
      return fail(400, 'INVALID_INPUT', ['action']);
    });
  };
}

export const namingTemplatesHandler = previewApply(cat.previewTemplateApply, cat.applyTemplate);
export const bulkRenameHandler = previewApply(cat.previewBulkRename, cat.applyBulkRename);

export function redirectsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET') {
    return handle(request, deps, 'catalogue.read', async (c) => ({ redirects: await cat.listRedirects(c.deps, c.who, { q: str(c.url, 'q'), includeDisabled: flag(c.url, 'includeDisabled'), take: int(c.url, 'take') }) }));
  }
  return handle(request, deps, 'catalogue.write', async (c) => ({ created: await cat.createRedirect(c.deps, c.who, (await body(request)) as cat.RedirectInput) }), 201);
}

export const redirectHandler = member(cat.updateRedirect);

export function renamesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  return handle(request, deps, 'catalogue.read', async (c) => {
    const productId = str(c.url, 'productId');
    if (productId !== undefined && !isUuid(productId)) return fail(400, 'INVALID_INPUT', ['productId']);
    return { renames: await cat.listRenames(c.deps, c.who, { productId, take: int(c.url, 'take') }) };
  });
}

export function renameReportHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  return handle(request, deps, 'catalogue.read', (c) => withId(id, async () => ({ report: await cat.renameReport(c.deps, c.who, id) })));
}
