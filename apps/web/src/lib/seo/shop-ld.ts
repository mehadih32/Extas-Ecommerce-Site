// S11 · PR 222 — the home page's JSON-LD (follow-up 110): the shop itself (Organization) and its website name
// (WebSite), from the owner's own settings — the shop's name, its logo (`brand.logo`, the media store's largest copy),
// phone and e-mail, and its social pages — leaving out whatever is not filled in. A slow or missing database leaves
// the logo out, never the page.
import { getPrisma } from '@extas/db/client';
import { imageSources } from '@extas/media';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { readPageSettings, type ShopContext } from '../shop/context';
import { hrefIn } from '../shop/lang';
import { largestUrl, organizationLd, websiteLd } from '../shop/structured-data';

const KEYS = ['seo.structuredData', 'brand.logo'] as const;

async function logoUrl(storeId: number, id: string | null): Promise<string | null> {
  const resolver = settingsResolver();
  if (!id || !resolver || !process.env.DATABASE_URL) return null;
  try {
    const m = await withTimeout(imageSources({ db: getPrisma(), settings: resolver }, storeId, [id]), settingsTimeoutMs());
    return largestUrl(m.get(id));
  } catch (e) {
    console.warn(`shop: the logo for search engines is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** The home page's Organization and WebSite blocks (each null when switched off or the shop has no name). */
export async function shopLd(c: ShopContext, origin: URL): Promise<(Record<string, unknown> | null)[]> {
  const set = await readPageSettings(KEYS, c.storeId);
  const sd = set['seo.structuredData'];
  if (!sd.organization && !sd.website) return [];
  // the shop's own name (its setting, else the store's record), never the shell's stand-in word
  const name = c.storeName === c.t('brand.fallback') ? '' : c.storeName;
  const languages = c.s['language.bengali.enabled'] ? ['en', 'bn'] : ['en'];
  const sameAs = [c.s['social.facebook'], c.s['social.instagram'], c.s['social.youtube'], c.s['social.tiktok']].filter((u): u is string => Boolean(u));
  const logo = sd.organization ? await logoUrl(c.storeId, set['brand.logo']) : null;
  const href = hrefIn(c.lang, '/');
  return [
    sd.organization ? organizationLd(origin, { name, href, lang: c.lang, logo, phone: c.s['contact.phone'], email: c.s['contact.email'], sameAs, languages }) : null,
    sd.website ? websiteLd(origin, { name, href, lang: c.lang }) : null,
  ];
}
