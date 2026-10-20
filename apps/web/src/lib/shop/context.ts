// PR 40 / 501 / 503 — everything a shop page needs before it draws, read once per request: the language (from the
// proxy), the theme of the day, the shell settings, the owner's contact details and the visible categories. Every
// value comes from settings (or the catalogue); when the database is slow or absent (CI, `next build`), the registry's
// defaults are used and the categories are empty, so a page always draws — never a guess at the owner's data.
import { cache } from 'react';
import { headers } from 'next/headers';
import { getPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { registry, type Key, type Value } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { shopT, type ShopT, type Vars } from './dict';
import { formatMoney, isShopLang, LANG_HEADER, PATH_HEADER, THEME_HEADER, toBnDigits, type ShopLang } from './lang';
import { SIGNUP_LIST_LIVE, type Flags, type ShopCategory } from './shell-model';
import { shopTheme, todayIn, type ShopTheme } from './theme';

const KEYS = [
  'store.name',
  'store.timeZone',
  'store.currency',
  'store.locale',
  'brand.slogan',
  'brand.sloganShort',
  'brand.logoSize',
  'brand.logoStyle',
  'naming.productPathPrefix',
  'theme.preset',
  'theme.schedule',
  'theme.previewParam',
  'theme.colours',
  'theme.fonts',
  'theme.largeText',
  'contact.phone',
  'contact.whatsapp',
  'contact.email',
  'contact.hours',
  'social.facebook',
  'social.instagram',
  'social.youtube',
  'social.tiktok',
  'legal.dbid',
  'legal.tradeLicence',
  'payment.cod.enabled',
  'delivery.freeOverMinor',
  'policy.exchange.enabled',
  'policy.exchange.windowHours',
  'shell.announce',
  'shell.header',
  'shell.menu',
  'shell.desktopNav',
  'shell.footer',
  'language.bengali.enabled',
  'language.bengali.readyPages',
  'language.bengali.digits',
  'language.labels',
  'slider.engine',
] as const satisfies readonly Key[];

type ShopKey = (typeof KEYS)[number];
export type ShopSettings = { [K in ShopKey]: Value<K> };

/** The registry defaults (the shop as designed, with none of the owner's data). */
export function defaultShopSettings(): ShopSettings {
  return Object.fromEntries(KEYS.map((k) => [k, registry[k].default])) as ShopSettings;
}

/** The store the shop serves: the mother store, or another one the server names (technical, like the DB address). */
export function shopStoreId(): number {
  const n = Number.parseInt(process.env.SHOP_STORE_ID ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : MOTHER_STORE_ID;
}

async function readSettings(storeId: number): Promise<{ values: ShopSettings; live: boolean }> {
  const resolver = settingsResolver();
  if (!resolver) return { values: defaultShopSettings(), live: false };
  try {
    const vals = await withTimeout(Promise.all(KEYS.map((k) => resolver.value(k, { storeId }))), settingsTimeoutMs());
    return { values: Object.fromEntries(KEYS.map((k, i) => [k, vals[i]])) as ShopSettings, live: true };
  } catch (e) {
    console.warn(`shop: settings unavailable, drawing with the defaults (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return { values: defaultShopSettings(), live: false };
  }
}

/** Visible, not archived categories (top level), each with its published products counted and its children. */
export async function readCategories(storeId: number): Promise<{ cats: ShopCategory[]; storeName: string | null }> {
  if (!process.env.DATABASE_URL) return { cats: [], storeName: null };
  const prisma = getPrisma();
  try {
    const [rows, store] = await withTimeout(
      Promise.all([
        prisma.category.findMany({
          where: { storeId, isVisible: true, archivedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
          select: {
            id: true,
            slug: true,
            nameEn: true,
            nameBn: true,
            parentId: true,
            garmentType: { select: { key: true } },
            _count: { select: { products: { where: { status: 'PUBLISHED', archivedAt: null } } } },
          },
        }),
        prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
      ]),
      settingsTimeoutMs(),
    );
    const byParent = new Map<string, typeof rows>();
    for (const r of rows) if (r.parentId) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
    const ids = new Set(rows.map((r) => r.id));
    const cats = rows
      .filter((r) => !r.parentId || !ids.has(r.parentId))
      .filter((r) => !r.parentId)
      .map((r) => {
        const kids = byParent.get(r.id) ?? [];
        const children = kids.map((k) => ({ slug: k.slug, nameEn: k.nameEn, nameBn: k.nameBn, count: k._count.products }));
        return {
          slug: r.slug,
          nameEn: r.nameEn,
          nameBn: r.nameBn,
          garment: r.garmentType?.key ?? null,
          count: r._count.products + children.reduce((s, c) => s + c.count, 0),
          children,
        };
      });
    return { cats, storeName: store?.name?.trim() || null };
  } catch (e) {
    console.warn(`shop: categories unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return { cats: [], storeName: null };
  }
}

export interface ShopContext {
  lang: ShopLang;
  /** The page path without /bn (for "you are here" and the language switch). */
  path: string;
  t: ShopT;
  s: ShopSettings;
  /** Settings came from the database (false = defaults only). */
  live: boolean;
  storeName: string;
  theme: ShopTheme;
  today: string;
  year: number;
  flags: Flags;
  /** Slots every shop text may use: {store}, {freeOver}, {windowHours}, {year}. */
  vars: Vars;
  cats: ShopCategory[];
  bnDigits: boolean;
  /** A number in the page's digits. */
  num: (n: number) => string;
}

export const shopContext = cache(async (): Promise<ShopContext> => {
  const h = await headers();
  const lang: ShopLang = isShopLang(h.get(LANG_HEADER)) ? (h.get(LANG_HEADER) as ShopLang) : 'en';
  const path = h.get(PATH_HEADER) || '/';
  const storeId = shopStoreId();
  const [{ values: s, live }, { cats, storeName: rowName }] = await Promise.all([readSettings(storeId), readCategories(storeId)]);
  const t = shopT(lang, s['language.labels']);
  const now = new Date();
  const today = todayIn(s['store.timeZone'], now);
  const bnDigits = s['language.bengali.digits'];
  const num = (n: number) => (lang === 'bn' && bnDigits ? toBnDigits(String(n)) : String(n));
  const storeName = s['store.name']?.trim() || rowName || t('brand.fallback');
  const freeOverMinor = s['delivery.freeOverMinor'];
  const flags: Flags = {
    cod: s['payment.cod.enabled'] === true,
    freeDelivery: typeof freeOverMinor === 'number' && freeOverMinor > 0,
    exchange: s['policy.exchange.enabled'] === true,
    whatsapp: Boolean(s['contact.whatsapp']),
    hotline: Boolean(s['contact.phone']),
    signupList: SIGNUP_LIST_LIVE,
  };
  const vars: Vars = {
    store: storeName,
    year: num(Number(today.slice(0, 4))),
    windowHours: num(s['policy.exchange.windowHours']),
    freeOver: typeof freeOverMinor === 'number' ? formatMoney(freeOverMinor, s['store.currency'], lang, bnDigits, 'en', '') : '',
  };
  const theme = shopTheme({
    preset: s['theme.preset'],
    schedule: s['theme.schedule'],
    colours: s['theme.colours'],
    fonts: s['theme.fonts'],
    today,
    preview: h.get(THEME_HEADER),
    previewAllowed: s['theme.previewParam'],
  });
  return { lang, path, t, s, live, storeName, theme, today, year: Number(today.slice(0, 4)), flags, vars, cats, bnDigits, num };
});
