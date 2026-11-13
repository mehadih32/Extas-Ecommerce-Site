// S15 · PR 326 — POST /api/admin/products/:id/ai-description {locale?: 'en'|'bn'}: the one explicit "Write with AI"
// action on the product edit page (ProductForm.tsx's own `aiDescription` button) — `catalogue.write`, the same
// permission the edit form's own save already needs. Loads the product's own real, already-saved attributes
// through `@extas/catalogue`'s own `getProduct` and hands only those to `productDescriptionDraft` — never anything
// a client posts, so nothing sent to this route can ever pass as a grounded fact (see product-content-dispatch.ts's
// own header comment). The answer is `{ok: true, result}`, `result` itself either `{ok: true, body}` (a draft for
// the person to review and place in the form themselves — nothing here ever saves it) or `{ok: false, reason}`, so
// the client can show a plain notice instead of treating a routine "AI off" or "cap reached" as an error.
import * as cat from '@extas/catalogue';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
import { productDescriptionDraft, type ProductDescriptionFacts } from './product-content-dispatch';

/** The product's own real, already-saved attributes, in the shape `productDescriptionDraft` grounds a draft on —
 * never a fibre-by-fibre composition breakdown yet (that needs a dictionary-label lookup `fabrics.ts`'s own
 * `composition` JSON does not give for free): a real, honest scope decision for this PR, the fabric's own plain
 * name standing in until a shared composition-to-text formatter exists for every caller (PDP, filters, this one —
 * `fabrics.ts`'s own header comment already names that as the eventual single source). */
// Exported (additive, PR 332) so `studio-detail-api.ts` can reuse this exact same loader rather than rebuild it —
// the photoshoot studio's own detail-finder job (PR 332) is grounded on the identical `ProductDescriptionFacts`
// shape this job already uses.
export function factsOf(product: cat.ProductView): ProductDescriptionFacts {
  return {
    nameEn: product.nameEn,
    brand: product.brand.name || null,
    category: product.category?.nameEn ?? null,
    fabric: product.fabric?.nameEn ?? null,
    colours: product.colours.filter((c) => !c.archived).map((c) => c.nameEn),
    sizes: [...new Set(product.variants.filter((v) => !v.archived && v.size).map((v) => v.size!.label))],
    careEn: product.careEn,
  };
}

export async function productAiDescriptionHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!isUuid(id)) return fail(400, 'INVALID_INPUT', ['id']);
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'catalogue.write', storeId });
  if (g instanceof Response) return g;
  try {
    const input = await body(request);
    const locale = input.locale === 'bn' ? 'bn' : 'en';
    const who: cat.Who = { actor: g.actor, storeId, ctx: g.ctx };
    const catDeps: cat.CatalogueDeps = { db: deps!.db, settings: deps!.resolver, now: deps!.now };
    const product = await cat.getProduct(catDeps, who, id);
    const result = await productDescriptionDraft({ db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, now: deps!.now }, storeId, id, locale, factsOf(product));
    return json({ ok: true, result });
  } catch (e) {
    return errorResponse(e);
  }
}
