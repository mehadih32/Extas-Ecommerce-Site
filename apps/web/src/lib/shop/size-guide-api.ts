// Follow-up 155 (PR 58, 75) — GET /api/shop/size-guide?lang=en|bn: what the size guide window needs, fetched only when
// someone opens it (nothing of it is on a page before): the categories Find My Size can answer for, each with its
// chart, the finder's rules (`pdp.finder`), whether the page writes Bengali digits, and the window's words in the
// asked language (the dictionary's `finder.*` and `sizeGuide.*` with the owner's own words, {slots} left open).
// Read-only and public; no answer is kept here (the window keeps the height and weight on the phone, exactly as the
// product page does). With Find My Size off, or no chart it can read, the answer has no entries and the window sends
// the shopper to the size guide page instead.
import type { PdpFinderSettings } from '@extas/settings';
import { fail, json } from '../admin-auth';
import { shopContextFor } from './context';
import { keysOf, SHOP_DICTS } from './dict';
import { isShopLang, type ShopLang } from './lang';
import { sizeGuideData, type GuideEntry, type SizeGuideData } from './size-guide';

export interface SizeGuideAnswer {
  ok: true;
  lang: ShopLang;
  bnDigits: boolean;
  finder: PdpFinderSettings | null;
  entries: GuideEntry[];
  words: Record<string, string>;
}

/** The window's words: Find My Size's (not the T3 card's), the guide's own, and the two unit formats. */
export function guideWords(t: (key: string) => string): Record<string, string> {
  const f = SHOP_DICTS.en.finder;
  const g = SHOP_DICTS.en.sizeGuide;
  const fk = f && typeof f === 'object' ? keysOf(f, 'finder.').filter((k) => !k.startsWith('finder.t3.')) : [];
  const gk = g && typeof g === 'object' ? keysOf(g, 'sizeGuide.') : [];
  return Object.fromEntries([...fk, ...gk, 'pdp.cm', 'pdp.inch'].map((k) => [k, t(k)]));
}

export interface GuideDeps {
  data: (storeId: number, lang: ShopLang) => Promise<SizeGuideData | null>;
  context: (storeId: number, lang: ShopLang) => Promise<{ t: (key: string) => string; bnDigits: boolean }>;
}

const live: GuideDeps = { data: sizeGuideData, context: shopContextFor };

export async function sizeGuideHandler(request: Request, storeId: number, d: GuideDeps = live): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const asked = new URL(request.url).searchParams.get('lang');
  const lang: ShopLang = isShopLang(asked) ? asked : 'en';
  try {
    const [data, c] = await Promise.all([d.data(storeId, lang), d.context(storeId, lang)]);
    const finder = data?.finder.on ? data.finder : null;
    const answer: SizeGuideAnswer = {
      ok: true,
      lang,
      // Bengali digits only on a Bengali page (the setting says how Bengali writes numbers)
      bnDigits: lang === 'bn' && c.bnDigits,
      finder,
      entries: finder ? (data?.entries ?? []).filter((e) => e.finds) : [],
      words: guideWords(c.t),
    };
    return json(answer);
  } catch {
    return fail(503, 'unavailable');
  }
}
