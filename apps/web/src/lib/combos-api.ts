// S03 · PR 90 (with 571, 99, 575, 104) — the combo admin API. The combos page (`/admin/combos`) and the combo report
// (`/admin/combos/report`) call these routes. Every route signs the person in (guardAdmin), checks the permission in
// the store it touches (`?storeId=`, default the mother store), then calls @extas/combos, which checks the permission
// again (and `combos.prices` for a set price, the owner's decision) and writes the audit log. Answers are
// `{ ok: true, … }` or `{ ok: false, error: CODE, details }`. One catch-all route (app/api/admin/combos/[[...path]])
// hands every path to `combosRoute`.
//
//   GET   /api/admin/combos                 the fixed combos
//   POST  /api/admin/combos                 {combo} a new fixed combo (a draft)
//   POST  /api/admin/combos/preview         {combo} the editor's live preview (nothing saved)
//   GET   /api/admin/combos/:id             one combo
//   PUT   /api/admin/combos/:id             {combo, version} change it
//   POST  /api/admin/combos/:id/price       {setPriceMinor, version?} the card's price box (combos.prices)
//   POST  /api/admin/combos/:id/flags       {autoApply?, sameColour?}
//   POST  /api/admin/combos/:id/active      {on} switch on, or off to the archive (combos.publish)
//   POST  /api/admin/combos/:id/photo       PR 575 · make the set photo from the piece photos
//   PR 571 · auto colour-pair rules
//   GET   /api/admin/combos/rules                  the rules (with counts and their first pair)
//   POST  /api/admin/combos/rules                  {rule} a new rule (a draft; its pairs are made)
//   POST  /api/admin/combos/rules/preview          {rule} the wizard's live count and pairs (nothing saved)
//   GET   /api/admin/combos/rules/:id              one rule
//   PUT   /api/admin/combos/rules/:id              {rule, version} change it (the link stays)
//   GET   /api/admin/combos/rules/:id/pairs        every pair it makes
//   POST  /api/admin/combos/rules/:id/active       {on} (combos.publish)
//   POST  /api/admin/combos/rules/:id/dates        {startsOn, endsOn} (combos.publish)
//   POST  /api/admin/combos/rules/:id/options      {noSinglePiece?, listTemplateKey?, pageTemplateKey?, bagTemplateKey?}
//   POST  /api/admin/combos/rules/:id/upsell       {on, nameEn?, nameBn?} "add 1 more → 3 pcs"
//   GET   /api/admin/combos/templates              the shop's default templates
//   POST  /api/admin/combos/templates              {list?, page?, bag?}
//   PR 99 · set tiers (read from Smart Rules; changed there)
//   GET   /api/admin/combos/tiers                  "What customers can combine"
//   PR 104 · combo analytics
//   GET   /api/admin/combos/report?days=           which sets sell, which pairs get picked
//   PR 98, 100 · "Build your own set" (its screen comes on the new admin shell)
//   GET   /api/admin/combos/builder?days=          the builder's switches, the set tier rules it offers, what was built
//   POST  /api/admin/combos/builder                {on?, rules?, categories?, maxStyles?, perItem?, entries?} (combos.publish)
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cb from '@extas/combos';
import { imageSources } from '@extas/media';
import type { SetBuilderSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { mediaDeps } from './media';

export type CombosPerm = cb.CombosPermission;

export interface Ctx {
  deps: cb.CombosDeps;
  who: cb.Who;
  url: URL;
  admin: AdminDeps;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * The combo services' dependencies. The storage adapter is the media library's (PR 18; the mock until Blob is
 * connected), looked up only when a set photo is made. No `defer`: the admin waits for the photo's sizes, so the card
 * shows the new photo at once.
 */
export const combosDeps = (deps: AdminDeps): cb.CombosDeps => ({
  db: deps.db,
  settings: deps.resolver,
  now: deps.now,
  storage: async (storeId, provider) => {
    const m = mediaDeps();
    if (!m) throw new cb.CombosError('NO_STORAGE', 'no media storage on this server');
    return m.storage(storeId, provider);
  },
});

/** The card's set photo width the admin asks for (a rendition at least this wide, else the widest). */
const CARD_PHOTO_WIDTH = 640;

/** Each set photo's address for a card (rendered ones only; one still being made shows the drawn pieces). */
export async function cardPhotoUrls(deps: cb.CombosDeps, storeId: number, combos: readonly { id: string; setPhotoAssetId: string | null }[]): Promise<Record<string, string>> {
  const ids = combos.flatMap((c) => (c.setPhotoAssetId ? [c.setPhotoAssetId] : []));
  if (!ids.length) return {};
  const src = await imageSources({ db: deps.db, settings: deps.settings as never }, storeId, ids);
  const out: Record<string, string> = {};
  for (const c of combos) {
    const s = c.setPhotoAssetId ? src.get(c.setPhotoAssetId) : undefined;
    if (!s?.variants.length) continue;
    const sorted = [...s.variants].sort((x, y) => x.width - y.width);
    out[c.id] = (sorted.find((v) => v.width >= CARD_PHOTO_WIDTH) ?? sorted[sorted.length - 1]!).url;
  }
  return out;
}

export async function handle(request: Request, deps: AdminDeps | null, permission: CombosPerm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: combosDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, url, admin: deps! });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

export const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
export const notFound = () => Promise.resolve(fail(404, 'not-found'));
const asRecord = (v: unknown) => v as unknown as Record<string, unknown>;
const versionOf = (b: Record<string, unknown>) => (typeof b.version === 'number' ? b.version : undefined);

/** Every combo admin route: `path` is what comes after /api/admin/combos. */
export async function combosRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b] = path;
  if (a === 'rules') return rulesRoute(request, deps, path.slice(1));
  if (a === 'templates') {
    if (m === 'GET') return handle(request, deps, 'combos.read', async (x) => ({ templates: await cb.shopTemplates(x.deps, x.who.storeId) }));
    if (m === 'POST') return handle(request, deps, 'combos.write', async (x) => ({ templates: await cb.setShopTemplates(x.deps, x.who, (await body(request)) as Partial<cb.ShopTemplates>) }));
    return notAllowed();
  }
  if (a === 'report') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'combos.read', async (x) => {
      const raw = x.url.searchParams.get('days');
      return { report: await cb.comboReport(x.deps, x.who, raw === null ? {} : { days: Number(raw) }) };
    });
  }
  if (a === 'builder') {
    if (path.length > 1) return notFound();
    if (m === 'GET')
      return handle(request, deps, 'combos.read', async (x) => {
        const raw = x.url.searchParams.get('days');
        return { builder: await cb.builderAdmin(x.deps, x.who, raw === null ? {} : { days: Number(raw) }) };
      });
    if (m === 'POST') return handle(request, deps, 'combos.publish', async (x) => ({ settings: await cb.setBuilderOptions(x.deps, x.who, (await body(request)) as Partial<SetBuilderSettings>) }));
    return notAllowed();
  }
  if (a === 'tiers') {
    if (path.length > 1) return notFound();
    if (m === 'GET') return handle(request, deps, 'combos.read', async (x) => ({ tiers: await cb.listSetTiers(x.deps, x.who) }));
    return notAllowed();
  }
  if (path.length > 2) return notFound();

  if (a === undefined) {
    if (m === 'GET') return handle(request, deps, 'combos.read', async (x) => ({ combos: await cb.listCombos(x.deps, x.who) }));
    if (m === 'POST') return handle(request, deps, 'combos.write', async (x) => ({ combo: await cb.createCombo(x.deps, x.who, (await body(request)).combo as cb.FixedComboInput) }), 201);
    return notAllowed();
  }
  if (a === 'preview') {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'combos.read', async (x) => ({ combo: await cb.previewCombo(x.deps, x.who, (await body(request)).combo as cb.FixedComboInput) }));
  }
  if (!isUuid(a)) return notFound();
  if (b === undefined) {
    if (m === 'GET') return handle(request, deps, 'combos.read', async (x) => ({ combo: asRecord(await cb.getCombo(x.deps, x.who, a)) }));
    if (m === 'PUT')
      return handle(request, deps, 'combos.write', async (x) => {
        const bd = await body(request);
        return { combo: await cb.updateCombo(x.deps, x.who, a, bd.combo as cb.FixedComboInput, versionOf(bd)) };
      });
    return notAllowed();
  }
  if (m !== 'POST') return notAllowed();
  if (b === 'price')
    return handle(request, deps, 'combos.write', async (x) => {
      const bd = await body(request);
      const v = bd.setPriceMinor === null ? null : Number(bd.setPriceMinor);
      return { combo: await cb.setComboPrice(x.deps, x.who, a, v === null || Number.isFinite(v) ? v : Number.NaN, versionOf(bd)) };
    });
  if (b === 'flags')
    return handle(request, deps, 'combos.write', async (x) => {
      const bd = await body(request);
      return { combo: await cb.setComboFlags(x.deps, x.who, a, { autoApply: typeof bd.autoApply === 'boolean' ? bd.autoApply : undefined, sameColour: typeof bd.sameColour === 'boolean' ? bd.sameColour : undefined }) };
    });
  if (b === 'active')
    return handle(request, deps, 'combos.publish', async (x) => {
      const bd = await body(request);
      if (typeof bd.on !== 'boolean') return fail(400, 'INVALID_INPUT', ['on']);
      return { combo: await cb.setComboActive(x.deps, x.who, a, bd.on) };
    });
  if (b === 'photo')
    return handle(request, deps, 'combos.write', async (x) => {
      const photo = await cb.makeSetPhoto(x.deps, x.who, a);
      const combo = await cb.getCombo(x.deps, x.who, a);
      const urls = await cardPhotoUrls(x.deps, x.who.storeId, [combo]);
      return { photo, combo, photoUrl: urls[a] ?? null };
    });
  return notFound();
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const optStr = (v: unknown) => (v === null ? null : typeof v === 'string' && v ? v : null);

/** PR 571 — the auto rule routes: `path` is what comes after /api/admin/combos/rules. */
async function rulesRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b] = path;
  if (path.length > 2) return notFound();
  if (a === undefined) {
    if (m === 'GET') return handle(request, deps, 'combos.read', async (x) => ({ rules: await cb.listAutoRules(x.deps, x.who) }));
    if (m === 'POST') return handle(request, deps, 'combos.write', async (x) => ({ rule: await cb.createAutoRule(x.deps, x.who, (await body(request)).rule as cb.AutoRuleInput) }), 201);
    return notAllowed();
  }
  if (a === 'preview') {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'combos.read', async (x) => ({ preview: asRecord(await cb.previewAutoRule(x.deps, x.who, (await body(request)).rule as Partial<cb.AutoRuleInput>)) }));
  }
  if (!isUuid(a)) return notFound();
  if (b === undefined) {
    if (m === 'GET') return handle(request, deps, 'combos.read', async (x) => ({ rule: asRecord(await cb.getAutoRule(x.deps, x.who, a)) }));
    if (m === 'PUT')
      return handle(request, deps, 'combos.write', async (x) => {
        const bd = await body(request);
        return { rule: asRecord(await cb.updateAutoRule(x.deps, x.who, a, bd.rule as cb.AutoRuleInput, versionOf(bd))) };
      });
    return notAllowed();
  }
  if (b === 'pairs') {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'combos.read', async (x) => ({ pairs: await cb.autoRulePairs(x.deps, x.who, a) }));
  }
  if (m !== 'POST') return notAllowed();
  if (b === 'active')
    return handle(request, deps, 'combos.publish', async (x) => {
      const bd = await body(request);
      if (typeof bd.on !== 'boolean') return fail(400, 'INVALID_INPUT', ['on']);
      return { rule: asRecord(await cb.setAutoRuleActive(x.deps, x.who, a, bd.on)) };
    });
  if (b === 'dates')
    return handle(request, deps, 'combos.publish', async (x) => {
      const bd = await body(request);
      return { rule: asRecord(await cb.setAutoRuleDates(x.deps, x.who, a, optStr(bd.startsOn), optStr(bd.endsOn))) };
    });
  if (b === 'options')
    return handle(request, deps, 'combos.write', async (x) => ({ rule: asRecord(await cb.setAutoRuleOptions(x.deps, x.who, a, (await body(request)) as Parameters<typeof cb.setAutoRuleOptions>[3])) }));
  if (b === 'upsell')
    return handle(request, deps, 'combos.write', async (x) => {
      const bd = await body(request);
      if (typeof bd.on !== 'boolean') return fail(400, 'INVALID_INPUT', ['on']);
      return { rule: asRecord(await cb.setAutoRuleUpsell(x.deps, x.who, a, bd.on, { nameEn: str(bd.nameEn), nameBn: optStr(bd.nameBn) })) };
    });
  return notFound();
}
