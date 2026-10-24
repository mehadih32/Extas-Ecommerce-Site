// PR 91–95, 102, 103 — what the combo pages read on the server: one combo's page (`comboPage`: the combo with its
// pieces, live stock, price table and popular pairs from @extas/combos `setPage`, each piece's colours, sizes,
// measurements and pictures from the product page's own read), and the set cards of "More sets", the sets landing page
// and the product page's set offer (`setCardGroups`: @extas/combos `setCards`, grouped one per fixed set and one per
// auto rule and product, with the colours and product pictures the cards draw). Prices come only from @extas/combos.
// Without a database (CI, `next build`) or when it is slow, a combo page is "not found" and the cards are none.
import { findBag } from '@extas/cart';
import { CombosError, SET_WORDS, setCards, setPage, type SetCardsQuery, type SetPage } from '@extas/combos';
import { groupCards, initialPicks, type SetCard, type SetCardRule } from '@extas/combos/page-model';
import { getPrisma } from '@extas/db/client';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { bagSettings, cartDeps, visitorId } from './bag';
import { cardsByIds, type ShopCard } from './catalogue';
import { readPageSettings, type ShopContext } from './context';
import { keysOf, SHOP_DICTS } from './dict';
import { productPath } from './home-model';
import { hrefIn } from './lang';
import { productData, type ProductData } from './product';
import { toModel } from './product-view';
import { ROUTES } from './routes';
import { stepLabels, viewShots, type ComboEnv, type ComboPiece, type HubGroup } from './combo-model';
import { NO_COLOUR } from './product-model';

export const COMBO_PAGE_KEYS = ['combos.page.layout', 'combos.page.popularPairs', 'combos.page.parts', 'combos.page.moreSets', 'pdp.gallery'] as const;

const inLang = (lang: 'en' | 'bn', en: string | null | undefined, bn: string | null | undefined) => (lang === 'bn' && bn?.trim()) || en?.trim() || '';

/** Every `combo.*` word in the page's language, {slots} left open for the client part. */
export function comboWords(c: ShopContext): Record<string, string> {
  const dict = SHOP_DICTS.en.combo;
  const keys = dict && typeof dict === 'object' ? keysOf(dict, 'combo.') : [];
  return Object.fromEntries(keys.map((k) => [k, c.t(k)]));
}

export type ComboPageResult =
  | { kind: 'missing' }
  | { kind: 'page'; page: SetPage; env: ComboEnv; set: Awaited<ReturnType<typeof readComboSettings>>; data: Map<string, ProductData> };

const readComboSettings = (storeId: number) => readPageSettings(COMBO_PAGE_KEYS, storeId);

/** The pieces as the page draws them: names, colours with their notes, sizes, measurements by size and pictures by view. */
function piecesOf(c: ShopContext, page: SetPage, data: Map<string, ProductData>, drawingViews: Parameters<typeof toModel>[2]): ComboPiece[] {
  const prefix = c.s['naming.productPathPrefix'];
  const models = new Map(
    [...data.entries()].map(([id, d]) => [id, toModel(d, c.lang, drawingViews, { money: c.money, off: (n) => c.t('pdp.price.off', { n: c.num(n) }), save: (amount) => c.t('pdp.price.save', { amount }) })]),
  );
  const raw = page.summary.pieces.map((p) => {
    const d = data.get(p.productId);
    const m = models.get(p.productId);
    const name = inLang(c.lang, p.nameEn, p.nameBn) || (d ? inLang(c.lang, d.nameEn, d.nameBn) : '');
    const chart = m?.chart
      ? {
          fields: m.chart.fields.map((f) => f.label),
          rows: Object.fromEntries(
            m.chart.rows.flatMap((r) => {
              const size = p.sizes.find((s) => s.key === r.size);
              return size ? [[size.id, { inch: r.inch, cm: r.cm }]] : [];
            }),
          ),
        }
      : null;
    return {
      slot: p.slot,
      productId: p.productId,
      name,
      href: p.productSlug ? hrefIn(c.lang, productPath(prefix, p.productSlug)) : null,
      garment: d?.garment ?? null,
      fit: d?.fit ?? null,
      label: inLang(c.lang, p.labelEn, p.labelBn) || name,
      colours: p.colours.map((col) => ({
        id: col.id,
        key: col.key,
        name: inLang(c.lang, col.nameEn, col.nameBn) || col.key,
        hex: col.hex,
        note: m?.colours.find((x) => x.key === col.key)?.note ?? null,
        open: col.open,
      })),
      sizes: p.sizes.map((s) => ({ id: s.id, label: s.label })),
      chart,
      shots: Object.fromEntries(
        (p.colours.length ? p.colours : [{ id: NO_COLOUR, key: NO_COLOUR }]).map((col) => [col.id, viewShots(col.key, m?.shots[col.key] ?? m?.shots[NO_COLOUR] ?? [])]),
      ),
    } satisfies ComboPiece;
  });
  const labels = stepLabels(
    raw.map((p) => p.label),
    c.num,
  );
  return raw.map((p, i) => ({ ...p, label: labels[i]! }));
}

/** One combo's page by its link: null without a database (or when it is slow), `missing` when there is no such combo. */
export async function comboPage(c: ShopContext, slug: string, from: string | null): Promise<ComboPageResult | null> {
  const deps = cartDeps();
  if (!deps) return null;
  const [set, bag, visitor] = await Promise.all([readComboSettings(c.storeId), bagSettings(c.storeId), visitorId()]);
  try {
    return await withTimeout(
      (async (): Promise<ComboPageResult> => {
        const cartId = visitor ? await findBag(deps, { storeId: c.storeId, visitorId: visitor }).catch(() => null) : null;
        const editGroupKey = from && /^[A-Za-z0-9_-]{1,120}$/.test(from) ? from : undefined;
        let page: SetPage;
        try {
          page = await setPage(deps, { storeId: c.storeId, slug }, { cartId: cartId ?? undefined, editGroupKey, pairs: set['combos.page.popularPairs'] });
        } catch (e) {
          if (e instanceof CombosError && (e.code === 'NOT_FOUND' || e.code === 'INVALID_INPUT')) return { kind: 'missing' };
          throw e;
        }
        const slugs = [...new Set(page.summary.pieces.map((p) => p.productSlug).filter((s): s is string => Boolean(s)))];
        const read = await Promise.all(slugs.map((s) => productData(c.storeId, s)));
        const data = new Map(read.filter((d): d is ProductData => d !== null).map((d) => [d.id, d]));
        const pieces = piecesOf(c, page, data, set['pdp.gallery'].drawingViews);
        const s = page.summary;
        const first = s.price;
        const parts = set['combos.page.parts'];
        const env: ComboEnv = {
          lang: c.lang,
          bnDigits: c.lang === 'bn' && c.bnDigits,
          currency: c.s['store.currency'],
          layout: set['combos.page.layout'],
          comboId: s.comboId,
          slug: s.slug,
          name: inLang(c.lang, s.nameEn, s.nameBn),
          needsMix: s.needsMix,
          onSale: s.onSale,
          autoApply: page.autoApply,
          slots: page.slots,
          variants: page.variants,
          prices: page.prices,
          firstPrice: { pay: first.payMinor, regular: first.regularMinor, saving: first.savingMinor, was: first.wasMinor, offer: first.offer },
          inBag: page.inBag,
          editGroupKey: page.edit?.groupKey ?? null,
          initial: initialPicks(page.slots, page.variants, s.pieces.map((p) => p.defaultColourId), page.edit?.choices ?? null),
          pieces,
          pairs: page.pairs.map((p) => ({ colourIds: p.colourIds, href: p.slug ? hrefIn(c.lang, ROUTES.combo(p.slug)) : null })),
          words: comboWords(c),
          problems: { ...SET_WORDS[c.lang].problem },
          itemWords: SET_WORDS[c.lang].item,
          hrefs: { bag: hrefIn(c.lang, ROUTES.bag), checkout: hrefIn(c.lang, ROUTES.checkout) },
          behaviour: bag['bag.addBehaviour'],
          whatsapp: parts.whatsapp ? (c.s['contact.whatsapp'] ?? null) : null,
          store: c.storeName,
          parts: { summary: parts.summary, whatsapp: parts.whatsapp, itemPrices: parts.itemPrices },
          lowStockAt: bag['bag.lowStockAt'],
        };
        return { kind: 'page', page, env, set, data };
      })(),
      settingsTimeoutMs() * 6,
    );
  } catch (e) {
    console.warn(`shop: combo page unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// PR 102, 103 · the set cards
// ---------------------------------------------------------------------------------------------------------------

export interface CardColour {
  key: string;
  name: string;
  hex: string;
}

export interface SetCardGroups {
  groups: HubGroup[];
  rules: SetCardRule[];
  /** The products of the cards (their pictures and names), by id. */
  products: Map<string, ShopCard>;
  /** The colours of the cards, by id. */
  colours: Map<string, CardColour>;
}

const NONE: SetCardGroups = { groups: [], rules: [], products: new Map(), colours: new Map() };

/** The running sets on sale now as the customer reads them (one card per fixed set, one per auto rule and product). */
export async function setCardGroups(c: Pick<ShopContext, 'storeId' | 'lang'>, q: SetCardsQuery = {}): Promise<SetCardGroups> {
  const deps = cartDeps();
  if (!deps) return NONE;
  try {
    return await withTimeout(
      (async () => {
        const { cards, rules } = await setCards(deps, c.storeId, q);
        if (!cards.length) return NONE;
        const productIds = [...new Set(cards.flatMap((x) => x.productIds))];
        const colourIds = [...new Set(cards.flatMap((x) => x.colourIds.concat(x.pieces.flatMap((p) => (p.colourId ? [p.colourId] : [])))))];
        const [products, colourRows] = await Promise.all([
          cardsByIds(c.storeId, productIds),
          getPrisma().colour.findMany({ where: { storeId: c.storeId, id: { in: colourIds } }, select: { id: true, key: true, nameEn: true, nameBn: true, hex: true } }),
        ]);
        const colours = new Map(colourRows.map((r) => [r.id, { key: r.key, name: inLang(c.lang, r.nameEn, r.nameBn) || r.key, hex: r.hex }]));
        const groups = groupCards(cards).sort((a, b) => (b.cards[0]?.sortRank ?? 0) - (a.cards[0]?.sortRank ?? 0));
        return { groups, rules, products, colours };
      })(),
      settingsTimeoutMs() * 4,
    );
  } catch (e) {
    console.warn(`shop: set cards unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return NONE;
  }
}

/** What one card shows: its name, the pieces' pictures, how many pairs it stands for, its price and every colour. */
export interface CardView {
  key: string;
  href: string;
  name: string;
  /** The first product's name (a pack of one product is "{name} combo" on the landing page). */
  styleName: string;
  /** "Polo + Chino" for a set of different products; null for a pack of one product. */
  pieceNames: string | null;
  pieces: { garment: string | null; hex: string; photo: ShopCard['photos'][string] | null; name: string }[];
  count: number;
  pay: number | null;
  regular: number | null;
  saving: number;
  colours: CardColour[];
  sameProduct: boolean;
}

/** A group's card: a rule's group opens the rule's own page (PR 572, follow-up 173), a fixed set its own page.
 * ~~its link the first set of the group (a rule's own list is PR 572)~~ */
export function cardView(c: Pick<ShopContext, 'lang'>, g: HubGroup, all: SetCardGroups): CardView {
  const first: SetCard = g.cards[0]!;
  const rule = g.ruleId ? all.rules.find((r) => r.id === g.ruleId) : undefined;
  const nameOfProduct = (id: string) => {
    const p = all.products.get(id);
    return p ? inLang(c.lang, p.nameEn, p.nameBn) : '';
  };
  const sameProduct = new Set(first.productIds).size === 1;
  const name = rule ? inLang(c.lang, rule.titleEn ?? rule.nameEn, rule.titleBn ?? rule.nameBn) || nameOfProduct(first.productIds[0]!) : inLang(c.lang, first.nameEn, first.nameBn);
  const colourIds = [...new Set(g.cards.flatMap((x) => x.colourIds))];
  return {
    key: g.key,
    href: hrefIn(c.lang, rule ? ROUTES.comboRule(rule.key) : ROUTES.combo(first.slug)),
    name,
    styleName: nameOfProduct(first.productIds[0]!),
    pieceNames: sameProduct ? null : first.productIds.map(nameOfProduct).filter(Boolean).join(' + '),
    pieces: first.pieces.map((p) => {
      const card = all.products.get(p.productId);
      const col = p.colourId ? all.colours.get(p.colourId) : undefined;
      return { garment: card?.garment ?? null, hex: col?.hex ?? card?.colours[0]?.hex ?? '', photo: card ? (card.photos[col?.key ?? ''] ?? card.photos['*'] ?? null) : null, name: [col?.name, card ? inLang(c.lang, card.nameEn, card.nameBn) : ''].filter(Boolean).join(' ') };
    }),
    count: g.cards.length,
    pay: first.price.pay,
    regular: first.price.regular,
    saving: first.price.saving,
    colours: colourIds.flatMap((id) => {
      const col = all.colours.get(id);
      return col ? [col] : [];
    }),
    sameProduct,
  };
}
