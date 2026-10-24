// PR 573 — what a combo pair page in one of the templates P1–P5 reads on the server: the pair's rule as its own page
// reads it (@extas/combos `rulePage`: every pair with its sizes, stock and set price, the products, the price table and
// the 2 ↔ 3 piece companion), the products' pictures and measurements, the bag's own pieces and the page's words. The
// combo page (`comboPage`, PR 91–95) is read first; this only adds what a template needs. Null when the pair cannot be
// drawn in a template (no rule, the rule is not on sale, a slow database): the page then keeps its current look.
import { rulePage, type RulePage } from '@extas/combos';
import type { Dict } from '../i18n';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { cartDeps } from './bag';
import { cardsByIds, photoFor } from './catalogue';
import type { ComboPageResult } from './combo';
import { readPageSettings, type ShopContext } from './context';
import { keysOf, SHOP_DICTS } from './dict';
import { productPath } from './home-model';
import { hrefIn } from './lang';
import { ROUTES } from './routes';
import type { PairEnv, PairProduct, PairSide, PairTemplate } from './combo-pair-model';

const inLang = (lang: 'en' | 'bn', en: string | null | undefined, bn: string | null | undefined) => (lang === 'bn' && bn?.trim()) || en?.trim() || '';

/** Every `ctpl.*` word and the `combo.wa.*` words, in the page's language, {slots} left open for the client part. */
const branch = (d: Dict | string | undefined, key: string): Dict => (d && typeof d === 'object' && typeof d[key] === 'object' ? (d[key] as Dict) : {});

function pairWords(c: ShopContext): Record<string, string> {
  const en = SHOP_DICTS.en;
  const keys = [...keysOf(branch(en, 'ctpl'), 'ctpl.'), ...keysOf(branch(branch(en, 'combo'), 'wa'), 'combo.wa.')];
  return Object.fromEntries(keys.map((k) => [k, c.t(k)]));
}

export const PAIR_KEYS = ['combos.pairPage', 'combos.template.preview'] as const;
export const readPairSettings = (storeId: number) => readPageSettings(PAIR_KEYS, storeId);

function sideOf(c: ShopContext, p: Omit<RulePage, 'companion'>): PairSide {
  const r = p.rule;
  return {
    rule: { key: r.key, pieces: r.pieces, pairing: r.pairing, title: inLang(c.lang, r.titleEn ?? r.nameEn, r.titleBn ?? r.nameBn), href: hrefIn(c.lang, ROUTES.comboRule(r.key)) },
    pairs: p.pairs,
    prices: p.prices,
  };
}

/** The pair page's data, or null (the page keeps its current look). */
export async function pairEnv(c: ShopContext, r: Extract<ComboPageResult, { kind: 'page' }>, tpl: PairTemplate, preview: boolean): Promise<PairEnv | null> {
  const deps = cartDeps();
  const ruleId = r.page.ruleId;
  if (!deps || !ruleId) return null;
  try {
    return await withTimeout(
      (async (): Promise<PairEnv | null> => {
        const [rp, set] = await Promise.all([rulePage(deps, c.storeId, { id: ruleId }), readPairSettings(c.storeId)]);
        if (!rp || !rp.onSale) return null;
        const me = rp.pairs.find((p) => p.slug === r.page.summary.slug);
        if (!me) return null;
        const all = [...rp.products, ...(rp.companion?.products ?? [])].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
        const cards = await cardsByIds(
          c.storeId,
          all.map((p) => p.id),
        );
        const prefix = c.s['naming.productPathPrefix'];
        const charts = new Map(r.env.pieces.map((p) => [p.productId, p.chart]));
        const products: PairProduct[] = all.map((p) => {
          const card = cards.get(p.id);
          return {
            id: p.id,
            name: inLang(c.lang, p.nameEn, p.nameBn),
            href: hrefIn(c.lang, productPath(prefix, p.slug)),
            garment: card?.garment ?? null,
            colours: p.colours.map((x) => ({ id: x.id, key: x.key, name: inLang(c.lang, x.nameEn, x.nameBn) || x.key, hex: x.hex })),
            sizes: p.sizes,
            variants: p.variants,
            photos: Object.fromEntries(p.colours.map((x) => [x.id, card ? photoFor(card, x.key) : null])),
            chart: charts.get(p.id) ?? null,
          };
        });
        const pairSet = set['combos.pairPage'];
        const freeOver = c.s['delivery.freeOverMinor'];
        return {
          tpl,
          lang: c.lang,
          bnDigits: c.lang === 'bn' && c.bnDigits,
          currency: c.s['store.currency'],
          me,
          side: sideOf(c, rp),
          companion: rp.companion ? sideOf(c, rp.companion) : null,
          products,
          inBag: r.page.inBag,
          editGroupKey: r.env.editGroupKey,
          words: pairWords(c),
          hrefs: {
            bag: hrefIn(c.lang, ROUTES.bag),
            checkout: hrefIn(c.lang, ROUTES.checkout),
            combo: hrefIn(c.lang, ROUTES.combo('')),
            rule: hrefIn(c.lang, ROUTES.comboRule(rp.rule.key)),
            query: preview ? `?tpl=${tpl}` : '',
          },
          behaviour: r.env.behaviour,
          whatsapp: r.env.whatsapp,
          store: c.storeName,
          trust: { cod: c.flags.cod, freeOverMinor: c.flags.freeDelivery && typeof freeOver === 'number' ? freeOver : null, exchangeHours: c.flags.exchange ? String(c.vars.windowHours) : null },
          otherPairs: pairSet.otherPairs,
          packSwatches: pairSet.packSwatches,
          upsell: pairSet.upsell && rp.rule.addOneMore,
        };
      })(),
      settingsTimeoutMs() * 6,
    );
  } catch (e) {
    console.warn(`shop: combo pair page unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
