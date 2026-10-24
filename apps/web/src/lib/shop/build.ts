// PR 98, 100 — what the set builder page reads on the server: the groups from @extas/combos `setBuilder` (the Smart
// Rules set tiers the builder offers, their products with every variant's price and stock, what the bag holds), and
// each product's pictures per colour and view from the product page's own read. Prices come only from @extas/combos.
// Without a database (CI, `next build`) or when it is slow, the page has no groups (it says the builder is taking a
// break). A test server (EXTAS_SHOP_TEST_PAGES=1) may ask for the preview (`?try=1`): the page as it will look once
// switched on, with the draft set tier rules too — never on the live shop.
import { findBag } from '@extas/cart';
import { builderOffer, setBuilder, type BuilderGroup, type SetBuilder } from '@extas/combos';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { cartDeps, visitorId } from './bag';
import { testPagesOn } from './bag-api';
import { readPageSettings, type ShopContext } from './context';
import { keysOf, SHOP_DICTS } from './dict';
import { BUILD_VIEWS, type BuildCard, type BuildEnv, type BuildView } from './build-model';
import { hrefIn } from './lang';
import { productData, type ProductData } from './product';
import { toModel } from './product-view';
import { ROUTES } from './routes';
import { viewShots } from './combo-model';
import { NO_COLOUR } from './product-model';

const inLang = (lang: 'en' | 'bn', en: string | null | undefined, bn: string | null | undefined) => (lang === 'bn' && bn?.trim()) || en?.trim() || '';

/** Every `build.*` word in the page's language, {slots} left open for the client part. */
export function buildWords(c: ShopContext): Record<string, string> {
  const dict = SHOP_DICTS.en.build;
  const keys = dict && typeof dict === 'object' ? keysOf(dict, 'build.') : [];
  return Object.fromEntries(keys.map((k) => [k.slice('build.'.length), c.t(k)]));
}

/** The test server's preview (never on the live shop). */
export const previewAsked = (search: Record<string, string | string[] | undefined>) => testPagesOn() && (Array.isArray(search.try) ? search.try[0] : search.try) === '1';

export type BuildPageResult = { builder: SetBuilder; group: BuilderGroup | null; asked: string | null; env: BuildEnv | null };

/** One group's cards: names, colours, sizes, variants and the pictures of every colour by view. */
async function cardsOf(c: ShopContext, group: BuilderGroup, drawingViews: Parameters<typeof toModel>[2]): Promise<BuildCard[]> {
  const read = await Promise.all(group.products.map((p) => productData(c.storeId, p.slug)));
  const data = new Map(read.filter((d): d is ProductData => d !== null).map((d) => [d.id, d]));
  return group.products.map((p) => {
    const d = data.get(p.id);
    const m = d ? toModel(d, c.lang, drawingViews, { money: c.money, off: (n) => c.t('pdp.price.off', { n: c.num(n) }), save: (amount) => c.t('pdp.price.save', { amount }) }) : null;
    const pick = (shots: Record<string, unknown>) => Object.fromEntries(BUILD_VIEWS.map((v) => [v, shots[v]])) as Record<BuildView, never>;
    const colours = p.colours.map((col) => ({ id: col.id, key: col.key, name: inLang(c.lang, col.nameEn, col.nameBn) || col.key, hex: col.hex }));
    return {
      id: p.id,
      name: inLang(c.lang, p.nameEn, p.nameBn),
      garment: d?.garment ?? null,
      colours,
      sizes: [...p.sizes].sort((a, b) => a.order - b.order).map((s) => ({ id: s.id, label: s.label })),
      variants: p.variants,
      shots: Object.fromEntries((colours.length ? colours : [{ id: NO_COLOUR, key: NO_COLOUR }]).map((col) => [col.id, pick(viewShots(col.key, m?.shots[col.key] ?? m?.shots[NO_COLOUR] ?? []))])),
    };
  });
}

/** The builder page: its groups, the one shown (`asked` by its rule key, else the first) and the client part's data. */
export async function buildPage(c: ShopContext, asked: string | null, preview: boolean): Promise<BuildPageResult | null> {
  const deps = cartDeps();
  if (!deps) return null;
  const [set, visitor] = await Promise.all([readPageSettings(['pdp.gallery'] as const, c.storeId), visitorId()]);
  try {
    return await withTimeout(
      (async (): Promise<BuildPageResult> => {
        const cartId = visitor ? await findBag(deps, { storeId: c.storeId, visitorId: visitor }).catch(() => null) : null;
        const builder = await setBuilder(deps, { storeId: c.storeId, cartId, preview });
        const group = (asked ? builder.groups.find((g) => g.key === asked) : undefined) ?? builder.groups[0] ?? null;
        if (!group) return { builder, group: null, asked, env: null };
        const env: BuildEnv = {
          lang: c.lang,
          bnDigits: c.lang === 'bn' && c.bnDigits,
          currency: c.s['store.currency'],
          ruleId: group.ruleId,
          ruleName: inLang(c.lang, group.nameEn, group.nameBn),
          tiers: group.tiers,
          cards: await cardsOf(c, group, set['pdp.gallery'].drawingViews),
          inBag: builder.inBag,
          maxPerLine: builder.maxPerLine,
          perItem: builder.settings.perItem,
          showWas: builder.showWas,
          words: buildWords(c),
          hrefs: { bag: hrefIn(c.lang, ROUTES.bag) },
        };
        return { builder, group, asked, env };
      })(),
      settingsTimeoutMs() * 6,
    );
  } catch (e) {
    console.warn(`shop: set builder unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** The builder's entries elsewhere (the landing page's "Build your own" row, beside "More sets"): the set sizes it offers,
 * or null while it (or its entries) is off. One read of the rules, no catalogue scan. */
export async function buildEntry(c: Pick<ShopContext, 'storeId'>): Promise<{ quantities: number[] } | null> {
  const deps = cartDeps();
  if (!deps) return null;
  try {
    const b = await withTimeout(builderOffer(deps, c.storeId), settingsTimeoutMs() * 2);
    if (!b.open) return null;
    return { quantities: [...new Set(b.groups.flatMap((g) => g.tiers.map((t) => t.quantity)))].sort((x, y) => x - y) };
  } catch (e) {
    console.warn(`shop: set builder entry unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
