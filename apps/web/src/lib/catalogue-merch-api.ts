// S01 · PR 27, 28, 32, 34, 38 — the admin API for size charts, collections and tags, the catalogue CSV and the "was"
// price. Same shape as the catalogue API (lib/catalogue-api.ts): every route signs the person in (guardAdmin), checks
// the permission in the store it touches (`?storeId=`, default the mother store), then calls @extas/catalogue, which
// checks the permission again, scopes everything by store and writes the audit log.
//
//   GET/POST    /api/admin/catalogue/size-charts                list (?includeArchived=1) with the screen's options · add
//   GET/PATCH   /api/admin/catalogue/size-charts/:id            one chart with its products and missing sizes · change, archive
//   POST        /api/admin/catalogue/size-charts/:id/copy       copy for another fit, or as one product's own chart
//   POST        /api/admin/catalogue/size-charts/assign         {sizeChartId, categoryId | productId}
//   POST        /api/admin/catalogue/size-charts/unassign       {productId} (back to auto) | {categoryId, sizeChartId}
//   GET         /api/admin/catalogue/size-charts/resolve        the chart a product gets (?productId | ?categoryId&fitKey)
//   GET/POST    /api/admin/catalogue/collections                list · add
//   GET/PATCH   /api/admin/catalogue/collections/:id            one collection with its products · change, archive
//   PUT         /api/admin/catalogue/collections/:id/products   the products, in order
//   GET/POST    /api/admin/catalogue/tags                       list · add
//   PATCH       /api/admin/catalogue/tags/:id                   change, archive
//   POST        /api/admin/catalogue/tags/:id/products          {action: 'add'|'remove', productIds}
//   GET/PUT     /api/admin/catalogue/products/:id/tags          a product's tags · set them
//   GET         /api/admin/catalogue/csv/export                 the catalogue as a CSV file (?categoryId, includeArchived)
//   POST        /api/admin/catalogue/csv/import                 {action: 'preview'|'apply', csv, hash}
//   GET/PUT     /api/admin/catalogue/was-price                  sources per category · set one (category or product)
//   GET         /api/admin/catalogue/was-price/resolve          a product's struck prices with reasons (?productId | ?comboId)
import * as cat from '@extas/catalogue';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { storeIdOf } from './catalogue-api';

type Perm = 'catalogue.read' | 'catalogue.write' | 'catalogue.prices' | 'catalogue.import' | 'catalogue.export';
interface Ctx {
  deps: cat.CatalogueDeps;
  who: cat.Who;
  url: URL;
}

const flag = (url: URL, k: string) => ['1', 'true'].includes(url.searchParams.get(k) ?? '');
const str = (url: URL, k: string) => url.searchParams.get(k) ?? undefined;
const method = (request: Request) => request.method.toUpperCase();
const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const badId = (field = 'id') => fail(400, 'INVALID_INPUT', [field]);

async function handle(
  request: Request,
  deps: AdminDeps | null,
  permission: Perm,
  fn: (c: Ctx) => Promise<Record<string, unknown> | Response>,
  status = 200,
): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({
      deps: { db: deps!.db, settings: deps!.resolver, now: deps!.now },
      who: { actor: g.actor, storeId, ctx: g.ctx },
      url,
    });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

const withId = (id: string, fn: () => Promise<Record<string, unknown> | Response>) => (isUuid(id) ? fn() : Promise.resolve(badId()));

// --- size charts (PR 27, 28) ---------------------------------------------------------------------------------

export function sizeChartsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET') {
    return handle(request, deps, 'catalogue.read', async (c) => {
      const [sizeCharts, options] = await Promise.all([
        cat.listSizeCharts(c.deps, c.who, {
          includeArchived: flag(c.url, 'includeArchived'),
        }),
        cat.sizeChartOptions(c.deps, c.who),
      ]);
      return { sizeCharts, options };
    });
  }
  if (method(request) !== 'POST') return notAllowed();
  return handle(
    request,
    deps,
    'catalogue.write',
    async (c) => ({
      created: await cat.createSizeChart(c.deps, c.who, (await body(request)) as cat.SizeChartInput),
    }),
    201,
  );
}

export function sizeChartHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) === 'GET')
    return handle(request, deps, 'catalogue.read', (c) =>
      withId(id, async () => ({
        item: await cat.getSizeChart(c.deps, c.who, id),
      })),
    );
  if (method(request) !== 'PATCH') return notAllowed();
  return handle(request, deps, 'catalogue.write', (c) =>
    withId(id, async () => ({
      item: await cat.updateSizeChart(c.deps, c.who, id, (await body(request)) as cat.SizeChartPatch),
    })),
  );
}

export function sizeChartCopyHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(
    request,
    deps,
    'catalogue.write',
    (c) =>
      withId(id, async () => ({
        created: await cat.copySizeChart(c.deps, c.who, id, (await body(request)) as cat.SizeChartCopyInput),
      })),
    201,
  );
}

export function sizeChartAssignHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'catalogue.write', async (c) => ({
    assignment: await cat.assignSizeChart(c.deps, c.who, (await body(request)) as cat.SizeChartAssignInput),
  }));
}

export function sizeChartUnassignHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(
    request,
    deps,
    'catalogue.write',
    async (c) => cat.unassignSizeChart(c.deps, c.who, (await body(request)) as cat.SizeChartUnassignInput) as unknown as Promise<Record<string, unknown>>,
  );
}

export function sizeChartResolveHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  return handle(request, deps, 'catalogue.read', async (c) => {
    const productId = str(c.url, 'productId');
    const categoryId = str(c.url, 'categoryId');
    if (productId !== undefined && !isUuid(productId)) return badId('productId');
    if (categoryId !== undefined && !isUuid(categoryId)) return badId('categoryId');
    return {
      resolution: await cat.resolveSizeChart(c.deps, c.who, {
        productId,
        categoryId,
        fitKey: str(c.url, 'fitKey'),
      }),
    };
  });
}

// --- collections and tags (PR 32) ----------------------------------------------------------------------------

export function collectionsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET')
    return handle(request, deps, 'catalogue.read', async (c) => ({
      collections: await cat.listCollections(c.deps, c.who, {
        includeArchived: flag(c.url, 'includeArchived'),
      }),
    }));
  if (method(request) !== 'POST') return notAllowed();
  return handle(
    request,
    deps,
    'catalogue.write',
    async (c) => ({
      created: await cat.createCollection(c.deps, c.who, (await body(request)) as cat.CollectionInput),
    }),
    201,
  );
}

export function collectionHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) === 'GET')
    return handle(request, deps, 'catalogue.read', (c) =>
      withId(id, async () => ({
        item: await cat.getCollection(c.deps, c.who, id),
      })),
    );
  if (method(request) !== 'PATCH') return notAllowed();
  return handle(request, deps, 'catalogue.write', (c) =>
    withId(id, async () => ({
      item: await cat.updateCollection(c.deps, c.who, id, (await body(request)) as cat.CollectionPatch),
    })),
  );
}

export function collectionProductsHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'PUT') return notAllowed();
  return handle(request, deps, 'catalogue.write', (c) =>
    withId(id, async () => ({
      item: await cat.setCollectionProducts(c.deps, c.who, id, (await body(request)) as cat.CollectionProductsInput),
    })),
  );
}

export function tagsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET')
    return handle(request, deps, 'catalogue.read', async (c) => ({
      tags: await cat.listTags(c.deps, c.who, {
        includeArchived: flag(c.url, 'includeArchived'),
      }),
    }));
  if (method(request) !== 'POST') return notAllowed();
  return handle(
    request,
    deps,
    'catalogue.write',
    async (c) => ({
      created: await cat.createTag(c.deps, c.who, (await body(request)) as cat.TagInput),
    }),
    201,
  );
}

export function tagHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'PATCH') return notAllowed();
  return handle(request, deps, 'catalogue.write', (c) =>
    withId(id, async () => ({
      item: await cat.updateTag(c.deps, c.who, id, (await body(request)) as cat.TagPatch),
    })),
  );
}

export function tagProductsHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'catalogue.write', (c) =>
    withId(id, async () => cat.tagProducts(c.deps, c.who, id, (await body(request)) as cat.TagProductsInput) as unknown as Promise<Record<string, unknown>>),
  );
}

export function productTagsHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) === 'GET')
    return handle(request, deps, 'catalogue.read', (c) =>
      withId(id, async () => ({
        tags: await cat.productTags(c.deps, c.who, id),
      })),
    );
  if (method(request) !== 'PUT') return notAllowed();
  return handle(request, deps, 'catalogue.write', (c) =>
    withId(id, async () => ({
      tags: await cat.setProductTags(c.deps, c.who, id, (await body(request)) as cat.ProductTagsInput),
    })),
  );
}

// --- the catalogue CSV (PR 34) -------------------------------------------------------------------------------

export function csvExportHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'catalogue.export', async (c) => {
    const categoryId = str(c.url, 'categoryId');
    if (categoryId !== undefined && !isUuid(categoryId)) return badId('categoryId');
    const x = await cat.exportCatalogueCsv(c.deps, c.who, {
      categoryId,
      includeArchived: flag(c.url, 'includeArchived'),
    });
    return new Response(x.csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${x.fileName}"`,
        'cache-control': 'no-store',
        'x-rows': String(x.rows),
      },
    });
  });
}

export function csvImportHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'catalogue.import', async (c) => {
    const b = await body(request);
    if (typeof b.csv !== 'string') return fail(400, 'INVALID_INPUT', ['csv']);
    if (b.action === 'preview') return { preview: await cat.previewCsvImport(c.deps, c.who, b.csv) };
    if (b.action === 'apply') {
      if (typeof b.hash !== 'string' || !b.hash) return fail(400, 'INVALID_INPUT', ['hash']);
      return { result: await cat.applyCsvImport(c.deps, c.who, b.csv, b.hash) };
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  });
}

// --- the "was" price (PR 38) ---------------------------------------------------------------------------------

export function wasPriceHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET')
    return handle(request, deps, 'catalogue.read', async (c) => cat.wasPriceSources(c.deps, c.who) as unknown as Promise<Record<string, unknown>>);
  if (method(request) !== 'PUT') return notAllowed();
  // Which "was" price a category shows is the owner's money decision (CLAUDE.md rule 6): only with catalogue.prices.
  return handle(request, deps, 'catalogue.prices', async (c) => ({
    choice: await cat.setWasPriceSource(c.deps, c.who, (await body(request)) as cat.WasPriceSourceInput),
  }));
}

export function wasPriceResolveHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  return handle(request, deps, 'catalogue.read', async (c) => {
    const productId = str(c.url, 'productId');
    const comboId = str(c.url, 'comboId');
    if (comboId !== undefined) return isUuid(comboId) ? { combo: await cat.comboWasPrice(c.deps, c.who, comboId) } : badId('comboId');
    if (productId === undefined || !isUuid(productId)) return badId('productId');
    return { product: await cat.resolveWasPrice(c.deps, c.who, productId) };
  });
}
