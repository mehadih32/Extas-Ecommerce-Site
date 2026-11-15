// PR 740–744 — Website › Page settings: which setting keys each screen edits, in which section, and which of them
// wait under "More options". A new page setting joins a screen with one line here; the editor draws it from the key's own
// schema (describe.ts). Pure: no React, no database. Permissions: the page screens are the website's (`website.read` to see,
// `website.layout.write` to save); the shop-wide ones (currency and time, e-mail look) are the settings' (`settings.read` /
// `settings.write`). Nothing here is a price, an order or a customer.
import type { PermissionKey } from '@extas/auth';
import type { Key } from '@extas/settings';

export const SCREEN_IDS = ['home', 'category', 'product', 'thanks', 'bag', 'account', 'search', 'currency', 'email', 'cookie', 'appicon'] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export interface SectionDef {
  /** `ps.sec.<id>.title` and `.help` in the screen's words. */
  id: string;
  keys: readonly Key[];
  /** Rare options: the section sits under "More options". */
  more?: boolean;
}

export type WidgetKind = 'products' | 'collection' | 'media' | 'colour' | 'currency' | 'locale' | 'tz';
export interface Widget {
  kind: WidgetKind;
  /** Drawn only while a sibling field of the same object has this value. */
  showIf?: { sibling: string; eq: string };
}

export interface ScreenDef {
  id: ScreenId;
  /** `pages`: a page of the shop; `shop`: the whole shop. */
  group: 'pages' | 'shop';
  read: PermissionKey;
  write: PermissionKey;
  /** The shop address to look at while editing (`null`: none to show). */
  open: string | null;
  sections: readonly SectionDef[];
  /** `<key>/<path>` (path without row numbers) → how that part is drawn. */
  widgets: Readonly<Record<string, Widget>>;
}

const PAGE = { group: 'pages', read: 'website.read', write: 'website.layout.write' } as const;
const SHOP = { group: 'shop', read: 'settings.read', write: 'settings.write' } as const;

export const SCREENS: Readonly<Record<ScreenId, ScreenDef>> = {
  home: {
    id: 'home',
    ...PAGE,
    open: '/',
    sections: [
      { id: 'homeFlash', keys: ['home.flashSale', 'home.flashRows'] },
      { id: 'homeHero', keys: ['home.heroSlides'] },
      { id: 'homeSlider', keys: ['slider.engine'], more: true },
    ],
    widgets: {
      'home.flashSale/productIds': { kind: 'products', showIf: { sibling: 'source', eq: 'products' } },
      'home.flashSale/collection': { kind: 'collection', showIf: { sibling: 'source', eq: 'collection' } },
      'home.heroSlides/collection': { kind: 'collection' },
    },
  },
  category: {
    id: 'category',
    ...PAGE,
    open: '/collections',
    sections: [
      { id: 'catList', keys: ['category.page', 'category.newIn'] },
      { id: 'catSort', keys: ['category.sort'] },
      { id: 'catFilters', keys: ['category.filters'] },
      { id: 'catToolbar', keys: ['category.toolbar'], more: true },
    ],
    widgets: {},
  },
  product: {
    id: 'product',
    ...PAGE,
    open: null,
    sections: [
      { id: 'pdpTemplate', keys: ['pdp.templates'] },
      { id: 'pdpTrust', keys: ['pdp.trust', 'pdp.rules'] },
      { id: 'pdpSummaries', keys: ['policy.returns.summary', 'policy.exchange.summary', 'policy.orderEdit.summary'] },
      { id: 'pdpChoose', keys: ['pdp.colour', 'pdp.size', 'pdp.sizeWords', 'pdp.chart', 'pdp.stock'] },
      { id: 'pdpBuy', keys: ['pdp.price', 'pdp.buy', 'pdp.share', 'pdp.details'] },
      { id: 'pdpSocial', keys: ['pdp.reviews', 'pdp.qa'] },
      { id: 'pdpRare', keys: ['pdp.page', 'pdp.gallery', 'pdp.icons', 'pdp.usualSize', 'pdp.qaAsk', 'pdp.reviewReply', 'pdp.rows', 'pdp.finder', 'pdp.fit'], more: true },
    ],
    widgets: {},
  },
  thanks: {
    id: 'thanks',
    ...PAGE,
    open: null,
    sections: [
      { id: 'thanksPage', keys: ['thanks.page', 'thanks.look', 'thanks.upsell'] },
      { id: 'thanksCelebrate', keys: ['thanks.celebrate'] },
    ],
    widgets: {},
  },
  bag: {
    id: 'bag',
    ...PAGE,
    open: '/bag',
    sections: [
      { id: 'bagAdding', keys: ['bag.addBehaviour', 'bag.duplicateAdd', 'bag.undoMs', 'bag.saved.enabled', 'bag.keepDays', 'bag.lowStockAt', 'bag.twoSizes.enabled', 'bag.code.enabled'] },
      { id: 'bagDrawer', keys: ['bag.panel.style', 'bag.panel.maxLines', 'bag.panel.fill', 'bag.panel.picks'] },
      { id: 'bagHelp', keys: ['bag.trust.securePayment', 'bag.whatsappHelp', 'bag.waSendBag', 'bag.freeProgress.enabled'] },
      { id: 'bagUpsell', keys: ['bag.upsell.enabled', 'bag.upsell.count', 'bag.upsell.style', 'bag.upsell.reasons', 'bag.upsell.originalLine', 'bag.upsell.setLine'] },
      { id: 'bagTiers', keys: ['bag.tiers.enabled', 'bag.tiers.max', 'bag.tiers.startsOn', 'bag.tiers.endsOn', 'bag.tiers.phonePreview', 'bag.tiers.rules', 'bag.offerSlot.enabled'], more: true },
      { id: 'bagFine', keys: ['bag.panel.gapPx', 'bag.repeatGuardMs'], more: true },
    ],
    widgets: {},
  },
  account: {
    id: 'account',
    ...PAGE,
    open: '/account',
    sections: [
      { id: 'acctTabs', keys: ['account.tabs'] },
      { id: 'acctOffers', keys: ['account.offerBanner'] },
      { id: 'acctTrack', keys: ['account.track.welcome', 'account.track.late'] },
      { id: 'loginCode', keys: ['account.code.text'] },
      { id: 'acctLists', keys: ['account.lists', 'account.addresses.max', 'account.history', 'account.thanksCard.enabled'] },
      { id: 'acctReorder', keys: ['account.reorder'], more: true },
    ],
    widgets: {},
  },
  search: {
    id: 'search',
    ...PAGE,
    open: '/search',
    sections: [
      { id: 'searchWords', keys: ['search.words'] },
      { id: 'searchPanel', keys: ['search.panel', 'search.results'] },
      { id: 'searchPopular', keys: ['search.popular'], more: true },
      { id: 'searchHelp', keys: ['search.help'], more: true },
      { id: 'searchMatch', keys: ['search.match'], more: true },
    ],
    widgets: {},
  },
  currency: {
    id: 'currency',
    ...SHOP,
    open: '/',
    sections: [{ id: 'moneyTime', keys: ['store.currency', 'store.locale', 'store.timeZone', 'language.bengali.digits'] }],
    widgets: { 'store.currency': { kind: 'currency' }, 'store.locale': { kind: 'locale' }, 'store.timeZone': { kind: 'tz' } },
  },
  email: {
    id: 'email',
    ...SHOP,
    open: null,
    sections: [{ id: 'emailLook', keys: ['email.look'] }],
    widgets: { 'email.look/accent': { kind: 'colour' }, 'email.look/background': { kind: 'colour' }, 'email.look/text': { kind: 'colour' } },
  },
  cookie: {
    id: 'cookie',
    ...PAGE,
    open: '/',
    sections: [{ id: 'cookieBanner', keys: ['cookie.banner'] }],
    widgets: {},
  },
  appicon: {
    id: 'appicon',
    ...PAGE,
    open: null,
    sections: [{ id: 'appHome', keys: ['app.homeScreen'] }],
    widgets: {
      'app.homeScreen/icon': { kind: 'media' },
      'app.homeScreen/themeColour': { kind: 'colour' },
      'app.homeScreen/backgroundColour': { kind: 'colour' },
    },
  },
};

export const isScreenId = (v: unknown): v is ScreenId => typeof v === 'string' && (SCREEN_IDS as readonly string[]).includes(v);

/** Every key a screen edits, in order. */
export const keysOf = (s: ScreenDef): Key[] => s.sections.flatMap((x) => [...x.keys]);
