// S28 · PR 680-685 — the switches and numbers of the product screens, one small card API: GET the cards (`catalogue.read`),
// PUT one card whole (`catalogue.write`) with the version the page showed (a card changed by someone else in between is
// STALE), checked against its schema, audited and in the settings change log. Same shape as review-settings-api.ts.
//   media.quality  Products › a product's photos › Photo checks (PR 680)
//   catalogue.video  Products › a product › Video settings (PR 681)
//   catalogue.faq  Products › FAQs › More options (PR 682)
//   catalogue.erpSizeChart  Products › a product › Size chart from the ERP › More options (PR 683)
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { catalogueErpSizeChartSchema, catalogueFaqSchema, catalogueVideoSchema, mediaQualitySchema, storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

const S = MOTHER_STORE_ID;
export const PRODUCT_V5_KEYS = ['media.quality', 'catalogue.video', 'catalogue.faq', 'catalogue.erpSizeChart'] as const;
export type ProductV5Key = (typeof PRODUCT_V5_KEYS)[number];

export interface ProductV5Card {
  key: ProductV5Key;
  value: Record<string, unknown>;
  version: string;
}
interface Who {
  actor: Actor;
  ctx: RequestContext;
}
type Deps = Pick<AdminDeps, 'db' | 'resolver'>;

export class ProductV5Error extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

const SCHEMAS = {
  'media.quality': mediaQualitySchema,
  'catalogue.video': catalogueVideoSchema,
  'catalogue.faq': catalogueFaqSchema,
  'catalogue.erpSizeChart': catalogueErpSizeChartSchema,
} as const;
const WHERE: Record<ProductV5Key, string> = {
  'media.quality': "Products › a product's photos › Photo checks",
  'catalogue.video': 'Products › a product › Video › More options',
  'catalogue.faq': 'Products › FAQs › More options',
  'catalogue.erpSizeChart': 'Products › a product › Size chart from the ERP › More options',
};
const isKey = (k: unknown): k is ProductV5Key => typeof k === 'string' && (PRODUCT_V5_KEYS as readonly string[]).includes(k);
export const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function productV5Cards(deps: Deps, who: Who): Promise<Record<ProductV5Key, ProductV5Card>> {
  await requirePermission(deps.db, who.actor, 'catalogue.read', { storeId: S });
  const values = await Promise.all(PRODUCT_V5_KEYS.map((k) => deps.resolver.value(k, { storeId: S }) as Promise<unknown>));
  return Object.fromEntries(
    PRODUCT_V5_KEYS.map((key, i) => [
      key,
      {
        key,
        value: values[i] as Record<string, unknown>,
        version: versionOf(values[i]),
      },
    ]),
  ) as Record<ProductV5Key, ProductV5Card>;
}

export async function saveProductV5(deps: Deps, who: Who, input: unknown): Promise<Record<ProductV5Key, ProductV5Card>> {
  await requirePermission(deps.db, who.actor, 'catalogue.write', {
    storeId: S,
  });
  if (!isObj(input) || !isKey(input.key)) throw new ProductV5Error('INVALID_INPUT', 400, ['key']);
  const key = input.key;
  const before = await deps.resolver.value(key, { storeId: S });
  if (input.version !== versionOf(before)) throw new ProductV5Error('STALE', 409);
  const ok = SCHEMAS[key].safeParse(input.value);
  if (!ok.success) throw new ProductV5Error('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    const meta = { actorId: who.actor.staffUserId ?? null, reason: WHERE[key] };
    await deps.resolver.set(key, ok.data, storeTarget(S), meta);
    await audit(
      deps.db,
      who.actor,
      {
        storeId: S,
        action: `${key}.save`,
        entityType: 'Setting',
        entityId: key,
        before: { ...(before as object) },
        after: { ...ok.data },
      },
      who.ctx,
    );
  }
  return productV5Cards(deps, who);
}

/** /api/admin/products-v5-settings — GET the cards, PUT one. */
export async function productV5SettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, {
    permission: method === 'GET' ? 'catalogue.read' : 'catalogue.write',
    storeId: S,
  });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const cards = method === 'GET' ? await productV5Cards(deps!, who) : await saveProductV5(deps!, who, await body(request));
    return json({ ok: true, cards });
  } catch (e) {
    if (e instanceof ProductV5Error)
      return json(
        {
          ok: false,
          error: e.code,
          ...(e.details.length ? { details: e.details } : {}),
        },
        { status: e.status },
      );
    return errorResponse(e);
  }
}
