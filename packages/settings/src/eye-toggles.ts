// S02 · PR 80 (register "Field-level show and hide — the eye-toggle system, with its defaults"; Blueprint D4 "the
// eye-toggle system", D4.1 named switch keys; BACKEND-ARCHITECTURE WEB-06) — one list of every part of a shop page the
// owner can show or hide on its own (an "eye-toggle"). An eye-toggle is not a new setting: it points at the one yes/no
// value inside a setting the shop already reads (`pdp.colour` → `note`), so the shop, the section's own settings card
// and the eye-toggle list (PR 81) always agree. Its default is that setting's registry default (Blueprint D4.1, with
// the round-15 changes; checked by test/eye-toggles.test.ts). Hiding never deletes anything: the part comes back when
// it is switched on again (CLAUDE.md rule 3, Blueprint D4 "the standing rule").
//
// The guard: every yes/no value of the shop's page settings (EYE_GROUPS) is either an eye-toggle here or named in
// NOT_EYE with the reason it is not one (behaviour, offers, templates, effects, …); items of a list (menu links,
// footer columns, page sections) are shown and hidden in that list's own editor. A new shop switch therefore fails
// the test until it is listed in one of the two. Pure; no database.
import type { SettingSpec } from './define';

/** The places of the shop an eye-toggle belongs to (the list's place filter). */
export const EYE_AREAS = ['header', 'footer', 'home', 'cards', 'category', 'product', 'reviews', 'bag', 'checkout', 'account', 'search'] as const;
export type EyeArea = (typeof EYE_AREAS)[number];

/** The screens a part is drawn on (both, or only one of them). */
export type EyeScreen = 'both' | 'phone' | 'desktop';

export interface EyeToggle {
  /** Stable id: `<setting key>:<path>` (the path is empty for a setting that is itself a yes/no value). */
  readonly id: string;
  /** The setting that holds the value. */
  readonly key: string;
  /** Dotted path to the yes/no value inside the setting's value; `#id` picks the list item with that `id`. */
  readonly path: string;
  readonly area: EyeArea;
  readonly screen: EyeScreen;
}

const e = (key: string, path: string, area: EyeArea, screen: EyeScreen = 'both'): EyeToggle => ({ id: `${key}:${path}`, key, path, area, screen });

/** Every eye-toggle, in the order the list shows them (by place, then top to bottom of the page). */
export const EYE_TOGGLES: readonly EyeToggle[] = [
  // Header and menu
  e('shell.announce', 'on', 'header'),
  e('shell.header', 'icons.#whatsapp.on', 'header'),
  e('shell.header', 'icons.#search.on', 'header'),
  e('shell.header', 'icons.#wish.on', 'header'),
  e('shell.header', 'wishOnPhone', 'header', 'phone'),
  e('shell.header', 'icons.#account.on', 'header'),
  e('shell.header', 'icons.#bag.on', 'header'),
  e('shell.header', 'slogan.on', 'header'),
  e('shell.header', 'slogan.phone', 'header', 'phone'),
  e('shell.header', 'slogan.desk', 'header', 'desktop'),
  e('shell.desktopNav', 'newIn', 'header', 'desktop'),
  e('shell.desktopNav', 'combos', 'header', 'desktop'),
  e('shell.desktopNav', 'sets', 'header', 'desktop'),
  e('shell.desktopNav', 'journal', 'header', 'desktop'),
  e('shell.desktopNav', 'mega', 'header', 'desktop'),
  e('shell.menuSubs', 'counts', 'header'),
  e('shell.fab', 'on', 'header'),
  // Footer
  e('shell.footer', 'deskIcons', 'footer', 'desktop'),
  e('shell.footer', 'promise.on', 'footer'),
  e('shell.footer', 'join.on', 'footer'),
  e('shell.footer', 'contact.whatsapp', 'footer'),
  e('shell.footer', 'contact.hotline', 'footer'),
  e('shell.footer', 'contact.hours', 'footer'),
  e('shell.footer', 'legal.ids', 'footer'),
  // Home page
  e('home.heroSlides', 'phoneArrows', 'home', 'phone'),
  e('home.flashRows', 'upTo', 'home'),
  e('home.reviews', 'summary', 'home'),
  // Product cards (home, category, search)
  e('card.desk', 'altView', 'cards', 'desktop'),
  e('card.desk', 'quickAdd', 'cards', 'desktop'),
  // Category page
  e('category.page', 'breadcrumb', 'category'),
  e('category.toolbar', 'top.on', 'category'),
  e('category.toolbar', 'chips.on', 'category'),
  e('category.filters', 'sizeNote', 'category'),
  e('category.page', 'progress', 'category'),
  // Product page, top to bottom
  e('pdp.page', 'breadcrumb', 'product'),
  e('pdp.gallery', 'arrows', 'product'),
  e('pdp.gallery', 'thumbs', 'product'),
  e('pdp.gallery', 'zoom', 'product'),
  e('pdp.gallery', 'badge', 'product'),
  e('pdp.icons', 'panel', 'product'),
  e('pdp.icons', 'share', 'product'),
  e('pdp.icons', 'whatsapp', 'product'),
  e('pdp.price', 'payLine.on', 'product'),
  e('pdp.price', 'discountAfterBar', 'product'),
  e('pdp.stock', 'line', 'product'),
  e('pdp.stock', 'lowChip', 'product'),
  e('pdp.colour', 'allColours', 'product'),
  e('pdp.colour', 'note', 'product'),
  e('pdp.colour', 'trueColourLink', 'product'),
  e('pdp.size', 'measureLine', 'product'),
  e('pdp.size', 'unitToggle', 'product'),
  e('pdp.size', 'fitBar', 'product'),
  e('pdp.size', 'notifyBack', 'product'),
  e('pdp.usualSize', 'on', 'product'),
  e('pdp.finder', 'on', 'product'),
  e('pdp.finder', 'card', 'product'),
  e('pdp.chart', 'on', 'product'),
  e('pdp.chart', 'howTo', 'product'),
  e('pdp.chart', 'askWhatsapp', 'product'),
  e('pdp.buy', 'orderNow', 'product'),
  e('pdp.buy', 'callToOrder', 'product'),
  e('pdp.buy', 'phoneBar', 'product', 'phone'),
  e('pdp.buy', 'desktopBar', 'product', 'desktop'),
  e('pdp.trust', 'on', 'product'),
  e('pdp.rules', 'on', 'product'),
  e('pdp.rules', 'trialLine', 'product'),
  e('pdp.sweep', 'freeDelivery', 'product'),
  e('pdp.sweep', 'stock', 'product'),
  e('pdp.sweep', 'allColours', 'product'),
  e('pdp.sweep', 'colourLabel', 'product'),
  e('pdp.sweep', 'sizeLabel', 'product'),
  e('pdp.sweep', 'sizePills', 'product'),
  e('pdp.qa', 'on', 'product'),
  e('pdp.qa', 'featured', 'product'),
  e('pdp.qa', 'answeredBy', 'product'),
  e('pdp.qa', 'askWhatsapp', 'product'),
  e('pdp.rows', 'pairs', 'product'),
  e('pdp.rows', 'recent', 'product'),
  // Reviews on the product page
  e('pdp.reviews', 'on', 'reviews'),
  e('pdp.reviews', 'summary', 'reviews'),
  e('pdp.reviews', 'ratingLine', 'reviews'),
  e('pdp.reviews', 'bodyLine', 'reviews'),
  e('pdp.reviews', 'verifiedTag', 'reviews'),
  e('pdp.reviews', 'photos', 'reviews'),
  e('pdp.reviews', 'questionsLink', 'reviews'),
  // Bag
  e('bag.freeProgress.enabled', '', 'bag'),
  e('bag.whatsappHelp', '', 'bag'),
  e('bag.trust.securePayment', '', 'bag'),
  e('bag.upsell.enabled', '', 'bag'),
  e('bag.upsell.reasons', '', 'bag'),
  e('bag.upsell.originalLine', '', 'bag'),
  e('bag.saved.enabled', '', 'bag'),
  // follow-up 679 (registry v265): the demo's parts the shop now draws
  e('bag.upsell.setLine', '', 'bag'),
  e('bag.waSendBag', '', 'bag'),
  // Checkout and the thank-you page
  e('checkout.help.enabled', '', 'checkout'),
  e('checkout.helpStripDesktop', '', 'checkout', 'desktop'),
  e('checkout.loginNudge', '', 'checkout'),
  e('checkout.doorNote', '', 'checkout'),
  e('thanks.page', 'nextSteps', 'checkout'),
  e('thanks.page', 'noteBack', 'checkout'),
  e('thanks.upsell', 'enabled', 'checkout'),
  // My account. Blueprint D4.1 says `account.*` On; every block it named is On. The offer banner and the photo came
  // later (register PR 132/133, 23 Oct) as feature switches, off, and stay off (follow-up 680): the banner shows the
  // wallet and the owner's coupons (money, his call) and the photo is a new optional feature (CLAUDE.md: off by default).
  e('account.thanksCard.enabled', '', 'account'),
  e('account.offerBanner', 'enabled', 'account'),
  e('account.photo', 'enabled', 'account'),
  e('account.history', 'filters', 'account'),
  e('account.history', 'timeline', 'account'),
  e('account.invoice', 'download', 'account'),
  // Search
  e('search.help', 'on', 'search'),
  e('search.results', 'didYouMean', 'search'),
  e('search.results', 'whatsapp', 'search'),
];

/** Why a yes/no value of a shop setting is not an eye-toggle. */
export type NotEyeReason = 'behaviour' | 'offer' | 'template' | 'effect' | 'own-page';

/**
 * Yes/no values of the shop's page settings that are deliberately not eye-toggles. A key alone (`pdp.templates:`)
 * covers every value inside that setting.
 */
export const NOT_EYE: Readonly<Record<string, NotEyeReason>> = {
  'shell.desktopNav:showHidden': 'behaviour', // a hidden category still opens from a link
  'home.heroSlides:inStockOnly': 'behaviour',
  'home.heroSlides:wash': 'effect',
  'home.flashRows:onlyMarkdowns': 'behaviour',
  'home.flashRows:inStockOnly': 'behaviour',
  'home.rowFade:': 'effect',
  'slider.engine:': 'behaviour',
  'category.faq:openFirst': 'behaviour',
  'shell.menuSubs:single': 'behaviour',
  'shell.fab:pages': 'behaviour', // which pages the floating button shows on: its own settings card
  'pdp.page:colourPaths': 'behaviour', // web addresses per colour (SEO)
  'pdp.fit:': 'behaviour',
  'pdp.rows:inStockOnly': 'behaviour',
  'pdp.rows:deskGrid': 'behaviour',
  'pdp.reviews:photosFirst': 'behaviour',
  'pdp.usualSize:preselect': 'behaviour',
  'pdp.finder:length.on': 'behaviour',
  'pdp.finder:remember': 'behaviour',
  'pdp.finder:record': 'behaviour',
  'pdp.templates:': 'template', // the product page templates' own settings
  'search.match:': 'behaviour',
  'search.results:partial': 'behaviour',
  'bag.offerSlot.enabled:': 'offer', // offers and codes touch prices: Marketing
  'bag.tiers.enabled:': 'offer',
  'bag.tiers.phonePreview:': 'offer',
  'bag.code.enabled:': 'offer',
  'bag.twoSizes.enabled:': 'behaviour',
  'thanks.celebrate:': 'effect',
  'wish.list:': 'own-page',
  'pages.help:': 'own-page', // each help page has its own switch
  'pages.contactForm:': 'own-page', // the contact form has its own switch card
  'shell.footer:desktop': 'behaviour', // the computer footer's own design or the phone bands stretched
  'search.panel:desktopPanel': 'behaviour', // a panel under the header or the phone's window
  'layout.sideCanvas:': 'own-page', // the side canvas: its own page, switched on only after the owner approves its map (PR 596)
  'shop.pageEdit:': 'own-page', // the owner's on-page edit mode: its own page, Website › More › On-page edit (PR 600)
};

/** The settings groups whose every yes/no value must be an eye-toggle or in NOT_EYE. */
export const EYE_GROUPS: readonly string[] = ['shell', 'home', 'slider', 'categoryPage', 'productPage', 'search', 'bag', 'wishlist', 'pages'];

/** The settings keys that are in EYE_GROUPS only by being public (the checkout group has private payment settings). */
export const EYE_PUBLIC_GROUPS: readonly string[] = ['checkout'];

const byId = new Map(EYE_TOGGLES.map((t) => [t.id, t]));

/** The eye-toggle with this id, or undefined. */
export const eyeToggle = (id: string): EyeToggle | undefined => byId.get(id);

/** The settings keys the list reads (each once, in order). */
export const EYE_KEYS: readonly string[] = [...new Set(EYE_TOGGLES.map((t) => t.key))];

const segs = (path: string): string[] => (path ? path.split('.') : []);

type Obj = Record<string, unknown>;

function step(v: unknown, seg: string): unknown {
  if (seg.startsWith('#')) return Array.isArray(v) ? v.find((x) => !!x && typeof x === 'object' && (x as Obj).id === seg.slice(1)) : undefined;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj)[seg] : undefined;
}

/** The yes/no value at `path` inside a setting's value, or undefined when it is not one. */
export function readEye(value: unknown, path: string): boolean | undefined {
  const v = segs(path).reduce<unknown>(step, value);
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * A copy of a setting's value with the yes/no value at `path` set to `shown`; every other value is kept as it was.
 * Throws when the path does not lead to a yes/no value (nothing half-written).
 */
export function writeEye(value: unknown, path: string, shown: boolean): unknown {
  if (readEye(value, path) === undefined) throw new Error(`EYE_PATH: ${path}`);
  const s = segs(path);
  if (!s.length) return shown;
  const next = structuredClone(value);
  let at: unknown = next;
  for (const seg of s.slice(0, -1)) at = step(at, seg);
  (at as Obj)[s[s.length - 1]!] = shown;
  return next;
}

/** The default of an eye-toggle: the yes/no value in its setting's registry default. */
export function eyeDefault(t: EyeToggle, reg: Readonly<Record<string, SettingSpec>>): boolean | undefined {
  const spec = reg[t.key];
  return spec ? readEye(spec.default, t.path) : undefined;
}

/** Every yes/no path inside a value (lists of `{id}` items by `#id`), for the coverage guard. */
export function boolPaths(value: unknown, at: string[] = []): string[] {
  if (typeof value === 'boolean') return [at.join('.')];
  if (Array.isArray(value)) return value.flatMap((x) => (x && typeof x === 'object' && typeof (x as Obj).id === 'string' ? boolPaths(x, [...at, `#${(x as Obj).id as string}`]) : []));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => boolPaths(v, [...at, k]));
  return [];
}

const notEye = (key: string, path: string): boolean => {
  if (NOT_EYE[`${key}:`]) return true;
  const s = segs(path);
  return s.some((_, i) => !!NOT_EYE[`${key}:${s.slice(0, i + 1).join('.')}`]);
};

/**
 * What is wrong with the list against a registry (empty = fine): an eye-toggle whose setting is missing, not per store,
 * needs the owner's written OK or has no yes/no value at its path; two eye-toggles on one value; and a yes/no value of
 * a shop page setting that is neither an eye-toggle nor in NOT_EYE.
 */
export function eyeToggleProblems(reg: Readonly<Record<string, SettingSpec>>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of EYE_TOGGLES) {
    if (seen.has(t.id)) out.push(`twice: ${t.id}`);
    seen.add(t.id);
    const spec = reg[t.key];
    if (!spec) out.push(`no setting: ${t.id}`);
    else if (spec.scope !== 'store') out.push(`not per store: ${t.id}`);
    else if (spec.requiresOwnerOk) out.push(`needs the owner's OK: ${t.id}`);
    else if (spec.isOwnerData) out.push(`owner data: ${t.id}`);
    else if (eyeDefault(t, reg) === undefined) out.push(`not yes/no: ${t.id}`);
    if (notEye(t.key, t.path)) out.push(`also in NOT_EYE: ${t.id}`);
  }
  for (const [key, spec] of Object.entries(reg)) {
    const inGroup = EYE_GROUPS.includes(spec.group) || (EYE_PUBLIC_GROUPS.includes(spec.group) && spec.isPublic);
    if (!inGroup || spec.scope !== 'store') continue;
    // Items of a list (menu links, footer columns, page sections) are shown and hidden in that list's own editor.
    for (const p of boolPaths(spec.default)) if (!p.includes('#') && !seen.has(`${key}:${p}`) && !notEye(key, p)) out.push(`not listed: ${key}:${p}`);
  }
  return out;
}
