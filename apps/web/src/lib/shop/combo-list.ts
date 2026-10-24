// PR 572–574 — what a rule's own page and the combo templates read on the server: one auto rule's page (@extas/combos
// `rulePage`: its pairs with sizes, stock and set prices, its products, price table and 2 ↔ 3 piece companion) with the
// product cards the pictures are drawn from, and which template a page uses — the rule's own choice, else the shop's
// (`combos.template.list|page|bag`), or a `?tpl=` preview while `combos.template.preview` is on (never indexed).
// Without a database (CI, `next build`) or when it is slow, the page is "not found". Prices come only from @extas/combos.
import { rulePage, type RulePage } from '@extas/combos';
import { listTemplateFor } from '@extas/combos/pure';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { cartDeps } from './bag';
import { cardsByIds, type ShopCard } from './catalogue';
import { readPageSettings, type ShopContext } from './context';

export const LIST_TEMPLATES = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;
export type ListTemplate = (typeof LIST_TEMPLATES)[number];

const LIST_KEYS = ['combos.template.list', 'combos.template.preview', 'combos.list', 'combos.landing', 'combos.seasons'] as const;
export const readListSettings = (storeId: number) => readPageSettings(LIST_KEYS, storeId);
export type ListSettings = Awaited<ReturnType<typeof readListSettings>>;

/** A template preview asked for in the link (`?tpl=`), when previews are on and it is one of `allowed`. */
export function previewOf<T extends string>(asked: string | null, on: boolean, allowed: readonly T[]): T | null {
  return on && asked && (allowed as readonly string[]).includes(asked) ? (asked as T) : null;
}

/** The rule page's template: a preview, else the rule's own, else the shop's; anything unknown is L1. */
export function listTemplateOf(page: Pick<RulePage, 'rule'>, set: Pick<ListSettings, 'combos.template.list' | 'combos.template.preview'>, asked: string | null): ListTemplate {
  const t = previewOf(asked, set['combos.template.preview'], LIST_TEMPLATES) ?? listTemplateFor({ combo: null, rule: page.rule.listTemplateKey, shop: set['combos.template.list'] });
  return (LIST_TEMPLATES as readonly string[]).includes(t) ? (t as ListTemplate) : 'L1';
}

export interface RuleData {
  page: RulePage;
  /** The product cards of the rule's products and its companion's (pictures, names, prices), by id. */
  cards: Map<string, ShopCard>;
}

/** One rule's page by its key or id: null without a database (or when slow), `missing` when there is no such rule. */
export async function ruleData(c: Pick<ShopContext, 'storeId'>, ref: { key?: string; id?: string }): Promise<RuleData | 'missing' | null> {
  const deps = cartDeps();
  if (!deps) return null;
  try {
    return await withTimeout(
      (async () => {
        const page = await rulePage(deps, c.storeId, ref);
        if (!page) return 'missing' as const;
        const ids = [...new Set([...page.products, ...(page.companion?.products ?? [])].map((p) => p.id))];
        const cards = await cardsByIds(c.storeId, ids);
        return { page, cards };
      })(),
      settingsTimeoutMs() * 6,
    );
  } catch (e) {
    console.warn(`shop: combo rule page unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
