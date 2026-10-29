// S11 · PR 221 — what the shop pages read for their search texts (lib/seo/templates has the order):
//   - a product's: its Names & links fields, else the naming templates (@extas/catalogue productSeoTexts — the same
//     words the naming table shows);
//   - a category's accepted AI draft (SeoMeta 'category'), which comes after the owner's own `category.seo` fields.
// A page never fails for its search texts: no database, a slow one or an error leaves the page's plain title.
import { cutTo } from '@extas/adapters';
import { productSeoTexts, type NamingField } from '@extas/catalogue';
import { getPrisma } from '@extas/db/client';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { cutBody, type PageTexts, type SeoLang } from './templates';

/** The SeoMeta entity a category's accepted draft is kept under. */
export const CATEGORY_SEO_ENTITY = 'category';

async function quietly<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await withTimeout(run(), settingsTimeoutMs());
  } catch (e) {
    console.warn(`shop: ${what} unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** One naming field as the page shows it: own text as typed; a template's cut to the limit. */
function shown(f: NamingField, max: number): string | null {
  const v = f.source === 'own' ? f.value.trim() : cutTo(f.value, max).trim();
  return v || null;
}

/**
 * A product page's title and description in one language. `tokens` replaces template tokens (a colour's own page);
 * `body` (the product's description) is used only when neither its own text nor the template gives a description.
 */
export async function productPageTexts(storeId: number, productId: string, lang: SeoLang, tokens: Record<string, string>, body: string | null): Promise<PageTexts | null> {
  const resolver = settingsResolver();
  if (!resolver) return null;
  const t = await quietly('product search texts', () => productSeoTexts({ db: getPrisma(), settings: resolver }, storeId, productId, { [lang]: tokens }));
  if (!t) return null;
  const title = shown(t.title[lang], t.title[lang].max);
  const description = shown(t.description[lang], t.description[lang].max) ?? (body?.trim() ? cutBody(body, t.description[lang].max) : null);
  return { title, description };
}

/** A category's accepted AI draft in one language (title and description; either may be empty). */
export async function categoryDraftTexts(storeId: number, categoryId: string, lang: SeoLang): Promise<{ title: string | null; description: string | null } | null> {
  return quietly('category search texts', async () => {
    const row = await getPrisma().seoMeta.findUnique({
      where: { storeId_entityType_entityId_locale: { storeId, entityType: CATEGORY_SEO_ENTITY, entityId: categoryId, locale: lang } },
      select: { title: true, description: true },
    });
    return row ? { title: row.title?.trim() || null, description: row.description?.trim() || null } : null;
  });
}
