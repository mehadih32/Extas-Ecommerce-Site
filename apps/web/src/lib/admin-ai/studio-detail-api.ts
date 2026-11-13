// S15 · PR 332 — POST /api/admin/photoshoot/products/:id/ai-detail-note {locale?: 'en'|'bn'}: a `photoshoot.generate`
// action (the same permission `@extas/auth`'s catalogue names for "run a generation job, which spends from the AI
// usage ledger within its cap", PR 444) — reachable today even though no Studio admin page exists yet to put a
// button on (PR 445+). Loads the product's own real, already-saved attributes through `@extas/catalogue`'s own
// `getProduct` (which itself checks `catalogue.read`) and hands only those, via `product-content-api.ts`'s own
// `factsOf` (reused, not rebuilt — the identical shape PR 326's product-description job already grounds on), to
// `studioDetailNote` — never anything a client posts, so nothing sent to this route can ever pass as a grounded
// fact (see studio-detail-dispatch.ts's own header comment). The answer is `{ok: true, note}`, `note` either the
// grounded string or `null` (AI off, Gyani paused, no connection ready, the monthly cap reached, or the model
// answered with nothing usable) — a plain, additive extra a future Studio page can show or simply omit.
import * as cat from '@extas/catalogue';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
import { factsOf } from './product-content-api';
import { studioDetailNote } from './studio-detail-dispatch';

export async function studioDetailNoteHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!isUuid(id)) return fail(400, 'INVALID_INPUT', ['id']);
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'photoshoot.generate', storeId });
  if (g instanceof Response) return g;
  try {
    const input = await body(request);
    const locale = input.locale === 'bn' ? 'bn' : 'en';
    const who: cat.Who = { actor: g.actor, storeId, ctx: g.ctx };
    const catDeps: cat.CatalogueDeps = { db: deps!.db, settings: deps!.resolver, now: deps!.now };
    const product = await cat.getProduct(catDeps, who, id);
    const note = await studioDetailNote({ db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, now: deps!.now }, storeId, id, locale, factsOf(product));
    return json({ ok: true, note });
  } catch (e) {
    return errorResponse(e);
  }
}
